import type { ExtensionConfig } from '../../domain/config/config-schema';
import type {
  SidebarConversationRecord,
  SidebarLoadingStateRecord,
  SidebarPageRecord,
} from '../../services/runtime-messaging/sidebar-contract';

type PageListResponse = {
  /** 响应类型。 */
  type: 'LIST_PAGES_SUCCESS';
  /** 页面列表。 */
  pages: SidebarPageRecord[];
};

type SearchPagesResponse = {
  /** 响应类型。 */
  type: 'SEARCH_PAGES_SUCCESS';
  /** 搜索词。 */
  query: string;
  /** 搜索结果。 */
  pages: SidebarPageRecord[];
};

type GetPageDetailResponse = {
  /** 响应类型。 */
  type: 'GET_PAGE_DETAIL_SUCCESS';
  /** 页面记录。 */
  page: SidebarPageRecord | null;
  /** 当前页面全部会话。 */
  conversations: SidebarConversationRecord[];
  /** 当前页面全部 loading。 */
  loadingStates: SidebarLoadingStateRecord[];
  /** 建议激活标签。 */
  activePromptTabId: string;
};

type UpdatePageTitleResponse = {
  /** 响应类型。 */
  type: 'UPDATE_PAGE_TITLE_SUCCESS';
  /** 更新后的页面。 */
  page: SidebarPageRecord;
};

type DeletePageResponse = {
  /** 响应类型。 */
  type: 'DELETE_PAGE_SUCCESS';
  /** 删除结果。 */
  payload: {
    /** 归一化页面 URL。 */
    normalizedUrl: string;
    /** 是否已删除。 */
    deleted: boolean;
    /** 删除模式。 */
    deleteMode: 'hard' | 'soft';
  };
};

type GetConfigResponse = {
  /** 响应类型。 */
  type: 'GET_CONFIG_SUCCESS';
  /** 当前完整配置。 */
  config: ExtensionConfig;
};

type ConversationsStreamPort = chrome.runtime.Port;

type ConversationsApi = {
  /** 列出最近页面。 */
  listPages: () => Promise<PageListResponse>;
  /** 搜索页面。 */
  searchPages: (query: string) => Promise<SearchPagesResponse>;
  /** 恢复页面详情。 */
  getPageDetail: (normalizedUrl: string) => Promise<GetPageDetailResponse>;
  /** 更新页面标题。 */
  updatePageTitle: (input: { normalizedUrl: string; title: string }) => Promise<UpdatePageTitleResponse>;
  /** 删除页面。 */
  deletePage: (normalizedUrl: string) => Promise<DeletePageResponse>;
  /** 读取配置。 */
  getConfig: () => Promise<GetConfigResponse>;
  /** 发送消息。 */
  sendChat: (input: {
    pageUrl: string;
    promptTabId: string;
    modelId: string;
    text: string;
    displayText?: string;
    images: string[];
    includePageContent: boolean;
  }) => Promise<{
    type: 'SEND_CHAT_SUCCESS';
    payload: {
      sessionId: string;
      userMessageId: string | null;
      messageId: string;
      branchId: string;
      modelId: string;
      modelLabel: string;
    };
  }>;
  /** 编辑用户消息。 */
  editUserMessage: (input: { pageUrl: string; promptTabId: string; messageId: string; text: string }) => Promise<{
    type: 'EDIT_USER_MESSAGE_SUCCESS';
    payload: {
      editedMessageId: string;
      messageId: string;
      branchId: string;
      modelId: string;
      modelLabel: string;
      sessionId: string;
    };
  }>;
  /** 重试用户消息。 */
  retryUserMessage: (input: { pageUrl: string; promptTabId: string; messageId: string }) => Promise<{
    type: 'RETRY_USER_MESSAGE_SUCCESS';
    payload: {
      retriedMessageId: string;
      messageId: string;
      branchId: string;
      modelId: string;
      modelLabel: string;
      sessionId: string;
    };
  }>;
  /** 重试助手消息。 */
  retryMessage: (input: { pageUrl: string; promptTabId: string; messageId: string; branchId: string }) => Promise<{
    type: 'RETRY_MESSAGE_SUCCESS';
    payload: {
      messageId: string;
      branchId: string;
      sessionId: string;
    };
  }>;
  /** 切换当前轮主分支。 */
  selectAssistantBranch: (input: { pageUrl: string; promptTabId: string; messageId: string; branchId: string }) => Promise<{
    type: 'SELECT_ASSISTANT_BRANCH_SUCCESS';
    payload: {
      messageId: string;
      branchId: string;
    };
  }>;
  /** 新增分支。 */
  expandMessageBranches: (input: { pageUrl: string; promptTabId: string; messageId: string }) => Promise<{
    type: 'EXPAND_MESSAGE_BRANCHES_SUCCESS';
    payload: {
      messageId: string;
      branchIds: string[];
    };
  }>;
  /** 停止主会话。 */
  stopSession: (input: { pageUrl: string; promptTabId: string; sessionId: string }) => Promise<{
    type: 'STOP_SESSION_SUCCESS';
    payload: {
      sessionId: string;
      stopped: boolean;
    };
  }>;
  /** 停止分支。 */
  stopBranch: (input: { pageUrl: string; promptTabId: string; branchId: string }) => Promise<{
    type: 'STOP_BRANCH_SUCCESS';
    payload: {
      branchId: string;
      stopped: boolean;
    };
  }>;
  /** 删除分支。 */
  deleteBranch: (input: { pageUrl: string; promptTabId: string; messageId: string; branchId: string }) => Promise<{
    type: 'DELETE_BRANCH_SUCCESS';
    payload: {
      messageId: string;
      branchId: string;
      deleted: boolean;
    };
  }>;
  /** 清空当前标签会话。 */
  clearTabConversation: (input: { pageUrl: string; promptTabId: string }) => Promise<{
    type: 'CLEAR_TAB_CONVERSATION_SUCCESS';
    payload: {
      normalizedUrl: string;
      promptTabId: string;
      cleared: boolean;
    };
  }>;
  /** 导出当前标签会话。 */
  exportConversation: (input: { pageUrl: string; promptTabId: string }) => Promise<{
    type: 'EXPORT_CONVERSATION_SUCCESS';
    payload: {
      filename: string;
      content: string;
      mimeType: 'text/markdown;charset=utf-8';
    };
  }>;
  /** 建立流式订阅。 */
  connectStream: (input: { pageUrl: string; promptTabId: string }) => ConversationsStreamPort;
  /** 打开原网页。 */
  openSourcePage: (url: string) => Promise<void>;
  /** 打开设置页。 */
  openSettingsPage: () => Promise<void>;
};

