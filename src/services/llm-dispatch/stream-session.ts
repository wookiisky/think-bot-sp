import type { ModelConfig } from '../../domain/config/config-schema';
import { consumeBufferedTextStream } from './buffered-text-stream';
import type { BranchStreamSession, ChatDispatchServiceDeps, ChatStreamEvent, ChatStreamResult, ConversationHistoryMessage, DispatchLogger } from './dispatch-types';
import { buildModelInvocation } from './prompt-assembly';
import type { ResolvedProviderModel } from './provider-registry';
import { createModelAbortScope, getErrorMessage, resolveInvocationDurationMs, resolveStreamFailure } from './stream-failure';

/** 一条流的定位信息。 */
export type StreamScope = {
  /** 归一化页面 URL。 */
  normalizedUrl: string;
  /** promptTab 稳定 id。 */
  promptTabId: string;
  /** 助手消息 id。 */
  messageId: string;
  /** 分支稳定 id。 */
  branchId: string;
};

/** 启动一条流所需的全部输入。 */
export type StreamSessionInput = StreamScope & {
  /** 分支对应模型配置。 */
  model: ModelConfig;
  /** provider 解析后的模型。 */
  resolvedModel: ResolvedProviderModel;
  /** 单次大模型调用超时秒数。 */
  requestTimeoutSeconds: number;
  /** 发给模型的完整消息。 */
  streamMessages: ConversationHistoryMessage[];
  /** 复用的会话 id；缺省时新建。 */
  sessionId?: string;
  /** 是否为主回答流；影响事件名与 loading 记录方式。 */
  primary?: boolean;
  /** 主回答回滚时需要一并取消并等待的兄弟分支。 */
  siblings?: BranchStreamSession[];
  /** 主回答失败时要回滚的用户消息 id。 */
  rollbackUserMessageId?: string;
};

