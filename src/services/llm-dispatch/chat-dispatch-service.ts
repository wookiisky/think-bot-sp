import { createDefaultConfig, resolveModelReasoningEffort, type ExtensionConfig, type ModelConfig } from '../../domain/config/config-schema';
import type { AssistantMessageRecord } from '../../domain/conversation/conversation-state';
import type {
  BranchStreamSession,
  ChatDispatchInput,
  ChatDispatchServiceDeps,
  ChatStreamEvent,
  ChatStreamResult,
  ConversationHistoryMessage,
  MultiBranchStreamSession,
  StreamSession,
} from './dispatch-types';
import {
  buildConversationHistoryBeforeAssistant,
  buildConversationHistoryThroughUser,
  buildModelMessages,
  historyHasImages,
  toConversationHistory,
} from './prompt-assembly';
import { createStreamSessionFactory } from './stream-session';
import { resolveInitialBranchPlans, resolveTurnModelId, toInitialBranchSeeds } from './turn-plan';
import { createTurnStarter } from './turn-session';

/**
 * 主聊天流调度服务。
 * 五个入口只负责“读取会话、决定模型、变更仓储”；流的消费、持久化与收敛统一交给 stream-session / turn-session。
 */
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
    } catch (error) {
      logger.warn('port.publish_failed', {
        type: event.type,
        normalizedUrl: event.normalizedUrl,
        promptTab: event.promptTabId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  };
  /** 兼容旧测试夹具，缺省 getConfig 时按“无并行模型”处理。 */
  const loadRuntimeConfig = async (): Promise<ExtensionConfig> => {
    if (typeof deps.configRepository.getConfig !== 'function') {
      return createDefaultConfig();
    }
    return createDefaultConfig(await deps.configRepository.getConfig());
  };
  /** 读取模型配置，不存在时直接失败。 */
  const requireModel = async (modelId: string): Promise<ModelConfig> => {
    const model = await deps.configRepository.getModelById(modelId);
    if (!model) {
      throw new Error(`model not found: ${modelId}`);
    }
    return model;
  };

  const createStreamSession = createStreamSessionFactory({ deps, logger, now, createSessionId, publish: publishToPromptTabSafely });
  const startTurnSession = createTurnStarter({ deps, logger, now, publish: publishToPromptTabSafely, createStreamSession });

  /**
   * 为一整轮准备执行计划：会话 id、助手消息 id、首轮分支计划与最终模型消息。
   * 发送、编辑重发、用户重试共用这一段，避免三份流水线各自漂移。
   */
  const prepareTurn = async (input: {
    /** 当前配置。 */
    config: ExtensionConfig;
    /** promptTab 稳定 id。 */
    promptTabId: string;
    /** 主模型 id。 */
    primaryModelId: string;
    /** 截止到本轮用户消息的完整历史。 */
    history: ConversationHistoryMessage[];
    /** 当前请求真正附带的页面正文。 */
    pageContent: string;
  }) => {
    const sessionId = createSessionId();
    const assistantMessageId = createMessageId();
    const initialBranchPlans = await resolveInitialBranchPlans({
      deps,
      config: input.config,
      promptTabId: input.promptTabId,
      primaryModelId: input.primaryModelId,
      createMessageId,
      hasImages: historyHasImages(input.history),
      logger,
    });
    const primaryBranch = initialBranchPlans[0];
    if (!primaryBranch) {
      throw new Error(`primary branch plan missing: ${input.promptTabId}`);
    }
    const streamMessages = buildModelMessages({
      conversationMessages: input.history,
      promptContext: {
        systemPrompt: input.config.basic.systemPrompt,
        pageContent: input.pageContent,
      },
    });
    return {
      sessionId,
      assistantMessageId,
      initialBranchPlans,
      primaryBranch,
      initialBranches: toInitialBranchSeeds(initialBranchPlans),
      streamMessages,
      requestTimeoutSeconds: input.config.basic.llmRequestTimeoutSeconds,
    };
  };

  /** 在既有助手消息上启动单条分支流之前的公共准备：历史、模型解析与图片能力校验。 */
  const prepareSingleBranch = async (input: {
    /** 当前配置。 */
    config: ExtensionConfig;
    /** 分支模型。 */
    model: ModelConfig;
    /** 不含当前助手轮的历史。 */
    history: ConversationHistoryMessage[];
    /** 当前请求真正附带的页面正文。 */
    pageContent: string;
  }) => {
    const resolvedModel = deps.providerRegistry.resolveProviderModel(input.model, {
      reasoningEffort: resolveModelReasoningEffort(input.config.basic, input.model),
    });
    if (historyHasImages(input.history) && !resolvedModel.supportsImages) {
      throw new Error('model does not support images');
    }
    return {
      resolvedModel,
      streamMessages: buildModelMessages({
        conversationMessages: input.history,
        promptContext: {
          systemPrompt: input.config.basic.systemPrompt,
          pageContent: input.pageContent,
        },
      }),
    };
  };

  /** 定位目标用户消息之后的第一条助手消息，供编辑重发与用户重试沿用模型。 */
  const findAssistantAfterUser = (
    conversation: NonNullable<Awaited<ReturnType<ChatDispatchServiceDeps['conversationRepository']['getConversation']>>>,
    userMessageId: string,
  ): AssistantMessageRecord | null => {
    const targetIndex = conversation.messages.findIndex((message) => message.id === userMessageId && message.role === 'user');
    if (targetIndex < 0) {
      throw new Error(`user message not found: ${userMessageId}`);
    }
    for (const message of conversation.messages.slice(targetIndex + 1)) {
      if (message.role === 'assistant') {
        return message as AssistantMessageRecord;
      }
    }
    return null;
  };

  return {
    /** 启动一次主聊天流。 */
    async dispatchChat(input: ChatDispatchInput): Promise<MultiBranchStreamSession> {
      const [config, model, conversation] = await Promise.all([
        loadRuntimeConfig(),
        requireModel(input.modelId),
        deps.conversationRepository.getConversation(input.normalizedUrl, input.promptTabId),
      ]);
      const userMessageId = createMessageId();
      const turn = await prepareTurn({
        config,
        promptTabId: input.promptTabId,
        primaryModelId: model.id,
        history: [
          ...toConversationHistory(conversation?.messages ?? []),
          { role: 'user', content: input.content, images: input.images },
        ],
        pageContent: input.pageContent,
      });

      await deps.conversationRepository.appendUserMessage({
        normalizedUrl: input.normalizedUrl,
        promptTabId: input.promptTabId,
        messageId: userMessageId,
        content: input.content,
        images: input.images,
        now: now(),
        ...(input.displayText !== undefined ? { displayContent: input.displayText } : {}),
      });
      await deps.conversationRepository.appendAssistantMessage({
        normalizedUrl: input.normalizedUrl,
        promptTabId: input.promptTabId,
        messageId: turn.assistantMessageId,
        initialBranches: turn.initialBranches,
        selectedBranchId: turn.primaryBranch.branchId,
        now: now(),
      });
      return startTurnSession({
        normalizedUrl: input.normalizedUrl,
        promptTabId: input.promptTabId,
        messageId: turn.assistantMessageId,
        sessionId: turn.sessionId,
        initialBranchPlans: turn.initialBranchPlans,
        streamMessages: turn.streamMessages,
        requestTimeoutSeconds: turn.requestTimeoutSeconds,
        userMessageId,
        rollbackOnFailure: input.rollbackOnFailure ?? false,
      });
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
      const previousAssistant = findAssistantAfterUser(conversation, input.messageId);
      const modelId = previousAssistant ? resolveTurnModelId(previousAssistant) : null;
      if (!modelId) {
        throw new Error(`assistant model not found after user message: ${input.messageId}`);
      }
      const model = await requireModel(modelId);
      const turn = await prepareTurn({
        config,
        promptTabId: input.promptTabId,
        primaryModelId: model.id,
        history: buildConversationHistoryThroughUser(conversation, input.messageId, input.content),
        pageContent: input.pageContent,
      });

      await deps.conversationRepository.editUserMessage({
        normalizedUrl: input.normalizedUrl,
        promptTabId: input.promptTabId,
        messageId: input.messageId,
        content: input.content,
        newAssistantMessageId: turn.assistantMessageId,
        initialBranches: turn.initialBranches,
        selectedBranchId: turn.primaryBranch.branchId,
        now: now(),
      });
      return startTurnSession({
        normalizedUrl: input.normalizedUrl,
        promptTabId: input.promptTabId,
        messageId: turn.assistantMessageId,
        sessionId: turn.sessionId,
        initialBranchPlans: turn.initialBranchPlans,
        streamMessages: turn.streamMessages,
        requestTimeoutSeconds: turn.requestTimeoutSeconds,
      });
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
      const targetAssistant = findAssistantAfterUser(conversation, input.messageId);
      if (!targetAssistant) {
        throw new Error(`assistant message not found after user message: ${input.messageId}`);
      }
      const modelId = resolveTurnModelId(targetAssistant);
      if (!modelId) {
        throw new Error(`assistant model not found: ${targetAssistant.id}`);
      }
      const model = await requireModel(modelId);
      const turn = await prepareTurn({
        config,
        promptTabId: input.promptTabId,
        primaryModelId: model.id,
        history: buildConversationHistoryThroughUser(conversation, input.messageId),
        pageContent: input.pageContent,
      });

      await deps.conversationRepository.truncateMessagesAfter({
        normalizedUrl: input.normalizedUrl,
        promptTabId: input.promptTabId,
        messageId: input.messageId,
        now: now(),
      });
      await deps.conversationRepository.appendAssistantMessage({
        normalizedUrl: input.normalizedUrl,
        promptTabId: input.promptTabId,
        messageId: turn.assistantMessageId,
        initialBranches: turn.initialBranches,
        selectedBranchId: turn.primaryBranch.branchId,
        now: now(),
      });
      return startTurnSession({
        normalizedUrl: input.normalizedUrl,
        promptTabId: input.promptTabId,
        messageId: turn.assistantMessageId,
        sessionId: turn.sessionId,
        initialBranchPlans: turn.initialBranchPlans,
        streamMessages: turn.streamMessages,
        requestTimeoutSeconds: turn.requestTimeoutSeconds,
      });
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
      const model = await requireModel(targetBranch.modelId);
      const config = await loadRuntimeConfig();
      const branch = await prepareSingleBranch({
        config,
        model,
        history: buildConversationHistoryBeforeAssistant(conversation, input.messageId),
        pageContent: input.pageContent,
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
      return createStreamSession({
        normalizedUrl: input.normalizedUrl,
        promptTabId: input.promptTabId,
        messageId: input.messageId,
        branchId: input.branchId,
        model,
        resolvedModel: branch.resolvedModel,
        requestTimeoutSeconds: config.basic.llmRequestTimeoutSeconds,
        streamMessages: branch.streamMessages,
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
      const targetMessage = conversation.messages.find((message) => message.id === input.messageId && message.role === 'assistant');
      if (!targetMessage) {
        throw new Error(`assistant message not found: ${input.messageId}`);
      }
      const model = await requireModel(input.modelId);
      const branchId = createMessageId();
      const branch = await prepareSingleBranch({
        config,
        model,
        history: buildConversationHistoryBeforeAssistant(conversation, input.messageId),
        pageContent: input.pageContent,
      });

      await deps.conversationRepository.appendAssistantBranch({
        normalizedUrl: input.normalizedUrl,
        promptTabId: input.promptTabId,
        messageId: input.messageId,
        branchId,
        modelId: model.id,
        modelLabel: branch.resolvedModel.modelLabel,
        now: now(),
      });
      return [
        createStreamSession({
          normalizedUrl: input.normalizedUrl,
          promptTabId: input.promptTabId,
          messageId: input.messageId,
          branchId,
          model,
          resolvedModel: branch.resolvedModel,
          requestTimeoutSeconds: config.basic.llmRequestTimeoutSeconds,
          streamMessages: branch.streamMessages,
        }),
      ];
    },
  };
};

export type {
  BranchStreamSession,
  ChatDispatchInput,
  ChatDispatchServiceDeps,
  ChatStreamEvent,
  ChatStreamResult,
  MultiBranchStreamSession,
  StreamSession,
};
