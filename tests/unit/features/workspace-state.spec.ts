import { describe, expect, it } from 'vitest';

import { applyLoadingStateToMessages, findBranchPreviewDetail, upsertAssistantFailure, type ChatMessageState } from '../../../src/features/workspace/workspace-state';

const createAssistantMessage = (status: ChatMessageState['status'], branchStatus: ChatMessageState['branches'][number]['status']): ChatMessageState => ({
  id: 'assistant-1',
  role: 'assistant',
  content: '回答',
  status,
  errorMessage: null,
  branches: [
    {
      id: 'branch-1',
      modelId: 'model-1',
      modelLabel: '模型一',
      isPrimary: true,
      content: '分支回答',
      status: branchStatus,
      errorMessage: null,
      durationMs: 1234,
      startedAt: null,
    },
  ],
  selectedBranchId: 'branch-1',
});

describe('workspace-state', () => {
  it('loading 分支不能生成预览详情', () => {
    const detail = findBranchPreviewDetail([createAssistantMessage('loading', 'loading')], 'assistant-1', 'branch-1');

    expect(detail).toBeNull();
  });

  it('非 loading 分支可以生成预览详情', () => {
    const doneDetail = findBranchPreviewDetail([createAssistantMessage('done', 'done')], 'assistant-1', 'branch-1');
    const errorDetail = findBranchPreviewDetail([createAssistantMessage('error', 'error')], 'assistant-1', 'branch-1');
    const cancelledDetail = findBranchPreviewDetail([createAssistantMessage('cancelled', 'cancelled')], 'assistant-1', 'branch-1');

    expect(doneDetail?.status).toBe('done');
    expect(errorDetail?.status).toBe('error');
    expect(cancelledDetail?.status).toBe('cancelled');
  });

  it('失败事件显式传入 null 耗时时会清空旧耗时', () => {
    const [message] = upsertAssistantFailure([createAssistantMessage('loading', 'loading')], {
      messageId: 'assistant-1',
      branchId: 'branch-1',
      errorMessage: 'provider timeout',
      modelId: 'model-1',
      modelLabel: '模型一',
      isPrimary: true,
      durationMs: null,
    });

    expect(message?.branches[0]?.durationMs).toBeNull();
  });

  it('把持久化 loading 开始时间映射到对应分支', () => {
    const [message] = applyLoadingStateToMessages([createAssistantMessage('loading', 'loading')], {
      id: 'loading:https://example.com:chat',
      normalizedUrl: 'https://example.com',
      promptTabId: 'chat',
      sessionId: 'session-1',
      promptTabStatus: 'loading',
      startedAt: 1000,
      branchStates: [
        {
          branchId: 'branch-1',
          status: 'loading',
          modelId: 'model-1',
          startedAt: 2000,
        },
      ],
      resumeTarget: {
        messageId: 'assistant-1',
        branchId: 'branch-1',
      },
      cancelRequested: false,
      updatedAt: 3,
    });

    expect(message?.branches[0]?.startedAt).toBe(2000);
  });

  it('当前选中非主分支时仍把根级 loading 开始时间映射到主分支', () => {
    const assistantMessage: ChatMessageState = {
      id: 'assistant-1',
      role: 'assistant',
      content: '分支回答',
      status: 'loading',
      errorMessage: null,
      branches: [
        {
          id: 'branch-1',
          modelId: 'model-1',
          modelLabel: '模型一',
          isPrimary: true,
          content: '主分支回答',
          status: 'loading',
          errorMessage: null,
          durationMs: null,
          startedAt: null,
        },
        {
          id: 'branch-2',
          modelId: 'model-2',
          modelLabel: '模型二',
          isPrimary: false,
          content: '并行分支回答',
          status: 'loading',
          errorMessage: null,
          durationMs: null,
          startedAt: null,
        },
      ],
      selectedBranchId: 'branch-2',
    };

    const [message] = applyLoadingStateToMessages([assistantMessage], {
      id: 'loading:https://example.com:chat',
      normalizedUrl: 'https://example.com',
      promptTabId: 'chat',
      sessionId: 'session-1',
      promptTabStatus: 'loading',
      startedAt: 1000,
      branchStates: [
        {
          branchId: 'branch-2',
          status: 'loading',
          modelId: 'model-2',
          startedAt: 2000,
        },
      ],
      resumeTarget: {
        messageId: 'assistant-1',
        branchId: 'branch-2',
      },
      cancelRequested: false,
      updatedAt: 3,
    });

    expect(message?.branches.find((branch) => branch.id === 'branch-1')?.startedAt).toBe(1000);
    expect(message?.branches.find((branch) => branch.id === 'branch-2')?.startedAt).toBe(2000);
  });
});
