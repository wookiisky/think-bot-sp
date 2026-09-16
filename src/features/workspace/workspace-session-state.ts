import type { SidebarPortEvent } from '../../services/runtime-messaging/sidebar-contract';

type WorkspaceSessionUpdate = {
  activeSessionId?: string | null;
  restoreMessageId?: string | null;
  startedSessionId?: string;
  terminalSessionId?: string;
};

/** 两个工作台共用的会话转换；主分支完成后等待整轮 loading 终态。 */
export const getWorkspaceSessionUpdate = (event: SidebarPortEvent): WorkspaceSessionUpdate | null => {
  switch (event.type) {
    case 'CHAT_STREAM_STARTED':
      return { activeSessionId: event.sessionId, restoreMessageId: event.messageId, startedSessionId: event.sessionId };
    case 'CHAT_STREAM_CHUNK':
    case 'RESTORE_LOADING':
      return { activeSessionId: event.sessionId, restoreMessageId: event.messageId };
    case 'BRANCH_STREAM_STARTED':
      return { startedSessionId: event.sessionId };
    case 'BRANCH_STREAM_FINISHED':
    case 'BRANCH_STREAM_FAILED':
    case 'BRANCH_STREAM_CANCELLED':
    case 'CHAT_STREAM_FINISHED':
      return { terminalSessionId: event.sessionId };
    case 'CHAT_STREAM_FAILED':
    case 'CHAT_STREAM_CANCELLED':
      return { activeSessionId: null, restoreMessageId: null, terminalSessionId: event.sessionId };
    case 'LOADING_STATE_UPDATE':
      return event.status !== 'loading'
        ? { activeSessionId: null, restoreMessageId: null, ...(event.sessionId ? { terminalSessionId: event.sessionId } : {}) }
        : null;
    default:
      return null;
  }
};
