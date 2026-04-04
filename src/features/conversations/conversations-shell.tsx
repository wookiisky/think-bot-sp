import { useEffect, useState } from 'react';

import { getEnabledCompleteModels } from '../../domain/config/config-schema';
import { downloadTextFile } from '../../shared/download-file';
import {
  CHAT_PROMPT_TAB_ID,
  buildActiveSessionIdMap,
  buildComposerStateMap,
  buildMessageStateMap,
  buildPromptTabs,
  buildRestoreMessageIdMap,
  getPromptTabStatus,
  pickInitialPromptTabId,
  toModelOptions,
  toOptimisticUserContent,
  type ChatMessageState,
  type ComposerState,
  type EditingState,
  type ModelOption,
  type PromptTabDefinition,
  upsertAssistantBranch,
  upsertAssistantMessage,
} from '../workspace/workspace-state';
import type { SidebarConversationRecord, SidebarLoadingStateRecord, SidebarPageRecord } from '../../services/runtime-messaging/sidebar-contract';
import { ChatInput } from '../sidebar/chat-input';
import { ChatThread } from '../sidebar/chat-thread';
import type { ConversationsApi } from './conversations-api';

type ConversationsShellProps = {
  /** conversations 页 API。 */
  api: ConversationsApi;
};

type DetailStatus = 'idle' | 'loading' | 'ready' | 'error';

type SidebarResizeState = {
  /** 拖拽开始时的鼠标横坐标。 */
  startX: number;
  /** 拖拽开始时的左侧栏宽度。 */
  startWidth: number;
};

type PageDetailState = {
  /** 当前页面记录。 */
  page: SidebarPageRecord | null;
  /** 当前页面会话。 */
  conversations: SidebarConversationRecord[];
  /** 当前页面 loading。 */
  loadingStates: SidebarLoadingStateRecord[];
};

/** 左侧历史栏最小宽度。 */
const MIN_SIDEBAR_WIDTH = 280;
/** 左侧历史栏默认宽度。 */
const DEFAULT_SIDEBAR_WIDTH = 360;
/** 左侧历史栏最大宽度。 */
const MAX_SIDEBAR_WIDTH = 520;

/** 限制左侧栏宽度。 */
const clampSidebarWidth = (width: number) => Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));

