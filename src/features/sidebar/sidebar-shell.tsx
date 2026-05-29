import { useEffect, useState } from 'react';
import {
  CopyIcon,
  ExternalLinkIcon,
  FileTextIcon,
  HistoryIcon,
  RefreshCcwIcon,
  Settings2Icon,
  ShieldAlertIcon,
  SparklesIcon,
  Trash2Icon,
} from 'lucide-react';

import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { MiniConfirm } from '../../components/ui/mini-confirm';
import { ToastStack } from '../../components/ui/toast-stack';
import { Tooltip } from '../../components/ui/tooltip';
import {
  DEFAULT_ASSISTANT_MARKDOWN_DISPLAY_CONFIG,
  type AssistantMarkdownDisplayConfig,
} from '../../domain/config/assistant-markdown-display-config';
import {
  DEFAULT_EXTRACTION_TEXT_FONT_SIZE,
  DEFAULT_EXTRACTION_PANEL_HEIGHT,
  type ExtractionTextFontSize,
  MAX_EXTRACTION_PANEL_HEIGHT,
  MIN_EXTRACTION_PANEL_HEIGHT,
  getEnabledCompleteModels,
} from '../../domain/config/config-schema';
import { cn } from '../../lib/utils';
import {
  CHAT_PROMPT_TAB_ID,
  appendAssistantBranches,
  buildActiveSessionIdMap,
  buildComposerStateMap,
  buildMessageStateMap,
  buildPromptTabs,
  buildRestoreMessageIdMap,
  createChatPromptTab,
  findBranchPreviewDetail,
  getPromptTabStatusKind,
  omitMessageDisplayContent,
  pickInitialPromptTabId,
  toModelOptions,
  toOptimisticUserContent,
  type ChatMessageState,
  type ComposerState,
  type EditingState,
  type ModelOption,
  type PromptTabDefinition,
  syncAssistantMessageState,
  upsertAssistantBranch,
  upsertAssistantMessage,
} from '../workspace/workspace-state';
import { BranchPreviewOverlay } from '../workspace/branch-preview-overlay';
import {
  createWorkspaceTranslator,
  getPromptTabStatusLabelKey,
  loadWorkspaceLocaleResources,
  type WorkspaceLocaleCode,
} from '../workspace/workspace-copy';
import { normalizeExtractionText } from '../workspace/extraction-text';
import { WorkspaceStatusGlyph } from '../workspace/workspace-status';
import { downloadTextFile } from '../../shared/download-file';
import { ChatInput } from './chat-input';
import { ChatThread } from './chat-thread';
import type { SidebarApi, SidebarExtractionSource } from './sidebar-api';
import { getExtractionTextClassName } from '../../lib/extraction-text-font-size';
import { sidebarPortEventSchema } from '../../services/runtime-messaging/sidebar-contract';

type ExtractionMethod = 'readability' | 'jina';
type SidebarState = 'bootstrapping' | 'blocked' | 'extracting' | 'ready' | 'error';
type ExtractionResizeState = {
  /** 拖拽开始时的鼠标纵坐标。 */
  startY: number;
  /** 拖拽开始时的提取区高度。 */
  startHeight: number;
};
type SidebarToast = {
  /** toast 稳定 id。 */
  id: number;
  /** 反馈语气。 */
  tone: 'success' | 'error';
  /** 反馈正文。 */
  message: string;
};
type BranchPreviewTarget = {
  /** 所属 promptTab id。 */
  promptTabId: string;
  /** 所属助手消息 id。 */
  messageId: string;
  /** 目标分支 id。 */
  branchId: string;
};
type SidebarShellProps = {
  /** side panel 消息 API。 */
  api: SidebarApi;
  /** 当前浏览器标签页 id。 */
  tabId: number;
  /** 当前页面 URL。 */
  pageUrl: string;
};

/** 限制提取区高度范围。 */
const clampExtractionPanelHeight = (height: number) =>
  Math.min(MAX_EXTRACTION_PANEL_HEIGHT, Math.max(MIN_EXTRACTION_PANEL_HEIGHT, height));

/** 首屏聊天标签默认文案。 */
const getDefaultChatTabLabel = (resources: ReturnType<typeof loadWorkspaceLocaleResources> | null, locale: WorkspaceLocaleCode) =>
  resources?.t('workspace.chatTab', locale) ?? 'Chat';

