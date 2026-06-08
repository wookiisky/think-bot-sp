import type { ExtensionConfig } from '../../domain/config/config-schema';
import { EXTENSION_PAGES } from '../../shared/extension-pages';
import { requestRuntimeMessage } from '../../shared/runtime-request';
import type {
  SidebarConversationRecord,
  SidebarLoadingStateRecord,
  SidebarPageRecord,
  SidebarSwitchExtractionMethodResponse,
} from '../../services/runtime-messaging/sidebar-contract';

type ExtractionMethod = 'readability' | 'jina';
export type SidebarExtractionSource = 'panel_bootstrap' | 'blacklist_continue' | 'manual_reextract' | 'prompt_tab_click';

type SidebarBootstrapResponse = {
  /** 响应类型。 */
  type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS';
  /** 浏览器标签页 id。 */
  browserTabId: number;
  /** 归一化后的页面 URL。 */
  normalizedUrl: string;
  /** 当前页面缓存。 */
  page: SidebarPageRecord | null;
  /** 页面下的会话摘要。 */
  conversations: SidebarConversationRecord[];
  /** 页面下的加载态摘要。 */
  loadingStates: SidebarLoadingStateRecord[];
  /** 是否命中黑名单。 */
  blockedByBlacklist: boolean;
  /** 命中的规则 id。 */
  matchedRuleId: string | null;
  /** 当前是否需要继续提取。 */
  shouldExtract: boolean;
};

type ConfirmBlacklistContinueResponse = {
  /** 响应类型。 */
  type: 'CONFIRM_BLACKLIST_CONTINUE_SUCCESS';
  /** 放行结果。 */
  payload: {
    /** 是否已允许继续提取。 */
    allowed: boolean;
  };
};

type ReExtractContentResponse = {
  /** 响应载荷。 */
  payload: {
    /** 提取后的正文。 */
    content: string;
    /** 本次实际使用的提取方式。 */
    extractionMethod: ExtractionMethod;
  };
};

type SwitchExtractionMethodResponse = SidebarSwitchExtractionMethodResponse;

type BranchDescriptor = {
  /** 分支 id。 */
  branchId: string;
  /** 分支模型 id。 */
  modelId: string;
  /** 分支模型展示名。 */
  modelLabel: string;
};

type SendChatResponse = {
  /** 响应类型。 */
  type: 'SEND_CHAT_SUCCESS';
  /** 响应载荷。 */
  payload: {
    /** 新建流式会话 id。 */
    sessionId: string;
    /** 持久化后的用户消息 id。 */
    userMessageId: string | null;
    /** 助手消息 id。 */
    messageId: string;
    /** 主分支 id。 */
    branchId: string;
    /** 主分支模型 id。 */
    modelId: string;
    /** 主分支模型展示名。 */
    modelLabel: string;
    /** 本轮初始化创建的分支摘要。 */
    branches: BranchDescriptor[];
  };
};

type EditUserMessageResponse = {
  /** 响应类型。 */
  type: 'EDIT_USER_MESSAGE_SUCCESS';
  /** 响应载荷。 */
  payload: {
    /** 目标用户消息 id。 */
    editedMessageId: string;
    /** 新助手消息 id。 */
    messageId: string;
    /** 主分支 id。 */
    branchId: string;
    /** 主分支模型 id。 */
    modelId: string;
    /** 主分支模型展示名。 */
    modelLabel: string;
    /** 新建流式会话 id。 */
    sessionId: string;
    /** 本轮初始化创建的分支摘要。 */
    branches: BranchDescriptor[];
  };
};

type RetryUserMessageResponse = {
  /** 响应类型。 */
  type: 'RETRY_USER_MESSAGE_SUCCESS';
  /** 响应载荷。 */
  payload: {
    /** 被重试的用户消息 id。 */
    retriedMessageId: string;
    /** 新助手消息 id。 */
    messageId: string;
    /** 主分支 id。 */
    branchId: string;
    /** 主分支模型 id。 */
    modelId: string;
    /** 主分支模型展示名。 */
    modelLabel: string;
    /** 新建流式会话 id。 */
    sessionId: string;
    /** 本轮初始化创建的分支摘要。 */
    branches: BranchDescriptor[];
  };
};

