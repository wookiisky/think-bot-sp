import { resolvePromptTabBranchModelIds } from '../../domain/config/config-schema';
import type { ExtensionConfig, ModelConfig } from '../../domain/config/config-schema';
import { createLoadingState } from '../../domain/loading/loading-state-schema';
import type { ResolvedProviderModel } from './provider-registry';

type ChatDispatchInput = {
  /** 归一化页面 URL。 */
  normalizedUrl: string;
  /** promptTab 稳定 id。 */
  promptTabId: string;
  /** 用户选择的模型 id。 */
  modelId: string;
  /** 用户文本。 */
  content: string;
  /** 用户附带图片。 */
  images: string[];
  /** 当前请求真正附带的页面正文。 */
  pageContent: string;
};

type ChatStreamEvent =
  | {
      /** 事件类型。 */
      type: 'CHAT_STREAM_STARTED';
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 本次流式会话 id。 */
      sessionId: string;
      /** 助手消息 id。 */
      messageId: string;
    }
  | {
      /** 事件类型。 */
      type: 'BRANCH_STREAM_STARTED';
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 本次流式会话 id。 */
      sessionId: string;
      /** 助手消息 id。 */
      messageId: string;
      /** 分支稳定 id。 */
      branchId: string;
      /** 分支模型 id。 */
      modelId: string;
      /** 分支模型展示名。 */
      modelLabel: string;
    }
  | {
      /** 事件类型。 */
      type: 'BRANCH_STREAM_CHUNK';
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 本次流式会话 id。 */
      sessionId: string;
      /** 助手消息 id。 */
      messageId: string;
      /** 分支稳定 id。 */
      branchId: string;
      /** 增量文本。 */
      chunk: string;
    }
  | {
      /** 事件类型。 */
      type: 'BRANCH_STREAM_FINISHED';
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 本次流式会话 id。 */
      sessionId: string;
      /** 助手消息 id。 */
      messageId: string;
      /** 分支稳定 id。 */
      branchId: string;
    }
  | {
      /** 事件类型。 */
      type: 'BRANCH_STREAM_FAILED';
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 本次流式会话 id。 */
      sessionId: string;
      /** 助手消息 id。 */
      messageId: string;
      /** 分支稳定 id。 */
      branchId: string;
      /** 错误消息。 */
      errorMessage: string;
    }
  | {
      /** 事件类型。 */
      type: 'BRANCH_STREAM_CANCELLED';
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 本次流式会话 id。 */
      sessionId: string;
      /** 助手消息 id。 */
      messageId: string;
      /** 分支稳定 id。 */
      branchId: string;
    }
  | {
      /** 事件类型。 */
      type: 'CHAT_STREAM_CHUNK';
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 本次流式会话 id。 */
      sessionId: string;
      /** 助手消息 id。 */
      messageId: string;
      /** 增量文本。 */
      chunk: string;
    }
  | {
      /** 事件类型。 */
      type: 'CHAT_STREAM_FINISHED';
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 本次流式会话 id。 */
      sessionId: string;
      /** 助手消息 id。 */
      messageId: string;
    }
  | {
      /** 事件类型。 */
      type: 'CHAT_STREAM_FAILED';
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 本次流式会话 id。 */
      sessionId: string;
      /** 助手消息 id。 */
      messageId: string;
      /** 错误消息。 */
      errorMessage: string;
    }
  | {
      /** 事件类型。 */
      type: 'CHAT_STREAM_CANCELLED';
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 本次流式会话 id。 */
      sessionId: string;
      /** 助手消息 id。 */
      messageId: string;
    };

type ChatStreamResult = {
  /** 本次流式会话 id。 */
  sessionId: string;
  /** 助手消息 id。 */
  messageId: string;
  /** 最终状态。 */
  status: 'done' | 'error' | 'cancelled';
  /** 错误消息。 */
  errorMessage: string | null;
};

type StreamTextResult = {
  /** 文本增量流。 */
  textStream: AsyncIterable<string>;
};

type StreamSession = {
  /** 本次流式会话 id。 */
  sessionId: string;
  /** 当前主回答对应的用户消息 id。 */
  userMessageId?: string | null;
  /** 助手消息 id。 */
  messageId: string;
  /** 请求取消。 */
  cancel: () => void;
  /** 等待生命周期结束。 */
  done: Promise<ChatStreamResult>;
};

type BranchStreamSession = StreamSession & {
  /** 分支稳定 id。 */
  branchId: string;
};

