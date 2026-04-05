import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultConfig } from '../../../src/domain/config/config-schema';
import { ConversationsShell } from '../../../src/features/conversations/conversations-shell';

const createConversationsApi = (overrides?: Record<string, unknown>) => ({
  listPages: vi.fn().mockResolvedValue({
    type: 'LIST_PAGES_SUCCESS',
    pages: [
      {
        id: 'https://example.com/article-a',
        url: 'https://example.com/article-a',
        normalizedUrl: 'https://example.com/article-a',
        title: '页面 A',
        faviconUrl: '',
        content: '正文 A',
        extractionMethod: 'readability',
        includePageContent: true,
        promptTabStates: [],
        createdAt: 1,
        updatedAt: 2,
        expiresAt: 3,
      },
      {
        id: 'https://example.com/article-b',
        url: 'https://example.com/article-b',
        normalizedUrl: 'https://example.com/article-b',
        title: '页面 B',
        faviconUrl: '',
        content: '正文 B',
        extractionMethod: 'readability',
        includePageContent: true,
        promptTabStates: [],
        createdAt: 1,
        updatedAt: 1,
        expiresAt: 3,
      },
    ],
  }),
  searchPages: vi.fn().mockResolvedValue({
    type: 'SEARCH_PAGES_SUCCESS',
    query: 'B',
    pages: [
      {
        id: 'https://example.com/article-b',
        url: 'https://example.com/article-b',
        normalizedUrl: 'https://example.com/article-b',
        title: '页面 B',
        faviconUrl: '',
        content: '正文 B',
        extractionMethod: 'readability',
        includePageContent: true,
        promptTabStates: [],
        createdAt: 1,
        updatedAt: 1,
        expiresAt: 3,
      },
    ],
  }),
  getPageDetail: vi.fn().mockResolvedValue({
    type: 'GET_PAGE_DETAIL_SUCCESS',
    page: {
      id: 'https://example.com/article-a',
      url: 'https://example.com/article-a',
      normalizedUrl: 'https://example.com/article-a',
      title: '页面 A',
      faviconUrl: '',
      content: '正文 A',
      extractionMethod: 'readability',
      includePageContent: true,
      promptTabStates: [],
      createdAt: 1,
      updatedAt: 2,
      expiresAt: 3,
    },
    conversations: [
      {
        id: 'https://example.com/article-a:chat',
        normalizedUrl: 'https://example.com/article-a',
        promptTabId: 'chat',
        messages: [],
        lastAssistantState: null,
        updatedAt: 1,
      },
    ],
    loadingStates: [],
    activePromptTabId: 'chat',
  }),
  updatePageTitle: vi.fn().mockResolvedValue({
    type: 'UPDATE_PAGE_TITLE_SUCCESS',
    page: {
      id: 'https://example.com/article-a',
      url: 'https://example.com/article-a',
      normalizedUrl: 'https://example.com/article-a',
      title: '页面 A 新标题',
      faviconUrl: '',
      content: '正文 A',
      extractionMethod: 'readability',
      includePageContent: true,
      promptTabStates: [],
      createdAt: 1,
      updatedAt: 4,
      expiresAt: 5,
    },
  }),
  deletePage: vi.fn().mockResolvedValue({
    type: 'DELETE_PAGE_SUCCESS',
    payload: {
      normalizedUrl: 'https://example.com/article-a',
      deleted: true,
      deleteMode: 'soft',
    },
  }),
  getConfig: vi.fn().mockResolvedValue({
    type: 'GET_CONFIG_SUCCESS',
    config: createDefaultConfig({
      models: [
        {
          id: 'model-1',
          name: '模型一',
          provider: 'openai-compatible',
          enabled: true,
          model: 'test-model',
          baseUrl: 'https://api.example.com',
          apiKey: 'key',
          deployment: '',
          temperature: 0.2,
          tools: [],
          thinkingBudget: null,
          maxOutputTokens: 1024,
          supportsImages: true,
          order: 0,
          deletedAt: null,
        },
      ],
    }),
  }),
  sendChat: vi.fn(),
  editUserMessage: vi.fn(),
  retryUserMessage: vi.fn(),
  retryMessage: vi.fn(),
  expandMessageBranches: vi.fn(),
  stopSession: vi.fn(),
  stopBranch: vi.fn(),
  deleteBranch: vi.fn(),
  clearTabConversation: vi.fn(),
  exportConversation: vi.fn(),
  connectStream: vi.fn(() => ({
    disconnect: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  })),
  openSourcePage: vi.fn().mockResolvedValue(undefined),
  openSettingsPage: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

afterEach(() => {
  cleanup();
});

describe('ConversationsShell', () => {
  it('首屏加载历史列表并恢复右侧工作台', async () => {
    const api = createConversationsApi();

    render(<ConversationsShell api={api} />);

    await waitFor(() => expect(api.listPages).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('页面 A')).toBeVisible();
    expect(await screen.findByText('正文 A')).toBeVisible();
    expect(screen.getByRole('tab', { name: '聊天' })).toBeVisible();
  });

  it('支持搜索过滤历史页面', async () => {
    const user = userEvent.setup();
    const api = createConversationsApi();

    render(<ConversationsShell api={api} />);

    await user.type(await screen.findByLabelText('搜索历史页面'), 'B');

    await waitFor(() => expect(api.searchPages).toHaveBeenCalledWith('B'));
  });

  it('支持标题编辑和页面删除', async () => {
    const user = userEvent.setup();
    const api = createConversationsApi();

    render(<ConversationsShell api={api} />);

    await user.click(await screen.findByRole('button', { name: '页面 A' }));
    const input = await screen.findByLabelText('编辑页面标题');
    await user.clear(input);
    await user.type(input, '页面 A 新标题');
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(api.updatePageTitle).toHaveBeenCalledWith({
        normalizedUrl: 'https://example.com/article-a',
        title: '页面 A 新标题',
      }),
    );

    await user.click(screen.getByLabelText('删除页面 页面 A 新标题'));
    await waitFor(() => expect(api.deletePage).toHaveBeenCalledWith('https://example.com/article-a'));
  });
});
