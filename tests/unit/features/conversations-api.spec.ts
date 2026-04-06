import { afterEach, describe, expect, it, vi } from 'vitest';

import { createConversationsApi } from '../../../src/features/conversations/conversations-api';

describe('createConversationsApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('收到 background error 响应时直接抛错', async () => {
    const sendMessage = vi.fn((_message: unknown, callback: (response: unknown) => void) => {
      callback({ error: 'assistant message not found: assistant-1' });
    });

    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage,
        lastError: null,
      },
    });

    const api = createConversationsApi();

    await expect(
      api.expandMessageBranches({
        pageUrl: 'https://example.com/article',
        promptTabId: 'chat',
        messageId: 'assistant-1',
      }),
    ).rejects.toThrow('assistant message not found: assistant-1');
  });
});
