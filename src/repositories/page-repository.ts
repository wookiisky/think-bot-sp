import { pageRecordSchema } from '../domain/page/page-schema';
import { CONVERSATION_STORAGE_PREFIX, LOADING_STORAGE_PREFIX, PAGE_STORAGE_PREFIX } from '../shared/storage-keys';

type ChromeLocalAdapter = ReturnType<typeof import('./chrome-local-adapter').createChromeLocalAdapter>;

const getPageKey = (normalizedUrl: string) => `${PAGE_STORAGE_PREFIX}${normalizedUrl}`;
const getConversationPrefix = (normalizedUrl: string) => `${CONVERSATION_STORAGE_PREFIX}${normalizedUrl}:`;
const getLoadingPrefix = (normalizedUrl: string) => `${LOADING_STORAGE_PREFIX}${normalizedUrl}:`;

const matchesExactConversationKey = (key: string, normalizedUrl: string): boolean => {
  if (!key.startsWith(CONVERSATION_STORAGE_PREFIX)) {
    return false;
  }

  const suffix = key.slice(CONVERSATION_STORAGE_PREFIX.length);
  const separatorIndex = suffix.lastIndexOf(':');
  if (separatorIndex <= 0) {
    return false;
  }

  return suffix.slice(0, separatorIndex) === normalizedUrl;
};

const matchesExactLoadingKey = (key: string, normalizedUrl: string): boolean => {
  if (!key.startsWith(LOADING_STORAGE_PREFIX)) {
    return false;
  }

  const suffix = key.slice(LOADING_STORAGE_PREFIX.length);
  const separatorIndex = suffix.lastIndexOf(':');
  if (separatorIndex <= 0) {
    return false;
  }

  return suffix.slice(0, separatorIndex) === normalizedUrl;
};

/** 页面仓储，负责页面缓存、统计和级联清理。 */
export const createPageRepository = (storage: ChromeLocalAdapter) => {
  const readAll = async () => storage.get<Record<string, unknown>>(null);
  const getAllPages = async () => {
    const all = await readAll();
    return Object.entries(all)
      .filter(([key]) => key.startsWith(PAGE_STORAGE_PREFIX))
      .map(([, value]) => pageRecordSchema.parse(value));
  };

  return {
    /** 保存页面记录。 */
    async savePage(page: unknown) {
      const next = pageRecordSchema.parse(page);
      await storage.set({ [getPageKey(next.normalizedUrl)]: next });
      return next;
    },

    /** 读取单个页面记录。 */
    async getPage(normalizedUrl: string) {
      const result = await storage.get<Record<string, unknown>>([getPageKey(normalizedUrl)]);
      const value = result[getPageKey(normalizedUrl)];
      return value ? pageRecordSchema.parse(value) : null;
    },

    /** 列出全部页面记录。 */
    async getAllPages() {
      return getAllPages();
    },

    /** 清理过期页面。 */
    async cleanupExpiredPages(now: number) {
      const allPages = await getAllPages();
      const expired = allPages.filter((page) => page.expiresAt <= now);
      if (expired.length > 0) {
        await storage.remove(expired.map((page) => getPageKey(page.normalizedUrl)));
      }
      return expired.map((page) => page.normalizedUrl);
    },

    /** 统计可回收缓存。 */
    async getCacheStats() {
      const all = await readAll();
      const entries = Object.entries(all).filter(([key]) =>
        key.startsWith(PAGE_STORAGE_PREFIX) ||
        key.startsWith(CONVERSATION_STORAGE_PREFIX) ||
        key.startsWith(LOADING_STORAGE_PREFIX),
      );
      return {
        entryCount: entries.length,
        bytes: new TextEncoder().encode(JSON.stringify(Object.fromEntries(entries))).byteLength,
      };
    },

    /** 安全清理可回收缓存。 */
    async clearCache() {
      const all = await readAll();
      const keys = Object.keys(all).filter((key) =>
        key.startsWith(PAGE_STORAGE_PREFIX) ||
        key.startsWith(CONVERSATION_STORAGE_PREFIX) ||
        key.startsWith(LOADING_STORAGE_PREFIX),
      );
      if (keys.length > 0) {
        await storage.remove(keys);
      }
      return { removedKeys: keys.length };
    },

    /** 级联删除单个页面相关数据。 */
    async deletePage(normalizedUrl: string) {
      const all = await readAll();
      const keys = Object.keys(all).filter(
        (key) =>
          key === getPageKey(normalizedUrl) ||
          matchesExactConversationKey(key, normalizedUrl) ||
          matchesExactLoadingKey(key, normalizedUrl),
      );
      if (keys.length > 0) {
        await storage.remove(keys);
      }
    },
  };
};
