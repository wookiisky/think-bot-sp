import { describe, expect, it } from 'vitest';

import { createLoadingState } from '../../../src/domain/loading/loading-state-schema';
import { createChromeLocalAdapter } from '../../../src/repositories/chrome-local-adapter';
import { createConversationRepository } from '../../../src/repositories/conversation-repository';
import { createFakeStorageArea } from '../../helpers/fake-storage';

describe('conversation-repository editing', () => {
  it('支持主聊天流按顺序追加用户消息、助手占位、chunk、完成并清理 loading', async () => {
    const storage = createFakeStorageArea();
    const repo = createConversationRepository(createChromeLocalAdapter(storage));

    await repo.saveLoadingState(
      createLoadingState({
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-1',
        now: 9,
      }),
    );

    await repo.appendUserMessage({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'user-1',
      content: '请总结页面内容',
      images: [],
      now: 10,
    });
    await repo.appendAssistantMessage({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'assistant-1',
      modelId: 'model-1',
      now: 11,
    });
    await repo.appendAssistantChunk({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'assistant-1',
      chunk: '第一段',
      now: 12,
    });
    await repo.appendAssistantChunk({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'assistant-1',
      chunk: '第二段',
      now: 13,
    });
    await repo.finishAssistantMessage({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'assistant-1',
      now: 14,
    });
    await repo.removeLoadingState('https://example.com/article', 'chat');

    await expect(repo.getLoadingState('https://example.com/article', 'chat')).resolves.toBeNull();
    await expect(repo.getConversation('https://example.com/article', 'chat')).resolves.toEqual({
      id: 'https://example.com/article:chat',
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: '请总结页面内容',
          images: [],
          status: 'done',
          errorMessage: null,
          modelId: null,
          branches: [],
          retryFromMessageId: null,
          editedAt: null,
          createdAt: 10,
          updatedAt: 10,
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: '第一段第二段',
          images: [],
          status: 'done',
          errorMessage: null,
          modelId: 'model-1',
          branches: [],
          retryFromMessageId: null,
          editedAt: null,
          createdAt: 11,
          updatedAt: 14,
        },
      ],
      lastAssistantState: {
        messageId: 'assistant-1',
        status: 'done',
        summary: '第一段第二段',
      },
      updatedAt: 14,
    });
  });

  it('支持把助手消息收敛为 error 状态并保留已生成内容', async () => {
    const storage = createFakeStorageArea();
    const repo = createConversationRepository(createChromeLocalAdapter(storage));

    await repo.appendUserMessage({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'user-1',
      content: '请继续',
      images: [],
      now: 20,
    });
    await repo.appendAssistantMessage({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'assistant-1',
      modelId: 'model-1',
      now: 21,
    });
    await repo.appendAssistantChunk({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'assistant-1',
      chunk: '已有内容',
      now: 22,
    });

    await repo.failAssistantMessage({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'assistant-1',
      errorMessage: 'provider timeout',
      status: 'error',
      now: 23,
    });

    await expect(repo.getConversation('https://example.com/article', 'chat')).resolves.toMatchObject({
      messages: [
        expect.objectContaining({
          id: 'user-1',
          status: 'done',
        }),
        {
          id: 'assistant-1',
          role: 'assistant',
          content: '已有内容',
          images: [],
          status: 'error',
          modelId: 'model-1',
          branches: [],
          retryFromMessageId: null,
          editedAt: null,
          createdAt: 21,
          updatedAt: 23,
          errorMessage: 'provider timeout',
        },
      ],
      lastAssistantState: {
        messageId: 'assistant-1',
        status: 'error',
        summary: '已有内容',
      },
      updatedAt: 23,
    });
  });

  it('不允许给已完成的 assistant 继续追加 chunk', async () => {
    const storage = createFakeStorageArea();
    const repo = createConversationRepository(createChromeLocalAdapter(storage));

    await repo.appendAssistantMessage({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'assistant-2',
      modelId: 'model-1',
      now: 30,
    });
    await repo.finishAssistantMessage({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'assistant-2',
      now: 31,
    });

    await expect(
      repo.appendAssistantChunk({
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        messageId: 'assistant-2',
        chunk: '非法 chunk',
        now: 32,
      }),
    ).rejects.toThrow('assistant message is already terminal: assistant-2');
  });

  it('不允许覆盖已终态 assistant 的终态结果', async () => {
    const storage = createFakeStorageArea();
    const repo = createConversationRepository(createChromeLocalAdapter(storage));

    await repo.appendAssistantMessage({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'assistant-3',
      modelId: 'model-1',
      now: 40,
    });
    await repo.failAssistantMessage({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'assistant-3',
      errorMessage: 'provider timeout',
      status: 'error',
      now: 41,
    });

    await expect(
      repo.finishAssistantMessage({
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        messageId: 'assistant-3',
        now: 42,
      }),
    ).rejects.toThrow('assistant message is already terminal: assistant-3');
    await expect(
      repo.failAssistantMessage({
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        messageId: 'assistant-3',
        errorMessage: 'cancel after error',
        status: 'cancelled',
        now: 43,
      }),
    ).rejects.toThrow('assistant message is already terminal: assistant-3');
  });
});
