import { normalizePageUrl } from '../../domain/page/page-schema';
import {
  sidebarBootstrapCommandSchema,
  sidebarDeleteBranchCommandSchema,
  sidebarEditUserMessageCommandSchema,
  sidebarExpandMessageBranchesCommandSchema,
  sidebarClearTabConversationCommandSchema,
  sidebarClearPageContextCommandSchema,
  sidebarCommandEnvelopeSchema,
  sidebarCommandTypeValues,
  sidebarExportConversationCommandSchema,
  sidebarRetryMessageCommandSchema,
  sidebarRetryUserMessageCommandSchema,
  sidebarSendChatCommandSchema,
  sidebarStopBranchCommandSchema,
  sidebarStopSessionCommandSchema,
  type SidebarBootstrapResponse,
  type SidebarConversationRecord,
  type SidebarLoadingStateRecord,
  type SidebarPageRecord,
} from './sidebar-contract';
import { deletePageWithPolicy } from './page-delete';
import type { SidebarSession, SidebarSessionScope } from './sidebar-session-registry';
import { assertSidebarPageSender, type SidebarMessageSender } from './sender';

/** 阶段 4 sidebar 命令集合。 */
export const sidebarCommandTypes = new Set(sidebarCommandTypeValues);

/** 判断输入是否是 sidebar 相关命令。 */
export const isSidebarCommandMessage = (input: unknown): input is { type: string } =>
  sidebarCommandEnvelopeSchema.safeParse(input).success;

type PageRepository = {
  /** 读取页面记录。 */
  getPage(normalizedUrl: string): Promise<SidebarPageRecord | null>;
  /** 更新页面级 includePageContent。 */
  setIncludePageContent?: (input: {
    /** 归一化页面 URL。 */
    normalizedUrl: string;
    /** 页面原始 URL。 */
    url: string;
    /** 页面级正文开关。 */
    includePageContent: boolean;
  }) => Promise<SidebarPageRecord | null>;
  /** 更新单个 promptTab 的页面级运行态。 */
  setPromptTabState?: (input: {
    /** 归一化页面 URL。 */
    normalizedUrl: string;
    /** 页面原始 URL。 */
    url: string;
    /** promptTab 稳定 id。 */
    promptTabId: string;
    /** 初始化时间。 */
    initializedAt?: number | null;
    /** 最近一次自动触发时间。 */
    lastAutoTriggerAt?: number | null;
    /** 自动触发状态。 */
    autoTriggerStatus?: 'idle' | 'queued' | 'running' | 'done' | 'error';
    /** 最近一次清空时间。 */
    lastClearedAt?: number | null;
  }) => Promise<SidebarPageRecord | null>;
  /** 清理页面级数据。 */
  deletePage?: (normalizedUrl: string) => Promise<void>;
};

type ConfigRepository = {
  /** 读取当前配置。 */
  getConfig: () => Promise<{
    sync: {
      enabled: boolean;
      provider: string;
    };
  }>;
};

type SyncRepository = {
  /** 追加页面级墓碑。 */
  appendPageTombstone: (input: { normalizedUrl: string; deletedAt: number }) => Promise<void>;
};

type ConversationRepository = {
  /** 按页面列出 conversation。 */
  listPageConversations(normalizedUrl: string): Promise<SidebarConversationRecord[]>;
  /** 按页面列出 loading 状态。 */
  listPageLoadingStates(normalizedUrl: string): Promise<SidebarLoadingStateRecord[]>;
  /** 清理单个 promptTab 数据。 */
  clearPromptTabData?: (normalizedUrl: string, promptTabId: string) => Promise<void>;
  /** 删除单个助手分支。 */
  deleteAssistantBranch?: (input: {
    /** 归一化页面 URL。 */
    normalizedUrl: string;
    /** promptTab 稳定 id。 */
    promptTabId: string;
    /** 助手消息 id。 */
    messageId: string;
    /** 分支稳定 id。 */
    branchId: string;
    /** 当前时间。 */
    now: number;
  }) => Promise<void>;
  /** 删除单个分支 loading。 */
  removeBranchLoadingState?: (normalizedUrl: string, promptTabId: string, branchId: string) => Promise<void>;
};

