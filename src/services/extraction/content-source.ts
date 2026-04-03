/* eslint-disable no-unused-vars */
type PageSource = {
  /** 页面 URL。 */
  url: string;
  /** 页面标题。 */
  title: string;
  /** 页面 HTML。 */
  html: string;
  /** 页面纯文本。 */
  text: string;
  /** 页面 favicon。 */
  faviconUrl: string;
};

type TabsApi = {
  /** 向 content script 发送消息。 */
  sendMessage: (...args: [number, unknown]) => Promise<PageSource>;
  /** 刷新标签页。 */
  reload: (...args: [number]) => Promise<void>;
};

/** 创建页面源读取器，负责 content script 断连后的单次自动刷新重试。 */
export const createContentSource = ({ tabs }: { tabs: TabsApi }) => ({
  /** 采集页面 HTML 和基础元数据。 */
  async collect({ tabId }: { tabId: number }): Promise<PageSource> {
    try {
      return await tabs.sendMessage(tabId, { type: 'COLLECT_PAGE_SOURCE' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('Receiving end does not exist')) {
        throw error;
      }

      await tabs.reload(tabId);
      return tabs.sendMessage(tabId, { type: 'COLLECT_PAGE_SOURCE' });
    }
  },
});
