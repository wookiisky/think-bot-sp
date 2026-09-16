import { useEffect, useMemo, useState } from 'react';
import { createLogger, describeError } from '../../services/logger/logger';
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

import { Button } from '../../components/ui/button';
import { MiniConfirm } from '../../components/ui/mini-confirm';
import { ToastStack } from '../../components/ui/toast-stack';
import { Tooltip } from '../../components/ui/tooltip';
import { getEnabledCompleteModels } from '../../domain/config/config-schema';
import { cn } from '../../lib/utils';
import { COMPACT_HEADER_CLASS, COMPACT_WORKBENCH_CLASS } from '../../ui/compact-layout';
import {
  buildActiveSessionIdMap,
  buildMessageStateMap,
  buildPromptTabs,
  createChatPromptTab,
  pickInitialPromptTabId,
  shouldTriggerPromptTab,
  toModelOptions,
  type PromptTabDefinition,
} from '../workspace/workspace-state';
import { createSidebarWorkspaceTransport } from '../workspace/workspace-transport';
import { useWorkspaceController } from '../workspace/use-workspace-controller';
import { usePageScope } from '../workspace/use-page-scope';
import { useWorkspaceDisplayConfig } from '../workspace/use-workspace-display-config';
import { useWorkspaceToast } from '../workspace/use-workspace-toast';
import { WorkspaceWorkbench } from '../workspace/workspace-workbench';
import {
  createWorkspaceTranslator,
  loadWorkspaceLocaleResources,
  type WorkspaceLocaleCode,
} from '../workspace/workspace-copy';
import { WORKSPACE_HORIZONTAL_RESIZE_HANDLE_CLASS } from '../workspace/workspace-resize-handle-style';
import { normalizeExtractionText } from '../workspace/extraction-text';
import { WorkspaceStatusGlyph } from '../workspace/workspace-status';
import type { SidebarApi, SidebarExtractionSource } from './sidebar-api';

type ExtractionMethod = 'readability' | 'jina';
type SidebarState = 'bootstrapping' | 'blocked' | 'extracting' | 'ready' | 'error';
type SidebarShellProps = {
  /** side panel 消息 API。 */
  api: SidebarApi;
  /** 当前浏览器标签页 id。 */
  tabId: number;
  /** 当前页面 URL。 */
  pageUrl: string;
};

/** 提取方式二选一切换容器，和普通动作按钮保持视觉区分。 */
const EXTRACTION_METHOD_GROUP_CLASS =
  'inline-flex h-6 shrink-0 items-center overflow-hidden border border-border bg-muted/25 shadow-inner';

/** 提取方式切换按钮基础样式。 */
const EXTRACTION_METHOD_OPTION_CLASS =
  'size-6 rounded-none border-0 text-muted-foreground hover:bg-primary/8 hover:text-primary focus-visible:z-10 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:-translate-y-0';

/** 提取方式选中态，作为 segmented control 的滑块状态。 */
const EXTRACTION_METHOD_OPTION_ACTIVE_CLASS = 'bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground';

/** 首屏聊天标签默认文案。 */
const getDefaultChatTabLabel = (resources: ReturnType<typeof loadWorkspaceLocaleResources> | null, locale: WorkspaceLocaleCode) =>
  resources?.t('workspace.chatTab', locale) ?? 'Chat';

const logger = createLogger('sidebar');

