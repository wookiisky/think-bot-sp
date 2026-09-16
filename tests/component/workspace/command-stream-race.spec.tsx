import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { SidebarShell } from '../../../src/features/sidebar/sidebar-shell';
import { ConversationsShell } from '../../../src/features/conversations/conversations-shell';
import { createWorkspaceCommandRaceApi } from '../../helpers/workspace-command-race-api';

afterEach(cleanup);

for (const surface of ['sidebar', 'conversations'] as const) {
  describe(`${surface} command/stream ordering`, () => {
    for (const command of ['retry-assistant', 'retry-user', 'edit-user'] as const) {
      it.each(['response-first', 'chunk', 'finished', 'failed', 'failed-first'] as const)(`${command} 保留命令响应前到达的 %s`, async (phase) => {
        const user = userEvent.setup();
        const fixture = createWorkspaceCommandRaceApi();
        render(surface === 'sidebar'
          ? <SidebarShell api={fixture.api} tabId={7} pageUrl={fixture.pageUrl} />
          : <ConversationsShell api={fixture.api} />);
        const isAssistant = command === 'retry-assistant';
        await user.hover(await screen.findByTestId(`chat-message-${isAssistant ? 'assistant-1' : 'user-1'}`));
        if (isAssistant) {
          const branch = screen.getByTestId('branch-branch-1');
          await user.hover(branch);
          await user.click(within(branch).getByRole('button', { name: '重试回答' }));
        } else if (command === 'edit-user') {
          await user.click(screen.getByRole('button', { name: '编辑' }));
          await user.clear(screen.getByLabelText('编辑消息输入'));
          await user.type(screen.getByLabelText('编辑消息输入'), '新问题');
          await user.click(screen.getByRole('button', { name: '保存并重发' }));
        } else {
          await user.click(screen.getByRole('button', { name: '重试问题' }));
        }
        expect(fixture.command).toHaveBeenCalledOnce();
        const identity = {
          normalizedUrl: fixture.pageUrl, promptTabId: 'chat', sessionId: 'new-session',
          messageId: isAssistant ? 'assistant-1' : 'assistant-new', branchId: isAssistant ? 'branch-1' : 'branch-new',
        };
        const prefix = isAssistant ? 'BRANCH' : 'CHAT';
        if (phase === 'response-first') {
          await act(async () => { fixture.resolve({ ...identity, modelId: 'model-1', modelLabel: '模型一' }); });
          const pendingBranch = screen.getByTestId(`branch-${identity.branchId}`);
          expect(within(pendingBranch).queryByText('旧回答')).toBeNull();
          expect(within(pendingBranch).getByRole('button', { name: '停止' })).toBeVisible();
        }
        await act(async () => {
          if (phase !== 'failed-first') fixture.emit({ ...identity, type: `${prefix}_STREAM_STARTED`, modelId: 'model-1', modelLabel: '模型一', startedAt: Date.now() });
          if (phase !== 'failed-first') fixture.emit({ ...identity, type: `${prefix}_STREAM_CHUNK`, chunk: '新的回答' });
          if (phase === 'finished' || phase === 'failed' || phase === 'failed-first') fixture.emit({ ...identity, type: `${prefix}_STREAM_${phase === 'finished' ? 'FINISHED' : 'FAILED'}`, errorMessage: '服务不可用', durationMs: 42 });
        });
        if (phase !== 'response-first') await act(async () => { fixture.resolve({ ...identity, modelId: 'model-1', modelLabel: '模型一' }); });
        const branch = screen.getByTestId(`branch-${identity.branchId}`);
        if (phase !== 'failed-first') expect(within(branch).getByText('新的回答')).toBeVisible();
        expect(within(branch).queryByText('旧回答')).toBeNull();
        if (phase === 'failed' || phase === 'failed-first') expect(within(branch).getByText('服务不可用')).toBeVisible();
        if (phase === 'finished' || phase === 'failed' || phase === 'failed-first') expect(within(branch).queryByRole('button', { name: '停止' })).toBeNull();
        if (command === 'edit-user') expect(screen.getByText('新问题')).toBeVisible();
      });
    }
  });
}
