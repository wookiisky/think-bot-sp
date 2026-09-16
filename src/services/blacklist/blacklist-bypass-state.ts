type BlacklistBypassStorage = {
  /** 读取存储内容。 */
  get: (keys?: string | string[] | Record<string, unknown> | null | undefined) => Promise<{
    blacklistBypass?: unknown;
  }>;
  /** 写入存储内容。 */
  set: (items: {
    blacklistBypass: Record<string, number>;
  }) => Promise<void>;
};

export type BlacklistBypassState = {
  /** 为当前 browserTab + normalizedUrl 发放放行令牌。 */
  grant: (browserTabId: number, normalizedUrl: string) => Promise<void>;
  /** 判断当前 browserTab + normalizedUrl 是否已放行。 */
  has: (browserTabId: number, normalizedUrl: string) => Promise<boolean>;
  /** 清理指定 browserTab 的全部放行令牌。 */
  clearTab: (browserTabId: number) => Promise<void>;
  /** 只保留指定 browserTab 的放行令牌，其余全部清理。 */
  retainOnlyTab: (browserTabId: number) => Promise<void>;
};

const STORAGE_KEY = 'blacklistBypass';

/** 生成放行令牌 key。 */
const toBypassKey = (browserTabId: number, normalizedUrl: string) => `${browserTabId}:${normalizedUrl}`;

/** 判断 key 是否属于指定 browserTab。 */
const belongsToTab = (key: string, browserTabId: number) => key.startsWith(`${browserTabId}:`);

/** 过滤出合法的放行令牌表。 */
const normalizeBypassMap = (input: unknown): Record<string, number> => {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
  );
};

/**
 * 黑名单放行令牌运行态。
 * 令牌存放在 `chrome.storage.session`：随浏览器会话消失、不持久化、不参与同步，但能跨 service worker 空闲重启保留，
 * 避免 worker 被回收后用户被再次要求确认。
 */
export const createBlacklistBypassState = (
  storage: BlacklistBypassStorage,
  now: () => number = () => Date.now(),
): BlacklistBypassState => {
  let writeQueue = Promise.resolve();

  /** 读取当前令牌表。 */
  const readBypassMap = async () => {
    const snapshot = await storage.get(STORAGE_KEY);
    return normalizeBypassMap(snapshot.blacklistBypass);
  };

  /** 写回令牌表。 */
  const writeBypassMap = async (bypassMap: Record<string, number>) => {
    await storage.set({ blacklistBypass: bypassMap });
  };

  /** 串行执行写操作，避免并发读改写互相覆盖。 */
  const runQueuedWrite = <T>(operation: () => Promise<T>) => {
    const next = writeQueue.then(operation, operation);
    writeQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };

  /** 按条件过滤令牌表，有变化时才写回。 */
  const retainWhere = (predicate: (key: string) => boolean) =>
    runQueuedWrite(async () => {
      const bypassMap = await readBypassMap();
      const nextEntries = Object.entries(bypassMap).filter(([key]) => predicate(key));
      if (nextEntries.length !== Object.keys(bypassMap).length) {
        await writeBypassMap(Object.fromEntries(nextEntries));
      }
    });

  return {
    grant: (browserTabId, normalizedUrl) =>
      runQueuedWrite(async () => {
        const bypassMap = await readBypassMap();
        await writeBypassMap({ ...bypassMap, [toBypassKey(browserTabId, normalizedUrl)]: now() });
      }),

    has: async (browserTabId, normalizedUrl) => {
      // 先等待排队中的写入，避免 clearTab 刚发出就被 bootstrap 读到旧令牌。
      await writeQueue;
      const bypassMap = await readBypassMap();
      return toBypassKey(browserTabId, normalizedUrl) in bypassMap;
    },

    clearTab: (browserTabId) => retainWhere((key) => !belongsToTab(key, browserTabId)),

    retainOnlyTab: (browserTabId) => retainWhere((key) => belongsToTab(key, browserTabId)),
  };
};
