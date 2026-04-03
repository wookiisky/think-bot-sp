import { EXTENSION_PAGES } from '../../shared/extension-pages';
import { isRestrictedUrl, resolveWelcomeLocale } from '../../shared/browser-entry';

const MENU_ID_CONVERSATIONS = 'open-conversations';
/* eslint-disable-next-line no-unused-vars */
type LoggerMethod = (..._input: [string, (Record<string, unknown> | undefined)?]) => void;

type BrowserEntryLogger = {
  /** 信息日志。 */
  info: LoggerMethod;
  /** 警告日志。 */
  warn: LoggerMethod;
  /** 调试日志。 */
  debug: LoggerMethod;
};

type BrowserEntryDependencies = {
  /** 结构化日志。 */
  logger: BrowserEntryLogger;
  /** runtime 能力。 */
  runtime: typeof chrome.runtime;
  /** tabs 能力。 */
  tabs: typeof chrome.tabs;
  /** side panel 能力。 */
  sidePanel: typeof chrome.sidePanel;
  /** contextMenus 能力。 */
  contextMenus: typeof chrome.contextMenus;
  /** 当前浏览器 UI 语言。 */
  getUiLocale: () => string;
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

const stripLeadingSlash = (route: string) => (route.startsWith('/') ? route.slice(1) : route);

/** 创建浏览器入口服务，统一处理扩展按钮、右键菜单、安装和标签切换。 */
export const createBrowserEntryService = ({
  logger,
  runtime,
  tabs,
  sidePanel,
  contextMenus,
  getUiLocale,
}: BrowserEntryDependencies) => {
  const enabledTabIds = new Set<number>();

  /** 配置扩展按钮点击后由浏览器原生打开 side panel。 */
  const configureActionClickBehavior = async () => {
    if (!sidePanel.setPanelBehavior) {
      logger.warn('侧边栏按钮行为能力不可用', {});
      return;
    }

    await sidePanel.setPanelBehavior({
      openPanelOnActionClick: true,
    });
    logger.info('侧边栏按钮行为已配置', {
      openPanelOnActionClick: true,
    });
  };

  /** 生成扩展页 URL。 */
  const toExtensionUrl = (route: string, query?: string) => {
    const baseUrl = runtime.getURL(stripLeadingSlash(route));
    return query ? `${baseUrl}?${query}` : baseUrl;
  };

  /** 打开欢迎页。 */
  const openWelcomePage = async () => {
    const locale = resolveWelcomeLocale(getUiLocale());
    const url = toExtensionUrl(EXTENSION_PAGES.welcome, `locale=${encodeURIComponent(locale)}`);
    logger.info('welcome.open.requested', { locale, url });
    await tabs.create({ url });
  };

  /** 打开 conversations 页面。 */
  const openConversationsPage = async (): Promise<BrowserEntryActionResult> => {
    const url = toExtensionUrl(EXTENSION_PAGES.conversations);
    logger.info('conversations.open.requested', { url });
    await tabs.create({ url });
    return {
      kind: 'conversations-opened',
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
    enabledTabIds.add(tabId);
    logger.info('侧边栏入口已绑定当前标签页', {
      browserTabId: tabId,
      path,
    });
    return {
      kind: 'sidepanel-opened',
      tabId,
    };
  };

  /** 处理扩展按钮点击。 */
  const handleActionClick = async (tab: chrome.tabs.Tab | undefined): Promise<BrowserEntryActionResult> => {
    logger.info('action.clicked', {
      tabId: tab?.id,
      url: tab?.url,
    });

    if (!tab?.id) {
      logger.warn('action.missing-tab', {
        url: tab?.url,
      });
      return openConversationsPage();
    }

    if (isRestrictedUrl(tab.url ?? '')) {
      logger.warn('action.restricted', {
        browserTabId: tab.id,
        url: tab.url,
      });
      return openConversationsPage();
    }

    return openSidePanelForTab(tab.id);
  };

  /** 处理标签页切换后的 side panel 启用态清理。 */
  const handleTabActivated = async ({ tabId }: { tabId: number }) => {
    for (const openedTabId of Array.from(enabledTabIds)) {
      if (openedTabId === tabId) {
        continue;
      }

      enabledTabIds.delete(openedTabId);
      await sidePanel.setOptions({
        tabId: openedTabId,
        enabled: false,
      });
      logger.info('panel.auto_hidden', {
        browserTabId: openedTabId,
      });
    }
  };

  /** 处理安装事件。 */
  const handleInstalled = async ({ reason }: { reason: string }) => {
    logger.info('runtime.installed', { reason });
    if (reason === 'install') {
      await openWelcomePage();
    }
  };

  /** 初始化右键菜单。 */
  const registerContextMenu = () => {
    contextMenus.removeAll(() => {
      logger.debug('contextmenu.reset', {});
      contextMenus.create({
        id: MENU_ID_CONVERSATIONS,
        title: 'Open Conversations',
        contexts: ['all'],
      });
    });
  };

  /** 处理右键菜单点击。 */
  const handleContextMenuClick = async (info: { menuItemId: string | number }) => {
    logger.info('contextmenu.clicked', {
      menuItemId: info.menuItemId,
    });

    if (info.menuItemId === MENU_ID_CONVERSATIONS) {
      await openConversationsPage();
    }
  };

  /** 处理 E2E 浏览器按钮驱动消息。 */
  const handleE2EBrowserActionClick = async (message: E2EBrowserActionMessage): Promise<BrowserEntryActionResult> => {
    return handleActionClick({
      id: message.tabId,
      url: message.pageUrl,
    });
  };

  return {
    configureActionClickBehavior,
    handleActionClick,
    handleContextMenuClick,
    handleInstalled,
    handleTabActivated,
    handleE2EBrowserActionClick,
    registerContextMenu,
  };
};