type RetryMessageResponse = {
  /** 响应类型。 */
  type: 'RETRY_MESSAGE_SUCCESS';
  /** 响应载荷。 */
  payload: {
    /** 助手消息 id。 */
    messageId: string;
    /** 分支 id。 */
    branchId: string;
    /** 新建流式会话 id。 */
    sessionId: string;
  };
};

type SelectAssistantBranchResponse = {
  /** 响应类型。 */
  type: 'SELECT_ASSISTANT_BRANCH_SUCCESS';
  /** 响应载荷。 */
  payload: {
    /** 助手消息 id。 */
    messageId: string;
    /** 当前主分支 id。 */
    branchId: string;
  };
};

type ExpandMessageBranchesResponse = {
  /** 响应类型。 */
  type: 'EXPAND_MESSAGE_BRANCHES_SUCCESS';
  /** 响应载荷。 */
  payload: {
    /** 目标助手消息 id。 */
    messageId: string;
    /** 新增分支摘要。 */
    branches: BranchDescriptor[];
  };
};

type StopSessionResponse = {
  /** 响应类型。 */
  type: 'STOP_SESSION_SUCCESS';
  /** 响应载荷。 */
  payload: {
    /** 会话 id。 */
    sessionId: string;
    /** 是否实际停止。 */
    stopped: boolean;
  };
};

type StopBranchResponse = {
  /** 响应类型。 */
  type: 'STOP_BRANCH_SUCCESS';
  /** 响应载荷。 */
  payload: {
    /** 分支 id。 */
    branchId: string;
    /** 是否实际停止。 */
    stopped: boolean;
  };
};

type DeleteBranchResponse = {
  /** 响应类型。 */
  type: 'DELETE_BRANCH_SUCCESS';
  /** 响应载荷。 */
  payload: {
    /** 助手消息 id。 */
    messageId: string;
    /** 分支 id。 */
    branchId: string;
    /** 是否已删除。 */
    deleted: boolean;
  };
};

type ClearPageContextResponse = {
  /** 响应类型。 */
  type: 'CLEAR_PAGE_CONTEXT_SUCCESS';
  /** 响应载荷。 */
  payload: {
    /** 已清理的归一化页面 URL。 */
    normalizedUrl: string;
    /** 是否已完成清理。 */
    cleared: boolean;
  };
};

type ClearTabConversationResponse = {
  /** 响应类型。 */
  type: 'CLEAR_TAB_CONVERSATION_SUCCESS';
  /** 响应载荷。 */
  payload: {
    /** 已清理的归一化页面 URL。 */
    normalizedUrl: string;
    /** 已清理的 promptTab 稳定 id。 */
    promptTabId: string;
    /** 是否已完成清理。 */
    cleared: boolean;
  };
};

type ExportConversationResponse = {
  /** 响应类型。 */
  type: 'EXPORT_CONVERSATION_SUCCESS';
  /** 响应载荷。 */
  payload: {
    /** 下载文件名。 */
    filename: string;
    /** Markdown 内容。 */
    content: string;
    /** MIME 类型。 */
    mimeType: 'text/markdown;charset=utf-8';
  };
};

type SidebarStreamMessageEvent = {
  /** 监听流式消息。 */
  addListener: chrome.runtime.Port['onMessage']['addListener'];
  /** 移除流式消息监听。 */
  removeListener: chrome.runtime.Port['onMessage']['removeListener'];
};

type SidebarStreamPort = {
  /** 断开流式订阅。 */
  disconnect: () => void;
  /** 流式消息事件。 */
  onMessage: SidebarStreamMessageEvent;
};

