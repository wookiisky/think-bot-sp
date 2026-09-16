import { describe, expect, it } from 'vitest';
import { mergeWorkspaceCommandResult } from '../../../src/features/workspace/workspace-command-state';
import type { ChatMessageState } from '../../../src/features/workspace/workspace-state';

const user: ChatMessageState = {
  id: 'user', role: 'user', content: '原问题', displayContent: '快捷输入名称', status: 'done', errorMessage: null, branches: [], selectedBranchId: null,
};
const assistant: ChatMessageState = {
  id: 'assistant', role: 'assistant', content: '已到达的正文', status: 'done', errorMessage: null, selectedBranchId: 'primary',
  branches: [{ id: 'primary', content: '已到达的正文', modelId: '', modelLabel: '占位', isPrimary: true, status: 'done', errorMessage: null, durationMs: 30, startedAt: null }],
};
const response = { messageId: 'assistant', branchId: 'primary', modelId: 'model', modelLabel: '模型' };

describe('mergeWorkspaceCommandResult', () => {
  it('编辑时裁剪后续轮次，但保留流中回复与终态，并补齐模型身份', () => {
    const result = mergeWorkspaceCommandResult([user, { ...user, id: 'later' }, assistant], {
      kind: 'user', targetMessageId: 'user', editedText: '新问题', response,
    });
    expect(result.map((message) => message.id)).toEqual(['user', 'assistant']);
    expect(result[0]).toMatchObject({ content: '新问题' });
    expect(result[0]).not.toHaveProperty('displayContent');
    expect(result[1]).toMatchObject({ content: '已到达的正文', status: 'done', branches: [{ modelId: 'model', modelLabel: '模型', durationMs: 30 }] });
  });

  it('重试用户消息保留展示文本，未到达的并行分支仍可补齐且不重置已完成主分支', () => {
    const result = mergeWorkspaceCommandResult([user, assistant], {
      kind: 'user', targetMessageId: 'user', response: { ...response, branches: [response, { branchId: 'parallel', modelId: 'other', modelLabel: '其他模型' }] },
    });
    expect(result[0]).toBe(user);
    expect(result[1]!.branches).toMatchObject([{ id: 'primary', status: 'done', durationMs: 30 }, { id: 'parallel', status: 'loading', content: '' }]);
  });

  it('助手重试尚无本次流事件时清空旧结果，不将上轮完成状态误判成本轮完成', () => {
    const result = mergeWorkspaceCommandResult([user, assistant, { ...user, id: 'later' }], {
      kind: 'assistant', targetMessageId: 'assistant', response, hasStreamEvent: false,
    });
    expect(result.map((message) => message.id)).toEqual(['user', 'assistant']);
    expect(result[1]).toMatchObject({ content: '', status: 'loading', branches: [{ content: '', status: 'loading', durationMs: null, startedAt: null }] });
    expect(assistant.status).toBe('done');
  });

  it('助手重试已有本次流事件时保留完整消息引用并裁剪后续轮次', () => {
    const result = mergeWorkspaceCommandResult([user, assistant, { ...user, id: 'later' }], {
      kind: 'assistant', targetMessageId: 'assistant', response, hasStreamEvent: true,
    });
    expect(result).toEqual([user, assistant]);
    expect(result[1]).toBe(assistant);
  });

  it('目标已被删除时忽略晚到响应', () => {
    const messages = [assistant];
    expect(mergeWorkspaceCommandResult(messages, { kind: 'user', targetMessageId: 'user', response })).toBe(messages);
  });
});
