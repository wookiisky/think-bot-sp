import type * as Ai from 'ai';
import type { LanguageModel, ToolSet } from 'ai';
import { createDefaultConfig, resolvePromptTabParallelModelIds } from '../../domain/config/config-schema';
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
  /** 用户消息展示文本。 */
  displayText?: string;
  /** 用户附带图片。 */
  images: string[];
  /** 当前请求真正附带的页面正文。 */
  pageContent: string;
  /** 失败时是否回滚本轮新增消息。 */
  rollbackOnFailure?: boolean;
};

type StreamTextRequest = Parameters<typeof Ai.streamText>[0];
type ProviderOptions = StreamTextRequest extends { providerOptions?: infer Value } ? Value : never;

type PromptContext = {
  /** 当前请求最终使用的系统提示词。 */
  systemPrompt: string;
  /** 当前请求附带的页面正文。 */
  pageContent: string;
};

type BranchSummary = {
  /** 分支稳定 id。 */
  branchId: string;
  /** 分支模型 id。 */
  modelId: string;
  /** 分支模型展示名。 */
  modelLabel: string;
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
      /** 主分支 id。 */
      branchId: string;
      /** 主分支模型 id。 */
      modelId: string;
      /** 主分支模型展示名。 */
      modelLabel: string;
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
      /** 是否已回滚本轮新增消息。 */
      rollbackOnFailure?: boolean;
      /** 本轮用户消息 id。 */
      userMessageId?: string;
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
      /** 主分支 id。 */
      branchId: string;
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
      /** 主分支 id。 */
      branchId: string;
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
      /** 主分支 id。 */
      branchId: string;
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
      /** 主分支 id。 */
      branchId: string;
    }
  | {
      /** 事件类型。 */
      type: 'LOADING_STATE_UPDATE';
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 本次流式会话 id。 */
      sessionId: string;
      /** 当前 loading 状态。 */
      status: 'loading' | 'done' | 'cancelled' | 'error';
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
  /** 当前结果是否仍然保留在持久层。 */
  persisted: boolean;
};

type StreamTextResult = {
  /** 文本增量流。 */
  textStream: AsyncIterable<string>;
};

type ConversationHistoryMessage =
  | {
      /** 消息角色。 */
      role: 'user';
      /** 用户文本。 */
      content: string;
      /** 用户附带图片。 */
      images: string[];
    }
  | {
      /** 消息角色。 */
      role: 'assistant';
      /** 助手文本。 */
      content: string;
      /** 助手消息无图片输入。 */
      images: string[];
    }
  | {
      /** 消息角色。 */
      role: 'system';
      /** 系统提示词。 */
      content: string;
      /** 系统消息无图片输入。 */
      images: string[];
    };

type StreamSession = {
  /** 本次流式会话 id。 */
  sessionId: string;
  /** 当前主回答对应的用户消息 id。 */
  userMessageId?: string | null;
  /** 助手消息 id。 */
  messageId: string;
  /** 当前主分支 id。 */
  branchId?: string;
  /** 当前主分支模型 id。 */
  modelId?: string;
  /** 当前主分支模型展示名。 */
  modelLabel?: string;
  /** 请求取消。 */
  cancel: () => void;
  /** 等待生命周期结束。 */
  done: Promise<ChatStreamResult>;
};

type BranchStreamSession = StreamSession & {
  /** 分支稳定 id。 */
  branchId: string;
  /** 分支模型 id。 */
  modelId: string;
  /** 分支模型展示名。 */
  modelLabel: string;
};

type MultiBranchStreamSession = BranchStreamSession & {
  /** 本轮初始化时创建的分支摘要。 */
  branches: BranchSummary[];
  /** 本轮额外并行分支会话。 */
  branchSessions: BranchStreamSession[];
};

type InitialBranchPlan = BranchSummary & {
  /** 是否为主分支。 */
  isPrimary: boolean;
  /** 分支对应模型配置。 */
  model: ModelConfig;
  /** provider 解析后的模型。 */
  resolvedModel: ResolvedProviderModel;
};

