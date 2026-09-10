import { describe, expect, it } from 'vitest';

import type { SidebarPortEvent } from '../../../src/services/runtime-messaging/sidebar-contract';
import type { ChatMessageState } from '../../../src/features/workspace/workspace-state';
import { reduceWorkspaceEvent } from '../../../src/features/workspace/workspace-stream-state';

const labels = { primaryBranch: '主分支', branch: '分支', error: '失败', cancelled: '已取消' };
const target = { normalizedUrl: 'https://example.com', promptTabId: 'chat', sessionId: 'session-1', messageId: 'assistant-1' };
const primary = { ...target, branchId: 'primary' };
const parallel = { ...target, branchId: 'parallel' };
const started: SidebarPortEvent = {
  ...primary, type: 'CHAT_STREAM_STARTED', modelId: 'model-1', modelLabel: '模型一', startedAt: 1000,
};
const branchStarted: SidebarPortEvent = {
  ...parallel, type: 'BRANCH_STREAM_STARTED', modelId: 'model-2', modelLabel: '模型二', startedAt: 2000,
};
const reduce = (messages: ChatMessageState[], event: SidebarPortEvent) => reduceWorkspaceEvent(messages, event, labels);
const sequence = (events: SidebarPortEvent[], messages: ChatMessageState[] = []) => events.reduce(reduce, messages);

describe('workspace stream state', () => {
  it('主流交错更新时保持分支顺序、选中分支和其他消息的引用', () => {
    const user: ChatMessageState = {
      id: 'user-1', role: 'user', content: '问题', status: 'done', errorMessage: null, branches: [], selectedBranchId: null,
    };
    const initial = sequence([started, branchStarted], [user]);
    const otherBranch = initial[1]!.branches[1];
    const chunked = reduce(initial, { ...primary, type: 'CHAT_STREAM_CHUNK', chunk: '主回答' });
    expect(chunked[0]).toBe(user);
    expect(chunked[1]!.branches.map((branch) => branch.id)).toEqual(['primary', 'parallel']);
    expect(chunked[1]!.branches[1]).toBe(otherBranch);

    const result = sequence([
      { ...parallel, type: 'BRANCH_STREAM_CHUNK', chunk: '并行回答' },
      { ...primary, type: 'CHAT_STREAM_CHUNK', chunk: '继续' },
      { ...parallel, type: 'BRANCH_STREAM_FINISHED', durationMs: 400 },
      { ...primary, type: 'CHAT_STREAM_FINISHED', durationMs: 1200 },
    ], chunked);
    expect(result[1]).toMatchObject({ content: '主回答继续', status: 'done', selectedBranchId: 'primary' });
    expect(result[1]!.branches).toMatchObject([
      { id: 'primary', content: '主回答继续', status: 'done', durationMs: 1200, startedAt: null },
      { id: 'parallel', content: '并行回答', status: 'done', durationMs: 400, startedAt: null },
    ]);
  });

  it('主流在命令响应之前完成时，保留完整消息及耗时', () => {
    const [message] = sequence([
      started,
      { ...primary, type: 'CHAT_STREAM_CHUNK', chunk: '完整回复' },
      { ...primary, type: 'CHAT_STREAM_FINISHED', durationMs: 25 },
    ]);
    expect(message).toMatchObject({ id: target.messageId, content: '完整回复', status: 'done' });
    expect(message!.branches[0]).toMatchObject({ durationMs: 25, startedAt: null });
  });

  it('收到主流开始事件时不移动已有主分支，且不覆盖选中的并行分支', () => {
    const [message] = sequence([started, branchStarted, { ...parallel, type: 'BRANCH_STREAM_CHUNK', chunk: '并行回答' }]);
    const [restarted] = reduce([{ ...message!, selectedBranchId: 'parallel' }], started);
    expect(restarted!.branches.map((branch) => branch.id)).toEqual(['primary', 'parallel']);
    expect(restarted).toMatchObject({ content: '并行回答', selectedBranchId: 'parallel' });
  });

  it.each(['CHAT_STREAM_FAILED', 'BRANCH_STREAM_FAILED'] as const)('%s 保留部分正文，替换旧耗时并结束计时', (type) => {
    const branch = type === 'CHAT_STREAM_FAILED' ? primary : parallel;
    const [message] = sequence([
      started, branchStarted,
      { ...branch, type: type === 'CHAT_STREAM_FAILED' ? 'CHAT_STREAM_CHUNK' : 'BRANCH_STREAM_CHUNK', chunk: '部分正文' },
      { ...branch, type, errorMessage: 'provider timeout', durationMs: null },
    ]);
    expect(message!.branches.find((item) => item.id === branch.branchId)).toMatchObject({
      content: '部分正文', status: 'error', errorMessage: 'provider timeout', durationMs: null, startedAt: null,
    });
  });

  it('首个事件就是失败时生成可见的错误回复', () => {
    const [message] = reduce([], { ...primary, type: 'CHAT_STREAM_FAILED', errorMessage: 'provider timeout', durationMs: 10 });
    expect(message).toMatchObject({ content: 'provider timeout', status: 'error', selectedBranchId: 'primary' });
    expect(message!.branches[0]).toMatchObject({ modelLabel: labels.primaryBranch, durationMs: 10, isPrimary: true });
  });

  it.each(['CHAT_STREAM_CANCELLED', 'BRANCH_STREAM_CANCELLED'] as const)('%s 保留部分正文与取消耗时', (type) => {
    const branch = type === 'CHAT_STREAM_CANCELLED' ? primary : parallel;
    const [message] = sequence([
      started, branchStarted,
      { ...branch, type: type === 'CHAT_STREAM_CANCELLED' ? 'CHAT_STREAM_CHUNK' : 'BRANCH_STREAM_CHUNK', chunk: '部分正文' },
      { ...branch, type, durationMs: 75 },
    ]);
    expect(message!.branches.find((item) => item.id === branch.branchId)).toMatchObject({
      content: '部分正文', status: 'cancelled', errorMessage: labels.cancelled, durationMs: 75, startedAt: null,
    });
  });

  it('恢复时分别使用主流与分支的开始时间，并保持已完成分支引用', () => {
    const initial = sequence([
      started, branchStarted,
      { ...parallel, type: 'BRANCH_STREAM_FINISHED', durationMs: 50 },
    ]);
    const completedBranch = initial[0]!.branches[1];
    const [message] = reduce(initial, {
      ...target, type: 'RESTORE_LOADING', content: '落库正文', startedAt: 3000,
      branchStates: [{ branchId: 'primary', modelId: 'model-1', status: 'loading', startedAt: 4000 }],
    });
    expect(message!.branches[0]!.startedAt).toBe(4000);
    expect(message!.branches[1]).toBe(completedBranch);
    expect(message!.branches[1]!.startedAt).toBeNull();

    const [fallback] = reduce(initial, { ...target, type: 'RESTORE_LOADING', content: '', startedAt: 5000, branchStates: [] });
    expect(fallback!.branches[0]!.startedAt).toBe(5000);
  });

  it('恢复没有分支的消息时展示落库正文；无开始时间不抹去已有终态', () => {
    const [restored] = reduce([], { ...target, type: 'RESTORE_LOADING', content: '落库正文', startedAt: 3000, branchStates: [] });
    expect(restored).toMatchObject({ content: '落库正文', status: 'loading' });
    const initial = sequence([started, { ...primary, type: 'CHAT_STREAM_FINISHED', durationMs: 60 }]);
    const [finished] = reduce(initial, { ...target, type: 'RESTORE_LOADING', content: '', startedAt: null, branchStates: [] });
    expect(finished).toMatchObject({ status: 'done' });
    expect(finished!.branches[0]!.durationMs).toBe(60);
  });

  it('非消息事件与目标消息不存在的分支流不改消息引用', () => {
    const messages = sequence([started]);
    expect(reduce(messages, { ...target, type: 'LOADING_STATE_UPDATE', status: 'done' })).toBe(messages);
    expect(reduce(messages, { ...branchStarted, messageId: 'missing' })).toBe(messages);
  });
});

