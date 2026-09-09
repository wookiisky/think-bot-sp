import { describe, expect, it, vi } from 'vitest';

import { createChromeLocalAdapter } from '../../../src/repositories/chrome-local-adapter';
import { createConversationRepository } from '../../../src/repositories/conversation-repository';
import { createFakeStorageArea } from '../../helpers/fake-storage';

const target = { normalizedUrl: 'https://example.com', promptTabId: 'chat', messageId: 'assistant-1' };

const setup = async () => {
  const storage = createFakeStorageArea();
  const repo = createConversationRepository(createChromeLocalAdapter(storage));
  await repo.appendAssistantMessage({
    ...target, initialBranches: [{ id: 'primary', modelId: 'model-1', modelLabel: 'Primary', isPrimary: true }],
    selectedBranchId: 'primary', now: 1,
  });
  return { storage, repo };
};

describe('conversation transitions persistence', () => {
  it('分支流更新同时持久化助手镜像与摘要', async () => {
    const { repo } = await setup();
    await repo.appendAssistantBranchChunk({ ...target, branchId: 'primary', chunk: 'answer', now: 2 });
    await repo.finishAssistantBranch({ ...target, branchId: 'primary', durationMs: 10, now: 3 });
    const saved = await repo.getConversation(target.normalizedUrl, target.promptTabId);
    expect(saved?.messages[0]).toMatchObject({ content: 'answer', status: 'done' });
    expect(saved?.lastAssistantState).toEqual({ messageId: 'assistant-1', summary: 'answer', status: 'done' });
  });

  it('终态、缺失分支与非法分支 id 均不触发写入，后续操作仍正常', async () => {
    const { storage, repo } = await setup();
    await repo.finishAssistantBranch({ ...target, branchId: 'primary', durationMs: 10, now: 2 });
    const snapshot = storage.dump();
    const set = vi.spyOn(storage, 'set');
    await expect(repo.appendAssistantBranchChunk({ ...target, branchId: 'primary', chunk: 'late', now: 3 })).rejects.toThrow('already terminal');
    await expect(repo.finishAssistantMessage({ ...target, durationMs: 11, now: 3 })).rejects.toThrow('already terminal');
    await expect(repo.selectAssistantBranch({ ...target, branchId: 'missing', now: 3 })).rejects.toThrow('not found');
    await expect(repo.appendAssistantBranch({ ...target, branchId: 'primary', modelId: 'model-2', modelLabel: 'Duplicate', now: 3 })).rejects.toThrow('branch id must be unique');
    expect(set).not.toHaveBeenCalled();
    expect(storage.dump()).toEqual(snapshot);
    await repo.restartAssistantBranch({ ...target, branchId: 'primary', now: 4 });
    expect(set).toHaveBeenCalledOnce();
  });
});
