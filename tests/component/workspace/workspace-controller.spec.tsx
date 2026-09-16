import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceController, type WorkspaceSnapshot } from '../../../src/features/workspace/use-workspace-controller';
import { createConversationsWorkspaceTransport, createSidebarWorkspaceTransport } from '../../../src/features/workspace/workspace-transport';
import { createChatPromptTab } from '../../../src/features/workspace/workspace-state';
import { createWorkspaceCommandRaceApi } from '../../helpers/workspace-command-race-api';

afterEach(cleanup);

/** 构造已加载页面的最小工作台快照。 */
const snapshot = (pageKey: string): WorkspaceSnapshot => ({
  pageKey, promptTabs: [createChatPromptTab('model-1', 'Chat')], models: [], conversations: [], loadingStates: [],
  activePromptTabId: 'chat', includePageContent: true, llmRequestTimeoutSeconds: 60,
});

const input = { text: 'question', images: [], modelId: 'model-1', includePageContent: true };

describe('共享工作台控制器', () => {
  it('仅在当前页面恢复后允许发送，A → B → A 不接受最初 A 的快照', async () => {
    const fixture = createWorkspaceCommandRaceApi();
    const transport = createSidebarWorkspaceTransport({ api: fixture.api, tabId: 7, pageUrl: fixture.pageUrl });
    const { result, rerender } = renderHook(({ pageKey }) => useWorkspaceController({ pageKey, transport, t: (key) => key, onToast: vi.fn() }), { initialProps: { pageKey: 'A' } });
    await act(() => result.current.actions.send('chat', input));
    expect(fixture.api.sendChat).not.toHaveBeenCalled();
    const restoreOriginal = result.current.restore;
    act(() => result.current.restore(snapshot('A')));
    expect(result.current.view.ready).toBe(true);
    rerender({ pageKey: 'B' });
    expect(result.current.view.ready).toBe(false);
    act(() => result.current.restore(snapshot('A')));
    expect(result.current.view.ready).toBe(false);
    rerender({ pageKey: 'A' });
    act(() => restoreOriginal(snapshot('A')));
    expect(result.current.view.ready).toBe(false);
  });

  it('修改草稿、流内容与翻译回调不会重订阅，并在清空页面时保留草稿', () => {
    const fixture = createWorkspaceCommandRaceApi();
    const transport = createSidebarWorkspaceTransport({ api: fixture.api, tabId: 7, pageUrl: fixture.pageUrl });
    const { result, rerender } = renderHook(({ t }) => useWorkspaceController({ pageKey: 'A', transport, t, onToast: vi.fn() }), { initialProps: { t: (key: string) => key } });
    act(() => result.current.restore(snapshot('A')));
    expect(fixture.api.connectStream).toHaveBeenCalledOnce();
    act(() => result.current.actions.updateComposer('chat', { text: 'unsent draft' }));
    const identity = { normalizedUrl: fixture.pageUrl, promptTabId: 'chat', sessionId: 'session-1', messageId: 'assistant-1', branchId: 'branch-1' };
    act(() => fixture.emit({ ...identity, type: 'CHAT_STREAM_STARTED', modelId: 'model-1', modelLabel: 'Model', startedAt: Date.now() }));
    act(() => fixture.emit({ ...identity, type: 'CHAT_STREAM_CHUNK', chunk: 'answer' }));
    rerender({ t: (key) => `translated:${key}` });
    act(() => fixture.emit({ ...identity, type: 'CHAT_STREAM_CANCELLED', durationMs: 10 }));
    expect(result.current.view.messageMap.chat?.[0]?.errorMessage).toBe('translated:workspace.status.cancelled');
    act(() => result.current.clearPageMessages());
    expect(result.current.view.composerMap.chat?.text).toBe('unsent draft');
    expect(fixture.api.connectStream).toHaveBeenCalledOnce();
  });


  it.each(['sidebar', 'history'] as const)('%s 保留清空标签与删除最后分支的既有策略', async (surface) => {
    const fixture = createWorkspaceCommandRaceApi();
    const transport = surface === 'sidebar'
      ? createSidebarWorkspaceTransport({ api: fixture.api, tabId: 7, pageUrl: fixture.pageUrl })
      : createConversationsWorkspaceTransport({ api: fixture.api, pageUrl: fixture.pageUrl, normalizedUrl: fixture.pageUrl });
    const initial = snapshot('A');
    const bootstrap = await fixture.api.getSidebarBootstrap();
    initial.conversations = bootstrap.conversations;
    initial.promptTabs[0]!.promptTabState = { promptTabId: 'chat', initializedAt: 1, lastAutoTriggerAt: 2, autoTriggerStatus: 'done', lastClearedAt: null };
    const { result } = renderHook(() => useWorkspaceController({ pageKey: 'A', transport, t: (key) => key, onToast: vi.fn() }));
    act(() => result.current.restore(initial));
    act(() => result.current.actions.updateComposer('chat', { text: 'draft' }));
    await act(() => result.current.actions.deleteBranch('chat', 'assistant-1', 'branch-1'));
    expect(result.current.view.messageMap.chat?.some((message) => message.id === 'assistant-1')).toBe(surface === 'history');
    await act(() => result.current.actions.clearTab('chat'));
    expect(result.current.view.messageMap.chat).toEqual([]);
    expect(result.current.view.composerMap.chat?.text).toBe('draft');
    const tabState = result.current.view.promptTabs[0]?.promptTabState;
    expect(tabState?.autoTriggerStatus).toBe(surface === 'sidebar' ? 'idle' : 'done');
    expect(tabState?.initializedAt).toBe(surface === 'sidebar' ? null : 1);
  });
});
