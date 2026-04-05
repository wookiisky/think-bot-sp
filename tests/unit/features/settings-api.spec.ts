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

  it('同步命令返回成功载荷时正确解析结果', async () => {
    const sendMessage = vi.fn((message: unknown, callback: (response: unknown) => void) => {
      if ((message as { type?: string }).type === 'TEST_SYNC_CONNECTION') {
        callback({
          type: 'TEST_SYNC_CONNECTION_SUCCESS',
          result: {
            provider: 'gist',
            ok: true,
            message: 'ok',
          },
        });
        return;
      }

      callback({
        type: 'SYNC_NOW_SUCCESS',
        result: {
          provider: 'gist',
          lastSyncAt: 123,
          snapshotBytes: 512,
        },
        config: {
          version: '2.0.0',
          updatedAt: 123,
          basic: {
            theme: 'system',
            language: 'zh-CN',
            defaultModelId: null,
            systemPrompt: '',
            filterCot: false,
            extractionMethod: 'readability',
            includePageContentByDefault: true,
          },
          models: [],
          quickInputs: [],
          sync: {
            enabled: true,
            provider: 'gist',
            gistToken: 'token',
            gistId: 'gist-id',
            webdavUrl: '',
            webdavUsername: '',
            webdavPassword: '',
            lastSyncAt: 123,
          },
          blacklist: [],
        },
      });
    });

    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage,
        lastError: null,
      },
    });

    await expect(
      settingsApi.testSyncConnection({
        enabled: true,
        provider: 'gist',
        gistToken: 'token',
        gistId: 'gist-id',
        webdavUrl: '',
        webdavUsername: '',
        webdavPassword: '',
        lastSyncAt: null,
      }),
    ).resolves.toEqual({
      provider: 'gist',
      ok: true,
      message: 'ok',
    });

    await expect(
      settingsApi.syncNow({
        version: '2.0.0',
        updatedAt: 123,
        basic: {
          theme: 'system',
          language: 'zh-CN',
          defaultModelId: null,
          systemPrompt: '',
          filterCot: false,
          extractionMethod: 'readability',
          includePageContentByDefault: true,
        },
        models: [],
        quickInputs: [],
        sync: {
          enabled: true,
          provider: 'gist',
          gistToken: 'token',
          gistId: 'gist-id',
          webdavUrl: '',
          webdavUsername: '',
          webdavPassword: '',
          lastSyncAt: null,
        },
        blacklist: [],
      }),
    ).resolves.toEqual({
      config: expect.objectContaining({
        sync: expect.objectContaining({
          lastSyncAt: 123,
        }),
      }),
      result: {
        provider: 'gist',
        lastSyncAt: 123,
        snapshotBytes: 512,
      },
    });
  });
});
