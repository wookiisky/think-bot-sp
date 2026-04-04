import { z } from 'zod';

import { conversationRecordSchema } from '../../domain/conversation/conversation-schema';
import { loadingStateRecordSchema } from '../../domain/loading/loading-state-schema';
import { pageRecordSchema } from '../../domain/page/page-schema';

/** sidebar 支持的命令类型枚举值。 */
export const sidebarCommandTypeValues = [
  'GET_SIDEBAR_BOOTSTRAP',
  'CONFIRM_BLACKLIST_CONTINUE',
  'SWITCH_EXTRACTION_METHOD',
  'RE_EXTRACT_CONTENT',
  'CLEAR_PAGE_CONTEXT',
  'CLEAR_TAB_CONVERSATION',
  'SEND_CHAT',
  'EDIT_USER_MESSAGE',
  'RETRY_MESSAGE',
  'EXPAND_MESSAGE_BRANCHES',
  'STOP_SESSION',
  'STOP_BRANCH',
  'DELETE_BRANCH',
  'EXPORT_CONVERSATION',
] as const;

/** sidebar 命令类型。 */
export const sidebarCommandTypeSchema = z.enum(sidebarCommandTypeValues);

/** sidebar 长连接 port 名称。 */
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
  /** 指定提取方式。 */
  method: z.enum(['readability', 'jina']),
});

/** 重新提取页面内容的请求。 */
export const sidebarReExtractContentCommandSchema = sidebarCommandBaseSchema.extend({
  /** 命令类型。 */
  type: z.literal('RE_EXTRACT_CONTENT'),
  /** 指定提取方式。 */
  method: z.enum(['readability', 'jina']),
});

/** 发送主聊天请求。 */
export const sidebarSendChatCommandSchema = sidebarCommandBaseSchema.extend({
  /** 命令类型。 */
  type: z.literal('SEND_CHAT'),
  /** 当前 promptTab 稳定 id。 */
  promptTabId: z.string().min(1),
  /** 使用的模型 id。 */
  modelId: z.string().min(1),
  /** 用户输入文本。 */
  text: z.string(),
  /** 用户附带图片。 */
  images: z.array(z.string()),
  /** 是否附带页面正文。 */
  includePageContent: z.boolean(),
});

/** 编辑目标用户消息并重发。 */
export const sidebarEditUserMessageCommandSchema = sidebarCommandBaseSchema.extend({
  /** 命令类型。 */
  type: z.literal('EDIT_USER_MESSAGE'),
  /** 当前 promptTab 稳定 id。 */
  promptTabId: z.string().min(1),
  /** 目标用户消息 id。 */
  messageId: z.string().min(1),
  /** 编辑后的用户文本。 */
  text: z.string().min(1),
});

/** 重试目标助手消息，并用新的主回答替换旧结果。 */
export const sidebarRetryMessageCommandSchema = sidebarCommandBaseSchema.extend({
  /** 命令类型。 */
  type: z.literal('RETRY_MESSAGE'),
  /** 当前 promptTab 稳定 id。 */
  promptTabId: z.string().min(1),
  /** 被替换的旧助手消息 id。 */
  messageId: z.string().min(1),
});

/** 为既有助手消息继续新增分支。 */
export const sidebarExpandMessageBranchesCommandSchema = sidebarCommandBaseSchema.extend({
  /** 命令类型。 */
  type: z.literal('EXPAND_MESSAGE_BRANCHES'),
  /** 当前 promptTab 稳定 id。 */
  promptTabId: z.string().min(1),
  /** 目标助手消息 id。 */
  messageId: z.string().min(1),
});

/** 清空当前页面缓存、会话与 loading。 */
export const sidebarClearPageContextCommandSchema = sidebarCommandBaseSchema.extend({
  /** 命令类型。 */
  type: z.literal('CLEAR_PAGE_CONTEXT'),
});

/** 清空当前 promptTab 会话与 loading。 */
export const sidebarClearTabConversationCommandSchema = sidebarCommandBaseSchema.extend({
  /** 命令类型。 */
  type: z.literal('CLEAR_TAB_CONVERSATION'),
  /** 当前 promptTab 稳定 id。 */
  promptTabId: z.string().min(1),
});

/** 停止主聊天请求。 */
export const sidebarStopSessionCommandSchema = sidebarCommandBaseSchema.extend({
  /** 命令类型。 */
  type: z.literal('STOP_SESSION'),
  /** 当前 promptTab 稳定 id。 */
  promptTabId: z.string().min(1),
  /** 会话 id。 */
  sessionId: z.string().min(1),
});

