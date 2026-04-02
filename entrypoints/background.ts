/// <reference types="chrome" />

import { defineBackground } from 'wxt/utils/define-background';
import { createChromeLocalAdapter } from '../src/repositories/chrome-local-adapter';
import { createConfigRepository } from '../src/repositories/config-repository';
import { createPageRepository } from '../src/repositories/page-repository';
import { createLogger } from '../src/services/logger/logger';
import { createConfigCommandHandler, isConfigCommandMessage } from '../src/services/runtime-messaging/config-commands';
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
  const storage = createChromeLocalAdapter(chrome.storage.local);
  const configRepository = createConfigRepository(storage);
  const pageRepository = createPageRepository(storage);
  const handleConfigCommand = createConfigCommandHandler({
    configRepository,
    pageRepository,
  });

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

  const isTabRestricted = (tab: chrome.tabs.Tab) => {
    return isRestrictedUrl(tab?.url ?? '');
  };

  chrome.runtime.onInstalled.addListener((details: { reason: string }) => {
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

  chrome.contextMenus.onClicked.addListener((info: { menuItemId: string | number }) => {
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

  chrome.runtime.onMessage.addListener((message: unknown, _sender: unknown, sendResponse: (response?: unknown) => void) => {
    if (!isConfigCommandMessage(message)) {
      return false;
    }

    const type = message.type;
    void handleConfigCommand(message)
      .then((result) => {
        logger.info('配置命令处理成功', { type });
        sendResponse(result);
      })
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        logger.error('配置命令处理失败', { type, reason });
        sendResponse({ error: reason });
      });

    return true;
  });
});
