import { useEffect, useRef, useState } from 'react';
import {
  CopyIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
  SearchIcon,
  Settings2Icon,
  Trash2Icon,
} from 'lucide-react';

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
  COMPACT_HEADER_CLASS,
  COMPACT_PROMPT_TAB_CLASS,
  COMPACT_ROW_BUTTON_CLASS,
  COMPACT_WORKBENCH_CLASS,
  getCompactPromptTabStateClass,
} from '../../ui/compact-layout';
import { type ThemePreference, useDocumentTheme } from '../../ui/theme-mode';
import { downloadTextFile } from '../../shared/download-file';
import {
  CHAT_PROMPT_TAB_ID,
  appendAssistantBranches,
  buildActiveSessionIdMap,
  buildComposerStateMap,
  buildMessageStateMap,
  buildPromptTabs,
  buildRestoreMessageIdMap,
  findBranchPreviewDetail,
  getPromptTabStatusKind,
  omitMessageDisplayContent,
  toModelOptions,
  toOptimisticUserContent,
  type ChatMessageState,
  type ComposerState,
  type EditingState,
  type ModelOption,
  type PromptTabDefinition,
  upsertAssistantFailure,
  syncAssistantMessageState,
  upsertAssistantBranch,
  upsertAssistantMessage,
} from '../workspace/workspace-state';
import { BranchPreviewOverlay } from '../workspace/branch-preview-overlay';
import {
  WORKSPACE_HORIZONTAL_RESIZE_HANDLE_CLASS,
  WORKSPACE_VERTICAL_RESIZE_HANDLE_CLASS,
} from '../workspace/workspace-resize-handle-style';
import type { SidebarConversationRecord, SidebarLoadingStateRecord, SidebarPageRecord } from '../../services/runtime-messaging/sidebar-contract';
import { ChatInput } from '../sidebar/chat-input';
import { ChatThread } from '../sidebar/chat-thread';
import {
  createWorkspaceTranslator,
  getPromptTabStatusLabelKey,
  loadWorkspaceLocaleResources,
  type WorkspaceLocaleCode,
} from '../workspace/workspace-copy';
import { normalizeExtractionText } from '../workspace/extraction-text';
import type { WorkspaceToastPayload } from '../workspace/workspace-toast';
import type { ConversationsApi } from './conversations-api';
import { getExtractionTextClassName } from '../../lib/extraction-text-font-size';
import { sidebarPortEventSchema } from '../../services/runtime-messaging/sidebar-contract';

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

type ExtractionResizeState = {
  /** 拖拽开始时的鼠标纵坐标。 */
  startY: number;
  /** 拖拽开始时的提取区高度。 */
  startHeight: number;
};

type PageDetailState = {
  /** 当前页面记录。 */
  page: SidebarPageRecord | null;
  /** 当前页面会话。 */
  conversations: SidebarConversationRecord[];
  /** 当前页面 loading。 */
  loadingStates: SidebarLoadingStateRecord[];
};
type BranchPreviewTarget = {
  /** 所属 promptTab id。 */
  promptTabId: string;
  /** 所属助手消息 id。 */
  messageId: string;
  /** 目标分支 id。 */
  branchId: string;
};
type ConversationsToast = {
  /** toast 稳定 id。 */
  id: number;
  /** 反馈语气。 */
  tone: 'success' | 'error';
  /** 反馈正文。 */
  message: string;
};

/** 左侧历史栏最小宽度。 */
const MIN_SIDEBAR_WIDTH = 280;
/** 左侧历史栏默认宽度。 */
const DEFAULT_SIDEBAR_WIDTH = 332;
/** 左侧历史栏最大宽度。 */
const MAX_SIDEBAR_WIDTH = 520;

/** 限制左侧栏宽度。 */
const clampSidebarWidth = (width: number) => Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
/** 限制提取区高度范围。 */
const clampExtractionPanelHeight = (height: number) =>
  Math.min(MAX_EXTRACTION_PANEL_HEIGHT, Math.max(MIN_EXTRACTION_PANEL_HEIGHT, height));

