import { createStorageRepository, type ChromeLocalAdapter } from './chrome-local-adapter';
import { createRecordCache } from './record-cache';
import {
  applySystemConfigSeeds,
  createDefaultConfig,
  extensionConfigSchema,
  getEnabledCompleteModels,
} from '../domain/config/config-schema';
import type { ExtensionConfig } from '../domain/config/config-schema';
import { assertBlacklistRulesPersistable } from '../services/blacklist/blacklist-service';
import { CONFIG_SCHEMA_VERSION } from '../shared/schema-version';
import { CONFIG_STORAGE_KEY } from '../shared/storage-keys';

/** 配置仓储，统一收口读取、写入和导入校验。 */
export const createConfigRepository = (storage: ChromeLocalAdapter) => createStorageRepository(storage, (storage) => {
  // 配置在一次发送里会被读多次（模型解析、并行分支、黑名单）；按修订号缓存已解析且已补种子的结果。
  const configCache = createRecordCache(storage, (saved) => applySystemConfigSeeds(extensionConfigSchema.parse(saved)));
  const readConfig = async () => (await configCache.read(CONFIG_STORAGE_KEY)) ?? createDefaultConfig();

  return {
    /** 读取完整配置。 */
    async getConfig() {
      return readConfig();
    },

    /** 保存完整配置并刷新时间戳。 */
    async saveConfig(input: ExtensionConfig) {
      const next = extensionConfigSchema.parse({
        ...input,
        version: CONFIG_SCHEMA_VERSION,
        updatedAt: Date.now(),
      });
      assertBlacklistRulesPersistable(next.blacklist);
      await storage.set({ [CONFIG_STORAGE_KEY]: next });
      return next;
    },

    /** 恢复默认配置。 */
    async resetConfig() {
      const next = createDefaultConfig();
      await storage.set({ [CONFIG_STORAGE_KEY]: next });
      return next;
    },

    /** 导出当前完整配置。 */
    async exportConfig() {
      return JSON.stringify(await readConfig(), null, 2);
    },

    /** 导入配置，版本不兼容时直接拒绝。 */
    async importConfig(payload: string) {
      const parsed = JSON.parse(payload) as { version?: string };
      if (parsed.version !== CONFIG_SCHEMA_VERSION) {
        throw new Error('unsupported config version');
      }

      const next = extensionConfigSchema.parse({
        ...parsed,
        updatedAt: Date.now(),
      });
      const seededConfig = applySystemConfigSeeds(next);
      assertBlacklistRulesPersistable(seededConfig.blacklist);
      await storage.set({ [CONFIG_STORAGE_KEY]: seededConfig });
      return seededConfig;
    },

    /** 写回最近同步时间。 */
    async updateSyncMetadata(lastSyncAt: number) {
      const current = await readConfig();
      const next = extensionConfigSchema.parse({
        ...current,
        sync: {
          ...current.sync,
          lastSyncAt,
        },
      });
      await storage.set({ [CONFIG_STORAGE_KEY]: next });
      return next;
    },

    /** 获取启用且完整的模型。 */
    async getEnabledCompleteModels() {
      return getEnabledCompleteModels(await readConfig());
    },

    /** 按稳定 id 获取模型，不存在时返回 null。 */
    async getModelById(modelId: string) {
      const config = await readConfig();
      return config.models.find((model) => model.id === modelId) ?? null;
    },
  };}, {
  unlocked: ['getConfig', 'exportConfig', 'getEnabledCompleteModels', 'getModelById'],
});