type ChatDispatchServiceDeps = {
  /** 配置仓储。 */
  configRepository: {
    /** 读取完整配置。 */
    getConfig: () => Promise<ExtensionConfig>;
    /** 按 id 读取模型。 */
    getModelById: (_modelId: string) => Promise<ModelConfig | null>;
  };
  /** provider 解析器。 */
  providerRegistry: {
    /** 解析 provider 模型。 */
    resolveProviderModel: (_model: ModelConfig) => ResolvedProviderModel;
  };
  /** 会话仓储。 */
  conversationRepository: {
    /** 保存 loading 状态。 */
    saveLoadingState: (_value: unknown) => Promise<unknown>;
    /** 删除 loading 状态。 */
    removeLoadingState: (_normalizedUrl: string, _promptTabId: string) => Promise<void>;
    /** 追加用户消息。 */
    appendUserMessage: (_input: {
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
    }) => Promise<unknown>;
    /** 追加助手消息。 */
    appendAssistantMessage: (_input: {
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
    }) => Promise<unknown>;
    /** 追加助手 chunk。 */
    appendAssistantChunk: (_input: {
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 助手消息 id。 */
      messageId: string;
      /** 增量文本。 */
      chunk: string;
      /** 当前时间。 */
      now: number;
    }) => Promise<unknown>;
    /** 完成助手消息。 */
    finishAssistantMessage: (_input: {
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 助手消息 id。 */
      messageId: string;
      /** 当前时间。 */
      now: number;
    }) => Promise<unknown>;
    /** 标记助手消息失败。 */
    failAssistantMessage: (_input: {
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 助手消息 id。 */
      messageId: string;
      /** 错误消息。 */
      errorMessage: string;
      /** 最终状态。 */
      status: 'error' | 'cancelled';
      /** 当前时间。 */
      now: number;
    }) => Promise<unknown>;
    /** 读取单个会话。 */
    getConversation: (_normalizedUrl: string, _promptTabId: string) => Promise<{
      messages: Array<{
        id: string;
        role: 'user' | 'assistant' | 'system';
        content: string;
        images: string[];
        status: 'loading' | 'done' | 'error' | 'cancelled';
        errorMessage: string | null;
        modelId: string | null;
        branches: Array<{
          id: string;
          modelId: string;
          modelLabel: string;
          content: string;
          status: 'loading' | 'done' | 'error' | 'cancelled';
          errorMessage: string | null;
          createdAt: number;
          updatedAt: number;
        }>;
        retryFromMessageId: string | null;
        editedAt: number | null;
        createdAt: number;
        updatedAt: number;
      }>;
    } | null>;
    /** 编辑用户消息并裁剪后续结果，同时插入新的助手占位。 */
    editUserMessage: (_input: {
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
    }) => Promise<unknown>;
    /** 重试目标助手消息，并用新的助手消息替换旧结果。 */
    retryAssistantMessage: (_input: {
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
    }) => Promise<unknown>;
    /** 追加助手分支。 */
    appendAssistantBranch: (_input: {
      normalizedUrl: string;
      promptTabId: string;
      messageId: string;
      branchId: string;
      modelId: string;
      modelLabel: string;
      now: number;
    }) => Promise<unknown>;
    /** 追加分支 chunk。 */
    appendAssistantBranchChunk: (_input: {
      normalizedUrl: string;
      promptTabId: string;
      messageId: string;
      branchId: string;
      chunk: string;
      now: number;
    }) => Promise<unknown>;
    /** 完成分支。 */
    finishAssistantBranch: (_input: {
      normalizedUrl: string;
      promptTabId: string;
      messageId: string;
      branchId: string;
      now: number;
    }) => Promise<unknown>;
    /** 标记分支失败。 */
    failAssistantBranch: (_input: {
      normalizedUrl: string;
      promptTabId: string;
      messageId: string;
      branchId: string;
      errorMessage: string;
      status: 'error' | 'cancelled';
      now: number;
    }) => Promise<unknown>;
    /** 写入分支 loading。 */
    upsertBranchLoadingState: (_input: {
      normalizedUrl: string;
      promptTabId: string;
      sessionId: string;
      messageId: string;
      branchId: string;
      modelId: string;
      status: 'loading' | 'cancelled' | 'error';
      now: number;
    }) => Promise<unknown>;
    /** 删除分支 loading。 */
    removeBranchLoadingState: (_normalizedUrl: string, _promptTabId: string, _branchId: string) => Promise<void>;
  };
  /** port 总线。 */
  portBus: {
    /** 向 promptTab 推送事件。 */
    publishToPromptTab: (_event: ChatStreamEvent) => void;
  };
  /** 启动流式请求。 */
  streamText: (_input: {
    /** AI SDK 模型对象。 */
    model: unknown;
    /** 对话消息。 */
    messages: Array<{
      /** 消息角色。 */
      role: 'user';
      /** 用户文本。 */
      content: string;
      /** 用户附带图片。 */
      images: string[];
    }>;
    /** 取消信号。 */
    abortSignal: AbortSignal;
  }) => Promise<StreamTextResult>;
  /** 结构化日志。 */
  logger?: {
    /** info 级别日志。 */
    info: (_event: string, _payload?: Record<string, unknown>) => void;
    /** warn 级别日志。 */
    warn: (_event: string, _payload?: Record<string, unknown>) => void;
    /** error 级别日志。 */
    error: (_event: string, _payload?: Record<string, unknown>) => void;
  };
  /** 生成会话 id。 */
  createSessionId?: () => string;
  /** 生成消息 id。 */
  createMessageId?: () => string;
  /** 获取当前时间。 */
  now?: () => number;
};

