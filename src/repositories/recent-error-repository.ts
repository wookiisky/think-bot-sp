import { buildRecentErrorSummary, recentErrorSummarySchema } from '../domain/error/recent-error-schema';
import type { RecentErrorSummary } from '../domain/error/recent-error-schema';
import { RECENT_ERROR_STORAGE_KEY } from '../shared/storage-keys';

type ChromeLocalAdapter = ReturnType<typeof import('./chrome-local-adapter').createChromeLocalAdapter>;

/** 最近一次错误仓储。 */
export const createRecentErrorRepository = (
  storage: ChromeLocalAdapter,
  now: () => number = () => Date.now(),
) => {
  return {
    /** 读取最近一次错误。 */
    async getRecentError(): Promise<RecentErrorSummary | null> {
      const result = await storage.get<Record<string, unknown>>([RECENT_ERROR_STORAGE_KEY]);
      const saved = result[RECENT_ERROR_STORAGE_KEY];
      return saved ? recentErrorSummarySchema.parse(saved) : null;
    },

    /** 覆盖写入最近一次错误。 */
    async saveRecentError(
      input: Omit<RecentErrorSummary, 'capturedAt'>,
    ): Promise<RecentErrorSummary> {
      const next = buildRecentErrorSummary(input, now);
      await storage.set({ [RECENT_ERROR_STORAGE_KEY]: next });
      return next;
    },
  };
};