type ChatDispatchServiceDeps = {
  /** 配置仓储。 */
  configRepository: {
    /** 读取完整配置。 */
    getConfig?: () => Promise<ExtensionConfig>;
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
      /** 用户消息展示文本。 */
      displayContent?: string;
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
      /** 初始分支列表。 */
      initialBranches: Array<{
        /** 分支稳定 id。 */
        id: string;
        /** 分支模型 id。 */
        modelId: string;
        /** 分支模型展示名。 */
        modelLabel: string;
        /** 是否为主分支。 */
        isPrimary: boolean;
      }>;
      /** 当前选中的主分支 id。 */
      selectedBranchId: string;
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
      errorMessage: string | null;
      /** 最终状态。 */
      status: 'error' | 'cancelled';
      /** 当前时间。 */
      now: number;
    }) => Promise<unknown>;
    /** 回滚本轮新增的用户消息和助手消息。 */
    rollbackTurnMessages: (_input: {
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
          isPrimary: boolean;
          content: string;
          status: 'loading' | 'done' | 'error' | 'cancelled';
          errorMessage: string | null;
          createdAt: number;
          updatedAt: number;
        }>;
        selectedBranchId: string | null;
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
      /** 初始分支列表。 */
      initialBranches: Array<{
        /** 分支稳定 id。 */
        id: string;
        /** 分支模型 id。 */
        modelId: string;
        /** 分支模型展示名。 */
        modelLabel: string;
        /** 是否为主分支。 */
        isPrimary: boolean;
      }>;
      /** 当前选中的主分支 id。 */
      selectedBranchId: string;
      /** 当前时间。 */
      now: number;
    }) => Promise<unknown>;
    /** 裁剪某轮后的全部消息。 */
    truncateMessagesAfter: (_input: {
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 保留到该消息。 */
      messageId: string;
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
      errorMessage: string | null;
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
    /** 重新启动既有助手分支。 */
    restartAssistantBranch: (_input: {
      normalizedUrl: string;
      promptTabId: string;
      messageId: string;
      branchId: string;
      now: number;
    }) => Promise<unknown>;
    /** 切换当前轮的主分支。 */
    selectAssistantBranch: (_input: {
      normalizedUrl: string;
      promptTabId: string;
      messageId: string;
      branchId: string;
      now: number;
    }) => Promise<unknown>;
  };
  /** port 总线。 */
  portBus: {
    /** 向 promptTab 推送事件。 */
    publishToPromptTab: (_event: ChatStreamEvent) => void;
  };
  /** 启动流式请求。 */
  streamText: (_input: {
    /** AI SDK 模型对象。 */
    model: LanguageModel;
    /** 采样温度。 */
    temperature?: number;
    /** 单次输出 token 上限。 */
    maxOutputTokens?: number;
    /** provider tools。 */
    tools?: ToolSet;
    /** providerOptions。 */
    providerOptions?: ProviderOptions;
    /** 对话消息。 */
    messages: ConversationHistoryMessage[];
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

/** 判断未知值是否可按普通对象读取。 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** 把原始 API 错误载荷转成可展示文本。 */
const stringifyRawErrorPayload = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  if (value === undefined || value === null) {
    return null;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return null;
  }
};

/** 优先提取 provider 原始响应，避免只展示 SDK 包装后的摘要。 */
const getRawApiErrorMessage = (error: unknown): string | null => {
  if (!isRecord(error)) {
    return null;
  }

  const responseBody = stringifyRawErrorPayload(error.responseBody);
  if (responseBody) {
    return responseBody;
  }

  const data = stringifyRawErrorPayload(error.data);
  if (data) {
    return data;
  }

  return getRawApiErrorMessage(error.cause);
};

/** 统一提取错误文本。 */
const getErrorMessage = (error: unknown, fallback: string): string =>
  getRawApiErrorMessage(error) ?? (error instanceof Error && error.message.trim() ? error.message : fallback);

/** 创建带超时的模型请求取消域。 */
const createModelAbortScope = (timeoutSeconds: number) => {
  const abortController = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    abortController.abort();
  }, timeoutSeconds * 1000);

  return {
    signal: abortController.signal,
    cancel: () => abortController.abort(),
    clear: () => clearTimeout(timeoutId),
    isTimedOut: () => timedOut,
  };
};

/** 根据取消来源判断最终流状态。 */
const resolveStreamFailure = (error: unknown, abortScope: ReturnType<typeof createModelAbortScope>, timeoutSeconds: number) => {
  if (abortScope.isTimedOut()) {
    return {
      status: 'error' as const,
      errorMessage: `大模型调用超时（${timeoutSeconds} 秒）`,
    };
  }

  if (isAbortError(error)) {
    return {
      status: 'cancelled' as const,
      errorMessage: 'stream cancelled',
    };
  }

  return {
    status: 'error' as const,
    errorMessage: getErrorMessage(error, 'chat dispatch failed'),
  };
};

/** 构造最终系统提示词，页面正文始终追加在末尾。 */
const buildEffectiveSystemPrompt = (input: PromptContext): string => {
  const trimmedSystemPrompt = input.systemPrompt.trim();
  const trimmedPageContent = (input.pageContent ?? '').trim();
  if (!trimmedPageContent) {
    return trimmedSystemPrompt;
  }

  const pageContentSection = `# Page Content\n${trimmedPageContent}`;
  return trimmedSystemPrompt ? `${trimmedSystemPrompt}\n\n${pageContentSection}` : pageContentSection;
};

/** 统一把系统提示词拼到消息最前面，避免污染用户消息正文。 */
const buildModelMessages = (input: {
  /** 历史消息和当前轮消息。 */
  conversationMessages: ConversationHistoryMessage[];
  /** 当前请求使用的提示词上下文。 */
  promptContext: PromptContext;
}): ConversationHistoryMessage[] => {
  const effectiveSystemPrompt = buildEffectiveSystemPrompt(input.promptContext);
  if (!effectiveSystemPrompt) {
    return input.conversationMessages;
  }

  return [
    {
      role: 'system',
      content: effectiveSystemPrompt,
      images: [],
    },
    ...input.conversationMessages,
  ];
};

/** 构造统一的 AI SDK 调用参数，避免各入口遗漏模型配置。 */
const buildModelInvocation = (input: {
  /** 解析后的 provider 模型。 */
  resolvedModel: ResolvedProviderModel;
  /** 当前用户消息。 */
  messages: ConversationHistoryMessage[];
  /** 取消信号。 */
  abortSignal: AbortSignal;
}) => {
  const invocation = {
    model: input.resolvedModel.sdkModel,
    temperature: input.resolvedModel.temperature,
    messages: input.messages,
    abortSignal: input.abortSignal,
  } as {
    model: LanguageModel;
    temperature: number;
    messages: ConversationHistoryMessage[];
    abortSignal: AbortSignal;
    maxOutputTokens?: number;
    tools?: ToolSet;
    providerOptions?: ProviderOptions;
  };

  if (input.resolvedModel.maxOutputTokens !== null) {
    invocation.maxOutputTokens = input.resolvedModel.maxOutputTokens;
  }
  if (input.resolvedModel.tools) {
    invocation.tools = input.resolvedModel.tools;
  }
  if (input.resolvedModel.providerOptions) {
    invocation.providerOptions = input.resolvedModel.providerOptions;
  }

  return invocation;
};

