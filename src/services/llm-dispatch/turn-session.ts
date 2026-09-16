import { createLoadingState } from '../../domain/loading/loading-state-schema';
import type { ChatDispatchServiceDeps, ChatStreamEvent, ChatStreamResult, ConversationHistoryMessage, DispatchLogger, InitialBranchPlan, MultiBranchStreamSession } from './dispatch-types';
import { getErrorMessage } from './stream-failure';
import type { createStreamSessionFactory } from './stream-session';
import { resolveAggregateStatus } from './turn-plan';

/** 启动一整轮（主分支 + 并行分支）所需的输入。 */
export type TurnSessionInput = {
  /** 归一化页面 URL。 */
  normalizedUrl: string;
  /** promptTab 稳定 id。 */
  promptTabId: string;
  /** 助手消息 id。 */
  messageId: string;
  /** 本轮会话 id。 */
  sessionId: string;
  /** 本轮用户消息 id。 */
  userMessageId?: string;
  /** 失败时是否回滚本轮新增消息。 */
  rollbackOnFailure?: boolean;
  /** 首轮分支执行计划。 */
  initialBranchPlans: InitialBranchPlan[];
  /** 发给模型的完整消息。 */
  streamMessages: ConversationHistoryMessage[];
  /** 单次大模型调用超时秒数。 */
  requestTimeoutSeconds: number;
};

/** 创建整轮启动器：先持久化 loading 再启动网络；协调器等待所有分支结束后清理，公开结果仍对应主回答。 */
export const createTurnStarter = ({
  deps,
  logger,
  now,
  publish,
  createStreamSession,
}: {
  /** 会话仓储依赖。 */
  deps: Pick<ChatDispatchServiceDeps, 'conversationRepository'>;
  /** 结构化日志。 */
  logger: DispatchLogger;
  /** 当前时间。 */
  now: () => number;
  /** 安全推送 port 事件。 */
  publish: (event: ChatStreamEvent) => void;
  /** 流执行器。 */
  createStreamSession: ReturnType<typeof createStreamSessionFactory>;
}) => {
  /** 消息占位已创建；启动失败时收敛所有分支或按 rollback 语义整轮回滚，不留下无人消费的 loading。 */
  const saveTurnLoading = async (input: TurnSessionInput) => {
    try {
      await deps.conversationRepository.saveLoadingState(createLoadingState({
        normalizedUrl: input.normalizedUrl,
        promptTabId: input.promptTabId,
        sessionId: input.sessionId,
        now: now(),
      }));
    } catch (error) {
      let rolledBack = false;
      if (input.rollbackOnFailure && input.userMessageId) {
        try {
          await deps.conversationRepository.rollbackTurnMessages({
            normalizedUrl: input.normalizedUrl,
            promptTabId: input.promptTabId,
            userMessageId: input.userMessageId,
            assistantMessageId: input.messageId,
            now: now(),
          });
          rolledBack = true;
        } catch (rollbackError) {
          logger.error('chat.rollback.failed', {
            normalizedUrl: input.normalizedUrl,
            promptTab: input.promptTabId,
            sessionId: input.sessionId,
            messageId: input.messageId,
            reason: getErrorMessage(rollbackError, 'rollback failed'),
          });
        }
      }
      // 回滚失败时仍需收敛已持久化的占位，避免留下没有会话消费的 loading 分支。
      if (!rolledBack) {
        const failure = {
          normalizedUrl: input.normalizedUrl,
          promptTabId: input.promptTabId,
          messageId: input.messageId,
          errorMessage: null,
          status: 'error' as const,
          durationMs: null,
          now: now(),
        };
        await Promise.allSettled(input.initialBranchPlans.map((plan) => deps.conversationRepository.failAssistantBranch({
          ...failure, branchId: plan.branchId,
        })));
      }
      try {
        await deps.conversationRepository.removeLoadingState(input.normalizedUrl, input.promptTabId, input.sessionId);
      } catch {
        // 保留最初的启动错误；此时尚未创建任何网络请求和定时器。
      }
      throw error;
    }
  };

  return async (input: TurnSessionInput): Promise<MultiBranchStreamSession> => {
    await saveTurnLoading(input);
    const primaryPlan = input.initialBranchPlans[0];
    if (!primaryPlan) throw new Error(`primary branch plan missing: ${input.promptTabId}`);
    logger.debug?.('chat.turn.prepared', {
      normalizedUrl: input.normalizedUrl,
      promptTab: input.promptTabId,
      sessionId: input.sessionId,
      messageId: input.messageId,
      messageCount: input.streamMessages.length,
      systemPromptLength: input.streamMessages[0]?.role === 'system' ? input.streamMessages[0].content.length : 0,
      imageCount: input.streamMessages.reduce((total, message) => total + message.images.length, 0),
      models: input.initialBranchPlans.map((plan) => plan.modelId),
      timeoutSeconds: input.requestTimeoutSeconds,
      rollbackOnFailure: input.rollbackOnFailure ?? false,
    });
    const branchSessions = input.initialBranchPlans.slice(1).map((plan) => createStreamSession({
      normalizedUrl: input.normalizedUrl,
      promptTabId: input.promptTabId,
      messageId: input.messageId,
      branchId: plan.branchId,
      model: plan.model,
      resolvedModel: plan.resolvedModel,
      streamMessages: input.streamMessages,
      requestTimeoutSeconds: input.requestTimeoutSeconds,
    }));
    const primary = createStreamSession({
      normalizedUrl: input.normalizedUrl,
      promptTabId: input.promptTabId,
      messageId: input.messageId,
      branchId: primaryPlan.branchId,
      sessionId: input.sessionId,
      model: primaryPlan.model,
      resolvedModel: primaryPlan.resolvedModel,
      streamMessages: input.streamMessages,
      requestTimeoutSeconds: input.requestTimeoutSeconds,
      primary: true,
      siblings: branchSessions,
      ...(input.rollbackOnFailure && input.userMessageId ? { rollbackUserMessageId: input.userMessageId } : {}),
    });
    const sessions = [primary, ...branchSessions];
    const done = (async () => {
      const outcomes = await Promise.allSettled(sessions.map((session) => session.done));
      const results = outcomes.map((outcome, index): ChatStreamResult => outcome.status === 'fulfilled'
        ? outcome.value
        : {
          sessionId: sessions[index]!.sessionId,
          messageId: input.messageId,
          status: 'error',
          errorMessage: getErrorMessage(outcome.reason, 'stream lifecycle failed'),
          persisted: false,
        });
      try {
        await deps.conversationRepository.removeLoadingState(input.normalizedUrl, input.promptTabId, input.sessionId);
      } catch (error) {
        logger.warn('chat.loading.cleanup_failed', {
          normalizedUrl: input.normalizedUrl,
          promptTab: input.promptTabId,
          sessionId: input.sessionId,
          reason: getErrorMessage(error, 'cleanup failed'),
        });
      }
      publish({
        type: 'LOADING_STATE_UPDATE',
        normalizedUrl: input.normalizedUrl,
        promptTabId: input.promptTabId,
        sessionId: input.sessionId,
        status: resolveAggregateStatus(results),
      });
      return results[0]!;
    })();
    return {
      ...primary,
      ...(input.userMessageId ? { userMessageId: input.userMessageId } : {}),
      branches: input.initialBranchPlans.map(({ branchId, modelId, modelLabel }) => ({ branchId, modelId, modelLabel })),
      branchSessions,
      cancel: () => { for (const session of sessions) session.cancel(); },
      done,
    };
  };
};
