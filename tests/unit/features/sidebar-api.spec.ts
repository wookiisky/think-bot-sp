import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSidebarApi } from '../../../src/features/sidebar/sidebar-api';

describe('createSidebarApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('收到 background error 响应时直接抛错', async () => {
    const sendMessage = vi.fn((_message: unknown, callback: (response: unknown) => void) => {
      callback({ error: 'no branch models configured' });
    });

    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage,
        lastError: null,
      },
    });

    const api = createSidebarApi();

    await expect(
      api.expandMessageBranches({
        tabId: 7,
        pageUrl: 'https://example.com/article',
        promptTabId: 'chat',
        messageId: 'assistant-1',
      }),
    ).rejects.toThrow('no branch models configured');
  });
});