/** 判断是否为取消错误。 */
const isAbortError = (error: unknown): boolean =>
  error instanceof Error && (error.name === 'AbortError' || error.message === 'aborted');

/** 统一提取错误文本。 */
const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message.trim() ? error.message : fallback;

/** 构造实际发给模型的用户消息。 */
const buildPromptContent = (input: Pick<ChatDispatchInput, 'content' | 'pageContent'>): string =>
  input.pageContent.trim() ? `页面内容：\n${input.pageContent}\n\n用户消息：${input.content}` : input.content;

/** 为目标助手消息重建最小上下文，当前只复用其之前的用户消息。 */
const buildUserMessagesBeforeAssistant = (
  conversation: NonNullable<Awaited<ReturnType<ChatDispatchServiceDeps['conversationRepository']['getConversation']>>>,
  targetMessageId: string,
) => {
  const targetIndex = conversation.messages.findIndex((message) => message.id === targetMessageId && message.role === 'assistant');
  if (targetIndex < 0) {
    throw new Error(`assistant message not found: ${targetMessageId}`);
  }

  const messages = conversation.messages
    .slice(0, targetIndex)
    .filter((message): message is Extract<typeof message, { role: 'user' }> => message.role === 'user')
    .map((message) => ({
      role: 'user' as const,
      content: message.content,
      images: message.images,
    }));
  if (messages.length === 0) {
    throw new Error(`user context not found for assistant message: ${targetMessageId}`);
  }
  return messages;
};

/** 为目标用户消息重建最小上下文，包含该用户消息本身。 */
const buildUserMessagesThroughUser = (
  conversation: NonNullable<Awaited<ReturnType<ChatDispatchServiceDeps['conversationRepository']['getConversation']>>>,
  targetMessageId: string,
  replacementContent?: string,
) => {
  const targetIndex = conversation.messages.findIndex((message) => message.id === targetMessageId && message.role === 'user');
  if (targetIndex < 0) {
    throw new Error(`user message not found: ${targetMessageId}`);
  }

  const messages = conversation.messages
    .slice(0, targetIndex + 1)
    .filter((message): message is Extract<typeof message, { role: 'user' }> => message.role === 'user')
    .map((message) => ({
      role: 'user' as const,
      content: message.id === targetMessageId && replacementContent !== undefined ? replacementContent : message.content,
      images: message.images,
    }));
  if (messages.length === 0) {
    throw new Error(`user context not found for user message: ${targetMessageId}`);
  }
  return messages;
};

