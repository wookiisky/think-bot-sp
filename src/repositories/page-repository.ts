import { buildPageRecord, pageRecordSchema, updatePromptTabState } from '../domain/page/page-schema';
import { CONVERSATION_STORAGE_PREFIX, LOADING_STORAGE_PREFIX, PAGE_STORAGE_PREFIX } from '../shared/storage-keys';

type ChromeLocalAdapter = ReturnType<typeof import('./chrome-local-adapter').createChromeLocalAdapter>;
const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;

const getPageKey = (normalizedUrl: string) => `${PAGE_STORAGE_PREFIX}${normalizedUrl}`;

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
  /** 按更新时间倒序返回页面列表。 */
  const sortRecentPages = <T extends { updatedAt: number }>(pages: T[]) => [...pages].sort((left, right) => right.updatedAt - left.updatedAt);

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

    /** 保存提取结果，同时保留页面级运行状态。 */
    async saveExtractionResult(input: {
      /** 归一化后的页面 URL。 */
      normalizedUrl: string;
      /** 页面原始 URL。 */
      url: string;
      /** 页面标题。 */
      title: string;
      /** 页面 favicon。 */
      faviconUrl: string;
      /** 提取出的正文。 */
      content: string;
      /** 实际使用的提取方法。 */
      extractionMethod: 'readability' | 'jina';
    }) {
      const result = await storage.get<Record<string, unknown>>([getPageKey(input.normalizedUrl)]);
      const currentValue = result[getPageKey(input.normalizedUrl)];
      const currentPage = currentValue ? pageRecordSchema.parse(currentValue) : null;
      const now = Date.now();
      const nextPage = pageRecordSchema.parse({
        ...(currentPage ?? buildPageRecord({ url: input.url, now })),
        title: input.title,
        faviconUrl: input.faviconUrl,
        content: input.content,
        extractionMethod: input.extractionMethod,
        updatedAt: now,
        expiresAt: now + NINETY_DAYS,
      });

      await storage.set({ [getPageKey(nextPage.normalizedUrl)]: nextPage });
      return nextPage;
    },

    /** 更新页面级 includePageContent 开关，同时保留正文与页面状态。 */
    async setIncludePageContent(input: {
      /** 归一化后的页面 URL。 */
      normalizedUrl: string;
      /** 页面原始 URL。 */
      url: string;
      /** 当前页面级正文开关。 */
      includePageContent: boolean;
    }) {
      const result = await storage.get<Record<string, unknown>>([getPageKey(input.normalizedUrl)]);
      const currentValue = result[getPageKey(input.normalizedUrl)];
      const currentPage = currentValue ? pageRecordSchema.parse(currentValue) : null;
      const now = Date.now();
      const nextPage = pageRecordSchema.parse({
        ...(currentPage ?? buildPageRecord({ url: input.url, now })),
        includePageContent: input.includePageContent,
        updatedAt: now,
        expiresAt: now + NINETY_DAYS,
      });

      await storage.set({ [getPageKey(nextPage.normalizedUrl)]: nextPage });
      return nextPage;
    },

    /** 更新单个 promptTab 的页面级运行态，同时保留正文与页面级开关。 */
    async setPromptTabState(input: {
      /** 归一化后的页面 URL。 */
      normalizedUrl: string;
      /** 页面原始 URL。 */
      url: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 初始化时间。 */
      initializedAt?: number | null;
      /** 最近一次自动触发时间。 */
      lastAutoTriggerAt?: number | null;
      /** 自动触发状态。 */
      autoTriggerStatus?: 'idle' | 'queued' | 'running' | 'done' | 'error';
      /** 最近一次清空时间。 */
      lastClearedAt?: number | null;
    }) {
      const result = await storage.get<Record<string, unknown>>([getPageKey(input.normalizedUrl)]);
      const currentValue = result[getPageKey(input.normalizedUrl)];
      const currentPage = currentValue ? pageRecordSchema.parse(currentValue) : buildPageRecord({ url: input.url, now: Date.now() });
      const now = Date.now();
      const nextPage = updatePromptTabState(
        currentPage,
        {
          promptTabId: input.promptTabId,
          initializedAt: input.initializedAt,
          lastAutoTriggerAt: input.lastAutoTriggerAt,
          autoTriggerStatus: input.autoTriggerStatus,
          lastClearedAt: input.lastClearedAt,
        },
        now,
      );

      await storage.set({ [getPageKey(nextPage.normalizedUrl)]: nextPage });
      return nextPage;
    },

    /** 列出全部页面记录。 */
    async getAllPages() {
      return getAllPages();
    },

    /** 按最近更新时间返回页面列表。 */
    async listRecentPages() {
      return sortRecentPages(await getAllPages());
    },

    /** 按标题和 URL 搜索页面。 */
    async searchPages(query: string) {
      const normalizedQuery = query.trim().toLowerCase();
      const pages = await getAllPages();
      if (!normalizedQuery) {
        return sortRecentPages(pages);
      }

      return sortRecentPages(
        pages.filter((page) => page.title.toLowerCase().includes(normalizedQuery) || page.url.toLowerCase().includes(normalizedQuery)),
      );
    },

    /** 仅更新页面标题。 */
    async updatePageTitle(input: {
      /** 归一化后的页面 URL。 */
      normalizedUrl: string;
      /** 新标题。 */
      title: string;
    }) {
      const result = await storage.get<Record<string, unknown>>([getPageKey(input.normalizedUrl)]);
      const currentValue = result[getPageKey(input.normalizedUrl)];
      const current = currentValue ? pageRecordSchema.parse(currentValue) : null;
      if (!current) {
        throw new Error(`page not found: ${input.normalizedUrl}`);
      }
      const now = Date.now();

      const next = pageRecordSchema.parse({
        ...current,
        title: input.title,
        updatedAt: now,
        expiresAt: now + NINETY_DAYS,
      });
      await storage.set({ [getPageKey(input.normalizedUrl)]: next });
      return next;
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
      const pageCount = entries.filter(([key]) => key.startsWith(PAGE_STORAGE_PREFIX)).length;
      return {
        pageCount,
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
