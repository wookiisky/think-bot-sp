import { hasActiveLoading } from '../../domain/loading/loading-state-schema';
import { describeError, type Logger } from '../logger/logger';

/** 孤儿 loading 收敛时写入分支的错误文案。 */
export const ORPHANED_LOADING_ERROR_MESSAGE = '后台服务已重启，本次请求已中断，请重新发送';

type BranchRecordLike = {
  /** 分支稳定 id。 */
  id: string;
  /** 分支状态。 */
  status: 'loading' | 'done' | 'error' | 'cancelled';
};

type MessageRecordLike = {
  /** 消息 id。 */
  id: string;
  /** 消息角色。 */
  role: 'user' | 'assistant' | 'system';
  /** 消息状态。 */
  status: 'loading' | 'done' | 'error' | 'cancelled';
  /** 助手分支。 */
  branches: BranchRecordLike[];
  /** 选中分支 id。 */
  selectedBranchId: string | null;
};

type LoadingStateLike = {
  /** 归一化页面 URL。 */
  normalizedUrl: string;
  /** promptTab 稳定 id。 */
  promptTabId: string;
  /** 本次流式会话 id。 */
  sessionId: string;
  /** 主 loading 状态。 */
  promptTabStatus: string;
  /** 主请求开始时间。 */
  startedAt: number | null;
  /** 分支 loading 状态。 */
  branchStates: Array<{
    /** 分支稳定 id。 */
    branchId: string;
    /** 分支状态。 */
    status: string;
    /** 分支开始时间。 */
    startedAt: number | null;
  }>;
};

type FailInput = {
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
  /** 调用耗时。 */
  durationMs: number | null;
  /** 当前时间。 */
  now: number;
};

type ReconcilerEvent =
  | {
      /** 事件类型。 */
      type: 'CHAT_STREAM_FAILED' | 'BRANCH_STREAM_FAILED';
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
      /** 调用耗时。 */
      durationMs: number | null;
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
      /** 最终状态。 */
      status: 'error';
    };

type ReconcilerDeps = {
  /** 会话仓储。 */
  conversationRepository: {
    /** 读取全部 loading 记录。 */
    getAllLoadingStates: () => Promise<LoadingStateLike[]>;
    /** 读取单个 loading 记录。 */
    getLoadingState: (_normalizedUrl: string, _promptTabId: string) => Promise<LoadingStateLike | null>;
    /** 读取会话。 */
    getConversation: (_normalizedUrl: string, _promptTabId: string) => Promise<{ messages: MessageRecordLike[] } | null>;
    /** 收敛某个分支为失败态。 */
    failAssistantBranch: (_input: FailInput) => Promise<unknown>;
    /** 删除 loading 记录。 */
    removeLoadingState: (_normalizedUrl: string, _promptTabId: string) => Promise<unknown>;
  };
  /** 活跃会话注册表。 */
  sessionRegistry: {
    /** 当前 worker 内该 promptTab 是否仍有活跃会话。 */
    hasPromptTabSessions: (_input: { normalizedUrl: string; promptTabId: string }) => boolean;
  };
  /** port 总线。 */
  portBus: {
    /** 向 promptTab 推送事件。 */
    publishToPromptTab: (_event: ReconcilerEvent) => void;
  };
  /** 结构化日志。 */
  logger?: Pick<Logger, 'info' | 'warn'>;
  /** 当前时间。 */
  now?: () => number;
};

/** 单个 promptTab 的收敛结果。 */
export type ReconcileOutcome = 'idle' | 'active' | 'reconciled';

/** 已持久化的 loading 在当前 worker 内无对应会话即为孤儿。 */
const isOrphaned = (loadingState: LoadingStateLike | null, deps: ReconcilerDeps): loadingState is LoadingStateLike => {
  if (!loadingState || !hasActiveLoading(loadingState)) {
    return false;
  }
  return !deps.sessionRegistry.hasPromptTabSessions({
    normalizedUrl: loadingState.normalizedUrl,
    promptTabId: loadingState.promptTabId,
  });
};

/**
 * 收敛 service worker 重启后遗留的 loading。
 *
 * worker 被回收时，进行中的请求、超时定时器和内存里的会话注册表一并消失，
 * 但 storage 里的 loading 记录和 `status: 'loading'` 的助手分支还在。
 * 侧栏重连后若原样恢复，就会永远停在“生成中”且无人收尾。
 */
