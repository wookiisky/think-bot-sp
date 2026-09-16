/// <reference types="chrome" />

import { generateText, streamText, type LanguageModel, type ToolSet } from 'ai';
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
import { createBlacklistBypassState } from '../src/services/blacklist/blacklist-bypass-state';
import { createBlacklistService } from '../src/services/blacklist/blacklist-service';
import type { PageSource } from '../src/services/extraction/page-source';
import { createContentSource } from '../src/services/extraction/content-source';
import { createExtractionService } from '../src/services/extraction/extraction-service';
import { createJinaClient } from '../src/services/extraction/jina-client';
import { createConversationExporter } from '../src/services/export/conversation-exporter';
import { createChatDispatchService } from '../src/services/llm-dispatch/chat-dispatch-service';
import { toModelMessages } from '../src/services/llm-dispatch/model-messages';
import { resolveProviderModel } from '../src/services/llm-dispatch/provider-registry';
import { bridgeStreamError, type StreamErrorBox } from '../src/services/llm-dispatch/stream-error-bridge';
import { createLogger, describeError } from '../src/services/logger/logger';
import { createConfigCommandHandler, isConfigCommandMessage } from '../src/services/runtime-messaging/config-commands';
import { createConversationsCommandHandler, isConversationsCommandMessage } from '../src/services/runtime-messaging/conversations-commands';
import { createLoadingStateReconciler } from '../src/services/runtime-messaging/loading-state-reconciler';
import { createPortBus } from '../src/services/runtime-messaging/port-bus';
import { createServiceWorkerKeepalive } from '../src/services/runtime-messaging/service-worker-keepalive';
import { createSidebarCommandHandler, isSidebarCommandMessage } from '../src/services/runtime-messaging/sidebar-commands';
import { sidebarPortClientMessageSchema, sidebarPortEventSchema, type SidebarPortEvent } from '../src/services/runtime-messaging/sidebar-contract';
import { createSidebarSessionRegistry } from '../src/services/runtime-messaging/sidebar-session-registry';
import { assertConversationsPageSender, isConversationsPageSender, isSidebarPageSender } from '../src/services/runtime-messaging/sender';
import { createSidebarAutoTriggerService } from '../src/services/sidebar-auto-trigger/sidebar-auto-trigger-service';
import { createSyncService } from '../src/services/sync/sync-service';

type GenerateTextRequest = Parameters<typeof generateText>[0];
type ProviderOptions = GenerateTextRequest extends { providerOptions?: infer Value } ? Value : never;

