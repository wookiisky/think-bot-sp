/// <reference types="chrome" />

import { streamText } from 'ai';
import { defineBackground } from 'wxt/utils/define-background';
import { normalizePageUrl } from '../src/domain/page/page-schema';
import { createChromeLocalAdapter } from '../src/repositories/chrome-local-adapter';
import { createConfigRepository } from '../src/repositories/config-repository';
import { createConversationRepository } from '../src/repositories/conversation-repository';
import { createPageRepository } from '../src/repositories/page-repository';
import { createRecentErrorRepository } from '../src/repositories/recent-error-repository';
import { createSyncRepository } from '../src/repositories/sync-repository';
import { createBrowserEntryService } from '../src/services/browser-entry/browser-entry';
import { createBrowserEntryPanelState } from '../src/services/browser-entry/browser-panel-state';
import { createBlacklistService } from '../src/services/blacklist/blacklist-service';
import { createContentSource } from '../src/services/extraction/content-source';
import { createExtractionService } from '../src/services/extraction/extraction-service';
import { createJinaClient } from '../src/services/extraction/jina-client';
import { createConversationExporter } from '../src/services/export/conversation-exporter';
import { createChatDispatchService } from '../src/services/llm-dispatch/chat-dispatch-service';
import { resolveProviderModel } from '../src/services/llm-dispatch/provider-registry';
import { createLogger } from '../src/services/logger/logger';
import { createConfigCommandHandler, isConfigCommandMessage } from '../src/services/runtime-messaging/config-commands';
import { createConversationsCommandHandler, isConversationsCommandMessage } from '../src/services/runtime-messaging/conversations-commands';
import { createPortBus } from '../src/services/runtime-messaging/port-bus';
import { createSidebarCommandHandler, isSidebarCommandMessage } from '../src/services/runtime-messaging/sidebar-commands';
import { sidebarPortClientMessageSchema, sidebarPortEventSchema } from '../src/services/runtime-messaging/sidebar-contract';
import { createSidebarSessionRegistry } from '../src/services/runtime-messaging/sidebar-session-registry';
import { assertConversationsPageSender, isConversationsPageSender, isSidebarPageSender } from '../src/services/runtime-messaging/sender';
import { createSidebarAutoTriggerService } from '../src/services/sidebar-auto-trigger/sidebar-auto-trigger-service';
import { createSyncService } from '../src/services/sync/sync-service';

