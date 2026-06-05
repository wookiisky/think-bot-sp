import { describe, expect, it, vi } from 'vitest';

import { createDefaultConfig } from '../../../../src/domain/config/config-schema';
import { createChromeLocalAdapter } from '../../../../src/repositories/chrome-local-adapter';
import { createConversationRepository } from '../../../../src/repositories/conversation-repository';
import { createChatDispatchService } from '../../../../src/services/llm-dispatch/chat-dispatch-service';
import { createFakeStorageArea } from '../../../helpers/fake-storage';

type Deferred = {
  /** 异步控制用 promise。 */
  promise: Promise<void>;
  /** 主动放行。 */
  resolve: () => void;
  /** 主动失败。 */
  reject: (_error: Error) => void;
};

/** 创建受控异步门闩。 */
const createDeferred = (): Deferred => {
  let resolve: () => void = () => undefined;
  let reject: (_error: Error) => void = () => undefined;
  const promise = new Promise<void>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
};

/** 创建 AbortError，贴近浏览器中止语义。 */
const createAbortError = (): Error => {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
};

/** 提取发布事件序列，锁定顺序与互斥。 */
const collectPublishedEvents = (publishToPromptTab: ReturnType<typeof vi.fn>) =>
  publishToPromptTab.mock.calls.map(([event]) => event);

