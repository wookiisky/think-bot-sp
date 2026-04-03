/* eslint-disable no-unused-vars */
type ExtractionMethod = 'readability' | 'jina';

type SidebarBootstrapResponse = {
  /** 响应类型。 */
  type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS';
  /** 浏览器标签页 id。 */
  browserTabId: number;
  /** 归一化后的页面 URL。 */
  normalizedUrl: string;
  /** 当前页面缓存。 */
  page: {
    /** 已使用的提取方式。 */
    extractionMethod: ExtractionMethod;
    /** 已缓存的正文。 */
    content: string;
  } | null;
  /** 页面下的会话摘要。 */
  conversations: unknown[];
  /** 页面下的加载态摘要。 */
  loadingStates: unknown[];
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

type SwitchExtractionMethodResponse = {
  /** 响应类型。 */
  type: 'SWITCH_EXTRACTION_METHOD_SUCCESS';
  /** 当前选择的提取方式。 */
  payload: {
    /** 已切换的提取方式。 */
    method: ExtractionMethod;
  };
};

type SidebarApi = {
  /** 读取 side panel bootstrap。 */
  getSidebarBootstrap: (..._input: [{ tabId: number; pageUrl: string }]) => Promise<SidebarBootstrapResponse>;
  /** 确认黑名单后继续。 */
  confirmBlacklistContinue: (..._input: [{ tabId: number; pageUrl: string }]) => Promise<ConfirmBlacklistContinueResponse>;
  /** 重新提取页面内容。 */
  reExtractContent: (..._input: [{ tabId: number; pageUrl: string; method: ExtractionMethod }]) => Promise<ReExtractContentResponse>;
  /** 切换提取方式。 */
  switchExtractionMethod: (
    ..._input: [{ tabId: number; pageUrl: string; method: ExtractionMethod }]
  ) => Promise<SwitchExtractionMethodResponse>;
};

/** 创建 side panel API，统一封装 runtime message 调用。 */
export const createSidebarApi = (): SidebarApi => ({
  getSidebarBootstrap(input) {
    return chrome.runtime.sendMessage({
      type: 'GET_SIDEBAR_BOOTSTRAP',
      ...input,
    });
  },
  confirmBlacklistContinue(input) {
    return chrome.runtime.sendMessage({
      type: 'CONFIRM_BLACKLIST_CONTINUE',
      ...input,
    });
  },
  reExtractContent(input) {
    return chrome.runtime.sendMessage({
      type: 'RE_EXTRACT_CONTENT',
      ...input,
    });
  },
  switchExtractionMethod(input) {
    return chrome.runtime.sendMessage({
      type: 'SWITCH_EXTRACTION_METHOD',
      ...input,
    });
  },
});

export type { SidebarApi };