export default defineBackground(() => {
  const logger = createLogger('background');
  const storage = createChromeLocalAdapter(chrome.storage.local);
  const configRepository = createConfigRepository(storage);
  const pageRepository = createPageRepository(storage);
  const conversationRepository = createConversationRepository(storage);
  const syncRepository = createSyncRepository({
    storage,
    configRepository,
    pageRepository,
    conversationRepository,
  });
  const recentErrorRepository = createRecentErrorRepository(storage);
  const syncService = createSyncService({
    getTestProvider: () =>
      (globalThis as typeof globalThis & {
        __THINK_BOT_TEST_SYNC_PROVIDER__?: {
          testConnection: (sync: unknown) => Promise<{ provider: 'gist' | 'webdav'; ok: true; message: string }>;
          syncNow: (config: unknown) => Promise<{ provider: 'gist' | 'webdav'; lastSyncAt: number; snapshotBytes: number }>;
        };
      }).__THINK_BOT_TEST_SYNC_PROVIDER__ ?? null,
    syncRepository,
  });
  const portBus = createPortBus();
  const sessionRegistry = createSidebarSessionRegistry();
  const chatDispatchService = createChatDispatchService({
    logger,
    configRepository,
    providerRegistry: {
      resolveProviderModel,
    },
    conversationRepository,
    portBus: {
      publishToPromptTab(event) {
        portBus.publishToPromptTab(
          {
            normalizedUrl: event.normalizedUrl,
            promptTabId: event.promptTabId,
          },
          sidebarPortEventSchema.parse(event),
        );
      },
    },
    streamText: async (input) => {
      (
        globalThis as typeof globalThis & {
          __THINK_BOT_TEST_LAST_STREAM_MESSAGES__?: Array<{ role: string; content: string; images: string[] }>;
        }
      ).__THINK_BOT_TEST_LAST_STREAM_MESSAGES__ = input.messages.map((message) => ({
        role: message.role,
        content: message.content,
        images: message.images,
      }));
      const testStream = (globalThis as typeof globalThis & {
        __THINK_BOT_TEST_STREAM__?: Array<string>;
      }).__THINK_BOT_TEST_STREAM__;
      if (!testStream) {
        return streamText(input);
      }

      return {
        textStream: (async function* () {
          for (const chunk of testStream) {
            yield chunk;
          }
        })(),
      };
    },
  });
  const handleConfigCommand = createConfigCommandHandler({
    configRepository,
    pageRepository,
    recentErrorRepository,
    syncService,
  });
  /** 记录最近一次错误，失败时只记日志，不影响原始响应。 */
  const recordRecentError = (input: {
    /** 错误来源。 */
    source: 'sidebar' | 'conversations' | 'sync' | 'settings';
    /** 出错操作。 */
    operation: string;
    /** 原始错误消息。 */
    message: string;
  }) => {
    void recentErrorRepository.saveRecentError(input).catch((error: unknown) => {
      logger.warn('recent_error.persist_failed', {
        source: input.source,
        operation: input.operation,
        reason: error instanceof Error ? error.message : String(error),
      });
    });
  };
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
    panelState: createBrowserEntryPanelState(chrome.storage.session),
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
  const sidebarAutoTriggerService = createSidebarAutoTriggerService({
    logger,
    configRepository,
    pageRepository,
    conversationRepository,
    chatDispatchService,
    sessionRegistry,
  });
  const conversationExporter = createConversationExporter({
    pageRepository,
    conversationRepository,
    configRepository,
  });
  const handleSidebarCommand = createSidebarCommandHandler({
    logger,
    runtime: chrome.runtime,
    pageRepository,
    conversationRepository,
    chatDispatchService,
    conversationExporter,
    sessionRegistry,
    configRepository,
    syncRepository,
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
  const handleConversationsChatCommand = createSidebarCommandHandler({
    logger,
    runtime: chrome.runtime,
    pageRepository,
    conversationRepository,
    chatDispatchService,
    conversationExporter,
    sessionRegistry,
    configRepository,
    syncRepository,
    blacklistRepository: {
      isBlocked: async () => false,
      getMatchedRuleId: async () => null,
    },
    assertPageSender: assertConversationsPageSender,
  });
  const handleConversationsCommand = createConversationsCommandHandler({
    runtime: chrome.runtime,
    pageRepository,
    conversationRepository,
    configRepository,
    syncRepository,
    sessionRegistry,
  });

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'sidepanel') {
      return;
    }

    const portId = portBus.register(port);
    logger.info('port.connected', {
      portName: port.name,
    });

    port.onMessage.addListener((message: unknown) => {
      const parsed = sidebarPortClientMessageSchema.safeParse(message);
      if (!parsed.success) {
        return;
      }

      const normalizedUrl = normalizePageUrl(parsed.data.pageUrl);
      portBus.bindPromptTab(portId, {
        normalizedUrl,
        promptTabId: parsed.data.promptTabId,
      });
      logger.info('port.restore_requested', {
        browserTabId: parsed.data.tabId,
        normalizedUrl,
        promptTab: parsed.data.promptTabId,
      });

      void Promise.all([
        conversationRepository.getLoadingState(normalizedUrl, parsed.data.promptTabId),
        conversationRepository.getConversation(normalizedUrl, parsed.data.promptTabId),
      ])
        .then(([loadingState, conversation]) => {
          if (!loadingState || !conversation) {
            return;
          }

          const loadingAssistantMessage =
            conversation.messages.find((messageRecord) => messageRecord.role === 'assistant' && messageRecord.status === 'loading') ?? null;
          const restoreMessageId = loadingState.resumeTarget?.messageId ?? conversation.lastAssistantState?.messageId ?? loadingAssistantMessage?.id ?? null;
          const restoreMessage =
            conversation.messages.find((messageRecord) => messageRecord.id === restoreMessageId && messageRecord.role === 'assistant') ?? loadingAssistantMessage;

          if (!restoreMessage || restoreMessage.status !== 'loading') {
            return;
          }

          port.postMessage(
            sidebarPortEventSchema.parse({
              type: 'RESTORE_LOADING',
              normalizedUrl,
              promptTabId: parsed.data.promptTabId,
              sessionId: loadingState.sessionId,
              messageId: restoreMessage.id,
              content: restoreMessage.content,
            }),
          );
        })
        .catch((error: unknown) => {
          const reason = error instanceof Error ? error.message : String(error);
          logger.warn('port.restore_failed', {
            browserTabId: parsed.data.tabId,
            normalizedUrl,
            promptTab: parsed.data.promptTabId,
            reason,
          });
        });
    });

    port.onDisconnect.addListener(() => {
      portBus.unregister(portId);
      logger.info('port.disconnected', {
        portName: port.name,
      });
    });
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

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tabId && changeInfo.url) {
      clearBypassForTab(tabId);
    }
    void browserEntry.handleTabUpdated(tabId, changeInfo, tab);
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    clearBypassForTab(tabId);
    void browserEntry.handleTabRemoved(tabId);
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
      const senderInfo = {
        id: (sender as { id?: string | null }).id ?? null,
        url: (sender as { url?: string | null }).url ?? null,
      };

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
        void configRepository
          .getConfig()
          .then((config) =>
            extractionService.extractPage({
              tabId: message.tabId,
              pageUrl: message.pageUrl,
              method: message.method as 'readability' | 'jina',
              jinaApiKey: config.basic.jinaApiKey,
              jinaResponseTemplate: config.basic.jinaResponseTemplate,
            }),
          )
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
            void sidebarAutoTriggerService.handleExtractionCompleted({
              browserTabId: message.tabId,
              pageUrl: result.url,
              normalizedUrl: result.normalizedUrl,
              pageContent: result.content,
            });
          })
          .catch((error: unknown) => {
            const reason = error instanceof Error ? error.message : String(error);
            logger.error('extraction.failed', {
              browserTabId: message.tabId,
              reason,
            });
            recordRecentError({
              source: 'sidebar',
              operation: 'RE_EXTRACT_CONTENT',
              message: reason,
            });
            sendResponse({ error: reason });
          });
        return true;
      }

      if (message.type === 'SWITCH_EXTRACTION_METHOD') {
        logger.info('extraction.method_switched', {
          browserTabId: message.tabId,
          normalizedUrl: normalizePageUrl(message.pageUrl),
          method: message.method,
        });
        sendResponse({
          type: 'SWITCH_EXTRACTION_METHOD_SUCCESS',
          payload: {
            method: message.method,
          },
        });
        return true;
      }

      const runtimeId = chrome.runtime.id;
      const commandHandler = isSidebarPageSender(senderInfo, runtimeId)
        ? handleSidebarCommand
        : isConversationsPageSender(senderInfo, runtimeId)
          ? handleConversationsChatCommand
          : handleSidebarCommand;

      void commandHandler(message, { sender: senderInfo })
        .then((result) => {
          logger.info('sidebar.command.succeeded', {
            type: message.type,
            browserTabId: 'tabId' in message && typeof message.tabId === 'number' ? message.tabId : undefined,
          });
          sendResponse(result);
        })
        .catch((error: unknown) => {
          const reason = error instanceof Error ? error.message : String(error);
          const isConversationsSender = isConversationsPageSender(senderInfo, runtimeId);
          logger.error('sidebar.command.failed', {
            type: message.type,
            browserTabId: 'tabId' in message && typeof message.tabId === 'number' ? message.tabId : undefined,
            reason,
          });
          recordRecentError({
            source: isConversationsSender ? 'conversations' : 'sidebar',
            operation: message.type,
            message: reason,
          });
          sendResponse({ error: reason });
        });
      return true;
    }

    if (isConversationsCommandMessage(message)) {
      const type = message.type;
      void handleConversationsCommand(message, {
        sender: {
          id: (sender as { id?: string | null }).id ?? null,
          url: (sender as { url?: string | null }).url ?? null,
        },
      })
        .then((result) => {
          logger.info('conversations.command.succeeded', { type });
          sendResponse(result);
        })
        .catch((error: unknown) => {
          const reason = error instanceof Error ? error.message : String(error);
          logger.error('conversations.command.failed', { type, reason });
          recordRecentError({
            source: 'conversations',
            operation: type,
            message: reason,
          });
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
        recordRecentError({
          source: type === 'SYNC_NOW' || type === 'TEST_SYNC_CONNECTION' ? 'sync' : 'settings',
          operation: type,
          message: reason,
        });
        sendResponse({ error: reason });
      });

    return true;
  });
});