type GetConfigResponse = {
  /** 响应类型。 */
  type: 'GET_CONFIG_SUCCESS';
  /** 当前完整配置。 */
  config: ExtensionConfig;
};

type SidebarApi = {
  /** 读取 side panel bootstrap。 */
  getSidebarBootstrap: (..._input: [{ tabId: number; pageUrl: string }]) => Promise<SidebarBootstrapResponse>;
  /** 读取当前完整配置。 */
  getConfig: () => Promise<GetConfigResponse>;
  /** 确认黑名单后继续。 */
  confirmBlacklistContinue: (..._input: [{ tabId: number; pageUrl: string }]) => Promise<ConfirmBlacklistContinueResponse>;
  /** 重新提取页面内容。 */
  reExtractContent: (
    ..._input: [{ tabId: number; pageUrl: string; method: ExtractionMethod; source: SidebarExtractionSource }]
  ) => Promise<ReExtractContentResponse>;
  /** 切换提取方式。 */
  switchExtractionMethod: (
    ..._input: [{ tabId: number; pageUrl: string; method: ExtractionMethod }]
  ) => Promise<SwitchExtractionMethodResponse>;
  /** 清理当前页面缓存与会话。 */
  clearPageContext: (..._input: [{ tabId: number; pageUrl: string }]) => Promise<ClearPageContextResponse>;
  /** 清理当前 promptTab 会话与 loading。 */
  clearTabConversation: (..._input: [{ tabId: number; pageUrl: string; promptTabId: string }]) => Promise<ClearTabConversationResponse>;
  /** 发送主聊天请求。 */
  sendChat: (
    ..._input: [{
      tabId: number;
      pageUrl: string;
      promptTabId: string;
      modelId: string;
      text: string;
      displayText?: string;
      images: string[];
      includePageContent: boolean;
      rollbackOnFailure?: boolean;
    }]
  ) => Promise<SendChatResponse>;
  /** 编辑目标用户消息并重发。 */
  editUserMessage: (
    ..._input: [{ tabId: number; pageUrl: string; promptTabId: string; messageId: string; text: string }]
  ) => Promise<EditUserMessageResponse>;
  /** 重试目标用户消息，追加为既有助手分支。 */
  retryUserMessage: (
    ..._input: [{ tabId: number; pageUrl: string; promptTabId: string; messageId: string }]
  ) => Promise<RetryUserMessageResponse>;
  /** 重试目标助手消息，并替换旧结果。 */
  retryMessage: (
    ..._input: [{ tabId: number; pageUrl: string; promptTabId: string; messageId: string; branchId: string }]
  ) => Promise<RetryMessageResponse>;
  /** 切换当前轮的主分支。 */
  selectAssistantBranch: (
    ..._input: [{ tabId: number; pageUrl: string; promptTabId: string; messageId: string; branchId: string }]
  ) => Promise<SelectAssistantBranchResponse>;
  /** 为既有助手消息继续新增分支。 */
  expandMessageBranches: (
    ..._input: [{ tabId: number; pageUrl: string; promptTabId: string; messageId: string; modelId: string }]
  ) => Promise<ExpandMessageBranchesResponse>;
  /** 停止当前流式会话。 */
  stopSession: (..._input: [{ tabId: number; pageUrl: string; promptTabId: string; sessionId: string }]) => Promise<StopSessionResponse>;
  /** 停止单个分支流。 */
  stopBranch: (..._input: [{ tabId: number; pageUrl: string; promptTabId: string; branchId: string }]) => Promise<StopBranchResponse>;
  /** 删除单个分支。 */
  deleteBranch: (
    ..._input: [{ tabId: number; pageUrl: string; promptTabId: string; messageId: string; branchId: string }]
  ) => Promise<DeleteBranchResponse>;
  /** 导出当前会话。 */
  exportConversation: (..._input: [{ tabId: number; pageUrl: string; promptTabId: string }]) => Promise<ExportConversationResponse>;
  /** 打开历史页。 */
  openHistoryPage: () => Promise<void>;
  /** 打开设置页。 */
  openSettingsPage: () => Promise<void>;
  /** 打开 GitHub 仓库。 */
  openGithubProject: () => Promise<void>;
  /** 建立流式订阅 port。 */
  connectStream: (..._input: [{ tabId: number; pageUrl: string; promptTabId: string }]) => SidebarStreamPort;
};

