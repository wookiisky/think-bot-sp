import {
  conversationsCommandEnvelopeSchema,
  deletePageCommandSchema,
  getPageDetailCommandSchema,
  listPagesCommandSchema,
  searchPagesCommandSchema,
  updatePageTitleCommandSchema,
} from './conversations-contract';
import { deletePageWithPolicy } from './page-delete';
import { assertConversationsPageSender, type SidebarMessageSender } from './sender';

type ConversationsHandlerContext = {
  /** 消息发送方。 */
  sender: SidebarMessageSender;
};

type PageRepository = {
  /** 按最近更新时间返回页面。 */
  listRecentPages(): Promise<unknown[]>;
  /** 按标题、URL 和提取正文搜索页面。 */
  searchPages(query: string): Promise<unknown[]>;
  /** 读取单个页面。 */
  getPage(normalizedUrl: string): Promise<unknown | null>;
  /** 更新标题。 */
  updatePageTitle(input: { normalizedUrl: string; title: string }): Promise<unknown>;
  /** 删除页面。 */
  deletePage(normalizedUrl: string): Promise<void>;
};

type ConversationRepository = {
  /** 按页面列出全部会话。 */
  listPageConversations(normalizedUrl: string): Promise<Array<{ promptTabId: string; messages: Array<{ content: string; status: string }> }>>;
  /** 按页面列出全部 loading。 */
  listPageLoadingStates(normalizedUrl: string): Promise<Array<{ promptTabId: string; promptTabStatus: string }>>;
};

type ConfigRepository = {
  /** 读取当前配置。 */
  getConfig(): Promise<{
    sync: {
      enabled: boolean;
      provider: string;
    };
  }>;
};

type SyncRepository = {
  /** 追加页面级墓碑。 */
  appendPageTombstone(input: { normalizedUrl: string; deletedAt: number }): Promise<void>;
};

type SessionRegistry = {
  /** 取消当前页面全部活跃会话。 */
  cancelPageSessions(normalizedUrl: string): Promise<number>;
};

/** 判断是否为 conversations 命令。 */
export const isConversationsCommandMessage = (input: unknown): input is { type: string } =>
  conversationsCommandEnvelopeSchema.safeParse(input).success;

/** 为详情恢复选择初始标签。 */
const pickInitialPromptTabId = ({
  conversations,
  loadingStates,
}: {
  conversations: Array<{ promptTabId: string; messages: Array<{ content: string; status: string }> }>;
  loadingStates: Array<{ promptTabId: string; promptTabStatus: string }>;
}) => {
  const loadingPromptTab = loadingStates.find((item) => item.promptTabStatus === 'loading')?.promptTabId ?? null;
  if (loadingPromptTab) {
    return loadingPromptTab;
  }

  const contentPromptTab =
    conversations.find((conversation) => conversation.messages.some((message) => message.content.trim().length > 0))?.promptTabId ?? null;
  return contentPromptTab ?? 'chat';
};

/** 创建 conversations 命令处理器。 */
export const createConversationsCommandHandler = ({
  runtime,
  pageRepository,
  conversationRepository,
  configRepository,
  syncRepository,
  sessionRegistry,
  now = () => Date.now(),
}: {
  /** 运行时信息。 */
  runtime: { id: string };
  /** 页面仓储。 */
  pageRepository: PageRepository;
  /** 会话仓储。 */
  conversationRepository: ConversationRepository;
  /** 配置仓储。 */
  configRepository: ConfigRepository;
  /** 同步仓储。 */
  syncRepository?: SyncRepository;
  /** 活跃会话注册表。 */
  sessionRegistry: SessionRegistry;
  /** 当前时间。 */
  now?: () => number;
}) => {
  return async (input: unknown, context: ConversationsHandlerContext) => {
    if (!isConversationsCommandMessage(input)) {
      const type = typeof input === 'object' && input !== null && 'type' in input ? String((input as { type: unknown }).type) : 'unknown';
      throw new Error(`unsupported command: ${type}`);
    }

    assertConversationsPageSender(context.sender, runtime.id);

    switch (input.type) {
      case 'LIST_PAGES':
        listPagesCommandSchema.parse(input);
        return {
          type: 'LIST_PAGES_SUCCESS' as const,
          pages: await pageRepository.listRecentPages(),
        };
      case 'SEARCH_PAGES': {
        const command = searchPagesCommandSchema.parse(input);
        return {
          type: 'SEARCH_PAGES_SUCCESS' as const,
          query: command.query,
          pages: await pageRepository.searchPages(command.query),
        };
      }
      case 'GET_PAGE_DETAIL': {
        const command = getPageDetailCommandSchema.parse(input);
        const [page, conversations, loadingStates] = await Promise.all([
          pageRepository.getPage(command.normalizedUrl),
          conversationRepository.listPageConversations(command.normalizedUrl),
          conversationRepository.listPageLoadingStates(command.normalizedUrl),
        ]);
        return {
          type: 'GET_PAGE_DETAIL_SUCCESS' as const,
          page,
          conversations,
          loadingStates,
          activePromptTabId: pickInitialPromptTabId({
            conversations,
            loadingStates,
          }),
        };
      }
      case 'UPDATE_PAGE_TITLE': {
        const command = updatePageTitleCommandSchema.parse(input);
        return {
          type: 'UPDATE_PAGE_TITLE_SUCCESS' as const,
          page: await pageRepository.updatePageTitle({
            normalizedUrl: command.normalizedUrl,
            title: command.title,
          }),
        };
      }
      case 'DELETE_PAGE': {
        const command = deletePageCommandSchema.parse(input);
        await sessionRegistry.cancelPageSessions(command.normalizedUrl);
        const deleteInput: Parameters<typeof deletePageWithPolicy>[0] = {
          normalizedUrl: command.normalizedUrl,
          pageRepository,
          configRepository,
          now,
        };
        if (syncRepository) {
          deleteInput.syncRepository = syncRepository;
        }
        const deleteMode = await deletePageWithPolicy(deleteInput);
        return {
          type: 'DELETE_PAGE_SUCCESS' as const,
          payload: {
            normalizedUrl: command.normalizedUrl,
            deleted: true,
            deleteMode,
          },
        };
      }
      default:
        throw new Error(`unsupported command: ${input.type}`);
    }
  };
};
