import { describe, expect, it, vi } from 'vitest';

import { buildPageRecord } from '../../../src/domain/page/page-schema';
import { createChromeLocalAdapter } from '../../../src/repositories/chrome-local-adapter';
import { createPageRepository } from '../../../src/repositories/page-repository';
import { createFakeStorageArea } from '../../helpers/fake-storage';
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

  it('列表只传页面摘要，正文搜索仍命中并能按需恢复完整详情', async () => {
    const pageRepository = createPageRepository(createChromeLocalAdapter(createFakeStorageArea()));
    const olderPage = await pageRepository.savePage({
      ...buildPageRecord({ url: 'https://example.com/older', now: 1 }),
      title: '旧页面',
    });
    const page = await pageRepository.savePage({
      ...buildPageRecord({ url: 'https://example.com/article', now: 2 }),
      title: '当前页面',
      faviconUrl: 'https://example.com/favicon.ico',
      extractionCaches: {
        readability: { content: `只在正文中出现的关键词 ${'正文'.repeat(10_000)}`, updatedAt: 2 },
        jina: { content: '另一份提取缓存', updatedAt: 2 },
      },
    });
    const handler = createConversationsCommandHandler({
      runtime: { id: 'ext-id' },
      pageRepository,
      conversationRepository: {
        listPageConversations: vi.fn().mockResolvedValue([]),
        listPageLoadingStates: vi.fn().mockResolvedValue([]),
      },
      configRepository: {
        getConfig: vi.fn(),
      },
      sessionRegistry: {
        cancelPageSessions: vi.fn(),
      },
    });
    const context = { sender: { id: 'ext-id', url: 'chrome-extension://ext-id/conversations.html' } };
    const summary = {
      normalizedUrl: page.normalizedUrl,
      url: page.url,
      title: page.title,
      faviconUrl: page.faviconUrl,
    };

    await expect(handler({ type: 'LIST_PAGES' }, context)).resolves.toEqual({
      type: 'LIST_PAGES_SUCCESS',
      pages: [summary, {
        normalizedUrl: olderPage.normalizedUrl,
        url: olderPage.url,
        title: olderPage.title,
        faviconUrl: olderPage.faviconUrl,
      }],
    });
    await expect(handler({ type: 'SEARCH_PAGES', query: '只在正文中出现的关键词' }, context)).resolves.toEqual({
      type: 'SEARCH_PAGES_SUCCESS',
      query: '只在正文中出现的关键词',
      pages: [summary],
    });
    await expect(handler({ type: 'GET_PAGE_DETAIL', normalizedUrl: page.normalizedUrl }, context)).resolves.toEqual({
      type: 'GET_PAGE_DETAIL_SUCCESS',
      page,
      conversations: [],
      loadingStates: [],
      activePromptTabId: 'chat',
    });
  });

  it.each([
    { promptTabStatus: 'loading', branchStates: [] },
    { promptTabStatus: 'idle', branchStates: [{ branchId: 'branch-1', status: 'loading' }] },
  ])('详情恢复优先选择仍有主请求或分支生成的标签：%j', async ({ promptTabStatus, branchStates }) => {
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
            messages: [{ content: '已有聊天记录', status: 'done' }],
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
            promptTabStatus,
            branchStates,
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
