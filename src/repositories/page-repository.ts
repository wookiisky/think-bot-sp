import { createStorageRepository, type ChromeLocalAdapter } from './chrome-local-adapter';
import { createRecordCache } from './record-cache';
import {
  buildPageRecord,
  hasUsableExtractionCache,
  pageRecordSchema,
  updatePromptTabState,
} from '../domain/page/page-schema';
import type { ExtractionMethod } from '../domain/page/page-schema';
import { CONVERSATION_STORAGE_PREFIX, LOADING_STORAGE_PREFIX, PAGE_STORAGE_PREFIX } from '../shared/storage-keys';

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
export const createPageRepository = (storage: ChromeLocalAdapter) => createStorageRepository(storage, (storage) => {
  const pages = createRecordCache(storage, (value) => pageRecordSchema.parse(value));
  const getAllPages = async () => {
    const all = await storage.getByPrefix(PAGE_STORAGE_PREFIX);
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
      return pages.read(getPageKey(normalizedUrl));
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
      extractionMethod: ExtractionMethod;
    }) {
      if (!input.content.trim()) {
        throw new Error('empty extraction content');
      }

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
        extractionCaches: {
          ...(currentPage?.extractionCaches ?? {}),
          [input.extractionMethod]: {
            content: input.content,
            updatedAt: now,
          },
        },
        updatedAt: now,
        expiresAt: now + NINETY_DAYS,
      });

      await storage.set({ [getPageKey(nextPage.normalizedUrl)]: nextPage });
      return nextPage;
    },

    /** 切换当前提取方法，只读取已有方法缓存，不触发新提取。 */
    async selectExtractionCache(input: {
      /** 归一化后的页面 URL。 */
      normalizedUrl: string;
      /** 目标提取方法。 */
      method: ExtractionMethod;
    }) {
      const result = await storage.get<Record<string, unknown>>([getPageKey(input.normalizedUrl)]);
      const currentValue = result[getPageKey(input.normalizedUrl)];
      const currentPage = currentValue ? pageRecordSchema.parse(currentValue) : null;
      if (!currentPage) {
        return {
          hasCachedContent: false as const,
          page: null,
        };
      }

      const cached = currentPage.extractionCaches[input.method];
      const nextPage = pageRecordSchema.parse({
        ...currentPage,
        extractionMethod: input.method,
        content: hasUsableExtractionCache(cached) ? cached.content : '',
      });
      await storage.set({ [getPageKey(nextPage.normalizedUrl)]: nextPage });

      if (!hasUsableExtractionCache(cached)) {
        return {
          hasCachedContent: false as const,
          page: nextPage,
        };
      }

      return {
        hasCachedContent: true as const,
        page: nextPage,
        content: cached.content,
        extractionMethod: input.method,
      };
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
      const nextPromptTabState: Parameters<typeof updatePromptTabState>[1] = {
        promptTabId: input.promptTabId,
      };
      if (input.initializedAt !== undefined) {
        nextPromptTabState.initializedAt = input.initializedAt;
      }
      if (input.lastAutoTriggerAt !== undefined) {
        nextPromptTabState.lastAutoTriggerAt = input.lastAutoTriggerAt;
      }
      if (input.autoTriggerStatus !== undefined) {
        nextPromptTabState.autoTriggerStatus = input.autoTriggerStatus;
      }
      if (input.lastClearedAt !== undefined) {
        nextPromptTabState.lastClearedAt = input.lastClearedAt;
      }
      const nextPage = updatePromptTabState(currentPage, nextPromptTabState, now);

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

    /** 按标题、URL 和提取正文搜索页面。 */
    async searchPages(query: string) {
      const normalizedQuery = query.trim().toLowerCase();
      const pages = await getAllPages();
      if (!normalizedQuery) {
        return sortRecentPages(pages);
      }

      return sortRecentPages(
        pages.filter(
          (page) =>
            page.title.toLowerCase().includes(normalizedQuery) ||
            page.url.toLowerCase().includes(normalizedQuery) ||
            page.content.toLowerCase().includes(normalizedQuery),
        ),
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
      // 只枚举 key 并交给原生统计占用，不把 90 天的正文全部搬进内存再序列化。
      const keys = (await storage.getKeys()).filter((key) =>
        key.startsWith(PAGE_STORAGE_PREFIX) ||
        key.startsWith(CONVERSATION_STORAGE_PREFIX) ||
        key.startsWith(LOADING_STORAGE_PREFIX),
      );
      return {
        pageCount: keys.filter((key) => key.startsWith(PAGE_STORAGE_PREFIX)).length,
        entryCount: keys.length,
        bytes: await storage.getBytesInUse(keys),
      };
    },

    /** 安全清理可回收缓存。 */
    async clearCache() {
      const keys = (await storage.getKeys()).filter((key) =>
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
      const keys = (await storage.getKeys()).filter(
        (key) =>
          key === getPageKey(normalizedUrl) ||
          matchesExactConversationKey(key, normalizedUrl) ||
          matchesExactLoadingKey(key, normalizedUrl),
      );
      if (keys.length > 0) {
        await storage.remove(keys);
      }
    },
  };}, {
  unlocked: ['getPage', 'getAllPages', 'listRecentPages', 'searchPages', 'getCacheStats'],
});
