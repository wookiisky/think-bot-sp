import { describe, expect, it } from 'vitest';

import {
  createLoadingState,
  loadingStateRecordSchema,
} from '../../../src/domain/loading/loading-state-schema';

describe('loading state schema', () => {
  it('创建单个 promptTab 的主 loading 会话', () => {
    const state = createLoadingState({
      normalizedUrl: 'https://example.com',
      promptTabId: 'chat',
      sessionId: 'session-1',
      now: 10,
    });

    expect(loadingStateRecordSchema.parse(state)).toEqual(state);
    expect(state.id).toBe('loading:https://example.com:chat');
    expect(state.promptTabStatus).toBe('loading');
    expect(state.branchStates).toEqual([]);
    expect(state.cancelRequested).toBe(false);
  });

  it('拒绝重复 branchId', () => {
    expect(
      loadingStateRecordSchema.safeParse({
        id: 'loading:https://example.com:chat',
        normalizedUrl: 'https://example.com',
        promptTabId: 'chat',
        sessionId: 'session-1',
        promptTabStatus: 'loading',
        branchStates: [
          { branchId: 'b1', status: 'loading', modelId: 'm1' },
          { branchId: 'b1', status: 'error', modelId: 'm2' },
        ],
        resumeTarget: null,
        cancelRequested: false,
        updatedAt: 1,
      }).success,
    ).toBe(false);
  });
});