/** 汇总多条分支会话的最终状态，供 loading 生命周期收口使用。 */
const resolveAggregateStatus = (results: ChatStreamResult[]): ChatStreamResult['status'] => {
  if (results.some((result) => result.status === 'error')) {
    return 'error';
  }
  if (results.some((result) => result.status === 'done')) {
    return 'done';
  }
  return 'cancelled';
};

/** 为本轮首发生成初始并行分支计划，主模型始终排在第一位。 */
const resolveInitialBranchPlans = async (input: {
  /** 依赖集合。 */
  deps: ChatDispatchServiceDeps;
  /** 当前配置。 */
  config: ExtensionConfig;
  /** promptTab 稳定 id。 */
  promptTabId: string;
  /** 主模型 id。 */
  primaryModelId: string;
  /** 分支 id 生成器。 */
  createMessageId: () => string;
}): Promise<InitialBranchPlan[]> => {
  const seen = new Set<string>();
  const orderedModelIds = [input.primaryModelId, ...resolvePromptTabParallelModelIds(input.config, input.promptTabId)].filter((modelId) => {
    if (seen.has(modelId)) {
      return false;
    }
    seen.add(modelId);
    return true;
  });

  return Promise.all(
    orderedModelIds.map(async (modelId, index) => {
      const model = await input.deps.configRepository.getModelById(modelId);
      if (!model) {
        throw new Error(`model not found: ${modelId}`);
      }

      const resolvedModel = input.deps.providerRegistry.resolveProviderModel(model);
      return {
        branchId: input.createMessageId(),
        modelId,
        modelLabel: resolvedModel.modelLabel,
        isPrimary: index === 0,
        model,
        resolvedModel,
      };
    }),
  );
};

/** 解析当前轮被选中的主分支文本。 */
const getSelectedAssistantContent = (
  message: NonNullable<Awaited<ReturnType<ChatDispatchServiceDeps['conversationRepository']['getConversation']>>>['messages'][number],
) => {
  if (message.role !== 'assistant') {
    return null;
  }

  const selectedBranchId = message.selectedBranchId ?? message.branches[0]?.id ?? null;
  if (!selectedBranchId) {
    return message.content.trim() ? message.content : null;
  }
  return message.branches.find((branch) => branch.id === selectedBranchId)?.content ?? message.content;
};

/** 为目标助手消息重建完整对话历史，不包含当前助手轮。 */
const buildConversationHistoryBeforeAssistant = (
  conversation: NonNullable<Awaited<ReturnType<ChatDispatchServiceDeps['conversationRepository']['getConversation']>>>,
  targetMessageId: string,
) : ConversationHistoryMessage[] => {
  const targetIndex = conversation.messages.findIndex((message) => message.id === targetMessageId && message.role === 'assistant');
  if (targetIndex < 0) {
    throw new Error(`assistant message not found: ${targetMessageId}`);
  }

  return toConversationHistory(conversation.messages.slice(0, targetIndex));
};

/** 为目标用户消息重建完整对话历史，包含该用户消息本身。 */
const buildConversationHistoryThroughUser = (
  conversation: NonNullable<Awaited<ReturnType<ChatDispatchServiceDeps['conversationRepository']['getConversation']>>>,
  targetMessageId: string,
  replacementContent?: string,
) : ConversationHistoryMessage[] => {
  const targetIndex = conversation.messages.findIndex((message) => message.id === targetMessageId && message.role === 'user');
  if (targetIndex < 0) {
    throw new Error(`user message not found: ${targetMessageId}`);
  }

  return toConversationHistory(
    conversation.messages
      .slice(0, targetIndex + 1)
      .map((message) =>
        message.id === targetMessageId && message.role === 'user' && replacementContent !== undefined
          ? {
              ...message,
              content: replacementContent,
            }
          : message,
      ),
  );
};

