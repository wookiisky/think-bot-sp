import type { ExtensionConfig } from '../../domain/config/config-schema';
import type { PageSummary } from '../../domain/page/page-summary';
import { requestRuntimeMessage } from '../../shared/runtime-request';
import type {
  SidebarConversationRecord,
  SidebarLoadingStateRecord,
  SidebarPageRecord,
} from '../../services/runtime-messaging/sidebar-contract';
import { bindWorkspaceTabId, createWorkspaceCommands, type BoundWorkspaceCommands } from '../workspace/workspace-commands';

type PageListResponse = {
  /** 响应类型。 */
  type: 'LIST_PAGES_SUCCESS';
  /** 页面列表。 */
  pages: PageSummary[];
};

type SearchPagesResponse = {
  /** 响应类型。 */
  type: 'SEARCH_PAGES_SUCCESS';
  /** 搜索词。 */
  query: string;
  /** 搜索结果。 */
  pages: PageSummary[];
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

/** 历史页专属命令：页面列表、详情、标题、删除与导航。 */
type ConversationsPageCommands = {
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
  /** 打开原网页。 */
  openSourcePage: (url: string) => Promise<void>;
  /** 打开设置页。 */
  openSettingsPage: () => Promise<void>;
};

/** 历史页 API：页面专属命令加上绑定了占位 tabId 的共享会话命令。 */
type ConversationsApi = ConversationsPageCommands & BoundWorkspaceCommands;

/** conversations 页内部统一使用伪 tabId 发送共享聊天命令。 */
const CONVERSATIONS_TAB_ID = 0;

/** 在新标签页打开指定地址。 */
const openTab = async (url: string) => {
  await chrome.tabs.create({ url });
};

/** 创建 conversations 页 API。 */
export const createConversationsApi = (): ConversationsApi => ({
  ...bindWorkspaceTabId(createWorkspaceCommands(), CONVERSATIONS_TAB_ID),
  listPages: () => requestRuntimeMessage({ type: 'LIST_PAGES' }),
  searchPages: (query) => requestRuntimeMessage({ type: 'SEARCH_PAGES', query }),
  getPageDetail: (normalizedUrl) => requestRuntimeMessage({ type: 'GET_PAGE_DETAIL', normalizedUrl }),
  updatePageTitle: (input) => requestRuntimeMessage({ type: 'UPDATE_PAGE_TITLE', ...input }),
  deletePage: (normalizedUrl) => requestRuntimeMessage({ type: 'DELETE_PAGE', normalizedUrl }),
  getConfig: () => requestRuntimeMessage({ type: 'GET_CONFIG' }),
  openSourcePage: (url) => openTab(url),
  openSettingsPage: () => Promise.resolve(chrome.runtime.openOptionsPage()),
});

export type { ConversationsApi };
