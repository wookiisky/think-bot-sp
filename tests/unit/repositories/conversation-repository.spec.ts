import { describe, expect, it } from 'vitest';

import { createChromeLocalAdapter } from '../../../src/repositories/chrome-local-adapter';
import { createConversationRepository } from '../../../src/repositories/conversation-repository';
import { createFakeStorageArea } from '../../helpers/fake-storage';

describe('conversation-repository', () => {
  it('chat 与快捷输入会话隔离', async () => {
    const storage = createFakeStorageArea();
    const repo = createConversationRepository(createChromeLocalAdapter(storage));

    await repo.saveConversation({
      id: 'https://example.com/a:chat',
      normalizedUrl: 'https://example.com/a',
      promptTabId: 'chat',
      messages: [],
      lastAssistantState: null,
      updatedAt: 1,
    });
    await repo.saveConversation({
      id: 'https://example.com/a:quick-1',
      normalizedUrl: 'https://example.com/a',
      promptTabId: 'quick-1',
      messages: [],
      lastAssistantState: null,
      updatedAt: 2,
    });

    await expect(repo.getConversation('https://example.com/a', 'chat')).resolves.toMatchObject({
      promptTabId: 'chat',
    });
    await expect(repo.getConversation('https://example.com/a', 'quick-1')).resolves.toMatchObject({
      promptTabId: 'quick-1',
    });
  });

  it('按页面清理 conversation 和 loading', async () => {
    const storage = createFakeStorageArea();
    const repo = createConversationRepository(createChromeLocalAdapter(storage));

    await repo.saveConversation({
      id: 'https://example.com/a:chat',
      normalizedUrl: 'https://example.com/a',
      promptTabId: 'chat',
      messages: [],
      lastAssistantState: null,
      updatedAt: 1,
    });
    await repo.saveConversation({
      id: 'https://example.com/a:extra:chat',
      normalizedUrl: 'https://example.com/a:extra',
      promptTabId: 'chat',
      messages: [],
      lastAssistantState: null,
      updatedAt: 2,
    });
    await repo.saveLoadingState({
      id: 'loading:https://example.com/a:chat',
      normalizedUrl: 'https://example.com/a',
      promptTabId: 'chat',
      sessionId: 'session-1',
      promptTabStatus: 'loading',
      branchStates: [],
      resumeTarget: null,
      cancelRequested: false,
      updatedAt: 1,
    });
    await repo.saveLoadingState({
      id: 'loading:https://example.com/a:extra:chat',
      normalizedUrl: 'https://example.com/a:extra',
      promptTabId: 'chat',
      sessionId: 'session-2',
      promptTabStatus: 'loading',
      branchStates: [],
      resumeTarget: null,
      cancelRequested: false,
      updatedAt: 2,
    });

    await repo.clearPageData('https://example.com/a');

    await expect(repo.getConversation('https://example.com/a', 'chat')).resolves.toBeNull();
    expect(storage.dump()['loading:https://example.com/a:chat']).toBeUndefined();
    await expect(repo.getConversation('https://example.com/a:extra', 'chat')).resolves.toMatchObject({
      promptTabId: 'chat',
    });
    expect(storage.dump()['loading:https://example.com/a:extra:chat']).toEqual({
      id: 'loading:https://example.com/a:extra:chat',
      normalizedUrl: 'https://example.com/a:extra',
      promptTabId: 'chat',
      sessionId: 'session-2',
      promptTabStatus: 'loading',
      branchStates: [],
      resumeTarget: null,
      cancelRequested: false,
      updatedAt: 2,
    });
  });

  it('按页面列出 conversation 和 loading 状态', async () => {
    const storage = createFakeStorageArea();
    const repo = createConversationRepository(createChromeLocalAdapter(storage));

    await repo.saveConversation({
      id: 'https://example.com/a:chat',
      normalizedUrl: 'https://example.com/a',
      promptTabId: 'chat',
      messages: [],
      lastAssistantState: null,
      updatedAt: 1,
    });
    await repo.saveConversation({
      id: 'https://example.com/b:chat',
      normalizedUrl: 'https://example.com/b',
      promptTabId: 'chat',
      messages: [],
      lastAssistantState: null,
      updatedAt: 2,
    });
    await repo.saveLoadingState({
      id: 'loading:https://example.com/a:chat',
      normalizedUrl: 'https://example.com/a',
      promptTabId: 'chat',
      sessionId: 'session-1',
      promptTabStatus: 'loading',
      branchStates: [],
      resumeTarget: null,
      cancelRequested: false,
      updatedAt: 3,
    });
    await repo.saveLoadingState({
      id: 'loading:https://example.com/b:chat',
      normalizedUrl: 'https://example.com/b',
      promptTabId: 'chat',
      sessionId: 'session-2',
      promptTabStatus: 'loading',
      branchStates: [],
      resumeTarget: null,
      cancelRequested: false,
      updatedAt: 4,
    });

    await expect(repo.listPageConversations('https://example.com/a')).resolves.toEqual([
      {
        id: 'https://example.com/a:chat',
        normalizedUrl: 'https://example.com/a',
        promptTabId: 'chat',
        messages: [],
        lastAssistantState: null,
        updatedAt: 1,
      },
    ]);
    await expect(repo.listPageLoadingStates('https://example.com/a')).resolves.toEqual([
      {
        id: 'loading:https://example.com/a:chat',
        normalizedUrl: 'https://example.com/a',
        promptTabId: 'chat',
        sessionId: 'session-1',
        promptTabStatus: 'loading',
        branchStates: [],
        resumeTarget: null,
        cancelRequested: false,
        updatedAt: 3,
      },
    ]);
  });

  it('按标签清理 conversation 和 loading，不影响其他标签', async () => {
    const storage = createFakeStorageArea();
    const repo = createConversationRepository(createChromeLocalAdapter(storage));

    await repo.saveConversation({
      id: 'https://example.com/a:chat',
      normalizedUrl: 'https://example.com/a',
      promptTabId: 'chat',
      messages: [],
      lastAssistantState: null,
      updatedAt: 1,
    });
    await repo.saveConversation({
      id: 'https://example.com/a:quick-1',
      normalizedUrl: 'https://example.com/a',
      promptTabId: 'quick-1',
      messages: [],
      lastAssistantState: null,
      updatedAt: 2,
    });
    await repo.saveLoadingState({
      id: 'loading:https://example.com/a:chat',
      normalizedUrl: 'https://example.com/a',
      promptTabId: 'chat',
      sessionId: 'session-1',
      promptTabStatus: 'loading',
      branchStates: [],
      resumeTarget: null,
      cancelRequested: false,
      updatedAt: 3,
    });
    await repo.saveLoadingState({
      id: 'loading:https://example.com/a:quick-1',
      normalizedUrl: 'https://example.com/a',
      promptTabId: 'quick-1',
      sessionId: 'session-2',
      promptTabStatus: 'loading',
      branchStates: [],
      resumeTarget: null,
      cancelRequested: false,
      updatedAt: 4,
    });

    await repo.clearPromptTabData('https://example.com/a', 'quick-1');

    await expect(repo.getConversation('https://example.com/a', 'quick-1')).resolves.toBeNull();
    await expect(repo.getLoadingState('https://example.com/a', 'quick-1')).resolves.toBeNull();
    await expect(repo.getConversation('https://example.com/a', 'chat')).resolves.toMatchObject({
      promptTabId: 'chat',
    });
    await expect(repo.getLoadingState('https://example.com/a', 'chat')).resolves.toMatchObject({
      promptTabId: 'chat',
    });
  });

  it('助手分支支持追加、收敛、删除，并维护分支 loading', async () => {
    const storage = createFakeStorageArea();
    const repo = createConversationRepository(createChromeLocalAdapter(storage));

    await repo.appendUserMessage({
      normalizedUrl: 'https://example.com/a',
      promptTabId: 'chat',
      messageId: 'user-1',
      content: '请总结',
      images: [],
      now: 1,
    });
    await repo.appendAssistantMessage({
      normalizedUrl: 'https://example.com/a',
      promptTabId: 'chat',
      messageId: 'assistant-1',
      modelId: 'model-main',
      now: 2,
    });
    await repo.finishAssistantMessage({
      normalizedUrl: 'https://example.com/a',
      promptTabId: 'chat',
      messageId: 'assistant-1',
      now: 3,
    });

    await repo.appendAssistantBranch({
      normalizedUrl: 'https://example.com/a',
      promptTabId: 'chat',
      messageId: 'assistant-1',
      branchId: 'branch-1',
      modelId: 'model-branch',
      modelLabel: '分支模型',
      now: 4,
    });
    await repo.upsertBranchLoadingState({
      normalizedUrl: 'https://example.com/a',
      promptTabId: 'chat',
      sessionId: 'session-branch',
      messageId: 'assistant-1',
      branchId: 'branch-1',
      modelId: 'model-branch',
      status: 'loading',
      now: 5,
    });
    await repo.appendAssistantBranchChunk({
      normalizedUrl: 'https://example.com/a',
      promptTabId: 'chat',
      messageId: 'assistant-1',
      branchId: 'branch-1',
      chunk: '第一段',
      now: 6,
    });
    await repo.finishAssistantBranch({
      normalizedUrl: 'https://example.com/a',
      promptTabId: 'chat',
      messageId: 'assistant-1',
      branchId: 'branch-1',
      now: 7,
    });

    await expect(repo.getConversation('https://example.com/a', 'chat')).resolves.toEqual(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            id: 'assistant-1',
            branches: [
              expect.objectContaining({
                id: 'branch-1',
                modelId: 'model-branch',
                modelLabel: '分支模型',
                content: '第一段',
                status: 'done',
                errorMessage: null,
              }),
            ],
          }),
        ]),
      }),
    );
    await expect(repo.getLoadingState('https://example.com/a', 'chat')).resolves.toMatchObject({
      branchStates: [
        {
          branchId: 'branch-1',
          status: 'loading',
          modelId: 'model-branch',
        },
      ],
      resumeTarget: {
        messageId: 'assistant-1',
        branchId: 'branch-1',
      },
    });

    await repo.removeBranchLoadingState('https://example.com/a', 'chat', 'branch-1');
    await repo.deleteAssistantBranch({
      normalizedUrl: 'https://example.com/a',
      promptTabId: 'chat',
      messageId: 'assistant-1',
      branchId: 'branch-1',
      now: 8,
    });

    await expect(repo.getLoadingState('https://example.com/a', 'chat')).resolves.toBeNull();
    await expect(repo.getConversation('https://example.com/a', 'chat')).resolves.toEqual(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            id: 'assistant-1',
            branches: [],
          }),
        ]),
      }),
    );
  });
});
