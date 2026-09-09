import { createStorageRepository } from './chrome-local-adapter';
import { z } from 'zod';

import { conversationRecordSchema } from '../domain/conversation/conversation-schema';
import {
  appendAssistantBranch,
  createEmptyConversation,
  createLoadingAssistantMessage,
  deleteAssistantBranch,
  requireAssistantMessage,
  requireUserMessage,
  selectAssistantBranch,
  transitionAssistantBranch,
  withConversationMessages,
  type ConversationRecord,
  type InitialBranchSeed,
} from '../domain/conversation/conversation-state';
import { loadingStateRecordSchema } from '../domain/loading/loading-state-schema';
import {
  CONVERSATION_STORAGE_PREFIX,
  LOADING_STORAGE_PREFIX,
  buildConversationStorageKey,
  buildLoadingStorageKey,
} from '../shared/storage-keys';

type ChromeLocalAdapter = ReturnType<typeof import('./chrome-local-adapter').createChromeLocalAdapter>;
type LoadingStateRecord = z.infer<typeof loadingStateRecordSchema>;

/** 规范化用户消息展示文本，避免把与真实内容相同的值重复落库。 */
const toDisplayContentPatch = (content: string, displayContent?: string) =>
  displayContent && displayContent !== content ? { displayContent } : {};

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

