type StorageValue = unknown;

interface FakeStorageArea {
  get<T = Record<string, unknown>>(
    keys?: string | string[] | Record<string, unknown> | null | undefined,
  ): Promise<T>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  clear(): Promise<void>;
  dump: () => Record<string, StorageValue>;
}

/** 创建内存版 storage.area，供仓储单测注入。 */
export const createFakeStorageArea = (): FakeStorageArea => {
  const state = new Map<string, StorageValue>();

  const cloneValue = <T>(value: T): T => {
    if (typeof structuredClone === 'function') {
      return structuredClone(value);
    }

    return value === undefined ? value : JSON.parse(JSON.stringify(value));
  };

  const resolveKeys = (keys: string | string[] | Record<string, unknown> | null | undefined): Record<string, StorageValue> => {
    if (keys === null || keys === undefined) {
      return Object.fromEntries(Array.from(state.entries(), ([key, value]) => [key, cloneValue(value)]));
    }

    if (typeof keys === 'string') {
      return state.has(keys) ? { [keys]: cloneValue(state.get(keys)) } : {};
    }

    if (Array.isArray(keys)) {
      return Object.fromEntries(
        keys.filter((key) => state.has(key)).map((key) => [key, cloneValue(state.get(key))]),
      );
    }

    const result: Record<string, StorageValue> = {};
    for (const [key, defaultValue] of Object.entries(keys)) {
      result[key] = cloneValue(state.has(key) ? state.get(key) : defaultValue);
    }
    return result;
  };

  return {
    async get<T = Record<string, unknown>>(keys?: string | string[] | Record<string, unknown> | null | undefined) {
      return resolveKeys(keys) as T;
    },
    async set(items) {
      for (const [key, value] of Object.entries(items)) {
        state.set(key, cloneValue(value));
      }
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) {
        state.delete(key);
      }
    },
    async clear() {
      state.clear();
    },
    dump() {
      return Object.fromEntries(Array.from(state.entries(), ([key, value]) => [key, cloneValue(value)]));
    },
  };
};
