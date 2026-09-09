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
};

const createAssistantMessage = (id: string): ChatMessageState => ({
  id,
  role: 'assistant',
  content: '',
  status: 'loading',
  errorMessage: null,
  branches: [],
  selectedBranchId: null,
});

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
    case 'RESTORE_LOADING':
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
    default:
      return messages;
  }
};
