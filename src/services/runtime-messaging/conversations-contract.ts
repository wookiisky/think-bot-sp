import { z } from 'zod';

import { conversationRecordSchema } from '../../domain/conversation/conversation-schema';
import { loadingStateRecordSchema } from '../../domain/loading/loading-state-schema';
import { pageRecordSchema } from '../../domain/page/page-schema';

/** conversations 页支持的命令类型。 */
export const conversationsCommandTypeValues = [
  'LIST_PAGES',
  'SEARCH_PAGES',
  'GET_PAGE_DETAIL',
  'UPDATE_PAGE_TITLE',
  'DELETE_PAGE',
] as const;

/** conversations 页命令类型。 */
export const conversationsCommandTypeSchema = z.enum(conversationsCommandTypeValues);

/** 页面列表命令。 */
export const listPagesCommandSchema = z.object({
  /** 命令类型。 */
  type: z.literal('LIST_PAGES'),
});

/** 页面搜索命令。 */
export const searchPagesCommandSchema = z.object({
  /** 命令类型。 */
  type: z.literal('SEARCH_PAGES'),
  /** 搜索词。 */
  query: z.string(),
});

/** 获取页面详情命令。 */
export const getPageDetailCommandSchema = z.object({
  /** 命令类型。 */
  type: z.literal('GET_PAGE_DETAIL'),
  /** 归一化后的页面 URL。 */
  normalizedUrl: z.string().min(1),
});

/** 更新页面标题命令。 */
export const updatePageTitleCommandSchema = z.object({
  /** 命令类型。 */
  type: z.literal('UPDATE_PAGE_TITLE'),
  /** 归一化后的页面 URL。 */
  normalizedUrl: z.string().min(1),
  /** 新标题。 */
  title: z.string(),
});

/** 删除页面命令。 */
export const deletePageCommandSchema = z.object({
  /** 命令类型。 */
  type: z.literal('DELETE_PAGE'),
  /** 归一化后的页面 URL。 */
  normalizedUrl: z.string().min(1),
});

/** conversations 命令联合。 */
export const conversationsCommandSchema = z.discriminatedUnion('type', [
  listPagesCommandSchema,
  searchPagesCommandSchema,
  getPageDetailCommandSchema,
  updatePageTitleCommandSchema,
  deletePageCommandSchema,
]);

/** 命令信封。 */
export const conversationsCommandEnvelopeSchema = z.object({
  /** 命令类型。 */
  type: conversationsCommandTypeSchema,
});

/** 页面详情响应。 */
export const pageDetailResponseSchema = z.object({
  /** 响应类型。 */
  type: z.literal('GET_PAGE_DETAIL_SUCCESS'),
  /** 页面记录。 */
  page: pageRecordSchema.nullable(),
  /** 当前页面的全部会话。 */
  conversations: z.array(conversationRecordSchema),
  /** 当前页面的全部 loading。 */
  loadingStates: z.array(loadingStateRecordSchema),
  /** 当前建议激活的标签。 */
  activePromptTabId: z.string().min(1),
});
