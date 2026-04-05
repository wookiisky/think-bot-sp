const RETRY_DELAY_MS = 200;
const RETRY_AFTER_RELOAD_COUNT = 5;

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
  /** 按需注入 content script。 */
  executeScript: (...args: [number]) => Promise<void>;
  /** 向 content script 发送消息。 */
  sendMessage: (...args: [number, unknown]) => Promise<PageSource>;
  /** 刷新标签页。 */
  reload: (...args: [number]) => Promise<void>;
};

/** 等待指定毫秒数，给 content script 重新注入留出时间。 */
const delay = (timeoutMs: number) => new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));

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

      try {
        await tabs.executeScript(tabId);
        await delay(RETRY_DELAY_MS);
        return await tabs.sendMessage(tabId, { type: 'COLLECT_PAGE_SOURCE' });
      } catch (injectionError) {
        const injectionMessage = injectionError instanceof Error ? injectionError.message : String(injectionError);
        if (!injectionMessage.includes('Receiving end does not exist')) {
          // 注入失败时继续走刷新重连，兼容权限或页面状态差异。
        }
      }

      await tabs.reload(tabId);
      let lastRetryError: unknown = error;
      for (let retry = 0; retry < RETRY_AFTER_RELOAD_COUNT; retry += 1) {
        await delay(RETRY_DELAY_MS);
        try {
          return await tabs.sendMessage(tabId, { type: 'COLLECT_PAGE_SOURCE' });
        } catch (retryError) {
          lastRetryError = retryError;
          const retryMessage = retryError instanceof Error ? retryError.message : String(retryError);
          if (!retryMessage.includes('Receiving end does not exist') || retry === RETRY_AFTER_RELOAD_COUNT - 1) {
            throw retryError;
          }
        }
      }

      throw lastRetryError instanceof Error ? lastRetryError : new Error('content script reconnect failed');
    }
  },
});