/** 仓库 GitHub 地址。 */
const GITHUB_PROJECT_URL = 'https://github.com/wookiisky/think-bot-sp';

/** 统一在新标签页打开目标地址。 */
const openTab = async (url: string) => {
  await chrome.tabs.create({ url });
};

/** 创建 side panel API，统一封装 runtime message 调用。 */
export const createSidebarApi = (): SidebarApi => ({
  getSidebarBootstrap(input) {
    return requestRuntimeMessage({
      type: 'GET_SIDEBAR_BOOTSTRAP',
      ...input,
    });
  },
  getConfig() {
    return requestRuntimeMessage({
      type: 'GET_CONFIG',
    });
  },
  confirmBlacklistContinue(input) {
    return requestRuntimeMessage({
      type: 'CONFIRM_BLACKLIST_CONTINUE',
      ...input,
    });
  },
  reExtractContent(input) {
    return requestRuntimeMessage({
      type: 'RE_EXTRACT_CONTENT',
      ...input,
    });
  },
  switchExtractionMethod(input) {
    return requestRuntimeMessage({
      type: 'SWITCH_EXTRACTION_METHOD',
      ...input,
    });
  },
  clearPageContext(input) {
    return requestRuntimeMessage({
      type: 'CLEAR_PAGE_CONTEXT',
      ...input,
    });
  },
  clearTabConversation(input) {
    return requestRuntimeMessage({
      type: 'CLEAR_TAB_CONVERSATION',
      ...input,
    });
  },
  sendChat(input) {
    return requestRuntimeMessage({
      type: 'SEND_CHAT',
      ...input,
    });
  },
  editUserMessage(input) {
    return requestRuntimeMessage({
      type: 'EDIT_USER_MESSAGE',
      ...input,
    });
  },
  retryUserMessage(input) {
    return requestRuntimeMessage({
      type: 'RETRY_USER_MESSAGE',
      ...input,
    });
  },
  retryMessage(input) {
    return requestRuntimeMessage({
      type: 'RETRY_MESSAGE',
      ...input,
    });
  },
  selectAssistantBranch(input) {
    return requestRuntimeMessage({
      type: 'SELECT_ASSISTANT_BRANCH',
      ...input,
    });
  },
  expandMessageBranches(input) {
    return requestRuntimeMessage({
      type: 'EXPAND_MESSAGE_BRANCHES',
      ...input,
    });
  },
  stopSession(input) {
    return requestRuntimeMessage({
      type: 'STOP_SESSION',
      ...input,
    });
  },
  stopBranch(input) {
    return requestRuntimeMessage({
      type: 'STOP_BRANCH',
      ...input,
    });
  },
  deleteBranch(input) {
    return requestRuntimeMessage({
      type: 'DELETE_BRANCH',
      ...input,
    });
  },
  exportConversation(input) {
    return requestRuntimeMessage({
      type: 'EXPORT_CONVERSATION',
      ...input,
    });
  },
  openHistoryPage() {
    return openTab(chrome.runtime.getURL(EXTENSION_PAGES.conversations));
  },
  openSettingsPage() {
    return Promise.resolve(chrome.runtime.openOptionsPage());
  },
  openGithubProject() {
    return openTab(GITHUB_PROJECT_URL);
  },
  connectStream(input) {
    const port = chrome.runtime.connect({
      name: 'sidepanel',
    });
    port.postMessage({
      type: 'SUBSCRIBE_SIDEBAR_STREAM',
      ...input,
    });
    return port;
  },
});

export type { SidebarApi };
