import type { PageRecord } from './page-schema';

/** 历史列表需要的页面元数据，正文和运行状态由详情请求读取。 */
export type PageSummary = Pick<PageRecord, 'normalizedUrl' | 'url' | 'title' | 'faviconUrl'>;

/** 明确挑选列表字段，避免把正文、提取缓存及未来新增字段传入列表。 */
export const toPageSummary = (page: PageSummary): PageSummary => ({
  normalizedUrl: page.normalizedUrl,
  url: page.url,
  title: page.title,
  faviconUrl: page.faviconUrl,
});