/** 把会话消息压成发给模型的完整对话历史。 */
const toConversationHistory = (
  messages: NonNullable<Awaited<ReturnType<ChatDispatchServiceDeps['conversationRepository']['getConversation']>>>['messages'],
): ConversationHistoryMessage[] => {
  const history: ConversationHistoryMessage[] = [];
  for (const message of messages) {
    if (message.role === 'user') {
      history.push({
        role: 'user',
        content: message.content,
        images: message.images,
      });
      continue;
    }

    if (message.role === 'system') {
      history.push({
        role: 'system',
        content: message.content,
        images: [],
      });
      continue;
    }

    const selectedContent = getSelectedAssistantContent(message)?.trim() ?? '';
    if (selectedContent) {
      history.push({
        role: 'assistant',
        content: selectedContent,
        images: [],
      });
    }
  }

  return history;
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
  /** 兼容旧测试夹具，缺省 getConfig 时按“无并行模型”处理。 */
  const loadRuntimeConfig = async (): Promise<ExtensionConfig> => {
    if (typeof deps.configRepository.getConfig !== 'function') {
      return createDefaultConfig();
    }
    return createDefaultConfig(await deps.configRepository.getConfig());
  };
  /** 创建单个分支流会话，供并行首发、重试分支和新增分支复用。 */
  const createBranchStreamSession = (input: {
    /** 归一化页面 URL。 */
    normalizedUrl: string;
    /** promptTab 稳定 id。 */
    promptTabId: string;
    /** 助手消息 id。 */
    messageId: string;
    /** 分支 id。 */
    branchId: string;
    /** 分支模型配置。 */
    model: ModelConfig;
    /** 大模型调用超时秒数。 */
    requestTimeoutSeconds: number;
    /** 流式对话历史。 */
    streamMessages: ConversationHistoryMessage[];
    /** 可选的开始前准备。 */
    prepare?: (sessionId: string) => Promise<void>;
  }): BranchStreamSession => {
    const sessionId = createSessionId();
    const abortScope = createModelAbortScope(input.requestTimeoutSeconds);
    const resolvedModel = deps.providerRegistry.resolveProviderModel(input.model);
    const done = (async (): Promise<ChatStreamResult> => {
      let result: ChatStreamResult;
      let hasLoggedFirstChunk = false;
      try {
        await input.prepare?.(sessionId);
        logger.info('branch.stream.started', {
          normalizedUrl: input.normalizedUrl,
          promptTab: input.promptTabId,
          sessionId,
          messageId: input.messageId,
          branchId: input.branchId,
          provider: resolvedModel.providerId,
          modelId: input.model.id,
        });
        publishToPromptTabSafely({
          type: 'BRANCH_STREAM_STARTED',
          normalizedUrl: input.normalizedUrl,
          promptTabId: input.promptTabId,
          sessionId,
          messageId: input.messageId,
          branchId: input.branchId,
          modelId: input.model.id,
          modelLabel: resolvedModel.modelLabel,
        });
        const response = await deps.streamText(
          buildModelInvocation({
            resolvedModel,
            messages: input.streamMessages,
            abortSignal: abortScope.signal,
          }),
        );

        for await (const chunk of response.textStream) {
          if (!hasLoggedFirstChunk) {
            hasLoggedFirstChunk = true;
            logger.info('branch.stream.first_chunk', {
              normalizedUrl: input.normalizedUrl,
              promptTab: input.promptTabId,
              sessionId,
              messageId: input.messageId,
              branchId: input.branchId,
            });
          }
          await deps.conversationRepository.appendAssistantBranchChunk({
            normalizedUrl: input.normalizedUrl,
            promptTabId: input.promptTabId,
            messageId: input.messageId,
            branchId: input.branchId,
            chunk,
            now: now(),
          });
          publishToPromptTabSafely({
            type: 'BRANCH_STREAM_CHUNK',
            normalizedUrl: input.normalizedUrl,
            promptTabId: input.promptTabId,
            sessionId,
            messageId: input.messageId,
            branchId: input.branchId,
            chunk,
          });
        }

        await deps.conversationRepository.finishAssistantBranch({
          normalizedUrl: input.normalizedUrl,
          promptTabId: input.promptTabId,
          messageId: input.messageId,
          branchId: input.branchId,
          now: now(),
        });
        publishToPromptTabSafely({
          type: 'BRANCH_STREAM_FINISHED',
          normalizedUrl: input.normalizedUrl,
          promptTabId: input.promptTabId,
          sessionId,
          messageId: input.messageId,
          branchId: input.branchId,
        });
        logger.info('branch.stream.completed', {
          normalizedUrl: input.normalizedUrl,
          promptTab: input.promptTabId,
          sessionId,
          messageId: input.messageId,
          branchId: input.branchId,
        });
        result = {
          sessionId,
          messageId: input.messageId,
          status: 'done',
          errorMessage: null,
          persisted: true,
        };
      } catch (error) {
        const failure = resolveStreamFailure(error, abortScope, input.requestTimeoutSeconds);
        const status = failure.status;
        const errorMessage =
          status === 'cancelled'
            ? 'branch stream cancelled'
            : failure.errorMessage === 'chat dispatch failed'
              ? 'branch dispatch failed'
              : failure.errorMessage;
        await deps.conversationRepository.failAssistantBranch({
          normalizedUrl: input.normalizedUrl,
          promptTabId: input.promptTabId,
          messageId: input.messageId,
          branchId: input.branchId,
          errorMessage: null,
          status,
          now: now(),
        });
        if (status === 'cancelled') {
          logger.info('branch.stream.cancelled', {
            normalizedUrl: input.normalizedUrl,
            promptTab: input.promptTabId,
            sessionId,
            messageId: input.messageId,
            branchId: input.branchId,
          });
          publishToPromptTabSafely({
            type: 'BRANCH_STREAM_CANCELLED',
            normalizedUrl: input.normalizedUrl,
            promptTabId: input.promptTabId,
            sessionId,
            messageId: input.messageId,
            branchId: input.branchId,
          });
        } else {
          logger.error('branch.stream.failed', {
            normalizedUrl: input.normalizedUrl,
            promptTab: input.promptTabId,
            sessionId,
            messageId: input.messageId,
            branchId: input.branchId,
            reason: errorMessage,
          });
          publishToPromptTabSafely({
            type: 'BRANCH_STREAM_FAILED',
            normalizedUrl: input.normalizedUrl,
            promptTabId: input.promptTabId,
            sessionId,
            messageId: input.messageId,
            branchId: input.branchId,
            errorMessage,
          });
        }
        result = {
          sessionId,
          messageId: input.messageId,
          status,
          errorMessage,
          persisted: true,
        };
      }

      abortScope.clear();
      await deps.conversationRepository.removeBranchLoadingState(input.normalizedUrl, input.promptTabId, input.branchId);
      return result;
    })();

    return {
      branchId: input.branchId,
      sessionId,
      messageId: input.messageId,
      modelId: input.model.id,
      modelLabel: resolvedModel.modelLabel,
      cancel: () => {
        abortScope.cancel();
      },
      done,
    };
  };

  return {
    /** 启动一次主聊天流。 */
    async dispatchChat(input: ChatDispatchInput): Promise<MultiBranchStreamSession> {
      const [config, model, conversation] = await Promise.all([
        loadRuntimeConfig(),
        deps.configRepository.getModelById(input.modelId),
        deps.conversationRepository.getConversation(input.normalizedUrl, input.promptTabId),
      ]);
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
      const initialBranchPlans = await resolveInitialBranchPlans({
        deps,
        config,
        promptTabId: input.promptTabId,
        primaryModelId: model.id,
        createMessageId,
      });
      const primaryBranch = initialBranchPlans[0];
      if (!primaryBranch) {
        throw new Error(`primary branch plan missing: ${input.promptTabId}`);
      }
      const streamMessages = buildModelMessages({
        conversationMessages: [
          ...toConversationHistory(conversation?.messages ?? []),
          {
            role: 'user',
            content: input.content,
            images: input.images,
          },
        ],
        promptContext: {
          systemPrompt: config.basic.systemPrompt,
          pageContent: input.pageContent,
        },
      });
      const abortScope = createModelAbortScope(config.basic.llmRequestTimeoutSeconds);
      const shouldRollbackOnFailure = input.rollbackOnFailure ?? false;
      const getLifecycleScope = () => ({
        normalizedUrl: input.normalizedUrl,
        promptTabId: input.promptTabId,
        messageId: assistantMessageId,
      });
      /** setup 失败后，尽力把 assistant 从 loading 收敛到 error。 */
      const compensateSetupFailure = async (_error: unknown) => {
        try {
          await deps.conversationRepository.failAssistantMessage({
            ...getLifecycleScope(),
            errorMessage: null,
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
      /** 首轮快捷输入失败后回滚本轮，避免把错误态持久化成历史。 */
      const rollbackTurnMessagesSafely = async () => {
        try {
          await deps.conversationRepository.rollbackTurnMessages({
            normalizedUrl: input.normalizedUrl,
            promptTabId: input.promptTabId,
            userMessageId,
            assistantMessageId,
            now: now(),
          });
        } catch {
          // 回滚失败时保留原始失败态，避免把主错误覆盖成新的异常。
        }
      };

      let assistantMessageCreated = false;
      try {
        const userMessageInput: Parameters<ChatDispatchServiceDeps['conversationRepository']['appendUserMessage']>[0] = {
          normalizedUrl: input.normalizedUrl,
          promptTabId: input.promptTabId,
          messageId: userMessageId,
          content: input.content,
          images: input.images,
          now: now(),
        };
        if (input.displayText !== undefined) {
          userMessageInput.displayContent = input.displayText;
        }
        await deps.conversationRepository.appendUserMessage(userMessageInput);
        await deps.conversationRepository.appendAssistantMessage({
          normalizedUrl: input.normalizedUrl,
          promptTabId: input.promptTabId,
          messageId: assistantMessageId,
          initialBranches: initialBranchPlans.map((plan) => ({
            id: plan.branchId,
            modelId: plan.modelId,
            modelLabel: plan.modelLabel,
            isPrimary: plan.isPrimary,
          })),
          selectedBranchId: primaryBranch.branchId,
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

      const branchSessions = initialBranchPlans.slice(1).map((plan) =>
        createBranchStreamSession({
          normalizedUrl: input.normalizedUrl,
          promptTabId: input.promptTabId,
          messageId: assistantMessageId,
          branchId: plan.branchId,
          model: plan.model,
          requestTimeoutSeconds: config.basic.llmRequestTimeoutSeconds,
          streamMessages,
          prepare: async (branchSessionId) => {
            await deps.conversationRepository.upsertBranchLoadingState({
              normalizedUrl: input.normalizedUrl,
              promptTabId: input.promptTabId,
              sessionId: branchSessionId,
              messageId: assistantMessageId,
              branchId: plan.branchId,
              modelId: plan.modelId,
              status: 'loading',
              now: now(),
            });
          },
        }),
      );
      const branchResultsPromise = Promise.all(branchSessions.map((session) => session.done));

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
            branchId: primaryBranch.branchId,
            modelId: model.id,
            modelLabel: resolvedModel.modelLabel,
          });

          const response = await deps.streamText(
            buildModelInvocation({
              resolvedModel,
              messages: streamMessages,
              abortSignal: abortScope.signal,
            }),
          );

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
              branchId: primaryBranch.branchId,
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
            branchId: primaryBranch.branchId,
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
            persisted: true,
          };
        } catch (error) {
          const { status, errorMessage } = resolveStreamFailure(error, abortScope, config.basic.llmRequestTimeoutSeconds);

          await deps.conversationRepository.failAssistantMessage({
            normalizedUrl: input.normalizedUrl,
            promptTabId: input.promptTabId,
            messageId: assistantMessageId,
            errorMessage: null,
            status,
            now: now(),
          });
          if (shouldRollbackOnFailure && status === 'error') {
            await rollbackTurnMessagesSafely();
          }

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
              branchId: primaryBranch.branchId,
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
              branchId: primaryBranch.branchId,
              errorMessage,
              ...(shouldRollbackOnFailure
                ? {
                    rollbackOnFailure: true,
                    userMessageId,
                  }
                : {}),
            });
          }
          if (shouldRollbackOnFailure && status === 'error') {
            for (const branchSession of branchSessions) {
              branchSession.cancel();
            }
            await branchResultsPromise;
            await rollbackTurnMessagesSafely();
          }

          result = {
            sessionId,
            messageId: assistantMessageId,
            status,
            errorMessage,
            persisted: !(shouldRollbackOnFailure && status === 'error'),
          };
        }
        abortScope.clear();
        const branchResults = await branchResultsPromise;
        await removeLoadingStateSafely();
        publishToPromptTabSafely({
          type: 'LOADING_STATE_UPDATE',
          normalizedUrl: input.normalizedUrl,
          promptTabId: input.promptTabId,
          sessionId,
          status: resolveAggregateStatus([result, ...branchResults]),
        });
        return result;
      })();

      return {
        sessionId,
        userMessageId,
        messageId: assistantMessageId,
        branchId: primaryBranch.branchId,
        modelId: model.id,
        modelLabel: resolvedModel.modelLabel,
        branches: initialBranchPlans.map(({ branchId, modelId, modelLabel }) => ({
          branchId,
          modelId,
          modelLabel,
        })),
        branchSessions,
        cancel: () => {
          abortScope.cancel();
          for (const branchSession of branchSessions) {
            branchSession.cancel();
          }
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
      /** 当前请求真正附带的页面正文。 */
      pageContent: string;
    }): Promise<MultiBranchStreamSession> {
      const [config, conversation] = await Promise.all([
        loadRuntimeConfig(),
        deps.conversationRepository.getConversation(input.normalizedUrl, input.promptTabId),
      ]);
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

      const sessionId = createSessionId();
      const assistantMessageId = createMessageId();
      const resolvedModel = deps.providerRegistry.resolveProviderModel(model);
      const initialBranchPlans = await resolveInitialBranchPlans({
        deps,
        config,
        promptTabId: input.promptTabId,
        primaryModelId: model.id,
        createMessageId,
      });
      const primaryBranch = initialBranchPlans[0];
      if (!primaryBranch) {
        throw new Error(`primary branch plan missing: ${input.promptTabId}`);
      }
      const streamMessages = buildModelMessages({
        conversationMessages: buildConversationHistoryThroughUser(conversation, input.messageId, input.content),
        promptContext: {
          systemPrompt: config.basic.systemPrompt,
          pageContent: input.pageContent,
        },
      });
      const abortScope = createModelAbortScope(config.basic.llmRequestTimeoutSeconds);
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
        initialBranches: initialBranchPlans.map((plan) => ({
          id: plan.branchId,
          modelId: plan.modelId,
          modelLabel: plan.modelLabel,
          isPrimary: plan.isPrimary,
        })),
        selectedBranchId: primaryBranch.branchId,
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

      const branchSessions = initialBranchPlans.slice(1).map((plan) =>
        createBranchStreamSession({
          normalizedUrl: input.normalizedUrl,
          promptTabId: input.promptTabId,
          messageId: assistantMessageId,
          branchId: plan.branchId,
          model: plan.model,
          requestTimeoutSeconds: config.basic.llmRequestTimeoutSeconds,
          streamMessages,
          prepare: async (branchSessionId) => {
            await deps.conversationRepository.upsertBranchLoadingState({
              normalizedUrl: input.normalizedUrl,
              promptTabId: input.promptTabId,
              sessionId: branchSessionId,
              messageId: assistantMessageId,
              branchId: plan.branchId,
              modelId: plan.modelId,
              status: 'loading',
              now: now(),
            });
          },
        }),
      );
      const branchResultsPromise = Promise.all(branchSessions.map((session) => session.done));

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
            branchId: primaryBranch.branchId,
            modelId: model.id,
            modelLabel: resolvedModel.modelLabel,
          });
          const response = await deps.streamText(
            buildModelInvocation({
              resolvedModel,
              messages: streamMessages,
              abortSignal: abortScope.signal,
            }),
          );

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
              branchId: primaryBranch.branchId,
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
            branchId: primaryBranch.branchId,
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
            persisted: true,
          };
        } catch (error) {
          const { status, errorMessage } = resolveStreamFailure(error, abortScope, config.basic.llmRequestTimeoutSeconds);
          await deps.conversationRepository.failAssistantMessage({
            normalizedUrl: input.normalizedUrl,
            promptTabId: input.promptTabId,
            messageId: assistantMessageId,
            errorMessage: null,
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
              branchId: primaryBranch.branchId,
            });
          } else {
            publishToPromptTabSafely({
              type: 'CHAT_STREAM_FAILED',
              normalizedUrl: input.normalizedUrl,
              promptTabId: input.promptTabId,
              sessionId,
              messageId: assistantMessageId,
              branchId: primaryBranch.branchId,
              errorMessage,
            });
          }
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
            persisted: true,
          };
        }

        abortScope.clear();
        const branchResults = await branchResultsPromise;
        await removeLoadingStateSafely();
        publishToPromptTabSafely({
          type: 'LOADING_STATE_UPDATE',
          normalizedUrl: input.normalizedUrl,
          promptTabId: input.promptTabId,
          sessionId,
          status: resolveAggregateStatus([result, ...branchResults]),
        });
        return result;
      })();

      return {
        sessionId,
        messageId: assistantMessageId,
        branchId: primaryBranch.branchId,
        modelId: model.id,
        modelLabel: resolvedModel.modelLabel,
        branches: initialBranchPlans.map(({ branchId, modelId, modelLabel }) => ({
          branchId,
          modelId,
          modelLabel,
        })),
        branchSessions,
        cancel: () => {
          abortScope.cancel();
          for (const branchSession of branchSessions) {
            branchSession.cancel();
          }
        },
        done,
      };
    },

    /** 重试目标用户消息，裁剪其后的结果并重新生成当前轮。 */
    async retryUserMessage(input: {
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 目标用户消息 id。 */
      messageId: string;
      /** 当前请求真正附带的页面正文。 */
      pageContent: string;
    }): Promise<MultiBranchStreamSession> {
      const [config, conversation] = await Promise.all([
        loadRuntimeConfig(),
        deps.conversationRepository.getConversation(input.normalizedUrl, input.promptTabId),
      ]);
      if (!conversation) {
        throw new Error('conversation not found');
      }

      const targetIndex = conversation.messages.findIndex((message) => message.id === input.messageId && message.role === 'user');
      if (targetIndex < 0) {
        throw new Error(`user message not found: ${input.messageId}`);
      }

      const targetAssistant = conversation.messages.slice(targetIndex + 1).find((message) => message.role === 'assistant') ?? null;
      if (!targetAssistant) {
        throw new Error(`assistant message not found after user message: ${input.messageId}`);
      }

      const sourcePrimaryBranch =
        targetAssistant.branches.find((branch) => branch.isPrimary)
        ?? (targetAssistant.selectedBranchId
          ? targetAssistant.branches.find((branch) => branch.id === targetAssistant.selectedBranchId)
          : targetAssistant.branches[0])
        ?? null;
      const modelId = sourcePrimaryBranch?.modelId ?? targetAssistant.modelId ?? null;
      if (!modelId) {
        throw new Error(`assistant model not found: ${targetAssistant.id}`);
      }

      const model = await deps.configRepository.getModelById(modelId);
      if (!model) {
        throw new Error(`model not found: ${modelId}`);
      }

      const sessionId = createSessionId();
      const assistantMessageId = createMessageId();
      const streamMessages = buildModelMessages({
        conversationMessages: buildConversationHistoryThroughUser(conversation, input.messageId),
        promptContext: {
          systemPrompt: config.basic.systemPrompt,
          pageContent: input.pageContent,
        },
      });
      const resolvedModel = deps.providerRegistry.resolveProviderModel(model);
      const initialBranchPlans = await resolveInitialBranchPlans({
        deps,
        config,
        promptTabId: input.promptTabId,
        primaryModelId: model.id,
        createMessageId,
      });
      const primaryBranch = initialBranchPlans[0];
      if (!primaryBranch) {
        throw new Error(`primary branch plan missing: ${input.promptTabId}`);
      }
      const abortScope = createModelAbortScope(config.basic.llmRequestTimeoutSeconds);
      const removeLoadingStateSafely = async () => {
        try {
          await deps.conversationRepository.removeLoadingState(input.normalizedUrl, input.promptTabId);
        } catch {
          // 清理失败只允许留下残留状态，不允许把主结果改成 reject。
        }
      };

      await deps.conversationRepository.truncateMessagesAfter({
        normalizedUrl: input.normalizedUrl,
        promptTabId: input.promptTabId,
        messageId: input.messageId,
        now: now(),
      });
      await deps.conversationRepository.appendAssistantMessage({
        normalizedUrl: input.normalizedUrl,
        promptTabId: input.promptTabId,
        messageId: assistantMessageId,
        initialBranches: initialBranchPlans.map((plan) => ({
          id: plan.branchId,
          modelId: plan.modelId,
          modelLabel: plan.modelLabel,
          isPrimary: plan.isPrimary,
        })),
        selectedBranchId: primaryBranch.branchId,
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

      const branchSessions = initialBranchPlans.slice(1).map((plan) =>
        createBranchStreamSession({
          normalizedUrl: input.normalizedUrl,
          promptTabId: input.promptTabId,
          messageId: assistantMessageId,
          branchId: plan.branchId,
          model: plan.model,
          requestTimeoutSeconds: config.basic.llmRequestTimeoutSeconds,
          streamMessages,
          prepare: async (branchSessionId) => {
            await deps.conversationRepository.upsertBranchLoadingState({
              normalizedUrl: input.normalizedUrl,
              promptTabId: input.promptTabId,
              sessionId: branchSessionId,
              messageId: assistantMessageId,
              branchId: plan.branchId,
              modelId: plan.modelId,
              status: 'loading',
              now: now(),
            });
          },
        }),
      );
      const branchResultsPromise = Promise.all(branchSessions.map((session) => session.done));

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
            branchId: primaryBranch.branchId,
            modelId: model.id,
            modelLabel: resolvedModel.modelLabel,
          });
          const response = await deps.streamText(
            buildModelInvocation({
              resolvedModel,
              messages: streamMessages,
              abortSignal: abortScope.signal,
            }),
          );

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
              branchId: primaryBranch.branchId,
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
            branchId: primaryBranch.branchId,
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
            persisted: true,
          };
        } catch (error) {
          const { status, errorMessage } = resolveStreamFailure(error, abortScope, config.basic.llmRequestTimeoutSeconds);
          await deps.conversationRepository.failAssistantMessage({
            normalizedUrl: input.normalizedUrl,
            promptTabId: input.promptTabId,
            messageId: assistantMessageId,
            errorMessage: null,
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
              branchId: primaryBranch.branchId,
            });
          } else {
            publishToPromptTabSafely({
              type: 'CHAT_STREAM_FAILED',
              normalizedUrl: input.normalizedUrl,
              promptTabId: input.promptTabId,
              sessionId,
              messageId: assistantMessageId,
              branchId: primaryBranch.branchId,
              errorMessage,
            });
          }
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
            persisted: true,
          };
        }

        abortScope.clear();
        const branchResults = await branchResultsPromise;
        await removeLoadingStateSafely();
        publishToPromptTabSafely({
          type: 'LOADING_STATE_UPDATE',
          normalizedUrl: input.normalizedUrl,
          promptTabId: input.promptTabId,
          sessionId,
          status: resolveAggregateStatus([result, ...branchResults]),
        });
        return result;
      })();

      return {
        sessionId,
        messageId: assistantMessageId,
        branchId: primaryBranch.branchId,
        modelId: model.id,
        modelLabel: resolvedModel.modelLabel,
        branches: initialBranchPlans.map(({ branchId, modelId, modelLabel }) => ({
          branchId,
          modelId,
          modelLabel,
        })),
        branchSessions,
        cancel: () => {
          abortScope.cancel();
          for (const branchSession of branchSessions) {
            branchSession.cancel();
          }
        },
        done,
      };
    },

    /** 重试目标助手分支，裁剪其后的结果并仅重跑该分支。 */
    async retryMessage(input: {
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 助手消息 id。 */
      messageId: string;
      /** 分支 id。 */
      branchId: string;
      /** 当前请求真正附带的页面正文。 */
      pageContent: string;
    }): Promise<BranchStreamSession> {
      const conversation = await deps.conversationRepository.getConversation(input.normalizedUrl, input.promptTabId);
      if (!conversation) {
        throw new Error('conversation not found');
      }

      const targetMessage = conversation.messages.find((message) => message.id === input.messageId && message.role === 'assistant') ?? null;
      if (!targetMessage) {
        throw new Error(`assistant message not found: ${input.messageId}`);
      }

      const targetBranch = targetMessage.branches.find((branch) => branch.id === input.branchId) ?? null;
      if (!targetBranch) {
        throw new Error(`assistant branch not found: ${input.branchId}`);
      }

      const model = await deps.configRepository.getModelById(targetBranch.modelId);
      if (!model) {
        throw new Error(`model not found: ${targetBranch.modelId}`);
      }

      const config = await loadRuntimeConfig();
      const streamMessages = buildModelMessages({
        conversationMessages: buildConversationHistoryBeforeAssistant(conversation, input.messageId),
        promptContext: {
          systemPrompt: config.basic.systemPrompt,
          pageContent: input.pageContent,
        },
      });
      await deps.conversationRepository.truncateMessagesAfter({
        normalizedUrl: input.normalizedUrl,
        promptTabId: input.promptTabId,
        messageId: input.messageId,
        now: now(),
      });
      await deps.conversationRepository.restartAssistantBranch({
        normalizedUrl: input.normalizedUrl,
        promptTabId: input.promptTabId,
        messageId: input.messageId,
        branchId: input.branchId,
        now: now(),
      });
      return createBranchStreamSession({
        normalizedUrl: input.normalizedUrl,
        promptTabId: input.promptTabId,
        messageId: input.messageId,
        branchId: input.branchId,
        model,
        requestTimeoutSeconds: config.basic.llmRequestTimeoutSeconds,
        streamMessages,
        prepare: async (sessionId) => {
          await deps.conversationRepository.upsertBranchLoadingState({
            normalizedUrl: input.normalizedUrl,
            promptTabId: input.promptTabId,
            sessionId,
            messageId: input.messageId,
            branchId: input.branchId,
            modelId: model.id,
            status: 'loading',
            now: now(),
          });
        },
      });
    },

    /** 针对既有助手消息继续新增分支。 */
    async expandBranches(input: {
      /** 归一化页面 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 目标助手消息 id。 */
      messageId: string;
      /** 用户选中的模型 id。 */
      modelId: string;
      /** 当前请求真正附带的页面正文。 */
      pageContent: string;
    }): Promise<BranchStreamSession[]> {
      const [config, conversation] = await Promise.all([
        loadRuntimeConfig(),
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

      const model = await deps.configRepository.getModelById(input.modelId);
      if (!model) {
        throw new Error(`model not found: ${input.modelId}`);
      }

      const branchMessages = buildModelMessages({
        conversationMessages: buildConversationHistoryBeforeAssistant(conversation, input.messageId),
        promptContext: {
          systemPrompt: config.basic.systemPrompt,
          pageContent: input.pageContent,
        },
      });
      const branchId = createMessageId();
      const resolvedModel = deps.providerRegistry.resolveProviderModel(model);
      await deps.conversationRepository.appendAssistantBranch({
        normalizedUrl: input.normalizedUrl,
        promptTabId: input.promptTabId,
        messageId: input.messageId,
        branchId,
        modelId: model.id,
        modelLabel: resolvedModel.modelLabel,
        now: now(),
      });

      return [
        createBranchStreamSession({
          normalizedUrl: input.normalizedUrl,
          promptTabId: input.promptTabId,
          messageId: input.messageId,
          branchId,
          model,
          requestTimeoutSeconds: config.basic.llmRequestTimeoutSeconds,
          streamMessages: branchMessages,
          prepare: async (sessionId) => {
            await deps.conversationRepository.upsertBranchLoadingState({
              normalizedUrl: input.normalizedUrl,
              promptTabId: input.promptTabId,
              sessionId,
              messageId: input.messageId,
              branchId,
              modelId: model.id,
              status: 'loading',
              now: now(),
            });
          },
        }),
      ];
    },
  };
};

export type { BranchStreamSession, ChatDispatchInput, ChatStreamEvent, ChatStreamResult, MultiBranchStreamSession, StreamSession };
