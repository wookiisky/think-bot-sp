import { EXTENSION_PAGES } from '../../shared/extension-pages';
import { isRestrictedUrl, resolveWelcomeLocale } from '../../shared/browser-entry';
import { createBrowserEntryPanelState } from './browser-panel-state';
import { describeError, type Logger } from '../logger/logger';

const MENU_ID_CONVERSATIONS = 'open-conversations';

type BrowserEntryLogger = Pick<Logger, 'debug' | 'info' | 'warn'>;

type BrowserEntryDependencies = {
  /** 结构化日志。 */
  logger: BrowserEntryLogger;
  /** runtime 能力。 */
  runtime: typeof chrome.runtime;
  /** tabs 能力。 */
  tabs: typeof chrome.tabs;
  /** side panel 能力。 */
  sidePanel: typeof chrome.sidePanel;
  /** side panel 运行态。 */
  panelState: ReturnType<typeof createBrowserEntryPanelState>;
  /** contextMenus 能力。 */
  contextMenus: typeof chrome.contextMenus;
  /** 当前浏览器 UI 语言。 */
  getUiLocale: () => string;
};

type BrowserEntryTabUpdateInfo = {
  /** 变更后的 URL。 */
  url?: string;
  /** 标签页加载状态。 */
  status?: string;
};

type BrowserEntryActionResult =
  | {
      /** 结果类型。 */
      kind: 'sidepanel-opened';
      /** 目标标签页 id。 */
      tabId: number;
    }
  | {
      /** 结果类型。 */
      kind: 'options-opened';
      /** 新开页面 URL。 */
      url: string;
    }
  | {
      /** 结果类型。 */
      kind: 'conversations-opened';
      /** 新开页面 URL。 */
      url: string;
    };

type E2EBrowserActionMessage = {
  /** E2E 指令类型。 */
  type: '__E2E_BROWSER_ACTION_CLICK__';
  /** 目标标签页 id。 */
  tabId: number;
  /** 目标标签页 URL。 */
  pageUrl: string;
};

type BrowserActionClickSource = 'browser_action' | 'message_driver';

const stripLeadingSlash = (route: string) => (route.startsWith('/') ? route.slice(1) : route);

/** 判断 URL 是否允许启用 side panel；拿不到 URL 时按受限页保守处理。 */
const canEnableSidePanelForUrl = (rawUrl: string | undefined): rawUrl is string => {
  if (!rawUrl?.trim()) {
    return false;
  }

  return !isRestrictedUrl(rawUrl);
};

