import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { createDefaultConfig } from '../../../src/domain/config/config-schema';
import { SidebarShell } from '../../../src/features/sidebar/sidebar-shell';

describe('SidebarShell export guard', () => {
  it('空会话导出时不给下载文件', async () => {
    const user = userEvent.setup();
    const api = {
      getSidebarBootstrap: vi.fn().mockResolvedValue({
        type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
        browserTabId: 7,
        normalizedUrl: 'https://example.com/article',
        page: null,
        conversations: [],
        loadingStates: [],
        blockedByBlacklist: false,
        matchedRuleId: null,
        shouldExtract: false,
      }),
      confirmBlacklistContinue: vi.fn(),
      reExtractContent: vi.fn(),
      switchExtractionMethod: vi.fn(),
      clearPageContext: vi.fn(),
      clearTabConversation: vi.fn(),
      openHistoryPage: vi.fn(),
      openSettingsPage: vi.fn(),
      openGithubProject: vi.fn(),
      getConfig: vi.fn().mockResolvedValue({
        type: 'GET_CONFIG_SUCCESS',
        config: createDefaultConfig(),
      }),
      sendChat: vi.fn(),
      stopSession: vi.fn(),
      exportConversation: vi.fn(),
      connectStream: vi.fn(() => ({
        disconnect: vi.fn(),
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      })),
    };

    render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

    await user.click(await screen.findByRole('button', { name: '导出' }));

    expect(api.exportConversation).not.toHaveBeenCalled();
    expect(screen.getByText('当前会话为空，不能导出')).toBeVisible();
  });
});
