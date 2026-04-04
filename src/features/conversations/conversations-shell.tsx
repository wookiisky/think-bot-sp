import { useEffect, useState } from 'react';
import {
  CopyIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
  SearchIcon,
  Settings2Icon,
  SparklesIcon,
  Trash2Icon,
} from 'lucide-react';

import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { getEnabledCompleteModels } from '../../domain/config/config-schema';
import { cn } from '../../lib/utils';
import { downloadTextFile } from '../../shared/download-file';
import {
  CHAT_PROMPT_TAB_ID,
  buildActiveSessionIdMap,
  buildComposerStateMap,
  buildMessageStateMap,
  buildPromptTabs,
  buildRestoreMessageIdMap,
  getPromptTabStatusKind,
  pickInitialPromptTabId,
  toModelOptions,
  toOptimisticUserContent,
  type ChatMessageState,
  type ComposerState,
  type EditingState,
  type ModelOption,
  type PromptTabStatusKind,
  type PromptTabDefinition,
  upsertAssistantBranch,
  upsertAssistantMessage,
} from '../workspace/workspace-state';
import type { SidebarConversationRecord, SidebarLoadingStateRecord, SidebarPageRecord } from '../../services/runtime-messaging/sidebar-contract';
import { ChatInput } from '../sidebar/chat-input';
import { ChatThread } from '../sidebar/chat-thread';
import {
  createWorkspaceTranslator,
  getPromptTabStatusLabelKey,
  loadWorkspaceLocaleResources,
  type WorkspaceLocaleCode,
} from '../workspace/workspace-copy';
import { WorkspaceStatusGlyph } from '../workspace/workspace-status';
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
  const [localeResources, setLocaleResources] = useState<ReturnType<typeof loadWorkspaceLocaleResources>>(loadWorkspaceLocaleResources());
  const [localeCode, setLocaleCode] = useState<WorkspaceLocaleCode>('zh-CN');
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
  const t = createWorkspaceTranslator(localeResources, localeCode);

  const selectedPage = pages.find((page) => page.normalizedUrl === selectedPageUrl) ?? detail.page ?? null;
  const activePromptTab = promptTabs.find((promptTab) => promptTab.id === activePromptTabId) ?? null;
  const activeComposer = activePromptTab ? composerMap[activePromptTab.id] ?? null : null;
  const activeSessionId = activePromptTab ? activeSessionIds[activePromptTab.id] ?? null : null;
  const activeChatNotice = activePromptTab ? chatNotices[activePromptTab.id] ?? '' : '';

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
    /** 默认聊天标签名称。 */
    chatLabel: string;
  }) => {
    const nextPromptTabs = buildPromptTabs({
      page: input.detail.page,
      quickInputs: input.quickInputs,
      models: input.models,
      fallbackModelId: input.fallbackModelId,
      chatLabel: input.chatLabel,
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
      const [pagesResponse, configResponse, resources] = await Promise.all([
        api.listPages(),
        api.getConfig(),
        loadWorkspaceLocaleResources(),
      ]);
      if (cancelled) {
        return;
      }

      const nextLocaleCode = configResponse.config.basic.language as WorkspaceLocaleCode;
      const nextModels = toModelOptions(getEnabledCompleteModels(configResponse.config));

      setLocaleResources(resources);
      setLocaleCode(nextLocaleCode);
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

        const nextLocaleCode = configResponse.config.basic.language as WorkspaceLocaleCode;
        const nextModels = toModelOptions(getEnabledCompleteModels(configResponse.config));
        const fallbackModelId =
          nextModels.find((model) => model.id === configResponse.config.basic.defaultModelId)?.id ?? nextModels[0]?.id ?? '';
        setLocaleCode(nextLocaleCode);
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
          chatLabel: localeResources?.t('workspace.chatTab', nextLocaleCode) ?? 'Chat',
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
                errorMessage:
                  typeof payload.errorMessage === 'string'
                    ? payload.errorMessage
                    : payload.type === 'CHAT_STREAM_FAILED'
                      ? t('workspace.status.error')
                      : t('workspace.status.cancelled'),
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
                modelLabel: branch?.modelLabel ?? t('workspace.status.branch'),
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
                modelLabel: branch?.modelLabel ?? t('workspace.status.branch'),
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
                      ? t('workspace.status.error')
                      : payload.type === 'BRANCH_STREAM_CANCELLED'
                        ? t('workspace.status.cancelled')
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
      setPageNotice(t('conversations.notice.emptyExtraction'));
      return;
    }

    try {
      await navigator.clipboard.writeText(detail.page.content);
      setPageNotice(t('conversations.notice.copySuccess'));
    } catch {
      setPageNotice(t('conversations.notice.copyFailed'));
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
      setPageNotice(t('conversations.notice.openSourceFailed'));
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
      setPageNotice(t('conversations.notice.titleSaveFailed'));
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
      setPromptTabNotice(promptTabId, t('workspace.notice.sendFailed'));
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
      setPromptTabNotice(promptTabId, t('workspace.notice.editFailed'));
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
      setPromptTabNotice(promptTabId, t('workspace.notice.retryFailed'));
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
      setPromptTabNotice(promptTabId, t('workspace.notice.expandBranchFailed'));
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
      setPromptTabNotice(promptTabId, t('workspace.notice.stopBranchFailed'));
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
      setPromptTabNotice(promptTabId, t('workspace.notice.deleteBranchFailed'));
    }
  };

  /** 清空当前标签。 */
  const handleClearTabConversation = async (promptTabId: string) => {
    if (!selectedPage) {
      return;
    }

    if (!window.confirm(t('workspace.notice.clearTabConfirm'))) {
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
      setPromptTabNotice(promptTabId, t('workspace.notice.clearTabSuccess'));
    } catch {
      setPromptTabNotice(promptTabId, t('workspace.notice.clearTabFailed'));
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
      setPromptTabNotice(promptTabId, t('workspace.notice.emptyExport'));
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
      setPromptTabNotice(promptTabId, t('workspace.notice.exportFailed'));
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
      setPageNotice(
        response.payload.deleteMode === 'soft'
          ? t('conversations.notice.pageDeletedSoft')
          : t('conversations.notice.pageDeletedHard'),
      );
    } catch {
      setPageNotice(t('conversations.notice.pageDeleteFailed'));
    }
  };

  return (
    <main data-testid="conversations-shell" className="flex min-h-screen bg-[linear-gradient(180deg,var(--color-background)_0%,var(--color-muted)_100%)] text-foreground">
      <aside className="flex shrink-0 flex-col border-r border-border bg-card/80 backdrop-blur-sm" style={{ width: `${sidebarWidth}px` }}>
        <header className="border-b border-border px-4 py-4">
          <h1 className="text-lg font-semibold">{t('conversations.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('conversations.subtitle')}</p>
          <label className="mt-3 flex items-center gap-2 rounded-md border border-input bg-input/20 px-3 py-2 text-xs text-muted-foreground">
            <SearchIcon className="size-3.5" />
            <input
              aria-label={t('conversations.searchLabel')}
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
              placeholder={t('conversations.searchPlaceholder')}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </label>
        </header>

        <section data-testid="conversations-page-list" className="min-h-0 flex-1 overflow-y-auto">
          {pages.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">
              {searchQuery.trim() ? t('conversations.emptySearch') : t('conversations.empty')}
            </div>
          ) : null}
          {pages.map((page) => {
            const isSelected = page.normalizedUrl === selectedPageUrl;
            return (
              <div
                key={page.normalizedUrl}
                className={cn(
                  'flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left transition-colors',
                  isSelected && 'bg-primary/10',
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  onClick={() => setSelectedPageUrl(page.normalizedUrl)}
                >
                  {page.faviconUrl ? (
                    <img src={page.faviconUrl} alt="" className="mt-1 size-4 rounded-sm" />
                  ) : (
                    <span className="mt-1 size-4 rounded-sm bg-border" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{page.title || page.url}</p>
                    <p className="truncate text-xs text-muted-foreground">{page.url}</p>
                  </div>
                </button>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`${t('conversations.action.openSource')} ${page.title || page.url}`}
                    title={t('conversations.action.openSource')}
                    onClick={() => {
                      void api.openSourcePage(page.url);
                    }}
                  >
                    <ExternalLinkIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`${t('conversations.action.deletePage')} ${page.title || page.url}`}
                    title={t('conversations.action.deletePage')}
                    onClick={() => {
                      void handleDeletePage(page.normalizedUrl);
                    }}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              </div>
            );
          })}
        </section>
      </aside>

      <div className="flex w-4 shrink-0 items-center justify-center border-r border-border bg-background/80">
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t('conversations.resizeSidebar')}
          data-testid="conversations-sidebar-resize-handle"
          className="h-24 w-2 cursor-col-resize rounded-full bg-border transition-colors hover:bg-primary/40"
          onPointerDown={(event) =>
            setSidebarResizeState({
              startX: event.clientX,
              startWidth: sidebarWidth,
            })
          }
        />
      </div>

      <section className="flex min-h-0 flex-1 flex-col">
        <header className="border-b border-border bg-card/80 px-6 py-4 backdrop-blur-sm">
          {detail.page ? (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  {isTitleEditing ? (
                    <input
                      aria-label={t('conversations.editTitle')}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-lg font-semibold outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
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
                <div className="flex gap-1">
                  <Button type="button" variant="outline" size="icon-sm" aria-label={t('conversations.action.copyExtraction')} title={t('conversations.action.copyExtraction')} onClick={() => void handleCopyExtraction()}>
                    <CopyIcon />
                  </Button>
                  <Button type="button" variant="outline" size="icon-sm" aria-label={t('conversations.action.openSource')} title={t('conversations.action.openSource')} onClick={() => void handleOpenSourcePage()}>
                    <ExternalLinkIcon />
                  </Button>
                  <Button type="button" variant="outline" size="icon-sm" aria-label={t('conversations.action.openSettings')} title={t('conversations.action.openSettings')} onClick={() => void api.openSettingsPage()}>
                    <Settings2Icon />
                  </Button>
                </div>
              </div>
              {pageNotice ? <Badge variant="outline">{pageNotice}</Badge> : null}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {detailStatus === 'error' ? t('conversations.state.loadFailed') : t('conversations.state.selectPage')}
            </div>
          )}
        </header>

        <section className="min-h-0 flex-1 overflow-y-auto border-b border-border bg-background/80 px-6 py-4">
          {detailStatus === 'loading' && !detail.page ? (
            <div className="flex items-center gap-2 text-sm text-primary">
              <LoaderCircleIcon className="size-4 animate-spin" />
              <span>{t('conversations.state.bootstrapping')}</span>
            </div>
          ) : null}
          {detail.page?.content ? <article className="whitespace-pre-wrap text-sm leading-6">{detail.page.content}</article> : null}
          {detail.page && !detail.page.content ? <p className="text-sm text-muted-foreground">{t('conversations.state.noContent')}</p> : null}
        </section>

        <section role="tablist" aria-label={t('conversations.tablistLabel')} className="border-b border-border bg-muted/20 px-6 py-3">
          <div className="flex flex-wrap gap-1.5">
            {promptTabs.map((promptTab) => {
              const isActive = promptTab.id === activePromptTabId;
              const status = getPromptTabStatusKind(promptTab, activeSessionIds[promptTab.id] ?? null);
              const statusKey = getPromptTabStatusLabelKey(status);
              const statusLabel = statusKey ? t(statusKey) : promptTab.name;

              return (
                <button
                  key={promptTab.id}
                  id={`conversations-tab-${promptTab.id}`}
                  role="tab"
                  aria-selected={isActive}
                  type="button"
                  className={cn(
                    'flex min-w-[84px] items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-xs shadow-sm transition-colors',
                    isActive ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background/90 hover:bg-muted',
                  )}
                  onClick={() => setActivePromptTabId(promptTab.id)}
                >
                  <span className="truncate">{promptTab.name}</span>
                  <span className="flex items-center gap-1">
                    {promptTab.autoTrigger ? <SparklesIcon className={cn('size-3', isActive ? 'text-primary-foreground/90' : 'text-amber-600')} /> : null}
                    {status !== 'idle' ? (
                      <WorkspaceStatusGlyph label={statusLabel} status={toPromptVisualStatus(status)} className="size-3.5" />
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {activeChatNotice ? (
          <div className="border-b border-border px-6 py-2">
            <Badge variant="outline">{activeChatNotice}</Badge>
          </div>
        ) : null}

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
                t={t}
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
          t={t}
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

/** 把标签状态映射成统一视觉状态。 */
const toPromptVisualStatus = (status: PromptTabStatusKind) => {
  switch (status) {
    case 'loading':
      return 'loading';
    case 'auto-running':
      return 'auto';
    case 'auto-error':
      return 'error';
    case 'auto-done':
    case 'ready':
      return 'done';
    case 'idle':
    default:
      return 'idle';
  }
};
