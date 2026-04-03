/* eslint-disable no-unused-vars */
import { normalizePageUrl } from '../../domain/page/page-schema';
import {
  sidebarBootstrapCommandSchema,
  sidebarCommandEnvelopeSchema,
  sidebarCommandTypeValues,
  sidebarExportConversationCommandSchema,
  sidebarSendChatCommandSchema,
  sidebarStopSessionCommandSchema,
  type SidebarBootstrapResponse,
  type SidebarConversationRecord,
  type SidebarLoadingStateRecord,
  type SidebarPageRecord,
} from './sidebar-contract';
import { assertSidebarPageSender, type SidebarMessageSender } from './sender';

/** 阶段 4 sidebar 命令集合。 */
export const sidebarCommandTypes = new Set(sidebarCommandTypeValues);

/** 判断输入是否是 sidebar 相关命令。 */
export const isSidebarCommandMessage = (input: unknown): input is { type: string } =>
  sidebarCommandEnvelopeSchema.safeParse(input).success;

type PageRepository = {
  /** 读取页面记录。 */
  getPage(normalizedUrl: string): Promise<SidebarPageRecord | null>;
};

type ConversationRepository = {
  /** 按页面列出 conversation。 */
  listPageConversations(normalizedUrl: string): Promise<SidebarConversationRecord[]>;
  /** 按页面列出 loading 状态。 */
  listPageLoadingStates(normalizedUrl: string): Promise<SidebarLoadingStateRecord[]>;
};

type BlacklistRepository = {
  /** 判断页面是否被黑名单阻止。 */
  isBlocked(input: { browserTabId: number; normalizedUrl: string }): Promise<boolean> | boolean;
  /** 读取命中的黑名单规则。 */
  getMatchedRuleId(input: { browserTabId: number; normalizedUrl: string }): Promise<string | null> | string | null;
};

type ChatSession = {
  /** 本次流式会话 id。 */
  sessionId: string;
  /** 当前助手消息 id。 */
  messageId: string;
  /** 主动取消当前会话。 */
  cancel: () => void;
  /** 会话完成 promise。 */
  done: Promise<unknown>;
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
    /** 用户图片。 */
    images: string[];
  }) => Promise<ChatSession>;
};

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

/** 创建 sidebar runtime command 处理器。 */
export const createSidebarCommandHandler = ({
  pageRepository,
  conversationRepository,
  blacklistRepository,
  runtime,
  chatDispatchService,
  conversationExporter,
}: {
  pageRepository: PageRepository;
  conversationRepository: ConversationRepository;
  blacklistRepository: BlacklistRepository;
  runtime: { id: string };
  chatDispatchService?: ChatDispatchService;
  conversationExporter?: ConversationExporter;
}) => {
  const activeSessions = new Map<string, ChatSession>();

  /** 记录活跃会话，并在生命周期结束后自动回收。 */
  const trackSession = (session: ChatSession) => {
    activeSessions.set(session.sessionId, session);
    void session.done.finally(() => {
      activeSessions.delete(session.sessionId);
    });
  };

  return async (input: unknown, context: SidebarHandlerContext) => {
    if (!isSidebarCommandMessage(input)) {
      const type = typeof input === 'object' && input !== null && 'type' in input ? String((input as { type: unknown }).type) : 'unknown';
      throw new Error(`unsupported command: ${type}`);
    }

    switch (input.type) {
      case 'GET_SIDEBAR_BOOTSTRAP': {
        const command = sidebarBootstrapCommandSchema.parse(input);
        assertSidebarPageSender(context.sender, runtime.id);

        const normalizedUrl = normalizePageUrl(command.pageUrl);
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

        return response;
      }
      case 'SEND_CHAT': {
        const command = sidebarSendChatCommandSchema.parse(input);
        assertSidebarPageSender(context.sender, runtime.id);
        if (!chatDispatchService) {
          throw new Error('unsupported command: SEND_CHAT');
        }

        const session = await chatDispatchService.dispatchChat({
          normalizedUrl: normalizePageUrl(command.pageUrl),
          promptTabId: command.promptTabId,
          modelId: command.modelId,
          content: command.text,
          images: command.images,
        });
        trackSession(session);
        return {
          type: 'SEND_CHAT_SUCCESS' as const,
          payload: {
            sessionId: session.sessionId,
            messageId: session.messageId,
          },
        };
      }
      case 'STOP_SESSION': {
        const command = sidebarStopSessionCommandSchema.parse(input);
        assertSidebarPageSender(context.sender, runtime.id);
        const session = activeSessions.get(command.sessionId);
        if (session) {
          session.cancel();
        }
        return {
          type: 'STOP_SESSION_SUCCESS' as const,
          payload: {
            sessionId: command.sessionId,
            stopped: Boolean(session),
          },
        };
      }
      case 'EXPORT_CONVERSATION': {
        const command = sidebarExportConversationCommandSchema.parse(input);
        assertSidebarPageSender(context.sender, runtime.id);
        if (!conversationExporter) {
          throw new Error('unsupported command: EXPORT_CONVERSATION');
        }

        return conversationExporter.exportConversation({
          normalizedUrl: normalizePageUrl(command.pageUrl),
          promptTabId: command.promptTabId,
        });
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