/** 主聊天流调度服务。 */
export const createChatDispatchService = (deps: ChatDispatchServiceDeps) => {
  const createSessionId = deps.createSessionId ?? (() => crypto.randomUUID());
  const createMessageId = deps.createMessageId ?? (() => crypto.randomUUID());
  const now = deps.now ?? (() => Date.now());
  const logger = deps.logger ?? {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
  /** port 推送是边缘副作用，失败不能反向污染已落库结果。 */
  const publishToPromptTabSafely = (event: ChatStreamEvent) => {
    try {
      deps.portBus.publishToPromptTab(event);
    } catch {
      // port 断开或监听方异常时，恢复链路仍以持久化状态为准。
    }
  };

  return {
    /** 启动一次主聊天流。 */
    async dispatchChat(input: ChatDispatchInput): Promise<StreamSession> {
      const model = await deps.configRepository.getModelById(input.modelId);
      if (!model) {
        throw new Error(`model not found: ${input.modelId}`);
      }

      const resolvedModel = deps.providerRegistry.resolveProviderModel(model);
      if (input.images.length > 0 && !resolvedModel.supportsImages) {
        throw new Error('model does not support images');
      }

      const sessionId = createSessionId();
      const userMessageId = createMessageId();
      const assistantMessageId = createMessageId();
      const abortController = new AbortController();
      const getLifecycleScope = () => ({
        normalizedUrl: input.normalizedUrl,
        promptTabId: input.promptTabId,
        messageId: assistantMessageId,
      });
      /** setup 失败后，尽力把 assistant 从 loading 收敛到 error。 */
      const compensateSetupFailure = async (error: unknown) => {
        const errorMessage = getErrorMessage(error, 'chat dispatch failed');
        try {
          await deps.conversationRepository.failAssistantMessage({
            ...getLifecycleScope(),
            errorMessage,
            status: 'error',
            now: now(),
          });
        } catch {
          // 补偿失败时保留原始 setup 错误，避免二次覆盖。
        }
      };
      /** loading 清理是边缘副作用，失败不能覆盖主生命周期结果。 */
      const removeLoadingStateSafely = async () => {
        try {
          await deps.conversationRepository.removeLoadingState(input.normalizedUrl, input.promptTabId);
        } catch {
          // 清理失败只允许留下残留状态，不允许把主结果改成 reject。
        }
      };

      let assistantMessageCreated = false;
      try {
        await deps.conversationRepository.appendUserMessage({
          normalizedUrl: input.normalizedUrl,
          promptTabId: input.promptTabId,
          messageId: userMessageId,
          content: input.content,
          images: input.images,
          now: now(),
        });
        await deps.conversationRepository.appendAssistantMessage({
          normalizedUrl: input.normalizedUrl,
          promptTabId: input.promptTabId,
          messageId: assistantMessageId,
          modelId: model.id,
          now: now(),
        });
        assistantMessageCreated = true;
        await deps.conversationRepository.saveLoadingState(
          createLoadingState({
            normalizedUrl: input.normalizedUrl,
            promptTabId: input.promptTabId,
            sessionId,
            now: now(),
          }),
        );
      } catch (error) {
        if (assistantMessageCreated) {
          await compensateSetupFailure(error);
        }
        await removeLoadingStateSafely();
        throw error;
      }

      const done = (async (): Promise<ChatStreamResult> => {
        let result: ChatStreamResult;
        let hasLoggedFirstChunk = false;
        try {
          logger.info('chat.stream.started', {
            normalizedUrl: input.normalizedUrl,
            promptTab: input.promptTabId,
            sessionId,
            messageId: assistantMessageId,
            provider: resolvedModel.providerId,
          });
          publishToPromptTabSafely({
            type: 'CHAT_STREAM_STARTED',
            normalizedUrl: input.normalizedUrl,
            promptTabId: input.promptTabId,
            sessionId,
            messageId: assistantMessageId,
          });

          const response = await deps.streamText({
            model: resolvedModel.sdkModel,
            messages: [
              {
                role: 'user',
                content: buildPromptContent(input),
                images: input.images,
              },
            ],
            abortSignal: abortController.signal,
          });

          for await (const chunk of response.textStream) {
            if (!hasLoggedFirstChunk) {
              hasLoggedFirstChunk = true;
              logger.info('chat.stream.first_chunk', {
                normalizedUrl: input.normalizedUrl,
                promptTab: input.promptTabId,
                sessionId,
                messageId: assistantMessageId,
              });
            }
            await deps.conversationRepository.appendAssistantChunk({
              normalizedUrl: input.normalizedUrl,
              promptTabId: input.promptTabId,
              messageId: assistantMessageId,
              chunk,
              now: now(),
            });
            publishToPromptTabSafely({
              type: 'CHAT_STREAM_CHUNK',
              normalizedUrl: input.normalizedUrl,
              promptTabId: input.promptTabId,
              sessionId,
              messageId: assistantMessageId,
              chunk,
            });
          }

          await deps.conversationRepository.finishAssistantMessage({
            normalizedUrl: input.normalizedUrl,
            promptTabId: input.promptTabId,
            messageId: assistantMessageId,
            now: now(),
          });
          publishToPromptTabSafely({
            type: 'CHAT_STREAM_FINISHED',
            normalizedUrl: input.normalizedUrl,
            promptTabId: input.promptTabId,
            sessionId,
            messageId: assistantMessageId,
          });
          logger.info('chat.stream.completed', {
            normalizedUrl: input.normalizedUrl,
            promptTab: input.promptTabId,
            sessionId,
            messageId: assistantMessageId,
          });
          result = {
            sessionId,
            messageId: assistantMessageId,
            status: 'done',
            errorMessage: null,
          };
        } catch (error) {
          const status = isAbortError(error) ? 'cancelled' : 'error';
          const errorMessage = status === 'cancelled' ? 'stream cancelled' : getErrorMessage(error, 'chat dispatch failed');

          await deps.conversationRepository.failAssistantMessage({
            normalizedUrl: input.normalizedUrl,
            promptTabId: input.promptTabId,
            messageId: assistantMessageId,
            errorMessage,
            status,
            now: now(),
          });

          if (status === 'cancelled') {
            logger.info('chat.stream.cancelled', {
              normalizedUrl: input.normalizedUrl,
              promptTab: input.promptTabId,
              sessionId,
              messageId: assistantMessageId,
            });
            publishToPromptTabSafely({
              type: 'CHAT_STREAM_CANCELLED',
              normalizedUrl: input.normalizedUrl,
              promptTabId: input.promptTabId,
              sessionId,
              messageId: assistantMessageId,
            });
          } else {
            logger.error('chat.stream.failed', {
              normalizedUrl: input.normalizedUrl,
              promptTab: input.promptTabId,
              sessionId,
              messageId: assistantMessageId,
              reason: errorMessage,
            });
            publishToPromptTabSafely({
              type: 'CHAT_STREAM_FAILED',
              normalizedUrl: input.normalizedUrl,
              promptTabId: input.promptTabId,
              sessionId,
              messageId: assistantMessageId,
              errorMessage,
            });
          }

          result = {
            sessionId,
            messageId: assistantMessageId,
            status,
            errorMessage,
          };
        }
        await removeLoadingStateSafely();
        return result;
      })();

      return {
        sessionId,
        userMessageId,
        messageId: assistantMessageId,
        cancel: () => {
          abortController.abort();
        },
        done,
      };
    },

    /** 编辑用户消息并裁剪其后结果，再重新生成主回答。 */
    async editUserMessage(input: {
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 目标用户消息 id。 */
      messageId: string;
      /** 编辑后的用户文本。 */
      content: string;
    }): Promise<StreamSession> {
      const conversation = await deps.conversationRepository.getConversation(input.normalizedUrl, input.promptTabId);
      if (!conversation) {
        throw new Error('conversation not found');
      }

      const targetIndex = conversation.messages.findIndex((message) => message.id === input.messageId && message.role === 'user');
      if (targetIndex < 0) {
        throw new Error(`user message not found: ${input.messageId}`);
      }

      const nextAssistantMessage = conversation.messages
        .slice(targetIndex + 1)
        .find((message) => message.role === 'assistant') ?? null;
      const modelId = nextAssistantMessage?.modelId ?? null;
      if (!modelId) {
        throw new Error(`assistant model not found after user message: ${input.messageId}`);
      }

      const model = await deps.configRepository.getModelById(modelId);
      if (!model) {
        throw new Error(`model not found: ${modelId}`);
      }

      const streamMessages = buildUserMessagesThroughUser(conversation, input.messageId, input.content);
      const resolvedModel = deps.providerRegistry.resolveProviderModel(model);
      const sessionId = createSessionId();
      const assistantMessageId = createMessageId();
      const abortController = new AbortController();
      const removeLoadingStateSafely = async () => {
        try {
          await deps.conversationRepository.removeLoadingState(input.normalizedUrl, input.promptTabId);
        } catch {
          // 清理失败只允许留下残留状态，不允许把主结果改成 reject。
        }
      };

      await deps.conversationRepository.editUserMessage({
        normalizedUrl: input.normalizedUrl,
        promptTabId: input.promptTabId,
        messageId: input.messageId,
        content: input.content,
        newAssistantMessageId: assistantMessageId,
        modelId: model.id,
        now: now(),
      });
      await deps.conversationRepository.saveLoadingState(
        createLoadingState({
          normalizedUrl: input.normalizedUrl,
          promptTabId: input.promptTabId,
          sessionId,
          now: now(),
        }),
      );

      const done = (async (): Promise<ChatStreamResult> => {
        let result: ChatStreamResult;
        let hasLoggedFirstChunk = false;
        try {
          logger.info('chat.stream.started', {
            normalizedUrl: input.normalizedUrl,
            promptTab: input.promptTabId,
            sessionId,
            messageId: assistantMessageId,
            provider: resolvedModel.providerId,
          });
          publishToPromptTabSafely({
            type: 'CHAT_STREAM_STARTED',
            normalizedUrl: input.normalizedUrl,
            promptTabId: input.promptTabId,
            sessionId,
            messageId: assistantMessageId,
          });
          const response = await deps.streamText({
            model: resolvedModel.sdkModel,
            messages: streamMessages,
            abortSignal: abortController.signal,
          });

          for await (const chunk of response.textStream) {
            if (!hasLoggedFirstChunk) {
              hasLoggedFirstChunk = true;
              logger.info('chat.stream.first_chunk', {
                normalizedUrl: input.normalizedUrl,
                promptTab: input.promptTabId,
                sessionId,
                messageId: assistantMessageId,
              });
            }
            await deps.conversationRepository.appendAssistantChunk({
              normalizedUrl: input.normalizedUrl,
              promptTabId: input.promptTabId,
              messageId: assistantMessageId,
              chunk,
              now: now(),
            });
            publishToPromptTabSafely({
              type: 'CHAT_STREAM_CHUNK',
              normalizedUrl: input.normalizedUrl,
              promptTabId: input.promptTabId,
              sessionId,
              messageId: assistantMessageId,
              chunk,
            });
          }

          await deps.conversationRepository.finishAssistantMessage({
            normalizedUrl: input.normalizedUrl,
            promptTabId: input.promptTabId,
            messageId: assistantMessageId,
            now: now(),
          });
          publishToPromptTabSafely({
            type: 'CHAT_STREAM_FINISHED',
            normalizedUrl: input.normalizedUrl,
            promptTabId: input.promptTabId,
            sessionId,
            messageId: assistantMessageId,
          });
          logger.info('chat.stream.completed', {
            normalizedUrl: input.normalizedUrl,
            promptTab: input.promptTabId,
            sessionId,
            messageId: assistantMessageId,
          });
          result = {
            sessionId,
            messageId: assistantMessageId,
            status: 'done',
            errorMessage: null,
          };
        } catch (error) {
          const status = isAbortError(error) ? 'cancelled' : 'error';
          const errorMessage = status === 'cancelled' ? 'stream cancelled' : getErrorMessage(error, 'chat dispatch failed');
          await deps.conversationRepository.failAssistantMessage({
            normalizedUrl: input.normalizedUrl,
            promptTabId: input.promptTabId,
            messageId: assistantMessageId,
            errorMessage,
            status,
            now: now(),
          });
          publishToPromptTabSafely({
            type: status === 'cancelled' ? 'CHAT_STREAM_CANCELLED' : 'CHAT_STREAM_FAILED',
            normalizedUrl: input.normalizedUrl,
            promptTabId: input.promptTabId,
            sessionId,
            messageId: assistantMessageId,
            ...(status === 'error' ? { errorMessage } : {}),
          });
          if (status === 'cancelled') {
            logger.info('chat.stream.cancelled', {
              normalizedUrl: input.normalizedUrl,
              promptTab: input.promptTabId,
              sessionId,
              messageId: assistantMessageId,
            });
          } else {
            logger.error('chat.stream.failed', {
              normalizedUrl: input.normalizedUrl,
              promptTab: input.promptTabId,
              sessionId,
              messageId: assistantMessageId,
              reason: errorMessage,
            });
          }
          result = {
            sessionId,
            messageId: assistantMessageId,
            status,
            errorMessage,
          };
        }

        await removeLoadingStateSafely();
        return result;
      })();

      return {
        sessionId,
        messageId: assistantMessageId,
        cancel: () => {
          abortController.abort();
        },
        done,
      };
    },

    /** 重试目标助手消息，并用新的助手消息替换旧结果。 */
    async retryMessage(input: {
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 被替换的旧助手消息 id。 */
      messageId: string;
    }): Promise<StreamSession> {
      const conversation = await deps.conversationRepository.getConversation(input.normalizedUrl, input.promptTabId);
      if (!conversation) {
        throw new Error('conversation not found');
      }

      const targetMessage = conversation.messages.find((message) => message.id === input.messageId && message.role === 'assistant') ?? null;
      if (!targetMessage) {
        throw new Error(`assistant message not found: ${input.messageId}`);
      }
      if (!targetMessage.modelId) {
        throw new Error(`assistant model not found: ${input.messageId}`);
      }

      const model = await deps.configRepository.getModelById(targetMessage.modelId);
      if (!model) {
        throw new Error(`model not found: ${targetMessage.modelId}`);
      }

      const streamMessages = buildUserMessagesBeforeAssistant(conversation, input.messageId);
      const resolvedModel = deps.providerRegistry.resolveProviderModel(model);
      const sessionId = createSessionId();
      const assistantMessageId = createMessageId();
      const abortController = new AbortController();
      const removeLoadingStateSafely = async () => {
        try {
          await deps.conversationRepository.removeLoadingState(input.normalizedUrl, input.promptTabId);
        } catch {
          // 清理失败只允许留下残留状态，不允许把主结果改成 reject。
        }
      };

      await deps.conversationRepository.retryAssistantMessage({
        normalizedUrl: input.normalizedUrl,
        promptTabId: input.promptTabId,
        messageId: input.messageId,
        newAssistantMessageId: assistantMessageId,
        modelId: model.id,
        now: now(),
      });
      await deps.conversationRepository.saveLoadingState(
        createLoadingState({
          normalizedUrl: input.normalizedUrl,
          promptTabId: input.promptTabId,
          sessionId,
          now: now(),
        }),
      );

      const done = (async (): Promise<ChatStreamResult> => {
        let result: ChatStreamResult;
        let hasLoggedFirstChunk = false;
        try {
          logger.info('chat.stream.started', {
            normalizedUrl: input.normalizedUrl,
            promptTab: input.promptTabId,
            sessionId,
            messageId: assistantMessageId,
            provider: resolvedModel.providerId,
          });
          publishToPromptTabSafely({
            type: 'CHAT_STREAM_STARTED',
            normalizedUrl: input.normalizedUrl,
            promptTabId: input.promptTabId,
            sessionId,
            messageId: assistantMessageId,
          });
          const response = await deps.streamText({
            model: resolvedModel.sdkModel,
            messages: streamMessages,
            abortSignal: abortController.signal,
          });

          for await (const chunk of response.textStream) {
            if (!hasLoggedFirstChunk) {
              hasLoggedFirstChunk = true;
              logger.info('chat.stream.first_chunk', {
                normalizedUrl: input.normalizedUrl,
                promptTab: input.promptTabId,
                sessionId,
                messageId: assistantMessageId,
              });
            }
            await deps.conversationRepository.appendAssistantChunk({
              normalizedUrl: input.normalizedUrl,
              promptTabId: input.promptTabId,
              messageId: assistantMessageId,
              chunk,
              now: now(),
            });
            publishToPromptTabSafely({
              type: 'CHAT_STREAM_CHUNK',
              normalizedUrl: input.normalizedUrl,
              promptTabId: input.promptTabId,
              sessionId,
              messageId: assistantMessageId,
              chunk,
            });
          }

          await deps.conversationRepository.finishAssistantMessage({
            normalizedUrl: input.normalizedUrl,
            promptTabId: input.promptTabId,
            messageId: assistantMessageId,
            now: now(),
          });
          publishToPromptTabSafely({
            type: 'CHAT_STREAM_FINISHED',
            normalizedUrl: input.normalizedUrl,
            promptTabId: input.promptTabId,
            sessionId,
            messageId: assistantMessageId,
          });
          logger.info('chat.stream.completed', {
            normalizedUrl: input.normalizedUrl,
            promptTab: input.promptTabId,
            sessionId,
            messageId: assistantMessageId,
          });
          result = {
            sessionId,
            messageId: assistantMessageId,
            status: 'done',
            errorMessage: null,
          };
        } catch (error) {
          const status = isAbortError(error) ? 'cancelled' : 'error';
          const errorMessage = status === 'cancelled' ? 'stream cancelled' : getErrorMessage(error, 'chat dispatch failed');
          await deps.conversationRepository.failAssistantMessage({
            normalizedUrl: input.normalizedUrl,
            promptTabId: input.promptTabId,
            messageId: assistantMessageId,
            errorMessage,
            status,
            now: now(),
          });
          publishToPromptTabSafely({
            type: status === 'cancelled' ? 'CHAT_STREAM_CANCELLED' : 'CHAT_STREAM_FAILED',
            normalizedUrl: input.normalizedUrl,
            promptTabId: input.promptTabId,
            sessionId,
            messageId: assistantMessageId,
            ...(status === 'error' ? { errorMessage } : {}),
          });
          if (status === 'cancelled') {
            logger.info('chat.stream.cancelled', {
              normalizedUrl: input.normalizedUrl,
              promptTab: input.promptTabId,
              sessionId,
              messageId: assistantMessageId,
            });
          } else {
            logger.error('chat.stream.failed', {
              normalizedUrl: input.normalizedUrl,
              promptTab: input.promptTabId,
              sessionId,
              messageId: assistantMessageId,
              reason: errorMessage,
            });
          }
          result = {
            sessionId,
            messageId: assistantMessageId,
            status,
            errorMessage,
          };
        }

        await removeLoadingStateSafely();
        return result;
      })();

      return {
        sessionId,
        messageId: assistantMessageId,
        cancel: () => {
          abortController.abort();
        },
        done,
      };
    },

    /** 针对既有助手消息继续新增分支。 */
    async expandBranches(input: {
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 目标助手消息 id。 */
      messageId: string;
    }): Promise<BranchStreamSession[]> {
      const [config, conversation] = await Promise.all([
        deps.configRepository.getConfig(),
        deps.conversationRepository.getConversation(input.normalizedUrl, input.promptTabId),
      ]);
      if (!conversation) {
        throw new Error('conversation not found');
      }

      const targetMessage = conversation.messages.find(
        (message) => message.id === input.messageId && message.role === 'assistant',
      );
      if (!targetMessage) {
        throw new Error(`assistant message not found: ${input.messageId}`);
      }

      const branchModelIds = resolvePromptTabBranchModelIds(config, input.promptTabId).filter(
        (modelId) => modelId !== targetMessage.modelId,
      );
      if (branchModelIds.length === 0) {
        throw new Error('no branch models configured');
      }

      const branchMessages = buildUserMessagesBeforeAssistant(conversation, input.messageId);

      return Promise.all(
        branchModelIds.map(async (modelId) => {
          const model = await deps.configRepository.getModelById(modelId);
          if (!model) {
            throw new Error(`model not found: ${modelId}`);
          }

          const resolvedModel = deps.providerRegistry.resolveProviderModel(model);
          const branchId = createMessageId();
          const sessionId = createSessionId();
          const abortController = new AbortController();
          await deps.conversationRepository.appendAssistantBranch({
            normalizedUrl: input.normalizedUrl,
            promptTabId: input.promptTabId,
            messageId: input.messageId,
            branchId,
            modelId,
            modelLabel: resolvedModel.modelLabel,
            now: now(),
          });
          await deps.conversationRepository.upsertBranchLoadingState({
            normalizedUrl: input.normalizedUrl,
            promptTabId: input.promptTabId,
            sessionId,
            messageId: input.messageId,
            branchId,
            modelId,
            status: 'loading',
            now: now(),
          });

          const done = (async (): Promise<ChatStreamResult> => {
            let result: ChatStreamResult;
            let hasLoggedFirstChunk = false;
            try {
              logger.info('branch.stream.started', {
                normalizedUrl: input.normalizedUrl,
                promptTab: input.promptTabId,
                sessionId,
                messageId: input.messageId,
                branchId,
                provider: resolvedModel.providerId,
                modelId,
              });
              publishToPromptTabSafely({
                type: 'BRANCH_STREAM_STARTED',
                normalizedUrl: input.normalizedUrl,
                promptTabId: input.promptTabId,
                sessionId,
                messageId: input.messageId,
                branchId,
                modelId,
                modelLabel: resolvedModel.modelLabel,
              });
              const response = await deps.streamText({
                model: resolvedModel.sdkModel,
                messages: branchMessages,
                abortSignal: abortController.signal,
              });

              for await (const chunk of response.textStream) {
                if (!hasLoggedFirstChunk) {
                  hasLoggedFirstChunk = true;
                  logger.info('branch.stream.first_chunk', {
                    normalizedUrl: input.normalizedUrl,
                    promptTab: input.promptTabId,
                    sessionId,
                    messageId: input.messageId,
                    branchId,
                  });
                }
                await deps.conversationRepository.appendAssistantBranchChunk({
                  normalizedUrl: input.normalizedUrl,
                  promptTabId: input.promptTabId,
                  messageId: input.messageId,
                  branchId,
                  chunk,
                  now: now(),
                });
                publishToPromptTabSafely({
                  type: 'BRANCH_STREAM_CHUNK',
                  normalizedUrl: input.normalizedUrl,
                  promptTabId: input.promptTabId,
                  sessionId,
                  messageId: input.messageId,
                  branchId,
                  chunk,
                });
              }

              await deps.conversationRepository.finishAssistantBranch({
                normalizedUrl: input.normalizedUrl,
                promptTabId: input.promptTabId,
                messageId: input.messageId,
                branchId,
                now: now(),
              });
              publishToPromptTabSafely({
                type: 'BRANCH_STREAM_FINISHED',
                normalizedUrl: input.normalizedUrl,
                promptTabId: input.promptTabId,
                sessionId,
                messageId: input.messageId,
                branchId,
              });
              logger.info('branch.stream.completed', {
                normalizedUrl: input.normalizedUrl,
                promptTab: input.promptTabId,
                sessionId,
                messageId: input.messageId,
                branchId,
              });
              result = {
                sessionId,
                messageId: input.messageId,
                status: 'done',
                errorMessage: null,
              };
            } catch (error) {
              const status = isAbortError(error) ? 'cancelled' : 'error';
              const errorMessage = status === 'cancelled' ? 'branch stream cancelled' : getErrorMessage(error, 'branch dispatch failed');
              await deps.conversationRepository.failAssistantBranch({
                normalizedUrl: input.normalizedUrl,
                promptTabId: input.promptTabId,
                messageId: input.messageId,
                branchId,
                errorMessage,
                status,
                now: now(),
              });
              if (status === 'cancelled') {
                logger.info('branch.stream.cancelled', {
                  normalizedUrl: input.normalizedUrl,
                  promptTab: input.promptTabId,
                  sessionId,
                  messageId: input.messageId,
                  branchId,
                });
                publishToPromptTabSafely({
                  type: 'BRANCH_STREAM_CANCELLED',
                  normalizedUrl: input.normalizedUrl,
                  promptTabId: input.promptTabId,
                  sessionId,
                  messageId: input.messageId,
                  branchId,
                });
              } else {
                logger.error('branch.stream.failed', {
                  normalizedUrl: input.normalizedUrl,
                  promptTab: input.promptTabId,
                  sessionId,
                  messageId: input.messageId,
                  branchId,
                  reason: errorMessage,
                });
                publishToPromptTabSafely({
                  type: 'BRANCH_STREAM_FAILED',
                  normalizedUrl: input.normalizedUrl,
                  promptTabId: input.promptTabId,
                  sessionId,
                  messageId: input.messageId,
                  branchId,
                  errorMessage,
                });
              }
              result = {
                sessionId,
                messageId: input.messageId,
                status,
                errorMessage,
              };
            }

            await deps.conversationRepository.removeBranchLoadingState(input.normalizedUrl, input.promptTabId, branchId);
            return result;
          })();

          return {
            branchId,
            sessionId,
            messageId: input.messageId,
            cancel: () => {
              abortController.abort();
            },
            done,
          };
        }),
      );
    },
  };
};

export type { BranchStreamSession, ChatDispatchInput, ChatStreamEvent, ChatStreamResult, StreamSession };
