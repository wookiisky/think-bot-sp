import { describe, expect, it } from 'vitest';

import { findBranchPreviewDetail, upsertAssistantFailure, type ChatMessageState } from '../../../src/features/workspace/workspace-state';

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
});
