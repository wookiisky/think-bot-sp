type StorageLike = {
  get<T = Record<string, unknown>>(keys?: string | string[] | Record<string, unknown> | null | undefined): Promise<T>;
  getKeys?(): Promise<string[]>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  clear(): Promise<void>;
};

type StorageValues = Record<string, unknown>;
type StorageCoordinator = { tail: Promise<void>; revision: number; changedKeys: Map<string, number> };
const coordinators = new WeakMap<StorageLike, StorageCoordinator>();

export type ChromeLocalAdapter = {
  get<T extends StorageValues>(keys?: Parameters<StorageLike['get']>[0]): Promise<T>;
  getByPrefix(prefix: string): Promise<StorageValues>;
  set(values: StorageValues): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  clear(): Promise<void>;
  transaction<T>(task: (storage: ChromeLocalAdapter) => Promise<T>): Promise<T>;
  getRevision(): number;
  getChangedKeysSince(revision: number): Set<string>;
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
    async getByPrefix(prefix) {
      if (storageArea.getKeys) {
        const keys = (await storageArea.getKeys()).filter((key) => key.startsWith(prefix));
        return keys.length ? storageArea.get(keys) : {};
      }
      const all = await storageArea.get<StorageValues>(null);
      return Object.fromEntries(Object.entries(all).filter(([key]) => key.startsWith(prefix)));
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
      recordMutation(['*']);
    },
    transaction: (task) => task(scoped),
    getRevision: () => state.revision,
    getChangedKeysSince: (revision) => new Set(
      [...state.changedKeys].filter(([, changedAt]) => changedAt > revision).map(([key]) => key),
    ),
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

/** 保留仓储方法类型，在完整读改写期间持有同一个锁。 */
export const createStorageRepository = <T extends object>(
  storage: ChromeLocalAdapter,
  build: (storage: ChromeLocalAdapter) => T,
): T => {
  let repository: T | undefined;
  return Object.fromEntries(Object.keys(build(storage)).map((key) => [key, (...args: unknown[]) =>
    storage.transaction(async (scoped) => {
      repository ??= build(scoped);
      return (repository[key as keyof T] as (...values: unknown[]) => unknown)(...args);
    }),
  ])) as T;
};