export const createLoadingStateReconciler = (deps: ReconcilerDeps) => {
  const logger = deps.logger ?? { info: () => undefined, warn: () => undefined };
  const now = deps.now ?? (() => Date.now());

  const publishSafely = (event: ReconcilerEvent) => {
    try {
      deps.portBus.publishToPromptTab(event);
    } catch {
      // port 断开或监听方异常时，恢复链路仍以持久化状态为准。
    }
  };

  /** 把一条 loading 记录及其助手分支收敛为失败态，并向侧栏广播。 */
  const reconcileLoadingState = async (loadingState: LoadingStateLike) => {
    const { normalizedUrl, promptTabId, sessionId } = loadingState;
    const startedAtByBranch = new Map(loadingState.branchStates.map((branch) => [branch.branchId, branch.startedAt]));
    const failedAt = now();
    let failedBranchCount = 0;
    const conversation = await deps.conversationRepository.getConversation(normalizedUrl, promptTabId);

    for (const message of conversation?.messages ?? []) {
      if (message.role !== 'assistant') {
        continue;
      }
      const selectedBranchId = message.selectedBranchId ?? message.branches[0]?.id ?? null;
      for (const branch of message.branches) {
        if (branch.status !== 'loading') {
          continue;
        }
        const isPrimary = branch.id === selectedBranchId;
        const startedAt = isPrimary ? (loadingState.startedAt ?? startedAtByBranch.get(branch.id) ?? null) : (startedAtByBranch.get(branch.id) ?? null);
        const durationMs = startedAt !== null && failedAt >= startedAt ? failedAt - startedAt : null;
        try {
          await deps.conversationRepository.failAssistantBranch({
            normalizedUrl,
            promptTabId,
            messageId: message.id,
            branchId: branch.id,
            errorMessage: ORPHANED_LOADING_ERROR_MESSAGE,
            status: 'error',
            durationMs,
            now: failedAt,
          });
        } catch (error) {
          logger.warn('loading.reconcile.branch_failed', {
            normalizedUrl,
            promptTab: promptTabId,
            messageId: message.id,
            branchId: branch.id,
            reason: describeError(error),
          });
        }
        failedBranchCount += 1;
        publishSafely({
          type: isPrimary ? 'CHAT_STREAM_FAILED' : 'BRANCH_STREAM_FAILED',
          normalizedUrl,
          promptTabId,
          sessionId,
          messageId: message.id,
          branchId: branch.id,
          errorMessage: ORPHANED_LOADING_ERROR_MESSAGE,
          durationMs,
        });
      }
    }

    try {
      await deps.conversationRepository.removeLoadingState(normalizedUrl, promptTabId);
    } catch (error) {
      logger.warn('loading.reconcile.cleanup_failed', {
        normalizedUrl,
        promptTab: promptTabId,
        reason: describeError(error),
      });
    }
    publishSafely({ type: 'LOADING_STATE_UPDATE', normalizedUrl, promptTabId, sessionId, status: 'error' });
    logger.warn('loading.reconcile.orphan_converged', {
      normalizedUrl,
      promptTab: promptTabId,
      sessionId,
      failedBranchCount,
      startedAt: loadingState.startedAt,
      staleMs: loadingState.startedAt === null ? null : Math.max(0, failedAt - loadingState.startedAt),
    });
  };

  return {
    /** 检查单个 promptTab：无 loading 返回 idle，会话仍活跃返回 active，孤儿则收敛后返回 reconciled。 */
    async reconcilePromptTab(normalizedUrl: string, promptTabId: string): Promise<ReconcileOutcome> {
      const loadingState = await deps.conversationRepository.getLoadingState(normalizedUrl, promptTabId);
      if (!hasActiveLoading(loadingState)) {
        return 'idle';
      }
      if (!isOrphaned(loadingState, deps)) {
        return 'active';
      }
      await reconcileLoadingState(loadingState);
      return 'reconciled';
    },

    /** worker 启动时扫描全部 loading 记录，收敛所有孤儿；返回收敛条数。 */
    async reconcileAll(): Promise<number> {
      const loadingStates = await deps.conversationRepository.getAllLoadingStates();
      let reconciled = 0;
      for (const snapshot of loadingStates) {
        // 扫描期间可能已有新请求接管同一 promptTab，逐条重读后再判定。
        const latest = await deps.conversationRepository.getLoadingState(snapshot.normalizedUrl, snapshot.promptTabId);
        if (!isOrphaned(latest, deps) || latest.sessionId !== snapshot.sessionId) {
          continue;
        }
        await reconcileLoadingState(latest);
        reconciled += 1;
      }
      return reconciled;
    },
  };
};

export type LoadingStateReconciler = ReturnType<typeof createLoadingStateReconciler>;
