import { defineBackground } from 'wxt/utils/define-background';

import { createLogger } from '../src/services/logger/logger';
import { EXTENSION_PAGES } from '../src/shared/extension-pages';
import { isRestrictedUrl, resolveWelcomeLocale } from '../src/shared/browser-entry';

const MENU_ID_CONVERSATIONS = 'open-conversations';

const stripLeadingSlash = (route: string) => (route.startsWith('/') ? route.slice(1) : route);

const toExtensionUrl = (route: string, query?: string) => {
  const path = stripLeadingSlash(route);
  const baseUrl = chrome.runtime.getURL(path);

  if (!query) {
    return baseUrl;
  }

  return `${baseUrl}?${query}`;
};

const getUiLocale = () => {
  if (chrome.i18n?.getUILanguage) {
    return chrome.i18n.getUILanguage();
  }

  return 'en';
};

export default defineBackground(() => {
  const logger = createLogger('background');

  const openWelcomePage = () => {
    const locale = resolveWelcomeLocale(getUiLocale());
    const url = toExtensionUrl(EXTENSION_PAGES.welcome, `locale=${encodeURIComponent(locale)}`);
    logger.info('welcome.open.requested', { locale, url });
    chrome.tabs.create({ url });
  };

  const openConversationsPage = () => {
    const url = toExtensionUrl(EXTENSION_PAGES.conversations);
    logger.info('conversations.open.requested', { url });
    chrome.tabs.create({ url });
  };

  const setSidePanelForTab = (tabId: number) => {
    const path = stripLeadingSlash(EXTENSION_PAGES.sidePanel);
    logger.info('sidepanel.set-options', { tabId, path });
    chrome.sidePanel.setOptions({ tabId, path, enabled: true });
    chrome.sidePanel.open({ tabId });
  };

  const isTabRestricted = (tab?: chrome.tabs.Tab | null) => {
    return isRestrictedUrl(tab?.url ?? '');
  };

  chrome.runtime.onInstalled.addListener((details) => {
    logger.info('runtime.installed', { reason: details.reason });
    if (details.reason === 'install') {
      openWelcomePage();
    }
  });

  chrome.contextMenus.removeAll(() => {
    logger.debug('contextmenu.reset', {});
    chrome.contextMenus.create({
      id: MENU_ID_CONVERSATIONS,
      title: 'Open Conversations',
      contexts: ['all'],
    });
  });

  chrome.contextMenus.onClicked.addListener((info) => {
    logger.info('contextmenu.clicked', { menuItemId: info.menuItemId });
    if (info.menuItemId === MENU_ID_CONVERSATIONS) {
      openConversationsPage();
    }
  });

  chrome.action.onClicked.addListener((tab) => {
    logger.info('action.clicked', { tabId: tab?.id, url: tab?.url });
    const tabId = tab?.id;

    if (!tabId) {
      logger.warn('action.missing-tab', { url: tab?.url });
      openConversationsPage();
      return;
    }

    if (isTabRestricted(tab)) {
      logger.warn('action.restricted', { tabId, url: tab?.url });
      openConversationsPage();
      return;
    }

    setSidePanelForTab(tabId);
  });
});
