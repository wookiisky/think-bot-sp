import { describe, expect, it } from 'vitest';

import { createLoadingState } from '../../../src/domain/loading/loading-state-schema';
import { createChromeLocalAdapter } from '../../../src/repositories/chrome-local-adapter';
import { createConversationRepository } from '../../../src/repositories/conversation-repository';
import { createFakeStorageArea } from '../../helpers/fake-storage';

/** 构造单主分支初始种子，保持测试契约与仓库实现一致。 */
const createPrimaryBranchSeed = (id: string) => [
  {
    id,
    modelId: 'model-1',
    modelLabel: '主模型',
    isPrimary: true,
  },
];

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
      initialBranches: createPrimaryBranchSeed('assistant-1:primary'),
      selectedBranchId: 'assistant-1:primary',
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
          selectedBranchId: null,
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
          branches: [
            {
              id: 'assistant-1:primary',
              modelId: 'model-1',
              modelLabel: '主模型',
              isPrimary: true,
              content: '第一段第二段',
              status: 'done',
              errorMessage: null,
              createdAt: 11,
              updatedAt: 14,
            },
          ],
          selectedBranchId: 'assistant-1:primary',
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
      initialBranches: createPrimaryBranchSeed('assistant-1:primary'),
      selectedBranchId: 'assistant-1:primary',
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
          branches: [
            {
              id: 'assistant-1:primary',
              modelId: 'model-1',
              modelLabel: '主模型',
              isPrimary: true,
              content: '已有内容',
              status: 'error',
              errorMessage: 'provider timeout',
              createdAt: 21,
              updatedAt: 23,
            },
          ],
          selectedBranchId: 'assistant-1:primary',
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

  it('支持为自动触发用户消息保存展示名，并在编辑后回退为真实文本展示', async () => {
    const storage = createFakeStorageArea();
    const repo = createConversationRepository(createChromeLocalAdapter(storage));

    await repo.appendUserMessage({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'quick-summary',
      messageId: 'user-auto-1',
      content: '请总结当前页面',
      displayContent: '总结',
      images: [],
      now: 30,
    });
    await repo.editUserMessage({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'quick-summary',
      messageId: 'user-auto-1',
      content: '请总结当前页面，并列出风险',
      newAssistantMessageId: 'assistant-auto-1',
      initialBranches: createPrimaryBranchSeed('assistant-auto-1:primary'),
      selectedBranchId: 'assistant-auto-1:primary',
      now: 31,
    });

    await expect(repo.getConversation('https://example.com/article', 'quick-summary')).resolves.toMatchObject({
      messages: [
        {
          id: 'user-auto-1',
          role: 'user',
          content: '请总结当前页面，并列出风险',
          editedAt: 31,
        },
        {
          id: 'assistant-auto-1',
          role: 'assistant',
          status: 'loading',
        },
      ],
    });

    const conversation = await repo.getConversation('https://example.com/article', 'quick-summary');
    expect(conversation?.messages[0]).not.toHaveProperty('displayContent');
  });

  it('不允许给已完成的 assistant 继续追加 chunk', async () => {
    const storage = createFakeStorageArea();
    const repo = createConversationRepository(createChromeLocalAdapter(storage));

    await repo.appendAssistantMessage({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'assistant-2',
      initialBranches: createPrimaryBranchSeed('assistant-2:primary'),
      selectedBranchId: 'assistant-2:primary',
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
      initialBranches: createPrimaryBranchSeed('assistant-3:primary'),
      selectedBranchId: 'assistant-3:primary',
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

  it('编辑用户消息会裁剪其后的全部结果，并插入新的助手占位', async () => {
    const storage = createFakeStorageArea();
    const repo = createConversationRepository(createChromeLocalAdapter(storage));

    await repo.saveConversation({
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
          selectedBranchId: null,
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
              id: 'branch-1',
              modelId: 'model-2',
              modelLabel: '分支模型',
              isPrimary: false,
              content: '旧分支',
              status: 'done',
              errorMessage: null,
              createdAt: 2,
              updatedAt: 2,
            },
          ],
          selectedBranchId: 'branch-1',
          retryFromMessageId: null,
          editedAt: null,
          createdAt: 2,
          updatedAt: 2,
        },
        {
          id: 'user-2',
          role: 'user',
          content: '后续问题',
          images: [],
          status: 'done',
          errorMessage: null,
          modelId: null,
          branches: [],
          retryFromMessageId: null,
          editedAt: null,
          createdAt: 3,
          updatedAt: 3,
        },
      ],
      lastAssistantState: {
        messageId: 'assistant-1',
        status: 'done',
        summary: '旧回答',
      },
      updatedAt: 3,
    });

    await repo.editUserMessage({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'user-1',
      content: '新问题',
      newAssistantMessageId: 'assistant-edit',
      initialBranches: createPrimaryBranchSeed('assistant-edit:primary'),
      selectedBranchId: 'assistant-edit:primary',
      now: 10,
    });

    await expect(repo.getConversation('https://example.com/article', 'chat')).resolves.toEqual({
      id: 'https://example.com/article:chat',
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: '新问题',
          images: [],
          status: 'done',
          errorMessage: null,
          modelId: null,
          branches: [],
          selectedBranchId: null,
          retryFromMessageId: null,
          editedAt: 10,
          createdAt: 1,
          updatedAt: 10,
        },
        {
          id: 'assistant-edit',
          role: 'assistant',
          content: '',
          images: [],
          status: 'loading',
          errorMessage: null,
          modelId: 'model-1',
          branches: [
            {
              id: 'assistant-edit:primary',
              modelId: 'model-1',
              modelLabel: '主模型',
              isPrimary: true,
              content: '',
              status: 'loading',
              errorMessage: null,
              createdAt: 10,
              updatedAt: 10,
            },
          ],
          selectedBranchId: 'assistant-edit:primary',
          retryFromMessageId: null,
          editedAt: null,
          createdAt: 10,
          updatedAt: 10,
        },
      ],
      lastAssistantState: {
        messageId: 'assistant-edit',
        status: 'loading',
        summary: '',
      },
      updatedAt: 10,
    });
  });

  it('重试助手消息会替换旧助手消息，并裁剪其后的全部结果', async () => {
    const storage = createFakeStorageArea();
    const repo = createConversationRepository(createChromeLocalAdapter(storage));

    await repo.saveConversation({
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
          selectedBranchId: null,
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
              id: 'branch-1',
              modelId: 'model-2',
              modelLabel: '分支模型',
              isPrimary: false,
              content: '旧分支',
              status: 'done',
              errorMessage: null,
              createdAt: 2,
              updatedAt: 2,
            },
          ],
          selectedBranchId: 'branch-1',
          retryFromMessageId: null,
          editedAt: null,
          createdAt: 2,
          updatedAt: 2,
        },
        {
          id: 'user-2',
          role: 'user',
          content: '后续问题',
          images: [],
          status: 'done',
          errorMessage: null,
          modelId: null,
          branches: [],
          retryFromMessageId: null,
          editedAt: null,
          createdAt: 3,
          updatedAt: 3,
        },
      ],
      lastAssistantState: {
        messageId: 'assistant-1',
        status: 'done',
        summary: '旧回答',
      },
      updatedAt: 3,
    });

    await repo.retryAssistantMessage({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'assistant-1',
      newAssistantMessageId: 'assistant-retry',
      initialBranches: createPrimaryBranchSeed('assistant-retry:primary'),
      selectedBranchId: 'assistant-retry:primary',
      now: 20,
    });

    await expect(repo.getConversation('https://example.com/article', 'chat')).resolves.toEqual({
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
          selectedBranchId: null,
          retryFromMessageId: null,
          editedAt: null,
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'assistant-retry',
          role: 'assistant',
          content: '',
          images: [],
          status: 'loading',
          errorMessage: null,
          modelId: 'model-1',
          branches: [
            {
              id: 'assistant-retry:primary',
              modelId: 'model-1',
              modelLabel: '主模型',
              isPrimary: true,
              content: '',
              status: 'loading',
              errorMessage: null,
              createdAt: 20,
              updatedAt: 20,
            },
          ],
          selectedBranchId: 'assistant-retry:primary',
          retryFromMessageId: 'assistant-1',
          editedAt: null,
          createdAt: 20,
          updatedAt: 20,
        },
      ],
      lastAssistantState: {
        messageId: 'assistant-retry',
        status: 'loading',
        summary: '',
      },
      updatedAt: 20,
    });
  });
});