/** 会话仓储，负责 conversation 和 loading 的持久化。 */
export const createConversationRepository = (storage: ChromeLocalAdapter) => createStorageRepository(storage, (storage) => {
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
  /** 空会话不保留占位记录，避免把“未持久化轮次”误判为已有历史。 */
  const persistConversationOrRemove = async (conversation: ConversationRecord) => {
    if (conversation.messages.length === 0) {
      await storage.remove(getConversationKey(conversation.normalizedUrl, conversation.promptTabId));
      return null;
    }
    return persistConversation(conversation);
  };
  /** 读取或创建 conversation。 */
  const getOrCreateConversation = async (
    normalizedUrl: string,
    promptTabId: string,
    now: number,
  ): Promise<ConversationRecord> => readConversation(normalizedUrl, promptTabId).then((value) => value ?? createEmptyConversation(normalizedUrl, promptTabId, now));
  /** 读取全部 conversation 记录。 */
  const getAllConversations = async () => {
    const all = await storage.getByPrefix(CONVERSATION_STORAGE_PREFIX);
    return Object.entries(all)
      .filter(([key]) => key.startsWith(CONVERSATION_STORAGE_PREFIX))
      .map(([, value]) => conversationRecordSchema.parse(value));
  };
  /** 读取全部 loading 记录。 */
  const getAllLoadingStates = async () => {
    const all = await storage.getByPrefix(LOADING_STORAGE_PREFIX);
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
      initialBranches,
      selectedBranchId,
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
      /** 新助手消息的初始分支。 */
      initialBranches: InitialBranchSeed[];
      /** 当前选中的主分支。 */
      selectedBranchId: string;
      /** 当前时间。 */
      now: number;
    }) {
      const conversation = await getOrCreateConversation(normalizedUrl, promptTabId, now);
      requireUserMessage(conversation, messageId);
      const targetIndex = conversation.messages.findIndex((message) => message.id === messageId);
      const preservedMessages = conversation.messages.slice(0, targetIndex + 1).map((message) =>
        message.id === messageId
          ? (() => {
              const { displayContent: _displayContent, ...nextMessage } = message;
              return {
                ...nextMessage,
                content,
                editedAt: now,
                updatedAt: now,
              };
            })()
          : message,
      );
      const nextMessages = [
        ...preservedMessages,
        createLoadingAssistantMessage({
          messageId: newAssistantMessageId,
          branches: initialBranches,
          selectedBranchId,
          retryFromMessageId: null,
          now,
        }),
      ];
      const next = withConversationMessages(conversation, nextMessages, now);
      return persistConversation(next);
    },

    /** 按目标消息裁剪其后的全部结果。 */
    async truncateMessagesAfter({
      normalizedUrl,
      promptTabId,
      messageId,
      now,
    }: {
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 保留到该消息。 */
      messageId: string;
      /** 当前时间。 */
      now: number;
    }) {
      const conversation = await getOrCreateConversation(normalizedUrl, promptTabId, now);
      const targetIndex = conversation.messages.findIndex((message) => message.id === messageId);
      if (targetIndex < 0) {
        throw new Error(`message not found: ${messageId}`);
      }
      const nextMessages = conversation.messages.slice(0, targetIndex + 1);
      const next = withConversationMessages(conversation, nextMessages, now);
      return persistConversation(next);
    },

    /** 重试目标助手消息，并用新的助手消息替换旧助手消息及其后续结果。 */
    async retryAssistantMessage({
      normalizedUrl,
      promptTabId,
      messageId,
      newAssistantMessageId,
      initialBranches,
      selectedBranchId,
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
      /** 新助手消息的初始分支。 */
      initialBranches: InitialBranchSeed[];
      /** 当前选中的主分支。 */
      selectedBranchId: string;
      /** 当前时间。 */
      now: number;
    }) {
      const conversation = await getOrCreateConversation(normalizedUrl, promptTabId, now);
      requireAssistantMessage(conversation, messageId);
      const targetIndex = conversation.messages.findIndex((message) => message.id === messageId);
      const preservedMessages = conversation.messages.slice(0, targetIndex);
      const nextMessages = [
        ...preservedMessages,
        createLoadingAssistantMessage({
          messageId: newAssistantMessageId,
          branches: initialBranches,
          selectedBranchId,
          retryFromMessageId: messageId,
          now,
        }),
      ];
      const next = withConversationMessages(conversation, nextMessages, now);
      return persistConversation(next);
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

    /** 标记主请求的大模型调用开始时间。 */
    async markLoadingStateStarted({
      normalizedUrl,
      promptTabId,
      startedAt,
      now,
    }: {
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 大模型调用开始时间。 */
      startedAt: number;
      /** 当前更新时间。 */
      now: number;
    }) {
      const current = await readLoadingState(normalizedUrl, promptTabId);
      if (!current) {
        return null;
      }

      const next = loadingStateRecordSchema.parse({
        ...current,
        startedAt,
        updatedAt: now,
      });
      await storage.set({ [getLoadingKey(normalizedUrl, promptTabId)]: next });
      return next;
    },

    /** 按消息 id 回滚刚创建的一轮消息。 */
    async rollbackTurnMessages({
      normalizedUrl,
      promptTabId,
      userMessageId,
      assistantMessageId,
      now,
    }: {
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 目标用户消息 id。 */
      userMessageId: string;
      /** 目标助手消息 id。 */
      assistantMessageId: string;
      /** 当前时间。 */
      now: number;
    }) {
      const conversation = await readConversation(normalizedUrl, promptTabId);
      if (!conversation) {
        return null;
      }
      const nextMessages = conversation.messages.filter((message) => message.id !== userMessageId && message.id !== assistantMessageId);
      const nextConversation = withConversationMessages(conversation, nextMessages, now);
      return persistConversationOrRemove(nextConversation);
    },

    /** 追加用户消息。 */
    async appendUserMessage({
      normalizedUrl,
      promptTabId,
      messageId,
      content,
      displayContent,
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
      /** 用户消息展示文本。 */
      displayContent?: string;
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
            ...toDisplayContentPatch(content, displayContent),
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
      initialBranches,
      selectedBranchId,
      now,
    }: {
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 新消息 id。 */
      messageId: string;
      /** 初始分支列表。 */
      initialBranches: InitialBranchSeed[];
      /** 当前选中的主分支。 */
      selectedBranchId: string;
      /** 当前时间。 */
      now: number;
    }) {
      const conversation = await getOrCreateConversation(normalizedUrl, promptTabId, now);
      const next = withConversationMessages(conversation, [
        ...conversation.messages,
        createLoadingAssistantMessage({
          messageId,
          branches: initialBranches,
          selectedBranchId,
          retryFromMessageId: null,
          now,
        }),
      ], now);
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
      return persistConversation(transitionAssistantBranch(conversation, messageId, undefined, { type: 'chunk', chunk }, now));
    },

    /** 收敛助手消息为完成态。 */
    async finishAssistantMessage({
      normalizedUrl,
      promptTabId,
      messageId,
      durationMs,
      now,
    }: {
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 助手消息 id。 */
      messageId: string;
      /** 本次调用从发起到本地消费完流的耗时。 */
      durationMs: number | null;
      /** 当前时间。 */
      now: number;
    }) {
      const conversation = await getOrCreateConversation(normalizedUrl, promptTabId, now);
      return persistConversation(transitionAssistantBranch(conversation, messageId, undefined, { type: 'done', durationMs }, now));
    },

    /** 收敛助手消息为失败或取消态。 */
    async failAssistantMessage({
      normalizedUrl,
      promptTabId,
      messageId,
      errorMessage,
      status,
      durationMs,
      now,
    }: {
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 助手消息 id。 */
      messageId: string;
      /** 失败原因。 */
      errorMessage: string | null;
      /** 最终失败状态。 */
      status: 'error' | 'cancelled';
      /** 本次调用从发起到本地消费完流的耗时。 */
      durationMs: number | null;
      /** 当前时间。 */
      now: number;
    }) {
      const conversation = await getOrCreateConversation(normalizedUrl, promptTabId, now);
      return persistConversation(transitionAssistantBranch(conversation, messageId, undefined, { type: status, errorMessage, durationMs }, now));
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
      const conversation = await getOrCreateConversation(normalizedUrl, promptTabId, now);
      return persistConversation(appendAssistantBranch(conversation, messageId, { id: branchId, modelId, modelLabel, isPrimary: false }, now));
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
      const conversation = await getOrCreateConversation(normalizedUrl, promptTabId, now);
      return persistConversation(transitionAssistantBranch(conversation, messageId, branchId, { type: 'chunk', chunk }, now));
    },

    /** 收敛分支为完成态。 */
    async finishAssistantBranch({
      normalizedUrl,
      promptTabId,
      messageId,
      branchId,
      durationMs,
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
      /** 本次调用从发起到本地消费完流的耗时。 */
      durationMs: number | null;
      /** 当前时间。 */
      now: number;
    }) {
      const conversation = await getOrCreateConversation(normalizedUrl, promptTabId, now);
      return persistConversation(transitionAssistantBranch(conversation, messageId, branchId, { type: 'done', durationMs }, now));
    },

    /** 收敛分支为失败或取消态。 */
    async failAssistantBranch({
      normalizedUrl,
      promptTabId,
      messageId,
      branchId,
      errorMessage,
      status,
      durationMs,
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
      errorMessage: string | null;
      /** 最终状态。 */
      status: 'error' | 'cancelled';
      /** 本次调用从发起到本地消费完流的耗时。 */
      durationMs: number | null;
      /** 当前时间。 */
      now: number;
    }) {
      const conversation = await getOrCreateConversation(normalizedUrl, promptTabId, now);
      return persistConversation(transitionAssistantBranch(conversation, messageId, branchId, { type: status, errorMessage, durationMs }, now));
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
      const conversation = await getOrCreateConversation(normalizedUrl, promptTabId, now);
      return persistConversationOrRemove(deleteAssistantBranch(conversation, messageId, branchId, now));
    },

    /** 重置单个助手分支为 loading。 */
    async restartAssistantBranch({
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
      /** 分支 id。 */
      branchId: string;
      /** 当前时间。 */
      now: number;
    }) {
      const conversation = await getOrCreateConversation(normalizedUrl, promptTabId, now);
      return persistConversation(transitionAssistantBranch(conversation, messageId, branchId, { type: 'restart' }, now));
    },

    /** 更新当前轮的主分支选择。 */
    async selectAssistantBranch({
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
      /** 新主分支 id。 */
      branchId: string;
      /** 当前时间。 */
      now: number;
    }) {
      const conversation = await getOrCreateConversation(normalizedUrl, promptTabId, now);
      return persistConversation(selectAssistantBranch(conversation, messageId, branchId, now));
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
      startedAt,
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
      /** 分支请求的大模型调用开始时间。 */
      startedAt?: number | null;
      /** 当前时间。 */
      now: number;
    }) {
      const current = await readLoadingState(normalizedUrl, promptTabId);
      const currentBranch = current?.branchStates.find((item) => item.branchId === branchId) ?? null;
      const next = loadingStateRecordSchema.parse({
        id: getLoadingKey(normalizedUrl, promptTabId),
        normalizedUrl,
        promptTabId,
	          sessionId: current?.sessionId ?? sessionId,
	          promptTabStatus: current?.promptTabStatus ?? 'idle',
	          startedAt: current?.startedAt ?? null,
	          branchStates: [
          ...(current?.branchStates.filter((item) => item.branchId !== branchId) ?? []),
          {
            branchId,
            status,
            modelId,
            startedAt: startedAt ?? currentBranch?.startedAt ?? null,
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
    },

    /** 删除单个分支 loading。 */
    async removeBranchLoadingState(normalizedUrl: string, promptTabId: string, branchId: string) {
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
    },

    /** 按页面列出 conversation。 */
    async listPageConversations(normalizedUrl: string) {
      const all = await storage.getByPrefix(`${CONVERSATION_STORAGE_PREFIX}${normalizedUrl}:`);
      return Object.entries(all)
        .filter(([key]) => matchesPageScopedKey(key, CONVERSATION_STORAGE_PREFIX, normalizedUrl))
        .map(([, value]) => conversationRecordSchema.parse(value));
    },

    /** 读取全部 conversation。 */
    async getAllConversations() {
      return getAllConversations();
    },

    /** 按页面列出 loading 状态。 */
    async listPageLoadingStates(normalizedUrl: string) {
      const all = await storage.getByPrefix(`${LOADING_STORAGE_PREFIX}${normalizedUrl}:`);
      return Object.entries(all)
        .filter(([key]) => matchesPageScopedKey(key, LOADING_STORAGE_PREFIX, normalizedUrl))
        .map(([, value]) => loadingStateRecordSchema.parse(value));
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
});
