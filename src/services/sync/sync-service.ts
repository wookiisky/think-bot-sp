import type { ExtensionConfig } from '../../domain/config/config-schema';
import {
  hasUsableExtractionCache,
  pageRecordSchema,
  rebuildPageContentFromExtractionCache,
} from '../../domain/page/page-schema';
import type { ExtractionCaches, PageRecord } from '../../domain/page/page-schema';
import { SYNC_SNAPSHOT_SCHEMA_VERSION } from '../../shared/schema-version';
import type { SyncSnapshot, SyncTombstone } from '../../domain/sync/sync-snapshot-schema';
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

type SyncRepository = {
  /** 构建完整同步快照。 */
  buildSnapshot(config?: ExtensionConfig): Promise<SyncSnapshot>;
  /** 把合并后的快照回写到本地。 */
  applyMergedSnapshot(snapshot: SyncSnapshot): Promise<void>;
  /** 在同步成功后回写本地状态。 */
  markSyncCompleted(input: { snapshotVersion: number; lastSyncAt: number }): Promise<void>;
};

const ensureSyncEnabled = (sync: ExtensionConfig['sync']) => {
  if (!sync.enabled || sync.provider === 'none') {
    throw new Error('请先启用同步并选择提供方');
  }
};

/** 取最近一次同步时间，忽略空值。 */
const resolveLatestTimestamp = (...values: Array<number | null | undefined>) =>
  values.reduce<number | null>((latest, value) => (value == null ? latest : Math.max(latest ?? 0, value)), null);

/** 按 `updatedAt` 合并对象集合；并列时优先保留本地对象。 */
const mergeRecordsByUpdatedAt = <T extends { updatedAt: number }>(
  localRecords: T[],
  remoteRecords: T[],
  getKey: (record: T) => string,
) => {
  const merged = new Map<string, T>();

  for (const record of remoteRecords) {
    merged.set(getKey(record), record);
  }

  for (const record of localRecords) {
    const key = getKey(record);
    const current = merged.get(key);
    if (!current || record.updatedAt >= current.updatedAt) {
      merged.set(key, record);
    }
  }

  return Array.from(merged.values());
};

/** 合并页面级墓碑；相同 URL 只保留更晚删除时间。 */
const mergeTombstones = (localTombstones: SyncTombstone[], remoteTombstones: SyncTombstone[]) => {
  const tombstones = new Map<string, SyncTombstone>();

  for (const tombstone of [...remoteTombstones, ...localTombstones]) {
    const current = tombstones.get(tombstone.normalizedUrl);
    if (!current || tombstone.deletedAt > current.deletedAt) {
      tombstones.set(tombstone.normalizedUrl, tombstone);
    }
  }

  return Array.from(tombstones.values()).sort((left, right) => left.normalizedUrl.localeCompare(right.normalizedUrl));
};

const extractionMethods = ['readability', 'jina'] as const;

const pickNewerExtractionCache = (
  localCache: ExtractionCaches[(typeof extractionMethods)[number]] | undefined,
  remoteCache: ExtractionCaches[(typeof extractionMethods)[number]] | undefined,
) => {
  if (!hasUsableExtractionCache(localCache)) {
    return hasUsableExtractionCache(remoteCache) ? remoteCache : undefined;
  }
  if (!hasUsableExtractionCache(remoteCache)) {
    return localCache;
  }
  return localCache.updatedAt >= remoteCache.updatedAt ? localCache : remoteCache;
};

const mergeExtractionCaches = (localPage: PageRecord | null, remotePage: PageRecord | null): ExtractionCaches => {
  const nextCaches: ExtractionCaches = {};

  for (const method of extractionMethods) {
    const cache = pickNewerExtractionCache(localPage?.extractionCaches[method], remotePage?.extractionCaches[method]);
    if (cache) {
      nextCaches[method] = cache;
    }
  }

  return nextCaches;
};

/** 合并页面主记录后，按方法时间合并缓存并重建当前正文镜像。 */
const mergePageRecords = (localPages: PageRecord[], remotePages: PageRecord[]) => {
  const keys = new Set([...localPages.map((page) => page.normalizedUrl), ...remotePages.map((page) => page.normalizedUrl)]);

  return Array.from(keys).map((normalizedUrl) => {
    const localPage = localPages.find((page) => page.normalizedUrl === normalizedUrl) ?? null;
    const remotePage = remotePages.find((page) => page.normalizedUrl === normalizedUrl) ?? null;
    const basePage = localPage && remotePage ? (localPage.updatedAt >= remotePage.updatedAt ? localPage : remotePage) : (localPage ?? remotePage);
    if (!basePage) {
      throw new Error(`page not found during sync merge: ${normalizedUrl}`);
    }

    return pageRecordSchema.parse(
      rebuildPageContentFromExtractionCache({
        ...basePage,
        extractionCaches: mergeExtractionCaches(localPage, remotePage),
      }),
    );
  });
};

