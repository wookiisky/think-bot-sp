type StorageLike = {
  get<T = Record<string, unknown>>(keys?: string | string[] | Record<string, unknown> | null | undefined): Promise<T>;
  /** Chrome 130+ 提供，按 key 枚举时避免搬运全部正文。 */
  getKeys?(): Promise<string[]>;
  /** chrome.storage 原生统计，缺省时退化为本地 JSON 估算。 */
  getBytesInUse?(keys: string | string[] | null): Promise<number>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  clear(): Promise<void>;
};

type StorageValues = Record<string, unknown>;
type StorageCoordinator = { tail: Promise<void>; revision: number; changedKeys: Map<string, number> };
const coordinators = new WeakMap<StorageLike, StorageCoordinator>();

/** 整库清空的变更标记。 */
const CLEAR_ALL_KEY = '*';

export type ChromeLocalAdapter = {
  get<T extends StorageValues>(keys?: Parameters<StorageLike['get']>[0]): Promise<T>;
  getByPrefix(prefix: string): Promise<StorageValues>;
  /** 枚举全部 key；原生不支持时退化为读取整库后取 key。 */
  getKeys(): Promise<string[]>;
  /** 统计指定 key 的占用字节数。 */
  getBytesInUse(keys: string[]): Promise<number>;
  set(values: StorageValues): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  clear(): Promise<void>;
  transaction<T>(task: (storage: ChromeLocalAdapter) => Promise<T>): Promise<T>;
  /** 不排队的同一适配器；仓储用它构建实例，串行化只在方法边界做。 */
  unqueued(): ChromeLocalAdapter;
  getRevision(): number;
  getChangedKeysSince(revision: number): Set<string>;
  /** 某个 key 最近一次变更（含整库清空）的修订号；从未变更为 0。 */
  getKeyRevision(key: string): number;
};

/** 同一 storage area 的仓储共享队列；事务回调使用不再排队的适配器。 */
export const createChromeLocalAdapter = (storageArea: StorageLike): ChromeLocalAdapter => {
  let coordinator = coordinators.get(storageArea);
  if (!coordinator) {
    coordinator = { tail: Promise.resolve(), revision: 0, changedKeys: new Map() };
    coordinators.set(storageArea, coordinator);
  }
  const state = coordinator;
  const recordMutation = (keys: string[]) => {
    state.revision += 1;
    for (const key of keys) state.changedKeys.set(key, state.revision);
  };
  const scoped: ChromeLocalAdapter = {
    get: (keys) => storageArea.get(keys as never),
    async getKeys() {
      if (storageArea.getKeys) {
        return storageArea.getKeys();
      }
      return Object.keys(await storageArea.get<StorageValues>(null));
    },
    async getByPrefix(prefix) {
      if (storageArea.getKeys) {
        const keys = (await storageArea.getKeys()).filter((key) => key.startsWith(prefix));
        return keys.length ? storageArea.get(keys) : {};
      }
      const all = await storageArea.get<StorageValues>(null);
      return Object.fromEntries(Object.entries(all).filter(([key]) => key.startsWith(prefix)));
    },
    async getBytesInUse(keys) {
      if (keys.length === 0) {
        return 0;
      }
      if (storageArea.getBytesInUse) {
        return storageArea.getBytesInUse(keys);
      }
      const values = await storageArea.get<StorageValues>(keys);
      return new TextEncoder().encode(JSON.stringify(values)).byteLength;
    },
    async set(values) {
      await storageArea.set(values);
      recordMutation(Object.keys(values));
    },
    async remove(keys) {
      await storageArea.remove(keys);
      recordMutation(typeof keys === 'string' ? [keys] : keys);
    },
    async clear() {
      await storageArea.clear();
      recordMutation([CLEAR_ALL_KEY]);
    },
    transaction: (task) => task(scoped),
    unqueued: () => scoped,
    getRevision: () => state.revision,
    getChangedKeysSince: (revision) => new Set(
      [...state.changedKeys].filter(([, changedAt]) => changedAt > revision).map(([key]) => key),
    ),
    getKeyRevision: (key) => Math.max(state.changedKeys.get(key) ?? 0, state.changedKeys.get(CLEAR_ALL_KEY) ?? 0),
  };
  const transaction: ChromeLocalAdapter['transaction'] = (task) => {
    const result = state.tail.then(() => task(scoped));
    state.tail = result.then(() => undefined, () => undefined);
    return result;
  };
  return {
    ...scoped,
    transaction,
    set: (values) => transaction((storage) => storage.set(values)),
    remove: (keys) => transaction((storage) => storage.remove(keys)),
    clear: () => transaction((storage) => storage.clear()),
  };
};

/**
 * 保留仓储方法类型，在完整读改写期间持有同一个锁。
 * `unlocked` 列出的纯读方法不排队：它们不做读改写，允许读到排队写入之前的快照，但不会再被流式 chunk 写入阻塞。
 */
export const createStorageRepository = <T extends object>(
  storage: ChromeLocalAdapter,
  build: (storage: ChromeLocalAdapter) => T,
  options: { unlocked?: ReadonlyArray<keyof T> } = {},
): T => {
  // 实例只用不排队的适配器构建一次；锁住的方法在事务里调用它，未锁的方法直接调用。
  const repository = build(storage.unqueued());
  const unlocked = new Set<keyof T>(options.unlocked ?? []);
  return Object.fromEntries(Object.keys(repository).map((key) => [key, (...args: unknown[]) => {
    const invoke = () => (repository[key as keyof T] as (...values: unknown[]) => unknown)(...args);
    return unlocked.has(key as keyof T) ? Promise.resolve().then(invoke) : storage.transaction(async () => invoke());
  }])) as T;
};
