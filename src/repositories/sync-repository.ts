import { createStorageRepository } from './chrome-local-adapter';
import { applySystemConfigSeeds, createDefaultConfig, extensionConfigSchema } from '../domain/config/config-schema';
import type { ExtensionConfig } from '../domain/config/config-schema';
import { createDefaultSyncState, syncSnapshotSchema, syncStateSchema } from '../domain/sync/sync-snapshot-schema';
import { isSyncConversationVisible } from '../domain/sync/sync-record-state';
import type { SyncSnapshot, SyncState } from '../domain/sync/sync-snapshot-schema';
import { hasActiveLoading, loadingStateRecordSchema } from '../domain/loading/loading-state-schema';
import { pageRecordSchema } from '../domain/page/page-schema';
import { conversationRecordSchema } from '../domain/conversation/conversation-schema';
import { assertBlacklistRulesPersistable } from '../services/blacklist/blacklist-service';
import {
  CONFIG_STORAGE_KEY,
  CONVERSATION_STORAGE_PREFIX,
  LOADING_STORAGE_PREFIX,
  PAGE_STORAGE_PREFIX,
  SYNC_STATE_STORAGE_KEY,
  buildConversationStorageKey,
  buildLoadingStorageKey,
  buildPageStorageKey,
} from '../shared/storage-keys';

type ChromeLocalAdapter = ReturnType<typeof import('./chrome-local-adapter').createChromeLocalAdapter>;

type ConfigRepository = {
  /** 读取当前配置。 */
  getConfig(): Promise<ExtensionConfig>;
};

type PageRepository = {
  /** 读取全部页面。 */
  getAllPages(): Promise<
    Array<{
      normalizedUrl: string;
      updatedAt: number;
    }>
  >;
};

type ConversationRepository = {
  /** 读取全部会话。 */
  getAllConversations(): Promise<
    Array<{
      normalizedUrl: string;
    }>
  >;
};

