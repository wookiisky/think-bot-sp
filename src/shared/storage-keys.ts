/** 配置主存储 key。 */
export const CONFIG_STORAGE_KEY = 'config:extension';

/** 页面记录 key 前缀。 */
export const PAGE_STORAGE_PREFIX = 'page:';

/** 会话记录 key 前缀。 */
export const CONVERSATION_STORAGE_PREFIX = 'conversation:';

/** loading 记录 key 前缀。 */
export const LOADING_STORAGE_PREFIX = 'loading:';

/** 同步状态存储 key。 */
export const SYNC_STATE_STORAGE_KEY = 'sync:state';

const normalizePromptTabId = (promptTabId: string): string => {
  if (promptTabId.includes(':')) {
    throw new Error('promptTabId cannot contain ":"');
  }

  return promptTabId;
};

/** 生成配置存储 key。 */
export const buildConfigStorageKey = (): string => CONFIG_STORAGE_KEY;

/** 生成页面存储 key。 */
export const buildPageStorageKey = (normalizedUrl: string): string => `${PAGE_STORAGE_PREFIX}${normalizedUrl}`;

/** 生成会话存储 key。 */
export const buildConversationStorageKey = (normalizedUrl: string, promptTabId: string): string =>
  `${CONVERSATION_STORAGE_PREFIX}${normalizedUrl}:${normalizePromptTabId(promptTabId)}`;

/** 生成 loading 存储 key。 */
export const buildLoadingStorageKey = (normalizedUrl: string, promptTabId: string): string =>
  `${LOADING_STORAGE_PREFIX}${normalizedUrl}:${normalizePromptTabId(promptTabId)}`;
