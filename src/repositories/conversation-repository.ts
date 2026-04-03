import { conversationRecordSchema } from '../domain/conversation/conversation-schema';
import { loadingStateRecordSchema } from '../domain/loading/loading-state-schema';
import { CONVERSATION_STORAGE_PREFIX, LOADING_STORAGE_PREFIX } from '../shared/storage-keys';

type ChromeLocalAdapter = ReturnType<typeof import('./chrome-local-adapter').createChromeLocalAdapter>;

/** 生成 conversation 存储 key。 */
const getConversationKey = (normalizedUrl: string, promptTabId: string) =>
  `${CONVERSATION_STORAGE_PREFIX}${normalizedUrl}:${promptTabId}`;
/** 生成 loading 存储 key。 */
const getLoadingKey = (normalizedUrl: string, promptTabId: string) =>
  `${LOADING_STORAGE_PREFIX}${normalizedUrl}:${promptTabId}`;

/** 判断某个存储 key 是否属于指定页面。 */
const matchesPageScopedKey = (key: string, prefix: string, normalizedUrl: string): boolean => {
  if (!key.startsWith(prefix)) {
    return false;
  }

  const suffix = key.slice(prefix.length);
  const separatorIndex = suffix.lastIndexOf(':');
  if (separatorIndex <= 0) {
    return false;
  }

  return suffix.slice(0, separatorIndex) === normalizedUrl;
};

/** 会话仓储，负责 conversation 和 loading 的持久化。 */
export const createConversationRepository = (storage: ChromeLocalAdapter) => {
  /** 读取全部存储。 */
  const readAll = async () => storage.get<Record<string, unknown>>(null);
  /** 读取全部 conversation 记录。 */
  const getAllConversations = async () => {
    const all = await readAll();
    return Object.entries(all)
      .filter(([key]) => key.startsWith(CONVERSATION_STORAGE_PREFIX))
      .map(([, value]) => conversationRecordSchema.parse(value));
  };
  /** 读取全部 loading 记录。 */
  const getAllLoadingStates = async () => {
    const all = await readAll();
    return Object.entries(all)
      .filter(([key]) => key.startsWith(LOADING_STORAGE_PREFIX))
      .map(([, value]) => loadingStateRecordSchema.parse(value));
  };

  return {
    /** 保存会话。 */
    async saveConversation(value: unknown) {
      const next = conversationRecordSchema.parse(value);
      await storage.set({ [getConversationKey(next.normalizedUrl, next.promptTabId)]: next });
      return next;
    },

    /** 读取单个会话。 */
    async getConversation(normalizedUrl: string, promptTabId: string) {
      const result = await storage.get<Record<string, unknown>>([getConversationKey(normalizedUrl, promptTabId)]);
      const value = result[getConversationKey(normalizedUrl, promptTabId)];
      return value ? conversationRecordSchema.parse(value) : null;
    },

    /** 保存 loading 状态。 */
    async saveLoadingState(value: unknown) {
      const next = loadingStateRecordSchema.parse(value);
      await storage.set({ [getLoadingKey(next.normalizedUrl, next.promptTabId)]: next });
      return next;
    },

    /** 按页面列出 conversation。 */
    async listPageConversations(normalizedUrl: string) {
      const conversations = await getAllConversations();
      return conversations.filter((conversation) => conversation.normalizedUrl === normalizedUrl);
    },

    /** 按页面列出 loading 状态。 */
    async listPageLoadingStates(normalizedUrl: string) {
      const loadingStates = await getAllLoadingStates();
      return loadingStates.filter((loadingState) => loadingState.normalizedUrl === normalizedUrl);
    },

    /** 按页面清理 conversation 和 loading。 */
    async clearPageData(normalizedUrl: string) {
      const all = await readAll();
      const keys = Object.keys(all).filter(
        (key) =>
          matchesPageScopedKey(key, CONVERSATION_STORAGE_PREFIX, normalizedUrl) ||
          matchesPageScopedKey(key, LOADING_STORAGE_PREFIX, normalizedUrl),
      );
      if (keys.length > 0) {
        await storage.remove(keys);
      }
    },
  };
};
