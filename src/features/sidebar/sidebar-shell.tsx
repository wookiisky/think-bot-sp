import { useEffect, useState } from 'react';

import { getEnabledCompleteModels } from '../../domain/config/config-schema';
import {
  CHAT_PROMPT_TAB_ID,
  buildActiveSessionIdMap,
  buildComposerStateMap,
  buildMessageStateMap,
  buildPromptTabs,
  buildRestoreMessageIdMap,
  createChatPromptTab,
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
import { downloadTextFile } from '../../shared/download-file';
import { ChatInput } from './chat-input';
import { ChatThread } from './chat-thread';
import type { SidebarApi } from './sidebar-api';

type ExtractionMethod = 'readability' | 'jina';
type SidebarState = 'bootstrapping' | 'blocked' | 'extracting' | 'ready' | 'error';
type ExtractionResizeState = {
  /** 拖拽开始时的鼠标纵坐标。 */
  startY: number;
  /** 拖拽开始时的提取区高度。 */
  startHeight: number;
};
type BranchMessageState = {
  /** 分支 id。 */
  id: string;
  /** 分支模型 id。 */
  modelId: string;
  /** 分支模型展示名。 */
  modelLabel: string;
  /** 分支正文。 */
  content: string;
  /** 分支状态。 */
  status: 'loading' | 'done' | 'error' | 'cancelled';
  /** 分支错误消息。 */
  errorMessage: string | null;
};
type ChatMessageState = {
  /** 消息 id。 */
  id: string;
  /** 角色。 */
  role: 'user' | 'assistant' | 'system';
  /** 内容。 */
  content: string;
  /** 状态。 */
  status: 'loading' | 'done' | 'error' | 'cancelled';
  /** 错误消息。 */
  errorMessage: string | null;
  /** 当前消息下的分支列表。 */
  branches: BranchMessageState[];
};
type ModelOption = {
  /** 模型稳定 id。 */
  id: string;
  /** 展示名。 */
  name: string;
  /** 是否支持图片输入。 */
  supportsImages: boolean;
};
type PromptTabDefinition = {
  /** promptTab 稳定 id。 */
  id: string;
  /** 标签展示名。 */
  name: string;
  /** 默认草稿文本。 */
  defaultText: string;
  /** 当前标签默认模型。 */
  preferredModelId: string;
  /** 是否为自动触发标签。 */
  autoTrigger: boolean;
  /** 当前页面下的 promptTab 运行态。 */
  promptTabState: SidebarPageRecord['promptTabStates'][number] | null;
};
type ComposerState = {
  /** 当前草稿文本。 */
  text: string;
  /** 当前图片列表。 */
  images: string[];
  /** 当前标签选中的模型 id。 */
  selectedModelId: string;
};
type EditingState = {
  /** 当前编辑中的用户消息 id。 */
  messageId: string;
  /** 当前编辑草稿。 */
  text: string;
};
type SidebarShellProps = {
  /** side panel 消息 API。 */
  api: SidebarApi;
  /** 当前浏览器标签页 id。 */
  tabId: number;
  /** 当前页面 URL。 */
  pageUrl: string;
};

/** 提取区最小高度。 */
const MIN_EXTRACTION_PANEL_HEIGHT = 160;
/** 提取区默认高度。 */
const DEFAULT_EXTRACTION_PANEL_HEIGHT = 240;
/** 提取区最大高度。 */
const MAX_EXTRACTION_PANEL_HEIGHT = 420;

/** 限制提取区高度范围。 */
const clampExtractionPanelHeight = (height: number) =>
  Math.min(MAX_EXTRACTION_PANEL_HEIGHT, Math.max(MIN_EXTRACTION_PANEL_HEIGHT, height));


/** 渲染阶段 5 的多 promptTab 侧边栏工作台。 */
export const SidebarShell = ({ api, tabId, pageUrl }: SidebarShellProps) => {
  const [state, setState] = useState<SidebarState>('bootstrapping');
  const [content, setContent] = useState('');
  const [method, setMethod] = useState<ExtractionMethod>('readability');
  const [promptTabs, setPromptTabs] = useState<PromptTabDefinition[]>([createChatPromptTab('')]);
  const [activePromptTabId, setActivePromptTabId] = useState(CHAT_PROMPT_TAB_ID);
  const [messageMap, setMessageMap] = useState<Record<string, ChatMessageState[]>>({
    [CHAT_PROMPT_TAB_ID]: [],
  });
  const [restoreMessageIds, setRestoreMessageIds] = useState<Record<string, string | null>>({
    [CHAT_PROMPT_TAB_ID]: null,
  });
  const [activeSessionIds, setActiveSessionIds] = useState<Record<string, string | null>>({
    [CHAT_PROMPT_TAB_ID]: null,
  });
  const [composerMap, setComposerMap] = useState<Record<string, ComposerState>>({
    [CHAT_PROMPT_TAB_ID]: {
      text: '',
      images: [],
      selectedModelId: '',
    },
  });
  const [models, setModels] = useState<ModelOption[]>([]);
  const [includePageContent, setIncludePageContent] = useState(true);
  const [pageNotice, setPageNotice] = useState('');
  const [chatNotices, setChatNotices] = useState<Record<string, string>>({});
  const [editingMap, setEditingMap] = useState<Record<string, EditingState | null>>({
    [CHAT_PROMPT_TAB_ID]: null,
  });
  const [extractionPanelHeight, setExtractionPanelHeight] = useState(DEFAULT_EXTRACTION_PANEL_HEIGHT);
  const [extractionResizeState, setExtractionResizeState] = useState<ExtractionResizeState | null>(null);

  const activePromptTab = promptTabs.find((promptTab) => promptTab.id === activePromptTabId) ?? promptTabs[0] ?? null;
  const activeComposer =
    (activePromptTab ? composerMap[activePromptTab.id] : null) ?? {
      text: '',
      images: [],
      selectedModelId: '',
    };
  const activeSessionId = activePromptTab ? activeSessionIds[activePromptTab.id] ?? null : null;
  const activeChatNotice = activePromptTab ? chatNotices[activePromptTab.id] ?? '' : '';
  const activeEditingState = activePromptTab ? editingMap[activePromptTab.id] ?? null : null;

  useEffect(() => {
    if (!extractionResizeState) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      setExtractionPanelHeight(clampExtractionPanelHeight(extractionResizeState.startHeight + (event.clientY - extractionResizeState.startY)));
    };
    const handlePointerUp = () => {
      setExtractionResizeState(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [extractionResizeState]);

  /** 更新单个标签的消息列表。 */
  const setPromptTabMessages = (promptTabId: string, update: (_current: ChatMessageState[]) => ChatMessageState[]) => {
    setMessageMap((current) => ({
      ...current,
      [promptTabId]: update(current[promptTabId] ?? []),
    }));
  };

  /** 更新单个标签的草稿。 */
  const setPromptTabComposer = (promptTabId: string, patch: Partial<ComposerState>) => {
    const fallbackComposer = composerMap[promptTabId] ?? {
      text: promptTabs.find((promptTab) => promptTab.id === promptTabId)?.defaultText ?? '',
      images: [],
      selectedModelId: promptTabs.find((promptTab) => promptTab.id === promptTabId)?.preferredModelId ?? '',
    };
    setComposerMap((current) => ({
      ...current,
      [promptTabId]: {
        ...(current[promptTabId] ?? fallbackComposer),
        ...patch,
      },
    }));
  };

  /** 更新单个标签提示语。 */
  const setPromptTabNotice = (promptTabId: string, notice: string) => {
    setChatNotices((current) => ({
      ...current,
      [promptTabId]: notice,
    }));
  };

  /** 更新单个标签的编辑态。 */
  const setPromptTabEditing = (promptTabId: string, editing: EditingState | null) => {
    setEditingMap((current) => ({
      ...current,
      [promptTabId]: editing,
    }));
  };

  /** 执行一次正文提取并同步 UI 状态。 */
  const runExtraction = async (nextMethod: ExtractionMethod) => {
    setState('extracting');
    const extraction = await api.reExtractContent({
      tabId,
      pageUrl,
      method: nextMethod,
    });
    setContent(extraction.payload.content);
    setMethod(extraction.payload.extractionMethod);
    setState('ready');
  };

  /** 复制当前提取内容。 */
  const handleCopyExtraction = async () => {
    if (!content.trim()) {
      setPageNotice('当前没有可复制的提取内容');
      return;
    }

    try {
      await navigator.clipboard.writeText(content);
      setPageNotice('已复制提取内容');
    } catch {
      setPageNotice('复制提取内容失败，请重试');
    }
  };

  /** 按当前方法重新提取。 */
  const handleReExtract = async () => {
    setPageNotice('');
    try {
      await runExtraction(method);
      setPageNotice('已刷新提取内容');
    } catch {
      setState('error');
      setPageNotice('重新提取失败，请重试');
    }
  };

  /** 清空当前页面缓存与会话，但保留各标签本地草稿。 */
  const handleClearPageContext = async () => {
    if (!window.confirm('确认清空当前页面数据？这会同时清空页面正文缓存和当前页面下的聊天记录。')) {
      return;
    }

    try {
      await api.clearPageContext({ tabId, pageUrl });
      setContent('');
      setMessageMap(Object.fromEntries(promptTabs.map((promptTab) => [promptTab.id, []])));
      setRestoreMessageIds(Object.fromEntries(promptTabs.map((promptTab) => [promptTab.id, null])));
      setActiveSessionIds(Object.fromEntries(promptTabs.map((promptTab) => [promptTab.id, null])));
      setChatNotices({});
      setEditingMap(Object.fromEntries(promptTabs.map((promptTab) => [promptTab.id, null])));
      setPromptTabs((current) =>
        current.map((promptTab) => ({
          ...promptTab,
          promptTabState: null,
        })),
      );
      setPageNotice('已清空当前页面数据');
      if (state !== 'blocked') {
        setState('ready');
      }
    } catch {
      setPageNotice('清空当前页面数据失败，请重试');
    }
  };

  /** 打开历史页。 */
  const handleOpenHistoryPage = async () => {
    try {
      await api.openHistoryPage();
    } catch {
      setPageNotice('打开历史页失败，请重试');
    }
  };

  /** 打开设置页。 */
  const handleOpenSettingsPage = async () => {
    try {
      await api.openSettingsPage();
    } catch {
      setPageNotice('打开设置页失败，请重试');
    }
  };

  /** 打开 GitHub 仓库。 */
  const handleOpenGithubProject = async () => {
    try {
      await api.openGithubProject();
    } catch {
      setPageNotice('打开 GitHub 失败，请重试');
    }
  };

  useEffect(() => {
    if (promptTabs.length === 0) {
      return;
    }

    const subscriptions = promptTabs.map((promptTab) => {
      const port = api.connectStream({
        tabId,
        pageUrl,
        promptTabId: promptTab.id,
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
                [promptTabId]: payload.sessionId as string,
              }));
            }
            if (typeof payload.messageId === 'string') {
              setRestoreMessageIds((current) => ({
                ...current,
                [promptTabId]: payload.messageId as string,
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
                [promptTabId]: payload.sessionId as string,
              }));
            }
            if (typeof payload.messageId === 'string' && typeof payload.chunk === 'string') {
              setRestoreMessageIds((current) => ({
                ...current,
                [promptTabId]: payload.messageId as string,
              }));
              setPromptTabMessages(promptTabId, (current) =>
                upsertAssistantMessage(current, payload.messageId as string, (message) => ({
                  id: payload.messageId as string,
                  role: 'assistant',
                  content: `${message?.content ?? ''}${payload.chunk as string}`,
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
                  status: 'error',
                  errorMessage: typeof payload.errorMessage === 'string' ? (payload.errorMessage as string) : '生成失败',
                  branches: message?.branches ?? [],
                })),
              );
            }
            return;
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
                  status: 'cancelled',
                  errorMessage: 'stream cancelled',
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
                upsertAssistantBranch(current, payload.messageId as string, payload.branchId as string, (branch) => ({
                  id: payload.branchId as string,
                  modelId: payload.modelId as string,
                  modelLabel: payload.modelLabel as string,
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
                upsertAssistantBranch(current, payload.messageId as string, payload.branchId as string, (branch) => ({
                  id: payload.branchId as string,
                  modelId: branch?.modelId ?? '',
                  modelLabel: branch?.modelLabel ?? '分支',
                  content: `${branch?.content ?? ''}${payload.chunk as string}`,
                  status: 'loading',
                  errorMessage: null,
                })),
              );
            }
            return;
          case 'BRANCH_STREAM_FINISHED':
            if (typeof payload.messageId === 'string' && typeof payload.branchId === 'string') {
              setPromptTabMessages(promptTabId, (current) =>
                upsertAssistantBranch(current, payload.messageId as string, payload.branchId as string, (branch) => ({
                  id: payload.branchId as string,
                  modelId: branch?.modelId ?? '',
                  modelLabel: branch?.modelLabel ?? '分支',
                  content: branch?.content ?? '',
                  status: 'done',
                  errorMessage: null,
                })),
              );
            }
            return;
          case 'BRANCH_STREAM_FAILED':
            if (typeof payload.messageId === 'string' && typeof payload.branchId === 'string') {
              setPromptTabMessages(promptTabId, (current) =>
                upsertAssistantBranch(current, payload.messageId as string, payload.branchId as string, (branch) => ({
                  id: payload.branchId as string,
                  modelId: branch?.modelId ?? '',
                  modelLabel: branch?.modelLabel ?? '分支',
                  content: branch?.content ?? '',
                  status: 'error',
                  errorMessage: typeof payload.errorMessage === 'string' ? (payload.errorMessage as string) : '分支生成失败',
                })),
              );
            }
            return;
          case 'BRANCH_STREAM_CANCELLED':
            if (typeof payload.messageId === 'string' && typeof payload.branchId === 'string') {
              setPromptTabMessages(promptTabId, (current) =>
                upsertAssistantBranch(current, payload.messageId as string, payload.branchId as string, (branch) => ({
                  id: payload.branchId as string,
                  modelId: branch?.modelId ?? '',
                  modelLabel: branch?.modelLabel ?? '分支',
                  content: branch?.content ?? '',
                  status: 'cancelled',
                  errorMessage: 'branch stream cancelled',
                })),
              );
            }
            return;
          case 'RESTORE_LOADING':
            if (typeof payload.sessionId === 'string') {
              setActiveSessionIds((current) => ({
                ...current,
                [promptTabId]: payload.sessionId as string,
              }));
            }
            if (typeof payload.messageId === 'string' && typeof payload.content === 'string') {
              setRestoreMessageIds((current) => ({
                ...current,
                [promptTabId]: payload.messageId as string,
              }));
              setPromptTabMessages(promptTabId, (current) =>
                upsertAssistantMessage(current, payload.messageId as string, () => ({
                  id: payload.messageId as string,
                  role: 'assistant',
                  content: payload.content as string,
                  status: 'loading',
                  errorMessage: null,
                  branches: [],
                })),
              );
            }
            return;
          case 'LOADING_STATE_UPDATE':
            if (typeof payload.status === 'string' && payload.status !== 'loading') {
              setActiveSessionIds((current) => ({
                ...current,
                [promptTabId]: null,
              }));
            }
            return;
          default:
            return;
        }
      };

      port.onMessage?.addListener?.(handlePortMessage as never);
      return {
        port,
        handlePortMessage,
      };
    });

    return () => {
      for (const subscription of subscriptions) {
        subscription.port.onMessage?.removeListener?.(subscription.handlePortMessage as never);
        subscription.port.disconnect();
      }
    };
  }, [api, pageUrl, promptTabs, tabId]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [bootstrap, configResponse] = await Promise.all([api.getSidebarBootstrap({ tabId, pageUrl }), api.getConfig()]);
        if (cancelled) {
          return;
        }

        const nextMethod = bootstrap.page?.extractionMethod ?? 'readability';
        const nextModels = toModelOptions(getEnabledCompleteModels(configResponse.config));
        const fallbackModelId =
          nextModels.find((model) => model.id === configResponse.config.basic.defaultModelId)?.id ?? nextModels[0]?.id ?? '';
        const nextPromptTabs = buildPromptTabs({
          page: bootstrap.page,
          quickInputs: configResponse.config.quickInputs,
          models: nextModels,
          fallbackModelId,
        });

        setMethod(nextMethod);
        setContent(bootstrap.page?.content ?? '');
        setModels(nextModels);
        setPromptTabs(nextPromptTabs);
        setComposerMap(buildComposerStateMap(nextPromptTabs));
        setMessageMap(buildMessageStateMap(nextPromptTabs, bootstrap.conversations));
        setRestoreMessageIds(
          buildRestoreMessageIdMap({
            promptTabs: nextPromptTabs,
            conversations: bootstrap.conversations,
            loadingStates: bootstrap.loadingStates,
          }),
        );
        setActiveSessionIds(buildActiveSessionIdMap(nextPromptTabs, bootstrap.loadingStates));
        setChatNotices({});
        setEditingMap(Object.fromEntries(nextPromptTabs.map((promptTab) => [promptTab.id, null])));
        setActivePromptTabId(pickInitialPromptTabId(nextPromptTabs, bootstrap.loadingStates));
        setIncludePageContent(bootstrap.page?.includePageContent ?? configResponse.config.basic.includePageContentByDefault);

        if (bootstrap.blockedByBlacklist) {
          setState('blocked');
          return;
        }

        if (!bootstrap.shouldExtract) {
          setState('ready');
          return;
        }

        setState('extracting');
        const extraction = await api.reExtractContent({ tabId, pageUrl, method: nextMethod });
        if (cancelled) {
          return;
        }

        setContent(extraction.payload.content);
        setMethod(extraction.payload.extractionMethod);
        setState('ready');
      } catch {
        if (!cancelled) {
          setState('error');
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [api, pageUrl, tabId]);

  useEffect(() => {
    if (promptTabs.length === 0) {
      return;
    }
    if (promptTabs.some((promptTab) => promptTab.id === activePromptTabId)) {
      return;
    }
    setActivePromptTabId(promptTabs[0].id);
  }, [activePromptTabId, promptTabs]);

  /** 黑名单放行后继续当前页面提取。 */
  const handleConfirmContinue = async () => {
    setPageNotice('');
    await api.confirmBlacklistContinue({ tabId, pageUrl });
    try {
      await runExtraction(method);
    } catch {
      setState('error');
    }
  };

  /** 切换提取方式并立即重新提取。 */
  const handleSwitchMethod = async (nextMethod: ExtractionMethod) => {
    if (nextMethod === method || state === 'bootstrapping' || state === 'blocked') {
      return;
    }

    try {
      setPageNotice('');
      await api.switchExtractionMethod({ tabId, pageUrl, method: nextMethod });
      await runExtraction(nextMethod);
      setPageNotice(`已切换为 ${nextMethod === 'readability' ? 'Readability' : 'Jina'} 并刷新`);
    } catch {
      setState('error');
      setPageNotice('切换提取方式失败，请重试');
    }
  };

  /** 发送用户消息，并在本地先补一条乐观消息。 */
  const handleSend = async (promptTabId: string, input: { text: string; images: string[]; modelId: string; includePageContent: boolean }) => {
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
        tabId,
        pageUrl,
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
            : current.map((message) =>
                message.id === optimisticUserMessageId
                  ? {
                      ...message,
                      id: response.payload.userMessageId as string,
                    }
                  : message,
              );
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

  /** 编辑用户消息后，裁剪其后的结果并立刻重发。 */
  const handleEditUserMessage = async (promptTabId: string, messageId: string, text: string) => {
    try {
      setPromptTabNotice(promptTabId, '');
      const response = await api.editUserMessage({
        tabId,
        pageUrl,
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
          ...current.slice(0, targetIndex + 1).map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  content: text,
                }
              : message,
          ),
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

  /** 重试目标助手消息，并用新的主回答替换旧结果。 */
  const handleRetryMessage = async (promptTabId: string, messageId: string) => {
    try {
      setPromptTabNotice(promptTabId, '');
      const response = await api.retryMessage({
        tabId,
        pageUrl,
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

  /** 停止当前标签会话。 */
  const handleStop = async (promptTabId: string, sessionId: string | null) => {
    if (!sessionId) {
      return;
    }

    await api.stopSession({
      tabId,
      pageUrl,
      promptTabId,
      sessionId,
    });
  };

  /** 清空当前标签会话，不影响页面提取内容与其他标签。 */
  const handleClearTabConversation = async (promptTabId: string) => {
    if (!window.confirm('确认清空当前标签聊天记录？这只会清空当前标签的会话和进行中的生成，不影响页面提取内容和其他标签。')) {
      return;
    }

    try {
      await api.clearTabConversation({
        tabId,
        pageUrl,
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
      setPromptTabs((current) =>
        current.map((promptTab) =>
          promptTab.id === promptTabId
            ? {
                ...promptTab,
                promptTabState: promptTab.promptTabState
                  ? {
                      ...promptTab.promptTabState,
                      initializedAt: null,
                      lastAutoTriggerAt: null,
                      autoTriggerStatus: 'idle',
                      lastClearedAt: Date.now(),
                    }
                  : null,
              }
            : promptTab,
        ),
      );
    } catch {
      setPromptTabNotice(promptTabId, '清空当前标签聊天记录失败，请重试');
    }
  };

  /** 导出当前标签会话，空会话时直接拦截。 */
  const handleExport = async (promptTabId: string) => {
    const messages = messageMap[promptTabId] ?? [];
    const hasExportableMessage = messages.some((message) => message.content.trim().length > 0);
    if (!hasExportableMessage) {
      setPromptTabNotice(promptTabId, '当前会话为空，不能导出');
      return;
    }

    try {
      setPromptTabNotice(promptTabId, '');
      const exported = await api.exportConversation({
        tabId,
        pageUrl,
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

  /** 针对既有助手消息继续新增分支。 */
  const handleExpandBranches = async (promptTabId: string, messageId: string) => {
    try {
      setPromptTabNotice(promptTabId, '');
      await api.expandMessageBranches({
        tabId,
        pageUrl,
        promptTabId,
        messageId,
      });
    } catch {
      setPromptTabNotice(promptTabId, '新增分支失败，请重试');
    }
  };

  /** 停止单个分支流。 */
  const handleStopBranch = async (promptTabId: string, branchId: string) => {
    try {
      await api.stopBranch({
        tabId,
        pageUrl,
        promptTabId,
        branchId,
      });
    } catch {
      setPromptTabNotice(promptTabId, '停止分支失败，请重试');
    }
  };

  /** 删除单个分支，并同时移除本地显示。 */
  const handleDeleteBranch = async (promptTabId: string, messageId: string, branchId: string) => {
    try {
      await api.deleteBranch({
        tabId,
        pageUrl,
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

  return (
    <main data-testid="sidebar-shell" className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={method === 'readability'}
              onClick={() => void handleSwitchMethod('readability')}
            >
              Readability
            </button>
            <button type="button" aria-pressed={method === 'jina'} onClick={() => void handleSwitchMethod('jina')}>
              Jina
            </button>
            <button type="button" onClick={() => void handleCopyExtraction()}>
              复制提取内容
            </button>
            <button type="button" onClick={() => void handleReExtract()}>
              重新提取
            </button>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => void handleClearPageContext()}>
              清空当前页面数据
            </button>
            <button type="button" onClick={() => void handleOpenHistoryPage()}>
              打开历史页
            </button>
            <button type="button" onClick={() => void handleOpenSettingsPage()}>
              打开设置页
            </button>
            <button type="button" onClick={() => void handleOpenGithubProject()}>
              打开 GitHub
            </button>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          {pageNotice ? <p className="text-sm text-muted-foreground">{pageNotice}</p> : <span />}
          <span className="text-xs text-muted-foreground">browserTab #{tabId}</span>
        </div>
      </header>

      <section
        data-testid="sidebar-extraction-panel"
        className="overflow-y-auto border-b border-border px-4 py-3"
        style={{ height: `${extractionPanelHeight}px` }}
      >
        {state === 'bootstrapping' ? <p>正在恢复页面上下文…</p> : null}
        {state === 'blocked' ? (
          <div className="space-y-3">
            <p>当前页面命中黑名单</p>
            <p>等待放行</p>
            <button type="button" onClick={() => void handleConfirmContinue()}>
              继续提取
            </button>
          </div>
        ) : null}
        {state === 'extracting' ? <p>正在提取页面正文…</p> : null}
        {state === 'error' ? <p>提取失败，请重试。</p> : null}
        {content ? <article className="whitespace-pre-wrap">{content}</article> : null}
      </section>
      <div className="border-b border-border px-4 py-1">
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="调整提取区高度"
          data-testid="sidebar-extraction-resize-handle"
          className="mx-auto h-2 w-16 cursor-row-resize rounded-full bg-border"
          onPointerDown={(event) => {
            setExtractionResizeState({
              startY: event.clientY,
              startHeight: extractionPanelHeight,
            });
          }}
        />
      </div>

      <section role="tablist" aria-label="侧边栏工作台" className="border-b border-border px-4 py-2">
        <div className="flex flex-wrap gap-2">
          {promptTabs.map((promptTab) => {
            const statusText = getPromptTabStatus(promptTab, activeSessionIds[promptTab.id] ?? null);
            const isActive = promptTab.id === activePromptTabId;
            return (
              <button
                key={promptTab.id}
                id={`sidebar-tab-${promptTab.id}`}
                role="tab"
                aria-selected={isActive}
                aria-controls={`sidebar-tabpanel-${promptTab.id}`}
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

      {activeChatNotice ? <p className="border-b border-border px-4 py-2 text-sm text-muted-foreground">{activeChatNotice}</p> : null}

      <section className="flex-1 min-h-0">
        {promptTabs.map((promptTab) => (
          <div
            key={promptTab.id}
            id={`sidebar-tabpanel-${promptTab.id}`}
            role="tabpanel"
            aria-labelledby={`sidebar-tab-${promptTab.id}`}
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
        disabled={state === 'bootstrapping' || state === 'extracting' || state === 'blocked' || !activePromptTab}
        sending={Boolean(activeSessionId)}
        text={activeComposer.text}
        images={activeComposer.images}
        includePageContent={includePageContent}
        selectedModelId={activeComposer.selectedModelId}
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
    </main>
  );
};
