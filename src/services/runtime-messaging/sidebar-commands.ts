/* eslint-disable no-unused-vars */
import { normalizePageUrl } from '../../domain/page/page-schema';
import {
  sidebarBootstrapCommandSchema,
  sidebarCommandEnvelopeSchema,
  sidebarCommandTypeValues,
  type SidebarBootstrapResponse,
  type SidebarConversationRecord,
  type SidebarLoadingStateRecord,
  type SidebarPageRecord,
} from './sidebar-contract';
import { assertSidebarPageSender, type SidebarMessageSender } from './sender';

/** 阶段 3 sidebar 命令集合。 */
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
}: {
  pageRepository: PageRepository;
  conversationRepository: ConversationRepository;
  blacklistRepository: BlacklistRepository;
  runtime: { id: string };
}) => {
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
      case 'CONFIRM_BLACKLIST_CONTINUE':
      case 'SWITCH_EXTRACTION_METHOD':
      case 'RE_EXTRACT_CONTENT':
        throw new Error(`unsupported command: ${input.type}`);
      default:
        throw new Error(`unsupported command: ${input.type}`);
    }
  };
};