describe('workspace stream state restore expiry', () => {
  const restoreLabels = { ...labels, timeout: '请求超时' };

  it('恢复的主分支 startedAt 已超过超时阈值时直接标记为失败', () => {
    const initial = sequence([started, branchStarted]);
    const [restored] = reduceWorkspaceEvent(
      initial,
      { ...target, type: 'RESTORE_LOADING', content: '', startedAt: 1000, branchStates: [{ branchId: 'parallel', status: 'loading', modelId: 'model-2', startedAt: 2000 }] },
      restoreLabels,
      { now: 70_000, timeoutMs: 60_000 },
    );
    expect(restored).toMatchObject({ status: 'error', errorMessage: '请求超时', selectedBranchId: 'primary' });
    expect(restored!.branches).toMatchObject([
      { id: 'primary', status: 'error', errorMessage: '请求超时', startedAt: null },
      { id: 'parallel', status: 'error', errorMessage: '请求超时', startedAt: null },
    ]);
  });

  it('未超时或未提供阈值时仍按 loading 恢复', () => {
    const initial = sequence([started]);
    const [fresh] = reduceWorkspaceEvent(
      initial,
      { ...target, type: 'RESTORE_LOADING', content: '', startedAt: 1000, branchStates: [] },
      restoreLabels,
      { now: 30_000, timeoutMs: 60_000 },
    );
    expect(fresh).toMatchObject({ status: 'loading' });
    const [noThreshold] = reduce(initial, { ...target, type: 'RESTORE_LOADING', content: '', startedAt: 1000, branchStates: [] });
    expect(noThreshold).toMatchObject({ status: 'loading' });
  });

  it('本地没有该消息时按超时创建失败占位', () => {
    const [created] = reduceWorkspaceEvent(
      [],
      { ...target, type: 'RESTORE_LOADING', content: '落库正文', startedAt: 1000, branchStates: [] },
      restoreLabels,
      { now: 70_000, timeoutMs: 60_000 },
    );
    expect(created).toMatchObject({ id: 'assistant-1', status: 'error', errorMessage: '请求超时' });
    expect(created!.branches).toHaveLength(1);
  });
});