/** 渲染阶段 5 的多 promptTab 侧边栏工作台。 */
export const SidebarShell = ({ api, tabId, pageUrl }: SidebarShellProps) => {
  const isCurrentPage = usePageScope(`${tabId}:${pageUrl}`);
  const [localeResources, setLocaleResources] = useState<ReturnType<typeof loadWorkspaceLocaleResources>>(loadWorkspaceLocaleResources());
  const [localeCode, setLocaleCode] = useState<WorkspaceLocaleCode>('zh-CN');
  const pageScope = useMemo(() => ({}), [tabId, pageUrl]);
  const [pageState, setPageState] = useState({ scope: pageScope, value: 'bootstrapping' as SidebarState });
  const state: SidebarState = pageState.scope === pageScope ? pageState.value : 'bootstrapping';
  /** 页面身份在渲染时生效，避免切页后的首帧继续显示旧的 ready 状态。 */
  const setState = (value: SidebarState) => setPageState({ scope: pageScope, value });
  const [content, setContent] = useState('');
  const [method, setMethod] = useState<ExtractionMethod>('readability');
  const { toast, pushToast, pushWorkspaceToast } = useWorkspaceToast();
  const display = useWorkspaceDisplayConfig();
  const t = useMemo(() => createWorkspaceTranslator(localeResources, localeCode), [localeResources, localeCode]);
  const transport = useMemo(() => createSidebarWorkspaceTransport({ api, tabId, pageUrl }), [api, tabId, pageUrl]);
  const workspace = useWorkspaceController({
    pageKey: `${tabId}:${pageUrl}`, transport, t,
    onToast: pushWorkspaceToast,
    initialPromptTabs: [createChatPromptTab('', getDefaultChatTabLabel(localeResources, localeCode))],
  });

  const visiblePromptTabs = workspace.view.ready ? workspace.view.promptTabs : [createChatPromptTab('', getDefaultChatTabLabel(localeResources, localeCode))];
  const normalizedExtractionContent = workspace.view.ready ? normalizeExtractionText(content) : '';
  const isExtracting = state === 'extracting';
  const canTriggerExtractionAction = state !== 'bootstrapping' && state !== 'blocked' && !isExtracting;
  const showExtractionStatusBar = isExtracting && !display.extractionPanel.isCollapsed && Boolean(normalizedExtractionContent);

  /** 执行一次正文提取并同步 UI 状态。 */
  const runExtraction = async (nextMethod: ExtractionMethod, source: SidebarExtractionSource) => {
    setState('extracting');
    const extraction = await api.reExtractContent({
      tabId,
      pageUrl,
      method: nextMethod,
      source,
    });
    if (isCurrentPage()) {
      setContent(extraction.payload.content);
      setMethod(extraction.payload.extractionMethod);
      setState('ready');
    }
    return extraction.payload;
  };

  /** 复制当前提取内容。 */
  const handleCopyExtraction = async () => {
    if (!isCurrentPage()) return;
    if (!normalizedExtractionContent) {
      pushToast('error', t('sidebar.notice.emptyExtraction'));
      return;
    }

    try {
      await navigator.clipboard.writeText(normalizedExtractionContent);
      if (!isCurrentPage()) return;
      pushToast('success', t('sidebar.notice.copySuccess'));
    } catch {
      if (!isCurrentPage()) return;
      pushToast('error', t('sidebar.notice.copyFailed'));
    }
  };

  /** 按当前方法重新提取。 */
  const handleReExtract = async () => {
    if (!isCurrentPage()) return;
    if (!canTriggerExtractionAction) {
      return;
    }

    try {
      await runExtraction(method, 'manual_reextract');
      if (!isCurrentPage()) return;
      pushToast(
        'success',
        method === 'readability' ? t('sidebar.notice.switchMethodReadability') : t('sidebar.notice.switchMethodJina'),
      );
    } catch {
      if (!isCurrentPage()) return;
      setState('error');
      pushToast('error', t('sidebar.notice.reExtractFailed'));
    }
  };

  /** 清空当前页面缓存与会话，但保留各标签本地草稿。 */
  const handleClearPageContext = async () => {
    if (!isCurrentPage()) return;
    try {
      await api.clearPageContext({ tabId, pageUrl });
      if (!isCurrentPage()) return;
      setContent('');
      workspace.clearPageMessages();
      pushToast('success', t('sidebar.notice.clearPageSuccess'));
      if (state !== 'blocked') {
        setState('ready');
      }
    } catch {
      if (!isCurrentPage()) return;
      pushToast('error', t('sidebar.notice.clearPageFailed'));
    }
  };

  /** 打开历史页。 */
  const handleOpenHistoryPage = async () => {
    if (!isCurrentPage()) return;
    try {
      await api.openHistoryPage();
      if (!isCurrentPage()) return;
    } catch {
      if (!isCurrentPage()) return;
      pushToast('error', t('sidebar.notice.openHistoryFailed'));
    }
  };

  /** 打开设置页。 */
  const handleOpenSettingsPage = async () => {
    if (!isCurrentPage()) return;
    try {
      await api.openSettingsPage();
      if (!isCurrentPage()) return;
    } catch {
      if (!isCurrentPage()) return;
      pushToast('error', t('sidebar.notice.openSettingsFailed'));
    }
  };

  /** 打开 GitHub 仓库。 */
  const handleOpenGithubProject = async () => {
    if (!isCurrentPage()) return;
    try {
      await api.openGithubProject();
      if (!isCurrentPage()) return;
    } catch {
      if (!isCurrentPage()) return;
      pushToast('error', t('sidebar.notice.openGithubFailed'));
    }
  };

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
        const nextMessageMap = buildMessageStateMap(nextPromptTabs, bootstrap.conversations, bootstrap.loadingStates);
        const nextActiveSessionIds = buildActiveSessionIdMap(nextPromptTabs, bootstrap.loadingStates);

        setLocaleResources(resources);
        setLocaleCode(nextLocaleCode);
        setMethod(nextMethod);
        setContent(bootstrap.page?.content ?? '');
        workspace.restore({
          pageKey: `${tabId}:${pageUrl}`, promptTabs: nextPromptTabs, models: nextModels,
          conversations: bootstrap.conversations, loadingStates: bootstrap.loadingStates,
          activePromptTabId: pickInitialPromptTabId(nextPromptTabs, bootstrap.loadingStates),
          includePageContent: bootstrap.page?.includePageContent ?? configResponse.config.basic.includePageContentByDefault,
          llmRequestTimeoutSeconds: configResponse.config.basic.llmRequestTimeoutSeconds,
        });
        display.applyConfig(configResponse.config);

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
                await handleTriggerPromptTab(promptTab, bootstrap.page?.content ?? '');
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
      } catch (error) {
        logger.error('sidebar.bootstrap.failed', { browserTabId: tabId, reason: describeError(error) });
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

  /** 黑名单放行后继续当前页面提取。 */
  const handleConfirmContinue = async () => {
    if (!isCurrentPage()) return;
    await api.confirmBlacklistContinue({ tabId, pageUrl });
    if (!isCurrentPage()) return;
    try {
      await runExtraction(method, 'blacklist_continue');
      if (!isCurrentPage()) return;
    } catch {
      if (!isCurrentPage()) return;
      setState('error');
    }
  };

  /** 切换提取方式，只读取对应方法的已有缓存。 */
  const handleSwitchMethod = async (nextMethod: ExtractionMethod) => {
    if (!isCurrentPage()) return;
    if (nextMethod === method || state === 'bootstrapping' || state === 'blocked' || isExtracting) {
      return;
    }

    const previousMethod = method;
    const previousContent = content;
    setMethod(nextMethod);
    setState('extracting');
    try {
      const response = await api.switchExtractionMethod({ tabId, pageUrl, method: nextMethod });
      if (!isCurrentPage()) return;
      setContent(response.payload.hasCachedContent ? response.payload.content : '');
      setMethod(response.payload.hasCachedContent ? response.payload.extractionMethod : response.payload.method);
      setState('ready');
    } catch {
      if (!isCurrentPage()) return;
      setMethod(previousMethod);
      setContent(previousContent);
      setState('error');
      pushToast('error', t('sidebar.notice.switchMethodFailed'));
    }
  };

  /** 直接发送快捷输入提示词，并把消息展示为快捷输入名称。 */
  const handleTriggerPromptTab = async (promptTab: PromptTabDefinition, pageContent = content) => {
    if (!isCurrentPage()) return;
    if (!promptTab.triggerPrompt) {
      return;
    }

    let requestPageContent = pageContent;
    if (!normalizeExtractionText(requestPageContent)) {
      try {
        const extraction = await runExtraction('readability', 'prompt_tab_click');
        if (!isCurrentPage()) return;
        requestPageContent = extraction.content;
      } catch {
        if (!isCurrentPage()) return;
        setState('error');
        pushToast('error', t('sidebar.notice.reExtractFailed'));
        return;
      }
    }

    if (!normalizeExtractionText(requestPageContent)) {
      pushToast('error', t('sidebar.notice.emptyExtraction'));
      return;
    }

    await workspace.actions.send(promptTab.id, {
      text: promptTab.triggerPrompt,
      displayText: promptTab.name,
      images: [],
      modelId: promptTab.preferredModelId,
      includePageContent: true,
      rollbackOnFailure: true,
    });
    if (!isCurrentPage()) return;
  };

  return (
    <main
      data-testid="sidebar-shell"
      data-theme={display.themeRootAttributes.dataTheme}
      data-resolved-theme={display.themeRootAttributes.dataResolvedTheme}
      className={cn('flex flex-col', COMPACT_WORKBENCH_CLASS)}
    >
      <ToastStack toasts={toast ? [toast] : []} />
      <header className={COMPACT_HEADER_CLASS}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1">
            <div role="group" aria-label={t('sidebar.method.group')} className={EXTRACTION_METHOD_GROUP_CLASS}>
              <Tooltip content={t('sidebar.method.readability')}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('sidebar.method.readability')}
                  aria-pressed={method === 'readability'}
                  className={cn(
                    EXTRACTION_METHOD_OPTION_CLASS,
                    'border-r border-border/80',
                    method === 'readability' && EXTRACTION_METHOD_OPTION_ACTIVE_CLASS,
                  )}
                  disabled={isExtracting}
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
                  className={cn(EXTRACTION_METHOD_OPTION_CLASS, method === 'jina' && EXTRACTION_METHOD_OPTION_ACTIVE_CLASS)}
                  disabled={isExtracting}
                  onClick={() => void handleSwitchMethod('jina')}
                >
                  <span className="text-[11px] font-semibold leading-none">J</span>
                </Button>
              </Tooltip>
            </div>
            <Tooltip content={t('sidebar.action.copyExtraction')}>
              <Button type="button" variant="outline" size="icon-sm" aria-label={t('sidebar.action.copyExtraction')} onClick={() => void handleCopyExtraction()}>
                <CopyIcon />
              </Button>
            </Tooltip>
            <Tooltip content={t('sidebar.action.reExtract')}>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={t('sidebar.action.reExtract')}
                disabled={!canTriggerExtractionAction}
                onClick={() => void handleReExtract()}
              >
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
        className={cn(
          'relative box-border shrink-0 border-b border-border',
          display.extractionPanel.isCollapsed ? 'overflow-hidden px-0 py-0' : 'overflow-y-auto px-3 py-1.5',
        )}
        style={{ height: `${display.extractionPanel.height}px` }}
      >
        {showExtractionStatusBar ? (
          <div
            aria-live="polite"
            data-testid="sidebar-extraction-loading-bar"
            className="sticky top-0 z-10 mb-1 flex h-6 items-center gap-2 border border-primary/30 bg-background/95 px-2 text-xs text-primary shadow-sm"
          >
            <WorkspaceStatusGlyph label={t('sidebar.state.extracting')} status="loading" className="size-3.5" />
            <span>{t('sidebar.state.extracting')}</span>
          </div>
        ) : null}
        {normalizedExtractionContent ? (
          <pre
            data-testid="sidebar-extraction-content"
            className={cn('m-0 whitespace-pre-wrap break-words text-foreground', display.extractionTextClassName)}
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
            <div className="grid max-w-sm gap-2.5 border border-amber-300/70 bg-amber-500/8 px-3 py-3 text-sm text-amber-900 dark:text-amber-300">
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
        {!normalizedExtractionContent && state === 'ready' ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileTextIcon className="size-4" />
              <span>{t('sidebar.state.emptyExtractionCache')}</span>
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

      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={t('sidebar.resizeExtraction')}
        data-testid="sidebar-extraction-resize-handle"
        className={WORKSPACE_HORIZONTAL_RESIZE_HANDLE_CLASS}
        onPointerDown={display.extractionPanel.startDrag}
      />

      <WorkspaceWorkbench
        idPrefix="sidebar"
        tablistLabel={t('sidebar.tablistLabel')}
        workspace={workspace}
        visiblePromptTabs={visiblePromptTabs}
        t={t}
        tabsDisabled={!workspace.view.ready}
        canTriggerPromptTab={state !== 'bootstrapping' && state !== 'extracting' && state !== 'blocked'}
        composerDisabled={!workspace.view.ready || state === 'bootstrapping' || state === 'extracting' || state === 'blocked'}
        assistantMarkdownDisplayConfig={display.assistantMarkdownDisplayConfig}
        assistantBranchColumnWidth={display.assistantBranchColumnWidth}
        onTriggerPromptTab={(promptTab) => handleTriggerPromptTab(promptTab)}
        onToast={pushWorkspaceToast}
      />
    </main>
  );
};
