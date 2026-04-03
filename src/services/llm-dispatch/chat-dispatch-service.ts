import type { ModelConfig } from '../../domain/config/config-schema';
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
  /** 助手消息 id。 */
  messageId: string;
  /** 请求取消。 */
  cancel: () => void;
  /** 等待生命周期结束。 */
  done: Promise<ChatStreamResult>;
};

type ChatDispatchServiceDeps = {
  /** 配置仓储。 */
  configRepository: {
    /** 按 id 读取模型。 */
    getModelById: (modelId: string) => Promise<ModelConfig | null>;
  };
  /** provider 解析器。 */
  providerRegistry: {
    /** 解析 provider 模型。 */
    resolveProviderModel: (model: ModelConfig) => ResolvedProviderModel;
  };
  /** 会话仓储。 */
  conversationRepository: {
    /** 保存 loading 状态。 */
    saveLoadingState: (value: unknown) => Promise<unknown>;
    /** 删除 loading 状态。 */
    removeLoadingState: (normalizedUrl: string, promptTabId: string) => Promise<void>;
    /** 追加用户消息。 */
    appendUserMessage: (input: {
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
    appendAssistantMessage: (input: {
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
    appendAssistantChunk: (input: {
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
    finishAssistantMessage: (input: {
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
    failAssistantMessage: (input: {
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
  };
  /** port 总线。 */
  portBus: {
    /** 向 promptTab 推送事件。 */
    publishToPromptTab: (event: ChatStreamEvent) => void;
  };
  /** 启动流式请求。 */
  streamText: (input: {
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

/** 主聊天流调度服务。 */
export const createChatDispatchService = (deps: ChatDispatchServiceDeps) => {
  const createSessionId = deps.createSessionId ?? (() => crypto.randomUUID());
  const createMessageId = deps.createMessageId ?? (() => crypto.randomUUID());
  const now = deps.now ?? (() => Date.now());
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
        try {
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
                content: input.content,
                images: input.images,
              },
            ],
            abortSignal: abortController.signal,
          });

          for await (const chunk of response.textStream) {
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
            publishToPromptTabSafely({
              type: 'CHAT_STREAM_CANCELLED',
              normalizedUrl: input.normalizedUrl,
              promptTabId: input.promptTabId,
              sessionId,
              messageId: assistantMessageId,
            });
          } else {
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
        messageId: assistantMessageId,
        cancel: () => {
          abortController.abort();
        },
        done,
      };
    },
  };
};

export type { ChatDispatchInput, ChatStreamEvent, ChatStreamResult, StreamSession };
