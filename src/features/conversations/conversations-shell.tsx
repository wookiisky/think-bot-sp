import { useEffect, useMemo, useState } from 'react';
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
import { getEnabledCompleteModels } from '../../domain/config/config-schema';
import { cn } from '../../lib/utils';
import { COMPACT_HEADER_CLASS, COMPACT_ROW_BUTTON_CLASS, COMPACT_WORKBENCH_CLASS } from '../../ui/compact-layout';
import { buildPromptTabs, toModelOptions, type ModelOption, type PromptTabDefinition } from '../workspace/workspace-state';
import { createConversationsWorkspaceTransport } from '../workspace/workspace-transport';
import { useWorkspaceController } from '../workspace/use-workspace-controller';
import { usePageScope } from '../workspace/use-page-scope';
import { useDragResize } from '../workspace/use-drag-resize';
import { useWorkspaceDisplayConfig } from '../workspace/use-workspace-display-config';
import { useWorkspaceToast } from '../workspace/use-workspace-toast';
import { WorkspaceWorkbench } from '../workspace/workspace-workbench';
import {
  WORKSPACE_HORIZONTAL_RESIZE_HANDLE_CLASS,
  WORKSPACE_VERTICAL_RESIZE_HANDLE_CLASS,
} from '../workspace/workspace-resize-handle-style';
import type { SidebarConversationRecord, SidebarLoadingStateRecord, SidebarPageRecord } from '../../services/runtime-messaging/sidebar-contract';
import { toPageSummary } from '../../domain/page/page-summary';
import {
  createWorkspaceTranslator,
  loadWorkspaceLocaleResources,
  type WorkspaceLocaleCode,
} from '../workspace/workspace-copy';
import { normalizeExtractionText } from '../workspace/extraction-text';
import type { ConversationsApi } from './conversations-api';
import { useHistoryPages } from './use-history-pages';

type ConversationsShellProps = {
  /** conversations 页 API。 */
  api: ConversationsApi;
};

type DetailStatus = 'idle' | 'loading' | 'ready' | 'error';

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
const DEFAULT_SIDEBAR_WIDTH = 332;
/** 左侧历史栏最大宽度。 */
const MAX_SIDEBAR_WIDTH = 520;

/** 限制左侧栏宽度。 */
const clampSidebarWidth = (width: number) => Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));