/** 渲染阶段 5 的多 promptTab 侧边栏工作台。 */
export const SidebarShell = ({ api, tabId, pageUrl }: SidebarShellProps) => {
  const [localeResources, setLocaleResources] = useState<ReturnType<typeof loadWorkspaceLocaleResources>>(loadWorkspaceLocaleResources());
  const [localeCode, setLocaleCode] = useState<WorkspaceLocaleCode>('zh-CN');
  const [state, setState] = useState<SidebarState>('bootstrapping');
  const [content, setContent] = useState('');
  const [method, setMethod] = useState<ExtractionMethod>('readability');
  const [promptTabs, setPromptTabs] = useState<PromptTabDefinition[]>(() => [
    createChatPromptTab('', getDefaultChatTabLabel(loadWorkspaceLocaleResources(), 'zh-CN')),
  ]);
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
  const [toast, setToast] = useState<SidebarToast | null>(null);
  const [chatNotices, setChatNotices] = useState<Record<string, string>>({});
  const [editingMap, setEditingMap] = useState<Record<string, EditingState | null>>({
    [CHAT_PROMPT_TAB_ID]: null,
  });
  const [branchPreviewTarget, setBranchPreviewTarget] = useState<BranchPreviewTarget | null>(null);
  const [extractionPanelHeight, setExtractionPanelHeight] = useState(DEFAULT_EXTRACTION_PANEL_HEIGHT);
  const [extractionTextFontSize, setExtractionTextFontSize] = useState<ExtractionTextFontSize>(DEFAULT_EXTRACTION_TEXT_FONT_SIZE);
  const [assistantMarkdownDisplayConfig, setAssistantMarkdownDisplayConfig] = useState<AssistantMarkdownDisplayConfig>(
    DEFAULT_ASSISTANT_MARKDOWN_DISPLAY_CONFIG,
  );
  const [extractionResizeState, setExtractionResizeState] = useState<ExtractionResizeState | null>(null);
  const t = createWorkspaceTranslator(localeResources, localeCode);

  const activePromptTab = promptTabs.find((promptTab) => promptTab.id === activePromptTabId) ?? promptTabs[0] ?? null;
  const activeComposer =
    (activePromptTab ? composerMap[activePromptTab.id] : null) ?? {
      text: '',
      images: [],
      selectedModelId: '',
    };
  const activeSessionId = activePromptTab ? activeSessionIds[activePromptTab.id] ?? null : null;
  const activeChatNotice = activePromptTab ? chatNotices[activePromptTab.id] ?? '' : '';
  const normalizedExtractionContent = normalizeExtractionText(content);
  const extractionTextClassName = getExtractionTextClassName(extractionTextFontSize);
  const branchPreview =
    branchPreviewTarget
      ? findBranchPreviewDetail(
          messageMap[branchPreviewTarget.promptTabId] ?? [],
          branchPreviewTarget.messageId,
          branchPreviewTarget.branchId,
        )
      : null;

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, 4000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [toast]);

  useEffect(() => {
    if (branchPreviewTarget && !branchPreview) {
      setBranchPreviewTarget(null);
    }
  }, [branchPreview, branchPreviewTarget]);

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

  /** 推送页面级 toast。 */
  const pushToast = (tone: SidebarToast['tone'], message: string) => {
    setToast({
      id: Date.now(),
      tone,
      message,
    });
  };

  /** 更新单个标签的编辑态。 */
  const setPromptTabEditing = (promptTabId: string, editing: EditingState | null) => {
    setEditingMap((current) => ({
      ...current,
      [promptTabId]: editing,
    }));
  };

  /** 执行一次正文提取并同步 UI 状态。 */
  const runExtraction = async (nextMethod: ExtractionMethod, source: SidebarExtractionSource) => {
    setState('extracting');
    const extraction = await api.reExtractContent({
      tabId,
      pageUrl,
      method: nextMethod,
      source,
    });
    setContent(extraction.payload.content);
    setMethod(extraction.payload.extractionMethod);
    setState('ready');
  };

  /** 复制当前提取内容。 */
  const handleCopyExtraction = async () => {
    if (!normalizedExtractionContent) {
      pushToast('error', t('sidebar.notice.emptyExtraction'));
      return;
    }

    try {
      await navigator.clipboard.writeText(normalizedExtractionContent);
      pushToast('success', t('sidebar.notice.copySuccess'));
    } catch {
      pushToast('error', t('sidebar.notice.copyFailed'));
    }
  };

  /** 按当前方法重新提取。 */
  const handleReExtract = async () => {
    try {
      await runExtraction(method, 'manual_reextract');
      pushToast(
        'success',
        method === 'readability' ? t('sidebar.notice.switchMethodReadability') : t('sidebar.notice.switchMethodJina'),
      );
    } catch {
      setState('error');
      pushToast('error', t('sidebar.notice.reExtractFailed'));
    }
  };

  /** 清空当前页面缓存与会话，但保留各标签本地草稿。 */
  const handleClearPageContext = async () => {
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
      pushToast('success', t('sidebar.notice.clearPageSuccess'));
      if (state !== 'blocked') {
        setState('ready');
      }
    } catch {
      pushToast('error', t('sidebar.notice.clearPageFailed'));
    }
  };

  /** 打开历史页。 */
  const handleOpenHistoryPage = async () => {
    try {
      await api.openHistoryPage();
    } catch {
      pushToast('error', t('sidebar.notice.openHistoryFailed'));
    }
  };

  /** 打开设置页。 */
  const handleOpenSettingsPage = async () => {
    try {
      await api.openSettingsPage();
    } catch {
      pushToast('error', t('sidebar.notice.openSettingsFailed'));
    }
  };

  /** 打开 GitHub 仓库。 */
  const handleOpenGithubProject = async () => {
    try {
      await api.openGithubProject();
    } catch {
      pushToast('error', t('sidebar.notice.openGithubFailed'));
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
        const parsed = sidebarPortEventSchema.safeParse(event);
        if (!parsed.success) {
          return;
        }

        const payload = parsed.data;
        if (!('promptTabId' in payload)) {
          return;
        }
        const promptTabId = payload.promptTabId;

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
                  branches:
                    typeof payload.branchId === 'string' && typeof payload.modelId === 'string' && typeof payload.modelLabel === 'string'
                      ? [
                          ...(message?.branches.filter((branch) => branch.id !== payload.branchId) ?? []),
                          {
                            id: payload.branchId,
                            modelId: payload.modelId,
                            modelLabel: payload.modelLabel,
                            isPrimary: true,
                            content: message?.branches.find((branch) => branch.id === payload.branchId)?.content ?? '',
                            status: 'loading',
                            errorMessage: null,
                          },
                        ]
                      : message?.branches ?? [],
                  selectedBranchId: message?.selectedBranchId ?? (typeof payload.branchId === 'string' ? payload.branchId : null),
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
                  content:
                    typeof payload.branchId === 'string' && (message?.selectedBranchId === payload.branchId || (!message?.selectedBranchId && message?.branches[0]?.id === payload.branchId))
                      ? `${message?.content ?? ''}${payload.chunk as string}`
                      : message?.content ?? '',
                  status: 'loading',
                  errorMessage: null,
                  branches:
                    typeof payload.branchId === 'string'
                      ? [
                          ...(message?.branches.filter((branch) => branch.id !== payload.branchId) ?? []),
                          {
                            id: payload.branchId,
                            modelId: message?.branches.find((branch) => branch.id === payload.branchId)?.modelId ?? '',
                            modelLabel: message?.branches.find((branch) => branch.id === payload.branchId)?.modelLabel ?? t('workspace.status.primaryBranch'),
                            isPrimary: message?.branches.find((branch) => branch.id === payload.branchId)?.isPrimary ?? true,
                            content: `${message?.branches.find((branch) => branch.id === payload.branchId)?.content ?? ''}${payload.chunk as string}`,
                            status: 'loading',
                            errorMessage: null,
                          },
                        ]
                      : message?.branches ?? [],
                  selectedBranchId: message?.selectedBranchId ?? (typeof payload.branchId === 'string' ? payload.branchId : null),
                })),
              );
            }
            return;
          case 'CHAT_STREAM_FINISHED':
            if (typeof payload.messageId === 'string') {
              setPromptTabMessages(promptTabId, (current) =>
                upsertAssistantMessage(current, payload.messageId as string, (message) => ({
                  id: payload.messageId as string,
                  role: 'assistant',
                  content: message?.content ?? '',
                  status: 'done',
                  errorMessage: null,
                  branches:
                    typeof payload.branchId === 'string'
                      ? (message?.branches ?? []).map((branch) =>
                          branch.id === payload.branchId
                            ? {
                                ...branch,
                                status: 'done',
                                errorMessage: null,
                              }
                            : branch,
                        )
                      : message?.branches ?? [],
                  selectedBranchId: message?.selectedBranchId ?? (typeof payload.branchId === 'string' ? payload.branchId : null),
                })),
              );
            }
            return;
          case 'CHAT_STREAM_FAILED':
            if (
              payload.rollbackOnFailure === true
              && typeof payload.userMessageId === 'string'
            ) {
              setPromptTabMessages(promptTabId, (current) =>
                current.filter((message) => message.id !== payload.messageId && message.id !== payload.userMessageId),
              );
              setPromptTabNotice(promptTabId, t('workspace.notice.sendFailed'));
              return;
            }
            if (typeof payload.messageId === 'string') {
              setPromptTabMessages(promptTabId, (current) =>
                upsertAssistantMessage(current, payload.messageId as string, (message) => ({
                  id: payload.messageId as string,
                  role: 'assistant',
                  content: message?.content ?? '',
                  status: 'error',
                  errorMessage: typeof payload.errorMessage === 'string' ? (payload.errorMessage as string) : t('workspace.status.error'),
                  branches:
                    typeof payload.branchId === 'string'
                      ? (message?.branches ?? []).map((branch) =>
                          branch.id === payload.branchId
                            ? {
                                ...branch,
                                status: 'error',
                                errorMessage: typeof payload.errorMessage === 'string' ? (payload.errorMessage as string) : t('workspace.status.error'),
                              }
                            : branch,
                        )
                      : message?.branches ?? [],
                  selectedBranchId: message?.selectedBranchId ?? (typeof payload.branchId === 'string' ? payload.branchId : null),
                })),
              );
            }
            return;
          case 'CHAT_STREAM_CANCELLED':
            if (typeof payload.messageId === 'string') {
              setPromptTabMessages(promptTabId, (current) =>
                upsertAssistantMessage(current, payload.messageId as string, (message) => ({
                  id: payload.messageId as string,
                  role: 'assistant',
                  content: message?.content ?? '',
                  status: 'cancelled',
                  errorMessage: t('workspace.status.cancelled'),
                  branches:
                    typeof payload.branchId === 'string'
                      ? (message?.branches ?? []).map((branch) =>
                          branch.id === payload.branchId
                            ? {
                                ...branch,
                                status: 'cancelled',
                                errorMessage: t('workspace.status.cancelled'),
                              }
                            : branch,
                        )
                      : message?.branches ?? [],
                  selectedBranchId: message?.selectedBranchId ?? (typeof payload.branchId === 'string' ? payload.branchId : null),
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
                  isPrimary: branch?.isPrimary ?? false,
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
                  modelLabel: branch?.modelLabel ?? t('workspace.status.branch'),
                  isPrimary: branch?.isPrimary ?? false,
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
                  modelLabel: branch?.modelLabel ?? t('workspace.status.branch'),
                  isPrimary: branch?.isPrimary ?? false,
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
                  modelLabel: branch?.modelLabel ?? t('workspace.status.branch'),
                  isPrimary: branch?.isPrimary ?? false,
                  content: branch?.content ?? '',
                  status: 'error',
                  errorMessage: typeof payload.errorMessage === 'string' ? (payload.errorMessage as string) : t('workspace.status.error'),
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
                  modelLabel: branch?.modelLabel ?? t('workspace.status.branch'),
                  isPrimary: branch?.isPrimary ?? false,
                  content: branch?.content ?? '',
                  status: 'cancelled',
                  errorMessage: t('workspace.status.cancelled'),
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
                  branches: current.find((message) => message.id === payload.messageId)?.branches ?? [],
                  selectedBranchId: current.find((message) => message.id === payload.messageId)?.selectedBranchId ?? null,
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
              setRestoreMessageIds((current) => ({
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
        const [bootstrap, configResponse, resources] = await Promise.all([
          api.getSidebarBootstrap({ tabId, pageUrl }),
          api.getConfig(),
          loadWorkspaceLocaleResources(),
        ]);
        if (cancelled) {
          return;
        }

        const nextLocaleCode = configResponse.config.basic.language as WorkspaceLocaleCode;
        const nextMethod = bootstrap.page?.extractionMethod ?? 'readability';
        const nextModels = toModelOptions(getEnabledCompleteModels(configResponse.config));
        const fallbackModelId =
          nextModels.find((model) => model.id === configResponse.config.basic.defaultModelId)?.id ?? nextModels[0]?.id ?? '';
        const nextPromptTabs = buildPromptTabs({
          page: bootstrap.page,
          quickInputs: configResponse.config.quickInputs,
          models: nextModels,
          fallbackModelId,
          chatLabel: resources.t('workspace.chatTab', nextLocaleCode),
        });
        const nextMessageMap = buildMessageStateMap(nextPromptTabs, bootstrap.conversations);
        const nextActiveSessionIds = buildActiveSessionIdMap(nextPromptTabs, bootstrap.loadingStates);

        setLocaleResources(resources);
        setLocaleCode(nextLocaleCode);
        setMethod(nextMethod);
        setContent(bootstrap.page?.content ?? '');
        setModels(nextModels);
        setPromptTabs(nextPromptTabs);
        setComposerMap(buildComposerStateMap(nextPromptTabs));
        setMessageMap(nextMessageMap);
        setRestoreMessageIds(
          buildRestoreMessageIdMap({
            promptTabs: nextPromptTabs,
            conversations: bootstrap.conversations,
            loadingStates: bootstrap.loadingStates,
          }),
        );
        setActiveSessionIds(nextActiveSessionIds);
        setChatNotices({});
        setEditingMap(Object.fromEntries(nextPromptTabs.map((promptTab) => [promptTab.id, null])));
        setActivePromptTabId(pickInitialPromptTabId(nextPromptTabs, bootstrap.loadingStates));
        setIncludePageContent(bootstrap.page?.includePageContent ?? configResponse.config.basic.includePageContentByDefault);
        setExtractionPanelHeight(clampExtractionPanelHeight(configResponse.config.basic.extractionPanelHeight));
        setExtractionTextFontSize(configResponse.config.basic.extractionTextFontSize);
        setAssistantMarkdownDisplayConfig(configResponse.config.display.assistantMarkdown);

        if (bootstrap.blockedByBlacklist) {
          setState('blocked');
          return;
        }

        if (!bootstrap.shouldExtract) {
          setState('ready');
          if ((bootstrap.page?.content ?? '').trim()) {
            void (async () => {
              for (const promptTab of nextPromptTabs) {
                if (!promptTab.autoTrigger) {
                  continue;
                }
                if (!shouldTriggerPromptTab(promptTab, nextMessageMap[promptTab.id] ?? [], nextActiveSessionIds[promptTab.id] ?? null)) {
                  continue;
                }
                await handleTriggerPromptTab(promptTab);
              }
            })();
          }
          return;
        }

        setState('extracting');
        const extraction = await api.reExtractContent({
          tabId,
          pageUrl,
          method: nextMethod,
          source: 'panel_bootstrap',
        });
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
    const firstPromptTab = promptTabs[0];
    if (!firstPromptTab) {
      return;
    }
    setActivePromptTabId(firstPromptTab.id);
  }, [activePromptTabId, promptTabs]);

  /** 黑名单放行后继续当前页面提取。 */
  const handleConfirmContinue = async () => {
    await api.confirmBlacklistContinue({ tabId, pageUrl });
    try {
      await runExtraction(method, 'blacklist_continue');
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
      await api.switchExtractionMethod({ tabId, pageUrl, method: nextMethod });
      await runExtraction(nextMethod, 'manual_reextract');
      pushToast(
        'success',
        nextMethod === 'readability' ? t('sidebar.notice.switchMethodReadability') : t('sidebar.notice.switchMethodJina'),
      );
    } catch {
      setState('error');
      pushToast('error', t('sidebar.notice.switchMethodFailed'));
    }
  };

  /** 发送用户消息，并在本地先补一条乐观消息。 */
  const handleSend = async (
    promptTabId: string,
    input: {
      text: string;
      displayText?: string;
      images: string[];
      modelId: string;
      includePageContent: boolean;
      rollbackOnFailure?: boolean;
    },
  ) => {
    setPromptTabNotice(promptTabId, '');
    const optimisticUserMessageId = `local-user:${promptTabId}:${Date.now()}`;
    const optimisticDisplayContent = input.displayText ?? toOptimisticUserContent(input.text, input.images);
    setPromptTabMessages(promptTabId, (current) => [
      ...current,
      {
        id: optimisticUserMessageId,
        role: 'user',
        content: input.text,
        ...(optimisticDisplayContent !== input.text ? { displayContent: optimisticDisplayContent } : {}),
        status: 'done',
        errorMessage: null,
        branches: [],
        selectedBranchId: null,
      },
    ]);

    try {
      const request = {
        tabId,
        pageUrl,
        promptTabId,
        modelId: input.modelId,
        text: input.text,
        images: input.images,
        includePageContent: input.includePageContent,
      } as {
        tabId: number;
        pageUrl: string;
        promptTabId: string;
        modelId: string;
        text: string;
        images: string[];
        includePageContent: boolean;
        displayText?: string;
        rollbackOnFailure?: boolean;
      };
      if (input.displayText !== undefined) {
        request.displayText = input.displayText;
      }
      if (input.rollbackOnFailure !== undefined) {
        request.rollbackOnFailure = input.rollbackOnFailure;
      }
      const response = await api.sendChat(request);
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
        const persistedUserMessageId = response.payload.userMessageId;
        const messagesWithPersistedUserId =
          persistedUserMessageId === null
            ? current
            : current.map((message) =>
                message.id === optimisticUserMessageId
                  ? {
                      ...message,
                      id: persistedUserMessageId,
                    }
                  : message,
              );
        return appendAssistantBranches(
          upsertAssistantMessage(messagesWithPersistedUserId, response.payload.messageId, (message) => ({
            id: response.payload.messageId,
            role: 'assistant',
            content: message?.content ?? '',
            status: 'loading',
            errorMessage: null,
            branches: message?.branches ?? [],
            selectedBranchId: response.payload.branchId,
          })),
          response.payload.messageId,
          (response.payload.branches ?? [
            {
              branchId: response.payload.branchId,
              modelId: response.payload.modelId,
              modelLabel: response.payload.modelLabel,
            },
          ]).map((branch) => ({
            id: branch.branchId,
            modelId: branch.modelId,
            modelLabel: branch.modelLabel,
            isPrimary: branch.branchId === response.payload.branchId,
          })),
        );
      });
    } catch {
      setPromptTabMessages(promptTabId, (current) => current.filter((message) => message.id !== optimisticUserMessageId));
      setPromptTabNotice(promptTabId, t('workspace.notice.sendFailed'));
    }
  };

  /** 判断当前 promptTab 是否应直接触发快捷输入请求。 */
  const shouldTriggerPromptTab = (promptTab: PromptTabDefinition, messages: ChatMessageState[], sessionId: string | null) =>
    promptTab.id !== CHAT_PROMPT_TAB_ID && Boolean(promptTab.triggerPrompt) && messages.length === 0 && !sessionId;

  /** 直接发送快捷输入提示词，并把消息展示为快捷输入名称。 */
  const handleTriggerPromptTab = async (promptTab: PromptTabDefinition) => {
    if (!promptTab.triggerPrompt) {
      return;
    }

    if (!normalizeExtractionText(content)) {
      try {
        await runExtraction(method, 'prompt_tab_click');
      } catch {
        setState('error');
        setPromptTabNotice(promptTab.id, t('sidebar.notice.reExtractFailed'));
        return;
      }
    }

    await handleSend(promptTab.id, {
      text: promptTab.triggerPrompt,
      displayText: promptTab.name,
      images: [],
      modelId: promptTab.preferredModelId,
      includePageContent: true,
      rollbackOnFailure: true,
    });
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
        return appendAssistantBranches(
          [
            ...current.slice(0, targetIndex + 1).map((message) =>
              message.id === messageId
                ? {
                    ...omitMessageDisplayContent(message),
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
              selectedBranchId: response.payload.branchId,
            },
          ],
          response.payload.messageId,
          (response.payload.branches ?? [
            {
              branchId: response.payload.branchId,
              modelId: response.payload.modelId,
              modelLabel: response.payload.modelLabel,
            },
          ]).map((branch) => ({
            id: branch.branchId,
            modelId: branch.modelId,
            modelLabel: branch.modelLabel,
            isPrimary: branch.branchId === response.payload.branchId,
          })),
        );
      });
    } catch {
      setPromptTabNotice(promptTabId, t('workspace.notice.editFailed'));
    }
  };

  /** 重试用户消息，裁剪其后的结果并重新生成当前轮。 */
  const handleRetryUserMessage = async (promptTabId: string, messageId: string) => {
    try {
      setPromptTabNotice(promptTabId, '');
      const response = await api.retryUserMessage({
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
        const targetIndex = current.findIndex((message) => message.id === messageId && message.role === 'user');
        if (targetIndex < 0) {
          return current;
        }
        return appendAssistantBranches(
          [
            ...current.slice(0, targetIndex + 1),
            {
              id: response.payload.messageId,
              role: 'assistant',
              content: '',
              status: 'loading',
              errorMessage: null,
              branches: [],
              selectedBranchId: response.payload.branchId,
            },
          ],
          response.payload.messageId,
          (response.payload.branches ?? [
            {
              branchId: response.payload.branchId,
              modelId: response.payload.modelId,
              modelLabel: response.payload.modelLabel,
            },
          ]).map((branch) => ({
            id: branch.branchId,
            modelId: branch.modelId,
            modelLabel: branch.modelLabel,
            isPrimary: branch.branchId === response.payload.branchId,
          })),
        );
      });
    } catch {
      setPromptTabNotice(promptTabId, t('workspace.notice.retryFailed'));
    }
  };

  /** 重试目标助手分支。 */
  const handleRetryMessage = async (promptTabId: string, messageId: string, branchId: string) => {
    try {
      setPromptTabNotice(promptTabId, '');
      const response = await api.retryMessage({
        tabId,
        pageUrl,
        promptTabId,
        messageId,
        branchId,
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
        return current
          .slice(0, targetIndex + 1)
          .map((message) =>
            message.id === messageId && message.role === 'assistant'
              ? syncAssistantMessageState({
                  ...message,
                  branches: message.branches.map((branch) =>
                    branch.id === branchId
                      ? {
                          ...branch,
                          content: '',
                          status: 'loading',
                          errorMessage: null,
                        }
                      : branch,
                  ),
                })
              : message,
          );
      });
    } catch {
      setPromptTabNotice(promptTabId, t('workspace.notice.retryFailed'));
    }
  };

  /** 切换当前轮继续对话使用的主分支。 */
  const handleSelectAssistantBranch = async (promptTabId: string, messageId: string, branchId: string) => {
    try {
      setPromptTabNotice(promptTabId, '');
      await api.selectAssistantBranch({
        tabId,
        pageUrl,
        promptTabId,
        messageId,
        branchId,
      });
      setPromptTabMessages(promptTabId, (current) =>
        current.map((message) =>
          message.id === messageId && message.role === 'assistant'
            ? syncAssistantMessageState({
                ...message,
                selectedBranchId: branchId,
              })
            : message,
        ),
      );
    } catch {
      setPromptTabNotice(promptTabId, t('workspace.notice.selectPrimaryBranchFailed'));
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
      setPromptTabNotice(promptTabId, t('workspace.notice.clearTabSuccess'));
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
      setPromptTabNotice(promptTabId, t('workspace.notice.clearTabFailed'));
    }
  };

  /** 导出当前标签会话，空会话时直接拦截。 */
  const handleExport = async (promptTabId: string) => {
    const messages = messageMap[promptTabId] ?? [];
    const hasExportableMessage = messages.some((message) => message.content.trim().length > 0);
    if (!hasExportableMessage) {
      setPromptTabNotice(promptTabId, t('workspace.notice.emptyExport'));
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
      setPromptTabNotice(promptTabId, t('workspace.notice.exportFailed'));
    }
  };

  /** 针对既有助手消息继续新增分支。 */
  const handleExpandBranches = async (promptTabId: string, messageId: string, modelId: string) => {
    try {
      setPromptTabNotice(promptTabId, '');
      const response = await api.expandMessageBranches({
        tabId,
        pageUrl,
        promptTabId,
        messageId,
        modelId,
      });
      setPromptTabMessages(promptTabId, (current) =>
        appendAssistantBranches(
          current,
          messageId,
          response.payload.branches.map((branch) => ({
            id: branch.branchId,
            modelId: branch.modelId,
            modelLabel: branch.modelLabel,
          })),
        ),
      );
    } catch {
      setPromptTabNotice(promptTabId, t('workspace.notice.expandBranchFailed'));
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
      setPromptTabNotice(promptTabId, t('workspace.notice.stopBranchFailed'));
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
        current.flatMap((message) => {
          if (message.id !== messageId || message.role !== 'assistant') {
            return [message];
          }
          if (message.branches.length <= 1) {
            return [];
          }
          return [
            syncAssistantMessageState({
              ...message,
              branches: message.branches.filter((branch) => branch.id !== branchId),
            }),
          ];
        }),
      );
    } catch {
      setPromptTabNotice(promptTabId, t('workspace.notice.deleteBranchFailed'));
    }
  };

  return (
    <main
      data-testid="sidebar-shell"
      className="flex h-screen min-h-0 flex-col overflow-hidden bg-[linear-gradient(180deg,var(--color-background)_0%,var(--color-muted)_100%)] text-foreground"
    >
      <ToastStack toasts={toast ? [toast] : []} />
      <header className="shrink-0 border-b border-border bg-card/90 px-3 py-1.5 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1">
            <Tooltip content={t('sidebar.method.readability')}>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('sidebar.method.readability')}
                aria-pressed={method === 'readability'}
                className={cn(
                  'border border-transparent',
                  method === 'readability' && 'border-primary/30 bg-primary/10 text-primary',
                )}
                onClick={() => void handleSwitchMethod('readability')}
              >
                <FileTextIcon />
              </Button>
            </Tooltip>
            <Tooltip content={t('sidebar.method.jina')}>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('sidebar.method.jina')}
                aria-pressed={method === 'jina'}
                className={cn('border border-transparent', method === 'jina' && 'border-primary/30 bg-primary/10 text-primary')}
                onClick={() => void handleSwitchMethod('jina')}
              >
                <span className="text-[11px] font-semibold leading-none">J</span>
              </Button>
            </Tooltip>
            <Tooltip content={t('sidebar.action.copyExtraction')}>
              <Button type="button" variant="outline" size="icon-sm" aria-label={t('sidebar.action.copyExtraction')} onClick={() => void handleCopyExtraction()}>
                <CopyIcon />
              </Button>
            </Tooltip>
            <Tooltip content={t('sidebar.action.reExtract')}>
              <Button type="button" variant="outline" size="icon-sm" aria-label={t('sidebar.action.reExtract')} onClick={() => void handleReExtract()}>
                <RefreshCcwIcon />
              </Button>
            </Tooltip>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-1">
            <MiniConfirm
              message={t('sidebar.notice.clearPageConfirm')}
              cancelLabel={t('common.cancel')}
              confirmLabel={t('sidebar.action.clearPage')}
              contentTestId="clear-page-confirm"
              onConfirm={handleClearPageContext}
            >
              <Tooltip content={t('sidebar.action.clearPage')}>
                <Button type="button" variant="outline" size="icon-sm" aria-label={t('sidebar.action.clearPage')}>
                  <Trash2Icon />
                </Button>
              </Tooltip>
            </MiniConfirm>
            <Tooltip content={t('sidebar.action.openHistory')}>
              <Button type="button" variant="outline" size="icon-sm" aria-label={t('sidebar.action.openHistory')} onClick={() => void handleOpenHistoryPage()}>
                <HistoryIcon />
              </Button>
            </Tooltip>
            <Tooltip content={t('sidebar.action.openSettings')}>
              <Button type="button" variant="outline" size="icon-sm" aria-label={t('sidebar.action.openSettings')} onClick={() => void handleOpenSettingsPage()}>
                <Settings2Icon />
              </Button>
            </Tooltip>
            <Tooltip content={t('sidebar.action.openGithub')}>
              <Button type="button" variant="outline" size="icon-sm" aria-label={t('sidebar.action.openGithub')} onClick={() => void handleOpenGithubProject()}>
                <ExternalLinkIcon />
              </Button>
            </Tooltip>
          </div>
        </div>
      </header>

      <section
        data-testid="sidebar-extraction-panel"
        className="shrink-0 overflow-y-auto border-b border-border bg-background/80 px-3 py-1.5"
        style={{ height: `${extractionPanelHeight}px` }}
      >
        {normalizedExtractionContent ? (
          <pre
            data-testid="sidebar-extraction-content"
            className={cn('m-0 whitespace-pre-wrap break-words text-foreground', extractionTextClassName)}
          >
            {normalizedExtractionContent}
          </pre>
        ) : null}
        {!normalizedExtractionContent && state === 'bootstrapping' ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <WorkspaceStatusGlyph label={t('sidebar.state.bootstrapping')} status="loading" className="size-4" />
              <span>{t('sidebar.state.bootstrapping')}</span>
            </div>
          </div>
        ) : null}
        {!normalizedExtractionContent && state === 'blocked' ? (
          <div className="flex h-full items-center justify-center">
            <div className="grid max-w-sm gap-3 border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
              <div className="flex items-center gap-2">
                <ShieldAlertIcon className="size-4" />
                <span className="font-medium">{t('sidebar.state.blockedTitle')}</span>
              </div>
              <p className="m-0 text-xs text-amber-800">{t('sidebar.state.blockedDescription')}</p>
              <div>
                <Button type="button" size="sm" onClick={() => void handleConfirmContinue()}>
                  <SparklesIcon data-icon="inline-start" />
                  {t('sidebar.action.continueExtraction')}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
        {!normalizedExtractionContent && state === 'extracting' ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-primary">
              <WorkspaceStatusGlyph label={t('sidebar.state.extracting')} status="loading" className="size-4" />
              <span>{t('sidebar.state.extracting')}</span>
            </div>
          </div>
        ) : null}
        {!normalizedExtractionContent && state === 'error' ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-destructive">
              <WorkspaceStatusGlyph label={t('sidebar.state.error')} status="error" className="size-4" />
              <span>{t('sidebar.state.error')}</span>
            </div>
          </div>
        ) : null}
      </section>

      <div className="shrink-0 border-b border-border px-3 py-0.5">
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label={t('sidebar.resizeExtraction')}
          data-testid="sidebar-extraction-resize-handle"
          className="mx-auto h-1.5 w-10 cursor-row-resize bg-border transition-colors hover:bg-primary/40"
          onPointerDown={(event) => {
            setExtractionResizeState({
              startY: event.clientY,
              startHeight: extractionPanelHeight,
            });
          }}
        />
      </div>

      <section role="tablist" aria-label={t('sidebar.tablistLabel')} className="shrink-0 border-b border-border bg-muted/20 px-3 py-[3px]">
        <div className="flex flex-wrap gap-1">
          {promptTabs.map((promptTab) => {
            const status = getPromptTabStatusKind(promptTab, activeSessionIds[promptTab.id] ?? null);
            const statusKey = getPromptTabStatusLabelKey(status);
            const statusLabel = statusKey ? t(statusKey) : promptTab.name;
            const isActive = promptTab.id === activePromptTabId;
            const hasPromptTabText = promptTabHasContent(messageMap[promptTab.id] ?? []);
            const showLoadingRing = status === 'loading' || status === 'auto-running';

            return (
              <button
                key={promptTab.id}
                id={`sidebar-tab-${promptTab.id}`}
                role="tab"
                aria-selected={isActive}
                aria-controls={`sidebar-tabpanel-${promptTab.id}`}
                type="button"
                title={statusKey ? `${promptTab.name} · ${statusLabel}` : promptTab.name}
                className={cn(
                  'relative inline-flex items-center gap-1.5 overflow-hidden border px-1.5 py-[2px] text-left text-[11px] shadow-sm transition-colors',
                  showLoadingRing && 'tab-loading-border border-transparent',
                  isActive
                    ? showLoadingRing
                      ? 'bg-primary/10 text-foreground'
                      : 'border-primary/30 bg-primary/10 text-foreground'
                    : showLoadingRing
                      ? 'bg-background/90 text-foreground hover:bg-muted'
                      : 'border-border bg-background/90 hover:bg-muted',
                )}
                onClick={() => {
                  setActivePromptTabId(promptTab.id);
                  if (state === 'bootstrapping' || state === 'extracting' || state === 'blocked') {
                    return;
                  }
                  if (!shouldTriggerPromptTab(promptTab, messageMap[promptTab.id] ?? [], activeSessionIds[promptTab.id] ?? null)) {
                    return;
                  }
                  void handleTriggerPromptTab(promptTab);
                }}
              >
                {showLoadingRing ? (
                  <span data-testid={`prompt-tab-loading-${promptTab.id}`} className="sr-only">
                    {statusLabel}
                  </span>
                ) : null}

                <span className="relative z-10 truncate">{promptTab.name}</span>

                {hasPromptTabText && !showLoadingRing ? (
                  <span
                    data-testid={`prompt-tab-line-${promptTab.id}`}
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-[linear-gradient(90deg,#38bdf8_0%,#34d399_100%)]"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      {activeChatNotice ? (
        <div className="shrink-0 border-b border-border px-3 py-1">
          <Badge variant="outline">{activeChatNotice}</Badge>
        </div>
      ) : null}

      <section className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {promptTabs.map((promptTab) => (
          <div
            key={promptTab.id}
            id={`sidebar-tabpanel-${promptTab.id}`}
            role="tabpanel"
            aria-labelledby={`sidebar-tab-${promptTab.id}`}
            hidden={promptTab.id !== activePromptTabId}
            className={promptTab.id === activePromptTabId ? 'flex h-full min-h-0 min-w-0 flex-col' : 'hidden'}
          >
            <ChatThread
              messages={messageMap[promptTab.id] ?? []}
              restoreMessageId={restoreMessageIds[promptTab.id] ?? null}
              editingMessageId={editingMap[promptTab.id]?.messageId ?? null}
              editingText={editingMap[promptTab.id]?.text ?? ''}
              availableBranchModels={models.map((model) => ({ id: model.id, name: model.name }))}
              t={t}
              assistantMarkdownDisplayConfig={assistantMarkdownDisplayConfig}
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
              onRetryUserMessage={(messageId) => handleRetryUserMessage(promptTab.id, messageId)}
              onRetryAssistantMessage={(messageId, branchId) => handleRetryMessage(promptTab.id, messageId, branchId)}
              onSelectAssistantBranch={(messageId, branchId) => handleSelectAssistantBranch(promptTab.id, messageId, branchId)}
              onExpandBranches={(messageId, modelId) => handleExpandBranches(promptTab.id, messageId, modelId)}
              onStop={() => handleStop(promptTab.id, activeSessionIds[promptTab.id] ?? null)}
              onStopBranch={(_messageId, branchId) => handleStopBranch(promptTab.id, branchId)}
              onDeleteBranch={(messageId, branchId) => handleDeleteBranch(promptTab.id, messageId, branchId)}
              onOpenBranchPreview={(messageId, branchId) => setBranchPreviewTarget({ promptTabId: promptTab.id, messageId, branchId })}
              onNotice={(notice) => setPromptTabNotice(promptTab.id, notice)}
            />
          </div>
        ))}
      </section>

      <BranchPreviewOverlay
        open={branchPreview !== null}
        preview={branchPreview}
        t={t}
        assistantMarkdownDisplayConfig={assistantMarkdownDisplayConfig}
        onClose={() => setBranchPreviewTarget(null)}
      />

      <ChatInput
        disabled={state === 'bootstrapping' || state === 'extracting' || state === 'blocked' || !activePromptTab}
        sending={Boolean(activeSessionId)}
        text={activeComposer.text}
        images={activeComposer.images}
        includePageContent={includePageContent}
        selectedModelId={activeComposer.selectedModelId}
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

/** 判断标签是否已有可见文本内容。 */
const promptTabHasContent = (messages: ChatMessageState[]) =>
  messages.some((message) => {
    if ((message.displayContent ?? message.content).trim()) {
      return true;
    }

    return message.branches.some((branch) => branch.content.trim().length > 0);
  });
