import { describe, expect, it } from 'vitest';

import {
  appendAssistantBranch,
  createEmptyConversation,
  createLoadingAssistantMessage,
  deleteAssistantBranch,
  selectAssistantBranch,
  transitionAssistantBranch,
  withConversationMessages,
} from '../../../src/domain/conversation/conversation-state';

const createConversation = () => withConversationMessages(
  createEmptyConversation('https://example.com', 'chat', 1),
  [createLoadingAssistantMessage({
    messageId: 'assistant-1',
    branches: [
      { id: 'primary', modelId: 'model-1', modelLabel: 'Primary', isPrimary: true },
      { id: 'secondary', modelId: 'model-2', modelLabel: 'Secondary', isPrimary: false },
    ],
    selectedBranchId: 'primary', retryFromMessageId: null, now: 1,
  })],
  1,
);

describe('conversation state', () => {
  it.each(['done', 'error', 'cancelled'] as const)('选中分支的 chunk 和 %s 状态同时更新助手与最新摘要', (status) => {
    const original = createConversation();
    const streamed = transitionAssistantBranch(original, 'assistant-1', 'primary', { type: 'chunk', chunk: 'answer' }, 2);
    expect(streamed.lastAssistantState).toEqual({ messageId: 'assistant-1', status: 'loading', summary: 'answer' });
    const finished = transitionAssistantBranch(streamed, 'assistant-1', 'primary', {
      type: status, errorMessage: status === 'error' ? 'failure' : null, durationMs: 10,
    }, 3);
    expect(finished.lastAssistantState).toEqual({ messageId: 'assistant-1', status, summary: 'answer' });
    expect(finished.messages[0]).toMatchObject({ content: 'answer', status, errorMessage: status === 'error' ? 'failure' : null });
    expect(original.messages[0]?.content).toBe('');
    expect(original.messages[0]?.branches[0]?.status).toBe('loading');
  });

  it('未选中分支的流式内容和错误不影响助手正文或摘要，选中后才镜像', () => {
    const original = createConversation();
    const streamed = transitionAssistantBranch(original, 'assistant-1', 'secondary', { type: 'chunk', chunk: 'alternative' }, 2);
    const failed = transitionAssistantBranch(streamed, 'assistant-1', 'secondary', { type: 'error', errorMessage: 'failure', durationMs: 3 }, 3);
    expect(failed.messages[0]).toMatchObject({ content: '', status: 'loading', modelId: 'model-1', errorMessage: null });
    expect(failed.lastAssistantState).toEqual(original.lastAssistantState);
    const selected = selectAssistantBranch(failed, 'assistant-1', 'secondary', 4);
    expect(selected.messages[0]).toMatchObject({ content: 'alternative', status: 'error', modelId: 'model-2', errorMessage: 'failure' });
    expect(selected.lastAssistantState).toEqual({ messageId: 'assistant-1', status: 'error', summary: 'alternative' });
  });

  it.each([undefined, 'primary'])('通过 %s 更新较早轮次仍保留最后助手摘要', (branchId) => {
    const original = createConversation();
    const latest = createLoadingAssistantMessage({
      messageId: 'assistant-2',
      branches: [{ id: 'latest', modelId: 'model-1', modelLabel: 'Primary', isPrimary: true }],
      selectedBranchId: 'latest', retryFromMessageId: null, now: 2,
    });
    const conversation = withConversationMessages(original, [...original.messages, latest], 2);
    const next = transitionAssistantBranch(conversation, 'assistant-1', branchId, { type: 'chunk', chunk: 'older answer' }, 3);
    expect(next.messages[0]?.content).toBe('older answer');
    expect(next.lastAssistantState).toEqual({ messageId: 'assistant-2', status: 'loading', summary: '' });
  });

  it('重启选中分支清空正文、错误和耗时并同步摘要', () => {
    const streamed = transitionAssistantBranch(createConversation(), 'assistant-1', 'primary', { type: 'chunk', chunk: 'partial' }, 2);
    const failed = transitionAssistantBranch(streamed, 'assistant-1', 'primary', { type: 'error', errorMessage: 'failure', durationMs: 10 }, 3);
    const next = transitionAssistantBranch(failed, 'assistant-1', 'primary', { type: 'restart' }, 4);
    expect(next.messages[0]?.branches[0]).toMatchObject({ content: '', status: 'loading', errorMessage: null, durationMs: null, createdAt: 1, updatedAt: 4 });
    expect(next.lastAssistantState).toEqual({ messageId: 'assistant-1', status: 'loading', summary: '' });
  });

  it('删除选中分支后回落到剩余分支，删除最后一个分支后清除摘要', () => {
    const streamed = transitionAssistantBranch(createConversation(), 'assistant-1', 'secondary', { type: 'chunk', chunk: 'alternative' }, 2);
    const next = deleteAssistantBranch(streamed, 'assistant-1', 'primary', 3);
    expect(next.messages[0]).toMatchObject({ selectedBranchId: 'secondary', content: 'alternative', modelId: 'model-2' });
    expect(next.lastAssistantState?.summary).toBe('alternative');
    const removed = deleteAssistantBranch(next, 'assistant-1', 'secondary', 4);
    expect(removed.messages).toEqual([]);
    expect(removed.lastAssistantState).toBeNull();
  });

  it('旧版无分支助手记录保持正文，可追加新的分支', () => {
    const original = createConversation();
    const legacy = withConversationMessages(original, original.messages.map((message) => ({
      ...message, branches: [], selectedBranchId: null, content: 'legacy answer', status: 'done',
    })), 2);
    expect(legacy.lastAssistantState?.summary).toBe('legacy answer');
    const next = appendAssistantBranch(legacy, 'assistant-1', { id: 'new', modelId: 'model-2', modelLabel: 'New', isPrimary: false }, 3);
    expect(next.messages[0]).toMatchObject({ selectedBranchId: 'new', status: 'loading', modelId: 'model-2' });
    expect(next.lastAssistantState).toEqual({ messageId: 'assistant-1', status: 'loading', summary: '' });
    expect(legacy.messages[0]?.content).toBe('legacy answer');
  });
});
