import type { ExtensionConfig } from '../../domain/config/config-schema';
import { EXTENSION_PAGES } from '../../shared/extension-pages';
import { requestRuntimeMessage } from '../../shared/runtime-request';
import type {
  SidebarCommandInput,
  SidebarExtractionSource,
  SidebarResponseFor,
} from '../../services/runtime-messaging/sidebar-contract';
import { createWorkspaceCommands, type WorkspaceCommands } from '../workspace/workspace-commands';

export type { SidebarExtractionSource };

type GetConfigResponse = {
  /** 响应类型。 */
  type: 'GET_CONFIG_SUCCESS';
  /** 当前完整配置。 */
  config: ExtensionConfig;
};

/** side panel 专属的一次性命令：请求参数与响应都从契约推导。 */
type SidebarPageCommands = {
  /** 读取 side panel bootstrap。 */
  getSidebarBootstrap: (input: SidebarCommandInput<'GET_SIDEBAR_BOOTSTRAP'>) => Promise<SidebarResponseFor<'GET_SIDEBAR_BOOTSTRAP_SUCCESS'>>;
  /** 确认黑名单后继续。 */
  confirmBlacklistContinue: (input: SidebarCommandInput<'CONFIRM_BLACKLIST_CONTINUE'>) => Promise<SidebarResponseFor<'CONFIRM_BLACKLIST_CONTINUE_SUCCESS'>>;
  /** 重新提取页面内容。 */
  reExtractContent: (input: SidebarCommandInput<'RE_EXTRACT_CONTENT'>) => Promise<SidebarResponseFor<'RE_EXTRACT_CONTENT_SUCCESS'>>;
  /** 切换提取方式。 */
  switchExtractionMethod: (input: SidebarCommandInput<'SWITCH_EXTRACTION_METHOD'>) => Promise<SidebarResponseFor<'SWITCH_EXTRACTION_METHOD_SUCCESS'>>;
  /** 清理当前页面缓存与会话。 */
  clearPageContext: (input: SidebarCommandInput<'CLEAR_PAGE_CONTEXT'>) => Promise<SidebarResponseFor<'CLEAR_PAGE_CONTEXT_SUCCESS'>>;
};

type SidebarApi = SidebarPageCommands & WorkspaceCommands & {
  /** 读取当前完整配置。 */
  getConfig: () => Promise<GetConfigResponse>;
  /** 打开历史页。 */
  openHistoryPage: () => Promise<void>;
  /** 打开设置页。 */
  openSettingsPage: () => Promise<void>;
  /** 打开 GitHub 仓库。 */
  openGithubProject: () => Promise<void>;
};

/** 仓库 GitHub 地址。 */
const GITHUB_PROJECT_URL = 'https://github.com/wookiisky/think-bot-sp';

/** 统一在新标签页打开目标地址。 */
const openTab = async (url: string) => {
  await chrome.tabs.create({ url });
};

/** 创建 side panel API：页面专属命令加上与历史页共用的会话命令。 */
export const createSidebarApi = (): SidebarApi => ({
  ...createWorkspaceCommands(),
  getSidebarBootstrap: (input) => requestRuntimeMessage({ type: 'GET_SIDEBAR_BOOTSTRAP', ...input }),
  getConfig: () => requestRuntimeMessage({ type: 'GET_CONFIG' }),
  confirmBlacklistContinue: (input) => requestRuntimeMessage({ type: 'CONFIRM_BLACKLIST_CONTINUE', ...input }),
  reExtractContent: (input) => requestRuntimeMessage({ type: 'RE_EXTRACT_CONTENT', ...input }),
  switchExtractionMethod: (input) => requestRuntimeMessage({ type: 'SWITCH_EXTRACTION_METHOD', ...input }),
  clearPageContext: (input) => requestRuntimeMessage({ type: 'CLEAR_PAGE_CONTEXT', ...input }),
  openHistoryPage: () => openTab(chrome.runtime.getURL(EXTENSION_PAGES.conversations)),
  openSettingsPage: () => Promise.resolve(chrome.runtime.openOptionsPage()),
  openGithubProject: () => openTab(GITHUB_PROJECT_URL),
});

export type { SidebarApi };
