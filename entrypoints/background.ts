/// <reference types="chrome" />

import { defineBackground } from 'wxt/utils/define-background';
import { createChromeLocalAdapter } from '../src/repositories/chrome-local-adapter';
import { createConfigRepository } from '../src/repositories/config-repository';
import { createConversationRepository } from '../src/repositories/conversation-repository';
import { createPageRepository } from '../src/repositories/page-repository';
import { createBrowserEntryService } from '../src/services/browser-entry/browser-entry';
import { createBlacklistService } from '../src/services/blacklist/blacklist-service';
import { createContentSource } from '../src/services/extraction/content-source';
import { createExtractionService } from '../src/services/extraction/extraction-service';
import { createJinaClient } from '../src/services/extraction/jina-client';
import { createLogger } from '../src/services/logger/logger';
import { createConfigCommandHandler, isConfigCommandMessage } from '../src/services/runtime-messaging/config-commands';
import { createSidebarCommandHandler, isSidebarCommandMessage } from '../src/services/runtime-messaging/sidebar-commands';
import { normalizePageUrl } from '../src/domain/page/page-schema';

export default defineBackground(() => {
  const logger = createLogger('background');
  const storage = createChromeLocalAdapter(chrome.storage.local);
  const configRepository = createConfigRepository(storage);
  const pageRepository = createPageRepository(storage);
  const conversationRepository = createConversationRepository(storage);
  const handleConfigCommand = createConfigCommandHandler({
    configRepository,
    pageRepository,
  });
  const bypassStore = new Map<string, number>();
  /** 生成当前标签页的黑名单放行 key。 */
  const toBypassKey = (browserTabId: number, normalizedUrl: string) => `${browserTabId}:${normalizedUrl}`;
  /** 清理某个标签页已有的黑名单放行令牌。 */
  const clearBypassForTab = (browserTabId: number) => {
    const prefix = `${browserTabId}:`;
    for (const key of Array.from(bypassStore.keys())) {
      if (key.startsWith(prefix)) {
        bypassStore.delete(key);
      }
    }
  };
  const browserEntry = createBrowserEntryService({
    logger,
    runtime: chrome.runtime,
    tabs: chrome.tabs,
    sidePanel: chrome.sidePanel,
    contextMenus: chrome.contextMenus,
    getUiLocale: () => chrome.i18n?.getUILanguage?.() ?? 'en',
  });
  void browserEntry.configureActionClickBehavior().catch((error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error);
    logger.warn('侧边栏按钮行为配置失败', { reason });
  });
  const contentSource = createContentSource({
    tabs: {
      executeScript: (tabId) =>
        chrome.scripting
          .executeScript({
            target: { tabId },
            files: ['content-scripts/content.js'],
          })
          .then(() => undefined),
      sendMessage: (tabId, message) =>
        new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(tabId, message, (response) => {
            const error = chrome.runtime.lastError;
            if (error) {
              reject(new Error(error.message));
              return;
            }

            resolve(response as {
              url: string;
              title: string;
              html: string;
              text: string;
              faviconUrl: string;
            });
          });
        }),
      reload: (tabId) =>
        new Promise<void>((resolve) => {
          chrome.tabs.reload(tabId, () => resolve());
        }),
    },
  });
  const extractionService = createExtractionService({
    logger,
    contentSource,
    readabilityExtractor: {
      extract: (html, pageUrl) => {
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
        const source = articleMatch?.[1] ?? html;
        const content = source
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (!content) {
          return null;
        }

        return {
          content,
          title: titleMatch?.[1]?.trim() || new URL(pageUrl).hostname,
        };
      },
    },
    jinaClient: createJinaClient(),
    pageRepository,
  });
  const handleSidebarCommand = createSidebarCommandHandler({
    runtime: chrome.runtime,
    pageRepository,
    conversationRepository,
    blacklistRepository: {
      isBlocked: async ({ browserTabId, normalizedUrl }) => {
        const config = await configRepository.getConfig();
        const service = createBlacklistService({
          rules: config.blacklist,
        });
        return service.checkUrl(normalizedUrl).blocked && !bypassStore.has(toBypassKey(browserTabId, normalizedUrl));
      },
      getMatchedRuleId: async ({ browserTabId, normalizedUrl }) => {
        const config = await configRepository.getConfig();
        const service = createBlacklistService({
          rules: config.blacklist,
        });
        return bypassStore.has(toBypassKey(browserTabId, normalizedUrl)) ? null : service.checkUrl(normalizedUrl).matchedRuleId;
      },
    },
  });

  chrome.runtime.onInstalled.addListener((details: { reason: string }) => {
    void browserEntry.handleInstalled(details);
  });

  browserEntry.registerContextMenu();

  chrome.contextMenus.onClicked.addListener((info: { menuItemId: string | number }) => {
    void browserEntry.handleContextMenuClick(info);
  });

  chrome.tabs.onActivated.addListener((activeInfo) => {
    for (const key of Array.from(bypassStore.keys())) {
      if (!key.startsWith(`${activeInfo.tabId}:`)) {
        bypassStore.delete(key);
      }
    }
    void browserEntry.handleTabActivated(activeInfo);
  });

  if (chrome.action?.onClicked) {
    chrome.action.onClicked.addListener((tab) => {
      if (tab?.id) {
        clearBypassForTab(tab.id);
      }
      void browserEntry.handleActionClick(tab);
    });
  } else {
    logger.warn('扩展按钮能力不可用', {});
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (typeof message === 'object' && message !== null && (message as { type?: string }).type === '__E2E_BROWSER_ACTION_CLICK__') {
      clearBypassForTab((message as { tabId: number }).tabId);
      void browserEntry
        .handleE2EBrowserActionClick(message as { type: '__E2E_BROWSER_ACTION_CLICK__'; tabId: number; pageUrl: string })
        .then((result) => sendResponse(result))
        .catch((error: unknown) => {
          const reason = error instanceof Error ? error.message : String(error);
          sendResponse({ error: reason });
        });
      return true;
    }

    if (isSidebarCommandMessage(message)) {
      if (message.type === 'CONFIRM_BLACKLIST_CONTINUE') {
        const normalizedUrl = normalizePageUrl(message.pageUrl);
        bypassStore.set(toBypassKey(message.tabId, normalizedUrl), Date.now());
        logger.info('blacklist.bypass_confirmed', {
          browserTabId: message.tabId,
          normalizedUrl,
        });
        sendResponse({
          type: 'CONFIRM_BLACKLIST_CONTINUE_SUCCESS',
          payload: {
            allowed: true,
          },
        });
        return true;
      }

      if (message.type === 'RE_EXTRACT_CONTENT') {
        void extractionService
          .extractPage({
            tabId: message.tabId,
            pageUrl: message.pageUrl,
            method: message.method as 'readability' | 'jina',
          })
          .then((result) => {
            logger.info('extraction.completed', {
              browserTabId: message.tabId,
              normalizedUrl: result.normalizedUrl,
              method: result.extractionMethod,
            });
            sendResponse({
              type: 'RE_EXTRACT_CONTENT_SUCCESS',
              payload: result,
            });
          })
          .catch((error: unknown) => {
            const reason = error instanceof Error ? error.message : String(error);
            logger.error('extraction.failed', {
              browserTabId: message.tabId,
              reason,
            });
            sendResponse({ error: reason });
          });
        return true;
      }

      if (message.type === 'SWITCH_EXTRACTION_METHOD') {
        sendResponse({
          type: 'SWITCH_EXTRACTION_METHOD_SUCCESS',
          payload: {
            method: message.method,
          },
        });
        return true;
      }

      void handleSidebarCommand(message, {
        sender: {
          id: (sender as { id?: string | null }).id ?? null,
          url: (sender as { url?: string | null }).url ?? null,
        },
      })
        .then((result) => sendResponse(result))
        .catch((error: unknown) => {
          const reason = error instanceof Error ? error.message : String(error);
          sendResponse({ error: reason });
        });
      return true;
    }

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
