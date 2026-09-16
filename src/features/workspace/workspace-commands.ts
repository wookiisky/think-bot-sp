import { requestRuntimeMessage } from '../../shared/runtime-request';
import type {
  SidebarCommandInput,
  SidebarCommandMessage,
  SidebarPortClientMessage,
  SidebarResponse,
  SidebarResponseFor,
} from '../../services/runtime-messaging/sidebar-contract';

type StreamMessageEvent = {
  /** 监听流式消息。 */
  addListener: chrome.runtime.Port['onMessage']['addListener'];
  /** 移除流式消息监听。 */
  removeListener: chrome.runtime.Port['onMessage']['removeListener'];
};

/** 流式订阅 port 的最小接口。 */
export type WorkspaceStreamPort = {
  /** 断开流式订阅。 */
  disconnect: () => void;
  /** 流式消息事件。 */
  onMessage: StreamMessageEvent;
  /** 对端断开事件；worker 被回收时触发，用于自动重连。 */
  onDisconnect?: {
    /** 监听断开。 */
    addListener: (_listener: () => void) => void;
    /** 移除断开监听。 */
    removeListener: (_listener: () => void) => void;
  };
};

/** 一条命令：请求参数与响应都从契约推导。 */
type Command<Type extends SidebarCommandMessage['type'], Success extends SidebarResponse['type']> = (
  input: SidebarCommandInput<Type>,
) => Promise<SidebarResponseFor<Success>>;

/**
 * 侧边栏与历史页共用的会话命令集合：发送、编辑、重试、分支、停止、清空、导出、流订阅。
 * 请求参数保留 `tabId`，由调用方或 `bindWorkspaceTabId` 决定绑定方式。
 */
export type WorkspaceCommands = {
  /** 发送主聊天请求。 */
  sendChat: Command<'SEND_CHAT', 'SEND_CHAT_SUCCESS'>;
  /** 编辑目标用户消息并重发。 */
  editUserMessage: Command<'EDIT_USER_MESSAGE', 'EDIT_USER_MESSAGE_SUCCESS'>;
  /** 重试目标用户消息。 */
  retryUserMessage: Command<'RETRY_USER_MESSAGE', 'RETRY_USER_MESSAGE_SUCCESS'>;
  /** 重试目标助手分支。 */
  retryMessage: Command<'RETRY_MESSAGE', 'RETRY_MESSAGE_SUCCESS'>;
  /** 切换当前轮主分支。 */
  selectAssistantBranch: Command<'SELECT_ASSISTANT_BRANCH', 'SELECT_ASSISTANT_BRANCH_SUCCESS'>;
  /** 为既有助手消息继续新增分支。 */
  expandMessageBranches: Command<'EXPAND_MESSAGE_BRANCHES', 'EXPAND_MESSAGE_BRANCHES_SUCCESS'>;
  /** 停止当前流式会话。 */
  stopSession: Command<'STOP_SESSION', 'STOP_SESSION_SUCCESS'>;
  /** 停止单个分支流。 */
  stopBranch: Command<'STOP_BRANCH', 'STOP_BRANCH_SUCCESS'>;
  /** 删除单个分支。 */
  deleteBranch: Command<'DELETE_BRANCH', 'DELETE_BRANCH_SUCCESS'>;
  /** 清空当前 promptTab 会话与 loading。 */
  clearTabConversation: Command<'CLEAR_TAB_CONVERSATION', 'CLEAR_TAB_CONVERSATION_SUCCESS'>;
  /** 导出当前会话。 */
  exportConversation: Command<'EXPORT_CONVERSATION', 'EXPORT_CONVERSATION_SUCCESS'>;
  /** 建立流式订阅 port。 */
  connectStream: (input: Omit<SidebarPortClientMessage, 'type'>) => WorkspaceStreamPort;
};

/** 把 `tabId` 绑死后的命令集合，供没有真实浏览器标签的页面使用。 */
export type BoundWorkspaceCommands = {
  [Key in keyof WorkspaceCommands]: (
    input: Omit<Parameters<WorkspaceCommands[Key]>[0], 'tabId'>,
  ) => ReturnType<WorkspaceCommands[Key]>;
};

/** 创建共享会话命令集合。 */
export const createWorkspaceCommands = (): WorkspaceCommands => ({
  sendChat: (input) => requestRuntimeMessage({ type: 'SEND_CHAT', ...input }),
  editUserMessage: (input) => requestRuntimeMessage({ type: 'EDIT_USER_MESSAGE', ...input }),
  retryUserMessage: (input) => requestRuntimeMessage({ type: 'RETRY_USER_MESSAGE', ...input }),
  retryMessage: (input) => requestRuntimeMessage({ type: 'RETRY_MESSAGE', ...input }),
  selectAssistantBranch: (input) => requestRuntimeMessage({ type: 'SELECT_ASSISTANT_BRANCH', ...input }),
  expandMessageBranches: (input) => requestRuntimeMessage({ type: 'EXPAND_MESSAGE_BRANCHES', ...input }),
  stopSession: (input) => requestRuntimeMessage({ type: 'STOP_SESSION', ...input }),
  stopBranch: (input) => requestRuntimeMessage({ type: 'STOP_BRANCH', ...input }),
  deleteBranch: (input) => requestRuntimeMessage({ type: 'DELETE_BRANCH', ...input }),
  clearTabConversation: (input) => requestRuntimeMessage({ type: 'CLEAR_TAB_CONVERSATION', ...input }),
  exportConversation: (input) => requestRuntimeMessage({ type: 'EXPORT_CONVERSATION', ...input }),
  connectStream: (input) => {
    const port = chrome.runtime.connect({ name: 'sidepanel' });
    port.postMessage({ type: 'SUBSCRIBE_SIDEBAR_STREAM', ...input });
    return port;
  },
});

/** 为命令集合绑定固定 `tabId`。conversations 历史工作台没有真实标签，统一用 0 占位。 */
export const bindWorkspaceTabId = (commands: WorkspaceCommands, tabId: number): BoundWorkspaceCommands => ({
  sendChat: (input) => commands.sendChat({ ...input, tabId }),
  editUserMessage: (input) => commands.editUserMessage({ ...input, tabId }),
  retryUserMessage: (input) => commands.retryUserMessage({ ...input, tabId }),
  retryMessage: (input) => commands.retryMessage({ ...input, tabId }),
  selectAssistantBranch: (input) => commands.selectAssistantBranch({ ...input, tabId }),
  expandMessageBranches: (input) => commands.expandMessageBranches({ ...input, tabId }),
  stopSession: (input) => commands.stopSession({ ...input, tabId }),
  stopBranch: (input) => commands.stopBranch({ ...input, tabId }),
  deleteBranch: (input) => commands.deleteBranch({ ...input, tabId }),
  clearTabConversation: (input) => commands.clearTabConversation({ ...input, tabId }),
  exportConversation: (input) => commands.exportConversation({ ...input, tabId }),
  connectStream: (input) => commands.connectStream({ ...input, tabId }),
});
