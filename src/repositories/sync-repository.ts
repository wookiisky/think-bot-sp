import { applySystemConfigSeeds, extensionConfigSchema } from '../domain/config/config-schema';
import type { ExtensionConfig } from '../domain/config/config-schema';
import { createDefaultSyncState, syncSnapshotSchema, syncStateSchema } from '../domain/sync/sync-snapshot-schema';
import type { SyncSnapshot, SyncState } from '../domain/sync/sync-snapshot-schema';
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
  configRepository,
  pageRepository,
  conversationRepository,
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
}) => {
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

  return {
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
    async buildSnapshot(config?: ExtensionConfig) {
      const [resolvedConfig, syncState, pages, conversations] = await Promise.all([
        config ? Promise.resolve(config) : configRepository.getConfig(),
        readSyncState(),
        pageRepository.getAllPages(),
        conversationRepository.getAllConversations(),
      ]);
      const tombstoneMap = new Map(syncState.tombstones.map((item) => [item.normalizedUrl, item.deletedAt]));
      const visiblePages = pages.filter((page) => {
        const deletedAt = tombstoneMap.get(page.normalizedUrl) ?? null;
        return deletedAt === null || page.updatedAt > deletedAt;
      });
      const visiblePageUrlSet = new Set(visiblePages.map((page) => page.normalizedUrl));
      const visibleConversations = conversations.filter((conversation) => visiblePageUrlSet.has(conversation.normalizedUrl));

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
    async applyMergedSnapshot(snapshot: SyncSnapshot) {
      const nextSnapshot = syncSnapshotSchema.parse(snapshot);
      const currentState = await readSyncState();
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

      const all = await readAll();
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

      if (removableKeys.length > 0) {
        await storage.remove(removableKeys);
      }

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
        lastSyncAt: input.lastSyncAt,
      });
    },
  };
};
