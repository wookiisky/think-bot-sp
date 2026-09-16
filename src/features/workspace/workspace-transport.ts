import type { ConversationsApi } from '../conversations/conversations-api';
import type { SidebarApi } from '../sidebar/sidebar-api';

type WorkspaceCommandName =
  | 'sendChat' | 'editUserMessage' | 'retryUserMessage' | 'retryMessage'
  | 'selectAssistantBranch' | 'expandMessageBranches' | 'stopSession' | 'stopBranch'
  | 'deleteBranch' | 'clearTabConversation' | 'exportConversation' | 'connectStream';

/** 页面地址由适配器绑定，控制器仅提交会话操作参数。 */
type PageBoundCommand<Key extends WorkspaceCommandName> = (
  input: Omit<Parameters<ConversationsApi[Key]>[0], 'pageUrl'>,
) => ReturnType<ConversationsApi[Key]>;

/** 共享聊天控制器使用的页面级操作接口。 */
export type WorkspaceTransport = {
  /** 历史页订阅需要过滤其他页面事件；侧栏由浏览器标签隔离。 */
  readonly normalizedUrl?: string;
  /** 清空标签时是否同时重置自动触发状态。 */
  readonly clearTabResetsTrigger: boolean;
  /** 删除最后一个分支时是否移除整条助手消息。 */
  readonly deleteLastBranchRemovesMessage: boolean;
  /** 发送消息；展示文本和失败回滚是显式可选能力。 */
  sendChat: (input: Omit<Parameters<ConversationsApi['sendChat']>[0], 'pageUrl'> & {
    /** 发送失败时回滚；仅侧栏传递给底层 API。 */
    rollbackOnFailure?: boolean;
  }) => ReturnType<ConversationsApi['sendChat']>;
  /** 编辑用户消息并重发。 */
  editUserMessage: PageBoundCommand<'editUserMessage'>;
  /** 重试用户消息。 */
  retryUserMessage: PageBoundCommand<'retryUserMessage'>;
  /** 重试指定助手分支。 */
  retryMessage: PageBoundCommand<'retryMessage'>;
  /** 选择当前轮主分支。 */
  selectAssistantBranch: PageBoundCommand<'selectAssistantBranch'>;
  /** 为助手消息新增分支。 */
  expandMessageBranches: PageBoundCommand<'expandMessageBranches'>;
  /** 停止整轮会话。 */
  stopSession: PageBoundCommand<'stopSession'>;
  /** 停止单个分支。 */
  stopBranch: PageBoundCommand<'stopBranch'>;
  /** 删除单个分支。 */
  deleteBranch: PageBoundCommand<'deleteBranch'>;
  /** 清空标签会话。 */
  clearTabConversation: PageBoundCommand<'clearTabConversation'>;
  /** 导出标签会话。 */
  exportConversation: PageBoundCommand<'exportConversation'>;
  /** 建立当前页面的标签流订阅。 */
  connectStream: PageBoundCommand<'connectStream'>;
};

/** 将侧栏 API 绑定到当前浏览器标签和页面。 */
export const createSidebarWorkspaceTransport = ({ api, tabId, pageUrl }: {
  /** 侧栏命令 API。 */
  api: SidebarApi;
  /** 当前浏览器标签。 */
  tabId: number;
  /** 当前页面地址。 */
  pageUrl: string;
}): WorkspaceTransport => ({
  clearTabResetsTrigger: true,
  deleteLastBranchRemovesMessage: true,
  sendChat: (input) => api.sendChat({ ...input, tabId, pageUrl }),
  editUserMessage: (input) => api.editUserMessage({ ...input, tabId, pageUrl }),
  retryUserMessage: (input) => api.retryUserMessage({ ...input, tabId, pageUrl }),
  retryMessage: (input) => api.retryMessage({ ...input, tabId, pageUrl }),
  selectAssistantBranch: (input) => api.selectAssistantBranch({ ...input, tabId, pageUrl }),
  expandMessageBranches: (input) => api.expandMessageBranches({ ...input, tabId, pageUrl }),
  stopSession: (input) => api.stopSession({ ...input, tabId, pageUrl }),
  stopBranch: (input) => api.stopBranch({ ...input, tabId, pageUrl }),
  deleteBranch: (input) => api.deleteBranch({ ...input, tabId, pageUrl }),
  clearTabConversation: (input) => api.clearTabConversation({ ...input, tabId, pageUrl }),
  exportConversation: (input) => api.exportConversation({ ...input, tabId, pageUrl }),
  connectStream: (input) => api.connectStream({ ...input, tabId, pageUrl }),
});

/** 将历史页 API 绑定到当前页面，并保留原有发送和清理语义。 */
export const createConversationsWorkspaceTransport = ({ api, pageUrl, normalizedUrl }: {
  /** 历史页命令 API。 */
  api: ConversationsApi;
  /** 当前页面地址。 */
  pageUrl: string;
  /** 事件所属页面的归一化地址。 */
  normalizedUrl: string;
}): WorkspaceTransport => ({
  normalizedUrl,
  clearTabResetsTrigger: false,
  deleteLastBranchRemovesMessage: false,
  sendChat: ({ rollbackOnFailure: _rollbackOnFailure, ...input }) => api.sendChat({ ...input, pageUrl }),
  editUserMessage: (input) => api.editUserMessage({ ...input, pageUrl }),
  retryUserMessage: (input) => api.retryUserMessage({ ...input, pageUrl }),
  retryMessage: (input) => api.retryMessage({ ...input, pageUrl }),
  selectAssistantBranch: (input) => api.selectAssistantBranch({ ...input, pageUrl }),
  expandMessageBranches: (input) => api.expandMessageBranches({ ...input, pageUrl }),
  stopSession: (input) => api.stopSession({ ...input, pageUrl }),
  stopBranch: (input) => api.stopBranch({ ...input, pageUrl }),
  deleteBranch: (input) => api.deleteBranch({ ...input, pageUrl }),
  clearTabConversation: (input) => api.clearTabConversation({ ...input, pageUrl }),
  exportConversation: (input) => api.exportConversation({ ...input, pageUrl }),
  connectStream: (input) => api.connectStream({ ...input, pageUrl }),
});
