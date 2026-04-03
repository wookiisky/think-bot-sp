import { z } from 'zod';

import { buildConversationKey, conversationRecordSchema } from '../domain/conversation/conversation-schema';
import { loadingStateRecordSchema } from '../domain/loading/loading-state-schema';
import {
  CONVERSATION_STORAGE_PREFIX,
  LOADING_STORAGE_PREFIX,
  buildConversationStorageKey,
  buildLoadingStorageKey,
} from '../shared/storage-keys';

type ChromeLocalAdapter = ReturnType<typeof import('./chrome-local-adapter').createChromeLocalAdapter>;
type ConversationRecord = z.infer<typeof conversationRecordSchema>;
type LoadingStateRecord = z.infer<typeof loadingStateRecordSchema>;
type AssistantMessageRecord = Extract<ConversationRecord['messages'][number], { role: 'assistant' }>;

/** 生成 conversation 存储 key。 */
const getConversationKey = (normalizedUrl: string, promptTabId: string) =>
  buildConversationStorageKey(normalizedUrl, promptTabId);
/** 生成 loading 存储 key。 */
const getLoadingKey = (normalizedUrl: string, promptTabId: string) => buildLoadingStorageKey(normalizedUrl, promptTabId);

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

/** 创建空 conversation，供增量编辑首次落库使用。 */
const createEmptyConversation = (
  normalizedUrl: string,
  promptTabId: string,
  now: number,
): ConversationRecord =>
  conversationRecordSchema.parse({
    id: buildConversationKey(normalizedUrl, promptTabId),
    normalizedUrl,
    promptTabId,
    messages: [],
    lastAssistantState: null,
    updatedAt: now,
  });

