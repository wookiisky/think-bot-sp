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
type UserMessageRecord = Extract<ConversationRecord['messages'][number], { role: 'user' }>;
type BranchRecord = AssistantMessageRecord['branches'][number];

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

/** 创建 loading 中的助手消息占位。 */
const createLoadingAssistantMessage = ({
  messageId,
  modelId,
  retryFromMessageId,
  now,
}: {
  /** 新助手消息 id。 */
  messageId: string;
  /** 使用的模型 id。 */
  modelId: string;
  /** 被替换的旧助手消息 id。 */
  retryFromMessageId: string | null;
  /** 当前时间。 */
  now: number;
}): AssistantMessageRecord => ({
  id: messageId,
  role: 'assistant',
  content: '',
  images: [],
  status: 'loading',
  modelId,
  branches: [],
  retryFromMessageId,
  editedAt: null,
  errorMessage: null,
  createdAt: now,
  updatedAt: now,
});

/** 从消息列表推导最新助手摘要。 */
const buildLastAssistantState = (messages: ConversationRecord['messages']): ConversationRecord['lastAssistantState'] => {
  const assistantMessages = messages.filter((message): message is AssistantMessageRecord => message.role === 'assistant');
  const lastAssistantMessage = assistantMessages.at(-1) ?? null;
  if (!lastAssistantMessage) {
    return null;
  }

  return {
    messageId: lastAssistantMessage.id,
    status: lastAssistantMessage.status,
    summary: lastAssistantMessage.content,
  };
};

