import { describe, expect, it, vi } from 'vitest';

import { createDefaultConfig } from '../../../src/domain/config/config-schema';
import { createSyncService } from '../../../src/services/sync/sync-service';

describe('sync-service', () => {
  it('在服务创建后注入测试 provider 也能生效', async () => {
    let testProvider:
      | {
          /** 测试连接。 */
          testConnection: ReturnType<typeof vi.fn>;
          /** 执行同步。 */
          syncNow: ReturnType<typeof vi.fn>;
        }
      | null = null;

    const service = createSyncService({
      getTestProvider: () => testProvider,
      fetchImpl: vi.fn(),
      now: () => 456,
    });

    testProvider = {
      testConnection: vi.fn().mockResolvedValue({
        provider: 'gist',
        ok: true,
        message: '连接成功',
      }),
      syncNow: vi.fn().mockResolvedValue({
        provider: 'gist',
        lastSyncAt: 123,
        snapshotBytes: 64,
      }),
    };

    const config = createDefaultConfig({
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
    });

    await expect(service.testConnection(config.sync)).resolves.toEqual({
      provider: 'gist',
      ok: true,
      message: '连接成功',
    });
    await expect(service.syncNow(config)).resolves.toEqual({
      provider: 'gist',
      lastSyncAt: 123,
      snapshotBytes: 64,
    });

    expect(testProvider.testConnection).toHaveBeenCalledWith(config.sync);
    expect(testProvider.syncNow).toHaveBeenCalledWith(config);
  });
});
