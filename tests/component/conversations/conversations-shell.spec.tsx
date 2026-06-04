import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_EXTRACTION_PANEL_HEIGHT, createDefaultConfig } from '../../../src/domain/config/config-schema';
import { ConversationsShell } from '../../../src/features/conversations/conversations-shell';

const quickInputConfig = {
  id: 'quick-review',
  name: '快速审阅',
  prompt: '请快速审阅当前页面。',
  autoTrigger: true,
  modelId: 'model-1',
  parallelModelIds: [],
  order: 0,
  deletedAt: null,
};

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
  sendChat: vi.fn().mockResolvedValue({
    type: 'SEND_CHAT_SUCCESS',
    payload: {
      sessionId: 'session-1',
      userMessageId: 'user-1',
      messageId: 'assistant-1',
      branchId: 'branch-1',
      modelId: 'model-1',
      modelLabel: '模型一',
    },
  }),
  editUserMessage: vi.fn(),
  retryUserMessage: vi.fn(),
  retryMessage: vi.fn(),
  selectAssistantBranch: vi.fn(),
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
    expect(screen.getByTestId('conversations-shell').className).toContain('overflow-hidden');
    expect(screen.queryByText('历史对话')).toBeNull();
    expect(await screen.findByText('页面 A')).toBeVisible();
    expect(await screen.findByText('正文 A')).toBeVisible();
    const pageItems = screen.getAllByTestId('conversations-page-item');
    expect(pageItems[0]).toHaveClass('gap-1.5', 'px-2', 'py-1');
    expect(within(pageItems[0]).getByText('页面 A')).toHaveClass('text-xs', 'leading-4');
    expect(within(screen.getByTestId('conversations-page-list')).queryByText('https://example.com/article-a')).toBeNull();
    expect(screen.getByTestId('conversations-shell').className).not.toContain('bg-[linear-gradient');
    expect(screen.getByTestId('conversations-sidebar-resize-handle')).toHaveClass(
      'w-0.5',
      'self-stretch',
      'bg-muted-foreground/35',
      'hover:bg-primary',
    );
    const detailHeader = screen.getByTestId('conversations-detail-header');
    expect(detailHeader).toHaveClass('px-2', 'py-1.5');
    expect(screen.getByTestId('conversations-detail-title')).toHaveClass('text-base');
    expect(within(detailHeader).getByText('https://example.com/article-a')).toHaveClass('text-xs');
    expect(screen.getByRole('tabpanel').className).toContain('min-w-0');
    expect(screen.getByRole('tab', { name: '聊天' })).toBeVisible();
    expect(screen.getByTestId('conversations-extraction-panel')).toHaveStyle({ height: `${DEFAULT_EXTRACTION_PANEL_HEIGHT}px` });
  });

  it('支持搜索过滤历史页面', async () => {
    const user = userEvent.setup();
    const api = createConversationsApi();

    render(<ConversationsShell api={api} />);

    const searchInput = await screen.findByLabelText('搜索历史页面');
    expect(searchInput).toHaveAttribute('placeholder', '搜索');
    await user.type(searchInput, 'B');

    await waitFor(() => expect(api.searchPages).toHaveBeenCalledWith('B'));
  });

  it('支持拖拽调整提取区高度', async () => {
    const api = createConversationsApi({
      getConfig: vi.fn().mockResolvedValue({
        type: 'GET_CONFIG_SUCCESS',
        config: createDefaultConfig({
          basic: {
            ...createDefaultConfig().basic,
            extractionPanelHeight: 280,
          },
        }),
      }),
    });

    render(<ConversationsShell api={api} />);

    const extractionPanel = await screen.findByTestId('conversations-extraction-panel');
    await waitFor(() => {
      expect(extractionPanel).toHaveStyle({ height: '280px' });
    });
    expect(screen.getByTestId('conversations-extraction-resize-handle')).toHaveClass(
      'h-0.5',
      'w-full',
      'bg-muted-foreground/35',
      'hover:bg-primary',
    );

    fireEvent.pointerDown(screen.getByTestId('conversations-extraction-resize-handle'), {
      clientY: 200,
    });
    fireEvent.pointerMove(window, {
      clientY: 260,
    });
    fireEvent.pointerUp(window);

    expect(extractionPanel).toHaveStyle({ height: '340px' });

    fireEvent.pointerDown(screen.getByTestId('conversations-extraction-resize-handle'), {
      clientY: 260,
    });
    fireEvent.pointerMove(window, {
      clientY: -200,
    });
    fireEvent.pointerUp(window);

    expect(extractionPanel).toHaveStyle({ height: '1px' });
    expect(extractionPanel).toHaveClass('overflow-hidden', 'px-0', 'py-0');
    expect(extractionPanel).not.toHaveClass('overflow-y-auto');
  });

  it('支持直接拖拽左右区分割线调整左侧栏宽度', async () => {
    const api = createConversationsApi();

    render(<ConversationsShell api={api} />);

    const sidebar = await screen.findByTestId('conversations-sidebar');
    await waitFor(() => {
      expect(sidebar).toHaveStyle({ width: '332px' });
    });

    fireEvent.pointerDown(screen.getByTestId('conversations-sidebar-resize-handle'), {
      clientX: 300,
    });
    fireEvent.pointerMove(window, {
      clientX: 360,
    });
    fireEvent.pointerUp(window);

    expect(sidebar).toHaveStyle({ width: '392px' });
  });

  it('支持标题编辑和页面删除', async () => {
    const user = userEvent.setup();
    const api = createConversationsApi();

    render(<ConversationsShell api={api} />);

    await user.click(await screen.findByRole('button', { name: '编辑页面标题' }));
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
    await user.click(within(screen.getByTestId('delete-page-confirm-https://example.com/article-a')).getByRole('button', { name: '删除页面' }));
    await waitFor(() => expect(api.deletePage).toHaveBeenCalledWith('https://example.com/article-a'));
  });

  it('提取区显示和复制都会统一删除空行，标签下划线与 tab 等宽', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });
    const api = createConversationsApi({
      getConfig: vi.fn().mockResolvedValue({
        type: 'GET_CONFIG_SUCCESS',
        config: createDefaultConfig({
          basic: {
            ...createDefaultConfig().basic,
            extractionTextFontSize: 1,
          },
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
      getPageDetail: vi.fn().mockResolvedValue({
        type: 'GET_PAGE_DETAIL_SUCCESS',
        page: {
          id: 'https://example.com/article-a',
          url: 'https://example.com/article-a',
          normalizedUrl: 'https://example.com/article-a',
          title: '页面 A',
          faviconUrl: '',
          content: '## 正文标题\n\n- 要点一\n\n\n结论',
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
            messages: [
              {
                id: 'assistant-1',
                role: 'assistant',
                content: '历史回答',
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
              summary: '历史回答',
            },
            updatedAt: 1,
          },
        ],
        loadingStates: [],
        activePromptTabId: 'chat',
      }),
    });

    render(<ConversationsShell api={api} />);

    expect(await screen.findByTestId('conversations-extraction-content')).toHaveTextContent('## 正文标题');
    expect(screen.getByTestId('conversations-extraction-content')).toHaveTextContent('- 要点一');
    expect(screen.getByTestId('conversations-extraction-content')).toHaveTextContent('结论');
    expect(screen.getByTestId('conversations-extraction-content')).toHaveClass('text-xs', 'leading-5');
    expect(screen.getByTestId('prompt-tab-line-chat').className).toContain('inset-x-0');

    await user.click(screen.getByRole('button', { name: '复制提取内容' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('## 正文标题\n- 要点一\n结论'));
  });

  it('历史页支持分支独立预览层，并可通过遮罩关闭且不丢当前草稿', async () => {
    const user = userEvent.setup();
    const api = createConversationsApi({
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
            messages: [
              {
                id: 'assistant-preview',
                role: 'assistant',
                content: '主回答',
                images: [],
                status: 'done',
                errorMessage: null,
                modelId: 'model-1',
                branches: [
                  {
                    id: 'branch-preview',
                    modelId: 'model-1',
                    modelLabel: '模型一',
                    isPrimary: true,
                    content: '# 历史分支\n\n- 预览项',
                    status: 'done',
                    errorMessage: null,
                    createdAt: 1,
                    updatedAt: 1,
                  },
                ],
                selectedBranchId: 'branch-preview',
                retryFromMessageId: null,
                editedAt: null,
                createdAt: 1,
                updatedAt: 1,
              },
            ],
            lastAssistantState: {
              messageId: 'assistant-preview',
              status: 'done',
              summary: '主回答',
            },
            updatedAt: 1,
          },
        ],
        loadingStates: [],
        activePromptTabId: 'chat',
      }),
    });

    render(<ConversationsShell api={api} />);

    await user.type(await screen.findByLabelText('聊天输入'), '历史页草稿');
    await user.hover(screen.getByTestId('branch-branch-preview'));
    await user.click(screen.getByRole('button', { name: '打开分支预览' }));

    expect(await screen.findByTestId('branch-preview-dialog')).toBeVisible();
    expect(screen.getByRole('heading', { name: '模型一' })).toBeVisible();
    expect(screen.queryByText('分支内容预览')).toBeNull();
    expect(screen.queryByText('预览层会复用消息区的 Markdown 渲染规则，关闭后不会影响当前会话与输入草稿。')).toBeNull();
    expect(within(screen.getByTestId('branch-preview-content')).getByText('历史分支')).toBeVisible();
    expect(within(screen.getByTestId('branch-preview-content')).getByText('预览项')).toBeVisible();

    fireEvent.click(screen.getByTestId('branch-preview-overlay'));

    await waitFor(() => expect(screen.queryByTestId('branch-preview-dialog')).toBeNull());
    expect(screen.getByLabelText('聊天输入')).toHaveValue('历史页草稿');
    expect(screen.getByRole('tab', { name: '聊天' })).toHaveAttribute('aria-selected', 'true');
  });

  it('打开历史页面时不会自动触发 quick input 标签发送', async () => {
    const api = createConversationsApi({
      getConfig: vi.fn().mockResolvedValue({
        type: 'GET_CONFIG_SUCCESS',
        config: createDefaultConfig({
          quickInputs: [quickInputConfig],
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
          promptTabStates: [
            {
              promptTabId: 'quick-review',
              initializedAt: 1,
              lastAutoTriggerAt: 1,
              autoTriggerStatus: 'done',
              lastClearedAt: null,
            },
          ],
          createdAt: 1,
          updatedAt: 2,
          expiresAt: 3,
        },
        conversations: [],
        loadingStates: [],
        activePromptTabId: 'quick-review',
      }),
    });

    render(<ConversationsShell api={api} />);

    const quickInputTab = await screen.findByRole('tab', { name: /快速审阅/ });
    await screen.findByText('正文 A');

    expect(quickInputTab.querySelector('svg')).toBeNull();
    expect(api.sendChat).not.toHaveBeenCalled();
  });

  it('手动点击 quick input 标签时仍会触发发送', async () => {
    const user = userEvent.setup();
    const api = createConversationsApi({
      getConfig: vi.fn().mockResolvedValue({
        type: 'GET_CONFIG_SUCCESS',
        config: createDefaultConfig({
          quickInputs: [quickInputConfig],
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
          includePageContent: false,
          promptTabStates: [],
          createdAt: 1,
          updatedAt: 2,
          expiresAt: 3,
        },
        conversations: [],
        loadingStates: [],
        activePromptTabId: 'chat',
      }),
    });

    render(<ConversationsShell api={api} />);

    await user.click(await screen.findByRole('tab', { name: /快速审阅/ }));

    await waitFor(() =>
      expect(api.sendChat).toHaveBeenCalledWith({
        pageUrl: 'https://example.com/article-a',
        promptTabId: 'quick-review',
        modelId: 'model-1',
        displayText: '快速审阅',
        text: '请快速审阅当前页面。',
        images: [],
        includePageContent: true,
      }),
    );
  });
});
