import type { SidebarPortEvent } from '../../services/runtime-messaging/sidebar-contract';
import {
  upsertAssistantBranch,
  upsertAssistantFailure,
  upsertAssistantMessage,
  type BranchMessageState,
  type ChatMessageState,
} from './workspace-state';

type StreamLabels = {
  primaryBranch: string;
  branch: string;
  error: string;
  cancelled: string;
  /** 恢复的 loading 已超过请求超时时的错误文案；缺省回退到 error。 */
  timeout?: string;
};

/** 恢复 loading 时的时钟与超时阈值；缺省不做过期判断。 */
export type RestoreLoadingOptions = {
  /** 当前时间。 */
  now: number;
  /** 请求超时阈值（毫秒）。 */
  timeoutMs: number;
};

/** 后台的超时定时器随 worker 一起消失过，前端按 startedAt 再做一次兜底判断。 */
const isRestoreExpired = (startedAt: number | null, options: RestoreLoadingOptions | undefined): startedAt is number =>
  startedAt !== null && options !== undefined && options.now - startedAt > options.timeoutMs;

const createAssistantMessage = (id: string): ChatMessageState => ({
  id,
  role: 'assistant',
  content: '',
  status: 'loading',
  errorMessage: null,
  branches: [],
  selectedBranchId: null,
});

/**
 * 恢复的 loading 已超过请求超时时，直接把过期分支标记为超时失败；
 * 返回 null 表示没有过期分支，走正常恢复。
 */
const failExpiredRestore = (
  messages: ChatMessageState[],
  event: Extract<SidebarPortEvent, { type: 'RESTORE_LOADING' }>,
  labels: StreamLabels,
  options: RestoreLoadingOptions | undefined,
): ChatMessageState[] | null => {
  const primaryExpired = isRestoreExpired(event.startedAt, options);
  const expiredBranchIds = new Set(
    event.branchStates
      .filter((branch) => branch.status === 'loading' && isRestoreExpired(branch.startedAt, options))
      .map((branch) => branch.branchId),
  );
  if (!primaryExpired && expiredBranchIds.size === 0) {
    return null;
  }

  const errorMessage = labels.timeout ?? labels.error;
  const existing = messages.find((message) => message.id === event.messageId && message.role === 'assistant') ?? null;
  if (!existing) {
    // 本地还没有这条消息，只能按主分支占位收敛。
    return upsertAssistantFailure(messages, {
      messageId: event.messageId,
      branchId: `${event.messageId}:primary`,
      errorMessage,
      modelId: '',
      modelLabel: labels.primaryBranch,
      isPrimary: true,
      durationMs: null,
      startedAt: null,
    });
  }

  const expiredBranches = existing.branches.filter(
    (branch) => branch.status === 'loading' && (expiredBranchIds.has(branch.id) || (primaryExpired && branch.isPrimary)),
  );
  if (expiredBranches.length === 0) {
    // 分支已经终态，不再回退。
    return messages;
  }
  return expiredBranches.reduce(
    (current, branch) =>
      upsertAssistantFailure(current, {
        messageId: event.messageId,
        branchId: branch.id,
        errorMessage,
        modelId: branch.modelId,
        modelLabel: branch.modelLabel,
        isPrimary: branch.isPrimary,
        durationMs: null,
        startedAt: null,
      }),
    messages,
  );
};

/** 主流可以早于命令响应到达，此时先补助手占位；分支流只更新已有消息。 */
const updateStreamBranch = (
  messages: ChatMessageState[],
  messageId: string,
  branchId: string,
  isPrimary: boolean,
  buildNext: (_branch: BranchMessageState | null) => BranchMessageState,
) => {
  const hasMessage = messages.some((message) => message.id === messageId && message.role === 'assistant');
  if (!hasMessage && !isPrimary) {
    return messages;
  }
  return upsertAssistantBranch(
    hasMessage ? messages : [...messages, createAssistantMessage(messageId)],
    messageId,
    branchId,
    buildNext,
  );
};

