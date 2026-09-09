import type { ExtractionMethod } from '../../domain/page/page-schema';

/** content script 按提取方法返回正文或仅页面元数据。 */
export type PageSource = {
  url: string;
  title: string;
  faviconUrl: string;
  readability?: { content: string; title: string } | null;
};

export type CollectPageSourceInput = { tabId: number; method: ExtractionMethod };
export type CollectPageSourceMessage = { type: 'COLLECT_PAGE_SOURCE'; method: ExtractionMethod };
