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
  'RETRY_USER_MESSAGE',
  'RETRY_MESSAGE',
  'SELECT_ASSISTANT_BRANCH',
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

const sidebarRestoreLoadingBranchStateSchema = z.object({
  /** 分支稳定 id。 */
  branchId: z.string().min(1),
  /** 分支恢复状态。 */
  status: z.enum(['loading', 'cancelled', 'error']),
  /** 分支模型 id。 */
  modelId: z.string().min(1),
  /** 分支请求的大模型调用开始时间。 */
  startedAt: z.number().int().nonnegative().nullable(),
});

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

/** 触发本次提取的来源。 */
export const sidebarExtractionSourceSchema = z.enum([
  'panel_bootstrap',
  'blacklist_continue',
  'manual_reextract',
  'prompt_tab_click',
]);

/** 重新提取页面内容的请求。 */
export const sidebarReExtractContentCommandSchema = sidebarCommandBaseSchema.extend({
  /** 命令类型。 */
  type: z.literal('RE_EXTRACT_CONTENT'),
  /** 指定提取方式。 */
  method: z.enum(['readability', 'jina']),
  /** 本次提取的触发来源。 */
  source: sidebarExtractionSourceSchema,
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
  /** 用户消息展示文本。 */
  displayText: z.string().min(1).optional(),
  /** 用户附带图片。 */
  images: z.array(z.string()),
  /** 是否附带页面正文。 */
  includePageContent: z.boolean(),
  /** 失败时是否回滚本轮新增消息。 */
  rollbackOnFailure: z.boolean().optional(),
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

/** 重试目标用户消息，裁剪其后的结果并重新生成当前轮。 */
export const sidebarRetryUserMessageCommandSchema = sidebarCommandBaseSchema.extend({
  /** 命令类型。 */
  type: z.literal('RETRY_USER_MESSAGE'),
  /** 当前 promptTab 稳定 id。 */
  promptTabId: z.string().min(1),
  /** 目标用户消息 id。 */
  messageId: z.string().min(1),
});

/** 重试目标助手分支。 */
export const sidebarRetryMessageCommandSchema = sidebarCommandBaseSchema.extend({
  /** 命令类型。 */
  type: z.literal('RETRY_MESSAGE'),
  /** 当前 promptTab 稳定 id。 */
  promptTabId: z.string().min(1),
  /** 助手消息 id。 */
  messageId: z.string().min(1),
  /** 目标分支 id。 */
  branchId: z.string().min(1),
});

/** 切换当前轮后续对话使用的主分支。 */
export const sidebarSelectAssistantBranchCommandSchema = sidebarCommandBaseSchema.extend({
  /** 命令类型。 */
  type: z.literal('SELECT_ASSISTANT_BRANCH'),
  /** 当前 promptTab 稳定 id。 */
  promptTabId: z.string().min(1),
  /** 助手消息 id。 */
  messageId: z.string().min(1),
  /** 目标分支 id。 */
  branchId: z.string().min(1),
});

/** 为既有助手消息继续新增分支。 */
export const sidebarExpandMessageBranchesCommandSchema = sidebarCommandBaseSchema.extend({
  /** 命令类型。 */
  type: z.literal('EXPAND_MESSAGE_BRANCHES'),
  /** 当前 promptTab 稳定 id。 */
  promptTabId: z.string().min(1),
  /** 目标助手消息 id。 */
  messageId: z.string().min(1),
  /** 用户选中的模型 id。 */
  modelId: z.string().min(1),
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
  sidebarRetryUserMessageCommandSchema,
  sidebarRetryMessageCommandSchema,
  sidebarSelectAssistantBranchCommandSchema,
  sidebarExpandMessageBranchesCommandSchema,
  sidebarStopSessionCommandSchema,
  sidebarStopBranchCommandSchema,
  sidebarDeleteBranchCommandSchema,
  sidebarExportConversationCommandSchema,
]);
export type SidebarCommandMessage = z.infer<typeof sidebarCommandSchema>;

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

/** 切换提取方法的响应。 */
export const sidebarSwitchExtractionMethodResponseSchema = z.object({
  /** 响应类型。 */
  type: z.literal('SWITCH_EXTRACTION_METHOD_SUCCESS'),
  /** 切换结果。 */
  payload: z.discriminatedUnion('hasCachedContent', [
    z.object({
      /** 是否命中目标方法缓存。 */
      hasCachedContent: z.literal(true),
      /** 已切换的提取方式。 */
      method: z.enum(['readability', 'jina']),
      /** 命中的缓存正文。 */
      content: z.string(),
      /** 命中的缓存提取方式。 */
      extractionMethod: z.enum(['readability', 'jina']),
    }),
    z.object({
      /** 是否命中目标方法缓存。 */
      hasCachedContent: z.literal(false),
      /** 已切换的提取方式。 */
      method: z.enum(['readability', 'jina']),
    }),
  ]),
});
export type SidebarSwitchExtractionMethodResponse = z.infer<typeof sidebarSwitchExtractionMethodResponseSchema>;

/** 分支摘要：命令成功响应里用于 UI 立即插入占位。 */
export const sidebarBranchSummarySchema = z.object({
  /** 分支稳定 id。 */
  branchId: z.string(),
  /** 分支模型 id。 */
  modelId: z.string(),
  /** 分支模型展示名。 */
  modelLabel: z.string(),
});
export type SidebarBranchSummary = z.infer<typeof sidebarBranchSummarySchema>;

/** 新一轮（主分支 + 并行分支）启动成功后的公共载荷。 */
const sidebarTurnStartedPayloadSchema = z.object({
  /** 新建流式会话 id。 */
  sessionId: z.string(),
  /** 助手消息 id。 */
  messageId: z.string(),
  /** 主分支 id。 */
  branchId: z.string(),
  /** 主分支模型 id。 */
  modelId: z.string(),
  /** 主分支模型展示名。 */
  modelLabel: z.string(),
  /** 本轮初始化创建的分支摘要。 */
  branches: z.array(sidebarBranchSummarySchema),
});

/**
 * sidebar 命令成功响应。
 * background handler、side panel API 与 conversations API 都从这里派生类型，不再各自手写一份。
 */
export const sidebarResponseSchema = z.discriminatedUnion('type', [
  sidebarBootstrapResponseSchema,
  z.object({
    /** 响应类型。 */
    type: z.literal('CONFIRM_BLACKLIST_CONTINUE_SUCCESS'),
    /** 放行结果。 */
    payload: z.object({
      /** 是否已允许继续提取。 */
      allowed: z.literal(true),
    }),
  }),
  sidebarSwitchExtractionMethodResponseSchema,
  z.object({
    /** 响应类型。 */
    type: z.literal('RE_EXTRACT_CONTENT_SUCCESS'),
    /** 提取结果。 */
    payload: z.object({
      /** 归一化页面 URL。 */
      normalizedUrl: z.string(),
      /** 页面原始 URL。 */
      url: z.string(),
      /** 页面标题。 */
      title: z.string(),
      /** 页面 favicon。 */
      faviconUrl: z.string(),
      /** 提取后的正文。 */
      content: z.string(),
      /** 本次实际使用的提取方式。 */
      extractionMethod: z.enum(['readability', 'jina']),
    }),
  }),
  z.object({
    /** 响应类型。 */
    type: z.literal('CLEAR_PAGE_CONTEXT_SUCCESS'),
    /** 清理结果。 */
    payload: z.object({
      /** 已清理的归一化页面 URL。 */
      normalizedUrl: z.string(),
      /** 是否已完成清理。 */
      cleared: z.boolean(),
    }),
  }),
  z.object({
    /** 响应类型。 */
    type: z.literal('CLEAR_TAB_CONVERSATION_SUCCESS'),
    /** 清理结果。 */
    payload: z.object({
      /** 已清理的归一化页面 URL。 */
      normalizedUrl: z.string(),
      /** 已清理的 promptTab 稳定 id。 */
      promptTabId: z.string(),
      /** 是否已完成清理。 */
      cleared: z.boolean(),
    }),
  }),
  z.object({
    /** 响应类型。 */
    type: z.literal('SEND_CHAT_SUCCESS'),
    /** 新一轮启动结果。 */
    payload: sidebarTurnStartedPayloadSchema.extend({
      /** 持久化后的用户消息 id。 */
      userMessageId: z.string().nullable(),
    }),
  }),
  z.object({
    /** 响应类型。 */
    type: z.literal('EDIT_USER_MESSAGE_SUCCESS'),
    /** 新一轮启动结果。 */
    payload: sidebarTurnStartedPayloadSchema.extend({
      /** 目标用户消息 id。 */
      editedMessageId: z.string(),
    }),
  }),
  z.object({
    /** 响应类型。 */
    type: z.literal('RETRY_USER_MESSAGE_SUCCESS'),
    /** 新一轮启动结果。 */
    payload: sidebarTurnStartedPayloadSchema.extend({
      /** 被重试的用户消息 id。 */
      retriedMessageId: z.string(),
    }),
  }),
  z.object({
    /** 响应类型。 */
    type: z.literal('RETRY_MESSAGE_SUCCESS'),
    /** 单分支重跑结果。 */
    payload: sidebarBranchSummarySchema.extend({
      /** 助手消息 id。 */
      messageId: z.string(),
      /** 新建流式会话 id。 */
      sessionId: z.string(),
    }),
  }),
  z.object({
    /** 响应类型。 */
    type: z.literal('SELECT_ASSISTANT_BRANCH_SUCCESS'),
    /** 切换结果。 */
    payload: z.object({
      /** 助手消息 id。 */
      messageId: z.string(),
      /** 当前主分支 id。 */
      branchId: z.string(),
    }),
  }),
  z.object({
    /** 响应类型。 */
    type: z.literal('EXPAND_MESSAGE_BRANCHES_SUCCESS'),
    /** 新增分支结果。 */
    payload: z.object({
      /** 目标助手消息 id。 */
      messageId: z.string(),
      /** 新增分支摘要。 */
      branches: z.array(sidebarBranchSummarySchema),
    }),
  }),
  z.object({
    /** 响应类型。 */
    type: z.literal('STOP_SESSION_SUCCESS'),
    /** 停止结果。 */
    payload: z.object({
      /** 会话 id。 */
      sessionId: z.string(),
      /** 是否实际停止。 */
      stopped: z.boolean(),
    }),
  }),
  z.object({
    /** 响应类型。 */
    type: z.literal('STOP_BRANCH_SUCCESS'),
    /** 停止结果。 */
    payload: z.object({
      /** 分支 id。 */
      branchId: z.string(),
      /** 是否实际停止。 */
      stopped: z.boolean(),
    }),
  }),
  z.object({
    /** 响应类型。 */
    type: z.literal('DELETE_BRANCH_SUCCESS'),
    /** 删除结果。 */
    payload: z.object({
      /** 助手消息 id。 */
      messageId: z.string(),
      /** 分支 id。 */
      branchId: z.string(),
      /** 是否已删除。 */
      deleted: z.boolean(),
    }),
  }),
  z.object({
    /** 响应类型。 */
    type: z.literal('EXPORT_CONVERSATION_SUCCESS'),
    /** 导出结果。 */
    payload: z.object({
      /** 下载文件名。 */
      filename: z.string(),
      /** Markdown 内容。 */
      content: z.string(),
      /** MIME 类型。 */
      mimeType: z.literal('text/markdown;charset=utf-8'),
    }),
  }),
]);
export type SidebarResponse = z.infer<typeof sidebarResponseSchema>;
/** 按响应类型取单个响应。 */
export type SidebarResponseFor<Type extends SidebarResponse['type']> = Extract<SidebarResponse, { type: Type }>;
/** 按命令类型取去掉 type 的请求参数。 */
export type SidebarCommandInput<Type extends SidebarCommandMessage['type']> = Omit<Extract<SidebarCommandMessage, { type: Type }>, 'type'>;
export type SidebarExtractionSource = z.infer<typeof sidebarExtractionSourceSchema>;

/** 订阅流式输出的 port 客户端消息。 */
export const sidebarPortClientMessageSchema = z.object({
  /** 客户端消息类型。 */
  type: z.literal('SUBSCRIBE_SIDEBAR_STREAM'),
  /** 浏览器标签页 id；conversations 历史工作台没有真实 tab，使用 0 占位。 */
  tabId: z.number().int().nonnegative(),
  /** 页面原始 URL。 */
  pageUrl: z.string().url(),
  /** 当前 promptTab 稳定 id。 */
  promptTabId: z.string().min(1),
});
export type SidebarPortClientMessage = z.infer<typeof sidebarPortClientMessageSchema>;

/** 一条流的定位字段：所有流式事件共用，避免十个事件各抄一遍。 */
const streamScopeSchema = z.object({
  /** 归一化页面 URL。 */
  normalizedUrl: z.string().min(1),
  /** promptTab 稳定 id。 */
  promptTabId: z.string().min(1),
  /** 本次流式会话 id。 */
  sessionId: z.string().min(1),
  /** 助手消息 id。 */
  messageId: z.string().min(1),
  /** 分支稳定 id；主回答流对应主分支 id。 */
  branchId: z.string().min(1),
});

/** 流开始：携带模型身份与大模型调用开始时间。 */
const streamStartedFieldsSchema = z.object({
  /** 分支模型 id。 */
  modelId: z.string().min(1),
  /** 分支模型展示名。 */
  modelLabel: z.string().min(1),
  /** 本次请求的大模型调用开始时间。 */
  startedAt: z.number().int().nonnegative(),
});

/** 流增量：单个批次的文本。 */
const streamChunkFieldsSchema = z.object({
  /** 增量文本。 */
  chunk: z.string(),
});

/** 流收敛：从发起到本地消费完流的耗时，调用前失败时为 null。 */
const streamTerminalFieldsSchema = z.object({
  /** 本次调用从发起到本地消费完流的耗时。 */
  durationMs: z.number().int().nonnegative().nullable(),
});

/** 流失败：错误文本与可选的回滚标记。 */
const streamFailedFieldsSchema = streamTerminalFieldsSchema.extend({
  /** 错误消息。 */
  errorMessage: z.string().min(1),
  /** 是否已回滚本轮新增消息。 */
  rollbackOnFailure: z.boolean().optional(),
  /** 本轮用户消息 id。 */
  userMessageId: z.string().min(1).optional(),
});

/** sidebar port 事件。 */
export const sidebarPortEventSchema = z.discriminatedUnion('type', [
  streamScopeSchema.extend({ type: z.literal('BRANCH_STREAM_STARTED') }).extend(streamStartedFieldsSchema.shape),
  streamScopeSchema.extend({ type: z.literal('BRANCH_STREAM_CHUNK') }).extend(streamChunkFieldsSchema.shape),
  streamScopeSchema.extend({ type: z.literal('BRANCH_STREAM_FINISHED') }).extend(streamTerminalFieldsSchema.shape),
  streamScopeSchema.extend({ type: z.literal('BRANCH_STREAM_FAILED') }).extend(streamFailedFieldsSchema.shape),
  streamScopeSchema.extend({ type: z.literal('BRANCH_STREAM_CANCELLED') }).extend(streamTerminalFieldsSchema.shape),
  streamScopeSchema.extend({ type: z.literal('CHAT_STREAM_STARTED') }).extend(streamStartedFieldsSchema.shape),
  streamScopeSchema.extend({ type: z.literal('CHAT_STREAM_CHUNK') }).extend(streamChunkFieldsSchema.shape),
  streamScopeSchema.extend({ type: z.literal('CHAT_STREAM_FINISHED') }).extend(streamTerminalFieldsSchema.shape),
  streamScopeSchema.extend({ type: z.literal('CHAT_STREAM_FAILED') }).extend(streamFailedFieldsSchema.shape),
  streamScopeSchema.extend({ type: z.literal('CHAT_STREAM_CANCELLED') }).extend(streamTerminalFieldsSchema.shape),
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
    status: z.enum(['loading', 'done', 'cancelled', 'error']),
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
    /** 主请求的大模型调用开始时间。 */
    startedAt: z.number().int().nonnegative().nullable(),
    /** 分支级 loading 恢复状态。 */
    branchStates: z.array(sidebarRestoreLoadingBranchStateSchema),
  }),
]);
export type SidebarPortEvent = z.infer<typeof sidebarPortEventSchema>;

export type SidebarBootstrapResponse = z.infer<typeof sidebarBootstrapResponseSchema>;
export type SidebarConversationRecord = z.infer<typeof sidebarConversationRecordSchema>;
export type SidebarLoadingStateRecord = z.infer<typeof sidebarLoadingStateRecordSchema>;
export type SidebarPageRecord = z.infer<typeof sidebarPageRecordSchema>;
