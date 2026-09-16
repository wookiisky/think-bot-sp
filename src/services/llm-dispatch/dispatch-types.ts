import type * as Ai from 'ai';
import type { LanguageModel, ToolSet } from 'ai';
import type { ExtensionConfig, ModelConfig } from '../../domain/config/config-schema';
import type { createConversationRepository } from '../../repositories/conversation-repository';
import type { Logger } from '../logger/logger';
import type { SidebarPortEvent } from '../runtime-messaging/sidebar-contract';
import type { HistoryMessage } from './model-messages';
import type { ResolvedProviderModel, ResolveProviderModelOptions } from './provider-registry';

/** 发起主聊天流的输入。 */
export type ChatDispatchInput = {
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
/** AI SDK providerOptions 类型。 */
export type ProviderOptions = StreamTextRequest extends { providerOptions?: infer Value } ? Value : never;

/** 发给模型的对话历史消息。 */
export type ConversationHistoryMessage = HistoryMessage;

/** 分支摘要。 */
export type BranchSummary = {
  /** 分支稳定 id。 */
  branchId: string;
  /** 分支模型 id。 */
  modelId: string;
  /** 分支模型展示名。 */
  modelLabel: string;
};

/** dispatch 层发布的流式事件：直接从 port 契约推导，避免手抄一份再漂移。 */
export type ChatStreamEvent = Exclude<SidebarPortEvent, { type: 'RESTORE_LOADING' }>;

/** 单个流的最终结果。 */
export type ChatStreamResult = {
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

/** streamText 返回的最小结构。 */
export type StreamTextResult = {
  /** 文本增量流。 */
  textStream: AsyncIterable<string>;
};

/** 流式会话句柄。 */
export type StreamSession = {
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

/** 绑定到具体分支的流式会话句柄。 */
export type BranchStreamSession = StreamSession & {
  /** 分支稳定 id。 */
  branchId: string;
  /** 分支模型 id。 */
  modelId: string;
  /** 分支模型展示名。 */
  modelLabel: string;
};

/** 整轮协调器：主分支句柄加上本轮全部并行分支。 */
export type MultiBranchStreamSession = BranchStreamSession & {
  /** 本轮初始化时创建的分支摘要。 */
  branches: BranchSummary[];
  /** 本轮额外并行分支会话。 */
  branchSessions: BranchStreamSession[];
};

/** 首轮分支执行计划。 */
export type InitialBranchPlan = BranchSummary & {
  /** 是否为主分支。 */
  isPrimary: boolean;
  /** 分支对应模型配置。 */
  model: ModelConfig;
  /** provider 解析后的模型。 */
  resolvedModel: ResolvedProviderModel;
};

/** debug 可选，兼容只提供三档的测试夹具。 */
export type DispatchLogger = Pick<Logger, 'info' | 'warn' | 'error'> & Partial<Pick<Logger, 'debug'>>;

type ConversationRepository = ReturnType<typeof createConversationRepository>;

/** 调度服务依赖；会话仓储直接取真实仓储的方法子集，不再手写一份镜像类型。 */
export type ChatDispatchServiceDeps = {
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
    resolveProviderModel: (_model: ModelConfig, _options: ResolveProviderModelOptions) => ResolvedProviderModel;
  };
  /** 会话仓储。 */
  conversationRepository: Pick<
    ConversationRepository,
    | 'saveLoadingState'
    | 'markLoadingStateStarted'
    | 'removeLoadingState'
    | 'upsertBranchLoadingState'
    | 'removeBranchLoadingState'
    | 'getConversation'
    | 'appendUserMessage'
    | 'appendAssistantMessage'
    | 'editUserMessage'
    | 'truncateMessagesAfter'
    | 'rollbackTurnMessages'
    | 'appendAssistantBranch'
    | 'appendAssistantBranchChunk'
    | 'finishAssistantBranch'
    | 'failAssistantBranch'
    | 'restartAssistantBranch'
  >;
  /** port 总线。 */
  portBus: {
    /** 向 promptTab 推送事件。 */
    publishToPromptTab: (_event: ChatStreamEvent) => void;
  };
  /** 启动流式请求。 */
  streamText: (_input: {
    /** AI SDK 模型对象。 */
    model: LanguageModel;
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
  logger?: DispatchLogger;
  /** 生成会话 id。 */
  createSessionId?: () => string;
  /** 生成消息 id。 */
  createMessageId?: () => string;
  /** 获取当前时间。 */
  now?: () => number;
};
