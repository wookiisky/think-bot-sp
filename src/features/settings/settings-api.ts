import type { ExtensionConfig } from '../../domain/config/config-schema';
import type { RecentErrorSummary } from '../../domain/error/recent-error-schema';

type CacheStats = {
  /** 本地缓存条目数。 */
  entryCount: number;
  /** 本地缓存字节数。 */
  bytes: number;
};

type RuntimeResponse<T> = {
  type: string;
} & T;

type RuntimeErrorResponse = {
  /** background 返回的错误信息。 */
  error?: string;
};

const sendMessage = <TResponse,>(message: unknown): Promise<TResponse> => {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    throw new Error('chrome.runtime.sendMessage is unavailable');
  }

  return new Promise<TResponse>((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: TResponse) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(response);
    });
  });
};

const requestConfig = async <TResponse extends RuntimeResponse<Record<string, unknown>>>(
  message: unknown,
) => {
  const response = await sendMessage<TResponse | RuntimeErrorResponse>(message);
  if (typeof response === 'object' && response !== null && 'error' in response && typeof response.error === 'string') {
    throw new Error(response.error);
  }

  return response;
};

/** 设置页 API，统一收口 options 对 background 配置命令的调用。 */
export const settingsApi = {
  /** 读取配置。 */
  async getConfig() {
    const response = await requestConfig<RuntimeResponse<{ config: ExtensionConfig }>>({
      type: 'GET_CONFIG',
    });
    return response.config;
  },

  /** 保存配置。 */
  async saveConfig(config: ExtensionConfig) {
    const response = await requestConfig<RuntimeResponse<{ config: ExtensionConfig }>>({
      type: 'SAVE_CONFIG',
      config,
    });
    return response.config;
  },

  /** 重置配置。 */
  async resetConfig() {
    const response = await requestConfig<RuntimeResponse<{ config: ExtensionConfig }>>({
      type: 'RESET_CONFIG',
    });
    return response.config;
  },

  /** 导入配置。 */
  async importConfig(payload: string) {
    const response = await requestConfig<RuntimeResponse<{ config: ExtensionConfig }>>({
      type: 'IMPORT_CONFIG',
      payload,
    });
    return response.config;
  },

  /** 导出配置。 */
  async exportConfig() {
    const response = await requestConfig<RuntimeResponse<{ payload: string }>>({
      type: 'EXPORT_CONFIG',
    });
    return response.payload;
  },

  /** 测试同步连接。 */
  async testSyncConnection(sync: ExtensionConfig['sync']) {
    const response = await requestConfig<RuntimeResponse<{ result: { provider: string; ok: true; message: string } }>>({
      type: 'TEST_SYNC_CONNECTION',
      sync,
    });
    return response.result;
  },

  /** 执行同步并回写最近同步时间。 */
  async syncNow(config: ExtensionConfig) {
    const response = await requestConfig<
      RuntimeResponse<{
        result: { provider: string; lastSyncAt: number; snapshotBytes: number };
        config: ExtensionConfig;
      }>
    >({
      type: 'SYNC_NOW',
      config,
    });
    return {
      config: response.config,
      result: response.result,
    };
  },

  /** 读取本地缓存统计。 */
  async getLocalCacheStats() {
    const response = await requestConfig<RuntimeResponse<{ stats: CacheStats }>>({
      type: 'GET_LOCAL_CACHE_STATS',
    });
    return response.stats;
  },

  /** 清理本地缓存。 */
  async clearLocalCache() {
    const response = await requestConfig<RuntimeResponse<{ result: { removedKeys: number } }>>({
      type: 'CLEAR_LOCAL_CACHE',
    });
    return response.result;
  },

  /** 读取最近一次错误摘要。 */
  async getRecentError() {
    const response = await requestConfig<RuntimeResponse<{ recentError: RecentErrorSummary | null }>>({
      type: 'GET_RECENT_ERROR',
    });
    return response.recentError;
  },
};