/** 先按对象时间合并，再统一应用墓碑删除语义。 */
const mergeSyncSnapshots = ({
  localSnapshot,
  remoteSnapshot,
  now,
}: {
  /** 当前本地导出的完整快照。 */
  localSnapshot: SyncSnapshot;
  /** 远端已存在的完整快照。 */
  remoteSnapshot: SyncSnapshot | null;
  /** 当前时间。 */
  now: () => number;
}): SyncSnapshot => {
  if (!remoteSnapshot) {
    return {
      ...localSnapshot,
      exportedAt: now(),
      lastSyncAt: resolveLatestTimestamp(localSnapshot.lastSyncAt, localSnapshot.config.sync.lastSyncAt),
    };
  }

  const mergedTombstones = mergeTombstones(localSnapshot.tombstones, remoteSnapshot.tombstones);
  const tombstoneMap = new Map(mergedTombstones.map((item) => [item.normalizedUrl, item.deletedAt]));
  const mergedPages = mergePageRecords(localSnapshot.pages, remoteSnapshot.pages)
    .filter((page) => {
      const deletedAt = tombstoneMap.get(page.normalizedUrl);
      return deletedAt == null || page.updatedAt > deletedAt;
    })
    .sort((left, right) => left.normalizedUrl.localeCompare(right.normalizedUrl));
  const visiblePageSet = new Set(mergedPages.map((page) => page.normalizedUrl));
  const mergedConversations = mergeRecordsByUpdatedAt(
    localSnapshot.conversations,
    remoteSnapshot.conversations,
    (conversation) => conversation.id,
  )
    .filter((conversation) => visiblePageSet.has(conversation.normalizedUrl))
    .sort((left, right) => left.id.localeCompare(right.id));
  const mergedLastSyncAt = resolveLatestTimestamp(
    localSnapshot.lastSyncAt,
    remoteSnapshot.lastSyncAt,
    localSnapshot.config.sync.lastSyncAt,
    remoteSnapshot.config.sync.lastSyncAt,
  );
  const configWinner =
    localSnapshot.config.updatedAt >= remoteSnapshot.config.updatedAt ? localSnapshot.config : remoteSnapshot.config;

  return {
    schemaVersion: SYNC_SNAPSHOT_SCHEMA_VERSION,
    snapshotVersion: Math.max(localSnapshot.snapshotVersion, remoteSnapshot.snapshotVersion),
    exportedAt: now(),
    config: {
      ...configWinner,
      sync: {
        ...configWinner.sync,
        lastSyncAt: mergedLastSyncAt,
      },
    },
    pages: mergedPages,
    conversations: mergedConversations,
    tombstones: mergedTombstones,
    lastSyncAt: mergedLastSyncAt,
  };
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

  const buildSnapshot = async (config?: ExtensionConfig): Promise<SyncSnapshot> =>
    syncRepository
      ? syncRepository.buildSnapshot(config)
      : (() => {
          if (!config) {
            throw new Error('缺少本地同步配置快照');
          }

          return {
            schemaVersion: SYNC_SNAPSHOT_SCHEMA_VERSION,
            snapshotVersion: 1,
            exportedAt: now(),
            config,
            pages: [],
            conversations: [],
            tombstones: [],
            lastSyncAt: config.sync.lastSyncAt,
          };
        })();

  /** 统一解析当前可用的测试 provider。 */
  const resolveTestProvider = () => getTestProvider?.() ?? testProvider ?? null;
  /** 解析当前真实 provider。 */
  const resolveProvider = (sync: ExtensionConfig['sync']) => (sync.provider === 'gist' ? gistProvider : webdavProvider);

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

      const provider = resolveProvider(config.sync);
      const localSnapshot = await buildSnapshot(config);
      const remoteSnapshot = await provider.readSnapshot(config.sync);
      const mergedSnapshot = mergeSyncSnapshots({
        localSnapshot,
        remoteSnapshot,
        now,
      });

      if (syncRepository) {
        await syncRepository.applyMergedSnapshot(mergedSnapshot);
      }

      const nextSnapshot = await buildSnapshot(syncRepository ? undefined : mergedSnapshot.config);
      const lastSyncAt = now();
      const finalSnapshot = {
        ...nextSnapshot,
        lastSyncAt,
        config: {
          ...nextSnapshot.config,
          sync: {
            ...nextSnapshot.config.sync,
            lastSyncAt,
          },
        },
      };
      const baseResult = await provider.syncNow(config.sync, finalSnapshot);

      if (syncRepository) {
        await syncRepository.markSyncCompleted({
          snapshotVersion: finalSnapshot.snapshotVersion,
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