/** 停止单个分支流。 */
export const sidebarStopBranchCommandSchema = sidebarCommandBaseSchema.extend({
  /** 命令类型。 */
  type: z.literal('STOP_BRANCH'),
  /** 当前 promptTab 稳定 id。 */
  promptTabId: z.string().min(1),
  /** 目标分支 id。 */
  branchId: z.string().min(1),
});

/** 删除单个分支。 */
export const sidebarDeleteBranchCommandSchema = sidebarCommandBaseSchema.extend({
  /** 命令类型。 */
  type: z.literal('DELETE_BRANCH'),
  /** 当前 promptTab 稳定 id。 */
  promptTabId: z.string().min(1),
  /** 目标助手消息 id。 */
  messageId: z.string().min(1),
  /** 目标分支 id。 */
  branchId: z.string().min(1),
});

/** 导出当前会话。 */
export const sidebarExportConversationCommandSchema = sidebarCommandBaseSchema.extend({
  /** 命令类型。 */
  type: z.literal('EXPORT_CONVERSATION'),
  /** 当前 promptTab 稳定 id。 */
  promptTabId: z.string().min(1),
});

/** sidebar 命令请求。 */
export const sidebarCommandSchema = z.discriminatedUnion('type', [
  sidebarBootstrapCommandSchema,
  sidebarConfirmBlacklistContinueCommandSchema,
  sidebarSwitchExtractionMethodCommandSchema,
  sidebarReExtractContentCommandSchema,
  sidebarClearPageContextCommandSchema,
  sidebarClearTabConversationCommandSchema,
  sidebarSendChatCommandSchema,
  sidebarEditUserMessageCommandSchema,
  sidebarRetryMessageCommandSchema,
  sidebarExpandMessageBranchesCommandSchema,
  sidebarStopSessionCommandSchema,
  sidebarStopBranchCommandSchema,
  sidebarDeleteBranchCommandSchema,
  sidebarExportConversationCommandSchema,
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

/** 订阅流式输出的 port 客户端消息。 */
export const sidebarPortClientMessageSchema = z.object({
  /** 客户端消息类型。 */
  type: z.literal('SUBSCRIBE_SIDEBAR_STREAM'),
  /** 浏览器标签页 id。 */
  tabId: z.number().int().positive(),
  /** 页面原始 URL。 */
  pageUrl: z.string().url(),
  /** 当前 promptTab 稳定 id。 */
  promptTabId: z.string().min(1),
});

/** sidebar port 事件。 */
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
  z.object({
    /** 事件类型。 */
    type: z.literal('BRANCH_STREAM_STARTED'),
    /** 归一化页面 URL。 */
    normalizedUrl: z.string().min(1),
    /** promptTab 稳定 id。 */
    promptTabId: z.string().min(1),
    /** 本次流式会话 id。 */
    sessionId: z.string().min(1),
    /** 助手消息 id。 */
    messageId: z.string().min(1),
    /** 分支稳定 id。 */
    branchId: z.string().min(1),
    /** 分支模型 id。 */
    modelId: z.string().min(1),
    /** 分支模型展示名。 */
    modelLabel: z.string().min(1),
  }),
  z.object({
    /** 事件类型。 */
    type: z.literal('BRANCH_STREAM_CHUNK'),
    /** 归一化页面 URL。 */
    normalizedUrl: z.string().min(1),
    /** promptTab 稳定 id。 */
    promptTabId: z.string().min(1),
    /** 本次流式会话 id。 */
    sessionId: z.string().min(1),
    /** 助手消息 id。 */
    messageId: z.string().min(1),
    /** 分支稳定 id。 */
    branchId: z.string().min(1),
    /** 增量文本。 */
    chunk: z.string(),
  }),
  z.object({
    /** 事件类型。 */
    type: z.literal('BRANCH_STREAM_FINISHED'),
    /** 归一化页面 URL。 */
    normalizedUrl: z.string().min(1),
    /** promptTab 稳定 id。 */
    promptTabId: z.string().min(1),
    /** 本次流式会话 id。 */
    sessionId: z.string().min(1),
    /** 助手消息 id。 */
    messageId: z.string().min(1),
    /** 分支稳定 id。 */
    branchId: z.string().min(1),
  }),
  z.object({
    /** 事件类型。 */
    type: z.literal('BRANCH_STREAM_FAILED'),
    /** 归一化页面 URL。 */
    normalizedUrl: z.string().min(1),
    /** promptTab 稳定 id。 */
    promptTabId: z.string().min(1),
    /** 本次流式会话 id。 */
    sessionId: z.string().min(1),
    /** 助手消息 id。 */
    messageId: z.string().min(1),
    /** 分支稳定 id。 */
    branchId: z.string().min(1),
    /** 错误消息。 */
    errorMessage: z.string().min(1),
  }),
  z.object({
    /** 事件类型。 */
    type: z.literal('BRANCH_STREAM_CANCELLED'),
    /** 归一化页面 URL。 */
    normalizedUrl: z.string().min(1),
    /** promptTab 稳定 id。 */
    promptTabId: z.string().min(1),
    /** 本次流式会话 id。 */
    sessionId: z.string().min(1),
    /** 助手消息 id。 */
    messageId: z.string().min(1),
    /** 分支稳定 id。 */
    branchId: z.string().min(1),
  }),
  z.object({
    /** 事件类型。 */
    type: z.literal('CHAT_STREAM_STARTED'),
    /** 归一化页面 URL。 */
    normalizedUrl: z.string().min(1),
    /** promptTab 稳定 id。 */
    promptTabId: z.string().min(1),
    /** 本次流式会话 id。 */
    sessionId: z.string().min(1),
    /** 助手消息 id。 */
    messageId: z.string().min(1),
  }),
  z.object({
    /** 事件类型。 */
    type: z.literal('CHAT_STREAM_CHUNK'),
    /** 归一化页面 URL。 */
    normalizedUrl: z.string().min(1),
    /** promptTab 稳定 id。 */
    promptTabId: z.string().min(1),
    /** 本次流式会话 id。 */
    sessionId: z.string().min(1),
    /** 助手消息 id。 */
    messageId: z.string().min(1),
    /** 增量文本。 */
    chunk: z.string(),
  }),
  z.object({
    /** 事件类型。 */
    type: z.literal('CHAT_STREAM_FINISHED'),
    /** 归一化页面 URL。 */
    normalizedUrl: z.string().min(1),
    /** promptTab 稳定 id。 */
    promptTabId: z.string().min(1),
    /** 本次流式会话 id。 */
    sessionId: z.string().min(1),
    /** 助手消息 id。 */
    messageId: z.string().min(1),
  }),
  z.object({
    /** 事件类型。 */
    type: z.literal('CHAT_STREAM_FAILED'),
    /** 归一化页面 URL。 */
    normalizedUrl: z.string().min(1),
    /** promptTab 稳定 id。 */
    promptTabId: z.string().min(1),
    /** 本次流式会话 id。 */
    sessionId: z.string().min(1),
    /** 助手消息 id。 */
    messageId: z.string().min(1),
    /** 错误消息。 */
    errorMessage: z.string().min(1),
  }),
  z.object({
    /** 事件类型。 */
    type: z.literal('CHAT_STREAM_CANCELLED'),
    /** 归一化页面 URL。 */
    normalizedUrl: z.string().min(1),
    /** promptTab 稳定 id。 */
    promptTabId: z.string().min(1),
    /** 本次流式会话 id。 */
    sessionId: z.string().min(1),
    /** 助手消息 id。 */
    messageId: z.string().min(1),
  }),
  z.object({
    /** 事件类型。 */
    type: z.literal('LOADING_STATE_UPDATE'),
    /** 归一化页面 URL。 */
    normalizedUrl: z.string().min(1),
    /** promptTab 稳定 id。 */
    promptTabId: z.string().min(1),
    /** 本次流式会话 id。 */
    sessionId: z.string().min(1),
    /** 当前 loading 状态。 */
    status: z.enum(['loading', 'cancelled', 'error']),
  }),
  z.object({
    /** 事件类型。 */
    type: z.literal('RESTORE_LOADING'),
    /** 归一化页面 URL。 */
    normalizedUrl: z.string().min(1),
    /** promptTab 稳定 id。 */
    promptTabId: z.string().min(1),
    /** 本次流式会话 id。 */
    sessionId: z.string().min(1),
    /** 助手消息 id。 */
    messageId: z.string().min(1),
    /** 当前已落库内容。 */
    content: z.string(),
  }),
]);

export type SidebarBootstrapResponse = z.infer<typeof sidebarBootstrapResponseSchema>;
export type SidebarConversationRecord = z.infer<typeof sidebarConversationRecordSchema>;
export type SidebarLoadingStateRecord = z.infer<typeof sidebarLoadingStateRecordSchema>;
export type SidebarPageRecord = z.infer<typeof sidebarPageRecordSchema>;
export type SidebarPortEvent = z.infer<typeof sidebarPortEventSchema>;