/** 创建流执行器：一个执行器负责主回答和额外分支的消费、持久化与资源回收。 */
export const createStreamSessionFactory = ({
  deps,
  logger,
  now,
  createSessionId,
  publish,
}: {
  /** 仓储与模型调用依赖。 */
  deps: Pick<ChatDispatchServiceDeps, 'conversationRepository' | 'streamText'>;
  /** 结构化日志。 */
  logger: DispatchLogger;
  /** 当前时间。 */
  now: () => number;
  /** 生成会话 id。 */
  createSessionId: () => string;
  /** 安全推送 port 事件。 */
  publish: (event: ChatStreamEvent) => void;
}) => (input: StreamSessionInput): BranchStreamSession => {
  const sessionId = input.sessionId ?? createSessionId();
  const resolvedModel = input.resolvedModel;
  const abortScope = createModelAbortScope(input.requestTimeoutSeconds);
  const scope = {
    normalizedUrl: input.normalizedUrl,
    promptTabId: input.promptTabId,
    messageId: input.messageId,
    branchId: input.branchId,
  };
  const eventScope = { ...scope, sessionId };
  const logScope = {
    normalizedUrl: input.normalizedUrl,
    promptTab: input.promptTabId,
    sessionId,
    messageId: input.messageId,
    ...(!input.primary ? { branchId: input.branchId } : {}),
  };
  const kind = input.primary ? 'chat' : 'branch';
  const done = (async (): Promise<ChatStreamResult> => {
    let streamStartedAt: number | null = null;
    // 首包耗时只用于日志，取墙钟时间，不消耗注入的 now() 序列。
    let streamStartedWallClock = 0;
    let persistenceFailed = false;
    let flushCount = 0;
    let contentLength = 0;
    try {
      const startedAt = now();
      if (input.primary) {
        await deps.conversationRepository.markLoadingStateStarted({
          normalizedUrl: input.normalizedUrl,
          promptTabId: input.promptTabId,
          expectedSessionId: sessionId,
          startedAt,
          now: startedAt,
        });
      } else {
        await deps.conversationRepository.upsertBranchLoadingState({
          ...scope, sessionId, modelId: input.model.id, status: 'loading', startedAt, now: now(),
        });
      }
      logger.info(`${kind}.stream.started`, {
        ...logScope,
        provider: resolvedModel.providerId,
        modelId: input.model.id,
        messageCount: input.streamMessages.length,
        timeoutSeconds: input.requestTimeoutSeconds,
      });
      publish({
        ...eventScope,
        type: input.primary ? 'CHAT_STREAM_STARTED' : 'BRANCH_STREAM_STARTED',
        modelId: input.model.id,
        modelLabel: resolvedModel.modelLabel,
        startedAt,
      });
      streamStartedAt = startedAt;
      streamStartedWallClock = Date.now();
      const response = await deps.streamText(buildModelInvocation({
        resolvedModel,
        messages: input.streamMessages,
        abortSignal: abortScope.signal,
      }));
      await consumeBufferedTextStream(response.textStream, {
        signal: abortScope.signal,
        onFirstChunk: () => logger.info(`${kind}.stream.first_chunk`, {
          ...logScope,
          ttfbMs: Math.max(0, Date.now() - streamStartedWallClock),
        }),
        write: async (chunk) => {
          flushCount += 1;
          contentLength += chunk.length;
          try {
            // 主分支同样按显式 branchId 写入，避免用户中途切换选中分支时写错目标。
            await deps.conversationRepository.appendAssistantBranchChunk({ ...scope, chunk, now: now() });
          } catch (error) {
            persistenceFailed = true;
            throw error;
          }
          publish({
            ...eventScope,
            type: input.primary ? 'CHAT_STREAM_CHUNK' : 'BRANCH_STREAM_CHUNK',
            chunk,
          });
        },
      });
      const finishedAt = now();
      const durationMs = resolveInvocationDurationMs(streamStartedAt, finishedAt);
      await deps.conversationRepository.finishAssistantBranch({ ...scope, durationMs, now: finishedAt });
      publish({
        ...eventScope,
        type: input.primary ? 'CHAT_STREAM_FINISHED' : 'BRANCH_STREAM_FINISHED',
        durationMs,
      });
      logger.info(`${kind}.stream.completed`, { ...logScope, durationMs, flushCount, contentLength });
      return { sessionId, messageId: input.messageId, status: 'done', errorMessage: null, persisted: true };
    } catch (error) {
      const failure = persistenceFailed
        ? { status: 'error' as const, errorMessage: getErrorMessage(error, 'failed to persist stream text') }
        : resolveStreamFailure(error, abortScope, input.requestTimeoutSeconds, kind);
      abortScope.cancel();
      let status = failure.status;
      let errorMessage = failure.errorMessage;
      const failedAt = now();
      const durationMs = resolveInvocationDurationMs(streamStartedAt, failedAt);
      let persisted = true;
      try {
        await deps.conversationRepository.failAssistantBranch({ ...scope, errorMessage: null, status, durationMs, now: failedAt });
      } catch (persistenceError) {
        // 结果未落库必须显式报告；仍继续清理资源和发布失败事件。
        status = 'error';
        errorMessage = getErrorMessage(persistenceError, 'failed to persist stream result');
        persisted = false;
      }
      let rolledBack = false;
      if (input.primary && input.rollbackUserMessageId && status === 'error') {
        for (const sibling of input.siblings ?? []) sibling.cancel();
        await Promise.allSettled((input.siblings ?? []).map((sibling) => sibling.done));
        try {
          await deps.conversationRepository.rollbackTurnMessages({
            normalizedUrl: input.normalizedUrl,
            promptTabId: input.promptTabId,
            userMessageId: input.rollbackUserMessageId,
            assistantMessageId: input.messageId,
            now: now(),
          });
          rolledBack = true;
          persisted = false;
          logger.info('chat.rollback.completed', { ...logScope, userMessageId: input.rollbackUserMessageId });
        } catch (rollbackError) {
          logger.error('chat.rollback.failed', { ...logScope, reason: getErrorMessage(rollbackError, 'rollback failed') });
        }
      }
      if (status === 'cancelled') {
        logger.info(`${kind}.stream.cancelled`, { ...logScope, durationMs, flushCount, contentLength });
        publish({
          ...eventScope,
          type: input.primary ? 'CHAT_STREAM_CANCELLED' : 'BRANCH_STREAM_CANCELLED',
          durationMs,
        });
      } else {
        logger.error(`${kind}.stream.failed`, {
          ...logScope,
          reason: errorMessage,
          provider: resolvedModel.providerId,
          modelId: input.model.id,
          durationMs,
          flushCount,
          contentLength,
          timedOut: abortScope.isTimedOut(),
          persisted,
          rolledBack,
        });
        publish({
          ...eventScope,
          type: input.primary ? 'CHAT_STREAM_FAILED' : 'BRANCH_STREAM_FAILED',
          errorMessage,
          durationMs,
          ...(rolledBack ? { rollbackOnFailure: true, userMessageId: input.rollbackUserMessageId } : {}),
        });
      }
      return { sessionId, messageId: input.messageId, status, errorMessage, persisted };
    } finally {
      abortScope.clear();
      if (!input.primary) {
        try {
          await deps.conversationRepository.removeBranchLoadingState(input.normalizedUrl, input.promptTabId, input.branchId);
        } catch (error) {
          logger.warn('branch.loading.cleanup_failed', { ...logScope, reason: getErrorMessage(error, 'cleanup failed') });
        }
      }
    }
  })();
  return {
    sessionId, messageId: input.messageId, branchId: input.branchId,
    modelId: input.model.id, modelLabel: resolvedModel.modelLabel,
    cancel: () => abortScope.cancel(), done,
  };
};