/** 创建浏览器入口服务，统一处理扩展按钮、右键菜单、安装和标签切换。 */
export const createBrowserEntryService = ({
  logger,
  runtime,
  tabs,
  sidePanel,
  panelState,
  contextMenus,
  getUiLocale,
}: BrowserEntryDependencies) => {
  let activeTabSyncVersion = 0;
  let latestActiveTabId: number | null = null;
  let latestActiveTabAllowsPanel: boolean | null = null;

  /** 开始一次活动标签页同步，用版本号隔离旧异步结果。 */
  const beginActiveTabSync = (tabId: number | null) => {
    activeTabSyncVersion += 1;
    latestActiveTabId = tabId;
    latestActiveTabAllowsPanel = null;
    return activeTabSyncVersion;
  };

  /** 判断活动标签页同步是否已经过期。 */
  const isStaleActiveTabSync = (version: number) => version !== activeTabSyncVersion;

  /** 判断过期同步启用的标签页是否需要补偿禁用。 */
  const shouldDisableStaleEnabledTab = (tabId: number) => latestActiveTabId !== tabId || latestActiveTabAllowsPanel !== true;

  /** 同步扩展按钮点击是否交给浏览器原生打开 side panel。 */
  const setActionClickOpensPanel = async (openPanelOnActionClick: boolean) => {
    if (!sidePanel.setPanelBehavior) {
      logger.warn('entry.action_behavior.unavailable');
      return;
    }

    await sidePanel.setPanelBehavior({
      openPanelOnActionClick,
    });
    logger.debug('entry.action_behavior.synced', { openPanelOnActionClick });
  };

  /** 生成扩展页 URL。 */
  const toExtensionUrl = (route: string, query?: string) => {
    const baseUrl = runtime.getURL(stripLeadingSlash(route));
    return query ? `${baseUrl}?${query}` : baseUrl;
  };

  /** 判断当前 URL 是否就是本扩展的指定页面。 */
  const isCurrentExtensionPage = (rawUrl: string, route: string) => {
    try {
      const currentUrl = new URL(rawUrl);
      const targetUrl = new URL(toExtensionUrl(route));
      return currentUrl.origin === targetUrl.origin && currentUrl.pathname === targetUrl.pathname;
    } catch {
      return false;
    }
  };

  /** 配置扩展按钮点击行为，使它匹配当前活动标签页。 */
  const configureActionClickBehavior = async () => {
    if (!tabs.query) {
      await setActionClickOpensPanel(false);
      logger.warn('entry.tabs_query.unavailable');
      return;
    }

    const syncVersion = beginActiveTabSync(null);
    try {
      const [activeTab] = await tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      if (isStaleActiveTabSync(syncVersion)) {
        return;
      }
      await syncSidePanelForActiveTab(activeTab, syncVersion);
    } catch (error) {
      if (!isStaleActiveTabSync(syncVersion)) {
        await setActionClickOpensPanel(false);
      }
      logger.warn('entry.active_tab_sync.failed', { reason: describeError(error) });
    }
  };

  /** 打开欢迎页。 */
  const openWelcomePage = async () => {
    const locale = resolveWelcomeLocale(getUiLocale());
    const url = toExtensionUrl(EXTENSION_PAGES.welcome, `locale=${encodeURIComponent(locale)}`);
    logger.info('entry.page.opened', { page: 'welcome', locale, url });
    await tabs.create({ url });
  };

  /** 打开 conversations 页面。 */
  const openConversationsPage = async (): Promise<BrowserEntryActionResult> => {
    const url = toExtensionUrl(EXTENSION_PAGES.conversations);
    logger.info('entry.page.opened', { page: 'conversations', url });
    await tabs.create({ url });
    return {
      kind: 'conversations-opened',
      url,
    };
  };

  /** 打开设置页。 */
  const openOptionsPage = async (): Promise<BrowserEntryActionResult> => {
    const url = toExtensionUrl(EXTENSION_PAGES.options);
    logger.info('entry.page.opened', { page: 'options', url });
    await tabs.create({ url });
    return {
      kind: 'options-opened',
      url,
    };
  };

  /** 为目标标签页启用 side panel。 */
  const openSidePanelForTab = async (tabId: number): Promise<BrowserEntryActionResult> => {
    const path = stripLeadingSlash(EXTENSION_PAGES.sidePanel);
    await sidePanel.setOptions({
      tabId,
      path,
      enabled: true,
    });
    await panelState.addEnabledTabId(tabId);
    logger.debug('panel.enabled', { browserTabId: tabId });
    return {
      kind: 'sidepanel-opened',
      tabId,
    };
  };

  /** 在真实扩展按钮用户手势内打开 side panel。 */
  const openSidePanelFromBrowserAction = async (tabId: number) => {
    if (!sidePanel.open) {
      logger.warn('panel.open.unavailable', { browserTabId: tabId });
      return;
    }

    await sidePanel.open({
      tabId,
    });
    logger.info('panel.opened', { browserTabId: tabId, via: 'browser_action' });
  };

  /** 禁用目标标签页的 side panel。 */
  const disableSidePanelForTab = async (tabId: number) => {
    await sidePanel.setOptions({
      tabId,
      enabled: false,
    });
    await panelState.removeEnabledTabId(tabId);
  };

  /** 按当前标签页 URL 同步 side panel 可用态。 */
  const syncSidePanelForActiveTab = async (tab: chrome.tabs.Tab | undefined, syncVersion: number) => {
    if (!tab?.id) {
      if (!isStaleActiveTabSync(syncVersion)) {
        latestActiveTabId = null;
        latestActiveTabAllowsPanel = false;
        await setActionClickOpensPanel(false);
      }
      return;
    }

    if (!canEnableSidePanelForUrl(tab.url)) {
      if (isStaleActiveTabSync(syncVersion)) {
        return;
      }
      latestActiveTabId = tab.id;
      latestActiveTabAllowsPanel = false;
      await setActionClickOpensPanel(false);
      await disableSidePanelForTab(tab.id).catch((error: unknown) => {
        logger.warn('panel.disable.failed', { browserTabId: tab.id, reason: describeError(error) });
      });
      if (isStaleActiveTabSync(syncVersion)) {
        return;
      }
      logger.debug('panel.disabled', { browserTabId: tab.id, url: tab.url, reason: 'restricted_url' });
      return;
    }

    if (isStaleActiveTabSync(syncVersion)) {
      return;
    }
    latestActiveTabId = tab.id;
    latestActiveTabAllowsPanel = true;
    await openSidePanelForTab(tab.id);
    if (isStaleActiveTabSync(syncVersion)) {
      if (shouldDisableStaleEnabledTab(tab.id)) {
        await disableSidePanelForTab(tab.id).catch((error: unknown) => {
          logger.warn('panel.stale_cleanup.failed', { browserTabId: tab.id, reason: describeError(error) });
        });
      }
      return;
    }
    logger.debug('panel.preconfigured', { browserTabId: tab.id, url: tab.url });
    await setActionClickOpensPanel(true);
  };

  /** 处理扩展按钮点击。 */
  const handleActionClick = async (
    tab: Pick<chrome.tabs.Tab, 'id' | 'url'> | undefined,
    source: BrowserActionClickSource = 'message_driver',
  ): Promise<BrowserEntryActionResult> => {
    logger.info('entry.action.clicked', { browserTabId: tab?.id, url: tab?.url, source });

    if (!tab?.id) {
      logger.warn('entry.action.missing_tab', { url: tab?.url });
      await setActionClickOpensPanel(false);
      return openConversationsPage();
    }

    if (isCurrentExtensionPage(tab.url ?? '', EXTENSION_PAGES.conversations)) {
      logger.info('entry.action.redirected', { browserTabId: tab.id, from: 'conversations', to: 'options' });
      await setActionClickOpensPanel(false);
      await disableSidePanelForTab(tab.id).catch((error: unknown) => {
        logger.warn('panel.disable.failed', { browserTabId: tab.id, reason: describeError(error) });
      });
      return openOptionsPage();
    }

    if (!canEnableSidePanelForUrl(tab.url)) {
      logger.info('entry.action.restricted', { browserTabId: tab.id, url: tab.url });
      await setActionClickOpensPanel(false);
      await disableSidePanelForTab(tab.id).catch((error: unknown) => {
        logger.warn('panel.disable.failed', { browserTabId: tab.id, reason: describeError(error) });
      });
      return openConversationsPage();
    }

    if (source === 'browser_action') {
      const configurePanel = openSidePanelForTab(tab.id);
      const configureActionClick = setActionClickOpensPanel(true);
      const openPanel = openSidePanelFromBrowserAction(tab.id);

      await Promise.all([configurePanel, configureActionClick, openPanel]);
      return {
        kind: 'sidepanel-opened',
        tabId: tab.id,
      };
    }

    await setActionClickOpensPanel(true);
    return openSidePanelForTab(tab.id);
  };

  /** 处理真实扩展按钮点击。 */
  const handleBrowserActionClick = async (tab: Pick<chrome.tabs.Tab, 'id' | 'url'> | undefined): Promise<BrowserEntryActionResult> => {
    return handleActionClick(tab, 'browser_action');
  };

  /** 处理标签页切换后的 side panel 启用态清理。 */
  const handleTabActivated = async ({ tabId }: { tabId: number }) => {
    const syncVersion = beginActiveTabSync(tabId);
    const enabledTabIds = await panelState.getEnabledTabIds();

    for (const openedTabId of enabledTabIds) {
      if (openedTabId === tabId) {
        continue;
      }

      try {
        await disableSidePanelForTab(openedTabId);
        logger.debug('panel.auto_hidden', { browserTabId: openedTabId, activeTabId: tabId });
      } catch (error) {
        logger.warn('panel.auto_hide_failed', { browserTabId: openedTabId, reason: describeError(error) });
      }
    }

    try {
      const activeTab = await tabs.get(tabId);
      if (isStaleActiveTabSync(syncVersion)) {
        return;
      }
      await syncSidePanelForActiveTab(activeTab, syncVersion);
    } catch (error) {
      logger.warn('panel.active_tab_sync.failed', { browserTabId: tabId, trigger: 'tab_activated', reason: describeError(error) });
    }
  };

  /** 处理活动标签页 URL 或加载状态变化。 */
  const handleTabUpdated = async (
    tabId: number,
    changeInfo: BrowserEntryTabUpdateInfo,
    tab: chrome.tabs.Tab,
  ) => {
    if (!tab.active) {
      return;
    }

    if (changeInfo.url === undefined && changeInfo.status !== 'complete') {
      return;
    }

    const syncVersion = beginActiveTabSync(tabId);
    try {
      await syncSidePanelForActiveTab(tab, syncVersion);
    } catch (error) {
      logger.warn('panel.active_tab_sync.failed', { browserTabId: tabId, trigger: 'tab_updated', reason: describeError(error) });
    }
  };

  /** 处理标签页关闭后的 side panel 运行态清理。 */
  const handleTabRemoved = async (tabId: number) => {
    await panelState.removeEnabledTabId(tabId);
    logger.debug('panel.removed', { browserTabId: tabId });
  };

  /** 处理安装事件。 */
  const handleInstalled = async ({ reason }: { reason: string }) => {
    logger.info('entry.runtime.installed', { reason });
    if (reason === 'install') {
      await openWelcomePage();
    }
  };

  /** 初始化右键菜单。 */
  const registerContextMenu = () => {
    contextMenus.removeAll(() => {
      contextMenus.create({
        id: MENU_ID_CONVERSATIONS,
        title: 'Open Conversations',
        contexts: ['all'],
      });
    });
  };

  /** 处理右键菜单点击。 */
  const handleContextMenuClick = async (info: { menuItemId: string | number }) => {
    logger.info('entry.contextmenu.clicked', { menuItemId: info.menuItemId });

    if (info.menuItemId === MENU_ID_CONVERSATIONS) {
      await openConversationsPage();
    }
  };

  /** 处理 E2E 浏览器按钮驱动消息。 */
  const handleE2EBrowserActionClick = async (message: E2EBrowserActionMessage): Promise<BrowserEntryActionResult> => {
    return handleActionClick({
      id: message.tabId,
      url: message.pageUrl,
    }, 'message_driver');
  };

  return {
    configureActionClickBehavior,
    handleActionClick,
    handleBrowserActionClick,
    handleContextMenuClick,
    handleInstalled,
    handleTabActivated,
    handleTabUpdated,
    handleTabRemoved,
    handleE2EBrowserActionClick,
    registerContextMenu,
  };
};