describe('chat-dispatch-service session lifecycle', () => {
  it('完成流式输出后会收敛助手消息并清理 loading', async () => {
    const storage = createFakeStorageArea();
    const conversationRepository = createConversationRepository(createChromeLocalAdapter(storage));
    const configRepository = {
      getModelById: vi.fn().mockResolvedValue({
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
      }),
    };
    const providerRegistry = {
      resolveProviderModel: vi.fn().mockReturnValue({
        providerId: 'openai-compatible',
        modelId: 'gpt-4.1-mini',
        modelLabel: '主模型',
        supportsImages: true,
        sdkModel: { kind: 'sdk-model' },
      }),
    };
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const publishToPromptTab = vi.fn();
    const service = createChatDispatchService({
      configRepository,
      providerRegistry,
      conversationRepository,
      logger,
      portBus: {
        publishToPromptTab,
      },
      streamText: vi.fn().mockImplementation(async ({ model, messages }) => {
        expect(model).toEqual({ kind: 'sdk-model' });
        expect(messages).toEqual([
          {
            role: 'user',
            content: '请总结页面',
            images: [],
          },
        ]);
        return {
          textStream: (async function* () {
            yield '第一段';
            yield '第二段';
          })(),
        };
      }),
      createSessionId: () => 'session-1',
      createMessageId: (() => {
        const ids = ['user-1', 'assistant-1', 'branch-1'];
        return () => ids.shift() ?? 'exhausted';
      })(),
      now: (() => {
        const values = [10, 11, 12, 13, 14];
        return () => values.shift() ?? 99;
      })(),
    });

    const session = await service.dispatchChat({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      modelId: 'model-1',
      content: '请总结页面',
      images: [],
      pageContent: '',
    });

    await expect(session.done).resolves.toMatchObject({
      sessionId: 'session-1',
      messageId: 'assistant-1',
      status: 'done',
    });
    await expect(conversationRepository.getLoadingState('https://example.com/article', 'chat')).resolves.toBeNull();
    expect(logger.info).toHaveBeenCalledWith('chat.stream.started', {
      normalizedUrl: 'https://example.com/article',
      promptTab: 'chat',
      sessionId: 'session-1',
      messageId: 'assistant-1',
      provider: 'openai-compatible',
    });
    expect(logger.info).toHaveBeenCalledWith('chat.stream.first_chunk', {
      normalizedUrl: 'https://example.com/article',
      promptTab: 'chat',
      sessionId: 'session-1',
      messageId: 'assistant-1',
    });
    expect(logger.info).toHaveBeenCalledWith('chat.stream.completed', {
      normalizedUrl: 'https://example.com/article',
      promptTab: 'chat',
      sessionId: 'session-1',
      messageId: 'assistant-1',
    });
    await expect(conversationRepository.getConversation('https://example.com/article', 'chat')).resolves.toMatchObject({
      messages: [
        expect.objectContaining({
          id: 'user-1',
          role: 'user',
          content: '请总结页面',
          status: 'done',
        }),
        expect.objectContaining({
          id: 'assistant-1',
          role: 'assistant',
          content: '第一段第二段',
          status: 'done',
        }),
      ],
      lastAssistantState: {
        messageId: 'assistant-1',
        status: 'done',
        summary: '第一段第二段',
      },
    });
    expect(collectPublishedEvents(publishToPromptTab)).toEqual([
      {
        type: 'CHAT_STREAM_STARTED',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-1',
        messageId: 'assistant-1',
        branchId: 'branch-1',
        modelId: 'model-1',
        modelLabel: '主模型',
      },
      {
        type: 'CHAT_STREAM_CHUNK',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-1',
        messageId: 'assistant-1',
        branchId: 'branch-1',
        chunk: '第一段',
      },
      {
        type: 'CHAT_STREAM_CHUNK',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-1',
        messageId: 'assistant-1',
        branchId: 'branch-1',
        chunk: '第二段',
      },
      {
        type: 'CHAT_STREAM_FINISHED',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-1',
        messageId: 'assistant-1',
        branchId: 'branch-1',
      },
      {
        type: 'LOADING_STATE_UPDATE',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-1',
        status: 'done',
      },
    ]);
  });

  it('带页面正文时会把正文和用户消息一起注入模型上下文', async () => {
    const storage = createFakeStorageArea();
    const conversationRepository = createConversationRepository(createChromeLocalAdapter(storage));
    const streamText = vi.fn().mockResolvedValue({
      textStream: (async function* () {
        yield '已结合页面内容';
      })(),
    });
    const service = createChatDispatchService({
      configRepository: {
        getModelById: vi.fn().mockResolvedValue({
          id: 'model-ctx',
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
        }),
      },
      providerRegistry: {
        resolveProviderModel: vi.fn().mockReturnValue({
          providerId: 'openai-compatible',
          modelId: 'gpt-4.1-mini',
          modelLabel: '主模型',
          supportsImages: true,
          sdkModel: { kind: 'sdk-model' },
        }),
      },
      conversationRepository,
      portBus: {
        publishToPromptTab: vi.fn(),
      },
      streamText,
      createSessionId: () => 'session-ctx',
      createMessageId: (() => {
        const ids = ['user-ctx', 'assistant-ctx'];
        return () => ids.shift() ?? 'exhausted';
      })(),
      now: (() => {
        const values = [15, 16, 17, 18];
        return () => values.shift() ?? 99;
      })(),
    });

    const session = await service.dispatchChat({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      modelId: 'model-ctx',
      content: '请总结重点',
      images: [],
      pageContent: 'Example Domain 页面正文',
    });

    await session.done;
    expect(streamText).toHaveBeenCalledWith({
      model: { kind: 'sdk-model' },
      messages: [
        {
          role: 'system',
          content: '# Page Content\nExample Domain 页面正文',
          images: [],
        },
        {
          role: 'user',
          content: '请总结重点',
          images: [],
        },
      ],
      abortSignal: expect.any(AbortSignal),
    });
  });

  it('cancel 会把助手消息收敛为 cancelled 并清理 loading', async () => {
    const storage = createFakeStorageArea();
    const conversationRepository = createConversationRepository(createChromeLocalAdapter(storage));
    const gate = createDeferred();
    const configRepository = {
      getModelById: vi.fn().mockResolvedValue({
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
      }),
    };
    const providerRegistry = {
      resolveProviderModel: vi.fn().mockReturnValue({
        providerId: 'openai-compatible',
        modelId: 'gpt-4.1-mini',
        modelLabel: '主模型',
        supportsImages: true,
        sdkModel: { kind: 'sdk-model' },
      }),
    };
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const firstChunkPublished = createDeferred();
    const publishToPromptTab = vi.fn((event: { type: string }) => {
      if (event.type === 'CHAT_STREAM_CHUNK') {
        firstChunkPublished.resolve();
      }
    });
    const service = createChatDispatchService({
      configRepository,
      providerRegistry,
      conversationRepository,
      logger,
      portBus: {
        publishToPromptTab,
      },
      streamText: vi.fn().mockImplementation(async ({ abortSignal }) => {
        abortSignal.addEventListener('abort', () => {
          gate.reject(createAbortError());
        });
        return {
          textStream: (async function* () {
            yield '第一段';
            await gate.promise;
            yield '不会到这里';
          })(),
        };
      }),
      createSessionId: () => 'session-2',
      createMessageId: (() => {
        const ids = ['user-2', 'assistant-2', 'branch-2'];
        return () => ids.shift() ?? 'exhausted';
      })(),
      now: (() => {
        const values = [20, 21, 22, 23];
        return () => values.shift() ?? 99;
      })(),
    });

    const session = await service.dispatchChat({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      modelId: 'model-1',
      content: '继续补全',
      images: [],
      pageContent: '',
    });

    await firstChunkPublished.promise;
    session.cancel();

    await expect(session.done).resolves.toMatchObject({
      sessionId: 'session-2',
      messageId: 'assistant-2',
      status: 'cancelled',
    });
    await expect(conversationRepository.getLoadingState('https://example.com/article', 'chat')).resolves.toBeNull();
    expect(logger.info).toHaveBeenCalledWith('chat.stream.cancelled', {
      normalizedUrl: 'https://example.com/article',
      promptTab: 'chat',
      sessionId: 'session-2',
      messageId: 'assistant-2',
    });
    await expect(conversationRepository.getConversation('https://example.com/article', 'chat')).resolves.toMatchObject({
      messages: [
        expect.objectContaining({
          id: 'user-2',
          role: 'user',
          content: '继续补全',
          status: 'done',
        }),
        expect.objectContaining({
          id: 'assistant-2',
          content: '第一段',
          status: 'cancelled',
          errorMessage: 'stream cancelled',
        }),
      ],
      lastAssistantState: {
        messageId: 'assistant-2',
        status: 'cancelled',
        summary: '第一段',
      },
    });
    expect(collectPublishedEvents(publishToPromptTab)).toEqual([
      {
        type: 'CHAT_STREAM_STARTED',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-2',
        messageId: 'assistant-2',
        branchId: 'branch-2',
        modelId: 'model-1',
        modelLabel: '主模型',
      },
      {
        type: 'CHAT_STREAM_CHUNK',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-2',
        messageId: 'assistant-2',
        branchId: 'branch-2',
        chunk: '第一段',
      },
      {
        type: 'CHAT_STREAM_CANCELLED',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-2',
        messageId: 'assistant-2',
        branchId: 'branch-2',
      },
      {
        type: 'LOADING_STATE_UPDATE',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-2',
        status: 'cancelled',
      },
    ]);
  });

  it('流式异常会把助手消息收敛为 error 并清理 loading', async () => {
    const storage = createFakeStorageArea();
    const conversationRepository = createConversationRepository(createChromeLocalAdapter(storage));
    const configRepository = {
      getModelById: vi.fn().mockResolvedValue({
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
      }),
    };
    const providerRegistry = {
      resolveProviderModel: vi.fn().mockReturnValue({
        providerId: 'openai-compatible',
        modelId: 'gpt-4.1-mini',
        modelLabel: '主模型',
        supportsImages: true,
        sdkModel: { kind: 'sdk-model' },
      }),
    };
    const publishToPromptTab = vi.fn();
    const service = createChatDispatchService({
      configRepository,
      providerRegistry,
      conversationRepository,
      portBus: {
        publishToPromptTab,
      },
      streamText: vi.fn().mockResolvedValue({
        textStream: (async function* () {
          yield '第一段';
          throw new Error('provider timeout');
        })(),
      }),
      createSessionId: () => 'session-3',
      createMessageId: (() => {
        const ids = ['user-3', 'assistant-3', 'branch-3'];
        return () => ids.shift() ?? 'exhausted';
      })(),
      now: (() => {
        const values = [30, 31, 32, 33];
        return () => values.shift() ?? 99;
      })(),
    });

    const session = await service.dispatchChat({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      modelId: 'model-1',
      content: '继续补全',
      images: [],
      pageContent: '',
    });

    await expect(session.done).resolves.toMatchObject({
      sessionId: 'session-3',
      messageId: 'assistant-3',
      status: 'error',
      errorMessage: 'provider timeout',
      persisted: true,
    });
    await expect(conversationRepository.getLoadingState('https://example.com/article', 'chat')).resolves.toBeNull();
    await expect(conversationRepository.getConversation('https://example.com/article', 'chat')).resolves.toMatchObject({
      messages: [
        expect.objectContaining({
          id: 'user-3',
          role: 'user',
          content: '继续补全',
          status: 'done',
        }),
        expect.objectContaining({
          id: 'assistant-3',
          content: '第一段',
          status: 'error',
          errorMessage: 'provider timeout',
        }),
      ],
      lastAssistantState: {
        messageId: 'assistant-3',
        status: 'error',
        summary: '第一段',
      },
    });
    expect(collectPublishedEvents(publishToPromptTab)).toEqual([
      {
        type: 'CHAT_STREAM_STARTED',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-3',
        messageId: 'assistant-3',
        branchId: 'branch-3',
        modelId: 'model-1',
        modelLabel: '主模型',
      },
      {
        type: 'CHAT_STREAM_CHUNK',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-3',
        messageId: 'assistant-3',
        branchId: 'branch-3',
        chunk: '第一段',
      },
      {
        type: 'CHAT_STREAM_FAILED',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-3',
        messageId: 'assistant-3',
        branchId: 'branch-3',
        errorMessage: 'provider timeout',
      },
      {
        type: 'LOADING_STATE_UPDATE',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-3',
        status: 'error',
      },
    ]);
  });

  it('流式 API 错误优先展示原始响应内容', async () => {
    const storage = createFakeStorageArea();
    const conversationRepository = createConversationRepository(createChromeLocalAdapter(storage));
    const publishToPromptTab = vi.fn();
    const apiError = Object.assign(new Error('wrapped provider error'), {
      responseBody: '{"error":{"message":"raw provider response"}}',
    });
    const service = createChatDispatchService({
      configRepository: {
        getModelById: vi.fn().mockResolvedValue({
          id: 'model-raw-error',
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
        }),
      },
      providerRegistry: {
        resolveProviderModel: vi.fn().mockReturnValue({
          providerId: 'openai-compatible',
          modelId: 'gpt-4.1-mini',
          modelLabel: '主模型',
          supportsImages: true,
          sdkModel: { kind: 'sdk-model' },
        }),
      },
      conversationRepository,
      portBus: {
        publishToPromptTab,
      },
      streamText: vi.fn().mockResolvedValue({
        textStream: (async function* () {
          yield* [];
          throw apiError;
        })(),
      }),
      createSessionId: () => 'session-raw-error',
      createMessageId: (() => {
        const ids = ['user-raw-error', 'assistant-raw-error', 'branch-raw-error'];
        return () => ids.shift() ?? 'exhausted';
      })(),
      now: (() => {
        const values = [30, 31, 32, 33];
        return () => values.shift() ?? 99;
      })(),
    });

    const session = await service.dispatchChat({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      modelId: 'model-raw-error',
      content: '继续补全',
      images: [],
      pageContent: '',
    });

    await expect(session.done).resolves.toMatchObject({
      status: 'error',
      errorMessage: '{"error":{"message":"raw provider response"}}',
    });
    await expect(conversationRepository.getConversation('https://example.com/article', 'chat')).resolves.toEqual(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            id: 'assistant-raw-error',
            status: 'error',
            errorMessage: '{"error":{"message":"raw provider response"}}',
          }),
        ]),
      }),
    );
    expect(collectPublishedEvents(publishToPromptTab)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'CHAT_STREAM_FAILED',
          errorMessage: '{"error":{"message":"raw provider response"}}',
        }),
      ]),
    );
  });

  it('大模型调用超时会标记助手失败而不是取消', async () => {
    vi.useFakeTimers();
    try {
      const storage = createFakeStorageArea();
      const conversationRepository = createConversationRepository(createChromeLocalAdapter(storage));
      const publishToPromptTab = vi.fn();
      const service = createChatDispatchService({
        configRepository: {
          getConfig: vi.fn().mockResolvedValue(
            createDefaultConfig({
              basic: {
                llmRequestTimeoutSeconds: 1,
              },
            }),
          ),
          getModelById: vi.fn().mockResolvedValue({
            id: 'model-timeout',
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
          }),
        },
        providerRegistry: {
          resolveProviderModel: vi.fn().mockReturnValue({
            providerId: 'openai-compatible',
            modelId: 'gpt-4.1-mini',
            modelLabel: '主模型',
            supportsImages: true,
            sdkModel: { kind: 'sdk-model' },
          }),
        },
        conversationRepository,
        portBus: {
          publishToPromptTab,
        },
        streamText: vi.fn().mockImplementation(async ({ abortSignal }: { abortSignal: AbortSignal }) => ({
          textStream: (async function* () {
            yield* [];
            await new Promise<void>((_resolve, reject) => {
              abortSignal.addEventListener('abort', () => {
                const error = new Error('aborted');
                error.name = 'AbortError';
                reject(error);
              });
            });
          })(),
        })),
        createSessionId: () => 'session-timeout',
        createMessageId: (() => {
          const ids = ['user-timeout', 'assistant-timeout', 'branch-timeout'];
          return () => ids.shift() ?? 'exhausted';
        })(),
      });

      const session = await service.dispatchChat({
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        modelId: 'model-timeout',
        content: '继续补全',
        images: [],
        pageContent: '',
      });

      await vi.advanceTimersByTimeAsync(1000);

      await expect(session.done).resolves.toMatchObject({
        status: 'error',
        errorMessage: '大模型调用超时（1 秒）',
      });
      expect(collectPublishedEvents(publishToPromptTab)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'CHAT_STREAM_FAILED',
            errorMessage: '大模型调用超时（1 秒）',
          }),
        ]),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('首轮快捷输入失败且要求回滚时，不保留用户消息和助手错误态', async () => {
    const storage = createFakeStorageArea();
    const conversationRepository = createConversationRepository(createChromeLocalAdapter(storage));
    const publishToPromptTab = vi.fn();
    const service = createChatDispatchService({
      configRepository: {
        getModelById: vi.fn().mockResolvedValue({
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
        }),
      },
      providerRegistry: {
        resolveProviderModel: vi.fn().mockReturnValue({
          providerId: 'openai-compatible',
          modelId: 'gpt-4.1-mini',
          modelLabel: '主模型',
          supportsImages: true,
          sdkModel: { kind: 'sdk-model' },
        }),
      },
      conversationRepository,
      portBus: {
        publishToPromptTab,
      },
      streamText: vi.fn().mockResolvedValue({
        textStream: (async function* () {
          yield '第一段';
          throw new Error('provider timeout');
        })(),
      }),
      createSessionId: () => 'session-rollback',
      createMessageId: (() => {
        const ids = ['user-rollback', 'assistant-rollback', 'branch-rollback'];
        return () => ids.shift() ?? 'exhausted';
      })(),
      now: (() => {
        const values = [40, 41, 42, 43, 44];
        return () => values.shift() ?? 99;
      })(),
    });

    const session = await service.dispatchChat({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'quick-summary',
      modelId: 'model-1',
      content: '请总结当前页面',
      displayText: '总结',
      images: [],
      pageContent: '页面正文',
      rollbackOnFailure: true,
    });

    await expect(session.done).resolves.toEqual({
      sessionId: 'session-rollback',
      messageId: 'assistant-rollback',
      status: 'error',
      errorMessage: 'provider timeout',
      persisted: false,
    });
    await expect(conversationRepository.getLoadingState('https://example.com/article', 'quick-summary')).resolves.toBeNull();
    await expect(conversationRepository.getConversation('https://example.com/article', 'quick-summary')).resolves.toBeNull();
    expect(collectPublishedEvents(publishToPromptTab)).toEqual([
      {
        type: 'CHAT_STREAM_STARTED',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'quick-summary',
        sessionId: 'session-rollback',
        messageId: 'assistant-rollback',
        branchId: 'branch-rollback',
        modelId: 'model-1',
        modelLabel: '主模型',
      },
      {
        type: 'CHAT_STREAM_CHUNK',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'quick-summary',
        sessionId: 'session-rollback',
        messageId: 'assistant-rollback',
        branchId: 'branch-rollback',
        chunk: '第一段',
      },
      {
        type: 'CHAT_STREAM_FAILED',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'quick-summary',
        sessionId: 'session-rollback',
        messageId: 'assistant-rollback',
        branchId: 'branch-rollback',
        errorMessage: 'provider timeout',
        rollbackOnFailure: true,
        userMessageId: 'user-rollback',
      },
      {
        type: 'LOADING_STATE_UPDATE',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'quick-summary',
        sessionId: 'session-rollback',
        status: 'error',
      },
    ]);
  });

  it('图片输入与模型能力不匹配时直接失败且不启动流', async () => {
    const storage = createFakeStorageArea();
    const conversationRepository = createConversationRepository(createChromeLocalAdapter(storage));
    const configRepository = {
      getModelById: vi.fn().mockResolvedValue({
        id: 'model-2',
        name: '纯文本模型',
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
        supportsImages: false,
        order: 0,
        deletedAt: null,
      }),
    };
    const providerRegistry = {
      resolveProviderModel: vi.fn().mockReturnValue({
        providerId: 'openai-compatible',
        modelId: 'gpt-4.1-mini',
        modelLabel: '纯文本模型',
        supportsImages: false,
        sdkModel: { kind: 'sdk-model' },
      }),
    };
    const publishToPromptTab = vi.fn();
    const streamText = vi.fn();
    const service = createChatDispatchService({
      configRepository,
      providerRegistry,
      conversationRepository,
      portBus: {
        publishToPromptTab,
      },
      streamText,
      createSessionId: () => 'session-4',
      createMessageId: (() => {
        const ids = ['user-4', 'assistant-4'];
        return () => ids.shift() ?? 'exhausted';
      })(),
      now: (() => {
        const values = [40, 41, 42];
        return () => values.shift() ?? 99;
      })(),
    });

    await expect(
      service.dispatchChat({
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        modelId: 'model-2',
        content: '请识别图片',
        images: ['data:image/png;base64,AAA'],
        pageContent: '',
      }),
    ).rejects.toThrow('model does not support images');

    expect(streamText).not.toHaveBeenCalled();
    expect(publishToPromptTab).not.toHaveBeenCalled();
    await expect(conversationRepository.getLoadingState('https://example.com/article', 'chat')).resolves.toBeNull();
    await expect(conversationRepository.getConversation('https://example.com/article', 'chat')).resolves.toBeNull();
  });

  it('setup 阶段失败时不会留下 assistant 永远处于 loading', async () => {
    const storage = createFakeStorageArea();
    const baseRepository = createConversationRepository(createChromeLocalAdapter(storage));
    const conversationRepository = {
      ...baseRepository,
      saveLoadingState: vi.fn().mockRejectedValue(new Error('save loading failed')),
    };
    const configRepository = {
      getModelById: vi.fn().mockResolvedValue({
        id: 'model-5',
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
      }),
    };
    const providerRegistry = {
      resolveProviderModel: vi.fn().mockReturnValue({
        providerId: 'openai-compatible',
        modelId: 'gpt-4.1-mini',
        modelLabel: '主模型',
        supportsImages: true,
        sdkModel: { kind: 'sdk-model' },
      }),
    };
    const streamText = vi.fn();
    const publishToPromptTab = vi.fn();
    const service = createChatDispatchService({
      configRepository,
      providerRegistry,
      conversationRepository,
      portBus: {
        publishToPromptTab,
      },
      streamText,
      createSessionId: () => 'session-5',
      createMessageId: (() => {
        const ids = ['user-5', 'assistant-5'];
        return () => ids.shift() ?? 'exhausted';
      })(),
      now: (() => {
        const values = [50, 51, 52, 53];
        return () => values.shift() ?? 99;
      })(),
    });

    await expect(
      service.dispatchChat({
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        modelId: 'model-5',
        content: '这次会在 setup 失败',
        images: [],
        pageContent: '',
      }),
    ).rejects.toThrow('save loading failed');

    expect(streamText).not.toHaveBeenCalled();
    expect(publishToPromptTab).not.toHaveBeenCalled();
    await expect(baseRepository.getLoadingState('https://example.com/article', 'chat')).resolves.toBeNull();
    await expect(baseRepository.getConversation('https://example.com/article', 'chat')).resolves.toMatchObject({
      messages: [
        expect.objectContaining({
          id: 'user-5',
          status: 'done',
        }),
        expect.objectContaining({
          id: 'assistant-5',
          status: 'error',
          errorMessage: 'save loading failed',
        }),
      ],
      lastAssistantState: {
        messageId: 'assistant-5',
        status: 'error',
        summary: '',
      },
    });
  });

  it('removeLoadingState 失败时不会覆盖主生命周期结果', async () => {
    const storage = createFakeStorageArea();
    const baseRepository = createConversationRepository(createChromeLocalAdapter(storage));
    const conversationRepository = {
      ...baseRepository,
      removeLoadingState: vi.fn().mockRejectedValue(new Error('cleanup failed')),
    };
    const configRepository = {
      getModelById: vi.fn().mockResolvedValue({
        id: 'model-6',
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
      }),
    };
    const providerRegistry = {
      resolveProviderModel: vi.fn().mockReturnValue({
        providerId: 'openai-compatible',
        modelId: 'gpt-4.1-mini',
        modelLabel: '主模型',
        supportsImages: true,
        sdkModel: { kind: 'sdk-model' },
      }),
    };
    const publishToPromptTab = vi.fn();
    const service = createChatDispatchService({
      configRepository,
      providerRegistry,
      conversationRepository,
      portBus: {
        publishToPromptTab,
      },
      streamText: vi.fn().mockResolvedValue({
        textStream: (async function* () {
          yield '收尾成功';
        })(),
      }),
      createSessionId: () => 'session-6',
      createMessageId: (() => {
        const ids = ['user-6', 'assistant-6', 'branch-6'];
        return () => ids.shift() ?? 'exhausted';
      })(),
      now: (() => {
        const values = [60, 61, 62, 63];
        return () => values.shift() ?? 99;
      })(),
    });

    const session = await service.dispatchChat({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      modelId: 'model-6',
      content: '测试 cleanup 错误',
      images: [],
      pageContent: '',
    });

    await expect(session.done).resolves.toMatchObject({
      sessionId: 'session-6',
      messageId: 'assistant-6',
      status: 'done',
      errorMessage: null,
    });
    await expect(baseRepository.getConversation('https://example.com/article', 'chat')).resolves.toMatchObject({
      messages: [
        expect.objectContaining({
          id: 'user-6',
          status: 'done',
          content: '测试 cleanup 错误',
        }),
        expect.objectContaining({
          id: 'assistant-6',
          status: 'done',
          content: '收尾成功',
        }),
      ],
      lastAssistantState: {
        messageId: 'assistant-6',
        status: 'done',
        summary: '收尾成功',
      },
    });
    expect(collectPublishedEvents(publishToPromptTab)).toEqual([
      {
        type: 'CHAT_STREAM_STARTED',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-6',
        messageId: 'assistant-6',
        branchId: 'branch-6',
        modelId: 'model-6',
        modelLabel: '主模型',
      },
      {
        type: 'CHAT_STREAM_CHUNK',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-6',
        messageId: 'assistant-6',
        branchId: 'branch-6',
        chunk: '收尾成功',
      },
      {
        type: 'CHAT_STREAM_FINISHED',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-6',
        messageId: 'assistant-6',
        branchId: 'branch-6',
      },
      {
        type: 'LOADING_STATE_UPDATE',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-6',
        status: 'done',
      },
    ]);
  });

  it('port 事件发布失败时不会覆盖已持久化的主生命周期结果', async () => {
    const storage = createFakeStorageArea();
    const conversationRepository = createConversationRepository(createChromeLocalAdapter(storage));
    const configRepository = {
      getModelById: vi.fn().mockResolvedValue({
        id: 'model-7',
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
      }),
    };
    const providerRegistry = {
      resolveProviderModel: vi.fn().mockReturnValue({
        providerId: 'openai-compatible',
        modelId: 'gpt-4.1-mini',
        modelLabel: '主模型',
        supportsImages: true,
        sdkModel: { kind: 'sdk-model' },
      }),
    };
    const publishToPromptTab = vi.fn(() => {
      throw new Error('port disconnected');
    });
    const service = createChatDispatchService({
      configRepository,
      providerRegistry,
      conversationRepository,
      portBus: {
        publishToPromptTab,
      },
      streamText: vi.fn().mockResolvedValue({
        textStream: (async function* () {
          yield '即使端口断开也应完成';
        })(),
      }),
      createSessionId: () => 'session-7',
      createMessageId: (() => {
        const ids = ['user-7', 'assistant-7'];
        return () => ids.shift() ?? 'exhausted';
      })(),
      now: (() => {
        const values = [70, 71, 72, 73];
        return () => values.shift() ?? 99;
      })(),
    });

    const session = await service.dispatchChat({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      modelId: 'model-7',
      content: '测试 port 故障',
      images: [],
      pageContent: '',
    });

    await expect(session.done).resolves.toMatchObject({
      sessionId: 'session-7',
      messageId: 'assistant-7',
      status: 'done',
      errorMessage: null,
    });
    expect(publishToPromptTab).toHaveBeenCalled();
    await expect(conversationRepository.getLoadingState('https://example.com/article', 'chat')).resolves.toBeNull();
    await expect(conversationRepository.getConversation('https://example.com/article', 'chat')).resolves.toMatchObject({
      messages: [
        expect.objectContaining({
          id: 'user-7',
          status: 'done',
          content: '测试 port 故障',
        }),
        expect.objectContaining({
          id: 'assistant-7',
          status: 'done',
          content: '即使端口断开也应完成',
          errorMessage: null,
        }),
      ],
      lastAssistantState: {
        messageId: 'assistant-7',
        status: 'done',
        summary: '即使端口断开也应完成',
      },
    });
  });

  it('expandBranches 会按用户选择的模型新增单分支，并独立收敛错误态', async () => {
    const storage = createFakeStorageArea();
    const conversationRepository = createConversationRepository(createChromeLocalAdapter(storage));
    await conversationRepository.saveConversation({
      id: 'https://example.com/article:quick-summary',
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'quick-summary',
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: '请继续分析',
          images: [],
          status: 'done',
          errorMessage: null,
          modelId: null,
          branches: [],
          retryFromMessageId: null,
          editedAt: null,
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: '主回答',
          images: [],
          status: 'done',
          errorMessage: null,
          modelId: 'model-main',
          branches: [
            {
              id: 'assistant-1:primary',
              modelId: 'model-main',
              modelLabel: '主模型',
              isPrimary: true,
              content: '主回答',
              status: 'done',
              errorMessage: null,
              createdAt: 2,
              updatedAt: 2,
            },
          ],
          selectedBranchId: 'assistant-1:primary',
          retryFromMessageId: null,
          editedAt: null,
          createdAt: 2,
          updatedAt: 2,
        },
      ],
      lastAssistantState: {
        messageId: 'assistant-1',
        status: 'done',
        summary: '主回答',
      },
      updatedAt: 2,
    });

    const models = {
      'model-main': {
        id: 'model-main',
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
      'model-branch-a': {
        id: 'model-branch-a',
        name: '分支模型A',
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
        order: 1,
        deletedAt: null,
      },
      'model-branch-b': {
        id: 'model-branch-b',
        name: '分支模型B',
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
        order: 2,
        deletedAt: null,
      },
    };
    const publishToPromptTab = vi.fn();
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const streamText = vi.fn().mockImplementation(async () => ({
      textStream: (async function* () {
        yield '分支B前缀';
        throw new Error('branch provider timeout');
      })(),
    }));
    const service = createChatDispatchService({
      configRepository: {
        getConfig: vi.fn().mockResolvedValue({
          version: '2.0.0',
          updatedAt: 10,
          basic: {
            theme: 'system',
            language: 'zh-CN',
            defaultModelId: 'model-main',
            branchModelIds: ['model-main', 'model-branch-a'],
            systemPrompt: '',
            filterCot: false,
            extractionMethod: 'readability',
            includePageContentByDefault: true,
          },
          models: Object.values(models),
          quickInputs: [
            {
              id: 'quick-summary',
              name: '总结',
              prompt: '请总结',
              autoTrigger: false,
              modelId: 'model-main',
              branchModelIds: ['model-branch-b'],
              order: 0,
              deletedAt: null,
            },
          ],
          sync: {
            enabled: false,
            provider: 'none',
            gistToken: '',
            gistId: '',
            webdavUrl: '',
            webdavUsername: '',
            webdavPassword: '',
            lastSyncAt: null,
          },
          blacklist: [],
        }),
        getModelById: vi.fn().mockImplementation(async (modelId: keyof typeof models) => models[modelId] ?? null),
      },
      providerRegistry: {
        resolveProviderModel: vi.fn().mockImplementation((model) => ({
          providerId: 'openai-compatible',
          modelId: model.id,
          modelLabel: model.name,
          supportsImages: true,
          sdkModel: { modelId: model.id },
        })),
      },
      conversationRepository,
      logger,
      portBus: {
        publishToPromptTab,
      },
      streamText,
      createSessionId: () => 'branch-session-b',
      createMessageId: (() => {
        const ids = ['branch-b'];
        return () => ids.shift() ?? 'exhausted-branch';
      })(),
      now: (() => {
        const values = [11, 12, 13, 14, 15, 16];
        return () => values.shift() ?? 99;
      })(),
    });

    const sessions = await service.expandBranches({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'quick-summary',
      messageId: 'assistant-1',
      modelId: 'model-branch-b',
      pageContent: '新增分支页面正文',
    });
    expect(sessions).toEqual([
      expect.objectContaining({
        branchId: 'branch-b',
        modelId: 'model-branch-b',
        modelLabel: '分支模型B',
      }),
    ]);
    const results = await Promise.all(sessions.map((session) => session.done));

    expect(results).toEqual([
      {
        sessionId: 'branch-session-b',
        messageId: 'assistant-1',
        status: 'error',
        errorMessage: 'branch provider timeout',
        persisted: true,
      },
    ]);
    await expect(conversationRepository.getLoadingState('https://example.com/article', 'quick-summary')).resolves.toBeNull();
    await expect(conversationRepository.getConversation('https://example.com/article', 'quick-summary')).resolves.toEqual(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            id: 'assistant-1',
            branches: expect.arrayContaining([
              expect.objectContaining({
                id: 'branch-b',
                modelId: 'model-branch-b',
                modelLabel: '分支模型B',
                content: '分支B前缀',
                status: 'error',
                errorMessage: 'branch provider timeout',
              }),
            ]),
          }),
        ]),
      }),
    );
    expect(streamText).toHaveBeenCalledTimes(1);
    expect(collectPublishedEvents(publishToPromptTab)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'BRANCH_STREAM_STARTED',
          branchId: 'branch-b',
          modelId: 'model-branch-b',
        }),
        expect.objectContaining({
          type: 'BRANCH_STREAM_FAILED',
          branchId: 'branch-b',
          errorMessage: 'branch provider timeout',
        }),
      ]),
    );
    expect(logger.info).toHaveBeenCalledWith('branch.stream.started', {
      normalizedUrl: 'https://example.com/article',
      promptTab: 'quick-summary',
      sessionId: 'branch-session-b',
      messageId: 'assistant-1',
      branchId: 'branch-b',
      provider: 'openai-compatible',
      modelId: 'model-branch-b',
    });
    expect(logger.info).toHaveBeenCalledWith('branch.stream.first_chunk', {
      normalizedUrl: 'https://example.com/article',
      promptTab: 'quick-summary',
      sessionId: 'branch-session-b',
      messageId: 'assistant-1',
      branchId: 'branch-b',
    });
    expect(logger.error).toHaveBeenCalledWith('branch.stream.failed', {
      normalizedUrl: 'https://example.com/article',
      promptTab: 'quick-summary',
      sessionId: 'branch-session-b',
      messageId: 'assistant-1',
      branchId: 'branch-b',
      reason: 'branch provider timeout',
    });
  });

  it('editUserMessage 会裁剪后续结果并基于编辑后的消息重新生成主回答', async () => {
    const storage = createFakeStorageArea();
    const conversationRepository = createConversationRepository(createChromeLocalAdapter(storage));
    await conversationRepository.saveConversation({
      id: 'https://example.com/article:chat',
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: '旧问题',
          images: [],
          status: 'done',
          errorMessage: null,
          modelId: null,
          branches: [],
          retryFromMessageId: null,
          editedAt: null,
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: '旧回答',
          images: [],
          status: 'done',
          errorMessage: null,
          modelId: 'model-1',
          branches: [
            {
              id: 'assistant-1:primary',
              modelId: 'model-1',
              modelLabel: '主模型',
              isPrimary: true,
              content: '旧回答',
              status: 'done',
              errorMessage: null,
              createdAt: 2,
              updatedAt: 2,
            },
          ],
          selectedBranchId: 'assistant-1:primary',
          retryFromMessageId: null,
          editedAt: null,
          createdAt: 2,
          updatedAt: 2,
        },
      ],
      lastAssistantState: {
        messageId: 'assistant-1',
        status: 'done',
        summary: '旧回答',
      },
      updatedAt: 2,
    });

    const streamText = vi.fn().mockResolvedValue({
      textStream: (async function* () {
        yield '编辑后回答';
      })(),
    });
    const publishToPromptTab = vi.fn();
    const service = createChatDispatchService({
      configRepository: {
        getConfig: vi.fn().mockResolvedValue({
          version: '2.0.0',
          updatedAt: 1,
          basic: {
            theme: 'system',
            language: 'zh-CN',
            defaultModelId: 'model-1',
            branchModelIds: [],
            systemPrompt: '',
            filterCot: false,
            extractionMethod: 'readability',
            includePageContentByDefault: true,
          },
          models: [],
          quickInputs: [],
          sync: {
            enabled: false,
            provider: 'none',
            gistToken: '',
            gistId: '',
            webdavUrl: '',
            webdavUsername: '',
            webdavPassword: '',
            lastSyncAt: null,
          },
          blacklist: [],
        }),
        getModelById: vi.fn().mockResolvedValue({
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
        }),
      },
      providerRegistry: {
        resolveProviderModel: vi.fn().mockReturnValue({
          providerId: 'openai-compatible',
          modelId: 'gpt-4.1-mini',
          modelLabel: '主模型',
          supportsImages: true,
          sdkModel: { kind: 'sdk-model' },
        }),
      },
      conversationRepository,
      portBus: {
        publishToPromptTab,
      },
      streamText,
      createSessionId: () => 'session-edit',
      createMessageId: (() => {
        const ids = ['assistant-edit', 'assistant-edit:primary'];
        return () => ids.shift() ?? 'exhausted-edit';
      })(),
      now: (() => {
        const values = [10, 11, 12, 13, 14];
        return () => values.shift() ?? 99;
      })(),
    });

    const session = await service.editUserMessage({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'user-1',
      content: '新问题',
      pageContent: '编辑链路页面正文',
    });

    await expect(session.done).resolves.toMatchObject({
      sessionId: 'session-edit',
      messageId: 'assistant-edit',
      status: 'done',
    });
    expect(streamText).toHaveBeenCalledWith({
      model: { kind: 'sdk-model' },
      messages: [
        {
          role: 'system',
          content: '# Page Content\n编辑链路页面正文',
          images: [],
        },
        {
          role: 'user',
          content: '新问题',
          images: [],
        },
      ],
      abortSignal: expect.any(AbortSignal),
    });
    await expect(conversationRepository.getConversation('https://example.com/article', 'chat')).resolves.toMatchObject({
      messages: [
        expect.objectContaining({
          id: 'user-1',
          content: '新问题',
          editedAt: 10,
        }),
        expect.objectContaining({
          id: 'assistant-edit',
          content: '编辑后回答',
          retryFromMessageId: null,
          status: 'done',
        }),
      ],
    });
    expect(collectPublishedEvents(publishToPromptTab)).toEqual([
      {
        type: 'CHAT_STREAM_STARTED',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-edit',
        messageId: 'assistant-edit',
        branchId: 'assistant-edit:primary',
        modelId: 'model-1',
        modelLabel: '主模型',
      },
      {
        type: 'CHAT_STREAM_CHUNK',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-edit',
        messageId: 'assistant-edit',
        branchId: 'assistant-edit:primary',
        chunk: '编辑后回答',
      },
      {
        type: 'CHAT_STREAM_FINISHED',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-edit',
        messageId: 'assistant-edit',
        branchId: 'assistant-edit:primary',
      },
      {
        type: 'LOADING_STATE_UPDATE',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-edit',
        status: 'done',
      },
    ]);
  });

  it('retryMessage 会替换旧助手消息并保留同轮用户上下文', async () => {
    const storage = createFakeStorageArea();
    const conversationRepository = createConversationRepository(createChromeLocalAdapter(storage));
    await conversationRepository.saveConversation({
      id: 'https://example.com/article:chat',
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: '问题',
          images: [],
          status: 'done',
          errorMessage: null,
          modelId: null,
          branches: [],
          retryFromMessageId: null,
          editedAt: null,
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: '旧回答',
          images: [],
          status: 'error',
          errorMessage: '旧错误',
          modelId: 'model-1',
          branches: [
            {
              id: 'assistant-1:primary',
              modelId: 'model-1',
              modelLabel: '主模型',
              isPrimary: true,
              content: '旧回答',
              status: 'error',
              errorMessage: '旧错误',
              createdAt: 2,
              updatedAt: 2,
            },
          ],
          selectedBranchId: 'assistant-1:primary',
          retryFromMessageId: null,
          editedAt: null,
          createdAt: 2,
          updatedAt: 2,
        },
      ],
      lastAssistantState: {
        messageId: 'assistant-1',
        status: 'error',
        summary: '旧回答',
      },
      updatedAt: 2,
    });

    const streamText = vi.fn().mockResolvedValue({
      textStream: (async function* () {
        yield '重试后回答';
      })(),
    });
    const service = createChatDispatchService({
      configRepository: {
        getConfig: vi.fn().mockResolvedValue({
          version: '2.0.0',
          updatedAt: 1,
          basic: {
            theme: 'system',
            language: 'zh-CN',
            defaultModelId: 'model-1',
            branchModelIds: [],
            systemPrompt: '',
            filterCot: false,
            extractionMethod: 'readability',
            includePageContentByDefault: true,
          },
          models: [],
          quickInputs: [],
          sync: {
            enabled: false,
            provider: 'none',
            gistToken: '',
            gistId: '',
            webdavUrl: '',
            webdavUsername: '',
            webdavPassword: '',
            lastSyncAt: null,
          },
          blacklist: [],
        }),
        getModelById: vi.fn().mockResolvedValue({
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
        }),
      },
      providerRegistry: {
        resolveProviderModel: vi.fn().mockReturnValue({
          providerId: 'openai-compatible',
          modelId: 'gpt-4.1-mini',
          modelLabel: '主模型',
          supportsImages: true,
          sdkModel: { kind: 'sdk-model' },
        }),
      },
      conversationRepository,
      portBus: {
        publishToPromptTab: vi.fn(),
      },
      streamText,
      createSessionId: () => 'session-retry',
      createMessageId: (() => {
        const ids = ['assistant-retry', 'branch-retry'];
        return () => ids.shift() ?? 'exhausted-retry';
      })(),
      now: (() => {
        const values = [20, 21, 22, 23, 24];
        return () => values.shift() ?? 99;
      })(),
    });

    const session = await service.retryMessage({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'assistant-1',
      branchId: 'assistant-1:primary',
      pageContent: '重试链路页面正文',
    });

    await expect(session.done).resolves.toMatchObject({
      sessionId: 'session-retry',
      messageId: 'assistant-1',
      status: 'done',
    });
    expect(streamText).toHaveBeenCalledWith({
      model: { kind: 'sdk-model' },
      messages: [
        {
          role: 'system',
          content: '# Page Content\n重试链路页面正文',
          images: [],
        },
        {
          role: 'user',
          content: '问题',
          images: [],
        },
      ],
      abortSignal: expect.any(AbortSignal),
    });
    await expect(conversationRepository.getConversation('https://example.com/article', 'chat')).resolves.toMatchObject({
      messages: [
        expect.objectContaining({
          id: 'user-1',
          content: '问题',
        }),
        expect.objectContaining({
          id: 'assistant-1',
          content: '重试后回答',
          status: 'done',
        }),
      ],
    });
  });

  it('retryUserMessage 会裁剪后续结果，并重新生成当前轮助手消息', async () => {
    const storage = createFakeStorageArea();
    const conversationRepository = createConversationRepository(createChromeLocalAdapter(storage));
    await conversationRepository.saveConversation({
      id: 'https://example.com/article:chat',
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: '原问题',
          images: [],
          status: 'done',
          errorMessage: null,
          modelId: null,
          branches: [],
          retryFromMessageId: null,
          editedAt: null,
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: '原回答',
          images: [],
          status: 'done',
          errorMessage: null,
          modelId: 'model-1',
          branches: [
            {
              id: 'assistant-1:primary',
              modelId: 'model-1',
              modelLabel: '主模型',
              isPrimary: true,
              content: '原回答',
              status: 'done',
              errorMessage: null,
              createdAt: 2,
              updatedAt: 2,
            },
          ],
          selectedBranchId: 'assistant-1:primary',
          retryFromMessageId: null,
          editedAt: null,
          createdAt: 2,
          updatedAt: 2,
        },
      ],
      lastAssistantState: {
        messageId: 'assistant-1',
        status: 'done',
        summary: '原回答',
      },
      updatedAt: 2,
    });

    const publishToPromptTab = vi.fn();
    const streamText = vi.fn().mockResolvedValue({
      textStream: (async function* () {
        yield '分支重试回答';
      })(),
    });
    const service = createChatDispatchService({
      configRepository: {
        getConfig: vi.fn().mockResolvedValue({
          version: '2.0.0',
          updatedAt: 1,
          basic: {
            theme: 'system',
            language: 'zh-CN',
            defaultModelId: 'model-1',
            branchModelIds: [],
            systemPrompt: '',
            filterCot: false,
            extractionMethod: 'readability',
            includePageContentByDefault: true,
          },
          models: [],
          quickInputs: [],
          sync: {
            enabled: false,
            provider: 'none',
            gistToken: '',
            gistId: '',
            webdavUrl: '',
            webdavUsername: '',
            webdavPassword: '',
            lastSyncAt: null,
          },
          blacklist: [],
        }),
        getModelById: vi.fn().mockResolvedValue({
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
        }),
      },
      providerRegistry: {
        resolveProviderModel: vi.fn().mockReturnValue({
          providerId: 'openai-compatible',
          modelId: 'gpt-4.1-mini',
          modelLabel: '主模型',
          supportsImages: true,
          sdkModel: { kind: 'sdk-model' },
        }),
      },
      conversationRepository,
      portBus: {
        publishToPromptTab,
      },
      streamText,
      createSessionId: () => 'session-user-retry',
      createMessageId: (() => {
        const ids = ['assistant-user-retry', 'branch-user-retry'];
        return () => ids.shift() ?? 'exhausted-user-retry';
      })(),
      now: (() => {
        const values = [30, 31, 32, 33, 34];
        return () => values.shift() ?? 99;
      })(),
    });

    const session = await service.retryUserMessage({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'user-1',
      pageContent: '用户重试页面正文',
    });

    expect(session.branchId).toBe('branch-user-retry');
    expect(session.messageId).toBe('assistant-user-retry');
    await expect(session.done).resolves.toMatchObject({
      sessionId: 'session-user-retry',
      messageId: 'assistant-user-retry',
      status: 'done',
    });
    expect(streamText).toHaveBeenCalledWith({
      model: { kind: 'sdk-model' },
      messages: [
        {
          role: 'system',
          content: '# Page Content\n用户重试页面正文',
          images: [],
        },
        {
          role: 'user',
          content: '原问题',
          images: [],
        },
      ],
      abortSignal: expect.any(AbortSignal),
    });
    await expect(conversationRepository.getConversation('https://example.com/article', 'chat')).resolves.toSatisfy(
      (conversation: Awaited<ReturnType<typeof conversationRepository.getConversation>>) =>
        conversation?.messages.some(
          (message) =>
            message.id === 'assistant-user-retry' &&
            message.role === 'assistant' &&
            message.content === '分支重试回答' &&
            message.branches.some(
              (branch) => branch.id === 'branch-user-retry' && branch.content === '分支重试回答' && branch.status === 'done',
            ),
        ) === true,
    );
    expect(collectPublishedEvents(publishToPromptTab)).toEqual([
      {
        type: 'CHAT_STREAM_STARTED',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-user-retry',
        messageId: 'assistant-user-retry',
        branchId: 'branch-user-retry',
        modelId: 'model-1',
        modelLabel: '主模型',
      },
      {
        type: 'CHAT_STREAM_CHUNK',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-user-retry',
        messageId: 'assistant-user-retry',
        branchId: 'branch-user-retry',
        chunk: '分支重试回答',
      },
      {
        type: 'CHAT_STREAM_FINISHED',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-user-retry',
        messageId: 'assistant-user-retry',
        branchId: 'branch-user-retry',
      },
      {
        type: 'LOADING_STATE_UPDATE',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-user-retry',
        status: 'done',
      },
    ]);
  });
});