/** conversations 历史工作台。 */
export const ConversationsShell = ({ api }: ConversationsShellProps) => {
  const [pages, setPages] = useState<SidebarPageRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPageUrl, setSelectedPageUrl] = useState<string | null>(null);
  const [detailStatus, setDetailStatus] = useState<DetailStatus>('idle');
  const [detail, setDetail] = useState<PageDetailState>({
    page: null,
    conversations: [],
    loadingStates: [],
  });
  const [models, setModels] = useState<ModelOption[]>([]);
  const [promptTabs, setPromptTabs] = useState<PromptTabDefinition[]>([]);
  const [activePromptTabId, setActivePromptTabId] = useState(CHAT_PROMPT_TAB_ID);
  const [messageMap, setMessageMap] = useState<Record<string, ChatMessageState[]>>({});
  const [restoreMessageIds, setRestoreMessageIds] = useState<Record<string, string | null>>({});
  const [activeSessionIds, setActiveSessionIds] = useState<Record<string, string | null>>({});
  const [composerMap, setComposerMap] = useState<Record<string, ComposerState>>({});
  const [editingMap, setEditingMap] = useState<Record<string, EditingState | null>>({});
  const [includePageContent, setIncludePageContent] = useState(true);
  const [pageNotice, setPageNotice] = useState('');
  const [chatNotices, setChatNotices] = useState<Record<string, string>>({});
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [sidebarResizeState, setSidebarResizeState] = useState<SidebarResizeState | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);

  const selectedPage = pages.find((page) => page.normalizedUrl === selectedPageUrl) ?? detail.page ?? null;
  const activePromptTab = promptTabs.find((promptTab) => promptTab.id === activePromptTabId) ?? null;
  const activeComposer = activePromptTab ? composerMap[activePromptTab.id] ?? null : null;
  const activeSessionId = activePromptTab ? activeSessionIds[activePromptTab.id] ?? null : null;
  const activeChatNotice = activePromptTab ? chatNotices[activePromptTab.id] ?? '' : '';
  const activeEditingState = activePromptTab ? editingMap[activePromptTab.id] ?? null : null;

  /** 更新单个标签的消息列表。 */
  const setPromptTabMessages = (promptTabId: string, update: (_current: ChatMessageState[]) => ChatMessageState[]) => {
    setMessageMap((current) => ({
      ...current,
      [promptTabId]: update(current[promptTabId] ?? []),
    }));
  };

  /** 更新单个标签草稿。 */
  const setPromptTabComposer = (promptTabId: string, patch: Partial<ComposerState>) => {
    setComposerMap((current) => ({
      ...current,
      [promptTabId]: {
        text: current[promptTabId]?.text ?? promptTabs.find((item) => item.id === promptTabId)?.defaultText ?? '',
        images: current[promptTabId]?.images ?? [],
        selectedModelId: current[promptTabId]?.selectedModelId ?? promptTabs.find((item) => item.id === promptTabId)?.preferredModelId ?? '',
        ...patch,
      },
    }));
  };

  /** 更新单个标签提示。 */
  const setPromptTabNotice = (promptTabId: string, notice: string) => {
    setChatNotices((current) => ({
      ...current,
      [promptTabId]: notice,
    }));
  };

  /** 更新单个标签编辑态。 */
  const setPromptTabEditing = (promptTabId: string, editing: EditingState | null) => {
    setEditingMap((current) => ({
      ...current,
      [promptTabId]: editing,
    }));
  };

  /** 同步右侧工作台状态。 */
  const applyDetailState = (input: {
    /** 页面详情。 */
    detail: PageDetailState;
    /** 当前模型。 */
    models: ModelOption[];
    /** 当前快捷输入。 */
    quickInputs: Array<{
      id: string;
      name: string;
      prompt: string;
      autoTrigger: boolean;
      modelId: string | null;
      order: number;
      deletedAt: number | null;
    }>;
    /** 默认模型。 */
    fallbackModelId: string;
    /** 页面级正文默认开关。 */
    defaultIncludePageContent: boolean;
    /** 恢复目标标签。 */
    activePromptTabId: string;
  }) => {
    const nextPromptTabs = buildPromptTabs({
      page: input.detail.page,
      quickInputs: input.quickInputs,
      models: input.models,
      fallbackModelId: input.fallbackModelId,
    });

    setDetail(input.detail);
    setPromptTabs(nextPromptTabs);
    setMessageMap(buildMessageStateMap(nextPromptTabs, input.detail.conversations));
    setRestoreMessageIds(
      buildRestoreMessageIdMap({
        promptTabs: nextPromptTabs,
        conversations: input.detail.conversations,
        loadingStates: input.detail.loadingStates,
      }),
    );
    setActiveSessionIds(buildActiveSessionIdMap(nextPromptTabs, input.detail.loadingStates));
    setComposerMap(buildComposerStateMap(nextPromptTabs));
    setEditingMap(Object.fromEntries(nextPromptTabs.map((promptTab) => [promptTab.id, null])));
    setChatNotices({});
    setActivePromptTabId(input.activePromptTabId);
    setIncludePageContent(input.detail.page?.includePageContent ?? input.defaultIncludePageContent);
    setTitleDraft(input.detail.page?.title ?? '');
  };

  useEffect(() => {
    if (!sidebarResizeState) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      setSidebarWidth(clampSidebarWidth(sidebarResizeState.startWidth + (event.clientX - sidebarResizeState.startX)));
    };
    const handlePointerUp = () => {
      setSidebarResizeState(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [sidebarResizeState]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [pagesResponse, configResponse] = await Promise.all([api.listPages(), api.getConfig()]);
      if (cancelled) {
        return;
      }

      const nextModels = toModelOptions(getEnabledCompleteModels(configResponse.config));
      const fallbackModelId =
        nextModels.find((model) => model.id === configResponse.config.basic.defaultModelId)?.id ?? nextModels[0]?.id ?? '';

      setPages(pagesResponse.pages);
      setModels(nextModels);
      setConfigLoaded(true);

      const initialPage = pagesResponse.pages[0] ?? null;
      if (!initialPage) {
        setSelectedPageUrl(null);
        setDetailStatus('ready');
        return;
      }

      setSelectedPageUrl(initialPage.normalizedUrl);
      setDetailStatus('loading');
    };

    void load().catch(() => {
      if (!cancelled) {
        setDetailStatus('error');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    if (!configLoaded) {
      return;
    }

    let cancelled = false;
    const loadPages = async () => {
      const response = searchQuery.trim() ? await api.searchPages(searchQuery) : await api.listPages();
      if (cancelled) {
        return;
      }

      setPages(response.pages);
      if (response.pages.length === 0) {
        setSelectedPageUrl(null);
        return;
      }
      if (!response.pages.some((page) => page.normalizedUrl === selectedPageUrl)) {
        setSelectedPageUrl(response.pages[0].normalizedUrl);
      }
    };

    void loadPages();
    return () => {
      cancelled = true;
    };
  }, [api, configLoaded, searchQuery, selectedPageUrl]);

  useEffect(() => {
    if (!selectedPageUrl || !configLoaded) {
      return;
    }

    let cancelled = false;
    const loadDetail = async () => {
      setDetailStatus((current) => (current === 'idle' ? 'loading' : current));
      try {
        const [detailResponse, configResponse] = await Promise.all([api.getPageDetail(selectedPageUrl), api.getConfig()]);
        if (cancelled) {
          return;
        }

        const nextModels = toModelOptions(getEnabledCompleteModels(configResponse.config));
        const fallbackModelId =
          nextModels.find((model) => model.id === configResponse.config.basic.defaultModelId)?.id ?? nextModels[0]?.id ?? '';
        setModels(nextModels);
        applyDetailState({
          detail: {
            page: detailResponse.page,
            conversations: detailResponse.conversations,
            loadingStates: detailResponse.loadingStates,
          },
          models: nextModels,
          quickInputs: configResponse.config.quickInputs,
          fallbackModelId,
          defaultIncludePageContent: configResponse.config.basic.includePageContentByDefault,
          activePromptTabId: detailResponse.activePromptTabId,
        });
        setDetailStatus('ready');
      } catch {
        if (!cancelled) {
          setDetailStatus('error');
        }
      }
    };

    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [api, configLoaded, selectedPageUrl]);

  useEffect(() => {
    if (!selectedPage || !activePromptTab) {
      return;
    }

    const port = api.connectStream({
      pageUrl: selectedPage.url,
      promptTabId: activePromptTab.id,
    });
    const handlePortMessage = (event: unknown) => {
      if (typeof event !== 'object' || event === null || !('type' in event)) {
        return;
      }

      const payload = event as Record<string, unknown>;
      const promptTabId = typeof payload.promptTabId === 'string' ? payload.promptTabId : null;
      if (!promptTabId) {
        return;
      }

      switch (payload.type) {
        case 'CHAT_STREAM_STARTED':
          if (typeof payload.sessionId === 'string') {
            setActiveSessionIds((current) => ({
              ...current,
              [promptTabId]: payload.sessionId,
            }));
          }
          if (typeof payload.messageId === 'string') {
            setRestoreMessageIds((current) => ({
              ...current,
              [promptTabId]: payload.messageId,
            }));
            setPromptTabMessages(promptTabId, (current) =>
              upsertAssistantMessage(current, payload.messageId as string, (message) => ({
                id: payload.messageId as string,
                role: 'assistant',
                content: message?.content ?? '',
                status: 'loading',
                errorMessage: null,
                branches: message?.branches ?? [],
              })),
            );
          }
          return;
        case 'CHAT_STREAM_CHUNK':
          if (typeof payload.sessionId === 'string') {
            setActiveSessionIds((current) => ({
              ...current,
              [promptTabId]: payload.sessionId,
            }));
          }
          if (typeof payload.messageId === 'string' && typeof payload.chunk === 'string') {
            setRestoreMessageIds((current) => ({
              ...current,
              [promptTabId]: payload.messageId,
            }));
            setPromptTabMessages(promptTabId, (current) =>
              upsertAssistantMessage(current, payload.messageId as string, (message) => ({
                id: payload.messageId as string,
                role: 'assistant',
                content: `${message?.content ?? ''}${payload.chunk}`,
                status: 'loading',
                errorMessage: null,
                branches: message?.branches ?? [],
              })),
            );
          }
          return;
        case 'CHAT_STREAM_FINISHED':
          setActiveSessionIds((current) => ({
            ...current,
            [promptTabId]: null,
          }));
          setRestoreMessageIds((current) => ({
            ...current,
            [promptTabId]: null,
          }));
          if (typeof payload.messageId === 'string') {
            setPromptTabMessages(promptTabId, (current) =>
              upsertAssistantMessage(current, payload.messageId as string, (message) => ({
                id: payload.messageId as string,
                role: 'assistant',
                content: message?.content ?? '',
                status: 'done',
                errorMessage: null,
                branches: message?.branches ?? [],
              })),
            );
          }
          return;
        case 'CHAT_STREAM_FAILED':
        case 'CHAT_STREAM_CANCELLED':
          setActiveSessionIds((current) => ({
            ...current,
            [promptTabId]: null,
          }));
          setRestoreMessageIds((current) => ({
            ...current,
            [promptTabId]: null,
          }));
          if (typeof payload.messageId === 'string') {
            setPromptTabMessages(promptTabId, (current) =>
              upsertAssistantMessage(current, payload.messageId as string, (message) => ({
                id: payload.messageId as string,
                role: 'assistant',
                content: message?.content ?? '',
                status: payload.type === 'CHAT_STREAM_FAILED' ? 'error' : 'cancelled',
                errorMessage: typeof payload.errorMessage === 'string' ? payload.errorMessage : payload.type === 'CHAT_STREAM_FAILED' ? '生成失败' : '已停止',
                branches: message?.branches ?? [],
              })),
            );
          }
          return;
        case 'BRANCH_STREAM_STARTED':
          if (
            typeof payload.messageId === 'string' &&
            typeof payload.branchId === 'string' &&
            typeof payload.modelId === 'string' &&
            typeof payload.modelLabel === 'string'
          ) {
            setPromptTabMessages(promptTabId, (current) =>
              upsertAssistantBranch(current, payload.messageId, payload.branchId, (branch) => ({
                id: payload.branchId,
                modelId: payload.modelId,
                modelLabel: payload.modelLabel,
                content: branch?.content ?? '',
                status: 'loading',
                errorMessage: null,
              })),
            );
          }
          return;
        case 'BRANCH_STREAM_CHUNK':
          if (typeof payload.messageId === 'string' && typeof payload.branchId === 'string' && typeof payload.chunk === 'string') {
            setPromptTabMessages(promptTabId, (current) =>
              upsertAssistantBranch(current, payload.messageId, payload.branchId, (branch) => ({
                id: payload.branchId,
                modelId: branch?.modelId ?? '',
                modelLabel: branch?.modelLabel ?? '分支',
                content: `${branch?.content ?? ''}${payload.chunk}`,
                status: 'loading',
                errorMessage: null,
              })),
            );
          }
          return;
        case 'BRANCH_STREAM_FINISHED':
        case 'BRANCH_STREAM_FAILED':
        case 'BRANCH_STREAM_CANCELLED':
          if (typeof payload.messageId === 'string' && typeof payload.branchId === 'string') {
            setPromptTabMessages(promptTabId, (current) =>
              upsertAssistantBranch(current, payload.messageId, payload.branchId, (branch) => ({
                id: payload.branchId,
                modelId: branch?.modelId ?? '',
                modelLabel: branch?.modelLabel ?? '分支',
                content: branch?.content ?? '',
                status:
                  payload.type === 'BRANCH_STREAM_FINISHED'
                    ? 'done'
                    : payload.type === 'BRANCH_STREAM_FAILED'
                      ? 'error'
                      : 'cancelled',
                errorMessage:
                  typeof payload.errorMessage === 'string'
                    ? payload.errorMessage
                    : payload.type === 'BRANCH_STREAM_FAILED'
                      ? '分支生成失败'
                      : payload.type === 'BRANCH_STREAM_CANCELLED'
                        ? '分支已停止'
                        : null,
              })),
            );
          }
          return;
        case 'RESTORE_LOADING':
          if (typeof payload.sessionId === 'string') {
            setActiveSessionIds((current) => ({
              ...current,
              [promptTabId]: payload.sessionId,
            }));
          }
          if (typeof payload.messageId === 'string' && typeof payload.content === 'string') {
            setRestoreMessageIds((current) => ({
              ...current,
              [promptTabId]: payload.messageId,
            }));
            setPromptTabMessages(promptTabId, (current) =>
              upsertAssistantMessage(current, payload.messageId as string, (message) => ({
                id: payload.messageId as string,
                role: 'assistant',
                content: message?.content ?? payload.content,
                status: 'loading',
                errorMessage: null,
                branches: message?.branches ?? [],
              })),
            );
          }
          return;
        default:
          return;
      }
    };

    port.onMessage?.addListener?.(handlePortMessage as never);
    return () => {
      port.onMessage?.removeListener?.(handlePortMessage as never);
      port.disconnect();
    };
  }, [activePromptTab, api, selectedPage]);

  /** 复制提取内容。 */
  const handleCopyExtraction = async () => {
    if (!detail.page?.content?.trim()) {
      setPageNotice('当前没有可复制的提取内容');
      return;
    }

    try {
      await navigator.clipboard.writeText(detail.page.content);
      setPageNotice('已复制提取内容');
    } catch {
      setPageNotice('复制提取内容失败，请重试');
    }
  };

  /** 打开原网页。 */
  const handleOpenSourcePage = async () => {
    if (!detail.page) {
      return;
    }

    try {
      await api.openSourcePage(detail.page.url);
    } catch {
      setPageNotice('打开原网页失败，请重试');
    }
  };

  /** 保存标题。 */
  const saveTitle = async () => {
    if (!detail.page) {
      return;
    }

    const nextTitle = titleDraft.trim();
    if (nextTitle === detail.page.title) {
      setIsTitleEditing(false);
      return;
    }

    try {
      const response = await api.updatePageTitle({
        normalizedUrl: detail.page.normalizedUrl,
        title: nextTitle,
      });
      setDetail((current) => ({
        ...current,
        page: response.page,
      }));
      setPages((current) => current.map((page) => (page.normalizedUrl === response.page.normalizedUrl ? response.page : page)));
      setTitleDraft(response.page.title);
      setIsTitleEditing(false);
    } catch {
      setTitleDraft(detail.page.title);
      setIsTitleEditing(false);
      setPageNotice('标题保存失败，请重试');
    }
  };

  /** 发送消息。 */
  const handleSend = async (promptTabId: string, input: { text: string; images: string[]; modelId: string; includePageContent: boolean }) => {
    if (!selectedPage) {
      return;
    }

    setPromptTabNotice(promptTabId, '');
    const optimisticUserMessageId = `local-user:${promptTabId}:${Date.now()}`;
    setPromptTabMessages(promptTabId, (current) => [
      ...current,
      {
        id: optimisticUserMessageId,
        role: 'user',
        content: toOptimisticUserContent(input.text, input.images),
        status: 'done',
        errorMessage: null,
        branches: [],
      },
    ]);

    try {
      const response = await api.sendChat({
        pageUrl: selectedPage.url,
        promptTabId,
        modelId: input.modelId,
        text: input.text,
        images: input.images,
        includePageContent: input.includePageContent,
      });
      setActiveSessionIds((current) => ({
        ...current,
        [promptTabId]: response.payload.sessionId,
      }));
      setRestoreMessageIds((current) => ({
        ...current,
        [promptTabId]: response.payload.messageId,
      }));
      setIncludePageContent(input.includePageContent);
      setPromptTabMessages(promptTabId, (current) => {
        const messagesWithPersistedUserId =
          response.payload.userMessageId === null
            ? current
            : current.map((message) => (message.id === optimisticUserMessageId ? { ...message, id: response.payload.userMessageId } : message));
        return upsertAssistantMessage(messagesWithPersistedUserId, response.payload.messageId, (message) => ({
          id: response.payload.messageId,
          role: 'assistant',
          content: message?.content ?? '',
          status: 'loading',
          errorMessage: null,
          branches: message?.branches ?? [],
        }));
      });
    } catch {
      setPromptTabNotice(promptTabId, '发送失败，请重试');
    }
  };

  /** 编辑用户消息。 */
  const handleEditUserMessage = async (promptTabId: string, messageId: string, text: string) => {
    if (!selectedPage) {
      return;
    }

    try {
      const response = await api.editUserMessage({
        pageUrl: selectedPage.url,
        promptTabId,
        messageId,
        text,
      });
      setPromptTabEditing(promptTabId, null);
      setActiveSessionIds((current) => ({
        ...current,
        [promptTabId]: response.payload.sessionId,
      }));
      setRestoreMessageIds((current) => ({
        ...current,
        [promptTabId]: response.payload.messageId,
      }));
      setPromptTabMessages(promptTabId, (current) => {
        const targetIndex = current.findIndex((message) => message.id === messageId && message.role === 'user');
        if (targetIndex < 0) {
          return current;
        }
        return [
          ...current.slice(0, targetIndex + 1).map((message) => (message.id === messageId ? { ...message, content: text } : message)),
          {
            id: response.payload.messageId,
            role: 'assistant',
            content: '',
            status: 'loading',
            errorMessage: null,
            branches: [],
          },
        ];
      });
    } catch {
      setPromptTabNotice(promptTabId, '编辑失败，请重试');
    }
  };

  /** 重试助手消息。 */
  const handleRetryMessage = async (promptTabId: string, messageId: string) => {
    if (!selectedPage) {
      return;
    }

    try {
      const response = await api.retryMessage({
        pageUrl: selectedPage.url,
        promptTabId,
        messageId,
      });
      setActiveSessionIds((current) => ({
        ...current,
        [promptTabId]: response.payload.sessionId,
      }));
      setRestoreMessageIds((current) => ({
        ...current,
        [promptTabId]: response.payload.messageId,
      }));
      setPromptTabMessages(promptTabId, (current) => {
        const targetIndex = current.findIndex((message) => message.id === messageId && message.role === 'assistant');
        if (targetIndex < 0) {
          return current;
        }
        return [
          ...current.slice(0, targetIndex),
          {
            id: response.payload.messageId,
            role: 'assistant',
            content: '',
            status: 'loading',
            errorMessage: null,
            branches: [],
          },
        ];
      });
    } catch {
      setPromptTabNotice(promptTabId, '重试失败，请重试');
    }
  };

  /** 新增分支。 */
  const handleExpandBranches = async (promptTabId: string, messageId: string) => {
    if (!selectedPage) {
      return;
    }

    try {
      await api.expandMessageBranches({
        pageUrl: selectedPage.url,
        promptTabId,
        messageId,
      });
    } catch {
      setPromptTabNotice(promptTabId, '新增分支失败，请重试');
    }
  };

  /** 停止当前标签会话。 */
  const handleStop = async (promptTabId: string, sessionId: string | null) => {
    if (!selectedPage || !sessionId) {
      return;
    }

    await api.stopSession({
      pageUrl: selectedPage.url,
      promptTabId,
      sessionId,
    });
  };

  /** 停止分支。 */
  const handleStopBranch = async (promptTabId: string, branchId: string) => {
    if (!selectedPage) {
      return;
    }

    try {
      await api.stopBranch({
        pageUrl: selectedPage.url,
        promptTabId,
        branchId,
      });
    } catch {
      setPromptTabNotice(promptTabId, '停止分支失败，请重试');
    }
  };

  /** 删除分支。 */
  const handleDeleteBranch = async (promptTabId: string, messageId: string, branchId: string) => {
    if (!selectedPage) {
      return;
    }

    try {
      await api.deleteBranch({
        pageUrl: selectedPage.url,
        promptTabId,
        messageId,
        branchId,
      });
      setPromptTabMessages(promptTabId, (current) =>
        current.map((message) =>
          message.id === messageId && message.role === 'assistant'
            ? {
                ...message,
                branches: message.branches.filter((branch) => branch.id !== branchId),
              }
            : message,
        ),
      );
    } catch {
      setPromptTabNotice(promptTabId, '删除分支失败，请重试');
    }
  };

  /** 清空当前标签。 */
  const handleClearTabConversation = async (promptTabId: string) => {
    if (!selectedPage) {
      return;
    }

    if (!window.confirm('确认清空当前标签聊天记录？这只会清空当前标签的会话和进行中的生成，不影响提取内容和其他标签。')) {
      return;
    }

    try {
      await api.clearTabConversation({
        pageUrl: selectedPage.url,
        promptTabId,
      });
      setPromptTabMessages(promptTabId, () => []);
      setRestoreMessageIds((current) => ({
        ...current,
        [promptTabId]: null,
      }));
      setActiveSessionIds((current) => ({
        ...current,
        [promptTabId]: null,
      }));
      setPromptTabEditing(promptTabId, null);
      setPromptTabNotice(promptTabId, '已清空当前标签聊天记录');
    } catch {
      setPromptTabNotice(promptTabId, '清空当前标签聊天记录失败，请重试');
    }
  };

  /** 导出当前标签会话。 */
  const handleExport = async (promptTabId: string) => {
    if (!selectedPage) {
      return;
    }

    const messages = messageMap[promptTabId] ?? [];
    const hasExportableMessage = messages.some((message) => message.content.trim().length > 0);
    if (!hasExportableMessage) {
      setPromptTabNotice(promptTabId, '当前会话为空，不能导出');
      return;
    }

    try {
      const exported = await api.exportConversation({
        pageUrl: selectedPage.url,
        promptTabId,
      });
      downloadTextFile({
        filename: exported.payload.filename,
        content: exported.payload.content,
        mimeType: exported.payload.mimeType,
      });
    } catch {
      setPromptTabNotice(promptTabId, '导出失败，请重试');
    }
  };

  /** 删除当前页面。 */
  const handleDeletePage = async (normalizedUrl: string) => {
    try {
      const response = await api.deletePage(normalizedUrl);
      const currentPages = pages.filter((page) => page.normalizedUrl !== normalizedUrl);
      setPages(currentPages);
      if (selectedPageUrl === normalizedUrl) {
        setSelectedPageUrl(currentPages[0]?.normalizedUrl ?? null);
        if (currentPages.length === 0) {
          setDetail({
            page: null,
            conversations: [],
            loadingStates: [],
          });
          setPromptTabs([]);
          setMessageMap({});
          setRestoreMessageIds({});
          setActiveSessionIds({});
          setComposerMap({});
        }
      }
      setPageNotice(response.payload.deleteMode === 'soft' ? '页面已软删并写入 tombstone' : '页面已删除');
    } catch {
      setPageNotice('删除页面失败，请重试');
    }
  };

  return (
    <main data-testid="conversations-shell" className="flex min-h-screen bg-background text-foreground">
      <aside className="flex shrink-0 flex-col border-r border-border" style={{ width: `${sidebarWidth}px` }}>
        <header className="border-b border-border px-4 py-4">
          <h1 className="text-lg font-semibold">历史工作台</h1>
          <p className="mt-1 text-sm text-muted-foreground">按页面恢复提取内容与聊天，上下文可继续工作。</p>
          <input
            aria-label="搜索历史页面"
            className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2"
            placeholder="搜索标题或 URL"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </header>

        <section data-testid="conversations-page-list" className="min-h-0 flex-1 overflow-y-auto">
          {pages.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">{searchQuery.trim() ? '没有匹配的历史页面。' : '还没有历史页面。'}</div>
          ) : null}
          {pages.map((page) => {
            const isSelected = page.normalizedUrl === selectedPageUrl;
            return (
              <div
                key={page.normalizedUrl}
                className={`flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left ${isSelected ? 'bg-muted/60' : ''}`}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  onClick={() => setSelectedPageUrl(page.normalizedUrl)}
                >
                  {page.faviconUrl ? (
                    <img src={page.faviconUrl} alt="" className="mt-1 h-4 w-4 rounded-sm" />
                  ) : (
                    <span className="mt-1 h-4 w-4 rounded-sm bg-border" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{page.title || page.url}</p>
                    <p className="truncate text-xs text-muted-foreground">{page.url}</p>
                  </div>
                </button>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    aria-label={`打开原网页 ${page.title || page.url}`}
                    onClick={() => {
                      void api.openSourcePage(page.url);
                    }}
                  >
                    打开
                  </button>
                  <button
                    type="button"
                    aria-label={`删除页面 ${page.title || page.url}`}
                    onClick={() => {
                      void handleDeletePage(page.normalizedUrl);
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      </aside>

      <div className="flex w-4 shrink-0 items-center justify-center border-r border-border">
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="调整历史栏宽度"
          data-testid="conversations-sidebar-resize-handle"
          className="h-24 w-2 cursor-col-resize rounded-full bg-border"
          onPointerDown={(event) =>
            setSidebarResizeState({
              startX: event.clientX,
              startWidth: sidebarWidth,
            })
          }
        />
      </div>

      <section className="flex min-h-0 flex-1 flex-col">
        <header className="border-b border-border px-6 py-4">
          {detail.page ? (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  {isTitleEditing ? (
                    <input
                      aria-label="编辑页面标题"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-lg font-semibold"
                      value={titleDraft}
                      autoFocus
                      onChange={(event) => setTitleDraft(event.target.value)}
                      onBlur={() => void saveTitle()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void saveTitle();
                        }
                        if (event.key === 'Escape') {
                          setTitleDraft(detail.page?.title ?? '');
                          setIsTitleEditing(false);
                        }
                      }}
                    />
                  ) : (
                    <button type="button" className="text-left text-xl font-semibold" onClick={() => setIsTitleEditing(true)}>
                      {detail.page.title || detail.page.url}
                    </button>
                  )}
                  <p className="mt-1 truncate text-sm text-muted-foreground">{detail.page.url}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void handleCopyExtraction()}>
                    复制提取内容
                  </button>
                  <button type="button" onClick={() => void handleOpenSourcePage()}>
                    打开原网页
                  </button>
                  <button type="button" onClick={() => void api.openSettingsPage()}>
                    打开设置页
                  </button>
                </div>
              </div>
              {pageNotice ? <p className="text-sm text-muted-foreground">{pageNotice}</p> : null}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">{detailStatus === 'error' ? '页面恢复失败，请重新选择。' : '请选择左侧历史页面。'}</div>
          )}
        </header>

        <section className="min-h-0 flex-1 overflow-y-auto border-b border-border px-6 py-4">
          {detailStatus === 'loading' && !detail.page ? <p>正在恢复页面上下文…</p> : null}
          {detail.page?.content ? <article className="whitespace-pre-wrap">{detail.page.content}</article> : null}
          {detail.page && !detail.page.content ? <p className="text-sm text-muted-foreground">当前页面暂无提取内容。</p> : null}
        </section>

        <section role="tablist" aria-label="历史工作台标签" className="border-b border-border px-6 py-3">
          <div className="flex flex-wrap gap-2">
            {promptTabs.map((promptTab) => {
              const isActive = promptTab.id === activePromptTabId;
              const statusText = getPromptTabStatus(promptTab, activeSessionIds[promptTab.id] ?? null);
              return (
                <button
                  key={promptTab.id}
                  id={`conversations-tab-${promptTab.id}`}
                  role="tab"
                  aria-selected={isActive}
                  type="button"
                  className={`rounded-md border px-3 py-2 text-left ${isActive ? 'border-foreground' : 'border-border'}`}
                  onClick={() => setActivePromptTabId(promptTab.id)}
                >
                  <span className="block text-sm">{promptTab.name}</span>
                  {promptTab.autoTrigger ? <span className="block text-xs text-muted-foreground">自动</span> : null}
                  {statusText ? <span className="block text-xs text-muted-foreground">{statusText}</span> : null}
                </button>
              );
            })}
          </div>
        </section>

        {activeChatNotice ? <p className="border-b border-border px-6 py-2 text-sm text-muted-foreground">{activeChatNotice}</p> : null}

        <section className="min-h-0 flex-1">
          {promptTabs.map((promptTab) => (
            <div
              key={promptTab.id}
              role="tabpanel"
              hidden={promptTab.id !== activePromptTabId}
              className={promptTab.id === activePromptTabId ? 'flex h-full min-h-0 flex-col' : 'hidden'}
            >
              <ChatThread
                messages={messageMap[promptTab.id] ?? []}
                restoreMessageId={restoreMessageIds[promptTab.id] ?? null}
                editingMessageId={editingMap[promptTab.id]?.messageId ?? null}
                editingText={editingMap[promptTab.id]?.text ?? ''}
                onStartEdit={(messageId, content) => setPromptTabEditing(promptTab.id, { messageId, text: content })}
                onEditingTextChange={(text) => {
                  const currentEditing = editingMap[promptTab.id];
                  if (!currentEditing) {
                    return;
                  }
                  setPromptTabEditing(promptTab.id, {
                    ...currentEditing,
                    text,
                  });
                }}
                onCancelEdit={() => setPromptTabEditing(promptTab.id, null)}
                onSubmitEdit={(messageId) => handleEditUserMessage(promptTab.id, messageId, editingMap[promptTab.id]?.text ?? '')}
                onRetryMessage={(messageId) => handleRetryMessage(promptTab.id, messageId)}
                onExpandBranches={(messageId) => handleExpandBranches(promptTab.id, messageId)}
                onStopBranch={(_messageId, branchId) => handleStopBranch(promptTab.id, branchId)}
                onDeleteBranch={(messageId, branchId) => handleDeleteBranch(promptTab.id, messageId, branchId)}
              />
            </div>
          ))}
        </section>

        <ChatInput
          disabled={!selectedPage || !activePromptTab}
          sending={Boolean(activeSessionId)}
          text={activeComposer?.text ?? ''}
          images={activeComposer?.images ?? []}
          includePageContent={includePageContent}
          selectedModelId={activeComposer?.selectedModelId ?? ''}
          models={models}
          onSelectModel={(modelId) => {
            if (!activePromptTab) {
              return;
            }
            setPromptTabComposer(activePromptTab.id, { selectedModelId: modelId });
          }}
          onTextChange={(text) => {
            if (!activePromptTab) {
              return;
            }
            setPromptTabComposer(activePromptTab.id, { text });
          }}
          onImagesChange={(images) => {
            if (!activePromptTab) {
              return;
            }
            setPromptTabComposer(activePromptTab.id, { images });
          }}
          onIncludePageContentChange={setIncludePageContent}
          onSend={(input) => {
            if (!activePromptTab) {
              return Promise.resolve();
            }
            return handleSend(activePromptTab.id, input);
          }}
          onStop={() => {
            if (!activePromptTab) {
              return Promise.resolve();
            }
            return handleStop(activePromptTab.id, activeSessionId);
          }}
          onExport={() => {
            if (!activePromptTab) {
              return Promise.resolve();
            }
            return handleExport(activePromptTab.id);
          }}
          onClear={() => {
            if (!activePromptTab) {
              return Promise.resolve();
            }
            return handleClearTabConversation(activePromptTab.id);
          }}
        />
      </section>
    </main>
  );
};
