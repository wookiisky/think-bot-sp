import { describe, expect, it, vi } from 'vitest';

import { createChromeLocalAdapter } from '../../../../src/repositories/chrome-local-adapter';
import { createConversationRepository } from '../../../../src/repositories/conversation-repository';
import { buildLoadingStorageKey } from '../../../../src/shared/storage-keys';
import {
  ORPHANED_LOADING_ERROR_MESSAGE,
  createLoadingStateReconciler,
} from '../../../../src/services/runtime-messaging/loading-state-reconciler';
import { createSidebarSessionRegistry } from '../../../../src/services/runtime-messaging/sidebar-session-registry';
import { createFakeStorageArea } from '../../../helpers/fake-storage';

const normalizedUrl = 'https://example.com/article';
const promptTabId = 'chat';

/** 构造一条主分支和并行分支都在 loading 的会话。 */
const seedLoadingConversation = async (repository: ReturnType<typeof createConversationRepository>) => {
  await repository.saveConversation({
    id: `${normalizedUrl}:${promptTabId}`,
    normalizedUrl,
    promptTabId,
    messages: [
      {
        id: 'user-1', role: 'user', content: '问题', images: [], status: 'done', errorMessage: null,
        modelId: null, branches: [], selectedBranchId: null, retryFromMessageId: null, editedAt: null, createdAt: 1, updatedAt: 1,
      },
      {
        id: 'assistant-1', role: 'assistant', content: '部分回答', images: [], status: 'loading', errorMessage: null,
        modelId: 'model-1',
        branches: [
          {
            id: 'primary', modelId: 'model-1', modelLabel: '主模型', isPrimary: true, content: '部分回答',
            status: 'loading', errorMessage: null, durationMs: null, createdAt: 1, updatedAt: 2,
          },
          {
            id: 'parallel', modelId: 'model-2', modelLabel: '并行模型', isPrimary: false, content: '',
            status: 'loading', errorMessage: null, durationMs: null, createdAt: 1, updatedAt: 2,
          },
          {
            id: 'finished', modelId: 'model-3', modelLabel: '已完成模型', isPrimary: false, content: '完成',
            status: 'done', errorMessage: null, durationMs: 100, createdAt: 1, updatedAt: 2,
          },
        ],
        selectedBranchId: 'primary', retryFromMessageId: null, editedAt: null, createdAt: 1, updatedAt: 2,
      },
    ],
    lastAssistantState: { messageId: 'assistant-1', status: 'loading', summary: '部分回答' },
    updatedAt: 2,
  });
  await repository.saveLoadingState({
    id: buildLoadingStorageKey(normalizedUrl, promptTabId),
    normalizedUrl,
    promptTabId,
    sessionId: 'session-orphan',
    promptTabStatus: 'loading',
    startedAt: 1000,
    branchStates: [{ branchId: 'parallel', status: 'loading', modelId: 'model-2', startedAt: 1500 }],
    resumeTarget: { messageId: 'assistant-1', branchId: 'primary' },
    cancelRequested: false,
    updatedAt: 2,
  });
};

const createHarness = () => {
  const repository = createConversationRepository(createChromeLocalAdapter(createFakeStorageArea()));
  const sessionRegistry = createSidebarSessionRegistry();
  const publishToPromptTab = vi.fn();
  const reconciler = createLoadingStateReconciler({
    conversationRepository: repository,
    sessionRegistry,
    portBus: { publishToPromptTab },
    now: () => 5000,
  });
  return { repository, sessionRegistry, publishToPromptTab, reconciler };
};

