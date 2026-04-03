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
});
