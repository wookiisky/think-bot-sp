import { z } from 'zod';

import type { ExtensionConfig } from '../../domain/config/config-schema';
import { extensionConfigSchema } from '../../domain/config/config-schema';

type SupportedCommandType =
  | 'GET_CONFIG'
  | 'GET_RECENT_ERROR'
  | 'SAVE_CONFIG'
  | 'RESET_CONFIG'
  | 'IMPORT_CONFIG'
  | 'EXPORT_CONFIG'
  | 'TEST_SYNC_CONNECTION'
  | 'SYNC_NOW'
  | 'GET_LOCAL_CACHE_STATS'
  | 'CLEAR_LOCAL_CACHE';

export const supportedCommandTypes = new Set<SupportedCommandType>([
  'GET_CONFIG',
  'GET_RECENT_ERROR',
  'SAVE_CONFIG',
  'RESET_CONFIG',
  'IMPORT_CONFIG',
  'EXPORT_CONFIG',
  'TEST_SYNC_CONNECTION',
  'SYNC_NOW',
  'GET_LOCAL_CACHE_STATS',
  'CLEAR_LOCAL_CACHE',
] as const);

const messageTypeSchema = z.object({
  type: z.string(),
});

/** 判断输入是否是配置相关命令。 */
export const isConfigCommandMessage = (
  input: unknown,
): input is { type: SupportedCommandType } => {
  const parsed = messageTypeSchema.safeParse(input);
  return parsed.success && supportedCommandTypes.has(parsed.data.type as SupportedCommandType);
};

const saveConfigCommandSchema = z.object({
  type: z.literal('SAVE_CONFIG'),
  config: extensionConfigSchema,
});

const importConfigCommandSchema = z.object({
  type: z.literal('IMPORT_CONFIG'),
  payload: z.string().min(1),
});

const testSyncConnectionCommandSchema = z.object({
  type: z.literal('TEST_SYNC_CONNECTION'),
  sync: extensionConfigSchema.shape.sync,
});

const syncNowCommandSchema = z.object({
  type: z.literal('SYNC_NOW'),
  config: extensionConfigSchema,
});

type ConfigRepositories = {
  /** 读取当前配置。 */
  getConfig: () => Promise<unknown>;
  /** 保存当前配置。 */
  saveConfig: (config: ExtensionConfig) => Promise<unknown>;
  /** 重置当前配置。 */
  resetConfig: () => Promise<unknown>;
  /** 导入配置。 */
  importConfig: (payload: string) => Promise<unknown>;
  /** 导出当前配置。 */
  exportConfig: () => Promise<string>;
  /** 写回最近同步时间。 */
  updateSyncMetadata: (lastSyncAt: number) => Promise<unknown>;
};

type PageRepositories = {
  /** 获取本地缓存统计。 */
  getCacheStats: () => Promise<{ entryCount: number; bytes: number }>;
  /** 清理本地缓存。 */
  clearCache: () => Promise<{ removedKeys: number }>;
};

type RecentErrorRepository = {
  /** 读取最近一次错误。 */
  getRecentError: () => Promise<unknown | null>;
};

type SyncService = {
  /** 测试同步连接。 */
  testConnection: (sync: ExtensionConfig['sync']) => Promise<unknown>;
  /** 执行同步。 */
  syncNow: (config: ExtensionConfig) => Promise<{ provider: string; lastSyncAt: number; snapshotBytes: number }>;
};

/** 创建配置相关的 runtime command 处理器。 */
export const createConfigCommandHandler = ({
  configRepository,
  pageRepository,
  recentErrorRepository,
  syncService,
}: {
  configRepository: ConfigRepositories;
  pageRepository: PageRepositories;
  recentErrorRepository: RecentErrorRepository;
  syncService: SyncService;
}) => {
  return async (input: unknown) => {
    const parsedMessage = messageTypeSchema.safeParse(input);
    if (!isConfigCommandMessage(input)) {
      const type = parsedMessage.success ? parsedMessage.data.type : 'unknown';
      throw new Error(`unsupported command: ${type}`);
    }

    switch (input.type) {
      case 'GET_CONFIG':
        return {
          type: 'GET_CONFIG_SUCCESS',
          config: await configRepository.getConfig(),
        };
      case 'GET_RECENT_ERROR':
        return {
          type: 'GET_RECENT_ERROR_SUCCESS',
          recentError: await recentErrorRepository.getRecentError(),
        };
      case 'SAVE_CONFIG': {
        const command = saveConfigCommandSchema.parse(input);
        return {
          type: 'SAVE_CONFIG_SUCCESS',
          config: await configRepository.saveConfig(command.config),
        };
      }
      case 'RESET_CONFIG':
        return {
          type: 'RESET_CONFIG_SUCCESS',
          config: await configRepository.resetConfig(),
        };
      case 'IMPORT_CONFIG': {
        const command = importConfigCommandSchema.parse(input);
        return {
          type: 'IMPORT_CONFIG_SUCCESS',
          config: await configRepository.importConfig(command.payload),
        };
      }
      case 'EXPORT_CONFIG':
        return {
          type: 'EXPORT_CONFIG_SUCCESS',
          payload: await configRepository.exportConfig(),
        };
      case 'TEST_SYNC_CONNECTION': {
        const command = testSyncConnectionCommandSchema.parse(input);
        return {
          type: 'TEST_SYNC_CONNECTION_SUCCESS',
          result: await syncService.testConnection(command.sync),
        };
      }
      case 'SYNC_NOW': {
        const command = syncNowCommandSchema.parse(input);
        const savedConfig = (await configRepository.saveConfig(command.config)) as ExtensionConfig;
        const result = await syncService.syncNow(savedConfig);
        return {
          type: 'SYNC_NOW_SUCCESS',
          config: await configRepository.updateSyncMetadata(result.lastSyncAt),
          result,
        };
      }
      case 'GET_LOCAL_CACHE_STATS':
        return {
          type: 'GET_LOCAL_CACHE_STATS_SUCCESS',
          stats: await pageRepository.getCacheStats(),
        };
      case 'CLEAR_LOCAL_CACHE':
        return {
          type: 'CLEAR_LOCAL_CACHE_SUCCESS',
          result: await pageRepository.clearCache(),
        };
      default:
        throw new Error(`unsupported command: ${input.type}`);
    }
  };
};