type BlacklistRepository = {
  /** 判断页面是否被黑名单阻止。 */
  isBlocked(input: { browserTabId: number; normalizedUrl: string }): Promise<boolean> | boolean;
  /** 读取命中的黑名单规则。 */
  getMatchedRuleId(input: { browserTabId: number; normalizedUrl: string }): Promise<string | null> | string | null;
};

type ChatDispatchService = {
  /** 发起主聊天流。 */
  dispatchChat: (input: {
    /** 归一化页面 URL。 */
    normalizedUrl: string;
    /** promptTab 稳定 id。 */
    promptTabId: string;
    /** 模型 id。 */
    modelId: string;
    /** 用户文本。 */
    content: string;
    /** 用户消息展示文本。 */
    displayText?: string;
    /** 用户图片。 */
    images: string[];
    /** 当前请求要带给模型的页面正文。 */
    pageContent: string;
  }) => Promise<ChatSession>;
  /** 编辑目标用户消息并重发。 */
  editUserMessage: (input: {
    /** 归一化页面 URL。 */
    normalizedUrl: string;
    /** promptTab 稳定 id。 */
    promptTabId: string;
    /** 目标用户消息 id。 */
    messageId: string;
    /** 编辑后的用户文本。 */
    content: string;
  }) => Promise<ChatSession>;
  /** 重试目标用户消息，追加为既有助手消息的新分支。 */
  retryUserMessage: (input: {
    /** 归一化页面 URL。 */
    normalizedUrl: string;
    /** promptTab 稳定 id。 */
    promptTabId: string;
    /** 目标用户消息 id。 */
    messageId: string;
  }) => Promise<
    ChatSession & {
      /** 新建分支 id。 */
      branchId: string;
      /** 分支模型 id。 */
      modelId: string;
      /** 分支模型展示名。 */
      modelLabel: string;
    }
  >;
  /** 重试目标助手消息，并替换旧结果。 */
  retryMessage: (input: {
    /** 归一化页面 URL。 */
    normalizedUrl: string;
    /** promptTab 稳定 id。 */
    promptTabId: string;
    /** 被替换的旧助手消息 id。 */
    messageId: string;
  }) => Promise<ChatSession>;
  /** 为既有助手消息继续新增分支。 */
  expandBranches: (input: {
    /** 归一化页面 URL。 */
    normalizedUrl: string;
    /** promptTab 稳定 id。 */
    promptTabId: string;
    /** 目标助手消息 id。 */
    messageId: string;
  }) => Promise<ChatSession[]>;
};

type ChatSession = SidebarSession;

type ConversationExporter = {
  /** 导出当前会话。 */
  exportConversation: (input: {
    /** 归一化页面 URL。 */
    normalizedUrl: string;
    /** promptTab 稳定 id。 */
    promptTabId: string;
  }) => Promise<unknown>;
};

type SidebarHandlerContext = {
  /** 消息发送方。 */
  sender: SidebarMessageSender;
};

type SidebarCommandLogger = {
  /** info 级别日志。 */
  info: (_event: string, _payload?: Record<string, unknown>) => void;
  /** warn 级别日志。 */
  warn: (_event: string, _payload?: Record<string, unknown>) => void;
  /** error 级别日志。 */
  error: (_event: string, _payload?: Record<string, unknown>) => void;
};

