import { describe, expect, it, vi } from 'vitest';

import { createDefaultConfig, modelConfigSchema } from '../../../src/domain/config/config-schema';
import { createSidebarSessionRegistry } from '../../../src/services/runtime-messaging/sidebar-session-registry';
import { createSidebarAutoTriggerService } from '../../../src/services/sidebar-auto-trigger/sidebar-auto-trigger-service';
import { createControlledSidebarSession } from '../../helpers/controlled-sidebar-session';

describe('sidebar-auto-trigger-service', () => {
  it('自动触发的附加分支可以独立停止，删除等待分支持久化收尾', async () => {
    const registry = createSidebarSessionRegistry();
    const coordinator = createControlledSidebarSession('auto-main');
    const branch = createControlledSidebarSession('auto-other');
    const service = createSidebarAutoTriggerService({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      configRepository: { getConfig: async () => createDefaultConfig({
        models: [modelConfigSchema.parse({ id: 'model', name: 'model', provider: 'openai-compatible', enabled: true,
          model: 'model', baseUrl: 'https://example.com', apiKey: 'test', deployment: '', tools: [],
          thinkingBudget: null, supportsImages: true, order: 0, deletedAt: null })],
        quickInputs: [{ id: 'summary', name: 'summary', prompt: 'summarize',
          autoTrigger: true, modelId: 'model', parallelModelIds: ['other'], order: 0, deletedAt: null }],
      }) },
      pageRepository: { getPage: async () => null, setPromptTabState: vi.fn().mockResolvedValue(undefined) },
      conversationRepository: { getConversation: async () => null, getLoadingState: async () => null },
      chatDispatchService: { dispatchChat: async () => ({ ...coordinator, branchSessions: [branch] }) },
      sessionRegistry: registry,
    });
    const normalizedUrl = 'https://example.com/article';
    await service.handleExtractionCompleted({ browserTabId: 1, pageUrl: normalizedUrl, normalizedUrl, pageContent: 'body' });
    const scope = { normalizedUrl, promptTabId: 'summary', branchId: branch.branchId };
    expect(registry.cancelBranchSession(scope)).toBe(true);
    expect(branch.cancel).toHaveBeenCalledOnce();
    expect(coordinator.cancel).not.toHaveBeenCalled();
    let removed = false;
    const deletion = registry.cancelBranchSessionAndWait(scope).then((result) => { removed = true; return result; });
    await Promise.resolve();
    expect(removed).toBe(false);
    branch.finish();
    await expect(deletion).resolves.toBe(true);
    coordinator.finish();
  });

  it('提取成功后会自动触发符合条件的 quickInput，并在完成后写回 done', async () => {
    const setIncludePageContent = vi.fn().mockResolvedValue(undefined);
    const setPromptTabState = vi.fn().mockResolvedValue(undefined);
    const registerTurn = vi.fn();
    const dispatchChat = vi.fn();
    const session = {
      branchSessions: [],
      sessionId: 'session-auto-1',
      messageId: 'assistant-auto-1',
      cancel: vi.fn(),
      done: Promise.resolve({
        sessionId: 'session-auto-1',
        messageId: 'assistant-auto-1',
        status: 'done' as const,
        errorMessage: null,
        persisted: true,
      }),
    };
    const service = createSidebarAutoTriggerService({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      configRepository: {
        getConfig: vi.fn().mockResolvedValue(
          createDefaultConfig({
            basic: {
              defaultModelId: 'model-1',
            },
            models: [
              {
                id: 'model-1',
                name: '主模型',
                provider: 'openai-compatible',
                enabled: true,
                model: 'gpt-4.1-mini',
                baseUrl: 'https://api.example.com',
                apiKey: 'token',
                deployment: '',
                tools: [],
                thinkingBudget: null,
                supportsImages: true,
                order: 0,
                deletedAt: null,
              },
            ],
            quickInputs: [
              {
                id: 'quick-summary',
                name: '总结',
                prompt: '请总结当前页面',
                autoTrigger: true,
                modelId: 'model-1',
                parallelModelIds: [],
                order: 0,
                deletedAt: null,
              },
            ],
          }),
        ),
      },
      pageRepository: {
        getPage: vi
          .fn()
          .mockResolvedValueOnce({
            promptTabStates: [],
          })
          .mockResolvedValueOnce({
            promptTabStates: [
              {
                promptTabId: 'quick-summary',
                initializedAt: 100,
                lastAutoTriggerAt: 100,
                autoTriggerStatus: 'running',
                lastClearedAt: null,
              },
            ],
          }),
        setIncludePageContent,
        setPromptTabState,
      },
      conversationRepository: {
        getConversation: vi.fn().mockResolvedValue(null),
        getLoadingState: vi.fn().mockResolvedValue(null),
      },
      chatDispatchService: {
        dispatchChat: dispatchChat.mockResolvedValue(session),
      },
      sessionRegistry: {
        registerTurn,
      },
      now: () => 100,
    });

    await service.handleExtractionCompleted({
      browserTabId: 7,
      pageUrl: 'https://example.com/article',
      normalizedUrl: 'https://example.com/article',
      pageContent: '页面正文',
    });
    await Promise.resolve();

    expect(setIncludePageContent).toHaveBeenCalledWith({
      normalizedUrl: 'https://example.com/article',
      url: 'https://example.com/article',
      includePageContent: true,
    });
    expect(setPromptTabState).toHaveBeenNthCalledWith(1, {
      normalizedUrl: 'https://example.com/article',
      url: 'https://example.com/article',
      promptTabId: 'quick-summary',
      initializedAt: 100,
      lastAutoTriggerAt: 100,
      autoTriggerStatus: 'running',
    });
    expect(dispatchChat).toHaveBeenCalledWith({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'quick-summary',
      modelId: 'model-1',
      content: '请总结当前页面',
      displayText: '总结',
      images: [],
      pageContent: '页面正文',
      rollbackOnFailure: true,
    });
    expect(registerTurn).toHaveBeenCalledWith({
      coordinator: session,
      branchSessions: [],
      scope: {
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'quick-summary',
      },
    });
    expect(setPromptTabState).toHaveBeenNthCalledWith(2, {
      normalizedUrl: 'https://example.com/article',
      url: 'https://example.com/article',
      promptTabId: 'quick-summary',
      autoTriggerStatus: 'done',
    });
  });

  it('完成收敛时缺少目标 promptTab 状态也会安全写回 done', async () => {
    const setPromptTabState = vi.fn().mockResolvedValue(undefined);
    const session = {
      branchSessions: [],
      sessionId: 'session-auto-safe',
      messageId: 'assistant-auto-safe',
      cancel: vi.fn(),
      done: Promise.resolve({
        sessionId: 'session-auto-safe',
        messageId: 'assistant-auto-safe',
        status: 'done' as const,
        errorMessage: null,
        persisted: true,
      }),
    };
    const service = createSidebarAutoTriggerService({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      configRepository: {
        getConfig: vi.fn().mockResolvedValue(
          createDefaultConfig({
            basic: {
              defaultModelId: 'model-1',
            },
            models: [
              {
                id: 'model-1',
                name: '主模型',
                provider: 'openai-compatible',
                enabled: true,
                model: 'gpt-4.1-mini',
                baseUrl: 'https://api.example.com',
                apiKey: 'token',
                deployment: '',
                tools: [],
                thinkingBudget: null,
                supportsImages: true,
                order: 0,
                deletedAt: null,
              },
            ],
            quickInputs: [
              {
                id: 'quick-summary',
                name: '总结',
                prompt: '请总结当前页面',
                autoTrigger: true,
                modelId: 'model-1',
                parallelModelIds: [],
                order: 0,
                deletedAt: null,
              },
            ],
          }),
        ),
      },
      pageRepository: {
        getPage: vi
          .fn()
          .mockResolvedValueOnce({
            promptTabStates: [],
          })
          .mockResolvedValueOnce({
            promptTabStates: [],
          }),
        setPromptTabState,
      },
      conversationRepository: {
        getConversation: vi.fn().mockResolvedValue(null),
        getLoadingState: vi.fn().mockResolvedValue(null),
      },
      chatDispatchService: {
        dispatchChat: vi.fn().mockResolvedValue(session),
      },
      sessionRegistry: {
        registerTurn: vi.fn(),
      },
      now: () => 100,
    });

    await service.handleExtractionCompleted({
      browserTabId: 7,
      pageUrl: 'https://example.com/article',
      normalizedUrl: 'https://example.com/article',
      pageContent: '页面正文',
    });
    await Promise.resolve();

    expect(setPromptTabState).toHaveBeenNthCalledWith(2, {
      normalizedUrl: 'https://example.com/article',
      url: 'https://example.com/article',
      promptTabId: 'quick-summary',
      autoTriggerStatus: 'done',
    });
  });

  it('会话失败且消息已回滚时，不持久化 auto error 状态', async () => {
    const setPromptTabState = vi.fn().mockResolvedValue(undefined);
    const session = {
      branchSessions: [],
      sessionId: 'session-auto-rollback',
      messageId: 'assistant-auto-rollback',
      cancel: vi.fn(),
      done: Promise.resolve({
        sessionId: 'session-auto-rollback',
        messageId: 'assistant-auto-rollback',
        status: 'error' as const,
        errorMessage: 'provider timeout',
        persisted: false,
      }),
    };
    const service = createSidebarAutoTriggerService({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      configRepository: {
        getConfig: vi.fn().mockResolvedValue(
          createDefaultConfig({
            basic: {
              defaultModelId: 'model-1',
            },
            models: [
              {
                id: 'model-1',
                name: '主模型',
                provider: 'openai-compatible',
                enabled: true,
                model: 'gpt-4.1-mini',
                baseUrl: 'https://api.example.com',
                apiKey: 'token',
                deployment: '',
                tools: [],
                thinkingBudget: null,
                supportsImages: true,
                order: 0,
                deletedAt: null,
              },
            ],
            quickInputs: [
              {
                id: 'quick-summary',
                name: '总结',
                prompt: '请总结当前页面',
                autoTrigger: true,
                modelId: 'model-1',
                parallelModelIds: [],
                order: 0,
                deletedAt: null,
              },
            ],
          }),
        ),
      },
      pageRepository: {
        getPage: vi
          .fn()
          .mockResolvedValueOnce({
            promptTabStates: [],
          })
          .mockResolvedValueOnce({
            promptTabStates: [
              {
                promptTabId: 'quick-summary',
                initializedAt: 100,
                lastAutoTriggerAt: 100,
                autoTriggerStatus: 'running',
                lastClearedAt: null,
              },
            ],
          }),
        setPromptTabState,
      },
      conversationRepository: {
        getConversation: vi.fn().mockResolvedValue(null),
        getLoadingState: vi.fn().mockResolvedValue(null),
      },
      chatDispatchService: {
        dispatchChat: vi.fn().mockResolvedValue(session),
      },
      sessionRegistry: {
        registerTurn: vi.fn(),
      },
      now: () => 100,
    });

    await service.handleExtractionCompleted({
      browserTabId: 7,
      pageUrl: 'https://example.com/article',
      normalizedUrl: 'https://example.com/article',
      pageContent: '页面正文',
    });
    await Promise.resolve();

    expect(setPromptTabState).toHaveBeenNthCalledWith(2, {
      normalizedUrl: 'https://example.com/article',
      url: 'https://example.com/article',
      promptTabId: 'quick-summary',
      autoTriggerStatus: 'idle',
    });
  });

  it('已有历史或 loading 时不会重复自动触发', async () => {
    const dispatchChat = vi.fn();
    const service = createSidebarAutoTriggerService({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      configRepository: {
        getConfig: vi.fn().mockResolvedValue(
          createDefaultConfig({
            basic: {
              defaultModelId: 'model-1',
            },
            models: [
              {
                id: 'model-1',
                name: '主模型',
                provider: 'openai-compatible',
                enabled: true,
                model: 'gpt-4.1-mini',
                baseUrl: 'https://api.example.com',
                apiKey: 'token',
                deployment: '',
                tools: [],
                thinkingBudget: null,
                supportsImages: true,
                order: 0,
                deletedAt: null,
              },
            ],
            quickInputs: [
              {
                id: 'quick-summary',
                name: '总结',
                prompt: '请总结当前页面',
                autoTrigger: true,
                modelId: 'model-1',
                parallelModelIds: [],
                order: 0,
                deletedAt: null,
              },
            ],
          }),
        ),
      },
      pageRepository: {
        getPage: vi.fn().mockResolvedValue({
          promptTabStates: [
            {
              promptTabId: 'quick-summary',
              initializedAt: 90,
              lastAutoTriggerAt: 90,
              autoTriggerStatus: 'done',
              lastClearedAt: null,
            },
          ],
        }),
        setPromptTabState: vi.fn(),
      },
      conversationRepository: {
        getConversation: vi.fn().mockResolvedValue({
          messages: [{}],
        }),
        getLoadingState: vi.fn().mockResolvedValue({
          promptTabStatus: 'loading',
        }),
      },
      chatDispatchService: {
        dispatchChat,
      },
      sessionRegistry: {
        registerTurn: vi.fn(),
      },
    });

    await service.handleExtractionCompleted({
      browserTabId: 7,
      pageUrl: 'https://example.com/article',
      normalizedUrl: 'https://example.com/article',
      pageContent: '页面正文',
    });

    expect(dispatchChat).not.toHaveBeenCalled();
  });

  it('没有历史时即使已有 initializedAt 也会重新自动触发', async () => {
    const dispatchChat = vi.fn().mockResolvedValue({
      sessionId: 'session-auto-2',
      messageId: 'assistant-auto-2',
      cancel: vi.fn(),
      done: Promise.resolve({
        sessionId: 'session-auto-2',
        messageId: 'assistant-auto-2',
        status: 'done' as const,
        errorMessage: null,
        persisted: true,
      }),
    });
    const service = createSidebarAutoTriggerService({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      configRepository: {
        getConfig: vi.fn().mockResolvedValue(
          createDefaultConfig({
            basic: {
              defaultModelId: 'model-1',
            },
            models: [
              {
                id: 'model-1',
                name: '主模型',
                provider: 'openai-compatible',
                enabled: true,
                model: 'gpt-4.1-mini',
                baseUrl: 'https://api.example.com',
                apiKey: 'token',
                deployment: '',
                tools: [],
                thinkingBudget: null,
                supportsImages: true,
                order: 0,
                deletedAt: null,
              },
            ],
            quickInputs: [
              {
                id: 'quick-summary',
                name: '总结',
                prompt: '请总结当前页面',
                autoTrigger: true,
                modelId: 'model-1',
                parallelModelIds: [],
                order: 0,
                deletedAt: null,
              },
            ],
          }),
        ),
      },
      pageRepository: {
        getPage: vi.fn().mockResolvedValue({
          promptTabStates: [
            {
              promptTabId: 'quick-summary',
              initializedAt: 90,
              lastAutoTriggerAt: 90,
              autoTriggerStatus: 'error',
              lastClearedAt: null,
            },
          ],
        }),
        setPromptTabState: vi.fn().mockResolvedValue(undefined),
      },
      conversationRepository: {
        getConversation: vi.fn().mockResolvedValue(null),
        getLoadingState: vi.fn().mockResolvedValue(null),
      },
      chatDispatchService: {
        dispatchChat,
      },
      sessionRegistry: {
        registerTurn: vi.fn(),
      },
      now: () => 100,
    });

    await service.handleExtractionCompleted({
      browserTabId: 7,
      pageUrl: 'https://example.com/article',
      normalizedUrl: 'https://example.com/article',
      pageContent: '页面正文',
    });

    expect(dispatchChat).toHaveBeenCalledWith({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'quick-summary',
      modelId: 'model-1',
      content: '请总结当前页面',
      displayText: '总结',
      images: [],
      pageContent: '页面正文',
      rollbackOnFailure: true,
    });
  });

  it('调度失败时只展示错误，不持久化 auto error 状态', async () => {
    const setPromptTabState = vi.fn().mockResolvedValue(undefined);
    const service = createSidebarAutoTriggerService({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      configRepository: {
        getConfig: vi.fn().mockResolvedValue(
          createDefaultConfig({
            basic: {
              defaultModelId: 'model-1',
            },
            models: [
              {
                id: 'model-1',
                name: '主模型',
                provider: 'openai-compatible',
                enabled: true,
                model: 'gpt-4.1-mini',
                baseUrl: 'https://api.example.com',
                apiKey: 'token',
                deployment: '',
                tools: [],
                thinkingBudget: null,
                supportsImages: true,
                order: 0,
                deletedAt: null,
              },
            ],
            quickInputs: [
              {
                id: 'quick-summary',
                name: '总结',
                prompt: '请总结当前页面',
                autoTrigger: true,
                modelId: 'model-1',
                parallelModelIds: [],
                order: 0,
                deletedAt: null,
              },
            ],
          }),
        ),
      },
      pageRepository: {
        getPage: vi.fn().mockResolvedValue({
          promptTabStates: [],
        }),
        setPromptTabState,
      },
      conversationRepository: {
        getConversation: vi.fn().mockResolvedValue(null),
        getLoadingState: vi.fn().mockResolvedValue(null),
      },
      chatDispatchService: {
        dispatchChat: vi.fn().mockRejectedValue(new Error('dispatch failed')),
      },
      sessionRegistry: {
        registerTurn: vi.fn(),
      },
      now: () => 100,
    });

    await service.handleExtractionCompleted({
      browserTabId: 7,
      pageUrl: 'https://example.com/article',
      normalizedUrl: 'https://example.com/article',
      pageContent: '页面正文',
    });

    expect(setPromptTabState).toHaveBeenNthCalledWith(1, {
      normalizedUrl: 'https://example.com/article',
      url: 'https://example.com/article',
      promptTabId: 'quick-summary',
      initializedAt: 100,
      lastAutoTriggerAt: 100,
      autoTriggerStatus: 'running',
    });
    expect(setPromptTabState).toHaveBeenNthCalledWith(2, {
      normalizedUrl: 'https://example.com/article',
      url: 'https://example.com/article',
      promptTabId: 'quick-summary',
      autoTriggerStatus: 'idle',
    });
  });

  it('标记 running 之前的存储失败不会抛出，也不会尝试回退状态', async () => {
    const setPromptTabState = vi.fn().mockRejectedValue(new Error('storage unavailable'));
    const dispatchChat = vi.fn();
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const service = createSidebarAutoTriggerService({
      logger,
      configRepository: {
        getConfig: vi.fn().mockResolvedValue(
          createDefaultConfig({
            basic: {
              defaultModelId: 'model-1',
            },
            models: [
              modelConfigSchema.parse({
                id: 'model-1',
                name: '主模型',
                provider: 'openai-compatible',
                enabled: true,
                model: 'gpt-4.1-mini',
                baseUrl: 'https://api.example.com',
                apiKey: 'token',
                deployment: '',
                tools: [],
                thinkingBudget: null,
                supportsImages: true,
                order: 0,
                deletedAt: null,
              }),
            ],
            quickInputs: [
              {
                id: 'quick-summary',
                name: '总结',
                prompt: '请总结当前页面',
                autoTrigger: true,
                modelId: 'model-1',
                parallelModelIds: [],
                order: 0,
                deletedAt: null,
              },
            ],
          }),
        ),
      },
      pageRepository: {
        getPage: vi.fn().mockResolvedValue(null),
        setPromptTabState,
      },
      conversationRepository: {
        getConversation: vi.fn().mockResolvedValue(null),
        getLoadingState: vi.fn().mockResolvedValue(null),
      },
      chatDispatchService: {
        dispatchChat,
      },
      sessionRegistry: {
        registerTurn: vi.fn(),
      },
      now: () => 100,
    });

    await expect(
      service.handleExtractionCompleted({
        browserTabId: 7,
        pageUrl: 'https://example.com/article',
        normalizedUrl: 'https://example.com/article',
        pageContent: '页面正文',
      }),
    ).resolves.toBeUndefined();

    expect(dispatchChat).not.toHaveBeenCalled();
    expect(setPromptTabState).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('auto_trigger.failed', expect.objectContaining({
      promptTab: 'quick-summary',
      reason: 'storage unavailable',
    }));
  });
});
