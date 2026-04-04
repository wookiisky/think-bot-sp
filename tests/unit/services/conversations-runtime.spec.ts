import { describe, expect, it, vi } from 'vitest';

import { createConversationsCommandHandler, isConversationsCommandMessage } from '../../../src/services/runtime-messaging/conversations-commands';
import {
  conversationsCommandSchema,
  conversationsCommandTypeValues,
} from '../../../src/services/runtime-messaging/conversations-contract';

describe('conversations-runtime', () => {
  it('定义 conversations 页命令契约', () => {
    expect(conversationsCommandTypeValues).toEqual([
      'LIST_PAGES',
      'SEARCH_PAGES',
      'GET_PAGE_DETAIL',
      'UPDATE_PAGE_TITLE',
      'DELETE_PAGE',
    ]);
    expect(
      conversationsCommandSchema.parse({
        type: 'SEARCH_PAGES',
        query: 'example',
      }),
    ).toEqual({
      type: 'SEARCH_PAGES',
      query: 'example',
    });
    expect(
      conversationsCommandSchema.parse({
        type: 'UPDATE_PAGE_TITLE',
        normalizedUrl: 'https://example.com/article',
        title: '新标题',
      }),
    ).toEqual({
      type: 'UPDATE_PAGE_TITLE',
      normalizedUrl: 'https://example.com/article',
      title: '新标题',
    });
    expect(isConversationsCommandMessage({ type: 'GET_PAGE_DETAIL' })).toBe(true);
  });

  it('详情恢复返回页面、会话、loading 和目标标签', async () => {
    const handler = createConversationsCommandHandler({
      runtime: { id: 'ext-id' },
      pageRepository: {
        listRecentPages: vi.fn(),
        searchPages: vi.fn(),
        getPage: vi.fn().mockResolvedValue({
          id: 'https://example.com/article',
          url: 'https://example.com/article',
          normalizedUrl: 'https://example.com/article',
          title: '示例页面',
          faviconUrl: '',
          content: '正文',
          extractionMethod: 'readability',
          includePageContent: true,
          promptTabStates: [],
          createdAt: 1,
          updatedAt: 1,
          expiresAt: 2,
        }),
        updatePageTitle: vi.fn(),
        deletePage: vi.fn(),
      },
      conversationRepository: {
        listPageConversations: vi.fn().mockResolvedValue([
          {
            id: 'https://example.com/article:chat',
            normalizedUrl: 'https://example.com/article',
            promptTabId: 'chat',
            messages: [],
            lastAssistantState: null,
            updatedAt: 1,
          },
          {
            id: 'https://example.com/article:quick-summary',
            normalizedUrl: 'https://example.com/article',
            promptTabId: 'quick-summary',
            messages: [
              {
                id: 'assistant-1',
                role: 'assistant',
                content: '已有结果',
                images: [],
                status: 'done',
                errorMessage: null,
                modelId: 'model-1',
                branches: [],
                retryFromMessageId: null,
                editedAt: null,
                createdAt: 1,
                updatedAt: 1,
              },
            ],
            lastAssistantState: {
              messageId: 'assistant-1',
              status: 'done',
              summary: '已有结果',
            },
            updatedAt: 1,
          },
        ]),
        listPageLoadingStates: vi.fn().mockResolvedValue([
          {
            id: 'loading:https://example.com/article:quick-summary',
            normalizedUrl: 'https://example.com/article',
            promptTabId: 'quick-summary',
            sessionId: 'session-1',
            promptTabStatus: 'loading',
            branchStates: [],
            resumeTarget: null,
            cancelRequested: false,
            updatedAt: 1,
          },
        ]),
      },
      configRepository: {
        getConfig: vi.fn().mockResolvedValue({
          sync: {
            enabled: false,
            provider: 'none',
          },
        }),
      },
      syncRepository: {
        appendPageTombstone: vi.fn(),
      },
      sessionRegistry: {
        cancelPageSessions: vi.fn().mockResolvedValue(0),
      },
    });

    await expect(
      handler(
        {
          type: 'GET_PAGE_DETAIL',
          normalizedUrl: 'https://example.com/article',
        },
        {
          sender: {
            id: 'ext-id',
            url: 'chrome-extension://ext-id/conversations.html',
          },
        },
      ),
    ).resolves.toMatchObject({
      type: 'GET_PAGE_DETAIL_SUCCESS',
      activePromptTabId: 'quick-summary',
      page: {
        normalizedUrl: 'https://example.com/article',
      },
      conversations: [
        { promptTabId: 'chat' },
        { promptTabId: 'quick-summary' },
      ],
      loadingStates: [{ promptTabId: 'quick-summary' }],
    });
  });

  it('删除页面时同步开启走 tombstone + 本地清理', async () => {
    const deletePage = vi.fn().mockResolvedValue(undefined);
    const appendPageTombstone = vi.fn().mockResolvedValue(undefined);
    const cancelPageSessions = vi.fn().mockResolvedValue(1);
    const handler = createConversationsCommandHandler({
      runtime: { id: 'ext-id' },
      pageRepository: {
        listRecentPages: vi.fn(),
        searchPages: vi.fn(),
        getPage: vi.fn(),
        updatePageTitle: vi.fn(),
        deletePage,
      },
      conversationRepository: {
        listPageConversations: vi.fn(),
        listPageLoadingStates: vi.fn(),
      },
      configRepository: {
        getConfig: vi.fn().mockResolvedValue({
          sync: {
            enabled: true,
            provider: 'gist',
          },
        }),
      },
      syncRepository: {
        appendPageTombstone,
      },
      sessionRegistry: {
        cancelPageSessions,
      },
      now: () => 123,
    });

    await expect(
      handler(
        {
          type: 'DELETE_PAGE',
          normalizedUrl: 'https://example.com/article',
        },
        {
          sender: {
            id: 'ext-id',
            url: 'chrome-extension://ext-id/conversations.html',
          },
        },
      ),
    ).resolves.toEqual({
      type: 'DELETE_PAGE_SUCCESS',
      payload: {
        normalizedUrl: 'https://example.com/article',
        deleted: true,
        deleteMode: 'soft',
      },
    });

    expect(cancelPageSessions).toHaveBeenCalledWith('https://example.com/article');
    expect(appendPageTombstone).toHaveBeenCalledWith({
      normalizedUrl: 'https://example.com/article',
      deletedAt: 123,
    });
    expect(deletePage).toHaveBeenCalledWith('https://example.com/article');
  });
});
