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

type ChromeLocalAdapter = ReturnType<typeof import('./chrome-local-adapter').createChromeLocalAdapter>;

/** 配置仓储，统一收口读取、写入和导入校验。 */
export const createConfigRepository = (storage: ChromeLocalAdapter) => {
  const readConfig = async () => {
    const result = await storage.get<Record<string, unknown>>([CONFIG_STORAGE_KEY]);
    const saved = result[CONFIG_STORAGE_KEY];
    return saved ? applySystemConfigSeeds(extensionConfigSchema.parse(saved)) : createDefaultConfig();
  };

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
  };
};
