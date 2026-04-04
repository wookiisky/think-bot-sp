/* eslint-disable no-unused-vars */
import type { ExtensionConfig } from '../../domain/config/config-schema';
import { CONFIG_SCHEMA_VERSION } from '../../shared/schema-version';
import { createGistSyncProvider } from './gist-sync-provider';
import { createWebdavSyncProvider } from './webdav-sync-provider';

type SyncConnectionResult = {
  /** provider 名称。 */
  provider: 'gist' | 'webdav';
  /** 连接结果。 */
  ok: true;
  /** 展示给用户的结果文案。 */
  message: string;
};

type SyncNowResult = {
  /** provider 名称。 */
  provider: 'gist' | 'webdav';
  /** 最近同步时间。 */
  lastSyncAt: number;
  /** 快照大小。 */
  snapshotBytes: number;
};

type SyncTestProvider = {
  /** 测试连接。 */
  testConnection(sync: ExtensionConfig['sync']): Promise<SyncConnectionResult>;
  /** 执行同步。 */
  syncNow(config: ExtensionConfig): Promise<SyncNowResult>;
};

type SyncSnapshot = {
  /** 快照版本。 */
  schemaVersion: string;
  /** 导出时间。 */
  exportedAt: number;
  /** 当前最小闭环先同步配置。 */
  config: ExtensionConfig;
};

type SyncRepository = {
  /** 构建完整同步快照。 */
  buildSnapshot(config: ExtensionConfig): Promise<SyncSnapshot & { snapshotVersion: number }>;
  /** 在同步成功后回写本地状态。 */
  markSyncCompleted(input: { snapshotVersion: number; lastSyncAt: number }): Promise<void>;
};

const ensureSyncEnabled = (sync: ExtensionConfig['sync']) => {
  if (!sync.enabled || sync.provider === 'none') {
    throw new Error('请先启用同步并选择提供方');
  }
};

/** 创建同步服务。 */
export const createSyncService = ({
  fetchImpl = fetch,
  now = () => Date.now(),
  testProvider,
  getTestProvider,
  syncRepository,
}: {
  fetchImpl?: typeof fetch;
  now?: () => number;
  testProvider?: SyncTestProvider | null;
  /** 按调用时机解析测试 provider，避免 service worker 启动后注入失效。 */
  getTestProvider?: () => SyncTestProvider | null;
  /** 同步快照仓储。 */
  syncRepository?: SyncRepository;
} = {}) => {
  const gistProvider = createGistSyncProvider(fetchImpl);
  const webdavProvider = createWebdavSyncProvider(fetchImpl);

  const buildSnapshot = async (config: ExtensionConfig): Promise<SyncSnapshot & { snapshotVersion: number }> =>
    syncRepository
      ? syncRepository.buildSnapshot(config)
      : {
          schemaVersion: CONFIG_SCHEMA_VERSION,
          snapshotVersion: 1,
          exportedAt: now(),
          config,
        };

  /** 统一解析当前可用的测试 provider。 */
  const resolveTestProvider = () => getTestProvider?.() ?? testProvider ?? null;

  return {
    /** 测试当前同步配置。 */
    async testConnection(sync: ExtensionConfig['sync']) {
      ensureSyncEnabled(sync);

      const activeTestProvider = resolveTestProvider();
      if (activeTestProvider) {
        return activeTestProvider.testConnection(sync);
      }

      if (sync.provider === 'gist') {
        return gistProvider.testConnection(sync);
      }

      return webdavProvider.testConnection(sync);
    },

    /** 推送当前配置到远端 provider。 */
    async syncNow(config: ExtensionConfig) {
      ensureSyncEnabled(config.sync);

      const activeTestProvider = resolveTestProvider();
      if (activeTestProvider) {
        return activeTestProvider.syncNow(config);
      }

      const snapshot = await buildSnapshot(config);
      const baseResult =
        config.sync.provider === 'gist'
          ? await gistProvider.syncNow(config.sync, snapshot)
          : await webdavProvider.syncNow(config.sync, snapshot);

      const lastSyncAt = now();
      if (syncRepository) {
        await syncRepository.markSyncCompleted({
          snapshotVersion: snapshot.snapshotVersion,
          lastSyncAt,
        });
      }

      return {
        ...baseResult,
        lastSyncAt,
      };
    },
  };
};
