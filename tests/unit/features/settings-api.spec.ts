import { afterEach, describe, expect, it, vi } from 'vitest';

import { settingsApi } from '../../../src/features/settings/settings-api';

describe('settingsApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('收到 background error 响应时直接抛错', async () => {
    const sendMessage = vi.fn((_message: unknown, callback: (response: unknown) => void) => {
      callback({ error: 'unsupported config version' });
    });

    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage,
        lastError: null,
      },
    });

    await expect(settingsApi.getConfig()).rejects.toThrow('unsupported config version');
  });
});
