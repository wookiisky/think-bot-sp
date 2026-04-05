import { describe, expect, it, vi } from 'vitest';

import { createDefaultConfig } from '../../../src/domain/config/config-schema';
import { createSidebarAutoTriggerService } from '../../../src/services/sidebar-auto-trigger/sidebar-auto-trigger-service';

describe('sidebar-auto-trigger-service', () => {
  it('提取成功后会自动触发符合条件的 quickInput，并在完成后写回 done', async () => {
    const setPromptTabState = vi.fn().mockResolvedValue(undefined);
    const register = vi.fn();
    const dispatchChat = vi.fn();
    const session = {
      sessionId: 'session-auto-1',
      messageId: 'assistant-auto-1',
      cancel: vi.fn(),
      done: Promise.resolve({
        sessionId: 'session-auto-1',
        messageId: 'assistant-auto-1',
        status: 'done' as const,
        errorMessage: null,
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
                temperature: 0,
                tools: [],
                thinkingBudget: null,
                maxOutputTokens: null,
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
        dispatchChat: dispatchChat.mockResolvedValue(session),
      },
      sessionRegistry: {
        register,
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
    });
    expect(register).toHaveBeenCalledWith(session, {
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'quick-summary',
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
      sessionId: 'session-auto-safe',
      messageId: 'assistant-auto-safe',
      cancel: vi.fn(),
      done: Promise.resolve({
        sessionId: 'session-auto-safe',
        messageId: 'assistant-auto-safe',
        status: 'done' as const,
        errorMessage: null,
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
                temperature: 0,
                tools: [],
                thinkingBudget: null,
                maxOutputTokens: null,
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
        register: vi.fn(),
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
                temperature: 0,
                tools: [],
                thinkingBudget: null,
                maxOutputTokens: null,
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
        register: vi.fn(),
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
                temperature: 0,
                tools: [],
                thinkingBudget: null,
                maxOutputTokens: null,
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
        register: vi.fn(),
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
    });
  });

  it('调度失败时会把自动触发状态写成 error', async () => {
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
                temperature: 0,
                tools: [],
                thinkingBudget: null,
                maxOutputTokens: null,
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
        register: vi.fn(),
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
      autoTriggerStatus: 'error',
    });
  });
});
