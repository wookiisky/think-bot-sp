type BrowserEntryPanelStorage = {
  /** 读取存储内容。 */
  get: (keys?: string | string[] | Record<string, unknown> | null | undefined) => Promise<{
    enabledTabIds?: number[];
  }>;
  /** 写入存储内容。 */
  set: (items: {
    enabledTabIds: number[];
  }) => Promise<void>;
};

type BrowserEntryPanelState = {
  /** 读取当前已启用的标签页 id。 */
  getEnabledTabIds: () => Promise<number[]>;
  /** 记录标签页已启用。 */
  addEnabledTabId: (tabId: number) => Promise<void>;
  /** 移除标签页启用态。 */
  removeEnabledTabId: (tabId: number) => Promise<void>;
};

const STORAGE_KEY = 'enabledTabIds';

/** 过滤出合法的已启用标签页 id。 */
const normalizeEnabledTabIds = (input: unknown) => {
  if (!Array.isArray(input)) {
    return [] as number[];
  }

  return input.filter((tabId): tabId is number => Number.isInteger(tabId) && tabId > 0);
};

/** 创建 browser-entry 的 side panel 运行态存储。 */
export const createBrowserEntryPanelState = (storage: BrowserEntryPanelStorage): BrowserEntryPanelState => {
  let writeQueue = Promise.resolve();

  /** 读取当前运行态。 */
  const readEnabledTabIds = async () => {
    const snapshot = await storage.get(STORAGE_KEY);
    return normalizeEnabledTabIds(snapshot.enabledTabIds);
  };

  /** 写回当前运行态。 */
  const writeEnabledTabIds = async (enabledTabIds: number[]) => {
    await storage.set({
      enabledTabIds,
    });
  };

  /** 串行执行运行态写操作。 */
  const runQueuedWrite = <T>(operation: () => Promise<T>) => {
    const next = writeQueue.then(operation, operation);
    writeQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };

  return {
    getEnabledTabIds: readEnabledTabIds,

    addEnabledTabId: async (tabId: number) => {
      await runQueuedWrite(async () => {
        const enabledTabIds = await readEnabledTabIds();
        if (!enabledTabIds.includes(tabId)) {
          enabledTabIds.push(tabId);
          await writeEnabledTabIds(enabledTabIds);
        }
      });
    },

    removeEnabledTabId: async (tabId: number) => {
      await runQueuedWrite(async () => {
        const enabledTabIds = await readEnabledTabIds();
        const nextEnabledTabIds = enabledTabIds.filter((enabledTabId) => enabledTabId !== tabId);
        if (nextEnabledTabIds.length !== enabledTabIds.length) {
          await writeEnabledTabIds(nextEnabledTabIds);
        }
      });
    },
  };
};
