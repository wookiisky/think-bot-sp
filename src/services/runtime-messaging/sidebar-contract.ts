import { z } from 'zod';

import { conversationRecordSchema } from '../../domain/conversation/conversation-schema';
import { loadingStateRecordSchema } from '../../domain/loading/loading-state-schema';
import { pageRecordSchema } from '../../domain/page/page-schema';

/** 阶段 3 sidebar 支持的命令类型枚举值。 */
export const sidebarCommandTypeValues = [
  'GET_SIDEBAR_BOOTSTRAP',
  'CONFIRM_BLACKLIST_CONTINUE',
  'SWITCH_EXTRACTION_METHOD',
  'RE_EXTRACT_CONTENT',
] as const;

/** 阶段 3 sidebar 命令类型。 */
export const sidebarCommandTypeSchema = z.enum(sidebarCommandTypeValues);

/** 阶段 3 sidebar 长连接 port 名称。 */
export const sidebarPortNameSchema = z.literal('sidepanel');

/** 页面记录。 */
export const sidebarPageRecordSchema = pageRecordSchema;

/** conversation 记录。 */
export const sidebarConversationRecordSchema = conversationRecordSchema;

/** loading 状态记录。 */
export const sidebarLoadingStateRecordSchema = loadingStateRecordSchema;

const sidebarCommandBaseSchema = z.object({
  /** 浏览器标签页 id。 */
  tabId: z.number().int(),
  /** 页面原始 URL。 */
  pageUrl: z.string().url(),
});

/** 获取 sidebar bootstrap 的请求。 */
export const sidebarBootstrapCommandSchema = sidebarCommandBaseSchema.extend({
  /** 命令类型。 */
  type: z.literal('GET_SIDEBAR_BOOTSTRAP'),
});

/** 确认黑名单继续执行的请求。 */
export const sidebarConfirmBlacklistContinueCommandSchema = sidebarCommandBaseSchema.extend({
  /** 命令类型。 */
  type: z.literal('CONFIRM_BLACKLIST_CONTINUE'),
});

/** 切换提取方法的请求。 */
export const sidebarSwitchExtractionMethodCommandSchema = sidebarCommandBaseSchema.extend({
  /** 命令类型。 */
  type: z.literal('SWITCH_EXTRACTION_METHOD'),
});

/** 重新提取页面内容的请求。 */
export const sidebarReExtractContentCommandSchema = sidebarCommandBaseSchema.extend({
  /** 命令类型。 */
  type: z.literal('RE_EXTRACT_CONTENT'),
});

/** sidebar 命令请求。 */
export const sidebarCommandSchema = z.discriminatedUnion('type', [
  sidebarBootstrapCommandSchema,
  sidebarConfirmBlacklistContinueCommandSchema,
  sidebarSwitchExtractionMethodCommandSchema,
  sidebarReExtractContentCommandSchema,
]);

/** sidebar 命令类型信封。 */
export const sidebarCommandEnvelopeSchema = z.object({
  /** 命令类型。 */
  type: sidebarCommandTypeSchema,
});

/** sidebar bootstrap 的响应。 */
export const sidebarBootstrapResponseSchema = z.object({
  /** 响应类型。 */
  type: z.literal('GET_SIDEBAR_BOOTSTRAP_SUCCESS'),
  /** 浏览器标签页 id。 */
  browserTabId: z.number().int(),
  /** 归一化后的页面 URL。 */
  normalizedUrl: z.string().min(1),
  /** 页面记录。 */
  page: sidebarPageRecordSchema.nullable(),
  /** 当前页面下的 conversation 列表。 */
  conversations: z.array(sidebarConversationRecordSchema),
  /** 当前页面下的 loading 状态列表。 */
  loadingStates: z.array(sidebarLoadingStateRecordSchema),
  /** 是否被黑名单阻止。 */
  blockedByBlacklist: z.boolean(),
  /** 命中的黑名单规则 id。 */
  matchedRuleId: z.string().nullable(),
  /** 当前是否应该继续提取。 */
  shouldExtract: z.boolean(),
});

/** sidebar port 事件类型。 */
export const sidebarPortEventSchema = z.discriminatedUnion('type', [
  z.object({
    /** 事件类型。 */
    type: z.literal('PORT_REGISTERED'),
    /** port 名称。 */
    portName: sidebarPortNameSchema,
  }),
  z.object({
    /** 事件类型。 */
    type: z.literal('PORT_DISCONNECTED'),
    /** port 名称。 */
    portName: sidebarPortNameSchema,
  }),
  z.object({
    /** 事件类型。 */
    type: z.literal('PORT_RECOVERED'),
    /** port 名称。 */
    portName: sidebarPortNameSchema,
  }),
]);

/** sidebar port 事件。 */
export type SidebarPortEvent = z.infer<typeof sidebarPortEventSchema>;
