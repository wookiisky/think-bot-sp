import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createDefaultConfig } from '../../../src/domain/config/config-schema';
import { SidebarShell } from '../../../src/features/sidebar/sidebar-shell';

describe('SidebarShell', () => {
  it('挂载后主动拉取 bootstrap，并保持提取区常驻显示', async () => {
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
        shouldExtract: true,
      }),
      confirmBlacklistContinue: vi.fn(),
      reExtractContent: vi.fn().mockResolvedValue({
        payload: {
          content: '提取内容',
          extractionMethod: 'readability',
        },
      }),
      switchExtractionMethod: vi.fn(),
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

    await waitFor(() => expect(api.getSidebarBootstrap).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('sidebar-extraction-panel')).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Chat' })).toBeVisible();
    expect(await screen.findByText('提取内容')).toBeVisible();
  });

  it('黑名单命中时先显示确认层，不自动提取', async () => {
    const api = {
      getSidebarBootstrap: vi.fn().mockResolvedValue({
        type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
        browserTabId: 7,
        normalizedUrl: 'https://example.com/article',
        page: null,
        conversations: [],
        loadingStates: [],
        blockedByBlacklist: true,
        matchedRuleId: 'rule-1',
        shouldExtract: true,
      }),
      confirmBlacklistContinue: vi.fn().mockResolvedValue({
        type: 'CONFIRM_BLACKLIST_CONTINUE_SUCCESS',
        payload: {
          allowed: true,
        },
      }),
      reExtractContent: vi.fn(),
      switchExtractionMethod: vi.fn(),
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

    expect(await screen.findByText('当前页面命中黑名单')).toBeVisible();
    expect(screen.getByRole('button', { name: '继续提取' })).toBeVisible();
    expect(api.reExtractContent).not.toHaveBeenCalled();
  });
});