/** 会话仓储，负责 conversation 和 loading 的持久化。 */
export const createConversationRepository = (storage: ChromeLocalAdapter) => {
  /** 读取全部存储。 */
  const readAll = async () => storage.get<Record<string, unknown>>(null);
  /** 按 key 读取单个 conversation。 */
  const readConversation = async (normalizedUrl: string, promptTabId: string): Promise<ConversationRecord | null> => {
    const result = await storage.get<Record<string, unknown>>([getConversationKey(normalizedUrl, promptTabId)]);
    const value = result[getConversationKey(normalizedUrl, promptTabId)];
    return value ? conversationRecordSchema.parse(value) : null;
  };
  /** 按 key 读取单个 loading。 */
  const readLoadingState = async (normalizedUrl: string, promptTabId: string): Promise<LoadingStateRecord | null> => {
    const result = await storage.get<Record<string, unknown>>([getLoadingKey(normalizedUrl, promptTabId)]);
    const value = result[getLoadingKey(normalizedUrl, promptTabId)];
    return value ? loadingStateRecordSchema.parse(value) : null;
  };
  /** 保存单个 conversation。 */
  const persistConversation = async (conversation: ConversationRecord) => {
    await storage.set({ [getConversationKey(conversation.normalizedUrl, conversation.promptTabId)]: conversation });
    return conversation;
  };
  /** 读取或创建 conversation。 */
  const getOrCreateConversation = async (
    normalizedUrl: string,
    promptTabId: string,
    now: number,
  ): Promise<ConversationRecord> => readConversation(normalizedUrl, promptTabId).then((value) => value ?? createEmptyConversation(normalizedUrl, promptTabId, now));
  /** 查找指定 assistant 消息。 */
  const requireAssistantMessage = (conversation: ConversationRecord, messageId: string) => {
    const message = conversation.messages.find((item) => item.id === messageId);
    if (!message || message.role !== 'assistant') {
      throw new Error(`assistant message not found: ${messageId}`);
    }

    return message;
  };
  /** 要求 assistant 仍处于 loading，避免非法状态迁移。 */
  const requireLoadingAssistantMessage = (conversation: ConversationRecord, messageId: string): AssistantMessageRecord => {
    const message = requireAssistantMessage(conversation, messageId);
    if (message.status !== 'loading') {
      throw new Error(`assistant message is already terminal: ${messageId}`);
    }

    return message;
  };
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
      return readConversation(normalizedUrl, promptTabId);
    },

    /** 保存 loading 状态。 */
    async saveLoadingState(value: unknown) {
      const next = loadingStateRecordSchema.parse(value);
      await storage.set({ [getLoadingKey(next.normalizedUrl, next.promptTabId)]: next });
      return next;
    },

    /** 读取单个 loading 状态。 */
    async getLoadingState(normalizedUrl: string, promptTabId: string) {
      return readLoadingState(normalizedUrl, promptTabId);
    },

    /** 删除单个 loading 状态。 */
    async removeLoadingState(normalizedUrl: string, promptTabId: string) {
      await storage.remove(getLoadingKey(normalizedUrl, promptTabId));
    },

    /** 追加用户消息。 */
    async appendUserMessage({
      normalizedUrl,
      promptTabId,
      messageId,
      content,
      images,
      now,
    }: {
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 新消息 id。 */
      messageId: string;
      /** 用户文本。 */
      content: string;
      /** 用户附带图片。 */
      images: string[];
      /** 当前时间。 */
      now: number;
    }) {
      const conversation = await getOrCreateConversation(normalizedUrl, promptTabId, now);
      const next = conversationRecordSchema.parse({
        ...conversation,
        messages: [
          ...conversation.messages,
          {
            id: messageId,
            role: 'user',
            content,
            images,
            status: 'done',
            modelId: null,
            branches: [],
            retryFromMessageId: null,
            editedAt: null,
            errorMessage: null,
            createdAt: now,
            updatedAt: now,
          },
        ],
        updatedAt: now,
      });
      return persistConversation(next);
    },

    /** 追加助手占位消息。 */
    async appendAssistantMessage({
      normalizedUrl,
      promptTabId,
      messageId,
      modelId,
      now,
    }: {
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 新消息 id。 */
      messageId: string;
      /** 使用的模型 id。 */
      modelId: string;
      /** 当前时间。 */
      now: number;
    }) {
      const conversation = await getOrCreateConversation(normalizedUrl, promptTabId, now);
      const next = conversationRecordSchema.parse({
        ...conversation,
        messages: [
          ...conversation.messages,
          {
            id: messageId,
            role: 'assistant',
            content: '',
            images: [],
            status: 'loading',
            modelId,
            branches: [],
            retryFromMessageId: null,
            editedAt: null,
            errorMessage: null,
            createdAt: now,
            updatedAt: now,
          },
        ],
        lastAssistantState: {
          messageId,
          status: 'loading',
          summary: '',
        },
        updatedAt: now,
      });
      return persistConversation(next);
    },

    /** 追加助手流式 chunk。 */
    async appendAssistantChunk({
      normalizedUrl,
      promptTabId,
      messageId,
      chunk,
      now,
    }: {
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 助手消息 id。 */
      messageId: string;
      /** 新增 chunk。 */
      chunk: string;
      /** 当前时间。 */
      now: number;
    }) {
      const conversation = await getOrCreateConversation(normalizedUrl, promptTabId, now);
      const target = requireLoadingAssistantMessage(conversation, messageId);
      const nextContent = target.content + chunk;
      const next = conversationRecordSchema.parse({
        ...conversation,
        messages: conversation.messages.map((message) =>
          message.id === messageId
            ? {
                ...message,
                content: nextContent,
                updatedAt: now,
              }
            : message,
        ),
        lastAssistantState: {
          messageId,
          status: target.status,
          summary: nextContent,
        },
        updatedAt: now,
      });
      return persistConversation(next);
    },

    /** 收敛助手消息为完成态。 */
    async finishAssistantMessage({
      normalizedUrl,
      promptTabId,
      messageId,
      now,
    }: {
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 助手消息 id。 */
      messageId: string;
      /** 当前时间。 */
      now: number;
    }) {
      const conversation = await getOrCreateConversation(normalizedUrl, promptTabId, now);
      const target = requireLoadingAssistantMessage(conversation, messageId);
      const next = conversationRecordSchema.parse({
        ...conversation,
        messages: conversation.messages.map((message) =>
          message.id === messageId
            ? {
                ...message,
                status: 'done',
                errorMessage: null,
                updatedAt: now,
              }
            : message,
        ),
        lastAssistantState: {
          messageId,
          status: 'done',
          summary: target.content,
        },
        updatedAt: now,
      });
      return persistConversation(next);
    },

    /** 收敛助手消息为失败或取消态。 */
    async failAssistantMessage({
      normalizedUrl,
      promptTabId,
      messageId,
      errorMessage,
      status,
      now,
    }: {
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 助手消息 id。 */
      messageId: string;
      /** 失败原因。 */
      errorMessage: string;
      /** 最终失败状态。 */
      status: 'error' | 'cancelled';
      /** 当前时间。 */
      now: number;
    }) {
      const conversation = await getOrCreateConversation(normalizedUrl, promptTabId, now);
      const target = requireLoadingAssistantMessage(conversation, messageId);
      const next = conversationRecordSchema.parse({
        ...conversation,
        messages: conversation.messages.map((message) =>
          message.id === messageId
            ? {
                ...message,
                status,
                errorMessage,
                updatedAt: now,
              }
            : message,
        ),
        lastAssistantState: {
          messageId,
          status,
          summary: target.content,
        },
        updatedAt: now,
      });
      return persistConversation(next);
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