/** 两个聊天入口共用的消息转换；会话身份、订阅和命令状态由调用方管理。 */
export const reduceWorkspaceEvent = (
  messages: ChatMessageState[],
  event: SidebarPortEvent,
  labels: StreamLabels,
  restoreOptions?: RestoreLoadingOptions,
): ChatMessageState[] => {
  switch (event.type) {
    case 'CHAT_STREAM_STARTED':
    case 'BRANCH_STREAM_STARTED': {
      const isPrimary = event.type === 'CHAT_STREAM_STARTED';
      return updateStreamBranch(messages, event.messageId, event.branchId, isPrimary, (branch) => ({
        id: event.branchId,
        modelId: event.modelId,
        modelLabel: event.modelLabel,
        isPrimary: isPrimary || (branch?.isPrimary ?? false),
        content: branch?.content ?? '',
        status: 'loading',
        errorMessage: null,
        durationMs: null,
        startedAt: event.startedAt,
      }));
    }
    case 'CHAT_STREAM_CHUNK':
    case 'BRANCH_STREAM_CHUNK': {
      const isPrimary = event.type === 'CHAT_STREAM_CHUNK';
      return updateStreamBranch(messages, event.messageId, event.branchId, isPrimary, (branch) => ({
        id: event.branchId,
        modelId: branch?.modelId ?? '',
        modelLabel: branch?.modelLabel ?? (isPrimary ? labels.primaryBranch : labels.branch),
        isPrimary: branch?.isPrimary ?? isPrimary,
        content: `${branch?.content ?? ''}${event.chunk}`,
        status: 'loading',
        errorMessage: null,
        durationMs: branch?.durationMs ?? null,
        startedAt: branch?.startedAt ?? null,
      }));
    }
    case 'CHAT_STREAM_FINISHED':
    case 'CHAT_STREAM_CANCELLED': {
      const status = event.type === 'CHAT_STREAM_FINISHED' ? 'done' : 'cancelled';
      const errorMessage = status === 'cancelled' ? labels.cancelled : null;
      return upsertAssistantMessage(messages, event.messageId, (message) => ({
        ...(message ?? createAssistantMessage(event.messageId)),
        status,
        errorMessage,
        branches: (message?.branches ?? []).map((branch) =>
          branch.id === event.branchId
            ? { ...branch, status, errorMessage, durationMs: event.durationMs, startedAt: null }
            : branch,
        ),
        selectedBranchId: message?.selectedBranchId ?? event.branchId,
      }));
    }
    case 'CHAT_STREAM_FAILED':
    case 'BRANCH_STREAM_FAILED': {
      const isPrimary = event.type === 'CHAT_STREAM_FAILED';
      return upsertAssistantFailure(messages, {
        messageId: event.messageId,
        branchId: event.branchId,
        errorMessage: event.errorMessage || labels.error,
        modelId: '',
        modelLabel: isPrimary ? labels.primaryBranch : labels.branch,
        isPrimary,
        durationMs: event.durationMs,
        startedAt: null,
      });
    }
    case 'BRANCH_STREAM_FINISHED':
    case 'BRANCH_STREAM_CANCELLED':
      return updateStreamBranch(messages, event.messageId, event.branchId, false, (branch) => ({
        id: event.branchId,
        modelId: branch?.modelId ?? '',
        modelLabel: branch?.modelLabel ?? labels.branch,
        isPrimary: branch?.isPrimary ?? false,
        content: branch?.content ?? '',
        status: event.type === 'BRANCH_STREAM_FINISHED' ? 'done' : 'cancelled',
        errorMessage: event.type === 'BRANCH_STREAM_CANCELLED' ? labels.cancelled : null,
        durationMs: event.durationMs,
        startedAt: null,
      }));
    case 'RESTORE_LOADING': {
      const expired = failExpiredRestore(messages, event, labels, restoreOptions);
      if (expired) {
        return expired;
      }
      return upsertAssistantMessage(messages, event.messageId, (message) => {
        const branchStartedAtMap = new Map(event.branchStates.map((branch) => [branch.branchId, branch.startedAt]));
        return {
          ...(message ?? createAssistantMessage(event.messageId)),
          content: event.content,
          status: event.startedAt !== null ? 'loading' : message?.status ?? 'loading',
          errorMessage: event.startedAt !== null ? null : message?.errorMessage ?? null,
          branches: (message?.branches ?? []).map((branch) => {
            const restoredStartedAt = branchStartedAtMap.get(branch.id);
            const startedAt = branch.status === 'loading'
              ? restoredStartedAt !== undefined
                ? restoredStartedAt
                : branch.isPrimary ? event.startedAt : branch.startedAt
              : null;
            return startedAt === branch.startedAt ? branch : { ...branch, startedAt };
          }),
        };
      });
    }
    default:
      return messages;
  }
};