/** 会话仓储，负责 conversation 和 loading 的持久化。 */
export const createConversationRepository = (storage: ChromeLocalAdapter) => {
  const mutationQueues = new Map<string, Promise<void>>();
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
  /** 同一 promptTab 的写操作必须串行，避免并发分支互相覆盖。 */
  const withPromptTabMutation = async <T>(normalizedUrl: string, promptTabId: string, task: () => Promise<T>) => {
    const queueKey = getConversationKey(normalizedUrl, promptTabId);
    const previous = mutationQueues.get(queueKey) ?? Promise.resolve();
    let release = () => undefined;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    mutationQueues.set(
      queueKey,
      previous.catch(() => undefined).then(() => next),
    );
    try {
      await previous.catch(() => undefined);
      return await task();
    } finally {
      release();
    }
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
  /** 查找指定用户消息。 */
  const requireUserMessage = (conversation: ConversationRecord, messageId: string): UserMessageRecord => {
    const message = conversation.messages.find((item) => item.id === messageId);
    if (!message || message.role !== 'user') {
      throw new Error(`user message not found: ${messageId}`);
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
  /** 查找指定分支。 */
  const requireAssistantBranch = (assistantMessage: AssistantMessageRecord, branchId: string): BranchRecord => {
    const branch = assistantMessage.branches.find((item) => item.id === branchId);
    if (!branch) {
      throw new Error(`assistant branch not found: ${branchId}`);
    }

    return branch;
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

    /** 读取单个助手消息。 */
    async getAssistantMessage(normalizedUrl: string, promptTabId: string, messageId: string) {
      const conversation = await getOrCreateConversation(normalizedUrl, promptTabId, Date.now());
      return requireAssistantMessage(conversation, messageId);
    },

    /** 编辑用户消息，并裁剪该消息之后的全部结果后插入新的助手占位。 */
    async editUserMessage({
      normalizedUrl,
      promptTabId,
      messageId,
      content,
      newAssistantMessageId,
      modelId,
      now,
    }: {
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 目标用户消息 id。 */
      messageId: string;
      /** 编辑后的用户文本。 */
      content: string;
      /** 新助手消息 id。 */
      newAssistantMessageId: string;
      /** 重新生成时使用的模型 id。 */
      modelId: string;
      /** 当前时间。 */
      now: number;
    }) {
      return withPromptTabMutation(normalizedUrl, promptTabId, async () => {
        const conversation = await getOrCreateConversation(normalizedUrl, promptTabId, now);
        requireUserMessage(conversation, messageId);
        const targetIndex = conversation.messages.findIndex((message) => message.id === messageId);
        const preservedMessages = conversation.messages.slice(0, targetIndex + 1).map((message) =>
          message.id === messageId
            ? {
                ...message,
                content,
                editedAt: now,
                updatedAt: now,
              }
            : message,
        );
        const nextMessages = [
          ...preservedMessages,
          createLoadingAssistantMessage({
            messageId: newAssistantMessageId,
            modelId,
            retryFromMessageId: null,
            now,
          }),
        ];
        const next = conversationRecordSchema.parse({
          ...conversation,
          messages: nextMessages,
          lastAssistantState: buildLastAssistantState(nextMessages),
          updatedAt: now,
        });
        return persistConversation(next);
      });
    },

    /** 重试目标助手消息，并用新的助手消息替换旧助手消息及其后续结果。 */
    async retryAssistantMessage({
      normalizedUrl,
      promptTabId,
      messageId,
      newAssistantMessageId,
      modelId,
      now,
    }: {
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 被替换的旧助手消息 id。 */
      messageId: string;
      /** 新助手消息 id。 */
      newAssistantMessageId: string;
      /** 重试时使用的模型 id。 */
      modelId: string;
      /** 当前时间。 */
      now: number;
    }) {
      return withPromptTabMutation(normalizedUrl, promptTabId, async () => {
        const conversation = await getOrCreateConversation(normalizedUrl, promptTabId, now);
        requireAssistantMessage(conversation, messageId);
        const targetIndex = conversation.messages.findIndex((message) => message.id === messageId);
        const preservedMessages = conversation.messages.slice(0, targetIndex);
        const nextMessages = [
          ...preservedMessages,
          createLoadingAssistantMessage({
            messageId: newAssistantMessageId,
            modelId,
            retryFromMessageId: messageId,
            now,
          }),
        ];
        const next = conversationRecordSchema.parse({
          ...conversation,
          messages: nextMessages,
          lastAssistantState: buildLastAssistantState(nextMessages),
          updatedAt: now,
        });
        return persistConversation(next);
      });
    },

    /** 保存 loading 状态。 */
    async saveLoadingState(value: unknown) {
      const next = loadingStateRecordSchema.parse(value);
      return withPromptTabMutation(next.normalizedUrl, next.promptTabId, async () => {
        await storage.set({ [getLoadingKey(next.normalizedUrl, next.promptTabId)]: next });
        return next;
      });
    },

    /** 读取单个 loading 状态。 */
    async getLoadingState(normalizedUrl: string, promptTabId: string) {
      return readLoadingState(normalizedUrl, promptTabId);
    },

    /** 删除单个 loading 状态。 */
    async removeLoadingState(normalizedUrl: string, promptTabId: string) {
      await withPromptTabMutation(normalizedUrl, promptTabId, async () => {
        await storage.remove(getLoadingKey(normalizedUrl, promptTabId));
      });
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
      return withPromptTabMutation(normalizedUrl, promptTabId, async () => {
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
      });
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
      return withPromptTabMutation(normalizedUrl, promptTabId, async () => {
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
      });
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
      return withPromptTabMutation(normalizedUrl, promptTabId, async () => {
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
      });
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
      return withPromptTabMutation(normalizedUrl, promptTabId, async () => {
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
      });
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
      return withPromptTabMutation(normalizedUrl, promptTabId, async () => {
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
      });
    },

    /** 追加助手分支占位。 */
    async appendAssistantBranch({
      normalizedUrl,
      promptTabId,
      messageId,
      branchId,
      modelId,
      modelLabel,
      now,
    }: {
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 助手消息 id。 */
      messageId: string;
      /** 分支稳定 id。 */
      branchId: string;
      /** 分支模型 id。 */
      modelId: string;
      /** 分支模型展示名。 */
      modelLabel: string;
      /** 当前时间。 */
      now: number;
    }) {
      return withPromptTabMutation(normalizedUrl, promptTabId, async () => {
        const conversation = await getOrCreateConversation(normalizedUrl, promptTabId, now);
        const assistantMessage = requireAssistantMessage(conversation, messageId);
        const next = conversationRecordSchema.parse({
          ...conversation,
          messages: conversation.messages.map((message) =>
            message.id === messageId
              ? {
                  ...assistantMessage,
                  branches: [
                    ...assistantMessage.branches,
                    {
                      id: branchId,
                      modelId,
                      modelLabel,
                      content: '',
                      status: 'loading',
                      errorMessage: null,
                      createdAt: now,
                      updatedAt: now,
                    },
                  ],
                  updatedAt: now,
                }
              : message,
          ),
          updatedAt: now,
        });
        return persistConversation(next);
      });
    },

    /** 追加助手分支 chunk。 */
    async appendAssistantBranchChunk({
      normalizedUrl,
      promptTabId,
      messageId,
      branchId,
      chunk,
      now,
    }: {
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 助手消息 id。 */
      messageId: string;
      /** 分支稳定 id。 */
      branchId: string;
      /** 增量文本。 */
      chunk: string;
      /** 当前时间。 */
      now: number;
    }) {
      return withPromptTabMutation(normalizedUrl, promptTabId, async () => {
        const conversation = await getOrCreateConversation(normalizedUrl, promptTabId, now);
        const assistantMessage = requireAssistantMessage(conversation, messageId);
        const branch = requireAssistantBranch(assistantMessage, branchId);
        if (branch.status !== 'loading') {
          throw new Error(`assistant branch is already terminal: ${branchId}`);
        }

        const next = conversationRecordSchema.parse({
          ...conversation,
          messages: conversation.messages.map((message) =>
            message.id === messageId
              ? {
                  ...assistantMessage,
                  branches: assistantMessage.branches.map((item) =>
                    item.id === branchId
                      ? {
                          ...item,
                          content: item.content + chunk,
                          updatedAt: now,
                        }
                      : item,
                  ),
                  updatedAt: now,
                }
              : message,
          ),
          updatedAt: now,
        });
        return persistConversation(next);
      });
    },

    /** 收敛分支为完成态。 */
    async finishAssistantBranch({
      normalizedUrl,
      promptTabId,
      messageId,
      branchId,
      now,
    }: {
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 助手消息 id。 */
      messageId: string;
      /** 分支稳定 id。 */
      branchId: string;
      /** 当前时间。 */
      now: number;
    }) {
      return withPromptTabMutation(normalizedUrl, promptTabId, async () => {
        const conversation = await getOrCreateConversation(normalizedUrl, promptTabId, now);
        const assistantMessage = requireAssistantMessage(conversation, messageId);
        const branch = requireAssistantBranch(assistantMessage, branchId);
        if (branch.status !== 'loading') {
          throw new Error(`assistant branch is already terminal: ${branchId}`);
        }

        const next = conversationRecordSchema.parse({
          ...conversation,
          messages: conversation.messages.map((message) =>
            message.id === messageId
              ? {
                  ...assistantMessage,
                  branches: assistantMessage.branches.map((item) =>
                    item.id === branchId
                      ? {
                          ...item,
                          status: 'done',
                          errorMessage: null,
                          updatedAt: now,
                        }
                      : item,
                  ),
                  updatedAt: now,
                }
              : message,
          ),
          updatedAt: now,
        });
        return persistConversation(next);
      });
    },

    /** 收敛分支为失败或取消态。 */
    async failAssistantBranch({
      normalizedUrl,
      promptTabId,
      messageId,
      branchId,
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
      /** 分支稳定 id。 */
      branchId: string;
      /** 错误消息。 */
      errorMessage: string;
      /** 最终状态。 */
      status: 'error' | 'cancelled';
      /** 当前时间。 */
      now: number;
    }) {
      return withPromptTabMutation(normalizedUrl, promptTabId, async () => {
        const conversation = await getOrCreateConversation(normalizedUrl, promptTabId, now);
        const assistantMessage = requireAssistantMessage(conversation, messageId);
        const branch = requireAssistantBranch(assistantMessage, branchId);
        if (branch.status !== 'loading') {
          throw new Error(`assistant branch is already terminal: ${branchId}`);
        }

        const next = conversationRecordSchema.parse({
          ...conversation,
          messages: conversation.messages.map((message) =>
            message.id === messageId
              ? {
                  ...assistantMessage,
                  branches: assistantMessage.branches.map((item) =>
                    item.id === branchId
                      ? {
                          ...item,
                          status,
                          errorMessage,
                          updatedAt: now,
                        }
                      : item,
                  ),
                  updatedAt: now,
                }
              : message,
          ),
          updatedAt: now,
        });
        return persistConversation(next);
      });
    },

    /** 删除目标分支。 */
    async deleteAssistantBranch({
      normalizedUrl,
      promptTabId,
      messageId,
      branchId,
      now,
    }: {
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 助手消息 id。 */
      messageId: string;
      /** 分支稳定 id。 */
      branchId: string;
      /** 当前时间。 */
      now: number;
    }) {
      return withPromptTabMutation(normalizedUrl, promptTabId, async () => {
        const conversation = await getOrCreateConversation(normalizedUrl, promptTabId, now);
        const assistantMessage = requireAssistantMessage(conversation, messageId);
        requireAssistantBranch(assistantMessage, branchId);

        const next = conversationRecordSchema.parse({
          ...conversation,
          messages: conversation.messages.map((message) =>
            message.id === messageId
              ? {
                  ...assistantMessage,
                  branches: assistantMessage.branches.filter((item) => item.id !== branchId),
                  updatedAt: now,
                }
              : message,
          ),
          updatedAt: now,
        });
        return persistConversation(next);
      });
    },

    /** 写入或更新单个分支 loading。 */
    async upsertBranchLoadingState({
      normalizedUrl,
      promptTabId,
      sessionId,
      messageId,
      branchId,
      modelId,
      status,
      now,
    }: {
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 当前会话 id。 */
      sessionId: string;
      /** 目标助手消息 id。 */
      messageId: string;
      /** 分支稳定 id。 */
      branchId: string;
      /** 分支模型 id。 */
      modelId: string;
      /** 分支当前状态。 */
      status: 'loading' | 'cancelled' | 'error';
      /** 当前时间。 */
      now: number;
    }) {
      return withPromptTabMutation(normalizedUrl, promptTabId, async () => {
        const current = await readLoadingState(normalizedUrl, promptTabId);
        const next = loadingStateRecordSchema.parse({
          id: getLoadingKey(normalizedUrl, promptTabId),
          normalizedUrl,
          promptTabId,
          sessionId: current?.sessionId ?? sessionId,
          promptTabStatus: current?.promptTabStatus ?? 'idle',
          branchStates: [
            ...(current?.branchStates.filter((item) => item.branchId !== branchId) ?? []),
            {
              branchId,
              status,
              modelId,
            },
          ],
          resumeTarget: {
            messageId,
            branchId,
          },
          cancelRequested: current?.cancelRequested ?? false,
          updatedAt: now,
        });
        await storage.set({ [getLoadingKey(normalizedUrl, promptTabId)]: next });
        return next;
      });
    },

    /** 删除单个分支 loading。 */
    async removeBranchLoadingState(normalizedUrl: string, promptTabId: string, branchId: string) {
      await withPromptTabMutation(normalizedUrl, promptTabId, async () => {
        const current = await readLoadingState(normalizedUrl, promptTabId);
        if (!current) {
          return;
        }

        const nextBranchStates = current.branchStates.filter((item) => item.branchId !== branchId);
        if (nextBranchStates.length === 0 && current.promptTabStatus !== 'loading') {
          await storage.remove(getLoadingKey(normalizedUrl, promptTabId));
          return;
        }

        const next = loadingStateRecordSchema.parse({
          ...current,
          branchStates: nextBranchStates,
          resumeTarget:
            current.resumeTarget?.branchId === branchId
              ? current.promptTabStatus === 'loading'
                ? { messageId: current.resumeTarget.messageId }
                : null
              : current.resumeTarget,
          updatedAt: Date.now(),
        });
        await storage.set({ [getLoadingKey(normalizedUrl, promptTabId)]: next });
      });
    },

    /** 按页面列出 conversation。 */
    async listPageConversations(normalizedUrl: string) {
      const conversations = await getAllConversations();
      return conversations.filter((conversation) => conversation.normalizedUrl === normalizedUrl);
    },

    /** 读取全部 conversation。 */
    async getAllConversations() {
      return getAllConversations();
    },

    /** 按页面列出 loading 状态。 */
    async listPageLoadingStates(normalizedUrl: string) {
      const loadingStates = await getAllLoadingStates();
      return loadingStates.filter((loadingState) => loadingState.normalizedUrl === normalizedUrl);
    },

    /** 读取全部 loading 状态。 */
    async getAllLoadingStates() {
      return getAllLoadingStates();
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

    /** 清理单个 promptTab 的 conversation 和 loading。 */
    async clearPromptTabData(normalizedUrl: string, promptTabId: string) {
      await storage.remove([getConversationKey(normalizedUrl, promptTabId), getLoadingKey(normalizedUrl, promptTabId)]);
    },
  };
};