describe('loading-state reconciler', () => {
  it('没有 loading 记录时返回 idle', async () => {
    const { reconciler, publishToPromptTab } = createHarness();
    await expect(reconciler.reconcilePromptTab(normalizedUrl, promptTabId)).resolves.toBe('idle');
    expect(publishToPromptTab).not.toHaveBeenCalled();
  });

  it('当前 worker 仍有活跃会话时返回 active 且不改动存储', async () => {
    const { reconciler, repository, sessionRegistry, publishToPromptTab } = createHarness();
    await seedLoadingConversation(repository);
    sessionRegistry.register(
      { sessionId: 'session-orphan', messageId: 'assistant-1', cancel: () => undefined, done: new Promise(() => undefined) },
      { normalizedUrl, promptTabId },
    );

    await expect(reconciler.reconcilePromptTab(normalizedUrl, promptTabId)).resolves.toBe('active');
    expect(publishToPromptTab).not.toHaveBeenCalled();
    expect(await repository.getLoadingState(normalizedUrl, promptTabId)).not.toBeNull();
  });

  it('孤儿 loading 会把所有 loading 分支收敛为失败并广播事件', async () => {
    const { reconciler, repository, publishToPromptTab } = createHarness();
    await seedLoadingConversation(repository);

    await expect(reconciler.reconcilePromptTab(normalizedUrl, promptTabId)).resolves.toBe('reconciled');

    const conversation = await repository.getConversation(normalizedUrl, promptTabId);
    const assistant = conversation!.messages[1]!;
    expect(assistant.status).toBe('error');
    expect(assistant.content).toBe('部分回答');
    expect(assistant.branches.map((branch) => [branch.id, branch.status, branch.errorMessage, branch.durationMs])).toEqual([
      ['primary', 'error', ORPHANED_LOADING_ERROR_MESSAGE, 4000],
      ['parallel', 'error', ORPHANED_LOADING_ERROR_MESSAGE, 3500],
      ['finished', 'done', null, 100],
    ]);
    expect(await repository.getLoadingState(normalizedUrl, promptTabId)).toBeNull();

    expect(publishToPromptTab.mock.calls.map(([event]) => event)).toEqual([
      {
        type: 'CHAT_STREAM_FAILED', normalizedUrl, promptTabId, sessionId: 'session-orphan',
        messageId: 'assistant-1', branchId: 'primary', errorMessage: ORPHANED_LOADING_ERROR_MESSAGE, durationMs: 4000,
      },
      {
        type: 'BRANCH_STREAM_FAILED', normalizedUrl, promptTabId, sessionId: 'session-orphan',
        messageId: 'assistant-1', branchId: 'parallel', errorMessage: ORPHANED_LOADING_ERROR_MESSAGE, durationMs: 3500,
      },
      { type: 'LOADING_STATE_UPDATE', normalizedUrl, promptTabId, sessionId: 'session-orphan', status: 'error' },
    ]);
  });

  it('分支持久化失败时保留恢复标记，只广播成功写入的分支，重试后完成恢复', async () => {
    const { reconciler, repository, publishToPromptTab } = createHarness();
    await seedLoadingConversation(repository);
    vi.spyOn(repository, 'failAssistantBranch').mockRejectedValueOnce(new Error('storage failed'));

    await expect(reconciler.reconcilePromptTab(normalizedUrl, promptTabId)).resolves.toBe('failed');
    expect(await repository.getLoadingState(normalizedUrl, promptTabId)).not.toBeNull();
    expect(publishToPromptTab.mock.calls.map(([event]) => event.type)).toEqual(['BRANCH_STREAM_FAILED']);
    expect((await repository.getConversation(normalizedUrl, promptTabId))!.messages[1]!.branches[0]!.status).toBe('loading');

    await expect(reconciler.reconcilePromptTab(normalizedUrl, promptTabId)).resolves.toBe('reconciled');
    expect(await repository.getLoadingState(normalizedUrl, promptTabId)).toBeNull();
    expect(publishToPromptTab.mock.calls.map(([event]) => event.type)).toEqual([
      'BRANCH_STREAM_FAILED', 'CHAT_STREAM_FAILED', 'LOADING_STATE_UPDATE',
    ]);
  });

  it('删除标记失败不报告恢复完成，reconcileAll 只计入完成项且允许重试', async () => {
    const { reconciler, repository, publishToPromptTab } = createHarness();
    await seedLoadingConversation(repository);
    vi.spyOn(repository, 'removeLoadingState').mockRejectedValueOnce(new Error('storage failed'));

    await expect(reconciler.reconcileAll()).resolves.toBe(0);
    expect(await repository.getLoadingState(normalizedUrl, promptTabId)).not.toBeNull();
    expect(publishToPromptTab.mock.calls.map(([event]) => event.type)).toEqual([
      'CHAT_STREAM_FAILED', 'BRANCH_STREAM_FAILED',
    ]);
    await expect(reconciler.reconcileAll()).resolves.toBe(1);
    expect(await repository.getLoadingState(normalizedUrl, promptTabId)).toBeNull();
  });

  it('会话缺失时仍会清理 loading 记录并广播终态', async () => {
    const { reconciler, repository, publishToPromptTab } = createHarness();
    await repository.saveLoadingState({
      id: buildLoadingStorageKey(normalizedUrl, promptTabId),
      normalizedUrl, promptTabId, sessionId: 'session-orphan', promptTabStatus: 'loading', startedAt: null,
      branchStates: [], resumeTarget: null, cancelRequested: false, updatedAt: 2,
    });

    await expect(reconciler.reconcilePromptTab(normalizedUrl, promptTabId)).resolves.toBe('reconciled');
    expect(await repository.getLoadingState(normalizedUrl, promptTabId)).toBeNull();
    expect(publishToPromptTab).toHaveBeenCalledTimes(1);
    expect(publishToPromptTab).toHaveBeenCalledWith({
      type: 'LOADING_STATE_UPDATE', normalizedUrl, promptTabId, sessionId: 'session-orphan', status: 'error',
    });
  });

  it('reconcileAll 只收敛孤儿，跳过已被新会话接管的 promptTab', async () => {
    const { reconciler, repository, sessionRegistry } = createHarness();
    await seedLoadingConversation(repository);
    await repository.saveLoadingState({
      id: buildLoadingStorageKey('https://example.com/other', promptTabId),
      normalizedUrl: 'https://example.com/other', promptTabId, sessionId: 'session-live', promptTabStatus: 'loading',
      startedAt: 1000, branchStates: [], resumeTarget: null, cancelRequested: false, updatedAt: 2,
    });
    sessionRegistry.register(
      { sessionId: 'session-live', messageId: 'assistant-9', cancel: () => undefined, done: new Promise(() => undefined) },
      { normalizedUrl: 'https://example.com/other', promptTabId },
    );

    await expect(reconciler.reconcileAll()).resolves.toBe(1);
    expect(await repository.getLoadingState(normalizedUrl, promptTabId)).toBeNull();
    expect(await repository.getLoadingState('https://example.com/other', promptTabId)).not.toBeNull();
  });
});
