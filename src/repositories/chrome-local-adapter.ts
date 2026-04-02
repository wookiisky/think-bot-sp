type StorageLike = {
  get<T = Record<string, unknown>>(keys?: string | string[] | Record<string, unknown> | null | undefined): Promise<T>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  clear(): Promise<void>;
};

type StorageValues = Record<string, unknown>;

/** 对 `chrome.storage.local` 做最小 typed 封装。 */
export const createChromeLocalAdapter = (storageArea: StorageLike) => ({
  /** 按 key 读取存储。 */
  get<T extends StorageValues>(keys?: Parameters<StorageLike['get']>[0]): Promise<T> {
    return storageArea.get(keys as never) as Promise<T>;
  },

  /** 批量写入存储。 */
  set(values: StorageValues): Promise<void> {
    return storageArea.set(values);
  },

  /** 批量删除存储。 */
  remove(keys: string | string[]): Promise<void> {
    return storageArea.remove(keys);
  },

  /** 清空存储。 */
  clear(): Promise<void> {
    return storageArea.clear();
  },
});