/** conversations 页内部统一使用伪 tabId 发送共享聊天命令。 */
const CONVERSATIONS_TAB_ID = 0;

/** 在新标签页打开指定地址。 */
const openTab = async (url: string) => {
  await chrome.tabs.create({ url });
};

/** 创建 conversations 页 API。 */
export const createConversationsApi = (): ConversationsApi => ({
  listPages() {
    return chrome.runtime.sendMessage({
      type: 'LIST_PAGES',
    });
  },
  searchPages(query) {
    return chrome.runtime.sendMessage({
      type: 'SEARCH_PAGES',
      query,
    });
  },
  getPageDetail(normalizedUrl) {
    return chrome.runtime.sendMessage({
      type: 'GET_PAGE_DETAIL',
      normalizedUrl,
    });
  },
  updatePageTitle(input) {
    return chrome.runtime.sendMessage({
      type: 'UPDATE_PAGE_TITLE',
      ...input,
    });
  },
  deletePage(normalizedUrl) {
    return chrome.runtime.sendMessage({
      type: 'DELETE_PAGE',
      normalizedUrl,
    });
  },
  getConfig() {
    return chrome.runtime.sendMessage({
      type: 'GET_CONFIG',
    });
  },
  sendChat(input) {
    return chrome.runtime.sendMessage({
      type: 'SEND_CHAT',
      tabId: CONVERSATIONS_TAB_ID,
      ...input,
    });
  },
  editUserMessage(input) {
    return chrome.runtime.sendMessage({
      type: 'EDIT_USER_MESSAGE',
      tabId: CONVERSATIONS_TAB_ID,
      ...input,
    });
  },
  retryUserMessage(input) {
    return chrome.runtime.sendMessage({
      type: 'RETRY_USER_MESSAGE',
      tabId: CONVERSATIONS_TAB_ID,
      ...input,
    });
  },
  retryMessage(input) {
    return chrome.runtime.sendMessage({
      type: 'RETRY_MESSAGE',
      tabId: CONVERSATIONS_TAB_ID,
      ...input,
    });
  },
  selectAssistantBranch(input) {
    return chrome.runtime.sendMessage({
      type: 'SELECT_ASSISTANT_BRANCH',
      tabId: CONVERSATIONS_TAB_ID,
      ...input,
    });
  },
  expandMessageBranches(input) {
    return chrome.runtime.sendMessage({
      type: 'EXPAND_MESSAGE_BRANCHES',
      tabId: CONVERSATIONS_TAB_ID,
      ...input,
    });
  },
  stopSession(input) {
    return chrome.runtime.sendMessage({
      type: 'STOP_SESSION',
      tabId: CONVERSATIONS_TAB_ID,
      ...input,
    });
  },
  stopBranch(input) {
    return chrome.runtime.sendMessage({
      type: 'STOP_BRANCH',
      tabId: CONVERSATIONS_TAB_ID,
      ...input,
    });
  },
  deleteBranch(input) {
    return chrome.runtime.sendMessage({
      type: 'DELETE_BRANCH',
      tabId: CONVERSATIONS_TAB_ID,
      ...input,
    });
  },
  clearTabConversation(input) {
    return chrome.runtime.sendMessage({
      type: 'CLEAR_TAB_CONVERSATION',
      tabId: CONVERSATIONS_TAB_ID,
      ...input,
    });
  },
  exportConversation(input) {
    return chrome.runtime.sendMessage({
      type: 'EXPORT_CONVERSATION',
      tabId: CONVERSATIONS_TAB_ID,
      ...input,
    });
  },
  connectStream(input) {
    const port = chrome.runtime.connect({
      name: 'sidepanel',
    });
    port.postMessage({
      type: 'SUBSCRIBE_SIDEBAR_STREAM',
      tabId: CONVERSATIONS_TAB_ID,
      ...input,
    });
    return port;
  },
  openSourcePage(url) {
    return openTab(url);
  },
  openSettingsPage() {
    return Promise.resolve(chrome.runtime.openOptionsPage());
  },
});

export type { ConversationsApi };