export default defineBackground(() => {
  const logger = createLogger('background');
  const commandLogger = logger.child('command');
  const portLogger = logger.child('port');
  const storage = createChromeLocalAdapter(chrome.storage.local);
  const configRepository = createConfigRepository(storage);
  const pageRepository = createPageRepository(storage);
  const conversationRepository = createConversationRepository(storage);
  const syncRepository = createSyncRepository({
    storage,
  });
  const recentErrorRepository = createRecentErrorRepository(storage);
  const syncService = createSyncService({
    logger: logger.child('sync'),
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
  // 模型思考阶段没有 chunk 落库和 port 消息，worker 会因 30 秒空闲被回收；请求期间定时调用扩展 API 续命。
  const keepalive = createServiceWorkerKeepalive({
    logger: logger.child('keepalive'),
    ping: () => chrome.runtime.getPlatformInfo(),
  });
  /** port 事件只在 port-bus 边界校验一次，避免每个 chunk 重复 parse。 */
  const publishToPromptTab = (event: SidebarPortEvent) => {
    portBus.publishToPromptTab({ normalizedUrl: event.normalizedUrl, promptTabId: event.promptTabId }, event);
  };
  const loadingStateReconciler = createLoadingStateReconciler({
    logger: logger.child('loading'),
    conversationRepository,
    sessionRegistry,
    portBus: { publishToPromptTab },
  });
  // worker 重启后内存里的会话已不存在，先把 storage 中遗留的 loading 收敛为失败态。
  const startupReconciliation = loadingStateReconciler
    .reconcileAll()
    .then((reconciled) => {
      if (reconciled > 0) {
        logger.warn('loading.reconcile.startup', { reconciled });
      }
    })
    .catch((error: unknown) => {
      logger.warn('loading.reconcile.startup_failed', { reason: describeError(error) });
    });
  const chatDispatchService = createChatDispatchService({
    logger: logger.child('dispatch'),
    configRepository,
    providerRegistry: {
      resolveProviderModel,
    },
    conversationRepository,
    portBus: { publishToPromptTab },
    streamText: async (input: {
      model: LanguageModel;
      maxOutputTokens?: number;
      tools?: ToolSet;
      providerOptions?: ProviderOptions;
      messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string; images: string[] }>;
      abortSignal: AbortSignal;
    }) => {
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
        // AI SDK v5 的 textStream 默认吞掉流式错误（仅经 onError 回调暴露），
        // 借助 bridgeStreamError 在迭代结束时重新抛出，确保 dispatch 能把错误收敛为失败态。
        const errorBox: StreamErrorBox = { error: null };
        const result = streamText({
          ...input,
          // 图片必须展开成 image part，直接透传的 images 字段会被 SDK 的 zod 校验剥掉。
          messages: toModelMessages(input.messages),
          onError({ error }: { error: unknown }) {
            errorBox.error = error;
          },
        });
        const bridged = bridgeStreamError({ result, errorBox });
        return { textStream: keepalive.wrapIterable(bridged.textStream) };
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
    modelTestService: {
      async testModel(model, llmRequestTimeoutSeconds, reasoningEffort) {
        const modelTestLogger = logger.child('model_test', { modelId: model.id, provider: model.provider });
        const resolvedModel = resolveProviderModel(model, { reasoningEffort });
        const testStartedAt = Date.now();
        modelTestLogger.info('model_test.started', { timeoutSeconds: llmRequestTimeoutSeconds, reasoningEffort });
        const abortController = new AbortController();
        let timedOut = false;
        const timeoutId = setTimeout(() => {
          timedOut = true;
          abortController.abort();
        }, llmRequestTimeoutSeconds * 1000);
        const request = {
          model: resolvedModel.sdkModel,
          prompt: 'hi',
          abortSignal: abortController.signal,
        } as {
          model: LanguageModel;
          prompt: string;
          abortSignal: AbortSignal;
          maxOutputTokens?: number;
          tools?: ToolSet;
          providerOptions?: ProviderOptions;
        };
        if (resolvedModel.maxOutputTokens !== null) {
          request.maxOutputTokens = resolvedModel.maxOutputTokens;
        }
        if (resolvedModel.tools) {
          request.tools = resolvedModel.tools;
        }
        if (resolvedModel.providerOptions) {
          request.providerOptions = resolvedModel.providerOptions;
        }
        const response = await keepalive
          .run(() => generateText(request))
          .catch((error: unknown) => {
            modelTestLogger.error('model_test.failed', {
              durationMs: Date.now() - testStartedAt,
              timedOut,
              reason: describeError(error),
            });
            if (timedOut) {
              throw new Error(`大模型调用超时（${llmRequestTimeoutSeconds} 秒）`);
            }
            throw error;
          })
          .finally(() => clearTimeout(timeoutId));

        modelTestLogger.info('model_test.completed', {
          durationMs: Date.now() - testStartedAt,
          textLength: response.text.length,
        });
        return {
          provider: resolvedModel.providerId,
          text: response.text,
        };
      },
    },
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
        reason: describeError(error),
      });
    });
  };
  // 放行令牌放在 storage.session：不持久化、不同步，但能跨 service worker 空闲重启保留。
  const blacklistBypass = createBlacklistBypassState(chrome.storage.session);
  /** 清理某个标签页的放行令牌，失败只记日志。 */
  const clearBypassForTab = (browserTabId: number) => {
    void blacklistBypass.clearTab(browserTabId).catch((error: unknown) => {
      logger.warn('blacklist.bypass.clear_failed', { browserTabId, reason: describeError(error) });
    });
  };
  const browserEntry = createBrowserEntryService({
    logger: logger.child('entry'),
    runtime: chrome.runtime,
    tabs: chrome.tabs,
    sidePanel: chrome.sidePanel,
    panelState: createBrowserEntryPanelState(chrome.storage.session),
    contextMenus: chrome.contextMenus,
    getUiLocale: () => chrome.i18n?.getUILanguage?.() ?? 'en',
  });
  void browserEntry.configureActionClickBehavior().catch((error: unknown) => {
    logger.warn('entry.action_behavior.failed', { reason: describeError(error) });
  });
  const extractionLogger = logger.child('extraction');
  const contentSource = createContentSource({
    logger: extractionLogger,
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

            resolve(response as PageSource);
          });
        }),
      reload: (tabId) =>
        new Promise<void>((resolve) => {
          chrome.tabs.reload(tabId, () => resolve());
        }),
    },
  });
  const extractionService = createExtractionService({
    logger: extractionLogger,
    contentSource,
    jinaClient: createJinaClient(),
    pageRepository,
  });
  const sidebarAutoTriggerService = createSidebarAutoTriggerService({
    logger: logger.child('auto_trigger'),
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
    logger: commandLogger,
    runtime: chrome.runtime,
    pageRepository,
    conversationRepository,
    chatDispatchService,
    conversationExporter,
    sessionRegistry,
    configRepository,
    syncRepository,
    extractionLogger,
    blacklistBypass,
    autoTrigger: sidebarAutoTriggerService,
    extractionService: {
      extractPage: async (input) => {
        const config = await configRepository.getConfig();
        return extractionService.extractPage({
          ...input,
          jinaApiKey: config.basic.jinaApiKey,
          jinaResponseTemplate: config.basic.jinaResponseTemplate,
        });
      },
    },
    blacklistRepository: {
      isBlocked: async ({ browserTabId, normalizedUrl }) => {
        const config = await configRepository.getConfig();
        const service = createBlacklistService({
          rules: config.blacklist,
        });
        return service.checkUrl(normalizedUrl).blocked && !(await blacklistBypass.has(browserTabId, normalizedUrl));
      },
      getMatchedRuleId: async ({ browserTabId, normalizedUrl }) => {
        const config = await configRepository.getConfig();
        const service = createBlacklistService({
          rules: config.blacklist,
        });
        return (await blacklistBypass.has(browserTabId, normalizedUrl)) ? null : service.checkUrl(normalizedUrl).matchedRuleId;
      },
    },
  });
  const handleConversationsChatCommand = createSidebarCommandHandler({
    logger: commandLogger.child('conversations'),
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
    portLogger.info('port.connected', { portId });

    port.onMessage.addListener((message: unknown) => {
      const parsed = sidebarPortClientMessageSchema.safeParse(message);
      if (!parsed.success) {
        portLogger.warn('port.message.rejected', { portId, issues: parsed.error.issues.length });
        return;
      }

      const normalizedUrl = normalizePageUrl(parsed.data.pageUrl);
      portBus.bindPromptTab(portId, {
        normalizedUrl,
        promptTabId: parsed.data.promptTabId,
      });
      const restoreLogger = portLogger.child('restore', {
        portId,
        browserTabId: parsed.data.tabId,
        normalizedUrl,
        promptTab: parsed.data.promptTabId,
      });
      restoreLogger.info('port.restore_requested');

      void startupReconciliation
        .then(() => loadingStateReconciler.reconcilePromptTab(normalizedUrl, parsed.data.promptTabId))
        .then(async (outcome) => {
          // 只有当前 worker 里仍在跑的会话才值得恢复 loading；孤儿已在 reconcile 中收敛并推送失败事件。
          if (outcome !== 'active') {
            restoreLogger.debug('port.restore_skipped', { outcome });
            return;
          }
          const [loadingState, conversation] = await Promise.all([
            conversationRepository.getLoadingState(normalizedUrl, parsed.data.promptTabId),
            conversationRepository.getConversation(normalizedUrl, parsed.data.promptTabId),
          ]);
          if (!loadingState || !conversation) {
            restoreLogger.warn('port.restore_skipped', {
              outcome,
              reason: !loadingState ? 'loading_state_missing' : 'conversation_missing',
            });
            return;
          }

          const loadingAssistantMessage =
            conversation.messages.find((messageRecord) => messageRecord.role === 'assistant' && messageRecord.status === 'loading') ?? null;
          const restoreMessageId = loadingState.resumeTarget?.messageId ?? conversation.lastAssistantState?.messageId ?? loadingAssistantMessage?.id ?? null;
          const restoreMessage =
            conversation.messages.find((messageRecord) => messageRecord.id === restoreMessageId && messageRecord.role === 'assistant') ?? loadingAssistantMessage;

          const hasActiveLoading =
            loadingState.promptTabStatus === 'loading' || loadingState.branchStates.some((branchState) => branchState.status === 'loading');
          if (!restoreMessage || !hasActiveLoading) {
            restoreLogger.warn('port.restore_skipped', {
              outcome,
              reason: !restoreMessage ? 'restore_message_missing' : 'no_active_loading',
              restoreMessageId,
            });
            return;
          }

          restoreLogger.info('port.restore_sent', {
            sessionId: loadingState.sessionId,
            messageId: restoreMessage.id,
            contentLength: restoreMessage.content.length,
            branchCount: loadingState.branchStates.length,
            startedAt: loadingState.startedAt,
          });
          port.postMessage(
            sidebarPortEventSchema.parse({
              type: 'RESTORE_LOADING',
              normalizedUrl,
              promptTabId: parsed.data.promptTabId,
              sessionId: loadingState.sessionId,
              messageId: restoreMessage.id,
              content: restoreMessage.content,
              startedAt: loadingState.startedAt,
              branchStates: loadingState.branchStates,
            }),
          );
        })
        .catch((error: unknown) => {
          restoreLogger.error('port.restore_failed', { reason: describeError(error) });
        });
    });

    port.onDisconnect.addListener(() => {
      portLogger.info('port.disconnected', { portId });
    });
  });

  /** 入口事件是 fire-and-forget，未捕获的 rejection 只记日志。 */
  const runEntryHandler = (event: string, task: Promise<unknown>) => {
    void task.catch((error: unknown) => {
      logger.error('entry.handler.failed', { event, reason: describeError(error) });
    });
  };

  chrome.runtime.onInstalled.addListener((details: { reason: string }) => {
    runEntryHandler('installed', browserEntry.handleInstalled(details));
  });

  browserEntry.registerContextMenu();

  chrome.contextMenus.onClicked.addListener((info: { menuItemId: string | number }) => {
    runEntryHandler('context_menu', browserEntry.handleContextMenuClick(info));
  });

  chrome.tabs.onActivated.addListener((activeInfo) => {
    void blacklistBypass.retainOnlyTab(activeInfo.tabId).catch((error: unknown) => {
      logger.warn('blacklist.bypass.clear_failed', { browserTabId: activeInfo.tabId, reason: describeError(error) });
    });
    runEntryHandler('tab_activated', browserEntry.handleTabActivated(activeInfo));
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tabId && changeInfo.url) {
      clearBypassForTab(tabId);
    }
    runEntryHandler('tab_updated', browserEntry.handleTabUpdated(tabId, changeInfo, tab));
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    clearBypassForTab(tabId);
    runEntryHandler('tab_removed', browserEntry.handleTabRemoved(tabId));
  });

  if (chrome.action?.onClicked) {
    chrome.action.onClicked.addListener((tab) => {
      if (tab?.id) {
        clearBypassForTab(tab.id);
      }
      void browserEntry.handleBrowserActionClick(tab).catch((error: unknown) => {
        logger.error('entry.action.failed', { browserTabId: tab?.id, reason: describeError(error) });
      });
    });
  } else {
    logger.warn('entry.action.unavailable');
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (typeof message === 'object' && message !== null && (message as { type?: string }).type === '__E2E_BROWSER_ACTION_CLICK__') {
      clearBypassForTab((message as { tabId: number }).tabId);
      void browserEntry
        .handleE2EBrowserActionClick(message as { type: '__E2E_BROWSER_ACTION_CLICK__'; tabId: number; pageUrl: string })
        .then((result) => sendResponse(result))
        .catch((error: unknown) => {
          const reason = describeError(error);
          logger.error('entry.action.failed', { browserTabId: (message as { tabId?: number }).tabId, source: 'e2e', reason });
          sendResponse({ error: reason });
        });
      return true;
    }

    if (isSidebarCommandMessage(message)) {
      const senderInfo = {
        id: (sender as { id?: string | null }).id ?? null,
        url: (sender as { url?: string | null }).url ?? null,
      };

      const runtimeId = chrome.runtime.id;
      const commandHandler = isSidebarPageSender(senderInfo, runtimeId)
        ? handleSidebarCommand
        : isConversationsPageSender(senderInfo, runtimeId)
          ? handleConversationsChatCommand
          : handleSidebarCommand;

      const isConversationsSender = isConversationsPageSender(senderInfo, runtimeId);
      const commandScope = {
        source: isConversationsSender ? 'conversations' : 'sidebar',
        type: message.type,
        browserTabId: 'tabId' in message && typeof message.tabId === 'number' ? message.tabId : undefined,
      };
      const commandStartedAt = Date.now();
      void commandHandler(message, { sender: senderInfo })
        .then((result) => {
          commandLogger.debug('command.completed', { ...commandScope, durationMs: Date.now() - commandStartedAt });
          sendResponse(result);
        })
        .catch((error: unknown) => {
          const reason = describeError(error);
          commandLogger.error('command.failed', { ...commandScope, durationMs: Date.now() - commandStartedAt, reason });
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
      const commandStartedAt = Date.now();
      void handleConversationsCommand(message, {
        sender: {
          id: (sender as { id?: string | null }).id ?? null,
          url: (sender as { url?: string | null }).url ?? null,
        },
      })
        .then((result) => {
          commandLogger.debug('command.completed', { source: 'conversations', type, durationMs: Date.now() - commandStartedAt });
          sendResponse(result);
        })
        .catch((error: unknown) => {
          const reason = describeError(error);
          commandLogger.error('command.failed', { source: 'conversations', type, durationMs: Date.now() - commandStartedAt, reason });
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
    const commandStartedAt = Date.now();
    void handleConfigCommand(message)
      .then((result) => {
        commandLogger.debug('command.completed', { source: 'config', type, durationMs: Date.now() - commandStartedAt });
        sendResponse(result);
      })
      .catch((error: unknown) => {
        const reason = describeError(error);
        commandLogger.error('command.failed', { source: 'config', type, durationMs: Date.now() - commandStartedAt, reason });
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
