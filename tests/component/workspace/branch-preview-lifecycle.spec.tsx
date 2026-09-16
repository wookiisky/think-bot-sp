import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';

import { ConversationsShell } from '../../../src/features/conversations/conversations-shell';
import { SidebarShell } from '../../../src/features/sidebar/sidebar-shell';
import { createWorkspaceCommandRaceApi } from '../../helpers/workspace-command-race-api';

afterEach(cleanup);

it('侧栏从页面 A 切到 B 再返回 A 时不自动重新打开预览', async () => {
  const user = userEvent.setup();
  const fixture = createWorkspaceCommandRaceApi();
  const { rerender } = render(<SidebarShell api={fixture.api} tabId={7} pageUrl={fixture.pageUrl} />);
  const branch = await screen.findByTestId('branch-branch-1');
  await user.hover(branch);
  await user.click(within(branch).getByRole('button', { name: '打开分支预览' }));
  expect(screen.getByTestId('branch-preview-dialog')).toBeVisible();

  const bootstrap = await fixture.api.getSidebarBootstrap.mock.results[0]!.value;
  const nextPageUrl = 'https://example.com/next';
  fixture.api.getSidebarBootstrap.mockResolvedValueOnce({
    ...bootstrap,
    normalizedUrl: nextPageUrl,
    page: { ...bootstrap.page, id: nextPageUrl, url: nextPageUrl, normalizedUrl: nextPageUrl, content: '页面 B 正文' },
    conversations: [],
  });
  rerender(<SidebarShell api={fixture.api} tabId={7} pageUrl={nextPageUrl} />);
  expect(await screen.findByText('页面 B 正文')).toBeVisible();
  expect(screen.queryByTestId('branch-preview-dialog')).toBeNull();

  rerender(<SidebarShell api={fixture.api} tabId={7} pageUrl={fixture.pageUrl} />);
  const restoredBranch = await screen.findByTestId('branch-branch-1');
  expect(screen.queryByTestId('branch-preview-dialog')).toBeNull();

  await user.hover(restoredBranch);
  await user.click(within(restoredBranch).getByRole('button', { name: '打开分支预览' }));
  expect(screen.getByTestId('branch-preview-dialog')).toBeVisible();
  await user.keyboard('{Escape}');
  expect(screen.queryByTestId('branch-preview-dialog')).toBeNull();
});

it.each(['sidebar', 'conversations'] as const)('%s 分支重新生成后预览保持关闭，仍可手动打开', async (surface) => {
  const user = userEvent.setup();
  const fixture = createWorkspaceCommandRaceApi();
  render(surface === 'sidebar'
    ? <SidebarShell api={fixture.api} tabId={7} pageUrl={fixture.pageUrl} />
    : <ConversationsShell api={fixture.api} />);
  const branch = await screen.findByTestId('branch-branch-1');
  await user.hover(branch);
  await user.click(within(branch).getByRole('button', { name: '打开分支预览' }));
  expect(screen.getByTestId('branch-preview-dialog')).toBeVisible();

  const identity = {
    normalizedUrl: fixture.pageUrl, promptTabId: 'chat', sessionId: 'preview-retry',
    messageId: 'assistant-1', branchId: 'branch-1',
  };
  await act(async () => {
    fixture.emit({ ...identity, type: 'BRANCH_STREAM_STARTED', modelId: 'model-1', modelLabel: '模型一', startedAt: Date.now() });
  });
  expect(screen.queryByTestId('branch-preview-dialog')).toBeNull();

  await act(async () => {
    fixture.emit({ ...identity, type: 'BRANCH_STREAM_CHUNK', chunk: '重新生成的回答' });
    fixture.emit({ ...identity, type: 'BRANCH_STREAM_FINISHED', durationMs: 42 });
  });
  const regeneratedBranch = screen.getByTestId('branch-branch-1');
  expect(within(regeneratedBranch).getByText(/重新生成的回答/)).toBeVisible();
  expect(screen.queryByTestId('branch-preview-dialog')).toBeNull();

  await user.hover(regeneratedBranch);
  await user.click(within(regeneratedBranch).getByRole('button', { name: '打开分支预览' }));
  expect(within(screen.getByTestId('branch-preview-content')).getByText(/重新生成的回答/)).toBeVisible();
  await user.keyboard('{Escape}');
  expect(screen.queryByTestId('branch-preview-dialog')).toBeNull();
});
