import { describe, expect, it, vi } from 'vitest';

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
  reject: (error: Error) => void;
};

/** 创建受控异步门闩。 */
const createDeferred = (): Deferred => {
  let resolve = () => undefined;
  let reject = (_error: Error) => undefined;
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
    const publishToPromptTab = vi.fn();
    const service = createChatDispatchService({
      configRepository,
      providerRegistry,
      conversationRepository,
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
        const ids = ['user-1', 'assistant-1'];
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
    });

    await expect(session.done).resolves.toMatchObject({
      sessionId: 'session-1',
      messageId: 'assistant-1',
      status: 'done',
    });
    await expect(conversationRepository.getLoadingState('https://example.com/article', 'chat')).resolves.toBeNull();
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
      },
      {
        type: 'CHAT_STREAM_CHUNK',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-1',
        messageId: 'assistant-1',
        chunk: '第一段',
      },
      {
        type: 'CHAT_STREAM_CHUNK',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-1',
        messageId: 'assistant-1',
        chunk: '第二段',
      },
      {
        type: 'CHAT_STREAM_FINISHED',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-1',
        messageId: 'assistant-1',
      },
    ]);
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
        const ids = ['user-2', 'assistant-2'];
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
    });

    await firstChunkPublished.promise;
    session.cancel();

    await expect(session.done).resolves.toMatchObject({
      sessionId: 'session-2',
      messageId: 'assistant-2',
      status: 'cancelled',
    });
    await expect(conversationRepository.getLoadingState('https://example.com/article', 'chat')).resolves.toBeNull();
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
      },
      {
        type: 'CHAT_STREAM_CHUNK',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-2',
        messageId: 'assistant-2',
        chunk: '第一段',
      },
      {
        type: 'CHAT_STREAM_CANCELLED',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-2',
        messageId: 'assistant-2',
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
        const ids = ['user-3', 'assistant-3'];
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
    });

    await expect(session.done).resolves.toMatchObject({
      sessionId: 'session-3',
      messageId: 'assistant-3',
      status: 'error',
      errorMessage: 'provider timeout',
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
      },
      {
        type: 'CHAT_STREAM_CHUNK',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-3',
        messageId: 'assistant-3',
        chunk: '第一段',
      },
      {
        type: 'CHAT_STREAM_FAILED',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-3',
        messageId: 'assistant-3',
        errorMessage: 'provider timeout',
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
        const ids = ['user-6', 'assistant-6'];
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
      },
      {
        type: 'CHAT_STREAM_CHUNK',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-6',
        messageId: 'assistant-6',
        chunk: '收尾成功',
      },
      {
        type: 'CHAT_STREAM_FINISHED',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-6',
        messageId: 'assistant-6',
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
});