/** 创建 sidebar runtime command 处理器。 */
export const createSidebarCommandHandler = ({
  pageRepository,
  conversationRepository,
  blacklistRepository,
  runtime,
  chatDispatchService,
  conversationExporter,
  sessionRegistry,
  logger,
  configRepository,
  syncRepository,
  assertPageSender = assertSidebarPageSender,
  now = () => Date.now(),
}: {
  pageRepository: PageRepository;
  conversationRepository: ConversationRepository;
  blacklistRepository: BlacklistRepository;
  runtime: { id: string };
  chatDispatchService?: ChatDispatchService;
  conversationExporter?: ConversationExporter;
  sessionRegistry: {
    /** 注册活跃会话。 */
    register: (session: SidebarSession, scope: SidebarSessionScope) => void;
    /** 精确取消某个会话。 */
    cancelSession: (input: { sessionId: string; normalizedUrl: string; promptTabId: string }) => boolean;
    /** 精确取消某个分支会话。 */
    cancelBranchSession: (input: { normalizedUrl: string; promptTabId: string; branchId: string }) => boolean;
    /** 精确取消某个分支会话并等待收敛。 */
    cancelBranchSessionAndWait: (input: { normalizedUrl: string; promptTabId: string; branchId: string }) => Promise<boolean>;
    /** 取消当前页面全部活跃会话。 */
    cancelPageSessions: (normalizedUrl: string) => Promise<number>;
    /** 取消当前 promptTab 全部活跃会话。 */
    cancelPromptTabSessions: (input: { normalizedUrl: string; promptTabId: string }) => Promise<number>;
  };
  logger?: SidebarCommandLogger;
  configRepository?: ConfigRepository;
  syncRepository?: SyncRepository;
  assertPageSender?: (sender: SidebarMessageSender, runtimeId: string) => void;
  now?: () => number;
}) => {
  const commandLogger = logger ?? {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };

  return async (input: unknown, context: SidebarHandlerContext) => {
    if (!isSidebarCommandMessage(input)) {
      const type = typeof input === 'object' && input !== null && 'type' in input ? String((input as { type: unknown }).type) : 'unknown';
      throw new Error(`unsupported command: ${type}`);
    }

    switch (input.type) {
      case 'GET_SIDEBAR_BOOTSTRAP': {
        const command = sidebarBootstrapCommandSchema.parse(input);
        assertPageSender(context.sender, runtime.id);

        const normalizedUrl = normalizePageUrl(command.pageUrl);
        commandLogger.info('panel.init.started', {
          browserTabId: command.tabId,
          normalizedUrl,
        });
        const [page, conversations, loadingStates, blockedByBlacklist, matchedRuleId] = await Promise.all([
          pageRepository.getPage(normalizedUrl),
          conversationRepository.listPageConversations(normalizedUrl),
          conversationRepository.listPageLoadingStates(normalizedUrl),
          blacklistRepository.isBlocked({
            browserTabId: command.tabId,
            normalizedUrl,
          }),
          blacklistRepository.getMatchedRuleId({
            browserTabId: command.tabId,
            normalizedUrl,
          }),
        ]);

        const response: SidebarBootstrapResponse = {
          type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
          browserTabId: command.tabId,
          normalizedUrl,
          page,
          conversations,
          loadingStates,
          blockedByBlacklist,
          matchedRuleId,
          shouldExtract: !page?.content,
        };
        commandLogger.info('page.info.loaded', {
          browserTabId: command.tabId,
          normalizedUrl,
          hasPage: page !== null,
          conversationCount: conversations.length,
          loadingCount: loadingStates.length,
        });
        if (blockedByBlacklist) {
          commandLogger.info('blacklist.detected', {
            browserTabId: command.tabId,
            normalizedUrl,
            matchedRuleId,
          });
        }

        return response;
      }
      case 'SEND_CHAT': {
        const command = sidebarSendChatCommandSchema.parse(input);
        assertPageSender(context.sender, runtime.id);
        if (!chatDispatchService) {
          throw new Error('unsupported command: SEND_CHAT');
        }
        const normalizedUrl = normalizePageUrl(command.pageUrl);
        const now = Date.now();
        const page =
          (await pageRepository.setIncludePageContent?.({
            normalizedUrl,
            url: command.pageUrl,
            includePageContent: command.includePageContent,
          })) ?? (await pageRepository.getPage(normalizedUrl));
        const promptTabState = page?.promptTabStates.find((item) => item.promptTabId === command.promptTabId) ?? null;
        if (promptTabState?.initializedAt === null || !promptTabState) {
          await pageRepository.setPromptTabState?.({
            normalizedUrl,
            url: command.pageUrl,
            promptTabId: command.promptTabId,
            initializedAt: now,
            autoTriggerStatus: promptTabState?.autoTriggerStatus === 'error' ? 'idle' : promptTabState?.autoTriggerStatus ?? 'idle',
          });
        }

        const session = await chatDispatchService.dispatchChat({
          normalizedUrl,
          promptTabId: command.promptTabId,
          modelId: command.modelId,
          content: command.text,
          displayText: command.displayText,
          images: command.images,
          pageContent: command.includePageContent ? page?.content ?? '' : '',
        });
        sessionRegistry.register(session, {
          normalizedUrl,
          promptTabId: command.promptTabId,
        });
        commandLogger.info('chat.send.accepted', {
          browserTabId: command.tabId,
          normalizedUrl,
          promptTab: command.promptTabId,
          sessionId: session.sessionId,
          messageId: session.messageId,
          modelId: command.modelId,
        });
        return {
          type: 'SEND_CHAT_SUCCESS' as const,
          payload: {
            sessionId: session.sessionId,
            userMessageId: session.userMessageId ?? null,
            messageId: session.messageId,
          },
        };
      }
      case 'EDIT_USER_MESSAGE': {
        const command = sidebarEditUserMessageCommandSchema.parse(input);
        assertPageSender(context.sender, runtime.id);
        if (!chatDispatchService) {
          throw new Error('unsupported command: EDIT_USER_MESSAGE');
        }

        const normalizedUrl = normalizePageUrl(command.pageUrl);
        await sessionRegistry.cancelPromptTabSessions({
          normalizedUrl,
          promptTabId: command.promptTabId,
        });
        const session = await chatDispatchService.editUserMessage({
          normalizedUrl,
          promptTabId: command.promptTabId,
          messageId: command.messageId,
          content: command.text,
        });
        sessionRegistry.register(session, {
          normalizedUrl,
          promptTabId: command.promptTabId,
        });
        commandLogger.info('chat.edit.accepted', {
          browserTabId: command.tabId,
          normalizedUrl,
          promptTab: command.promptTabId,
          targetMessageId: command.messageId,
          sessionId: session.sessionId,
          messageId: session.messageId,
        });
        return {
          type: 'EDIT_USER_MESSAGE_SUCCESS' as const,
          payload: {
            editedMessageId: command.messageId,
            messageId: session.messageId,
            sessionId: session.sessionId,
          },
        };
      }
      case 'RETRY_USER_MESSAGE': {
        const command = sidebarRetryUserMessageCommandSchema.parse(input);
        assertPageSender(context.sender, runtime.id);
        if (!chatDispatchService) {
          throw new Error('unsupported command: RETRY_USER_MESSAGE');
        }

        const normalizedUrl = normalizePageUrl(command.pageUrl);
        const session = await chatDispatchService.retryUserMessage({
          normalizedUrl,
          promptTabId: command.promptTabId,
          messageId: command.messageId,
        });
        sessionRegistry.register(session, {
          normalizedUrl,
          promptTabId: command.promptTabId,
          branchId: session.branchId,
        });
        commandLogger.info('chat.user_retry.accepted', {
          browserTabId: command.tabId,
          normalizedUrl,
          promptTab: command.promptTabId,
          targetMessageId: command.messageId,
          assistantMessageId: session.messageId,
          branchId: session.branchId,
          sessionId: session.sessionId,
        });
        return {
          type: 'RETRY_USER_MESSAGE_SUCCESS' as const,
          payload: {
            retriedMessageId: command.messageId,
            assistantMessageId: session.messageId,
            branchId: session.branchId,
            modelId: session.modelId,
            modelLabel: session.modelLabel,
            sessionId: session.sessionId,
          },
        };
      }
      case 'RETRY_MESSAGE': {
        const command = sidebarRetryMessageCommandSchema.parse(input);
        assertPageSender(context.sender, runtime.id);
        if (!chatDispatchService) {
          throw new Error('unsupported command: RETRY_MESSAGE');
        }

        const normalizedUrl = normalizePageUrl(command.pageUrl);
        await sessionRegistry.cancelPromptTabSessions({
          normalizedUrl,
          promptTabId: command.promptTabId,
        });
        const session = await chatDispatchService.retryMessage({
          normalizedUrl,
          promptTabId: command.promptTabId,
          messageId: command.messageId,
        });
        sessionRegistry.register(session, {
          normalizedUrl,
          promptTabId: command.promptTabId,
        });
        commandLogger.info('chat.retry.accepted', {
          browserTabId: command.tabId,
          normalizedUrl,
          promptTab: command.promptTabId,
          targetMessageId: command.messageId,
          sessionId: session.sessionId,
          messageId: session.messageId,
        });
        return {
          type: 'RETRY_MESSAGE_SUCCESS' as const,
          payload: {
            replacedMessageId: command.messageId,
            messageId: session.messageId,
            sessionId: session.sessionId,
          },
        };
      }
      case 'EXPAND_MESSAGE_BRANCHES': {
        const command = sidebarExpandMessageBranchesCommandSchema.parse(input);
        assertPageSender(context.sender, runtime.id);
        if (!chatDispatchService) {
          throw new Error('unsupported command: EXPAND_MESSAGE_BRANCHES');
        }

        const normalizedUrl = normalizePageUrl(command.pageUrl);
        const sessions = await chatDispatchService.expandBranches({
          normalizedUrl,
          promptTabId: command.promptTabId,
          messageId: command.messageId,
        });
        for (const session of sessions) {
          sessionRegistry.register(session, {
            normalizedUrl,
            promptTabId: command.promptTabId,
            branchId: 'branchId' in session ? session.branchId : undefined,
          });
        }
        const branchIds = sessions.flatMap((session) => ('branchId' in session ? [session.branchId] : []));
        commandLogger.info('branch.expand.accepted', {
          browserTabId: command.tabId,
          normalizedUrl,
          promptTab: command.promptTabId,
          messageId: command.messageId,
          branchCount: branchIds.length,
        });

        return {
          type: 'EXPAND_MESSAGE_BRANCHES_SUCCESS' as const,
          payload: {
            messageId: command.messageId,
            branchIds,
          },
        };
      }
      case 'STOP_SESSION': {
        const command = sidebarStopSessionCommandSchema.parse(input);
        assertPageSender(context.sender, runtime.id);
        const normalizedUrl = normalizePageUrl(command.pageUrl);
        const stopped = sessionRegistry.cancelSession({
          sessionId: command.sessionId,
          normalizedUrl,
          promptTabId: command.promptTabId,
        });
        commandLogger.info('chat.cancel.requested', {
          browserTabId: command.tabId,
          normalizedUrl,
          promptTab: command.promptTabId,
          sessionId: command.sessionId,
          stopped,
        });
        return {
          type: 'STOP_SESSION_SUCCESS' as const,
          payload: {
            sessionId: command.sessionId,
            stopped,
          },
        };
      }
      case 'STOP_BRANCH': {
        const command = sidebarStopBranchCommandSchema.parse(input);
        assertPageSender(context.sender, runtime.id);
        const normalizedUrl = normalizePageUrl(command.pageUrl);
        const stopped = sessionRegistry.cancelBranchSession({
          normalizedUrl,
          promptTabId: command.promptTabId,
          branchId: command.branchId,
        });
        commandLogger.info('branch.cancel.requested', {
          browserTabId: command.tabId,
          normalizedUrl,
          promptTab: command.promptTabId,
          branchId: command.branchId,
          stopped,
        });
        return {
          type: 'STOP_BRANCH_SUCCESS' as const,
          payload: {
            branchId: command.branchId,
            stopped,
          },
        };
      }
      case 'DELETE_BRANCH': {
        const command = sidebarDeleteBranchCommandSchema.parse(input);
        assertPageSender(context.sender, runtime.id);
        if (!conversationRepository.deleteAssistantBranch || !conversationRepository.removeBranchLoadingState) {
          throw new Error('unsupported command: DELETE_BRANCH');
        }

        const normalizedUrl = normalizePageUrl(command.pageUrl);
        await sessionRegistry.cancelBranchSessionAndWait({
          normalizedUrl,
          promptTabId: command.promptTabId,
          branchId: command.branchId,
        });
        await conversationRepository.deleteAssistantBranch({
          normalizedUrl,
          promptTabId: command.promptTabId,
          messageId: command.messageId,
          branchId: command.branchId,
          now: Date.now(),
        });
        await conversationRepository.removeBranchLoadingState(normalizedUrl, command.promptTabId, command.branchId);
        commandLogger.info('branch.delete.completed', {
          browserTabId: command.tabId,
          normalizedUrl,
          promptTab: command.promptTabId,
          messageId: command.messageId,
          branchId: command.branchId,
        });

        return {
          type: 'DELETE_BRANCH_SUCCESS' as const,
          payload: {
            messageId: command.messageId,
            branchId: command.branchId,
            deleted: true,
          },
        };
      }
      case 'CLEAR_PAGE_CONTEXT': {
        const command = sidebarClearPageContextCommandSchema.parse(input);
        assertPageSender(context.sender, runtime.id);
        if (!pageRepository.deletePage) {
          throw new Error('unsupported command: CLEAR_PAGE_CONTEXT');
        }

        const normalizedUrl = normalizePageUrl(command.pageUrl);
        await sessionRegistry.cancelPageSessions(normalizedUrl);
        await deletePageWithPolicy({
          normalizedUrl,
          pageRepository: {
            deletePage: pageRepository.deletePage,
          },
          configRepository,
          syncRepository,
          now,
        });
        commandLogger.info('page.clear.completed', {
          browserTabId: command.tabId,
          normalizedUrl,
        });

        return {
          type: 'CLEAR_PAGE_CONTEXT_SUCCESS' as const,
          payload: {
            normalizedUrl,
            cleared: true,
          },
        };
      }
      case 'CLEAR_TAB_CONVERSATION': {
        const command = sidebarClearTabConversationCommandSchema.parse(input);
        assertPageSender(context.sender, runtime.id);
        if (!conversationRepository.clearPromptTabData) {
          throw new Error('unsupported command: CLEAR_TAB_CONVERSATION');
        }

        const normalizedUrl = normalizePageUrl(command.pageUrl);
        await sessionRegistry.cancelPromptTabSessions({
          normalizedUrl,
          promptTabId: command.promptTabId,
        });
        await conversationRepository.clearPromptTabData(normalizedUrl, command.promptTabId);
        await pageRepository.setPromptTabState?.({
          normalizedUrl,
          url: command.pageUrl,
          promptTabId: command.promptTabId,
          initializedAt: null,
          lastAutoTriggerAt: null,
          autoTriggerStatus: 'idle',
          lastClearedAt: Date.now(),
        });
        commandLogger.info('prompt_tab.clear.completed', {
          browserTabId: command.tabId,
          normalizedUrl,
          promptTab: command.promptTabId,
        });

        return {
          type: 'CLEAR_TAB_CONVERSATION_SUCCESS' as const,
          payload: {
            normalizedUrl,
            promptTabId: command.promptTabId,
            cleared: true,
          },
        };
      }
      case 'EXPORT_CONVERSATION': {
        const command = sidebarExportConversationCommandSchema.parse(input);
        assertPageSender(context.sender, runtime.id);
        if (!conversationExporter) {
          throw new Error('unsupported command: EXPORT_CONVERSATION');
        }

        const normalizedUrl = normalizePageUrl(command.pageUrl);
        commandLogger.info('conversation.export.requested', {
          browserTabId: command.tabId,
          normalizedUrl,
          promptTab: command.promptTabId,
        });
        const result = await conversationExporter.exportConversation({
          normalizedUrl,
          promptTabId: command.promptTabId,
        });
        commandLogger.info('conversation.export.completed', {
          browserTabId: command.tabId,
          normalizedUrl,
          promptTab: command.promptTabId,
        });
        return result;
      }
      case 'CONFIRM_BLACKLIST_CONTINUE':
      case 'SWITCH_EXTRACTION_METHOD':
      case 'RE_EXTRACT_CONTENT':
        throw new Error(`unsupported command: ${input.type}`);
      default:
        throw new Error(`unsupported command: ${input.type}`);
    }
  };
};
