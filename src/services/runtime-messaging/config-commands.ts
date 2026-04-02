import { z } from 'zod';

import type { ExtensionConfig } from '../../domain/config/config-schema';
import { extensionConfigSchema } from '../../domain/config/config-schema';

type SupportedCommandType =
  | 'GET_CONFIG'
  | 'SAVE_CONFIG'
  | 'RESET_CONFIG'
  | 'IMPORT_CONFIG'
  | 'EXPORT_CONFIG'
  | 'GET_LOCAL_CACHE_STATS'
  | 'CLEAR_LOCAL_CACHE';

export const supportedCommandTypes = new Set<SupportedCommandType>([
  'GET_CONFIG',
  'SAVE_CONFIG',
  'RESET_CONFIG',
  'IMPORT_CONFIG',
  'EXPORT_CONFIG',
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
};

type PageRepositories = {
  /** 获取本地缓存统计。 */
  getCacheStats: () => Promise<{ entryCount: number; bytes: number }>;
  /** 清理本地缓存。 */
  clearCache: () => Promise<{ removedKeys: number }>;
};

/** 创建配置相关的 runtime command 处理器。 */
export const createConfigCommandHandler = ({
  configRepository,
  pageRepository,
}: {
  configRepository: ConfigRepositories;
  pageRepository: PageRepositories;
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
