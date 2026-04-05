import { describe, expect, it, vi } from 'vitest';

import { createDefaultConfig } from '../../../../src/domain/config/config-schema';
import {
  createConfigCommandHandler,
  isConfigCommandMessage,
  supportedCommandTypes,
} from '../../../../src/services/runtime-messaging/config-commands';

describe('config-commands', () => {
  it('暴露统一的命令识别能力', () => {
    expect(Array.from(supportedCommandTypes)).toEqual([
      'GET_CONFIG',
      'GET_RECENT_ERROR',
      'SAVE_CONFIG',
      'RESET_CONFIG',
      'IMPORT_CONFIG',
      'EXPORT_CONFIG',
      'TEST_SYNC_CONNECTION',
      'TEST_MODEL',
      'SYNC_NOW',
      'GET_LOCAL_CACHE_STATS',
      'CLEAR_LOCAL_CACHE',
    ]);
    expect(isConfigCommandMessage({ type: 'GET_CONFIG' })).toBe(true);
    expect(isConfigCommandMessage({ type: 'UNKNOWN' })).toBe(false);
    expect(isConfigCommandMessage({})).toBe(false);
  });

  it('按命令路由到对应仓储', async () => {
    const config = createDefaultConfig({
      models: [
        {
          id: 'model-1',
          name: '主模型',
          provider: 'openai-compatible',
          enabled: true,
          model: 'gpt-4.1-mini',
          baseUrl: 'https://api.example.com/v1',
          apiKey: 'secret',
          deployment: '',
          temperature: 1,
          tools: [],
          reasoningEffort: 'high',
          thinkingBudget: null,
          maxOutputTokens: null,
          supportsImages: false,
          order: 0,
          deletedAt: null,
        },
      ],
    });
    const syncedConfig = createDefaultConfig({
      sync: {
        ...config.sync,
        lastSyncAt: 123,
      },
    });
    const configRepository = {
      getConfig: vi.fn().mockResolvedValue(config),
      saveConfig: vi.fn().mockResolvedValue(config),
      resetConfig: vi.fn().mockResolvedValue(config),
      importConfig: vi.fn().mockResolvedValue(config),
      exportConfig: vi.fn().mockResolvedValue('{"version":"2.0.0"}'),
      updateSyncMetadata: vi.fn().mockResolvedValue(syncedConfig),
    };
    const pageRepository = {
      getCacheStats: vi.fn().mockResolvedValue({ pageCount: 1, entryCount: 2, bytes: 128 }),
      clearCache: vi.fn().mockResolvedValue({ removedKeys: 2 }),
    };
    const recentErrorRepository = {
      getRecentError: vi.fn().mockResolvedValue({
        source: 'sync',
        operation: 'SYNC_NOW',
        message: '同步失败',
        capturedAt: 321,
      }),
    };
    const syncService = {
      testConnection: vi.fn().mockResolvedValue({ provider: 'gist', ok: true, message: 'ok' }),
      syncNow: vi.fn().mockResolvedValue({ provider: 'gist', lastSyncAt: 123, snapshotBytes: 512 }),
    };
    const modelTestService = {
      testModel: vi.fn().mockResolvedValue({ provider: 'openai-compatible', text: 'hi' }),
    };
    const handler = createConfigCommandHandler({
      configRepository,
      pageRepository,
      recentErrorRepository,
      syncService,
      modelTestService,
    });

    await expect(handler({ type: 'GET_CONFIG' })).resolves.toEqual({
      type: 'GET_CONFIG_SUCCESS',
      config,
    });
    expect(configRepository.getConfig).toHaveBeenCalledTimes(1);
    expect(configRepository.saveConfig).not.toHaveBeenCalled();
    expect(configRepository.resetConfig).not.toHaveBeenCalled();
    expect(configRepository.importConfig).not.toHaveBeenCalled();
    expect(configRepository.exportConfig).not.toHaveBeenCalled();
    expect(pageRepository.getCacheStats).not.toHaveBeenCalled();
    expect(pageRepository.clearCache).not.toHaveBeenCalled();
    expect(recentErrorRepository.getRecentError).not.toHaveBeenCalled();

    await expect(handler({ type: 'GET_RECENT_ERROR' })).resolves.toEqual({
      type: 'GET_RECENT_ERROR_SUCCESS',
      recentError: {
        source: 'sync',
        operation: 'SYNC_NOW',
        message: '同步失败',
        capturedAt: 321,
      },
    });
    expect(recentErrorRepository.getRecentError).toHaveBeenCalledTimes(1);

    await expect(handler({ type: 'SAVE_CONFIG', config })).resolves.toEqual({
      type: 'SAVE_CONFIG_SUCCESS',
      config,
    });
    expect(configRepository.saveConfig).toHaveBeenCalledTimes(1);
    expect(configRepository.saveConfig).toHaveBeenCalledWith(config);

    await expect(handler({ type: 'RESET_CONFIG' })).resolves.toEqual({
      type: 'RESET_CONFIG_SUCCESS',
      config,
    });
    expect(configRepository.resetConfig).toHaveBeenCalledTimes(1);

    await expect(handler({ type: 'IMPORT_CONFIG', payload: JSON.stringify(config) })).resolves.toEqual({
      type: 'IMPORT_CONFIG_SUCCESS',
      config,
    });
    expect(configRepository.importConfig).toHaveBeenCalledTimes(1);
    expect(configRepository.importConfig).toHaveBeenCalledWith(JSON.stringify(config));

    await expect(handler({ type: 'EXPORT_CONFIG' })).resolves.toEqual({
      type: 'EXPORT_CONFIG_SUCCESS',
      payload: '{"version":"2.0.0"}',
    });
    expect(configRepository.exportConfig).toHaveBeenCalledTimes(1);

    await expect(handler({ type: 'TEST_SYNC_CONNECTION', sync: config.sync })).resolves.toEqual({
      type: 'TEST_SYNC_CONNECTION_SUCCESS',
      result: { provider: 'gist', ok: true, message: 'ok' },
    });
    expect(syncService.testConnection).toHaveBeenCalledWith(config.sync);

    await expect(handler({ type: 'TEST_MODEL', model: config.models[0] })).resolves.toEqual({
      type: 'TEST_MODEL_SUCCESS',
      result: { provider: 'openai-compatible', text: 'hi' },
    });
    expect(modelTestService.testModel).toHaveBeenCalledWith(config.models[0]);

    await expect(handler({ type: 'SYNC_NOW', config })).resolves.toEqual({
      type: 'SYNC_NOW_SUCCESS',
      config: syncedConfig,
      result: { provider: 'gist', lastSyncAt: 123, snapshotBytes: 512 },
    });
    expect(configRepository.saveConfig).toHaveBeenCalledWith(config);
    expect(syncService.syncNow).toHaveBeenCalledWith(config);
    expect(configRepository.updateSyncMetadata).toHaveBeenCalledWith(123);

    await expect(handler({ type: 'GET_LOCAL_CACHE_STATS' })).resolves.toEqual({
      type: 'GET_LOCAL_CACHE_STATS_SUCCESS',
      stats: { pageCount: 1, entryCount: 2, bytes: 128 },
    });
    expect(pageRepository.getCacheStats).toHaveBeenCalledTimes(1);

    await expect(handler({ type: 'CLEAR_LOCAL_CACHE' })).resolves.toEqual({
      type: 'CLEAR_LOCAL_CACHE_SUCCESS',
      result: { removedKeys: 2 },
    });
    expect(pageRepository.clearCache).toHaveBeenCalledTimes(1);
  });

  it('拒绝未知命令和非法保存参数', async () => {
    const handler = createConfigCommandHandler({
      configRepository: {
        getConfig: vi.fn(),
        saveConfig: vi.fn(),
        resetConfig: vi.fn(),
        importConfig: vi.fn(),
        exportConfig: vi.fn(),
        updateSyncMetadata: vi.fn(),
      },
      pageRepository: {
        getCacheStats: vi.fn(),
        clearCache: vi.fn(),
      },
      recentErrorRepository: {
        getRecentError: vi.fn(),
      },
      syncService: {
        testConnection: vi.fn(),
        syncNow: vi.fn(),
      },
      modelTestService: {
        testModel: vi.fn(),
      },
    });

    await expect(handler({ type: 'UNKNOWN' } as never)).rejects.toThrow(/unsupported command/i);
    await expect(handler({ type: 'SAVE_CONFIG', config: {} })).rejects.toThrow();
  });
});
