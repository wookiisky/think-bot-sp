import type { CollectPageSourceInput, CollectPageSourceMessage, PageSource } from './page-source';
import { describeError, type Logger } from '../logger/logger';

const RETRY_DELAY_MS = 200;
const RETRY_AFTER_RELOAD_COUNT = 5;

type TabsApi = {
  /** 按需注入 content script。 */
  executeScript: (...args: [number]) => Promise<void>;
  /** 向 content script 发送消息。 */
  sendMessage: (...args: [number, CollectPageSourceMessage]) => Promise<PageSource>;
  /** 刷新标签页。 */
  reload: (...args: [number]) => Promise<void>;
};

/** 等待指定毫秒数，给 content script 重新注入留出时间。 */
const delay = (timeoutMs: number) => new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));

type ContentSourceLogger = Pick<Logger, 'debug' | 'warn'>;

const noopLogger: ContentSourceLogger = { debug: () => undefined, warn: () => undefined };

/** 创建页面源读取器，负责 content script 断连后的单次自动刷新重试。 */
export const createContentSource = ({ tabs, logger = noopLogger }: { tabs: TabsApi; logger?: ContentSourceLogger }) => ({
  /** 按提取方法采集正文或基础元数据。 */
  async collect({ tabId, method }: CollectPageSourceInput): Promise<PageSource> {
    const request: CollectPageSourceMessage = { type: 'COLLECT_PAGE_SOURCE', method };
    try {
      return await tabs.sendMessage(tabId, request);
    } catch (error) {
      const message = describeError(error);
      if (!message.includes('Receiving end does not exist')) {
        throw error;
      }

      logger.debug('content_source.disconnected', { browserTabId: tabId, method });
      try {
        await tabs.executeScript(tabId);
        await delay(RETRY_DELAY_MS);
        const source = await tabs.sendMessage(tabId, request);
        logger.debug('content_source.reinjected', { browserTabId: tabId, method });
        return source;
      } catch (injectionError) {
        // 注入失败时继续走刷新重连，兼容权限或页面状态差异。
        logger.warn('content_source.reinject_failed', { browserTabId: tabId, method, reason: describeError(injectionError) });
      }

      logger.warn('content_source.reloading', { browserTabId: tabId, method, maxRetries: RETRY_AFTER_RELOAD_COUNT });
      await tabs.reload(tabId);
      let lastRetryError: unknown = error;
      for (let retry = 0; retry < RETRY_AFTER_RELOAD_COUNT; retry += 1) {
        await delay(RETRY_DELAY_MS);
        try {
          const source = await tabs.sendMessage(tabId, request);
          logger.debug('content_source.reconnected', { browserTabId: tabId, method, attempt: retry + 1 });
          return source;
        } catch (retryError) {
          lastRetryError = retryError;
          const retryMessage = describeError(retryError);
          if (!retryMessage.includes('Receiving end does not exist') || retry === RETRY_AFTER_RELOAD_COUNT - 1) {
            logger.warn('content_source.reconnect_failed', { browserTabId: tabId, method, attempt: retry + 1, reason: retryMessage });
            throw retryError;
          }
        }
      }

      throw lastRetryError instanceof Error ? lastRetryError : new Error('content script reconnect failed');
    }
  },
});