/** 同步仓储，负责快照导出和 tombstone 维护。 */
export const createSyncRepository = ({
  storage,
  now = () => Date.now(),
}: {
  /** 本地存储适配器。 */
  storage: ChromeLocalAdapter;
  /** 配置仓储。 */
  configRepository: ConfigRepository;
  /** 页面仓储。 */
  pageRepository: PageRepository;
  /** 会话仓储。 */
  conversationRepository: ConversationRepository;
  /** 当前时间。 */
  now?: () => number;
}) => createStorageRepository(storage, (storage) => {
  /** 读取完整存储，用于同步替换时计算增删集合。 */
  const readAll = async () => storage.get<Record<string, unknown>>(null);
  /** 读取当前同步状态。 */
  const readSyncState = async () => {
    const result = await storage.get<Record<string, unknown>>([SYNC_STATE_STORAGE_KEY]);
    const saved = result[SYNC_STATE_STORAGE_KEY];
    return saved ? syncStateSchema.parse(saved) : createDefaultSyncState();
  };

  /** 写入同步状态。 */
  const writeSyncState = async (state: SyncState) => {
    const next = syncStateSchema.parse(state);
    await storage.set({ [SYNC_STATE_STORAGE_KEY]: next });
    return next;
  };

  const repository = {
    /** 记录网络请求开始前的本地版本。 */
    async getRevision() {
      return storage.getRevision();
    },

    /** 在同一个事务内合并最新本地数据，保护请求期间的写入和活动会话。 */
    async mergeSnapshot(merge: (local: SyncSnapshot) => SyncSnapshot, sinceRevision: number): Promise<SyncSnapshot> {
      const all = await readAll();
      const local = await repository.buildSnapshot(undefined, all);
      const changedKeys = storage.getChangedKeysSince(sinceRevision);
      const merged = merge(local);
      const preserveAll = changedKeys.has('*');
      const protectedPageUrls = new Set<string>();
      const protectedConversationKeys = new Set<string>();
      for (const key of changedKeys) {
        if (key.startsWith(PAGE_STORAGE_PREFIX)) protectedPageUrls.add(key.slice(PAGE_STORAGE_PREFIX.length));
        if (key.startsWith(CONVERSATION_STORAGE_PREFIX)) protectedConversationKeys.add(key);
      }
      for (const [key, value] of Object.entries(all)) {
        if (key.startsWith(LOADING_STORAGE_PREFIX)) {
          const loading = loadingStateRecordSchema.parse(value);
          if (hasActiveLoading(loading)) {
            protectedConversationKeys.add(CONVERSATION_STORAGE_PREFIX + key.slice(LOADING_STORAGE_PREFIX.length));
            protectedPageUrls.add(loading.normalizedUrl);
          }
        }
      }
      const localPages = new Map(local.pages.map((page) => [page.normalizedUrl, page]));
      const localConversations = new Map(local.conversations.map((conversation) => [
        buildConversationStorageKey(conversation.normalizedUrl, conversation.promptTabId), conversation,
      ]));
      const nextPages = new Map(merged.pages.map((page) => [page.normalizedUrl, page]));
      const nextConversations = new Map(merged.conversations.map((conversation) => [
        buildConversationStorageKey(conversation.normalizedUrl, conversation.promptTabId), conversation,
      ]));
      for (const url of protectedPageUrls) {
        const current = localPages.get(url);
        if (current) nextPages.set(url, current);
        else nextPages.delete(url);
      }
      for (const key of protectedConversationKeys) {
        const current = localConversations.get(key);
        if (current) {
          nextConversations.set(key, current);
          const page = localPages.get(current.normalizedUrl);
          if (page) {
            nextPages.set(page.normalizedUrl, page);
            protectedPageUrls.add(page.normalizedUrl);
          }
        } else nextConversations.delete(key);
      }
      // 本地写入和活动请求优先；对应页面不能同时保留远端删除标记。
      const nextTombstones = new Map(merged.tombstones.map((item) => [item.normalizedUrl, item]));
      const localTombstones = new Map(local.tombstones.map((item) => [item.normalizedUrl, item]));
      for (const url of protectedPageUrls) {
        if (!localPages.has(url)) continue;
        const tombstone = localTombstones.get(url);
        if (tombstone) nextTombstones.set(url, tombstone);
        else nextTombstones.delete(url);
      }
      const snapshot = syncSnapshotSchema.parse({
        ...merged,
        tombstones: preserveAll ? local.tombstones : [...nextTombstones.values()],
        config: preserveAll || changedKeys.has(CONFIG_STORAGE_KEY) ? local.config : merged.config,
        pages: preserveAll ? local.pages : [...nextPages.values()],
        conversations: preserveAll ? local.conversations : [...nextConversations.values()]
          .filter((conversation) => isSyncConversationVisible(conversation, nextPages.get(conversation.normalizedUrl))),
      });
      await repository.applyMergedSnapshot(snapshot, all);
      return { ...snapshot, config: applySystemConfigSeeds(snapshot.config), snapshotVersion: snapshot.snapshotVersion + 1 };
    },

    /** 读取当前同步状态。 */
    async getSyncState() {
      return readSyncState();
    },

    /** 读取全部墓碑。 */
    async getTombstones() {
      return (await readSyncState()).tombstones;
    },

    /** 追加或刷新页面级墓碑。 */
    async appendPageTombstone(input: {
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** 删除时间。 */
      deletedAt: number;
    }) {
      const current = await readSyncState();
      const matched = current.tombstones.find((item) => item.normalizedUrl === input.normalizedUrl) ?? null;
      const nextDeletedAt = Math.max(matched?.deletedAt ?? 0, input.deletedAt);
      const nextTombstones = matched
        ? current.tombstones.map((item) =>
            item.normalizedUrl === input.normalizedUrl
              ? {
                  normalizedUrl: input.normalizedUrl,
                  deletedAt: nextDeletedAt,
                }
              : item,
          )
        : [
            ...current.tombstones,
            {
              normalizedUrl: input.normalizedUrl,
              deletedAt: nextDeletedAt,
            },
          ];

      await writeSyncState({
        ...current,
        tombstones: nextTombstones.sort((left, right) => left.normalizedUrl.localeCompare(right.normalizedUrl)),
      });
    },

    /** 构建当前完整快照。 */
    async buildSnapshot(config?: ExtensionConfig, values?: Record<string, unknown>) {
      const all = values ?? await readAll();
      const resolvedConfig = config ?? (all[CONFIG_STORAGE_KEY]
        ? applySystemConfigSeeds(extensionConfigSchema.parse(all[CONFIG_STORAGE_KEY]))
        : createDefaultConfig());
      const syncState = all[SYNC_STATE_STORAGE_KEY]
        ? syncStateSchema.parse(all[SYNC_STATE_STORAGE_KEY]) : createDefaultSyncState();
      const pages = Object.entries(all).filter(([key]) => key.startsWith(PAGE_STORAGE_PREFIX))
        .map(([, value]) => pageRecordSchema.parse(value));
      const conversations = Object.entries(all).filter(([key]) => key.startsWith(CONVERSATION_STORAGE_PREFIX))
        .map(([, value]) => conversationRecordSchema.parse(value));
      const tombstoneMap = new Map(syncState.tombstones.map((item) => [item.normalizedUrl, item.deletedAt]));
      const visiblePages = pages.filter((page) => {
        const deletedAt = tombstoneMap.get(page.normalizedUrl) ?? null;
        return deletedAt === null || page.updatedAt > deletedAt;
      });
      const visiblePagesByUrl = new Map(visiblePages.map((page) => [page.normalizedUrl, page]));
      const visibleConversations = conversations.filter((conversation) => isSyncConversationVisible(conversation, visiblePagesByUrl.get(conversation.normalizedUrl)));

      return syncSnapshotSchema.parse({
        schemaVersion: syncState.schemaVersion,
        snapshotVersion: syncState.snapshotVersion + 1,
        exportedAt: now(),
        config: resolvedConfig,
        pages: visiblePages,
        conversations: visibleConversations,
        tombstones: syncState.tombstones,
        lastSyncAt: syncState.lastSyncAt,
      });
    },

    /** 把合并后的完整快照回写到本地稳定存储。 */
    async applyMergedSnapshot(snapshot: SyncSnapshot, values?: Record<string, unknown>) {
      const nextSnapshot = syncSnapshotSchema.parse(snapshot);
      const all = values ?? await readAll();
      const currentState = all[SYNC_STATE_STORAGE_KEY]
        ? syncStateSchema.parse(all[SYNC_STATE_STORAGE_KEY]) : createDefaultSyncState();
      const nextLastSyncAt = [currentState.lastSyncAt, nextSnapshot.lastSyncAt].reduce<number | null>(
        (latest, value) => (value === null ? latest : Math.max(latest ?? 0, value)),
        null,
      );
      const nextConfig = applySystemConfigSeeds(
        extensionConfigSchema.parse({
          ...nextSnapshot.config,
          sync: {
            ...nextSnapshot.config.sync,
            lastSyncAt: nextLastSyncAt,
          },
        }),
      );
      assertBlacklistRulesPersistable(nextConfig.blacklist);

      const nextPageEntries = Object.fromEntries(
        nextSnapshot.pages.map((page) => [buildPageStorageKey(page.normalizedUrl), page] as const),
      );
      const nextConversationEntries = Object.fromEntries(
        nextSnapshot.conversations.map((conversation) => [
          buildConversationStorageKey(conversation.normalizedUrl, conversation.promptTabId),
          conversation,
        ] as const),
      );
      const nextLoadingKeys = new Set(
        nextSnapshot.conversations.map((conversation) => buildLoadingStorageKey(conversation.normalizedUrl, conversation.promptTabId)),
      );
      // 首个流片段落库前也可能已有 loading；只要页面仍存在就保留活动请求。
      for (const [key, value] of Object.entries(all)) {
        if (!key.startsWith(LOADING_STORAGE_PREFIX)) continue;
        const loading = loadingStateRecordSchema.parse(value);
        if (hasActiveLoading(loading) && buildPageStorageKey(loading.normalizedUrl) in nextPageEntries) {
          nextLoadingKeys.add(key);
        }
      }
      const removableKeys = Object.keys(all).filter((key) => {
        if (key.startsWith(PAGE_STORAGE_PREFIX)) {
          return !(key in nextPageEntries);
        }
        if (key.startsWith(CONVERSATION_STORAGE_PREFIX)) {
          return !(key in nextConversationEntries);
        }
        if (key.startsWith(LOADING_STORAGE_PREFIX)) {
          return !nextLoadingKeys.has(key);
        }
        return false;
      });

      // 队列只保证串行，不提供回滚：先保存新值和删除标记，避免写入失败丢失旧数据。
      await storage.set({
        [CONFIG_STORAGE_KEY]: nextConfig,
        ...nextPageEntries,
        ...nextConversationEntries,
        [SYNC_STATE_STORAGE_KEY]: syncStateSchema.parse({
          ...currentState,
          snapshotVersion: Math.max(currentState.snapshotVersion, nextSnapshot.snapshotVersion),
          tombstones: nextSnapshot.tombstones,
          lastSyncAt: nextLastSyncAt,
        }),
      });
      // 清理失败继续向上报错；删除标记阻止残留记录再次导出，后续同步会重试清理。
      if (removableKeys.length > 0) {
        await storage.remove(removableKeys);
      }
    },

    /** 在同步成功后刷新本地同步状态。 */
    async markSyncCompleted(input: {
      /** 已成功推送的快照版本。 */
      snapshotVersion: number;
      /** 最近同步时间。 */
      lastSyncAt: number;
    }) {
      const current = await readSyncState();
      await writeSyncState({
        ...current,
        snapshotVersion: Math.max(current.snapshotVersion, input.snapshotVersion),
        lastSyncAt: Math.max(current.lastSyncAt ?? 0, input.lastSyncAt),
      });
    },
  };
  return repository;
});