/** conversations 历史工作台。 */
export const ConversationsShell = ({ api }: ConversationsShellProps) => {
  const [localeResources, setLocaleResources] = useState<ReturnType<typeof loadWorkspaceLocaleResources>>(loadWorkspaceLocaleResources());
  const [localeCode, setLocaleCode] = useState<WorkspaceLocaleCode>('zh-CN');
  const { pages, searchQuery, setSearchQuery, selectedPageUrl, selectPage, pageUpdated, pageDeleted, status: listStatus } = useHistoryPages({ api });
  const isCurrentPage = usePageScope(selectedPageUrl);
  const [detailStatus, setDetailStatus] = useState<DetailStatus>('idle');
  const [detail, setDetail] = useState<PageDetailState>({
    page: null,
    conversations: [],
    loadingStates: [],
  });
  const { toast, pushToast, pushWorkspaceToast } = useWorkspaceToast();
  const display = useWorkspaceDisplayConfig();
  const sidebarPanel = useDragResize({ axis: 'x', initialSize: DEFAULT_SIDEBAR_WIDTH, clamp: clampSidebarWidth });
  const [titleDraft, setTitleDraft] = useState('');
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const t = useMemo(() => createWorkspaceTranslator(localeResources, localeCode), [localeResources, localeCode]);
  const selectedPage = detail.page?.normalizedUrl === selectedPageUrl && detailStatus === 'ready' ? detail.page : null;
  const transport = useMemo(() => selectedPage ? createConversationsWorkspaceTransport({ api, pageUrl: selectedPage.url, normalizedUrl: selectedPage.normalizedUrl }) : null, [api, selectedPage?.url, selectedPage?.normalizedUrl]);
  const workspace = useWorkspaceController({
    pageKey: selectedPageUrl, transport, t,
    onToast: pushWorkspaceToast,
  });

  const visiblePromptTabs = selectedPage && workspace.view.ready ? workspace.view.promptTabs : [];
  const normalizedExtractionContent = normalizeExtractionText(selectedPage?.content ?? '');

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
    /** 后台会话恢复超时。 */
    llmRequestTimeoutSeconds: number;
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
    workspace.restore({
      pageKey: selectedPageUrl!, promptTabs: nextPromptTabs, models: input.models,
      conversations: input.detail.conversations, loadingStates: input.detail.loadingStates,
      activePromptTabId: input.activePromptTabId,
      includePageContent: input.detail.page?.includePageContent ?? input.defaultIncludePageContent,
      llmRequestTimeoutSeconds: input.llmRequestTimeoutSeconds,
    });
    setTitleDraft(input.detail.page?.title ?? '');
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [configResponse, resources] = await Promise.all([
        api.getConfig(),
        loadWorkspaceLocaleResources(),
      ]);
      if (cancelled) {
        return;
      }

      const nextLocaleCode = configResponse.config.basic.language as WorkspaceLocaleCode;

      setLocaleResources(resources);
      setLocaleCode(nextLocaleCode);
      display.applyConfig(configResponse.config);
      setConfigLoaded(true);

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
    if (!selectedPageUrl || !configLoaded) {
      if (!selectedPageUrl) {
        setDetail({ page: null, conversations: [], loadingStates: [] });
        workspace.reset();
      }
      return;
    }

    let cancelled = false;
    const loadDetail = async () => {
      setDetailStatus('loading');
      setIsTitleEditing(false);
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
        display.applyConfig(configResponse.config);
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
          llmRequestTimeoutSeconds: configResponse.config.basic.llmRequestTimeoutSeconds,
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

  /** 复制提取内容。 */
  const handleCopyExtraction = async () => {
    if (!isCurrentPage() || !selectedPage) return;
    if (!normalizedExtractionContent) {
      pushToast('error', t('conversations.notice.emptyExtraction'));
      return;
    }

    try {
      await navigator.clipboard.writeText(normalizedExtractionContent);
      if (!isCurrentPage()) return;
      pushToast('success', t('conversations.notice.copySuccess'));
    } catch {
      if (!isCurrentPage()) return;
      pushToast('error', t('conversations.notice.copyFailed'));
    }
  };

  /** 打开原网页。 */
  const handleOpenSourcePage = async () => {
    if (!isCurrentPage() || !selectedPage) return;
    if (!detail.page) {
      return;
    }

    try {
      await api.openSourcePage(detail.page.url);
      if (!isCurrentPage()) return;
    } catch {
      if (!isCurrentPage()) return;
      pushToast('error', t('conversations.notice.openSourceFailed'));
    }
  };

  /** 保存标题。 */
  const saveTitle = async () => {
    if (!isCurrentPage() || !selectedPage) return;
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
      void pageUpdated(toPageSummary(response.page));
      if (!isCurrentPage()) return;
      setDetail((current) => ({
        ...current,
        page: response.page,
      }));
      setTitleDraft(response.page.title);
      setIsTitleEditing(false);
    } catch {
      if (!isCurrentPage()) return;
      setTitleDraft(detail.page.title);
      setIsTitleEditing(false);
      pushToast('error', t('conversations.notice.titleSaveFailed'));
    }
  };

  /** 手动点击快捷输入标签时，直接发送对应提示词。 */
  const handleTriggerPromptTab = async (promptTab: PromptTabDefinition) => {
    if (!isCurrentPage() || !selectedPage) return;
    if (!promptTab.triggerPrompt) {
      return;
    }

    await workspace.actions.send(promptTab.id, {
      text: promptTab.triggerPrompt,
      displayText: promptTab.name,
      images: [],
      modelId: promptTab.preferredModelId,
      includePageContent: true,
    });
    if (!isCurrentPage()) return;
  };

  /** 删除当前页面。 */
  const handleDeletePage = async (normalizedUrl: string) => {
    if (!isCurrentPage()) return;
    try {
      const response = await api.deletePage(normalizedUrl);
      void pageDeleted(normalizedUrl);
      if (!isCurrentPage()) return;
      pushToast(
        'success',
        response.payload.deleteMode === 'soft'
          ? t('conversations.notice.pageDeletedSoft')
          : t('conversations.notice.pageDeletedHard'),
      );
    } catch {
      if (!isCurrentPage()) return;
      pushToast('error', t('conversations.notice.pageDeleteFailed'));
    }
  };

  return (
    <main
      data-testid="conversations-shell"
      data-theme={display.themeRootAttributes.dataTheme}
      data-resolved-theme={display.themeRootAttributes.dataResolvedTheme}
      className={cn('flex', COMPACT_WORKBENCH_CLASS)}
    >
      <ToastStack toasts={toast ? [toast] : []} />
      <aside
        data-testid="conversations-sidebar"
        className="flex shrink-0 flex-col border-r border-border/70"
        style={{ width: `${sidebarPanel.size}px` }}
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
                  onClick={() => selectPage(page.normalizedUrl)}
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
        onPointerDown={sidebarPanel.startDrag}
      />

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header
          data-testid="conversations-detail-header"
          className="shrink-0 border-b border-border px-2 py-1.5"
        >
          {selectedPage ? (
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
                          setTitleDraft(selectedPage?.title ?? '');
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
                      {selectedPage.title || selectedPage.url}
                    </button>
                  )}
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{selectedPage.url}</p>
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
              {(detailStatus === 'error' || listStatus === 'error') ? t('conversations.state.loadFailed') : t('conversations.state.selectPage')}
            </div>
          )}
        </header>

        <section
          data-testid="conversations-extraction-panel"
          className={cn(
            'box-border shrink-0 border-b border-border',
            display.extractionPanel.isCollapsed ? 'overflow-hidden px-0 py-0' : 'overflow-y-auto px-3 py-2',
          )}
          style={{ height: `${display.extractionPanel.height}px` }}
        >
          {selectedPageUrl && !selectedPage && detailStatus !== 'error' ? (
            <div className="flex items-center gap-2 text-sm text-primary">
              <LoaderCircleIcon className="size-4 animate-spin" />
              <span>{t('conversations.state.bootstrapping')}</span>
            </div>
          ) : null}
          {normalizedExtractionContent ? (
            <article
              data-testid="conversations-extraction-content"
              className={cn('whitespace-pre-wrap', display.extractionTextClassName)}
            >
              {normalizedExtractionContent}
            </article>
          ) : null}
          {selectedPage && !normalizedExtractionContent ? <p className="text-sm text-muted-foreground">{t('conversations.state.noContent')}</p> : null}
        </section>

        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label={t('conversations.resizeExtraction')}
          data-testid="conversations-extraction-resize-handle"
          className={WORKSPACE_HORIZONTAL_RESIZE_HANDLE_CLASS}
          onPointerDown={display.extractionPanel.startDrag}
        />

        <WorkspaceWorkbench
          idPrefix="conversations"
          tablistLabel={t('conversations.tablistLabel')}
          workspace={workspace}
          visiblePromptTabs={visiblePromptTabs}
          t={t}
          canTriggerPromptTab
          composerDisabled={!selectedPage}
          assistantMarkdownDisplayConfig={display.assistantMarkdownDisplayConfig}
          assistantBranchColumnWidth={display.assistantBranchColumnWidth}
          onTriggerPromptTab={handleTriggerPromptTab}
          onToast={pushWorkspaceToast}
        />
      </section>
    </main>
  );
};