/** 把未知错误收敛为当前回复可展示文案。 */
const getReplyErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message.trim() ? error.message : fallback;

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
  const [toast, setToast] = useState<ConversationsToast | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [extractionPanelHeight, setExtractionPanelHeight] = useState(DEFAULT_EXTRACTION_PANEL_HEIGHT);
  const [extractionTextFontSize, setExtractionTextFontSize] = useState<ExtractionTextFontSize>(DEFAULT_EXTRACTION_TEXT_FONT_SIZE);
  const [assistantMarkdownDisplayConfig, setAssistantMarkdownDisplayConfig] = useState<AssistantMarkdownDisplayConfig>(
    DEFAULT_ASSISTANT_MARKDOWN_DISPLAY_CONFIG,
  );
  const [themePreference, setThemePreference] = useState<ThemePreference>('system');
  const [sidebarResizeState, setSidebarResizeState] = useState<SidebarResizeState | null>(null);
  const [extractionResizeState, setExtractionResizeState] = useState<ExtractionResizeState | null>(null);
  const [branchPreviewTarget, setBranchPreviewTarget] = useState<BranchPreviewTarget | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const themeRootAttributes = useDocumentTheme(themePreference);
  const terminalSessionIdsRef = useRef<Set<string>>(new Set());
  const t = createWorkspaceTranslator(localeResources, localeCode);

  const selectedPage = pages.find((page) => page.normalizedUrl === selectedPageUrl) ?? detail.page ?? null;
  const activePromptTab = promptTabs.find((promptTab) => promptTab.id === activePromptTabId) ?? null;
  const activeComposer = activePromptTab ? composerMap[activePromptTab.id] ?? null : null;
  const activeSessionId = activePromptTab ? activeSessionIds[activePromptTab.id] ?? null : null;
  const normalizedExtractionContent = normalizeExtractionText(detail.page?.content ?? '');
  const extractionTextClassName = getExtractionTextClassName(extractionTextFontSize);
  const isExtractionPanelCollapsed = extractionPanelHeight <= MIN_EXTRACTION_PANEL_HEIGHT;
  const branchPreview =
    branchPreviewTarget
      ? findBranchPreviewDetail(
          messageMap[branchPreviewTarget.promptTabId] ?? [],
          branchPreviewTarget.messageId,
          branchPreviewTarget.branchId,
        )
      : null;

  /** 更新单个标签的消息列表。 */
  const setPromptTabMessages = (promptTabId: string, update: (_current: ChatMessageState[]) => ChatMessageState[]) => {
    setMessageMap((current) => ({
      ...current,
      [promptTabId]: update(current[promptTabId] ?? []),
    }));
  };

  /** 标记会话重新进入活动态。 */
  const markSessionActive = (sessionId: string) => {
    terminalSessionIdsRef.current.delete(sessionId);
  };

  /** 标记会话已进入终态，防止较晚的命令响应覆盖最终 UI。 */
  const markSessionTerminal = (sessionId: string) => {
    terminalSessionIdsRef.current.add(sessionId);
  };

  /** 判断命令响应对应的会话是否已经被流式事件置为终态。 */
  const hasTerminalSession = (sessionId: string) => terminalSessionIdsRef.current.has(sessionId);

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

  /** 推送页面级 toast。 */
  const pushToast = (tone: ConversationsToast['tone'], message: string) => {
    setToast({
      id: Date.now(),
      tone,
      message,
    });
  };

  /** 推送工作台一次性 toast。 */
  const pushWorkspaceToast = (nextToast: WorkspaceToastPayload) => {
    pushToast(nextToast.tone, nextToast.message);
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
    setActivePromptTabId(input.activePromptTabId);
    setIncludePageContent(input.detail.page?.includePageContent ?? input.defaultIncludePageContent);
    setTitleDraft(input.detail.page?.title ?? '');
  };

  useEffect(() => {
    if (branchPreviewTarget && !branchPreview) {
      setBranchPreviewTarget(null);
    }
  }, [branchPreview, branchPreviewTarget]);

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
      setExtractionPanelHeight(clampExtractionPanelHeight(configResponse.config.basic.extractionPanelHeight));
      setExtractionTextFontSize(configResponse.config.basic.extractionTextFontSize);
      setAssistantMarkdownDisplayConfig(configResponse.config.display.assistantMarkdown);
      setThemePreference(configResponse.config.basic.theme);
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
        const firstPage = response.pages[0];
        if (!firstPage) {
          setSelectedPageUrl(null);
          return;
        }
        setSelectedPageUrl(firstPage.normalizedUrl);
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
        setExtractionPanelHeight(clampExtractionPanelHeight(configResponse.config.basic.extractionPanelHeight));
        setExtractionTextFontSize(configResponse.config.basic.extractionTextFontSize);
        setAssistantMarkdownDisplayConfig(configResponse.config.display.assistantMarkdown);
        setThemePreference(configResponse.config.basic.theme);
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
            markSessionActive(payload.sessionId);
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
                          durationMs: null,
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
                content:
                  typeof payload.branchId === 'string' &&
                  (message?.selectedBranchId === payload.branchId || (!message?.selectedBranchId && message?.branches[0]?.id === payload.branchId))
                    ? `${message?.content ?? ''}${payload.chunk}`
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
                          content: `${message?.branches.find((branch) => branch.id === payload.branchId)?.content ?? ''}${payload.chunk}`,
                          status: 'loading',
                          errorMessage: null,
                          durationMs: message?.branches.find((branch) => branch.id === payload.branchId)?.durationMs ?? null,
                        },
                      ]
                    : message?.branches ?? [],
                selectedBranchId: message?.selectedBranchId ?? (typeof payload.branchId === 'string' ? payload.branchId : null),
              })),
            );
          }
          return;
        case 'CHAT_STREAM_FINISHED':
          if (typeof payload.sessionId === 'string') {
            markSessionTerminal(payload.sessionId);
          }
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
                              durationMs: payload.durationMs,
                            }
                          : branch,
                      )
                    : message?.branches ?? [],
                selectedBranchId: message?.selectedBranchId ?? (typeof payload.branchId === 'string' ? payload.branchId : null),
              })),
            );
          }
          return;
        case 'CHAT_STREAM_FAILED': {
          setActiveSessionIds((current) => ({
            ...current,
            [promptTabId]: null,
          }));
          setRestoreMessageIds((current) => ({
            ...current,
            [promptTabId]: null,
          }));
          if (typeof payload.sessionId === 'string') {
            markSessionTerminal(payload.sessionId);
          }
          const chatFailureMessage = payload.errorMessage;
          if (typeof payload.messageId === 'string') {
            setPromptTabMessages(promptTabId, (current) =>
              upsertAssistantFailure(current, {
                messageId: payload.messageId as string,
                branchId: typeof payload.branchId === 'string' ? (payload.branchId as string) : `${payload.messageId as string}:primary`,
                errorMessage: chatFailureMessage,
                modelId: '',
                modelLabel: t('workspace.status.primaryBranch'),
                isPrimary: true,
                durationMs: payload.durationMs,
              }),
            );
          }
          return;
        }
        case 'CHAT_STREAM_CANCELLED':
          if (typeof payload.sessionId === 'string') {
            markSessionTerminal(payload.sessionId);
          }
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
                errorMessage: t('workspace.status.cancelled'),
                branches:
                  typeof payload.branchId === 'string'
                    ? (message?.branches ?? []).map((branch) =>
                        branch.id === payload.branchId
                          ? {
                              ...branch,
                              status: 'cancelled',
                              errorMessage: t('workspace.status.cancelled'),
                              durationMs: payload.durationMs,
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
              upsertAssistantBranch(current, payload.messageId, payload.branchId, (branch) => ({
                id: payload.branchId,
                modelId: payload.modelId,
                modelLabel: payload.modelLabel,
                isPrimary: branch?.isPrimary ?? false,
                content: branch?.content ?? '',
                status: 'loading',
                errorMessage: null,
                durationMs: null,
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
                isPrimary: branch?.isPrimary ?? false,
                content: `${branch?.content ?? ''}${payload.chunk}`,
                status: 'loading',
                errorMessage: null,
                durationMs: branch?.durationMs ?? null,
              })),
            );
          }
          return;
        case 'BRANCH_STREAM_FINISHED':
        case 'BRANCH_STREAM_FAILED':
        case 'BRANCH_STREAM_CANCELLED':
          if (typeof payload.messageId === 'string' && typeof payload.branchId === 'string') {
            const branchFailureMessage =
              payload.type === 'BRANCH_STREAM_FAILED' ? payload.errorMessage : t('workspace.status.cancelled');
            setPromptTabMessages(promptTabId, (current) =>
              payload.type === 'BRANCH_STREAM_FAILED'
                ? upsertAssistantFailure(current, {
                    messageId: payload.messageId,
                    branchId: payload.branchId,
                    errorMessage: branchFailureMessage,
                    modelId: '',
                    modelLabel: t('workspace.status.branch'),
                    isPrimary: false,
                    durationMs: payload.durationMs,
                  })
                : upsertAssistantBranch(current, payload.messageId, payload.branchId, (branch) => ({
                    id: payload.branchId,
                    modelId: branch?.modelId ?? '',
                    modelLabel: branch?.modelLabel ?? t('workspace.status.branch'),
                    isPrimary: branch?.isPrimary ?? false,
                    content: branch?.content ?? '',
                    status: payload.type === 'BRANCH_STREAM_FINISHED' ? 'done' : 'cancelled',
                    errorMessage: payload.type === 'BRANCH_STREAM_CANCELLED' ? t('workspace.status.cancelled') : null,
                    durationMs: payload.durationMs,
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
                content: payload.content,
                status: 'loading',
                errorMessage: null,
                branches: message?.branches ?? [],
                selectedBranchId: message?.selectedBranchId ?? null,
              })),
            );
          }
          return;
        case 'LOADING_STATE_UPDATE':
          if (typeof payload.status === 'string' && payload.status !== 'loading') {
            if (typeof payload.sessionId === 'string') {
              markSessionTerminal(payload.sessionId);
            }
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
    return () => {
      port.onMessage?.removeListener?.(handlePortMessage as never);
      port.disconnect();
    };
  }, [activePromptTab, api, selectedPage]);

  /** 复制提取内容。 */
  const handleCopyExtraction = async () => {
    if (!normalizedExtractionContent) {
      pushToast('error', t('conversations.notice.emptyExtraction'));
      return;
    }

    try {
      await navigator.clipboard.writeText(normalizedExtractionContent);
      pushToast('success', t('conversations.notice.copySuccess'));
    } catch {
      pushToast('error', t('conversations.notice.copyFailed'));
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
      pushToast('error', t('conversations.notice.openSourceFailed'));
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
      pushToast('error', t('conversations.notice.titleSaveFailed'));
    }
  };

  /** 发送消息。 */
  const handleSend = async (
    promptTabId: string,
    input: { text: string; displayText?: string; images: string[]; modelId: string; includePageContent: boolean },
  ) => {
    if (!selectedPage) {
      return;
    }

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
        pageUrl: selectedPage.url,
        promptTabId,
        modelId: input.modelId,
        text: input.text,
        images: input.images,
        includePageContent: input.includePageContent,
      } as {
        pageUrl: string;
        promptTabId: string;
        modelId: string;
        text: string;
        images: string[];
        includePageContent: boolean;
        displayText?: string;
      };
      if (input.displayText !== undefined) {
        request.displayText = input.displayText;
      }
      const response = await api.sendChat(request);
      const sessionAlreadyTerminal = hasTerminalSession(response.payload.sessionId);
      if (!sessionAlreadyTerminal) {
        setActiveSessionIds((current) => ({
          ...current,
          [promptTabId]: response.payload.sessionId,
        }));
        setRestoreMessageIds((current) => ({
          ...current,
          [promptTabId]: response.payload.messageId,
        }));
      }
      setIncludePageContent(input.includePageContent);
      setPromptTabMessages(promptTabId, (current) => {
        const persistedUserMessageId = response.payload.userMessageId;
        const messagesWithPersistedUserId =
          persistedUserMessageId === null
            ? current
            : current.map((message) => (message.id === optimisticUserMessageId ? { ...message, id: persistedUserMessageId } : message));
        if (sessionAlreadyTerminal) {
          return messagesWithPersistedUserId;
        }
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
    } catch (error) {
      const errorMessage = getReplyErrorMessage(error, t('workspace.notice.sendFailed'));
      const assistantMessageId = `local-assistant:${promptTabId}:${Date.now()}`;
      const branchId = `${assistantMessageId}:primary`;
      setActiveSessionIds((current) => ({
        ...current,
        [promptTabId]: null,
      }));
      setRestoreMessageIds((current) => ({
        ...current,
        [promptTabId]: null,
      }));
      setPromptTabMessages(promptTabId, (current) => [
        ...current,
        {
          id: assistantMessageId,
          role: 'assistant',
          content: errorMessage,
          status: 'error',
          errorMessage,
          branches: [
            {
              id: branchId,
              modelId: input.modelId,
              modelLabel: models.find((model) => model.id === input.modelId)?.name ?? t('workspace.status.primaryBranch'),
              isPrimary: true,
              content: errorMessage,
              status: 'error',
              errorMessage,
              durationMs: null,
            },
          ],
          selectedBranchId: branchId,
        },
      ]);
    }
  };

  /** 判断当前 promptTab 是否应直接触发快捷输入请求。 */
  const shouldTriggerPromptTab = (promptTab: PromptTabDefinition, messages: ChatMessageState[], sessionId: string | null) =>
    promptTab.id !== CHAT_PROMPT_TAB_ID && Boolean(promptTab.triggerPrompt) && messages.length === 0 && !sessionId;

  /** 手动点击快捷输入标签时，直接发送对应提示词。 */
  const handleTriggerPromptTab = async (promptTab: PromptTabDefinition) => {
    if (!promptTab.triggerPrompt) {
      return;
    }

    await handleSend(promptTab.id, {
      text: promptTab.triggerPrompt,
      displayText: promptTab.name,
      images: [],
      modelId: promptTab.preferredModelId,
      includePageContent: true,
    });
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
      pushToast('error', t('workspace.notice.editFailed'));
    }
  };

  /** 重试用户消息，裁剪其后的结果并重新生成当前轮。 */
  const handleRetryUserMessage = async (promptTabId: string, messageId: string) => {
    if (!selectedPage) {
      return;
    }

    try {
      const response = await api.retryUserMessage({
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
      pushToast('error', t('workspace.notice.retryFailed'));
    }
  };

  /** 重试目标助手分支。 */
  const handleRetryMessage = async (promptTabId: string, messageId: string, branchId: string) => {
    if (!selectedPage) {
      return;
    }

    try {
      const response = await api.retryMessage({
        pageUrl: selectedPage.url,
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
        return current.slice(0, targetIndex + 1).map((message) =>
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
                        durationMs: null,
                      }
                    : branch,
                ),
              })
            : message,
        );
      });
    } catch {
      pushToast('error', t('workspace.notice.retryFailed'));
    }
  };

  /** 切换当前轮继续对话使用的主分支。 */
  const handleSelectAssistantBranch = async (promptTabId: string, messageId: string, branchId: string) => {
    if (!selectedPage) {
      return;
    }

    try {
      await api.selectAssistantBranch({
        pageUrl: selectedPage.url,
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
      pushToast('error', t('workspace.notice.selectPrimaryBranchFailed'));
    }
  };

  /** 新增分支。 */
  const handleExpandBranches = async (promptTabId: string, messageId: string, modelId: string) => {
    if (!selectedPage) {
      return;
    }

    try {
      const response = await api.expandMessageBranches({
        pageUrl: selectedPage.url,
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
      pushToast('error', t('workspace.notice.expandBranchFailed'));
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
      pushToast('error', t('workspace.notice.stopBranchFailed'));
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
            ? syncAssistantMessageState({
                ...message,
                branches: message.branches.filter((branch) => branch.id !== branchId),
              })
            : message,
        ),
      );
    } catch {
      pushToast('error', t('workspace.notice.deleteBranchFailed'));
    }
  };

  /** 清空当前标签。 */
  const handleClearTabConversation = async (promptTabId: string) => {
    if (!selectedPage) {
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
      pushToast('success', t('workspace.notice.clearTabSuccess'));
    } catch {
      pushToast('error', t('workspace.notice.clearTabFailed'));
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
      pushToast('error', t('workspace.notice.emptyExport'));
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
      pushToast('error', t('workspace.notice.exportFailed'));
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
      pushToast(
        'success',
        response.payload.deleteMode === 'soft'
          ? t('conversations.notice.pageDeletedSoft')
          : t('conversations.notice.pageDeletedHard'),
      );
    } catch {
      pushToast('error', t('conversations.notice.pageDeleteFailed'));
    }
  };

  return (
    <main
      data-testid="conversations-shell"
      data-theme={themeRootAttributes.dataTheme}
      data-resolved-theme={themeRootAttributes.dataResolvedTheme}
      className={cn('flex', COMPACT_WORKBENCH_CLASS)}
    >
      <ToastStack toasts={toast ? [toast] : []} />
      <aside
        data-testid="conversations-sidebar"
        className="flex shrink-0 flex-col border-r border-border/70"
        style={{ width: `${sidebarWidth}px` }}
      >
        <header className={COMPACT_HEADER_CLASS}>
          <label className="flex items-center gap-1.5 border border-input px-2 py-1 text-xs text-muted-foreground">
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
            <div className="px-2 py-3 text-sm text-muted-foreground">
              {searchQuery.trim() ? t('conversations.emptySearch') : t('conversations.empty')}
            </div>
          ) : null}
          {pages.map((page) => {
            const isSelected = page.normalizedUrl === selectedPageUrl;
            const displayTitle = page.title.trim() || t('conversations.untitledPage');
            return (
              <div
                key={page.normalizedUrl}
                data-testid="conversations-page-item"
                className={cn(
                  'flex w-full items-center gap-1.5 border-b border-border px-2 py-1 text-left transition-colors',
                  isSelected && 'bg-primary/10',
                )}
              >
                <button
                  type="button"
                  className={cn(COMPACT_ROW_BUTTON_CLASS, 'flex flex-1 items-center gap-1.5')}
                  onClick={() => setSelectedPageUrl(page.normalizedUrl)}
                >
                  {page.faviconUrl ? (
                    <img src={page.faviconUrl} alt="" className="size-3.5 rounded-sm" />
                  ) : (
                    <span className="size-3.5 rounded-sm bg-border" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium leading-4">{displayTitle}</p>
                  </div>
                </button>
                <div className="flex shrink-0 gap-1">
                  <Tooltip content={t('conversations.action.openSource')}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`${t('conversations.action.openSource')} ${displayTitle}`}
                      onClick={() => {
                        void api.openSourcePage(page.url);
                      }}
                    >
                      <ExternalLinkIcon />
                    </Button>
                  </Tooltip>
                  <MiniConfirm
                    message={t('conversations.action.deletePage')}
                    cancelLabel={t('common.cancel')}
                    confirmLabel={t('conversations.action.deletePage')}
                    contentTestId={`delete-page-confirm-${page.normalizedUrl}`}
                    onConfirm={() => handleDeletePage(page.normalizedUrl)}
                  >
                    <Tooltip content={t('conversations.action.deletePage')}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`${t('conversations.action.deletePage')} ${displayTitle}`}
                      >
                        <Trash2Icon />
                      </Button>
                    </Tooltip>
                  </MiniConfirm>
                </div>
              </div>
            );
          })}
        </section>
      </aside>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t('conversations.resizeSidebar')}
        data-testid="conversations-sidebar-resize-handle"
        className={WORKSPACE_VERTICAL_RESIZE_HANDLE_CLASS}
        onPointerDown={(event) =>
          setSidebarResizeState({
            startX: event.clientX,
            startWidth: sidebarWidth,
          })
        }
      />

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header
          data-testid="conversations-detail-header"
          className="shrink-0 border-b border-border px-2 py-1.5"
        >
          {detail.page ? (
            <div className="space-y-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {isTitleEditing ? (
                    <input
                      aria-label={t('conversations.editTitle')}
                      className="w-full border border-input bg-background px-2 py-1 text-base font-semibold outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
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
                    <button
                      type="button"
                      aria-label={t('conversations.editTitle')}
                      data-testid="conversations-detail-title"
                      className="text-left text-base font-semibold"
                      onClick={() => setIsTitleEditing(true)}
                    >
                      {detail.page.title || detail.page.url}
                    </button>
                  )}
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail.page.url}</p>
                </div>
                <div className="flex gap-1">
                  <Tooltip content={t('conversations.action.copyExtraction')}>
                    <Button type="button" variant="outline" size="icon-sm" aria-label={t('conversations.action.copyExtraction')} onClick={() => void handleCopyExtraction()}>
                      <CopyIcon />
                    </Button>
                  </Tooltip>
                  <Tooltip content={t('conversations.action.openSource')}>
                    <Button type="button" variant="outline" size="icon-sm" aria-label={t('conversations.action.openSource')} onClick={() => void handleOpenSourcePage()}>
                      <ExternalLinkIcon />
                    </Button>
                  </Tooltip>
                  <Tooltip content={t('conversations.action.openSettings')}>
                    <Button type="button" variant="outline" size="icon-sm" aria-label={t('conversations.action.openSettings')} onClick={() => void api.openSettingsPage()}>
                      <Settings2Icon />
                    </Button>
                  </Tooltip>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {detailStatus === 'error' ? t('conversations.state.loadFailed') : t('conversations.state.selectPage')}
            </div>
          )}
        </header>

        <section
          data-testid="conversations-extraction-panel"
          className={cn(
            'box-border shrink-0 border-b border-border',
            isExtractionPanelCollapsed ? 'overflow-hidden px-0 py-0' : 'overflow-y-auto px-3 py-2',
          )}
          style={{ height: `${extractionPanelHeight}px` }}
        >
          {detailStatus === 'loading' && !detail.page ? (
            <div className="flex items-center gap-2 text-sm text-primary">
              <LoaderCircleIcon className="size-4 animate-spin" />
              <span>{t('conversations.state.bootstrapping')}</span>
            </div>
          ) : null}
          {normalizedExtractionContent ? (
            <article
              data-testid="conversations-extraction-content"
              className={cn('whitespace-pre-wrap', extractionTextClassName)}
            >
              {normalizedExtractionContent}
            </article>
          ) : null}
          {detail.page && !normalizedExtractionContent ? <p className="text-sm text-muted-foreground">{t('conversations.state.noContent')}</p> : null}
        </section>

        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label={t('conversations.resizeExtraction')}
          data-testid="conversations-extraction-resize-handle"
          className={WORKSPACE_HORIZONTAL_RESIZE_HANDLE_CLASS}
          onPointerDown={(event) => {
            setExtractionResizeState({
              startY: event.clientY,
              startHeight: extractionPanelHeight,
            });
          }}
        />

        <section role="tablist" aria-label={t('conversations.tablistLabel')} className="shrink-0 border-b border-border px-2 py-[3px]">
          <div className="flex flex-wrap gap-1">
            {promptTabs.map((promptTab) => {
              const isActive = promptTab.id === activePromptTabId;
              const status = getPromptTabStatusKind(promptTab, activeSessionIds[promptTab.id] ?? null);
              const statusKey = getPromptTabStatusLabelKey(status);
              const statusLabel = statusKey ? t(statusKey) : promptTab.name;
              const hasPromptTabText = promptTabHasContent(messageMap[promptTab.id] ?? []);
              const showLoadingRing = status === 'loading' || status === 'auto-running';

              return (
                <button
                  key={promptTab.id}
                  id={`conversations-tab-${promptTab.id}`}
                  role="tab"
                  aria-selected={isActive}
                  type="button"
                  title={statusKey ? `${promptTab.name} · ${statusLabel}` : promptTab.name}
                  className={cn(
                    COMPACT_PROMPT_TAB_CLASS,
                    getCompactPromptTabStateClass({ isActive, showLoadingRing }),
                  )}
                  onClick={() => {
                    setActivePromptTabId(promptTab.id);
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
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-primary"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>

        <section className="min-h-0 min-w-0 flex-1 overflow-hidden">
          {promptTabs.map((promptTab) => (
            <div
              key={promptTab.id}
              role="tabpanel"
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
                onToast={pushWorkspaceToast}
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
          onToast={pushWorkspaceToast}
        />

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

/** 判断标签是否已有可见文本内容。 */
const promptTabHasContent = (messages: ChatMessageState[]) =>
  messages.some((message) => {
    if ((message.displayContent ?? message.content).trim()) {
      return true;
    }

    return message.branches.some((branch) => branch.content.trim().length > 0);
  });
