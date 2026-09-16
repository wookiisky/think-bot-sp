import type { ChromeLocalAdapter } from './chrome-local-adapter';

type CacheEntry<T> = {
  /** 读取开始时的存储修订号。 */
  revision: number;
  /** 已解析的记录；不存在时为 null。 */
  value: T | null;
};

/** 单个仓储实例最多缓存的记录数，超过后淘汰最早写入的条目。 */
const DEFAULT_CAPACITY = 128;

/**
 * 按 key 缓存已解析记录：只要该 key（或整库）自读取以来没有变更，就直接复用，不再 get + zod parse。
 * 所有写入都经过 adapter 记录修订号，因此其他仓储实例、同步合并、清理都会自动让缓存失效。
 */
export const createRecordCache = <T>(
  storage: Pick<ChromeLocalAdapter, 'get' | 'set' | 'getRevision' | 'getKeyRevision'>,
  parse: (value: unknown) => T,
  capacity = DEFAULT_CAPACITY,
) => {
  const entries = new Map<string, CacheEntry<T>>();

  const remember = (key: string, entry: CacheEntry<T>) => {
    entries.delete(key);
    entries.set(key, entry);
    if (entries.size > capacity) {
      const oldest = entries.keys().next().value;
      if (oldest !== undefined) entries.delete(oldest);
    }
  };

  return {
    /** 读取并解析单条记录；命中缓存时不访问存储。 */
    async read(key: string): Promise<T | null> {
      const cached = entries.get(key);
      if (cached && storage.getKeyRevision(key) <= cached.revision) {
        return cached.value;
      }
      // 记录读取前的修订号：读取期间发生的写入会让下一次读取重新加载。
      const revision = storage.getRevision();
      const result = await storage.get<Record<string, unknown>>([key]);
      const raw = result[key];
      const value = raw === undefined ? null : parse(raw);
      remember(key, { revision, value });
      return value;
    },

    /** 写入一条记录并把已解析对象直接放进缓存。 */
    async write(key: string, value: T): Promise<T> {
      await storage.set({ [key]: value });
      remember(key, { revision: storage.getRevision(), value });
      return value;
    },
  };
};
