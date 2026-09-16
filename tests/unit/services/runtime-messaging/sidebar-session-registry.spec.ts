import { describe, expect, it } from 'vitest';
import { createSidebarSessionRegistry } from '../../../../src/services/runtime-messaging/sidebar-session-registry';
import { createControlledSidebarSession } from '../../../helpers/controlled-sidebar-session';

const scope = { normalizedUrl: 'https://example.com/article', promptTabId: 'summary' };

describe('sidebar session registry', () => {
  it('整轮注册只给附加分支建立分支索引，分支取消不会取消协调器', () => {
    const registry = createSidebarSessionRegistry();
    const coordinator = createControlledSidebarSession('main', 'main-branch');
    const branch = createControlledSidebarSession('other', 'other-branch');
    registry.registerTurn({ coordinator, branchSessions: [branch], scope });

    expect(registry.cancelBranchSession({ ...scope, branchId: 'main-branch' })).toBe(false);
    expect(registry.cancelBranchSession({ ...scope, promptTabId: 'chat', branchId: branch.branchId })).toBe(false);
    expect(registry.cancelBranchSession({ ...scope, normalizedUrl: 'https://other.com', branchId: branch.branchId })).toBe(false);
    expect(registry.cancelBranchSession({ ...scope, branchId: branch.branchId })).toBe(true);
    expect(branch.cancel).toHaveBeenCalledOnce();
    expect(coordinator.cancel).not.toHaveBeenCalled();
  });

  it('取消整轮等待协调器和全部附加分支收尾，不影响其他页面', async () => {
    const registry = createSidebarSessionRegistry();
    const coordinator = createControlledSidebarSession('main');
    const branch = createControlledSidebarSession('other');
    const unrelated = createControlledSidebarSession('unrelated');
    registry.registerTurn({ coordinator, branchSessions: [branch], scope });
    registry.register(unrelated, { ...scope, normalizedUrl: 'https://other.com' });
    let finished = false;
    const cancellation = registry.cancelPromptTabSessions(scope).then((count) => { finished = true; return count; });
    expect(coordinator.cancel).toHaveBeenCalledOnce();
    expect(branch.cancel).toHaveBeenCalledOnce();
    coordinator.finish();
    await Promise.resolve();
    expect(finished).toBe(false);
    branch.finish();
    await expect(cancellation).resolves.toBe(2);
    expect(unrelated.cancel).not.toHaveBeenCalled();
    expect(registry.hasPromptTabSessions(scope)).toBe(false);
  });

  it('失败会话释放注册，但旧会话完成不能移除同 id 的新会话', async () => {
    const registry = createSidebarSessionRegistry();
    const previous = createControlledSidebarSession('same');
    const current = createControlledSidebarSession('same');
    registry.register(previous, scope);
    registry.register(current, scope);
    previous.reject(new Error('old failure'));
    await Promise.resolve();
    expect(registry.cancelSession({ ...scope, sessionId: 'same' })).toBe(true);
    expect(current.cancel).toHaveBeenCalledOnce();
    current.reject(new Error('current failure'));
    await Promise.resolve();
    expect(registry.hasPromptTabSessions(scope)).toBe(false);
  });
});
