import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultConfig } from '../../../src/domain/config/config-schema';
import { SidebarShell } from '../../../src/features/sidebar/sidebar-shell';

const createSidebarApi = (overrides?: Record<string, unknown>) => ({
  getSidebarBootstrap: vi.fn().mockResolvedValue({
    type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
    browserTabId: 7,
    normalizedUrl: 'https://example.com/article',
    page: null,
    conversations: [],
    loadingStates: [],
    blockedByBlacklist: false,
    matchedRuleId: null,
    shouldExtract: true,
  }),
  confirmBlacklistContinue: vi.fn(),
  reExtractContent: vi.fn().mockResolvedValue({
    payload: {
      content: '提取内容',
      extractionMethod: 'readability',
    },
  }),
  switchExtractionMethod: vi.fn(),
  clearPageContext: vi.fn().mockResolvedValue({
    type: 'CLEAR_PAGE_CONTEXT_SUCCESS',
    payload: {
      normalizedUrl: 'https://example.com/article',
      cleared: true,
    },
  }),
  clearTabConversation: vi.fn().mockResolvedValue({
    type: 'CLEAR_TAB_CONVERSATION_SUCCESS',
    payload: {
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      cleared: true,
    },
  }),
  openHistoryPage: vi.fn().mockResolvedValue(undefined),
  openSettingsPage: vi.fn().mockResolvedValue(undefined),
  openGithubProject: vi.fn().mockResolvedValue(undefined),
  getConfig: vi.fn().mockResolvedValue({
    type: 'GET_CONFIG_SUCCESS',
    config: createDefaultConfig(),
  }),
  sendChat: vi.fn().mockResolvedValue({
    type: 'SEND_CHAT_SUCCESS',
    payload: {
      sessionId: 'session-1',
      userMessageId: 'user-1',
      messageId: 'assistant-1',
      branchId: 'branch-1',
      modelId: 'model-1',
      modelLabel: '主模型',
    },
  }),
  editUserMessage: vi.fn().mockResolvedValue({
    type: 'EDIT_USER_MESSAGE_SUCCESS',
    payload: {
      editedMessageId: 'user-1',
      messageId: 'assistant-edit',
      branchId: 'branch-edit-primary',
      modelId: 'model-1',
      modelLabel: '主模型',
      sessionId: 'session-edit',
    },
  }),
  retryUserMessage: vi.fn().mockResolvedValue({
    type: 'RETRY_USER_MESSAGE_SUCCESS',
    payload: {
      retriedMessageId: 'user-1',
      messageId: 'assistant-user-retry',
      branchId: 'branch-user-retry',
      modelId: 'model-1',
      modelLabel: '主模型',
      sessionId: 'session-user-retry',
    },
  }),
  retryMessage: vi.fn().mockResolvedValue({
    type: 'RETRY_MESSAGE_SUCCESS',
    payload: {
      messageId: 'assistant-edit',
      branchId: 'branch-edit-primary',
      sessionId: 'session-retry',
    },
  }),
  selectAssistantBranch: vi.fn().mockResolvedValue({
    type: 'SELECT_ASSISTANT_BRANCH_SUCCESS',
    payload: {
      messageId: 'assistant-1',
      branchId: 'branch-1',
    },
  }),
  expandMessageBranches: vi.fn().mockResolvedValue({
    type: 'EXPAND_MESSAGE_BRANCHES_SUCCESS',
    payload: {
      messageId: 'assistant-1',
      branches: [
        {
          branchId: 'branch-1',
          modelId: 'model-2',
          modelLabel: '分支模型',
        },
      ],
    },
  }),
  stopSession: vi.fn(),
  stopBranch: vi.fn().mockResolvedValue({
    type: 'STOP_BRANCH_SUCCESS',
    payload: {
      branchId: 'branch-1',
      stopped: true,
    },
  }),
  deleteBranch: vi.fn().mockResolvedValue({
    type: 'DELETE_BRANCH_SUCCESS',
    payload: {
      messageId: 'assistant-1',
      branchId: 'branch-1',
      deleted: true,
    },
  }),
  exportConversation: vi.fn().mockResolvedValue({
    type: 'EXPORT_CONVERSATION_SUCCESS',
    payload: {
      filename: 'conversation.md',
      content: '# export',
      mimeType: 'text/markdown;charset=utf-8',
    },
  }),
  connectStream: vi.fn(() => ({
    disconnect: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  })),
  ...overrides,
});

afterEach(() => {
  cleanup();
});

describe('SidebarShell', () => {
  it('挂载后主动拉取 bootstrap，并保持提取区常驻显示', async () => {
    const api = createSidebarApi();

    render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

    await waitFor(() => expect(api.getSidebarBootstrap).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('sidebar-shell').className).toContain('overflow-hidden');
    expect(screen.getByTestId('sidebar-shell').className).not.toContain('bg-[linear-gradient');
    expect(screen.getByTestId('sidebar-extraction-panel')).toBeVisible();
    expect(screen.getByRole('tabpanel').className).toContain('min-w-0');
    expect(screen.getByRole('tab', { name: '聊天' })).toBeVisible();
    expect(await screen.findByText('提取内容')).toBeVisible();
    expect(screen.queryByText('浏览器标签')).toBeNull();
  });

  it('配置为 dark 时在根节点应用深色主题', async () => {
    const api = createSidebarApi({
      getConfig: vi.fn().mockResolvedValue({
        type: 'GET_CONFIG_SUCCESS',
        config: createDefaultConfig({
          basic: {
            ...createDefaultConfig().basic,
            theme: 'dark',
          },
        }),
      }),
    });

    render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

    const shell = await screen.findByTestId('sidebar-shell');
    await waitFor(() => expect(shell).toHaveAttribute('data-theme', 'dark'));
    expect(shell).toHaveAttribute('data-resolved-theme', 'dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement).toHaveAttribute('data-resolved-theme', 'dark');
    expect(document.documentElement).toHaveClass('dark');
  });

  it('支持拖拽调整提取区高度', async () => {
    const api = createSidebarApi({
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

    render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

    const extractionPanel = await screen.findByTestId('sidebar-extraction-panel');
    await waitFor(() => {
      expect(extractionPanel).toHaveStyle({ height: '280px' });
    });
    expect(screen.getByTestId('sidebar-extraction-resize-handle')).toHaveClass(
      'h-0.5',
      'w-full',
      'bg-muted-foreground/35',
      'hover:bg-primary',
    );

    fireEvent.pointerDown(screen.getByTestId('sidebar-extraction-resize-handle'), {
      clientY: 200,
    });
    fireEvent.pointerMove(window, {
      clientY: 260,
    });
    fireEvent.pointerUp(window);

    expect(extractionPanel).toHaveStyle({ height: '340px' });

    fireEvent.pointerDown(screen.getByTestId('sidebar-extraction-resize-handle'), {
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

  it('按基础设置字号渲染提取区文本', async () => {
    const api = createSidebarApi({
      getSidebarBootstrap: vi.fn().mockResolvedValue({
        type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
        browserTabId: 7,
        normalizedUrl: 'https://example.com/article',
        page: {
          id: 'https://example.com/article',
          url: 'https://example.com/article',
          normalizedUrl: 'https://example.com/article',
          title: '示例页面',
          faviconUrl: '',
          content: '提取内容',
          extractionMethod: 'readability',
          includePageContent: true,
          promptTabStates: [],
          createdAt: 1,
          updatedAt: 1,
          expiresAt: 2,
        },
        conversations: [],
        loadingStates: [],
        blockedByBlacklist: false,
        matchedRuleId: null,
        shouldExtract: false,
      }),
      getConfig: vi.fn().mockResolvedValue({
        type: 'GET_CONFIG_SUCCESS',
        config: createDefaultConfig({
          basic: {
            ...createDefaultConfig().basic,
            extractionTextFontSize: 7,
          },
        }),
      }),
    });

    render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

    expect(await screen.findByTestId('sidebar-extraction-content')).toHaveClass('text-2xl', 'leading-10');
  });

  it('黑名单命中时先显示确认层，不自动提取', async () => {
    const user = userEvent.setup();
    const api = createSidebarApi({
      getSidebarBootstrap: vi.fn().mockResolvedValue({
        type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
        browserTabId: 7,
        normalizedUrl: 'https://example.com/article',
        page: null,
        conversations: [],
        loadingStates: [],
        blockedByBlacklist: true,
        matchedRuleId: 'rule-1',
        shouldExtract: true,
      }),
      confirmBlacklistContinue: vi.fn().mockResolvedValue({
        type: 'CONFIRM_BLACKLIST_CONTINUE_SUCCESS',
        payload: {
          allowed: true,
        },
      }),
      reExtractContent: vi.fn(),
    });

    render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

    expect(await screen.findByText('当前页面命中黑名单')).toBeVisible();
    expect(screen.getByRole('button', { name: '继续提取' })).toBeVisible();
    expect(screen.getByRole('button', { name: '重新提取' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '重新提取' }));

    expect(api.reExtractContent).not.toHaveBeenCalled();
  });

  it('页面级动作不会破坏当前输入草稿，并支持复制和页面跳转入口', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const api = createSidebarApi({
      getSidebarBootstrap: vi.fn().mockResolvedValue({
        type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
        browserTabId: 7,
        normalizedUrl: 'https://example.com/article',
        page: {
          id: 'https://example.com/article',
          url: 'https://example.com/article',
          normalizedUrl: 'https://example.com/article',
          title: '示例页面',
          faviconUrl: '',
          content: '提取内容',
          extractionMethod: 'readability',
          includePageContent: true,
          promptTabStates: [],
          createdAt: 1,
          updatedAt: 1,
          expiresAt: 2,
        },
        conversations: [
          {
            id: 'https://example.com/article:chat',
            normalizedUrl: 'https://example.com/article',
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
        blockedByBlacklist: false,
        matchedRuleId: null,
        shouldExtract: false,
      }),
    });

    render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

    await user.type(await screen.findByLabelText('聊天输入'), '保留这段草稿');
    await user.click(screen.getByRole('button', { name: '复制提取内容' }));
    expect(writeText).toHaveBeenCalledWith('提取内容');
    expect(within(screen.getByRole('alert')).getByText('已复制提取内容')).toBeVisible();

    await user.click(screen.getByRole('button', { name: '打开历史页' }));
    await user.click(screen.getByRole('button', { name: '打开设置页' }));
    await user.click(screen.getByRole('button', { name: '打开 GitHub' }));
    expect(api.openHistoryPage).toHaveBeenCalledTimes(1);
    expect(api.openSettingsPage).toHaveBeenCalledTimes(1);
    expect(api.openGithubProject).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '清空当前页面数据' }));
    await user.click(within(screen.getByTestId('clear-page-confirm')).getByRole('button', { name: '清空当前页面数据' }));
    expect(api.clearPageContext).toHaveBeenCalledWith({
      tabId: 7,
      pageUrl: 'https://example.com/article',
    });
    expect(screen.getAllByText('还没有聊天记录').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('聊天输入')).toHaveValue('保留这段草稿');
    expect(within(screen.getByRole('alert')).getByText('已清空当前页面数据')).toBeVisible();
  });

  it('切换提取方式命中缓存时直接展示缓存且不重新提取', async () => {
    const user = userEvent.setup();
    const api = createSidebarApi({
      getSidebarBootstrap: vi.fn().mockResolvedValue({
        type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
        browserTabId: 7,
        normalizedUrl: 'https://example.com/article',
        page: {
          id: 'https://example.com/article',
          url: 'https://example.com/article',
          normalizedUrl: 'https://example.com/article',
          title: '示例页面',
          faviconUrl: '',
          content: '旧提取内容',
          extractionMethod: 'readability',
          includePageContent: true,
          promptTabStates: [],
          createdAt: 1,
          updatedAt: 1,
          expiresAt: 2,
        },
        conversations: [],
        loadingStates: [],
        blockedByBlacklist: false,
        matchedRuleId: null,
        shouldExtract: false,
      }),
      switchExtractionMethod: vi.fn().mockResolvedValue({
        type: 'SWITCH_EXTRACTION_METHOD_SUCCESS',
        payload: {
          hasCachedContent: true,
          method: 'jina',
          content: 'Jina 缓存内容',
          extractionMethod: 'jina',
        },
      }),
      reExtractContent: vi.fn(),
    });

    render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

    expect(await screen.findByText('旧提取内容')).toBeVisible();
    expect(screen.getByRole('group', { name: '提取方式' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Jina' }));

    expect(screen.getByRole('button', { name: 'Jina' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Readability' })).toHaveAttribute('aria-pressed', 'false');
    expect(await screen.findByText('Jina 缓存内容')).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(api.reExtractContent).not.toHaveBeenCalled();
    expect(api.switchExtractionMethod).toHaveBeenCalledWith({
      tabId: 7,
      pageUrl: 'https://example.com/article',
      method: 'jina',
    });
    expect(screen.queryByTestId('sidebar-extraction-loading-bar')).toBeNull();
  });

  it('点击重新提取会刷新当前提取方法', async () => {
    const user = userEvent.setup();
    const api = createSidebarApi({
      getSidebarBootstrap: vi.fn().mockResolvedValue({
        type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
        browserTabId: 7,
        normalizedUrl: 'https://example.com/article',
        page: {
          id: 'https://example.com/article',
          url: 'https://example.com/article',
          normalizedUrl: 'https://example.com/article',
          title: '示例页面',
          faviconUrl: '',
          content: '已有提取内容',
          extractionMethod: 'jina',
          includePageContent: true,
          promptTabStates: [],
          createdAt: 1,
          updatedAt: 1,
          expiresAt: 2,
        },
        conversations: [],
        loadingStates: [],
        blockedByBlacklist: false,
        matchedRuleId: null,
        shouldExtract: false,
      }),
      reExtractContent: vi.fn().mockResolvedValue({
        payload: {
          content: '刷新后的 Jina 内容',
          extractionMethod: 'jina',
        },
      }),
    });

    render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

    expect(await screen.findByText('已有提取内容')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '重新提取' }));

    await waitFor(() =>
      expect(api.reExtractContent).toHaveBeenCalledWith({
        tabId: 7,
        pageUrl: 'https://example.com/article',
        method: 'jina',
        source: 'manual_reextract',
      }),
    );
    expect(await screen.findByText('刷新后的 Jina 内容')).toBeVisible();
  });

  it('切换提取方式未命中缓存时显示空态且不重新提取', async () => {
    const user = userEvent.setup();
    const api = createSidebarApi({
      getSidebarBootstrap: vi.fn().mockResolvedValue({
        type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
        browserTabId: 7,
        normalizedUrl: 'https://example.com/article',
        page: {
          id: 'https://example.com/article',
          url: 'https://example.com/article',
          normalizedUrl: 'https://example.com/article',
          title: '示例页面',
          faviconUrl: '',
          content: '旧提取内容',
          extractionMethod: 'readability',
          includePageContent: true,
          promptTabStates: [],
          createdAt: 1,
          updatedAt: 1,
          expiresAt: 2,
        },
        conversations: [],
        loadingStates: [],
        blockedByBlacklist: false,
        matchedRuleId: null,
        shouldExtract: false,
      }),
      switchExtractionMethod: vi.fn().mockResolvedValue({
        type: 'SWITCH_EXTRACTION_METHOD_SUCCESS',
        payload: {
          hasCachedContent: false,
          method: 'jina',
        },
      }),
      reExtractContent: vi.fn(),
    });

    render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

    expect(await screen.findByText('旧提取内容')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Jina' }));

    await waitFor(() => expect(screen.queryByText('旧提取内容')).toBeNull());
    expect(screen.getByRole('button', { name: 'Jina' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('当前提取方式暂无缓存，请点击重新提取')).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(api.reExtractContent).not.toHaveBeenCalled();
  });

  it('已有页面但当前方法无缓存时重开侧边栏不自动提取', async () => {
    const api = createSidebarApi({
      getSidebarBootstrap: vi.fn().mockResolvedValue({
        type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
        browserTabId: 7,
        normalizedUrl: 'https://example.com/article',
        page: {
          id: 'https://example.com/article',
          url: 'https://example.com/article',
          normalizedUrl: 'https://example.com/article',
          title: '示例页面',
          faviconUrl: '',
          content: '',
          extractionMethod: 'jina',
          includePageContent: true,
          promptTabStates: [],
          createdAt: 1,
          updatedAt: 1,
          expiresAt: 2,
        },
        conversations: [],
        loadingStates: [],
        blockedByBlacklist: false,
        matchedRuleId: null,
        shouldExtract: false,
      }),
      reExtractContent: vi.fn(),
    });

    render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Jina' })).toHaveAttribute('aria-pressed', 'true'));
    expect(api.reExtractContent).not.toHaveBeenCalled();
    expect(screen.queryByTestId('sidebar-extraction-loading-bar')).toBeNull();
  });

  it('切换提取方式失败后会回滚选中态并保留旧正文', async () => {
    const user = userEvent.setup();
    const api = createSidebarApi({
      getSidebarBootstrap: vi.fn().mockResolvedValue({
        type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
        browserTabId: 7,
        normalizedUrl: 'https://example.com/article',
        page: {
          id: 'https://example.com/article',
          url: 'https://example.com/article',
          normalizedUrl: 'https://example.com/article',
          title: '示例页面',
          faviconUrl: '',
          content: '旧提取内容',
          extractionMethod: 'readability',
          includePageContent: true,
          promptTabStates: [],
          createdAt: 1,
          updatedAt: 1,
          expiresAt: 2,
        },
        conversations: [],
        loadingStates: [],
        blockedByBlacklist: false,
        matchedRuleId: null,
        shouldExtract: false,
      }),
      switchExtractionMethod: vi.fn().mockRejectedValue(new Error('切换失败')),
      reExtractContent: vi.fn(),
    });

    render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

    expect(await screen.findByText('旧提取内容')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Jina' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Readability' })).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByText('旧提取内容')).toBeVisible();
    expect(within(screen.getByRole('alert')).getByText('切换提取方式失败，请重试')).toBeVisible();
  });

  it('优先恢复页面级 includePageContent，而不是只使用设置默认值', async () => {
    const api = createSidebarApi({
      getSidebarBootstrap: vi.fn().mockResolvedValue({
        type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
        browserTabId: 7,
        normalizedUrl: 'https://example.com/article',
        page: {
          id: 'https://example.com/article',
          url: 'https://example.com/article',
          normalizedUrl: 'https://example.com/article',
          title: '示例页面',
          faviconUrl: '',
          content: '提取内容',
          extractionMethod: 'readability',
          includePageContent: false,
          promptTabStates: [],
          createdAt: 1,
          updatedAt: 1,
          expiresAt: 2,
        },
        conversations: [],
        loadingStates: [],
        blockedByBlacklist: false,
        matchedRuleId: null,
        shouldExtract: false,
      }),
      getConfig: vi.fn().mockResolvedValue({
        type: 'GET_CONFIG_SUCCESS',
        config: createDefaultConfig({
          basic: {
            includePageContentByDefault: true,
          },
        }),
      }),
    });

    render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

    expect(await screen.findByLabelText('包含页面内容')).not.toBeChecked();
  });

  it('清空当前页面数据后点击快捷标签时提示先刷新且不发送', async () => {
    const user = userEvent.setup();
    const api = createSidebarApi({
      getSidebarBootstrap: vi.fn().mockResolvedValue({
        type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
        browserTabId: 7,
        normalizedUrl: 'https://example.com/article',
        page: {
          id: 'https://example.com/article',
          url: 'https://example.com/article',
          normalizedUrl: 'https://example.com/article',
          title: '示例页面',
          faviconUrl: '',
          content: '已有提取内容',
          extractionMethod: 'readability',
          includePageContent: true,
          promptTabStates: [],
          createdAt: 1,
          updatedAt: 1,
          expiresAt: 2,
        },
        conversations: [
          {
            id: 'https://example.com/article:quick-summary',
            normalizedUrl: 'https://example.com/article',
            promptTabId: 'quick-summary',
            messages: [
              {
                id: 'summary-history',
                role: 'assistant',
                content: '总结历史回答',
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
              messageId: 'summary-history',
              status: 'done',
              summary: '总结历史回答',
            },
            updatedAt: 1,
          },
          {
            id: 'https://example.com/article:quick-translate',
            normalizedUrl: 'https://example.com/article',
            promptTabId: 'quick-translate',
            messages: [
              {
                id: 'translate-history',
                role: 'assistant',
                content: '翻译历史回答',
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
              messageId: 'translate-history',
              status: 'done',
              summary: '翻译历史回答',
            },
            updatedAt: 1,
          },
        ],
        loadingStates: [],
        blockedByBlacklist: false,
        matchedRuleId: null,
        shouldExtract: false,
      }),
      getConfig: vi.fn().mockResolvedValue({
        type: 'GET_CONFIG_SUCCESS',
        config: createDefaultConfig({
          basic: {
            defaultModelId: 'model-1',
          },
          models: [
            {
              id: 'model-1',
              name: '主模型',
              provider: 'openai-compatible',
              enabled: true,
              model: 'gpt-4.1-mini',
              baseUrl: 'https://api.example.com',
              apiKey: 'token',
              deployment: '',
              temperature: 0,
              tools: [],
              thinkingBudget: null,
              maxOutputTokens: null,
              supportsImages: true,
              order: 0,
              deletedAt: null,
            },
          ],
          quickInputs: [
            {
              id: 'quick-summary',
              name: '总结',
              prompt: '请总结当前页面',
              autoTrigger: true,
              modelId: 'model-1',
              parallelModelIds: [],
              order: 0,
              deletedAt: null,
            },
            {
              id: 'quick-translate',
              name: '翻译',
              prompt: '请翻译当前页面',
              autoTrigger: true,
              modelId: 'model-1',
              parallelModelIds: [],
              order: 1,
              deletedAt: null,
            },
          ],
        }),
      }),
    });

    render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

    await user.click(await screen.findByRole('button', { name: '清空当前页面数据' }));
    await user.click(within(screen.getByTestId('clear-page-confirm')).getByRole('button', { name: '清空当前页面数据' }));
    await user.click(screen.getByRole('tab', { name: /总结/ }));

    expect(api.reExtractContent).not.toHaveBeenCalled();
    expect(api.sendChat).not.toHaveBeenCalled();
    expect(within(screen.getByRole('alert')).getByText('当前没有可复制的提取内容')).toBeVisible();
  });

  it('根据 quickInputs 渲染多 promptTab，并在切换标签时按需直接触发快捷输入', async () => {
    const user = userEvent.setup();
    const api = createSidebarApi({
      getSidebarBootstrap: vi.fn().mockResolvedValue({
        type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
        browserTabId: 7,
        normalizedUrl: 'https://example.com/article',
        page: {
          id: 'https://example.com/article',
          url: 'https://example.com/article',
          normalizedUrl: 'https://example.com/article',
          title: '示例页面',
          faviconUrl: '',
          content: '提取内容',
          extractionMethod: 'readability',
          includePageContent: true,
          promptTabStates: [
            {
              promptTabId: 'quick-summary',
              initializedAt: 1,
              lastAutoTriggerAt: 2,
              autoTriggerStatus: 'done',
              lastClearedAt: null,
            },
          ],
          createdAt: 1,
          updatedAt: 1,
          expiresAt: 2,
        },
        conversations: [
          {
            id: 'https://example.com/article:chat',
            normalizedUrl: 'https://example.com/article',
            promptTabId: 'chat',
            messages: [
              {
                id: 'chat-answer-1',
                role: 'assistant',
                content: 'Chat 历史回答',
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
              messageId: 'chat-answer-1',
              status: 'done',
              summary: 'Chat 历史回答',
            },
            updatedAt: 1,
          },
          {
            id: 'https://example.com/article:quick-summary',
            normalizedUrl: 'https://example.com/article',
            promptTabId: 'quick-summary',
            messages: [
              {
                id: 'quick-answer-1',
                role: 'assistant',
                content: '快捷标签历史回答',
                images: [],
                status: 'done',
                errorMessage: null,
                modelId: 'model-2',
                branches: [],
                retryFromMessageId: null,
                editedAt: null,
                createdAt: 1,
                updatedAt: 1,
              },
            ],
            lastAssistantState: {
              messageId: 'quick-answer-1',
              status: 'done',
              summary: '快捷标签历史回答',
            },
            updatedAt: 1,
          },
        ],
        loadingStates: [],
        blockedByBlacklist: false,
        matchedRuleId: null,
        shouldExtract: false,
      }),
      getConfig: vi.fn().mockResolvedValue({
        type: 'GET_CONFIG_SUCCESS',
        config: createDefaultConfig({
          basic: {
            defaultModelId: 'model-1',
          },
          models: [
            {
              id: 'model-1',
              name: '主模型',
              provider: 'openai-compatible',
              enabled: true,
              model: 'gpt-4.1-mini',
              baseUrl: 'https://api.example.com',
              apiKey: 'token',
              deployment: '',
              temperature: 0,
              tools: [],
              thinkingBudget: null,
              maxOutputTokens: null,
              supportsImages: true,
              order: 0,
              deletedAt: null,
            },
            {
              id: 'model-2',
              name: '快捷模型',
              provider: 'openai-compatible',
              enabled: true,
              model: 'gpt-4.1-mini',
              baseUrl: 'https://api.example.com',
              apiKey: 'token',
              deployment: '',
              temperature: 0,
              tools: [],
              thinkingBudget: null,
              maxOutputTokens: null,
              supportsImages: false,
              order: 1,
              deletedAt: null,
            },
          ],
          quickInputs: [
            {
              id: 'quick-summary',
              name: '总结',
              prompt: '请总结当前页面',
              autoTrigger: true,
              modelId: 'model-2',
              parallelModelIds: [],
              order: 0,
              deletedAt: null,
            },
            {
              id: 'quick-translate',
              name: '翻译',
              prompt: '请翻译当前页面',
              autoTrigger: false,
              modelId: 'missing-model',
              parallelModelIds: [],
              order: 1,
              deletedAt: null,
            },
            {
              id: 'quick-hidden',
              name: '隐藏标签',
              prompt: '不应展示',
              autoTrigger: false,
              modelId: null,
              parallelModelIds: [],
              order: 2,
              deletedAt: 3,
            },
          ],
        }),
      }),
    });

    render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

    await screen.findByText('Chat 历史回答');
    expect(screen.getByRole('tab', { name: /聊天/ })).toBeVisible();
    expect(screen.getByRole('tab', { name: /总结/ })).toBeVisible();
    expect(screen.getByRole('tab', { name: /翻译/ })).toBeVisible();
    expect(screen.queryByRole('tab', { name: /隐藏标签/ })).toBeNull();
    expect(screen.getByTestId('prompt-tab-line-chat')).toBeVisible();
    expect(screen.getByTestId('prompt-tab-line-quick-summary')).toBeVisible();
    expect(screen.getByTestId('prompt-tab-line-chat').className).toContain('inset-x-0');

    await user.type(screen.getByLabelText('聊天输入'), '保留的 chat 草稿');
    await user.click(screen.getByRole('tab', { name: /总结/ }));
    expect(screen.getByRole('tab', { name: /总结/ })).toHaveAttribute('title', expect.stringContaining('自动触发完成'));
    expect(screen.getByLabelText('聊天输入')).toHaveValue('');
    expect(screen.getByLabelText('选择模型')).toHaveValue('model-2');
    expect(screen.getByRole('tabpanel', { name: /总结/ })).toHaveTextContent('快捷标签历史回答');

    await user.type(screen.getByLabelText('聊天输入'), '总结标签草稿');

    await user.click(screen.getByRole('tab', { name: /翻译/ }));
    expect(api.sendChat).toHaveBeenCalledWith({
      tabId: 7,
      pageUrl: 'https://example.com/article',
      promptTabId: 'quick-translate',
      modelId: 'model-1',
      text: '请翻译当前页面',
      displayText: '翻译',
      images: [],
      includePageContent: true,
      rollbackOnFailure: true,
    });
    expect(within(screen.getByRole('tabpanel', { name: /翻译/ })).getByText('翻译')).toBeVisible();
    expect(screen.getByLabelText('聊天输入')).toHaveValue('');
    expect(screen.getByLabelText('选择模型')).toHaveValue('model-1');
    expect(screen.getByTestId('prompt-tab-loading-quick-translate')).toBeVisible();
    const loadingQuickTab = screen.getByRole('tab', { name: /翻译/ });
    expect(loadingQuickTab.className).toContain('bg-primary/8');
    expect(loadingQuickTab.className).toContain('tab-loading-border');
    expect(loadingQuickTab.className).toContain('border-transparent');
    expect(loadingQuickTab.className).not.toContain('bg-background');

    await user.click(screen.getByRole('tab', { name: /聊天/ }));
    expect(screen.getByLabelText('聊天输入')).toHaveValue('保留的 chat 草稿');

    await user.click(screen.getByRole('tab', { name: /总结/ }));
    expect(screen.getByLabelText('聊天输入')).toHaveValue('总结标签草稿');
  });

  it('页面已有缓存正文时，打开侧边栏会自动触发已配置 autoTrigger 的快捷输入', async () => {
    const user = userEvent.setup();
    const api = createSidebarApi({
      getSidebarBootstrap: vi.fn().mockResolvedValue({
        type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
        browserTabId: 7,
        normalizedUrl: 'https://example.com/article',
        page: {
          id: 'https://example.com/article',
          url: 'https://example.com/article',
          normalizedUrl: 'https://example.com/article',
          title: '示例页面',
          faviconUrl: '',
          content: '提取内容',
          extractionMethod: 'readability',
          includePageContent: true,
          promptTabStates: [],
          createdAt: 1,
          updatedAt: 1,
          expiresAt: 2,
        },
        conversations: [],
        loadingStates: [],
        blockedByBlacklist: false,
        matchedRuleId: null,
        shouldExtract: false,
      }),
      getConfig: vi.fn().mockResolvedValue({
        type: 'GET_CONFIG_SUCCESS',
        config: createDefaultConfig({
          basic: {
            defaultModelId: 'model-1',
          },
          models: [
            {
              id: 'model-1',
              name: '主模型',
              provider: 'openai-compatible',
              enabled: true,
              model: 'gpt-4.1-mini',
              baseUrl: 'https://api.example.com',
              apiKey: 'token',
              deployment: '',
              temperature: 0,
              tools: [],
              thinkingBudget: null,
              maxOutputTokens: null,
              supportsImages: true,
              order: 0,
              deletedAt: null,
            },
          ],
          quickInputs: [
            {
              id: 'quick-summary',
              name: '总结',
              prompt: '请总结当前页面',
              autoTrigger: true,
              modelId: 'model-1',
              parallelModelIds: [],
              order: 0,
              deletedAt: null,
            },
          ],
        }),
      }),
    });

    render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

    await waitFor(() =>
      expect(api.sendChat).toHaveBeenCalledWith({
        tabId: 7,
        pageUrl: 'https://example.com/article',
        promptTabId: 'quick-summary',
        modelId: 'model-1',
        text: '请总结当前页面',
        displayText: '总结',
        images: [],
        includePageContent: true,
        rollbackOnFailure: true,
      }),
    );

    await user.click(screen.getByRole('tab', { name: /总结/ }));
    expect(within(screen.getByRole('tabpanel', { name: /总结/ })).getByText('总结')).toBeVisible();
  });

  it('首轮快捷输入失败且已回滚时，当前 UI 保留用户消息并展示助手错误', async () => {
    const user = userEvent.setup();
    let portMessageListener: ((event: unknown) => void) | undefined;
    const api = createSidebarApi({
      getSidebarBootstrap: vi.fn().mockResolvedValue({
        type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
        browserTabId: 7,
        normalizedUrl: 'https://example.com/article',
        page: {
          id: 'https://example.com/article',
          url: 'https://example.com/article',
          normalizedUrl: 'https://example.com/article',
          title: '示例页面',
          faviconUrl: '',
          content: '提取内容',
          extractionMethod: 'readability',
          includePageContent: true,
          promptTabStates: [],
          createdAt: 1,
          updatedAt: 1,
          expiresAt: 2,
        },
        conversations: [],
        loadingStates: [],
        blockedByBlacklist: false,
        matchedRuleId: null,
        shouldExtract: false,
      }),
      getConfig: vi.fn().mockResolvedValue({
        type: 'GET_CONFIG_SUCCESS',
        config: createDefaultConfig({
          basic: {
            defaultModelId: 'model-1',
          },
          models: [
            {
              id: 'model-1',
              name: '主模型',
              provider: 'openai-compatible',
              enabled: true,
              model: 'gpt-4.1-mini',
              baseUrl: 'https://api.example.com',
              apiKey: 'token',
              deployment: '',
              temperature: 0,
              tools: [],
              thinkingBudget: null,
              maxOutputTokens: null,
              supportsImages: true,
              order: 0,
              deletedAt: null,
            },
          ],
          quickInputs: [
            {
              id: 'quick-summary',
              name: '总结',
              prompt: '请总结当前页面',
              autoTrigger: false,
              modelId: 'model-1',
              parallelModelIds: [],
              order: 0,
              deletedAt: null,
            },
          ],
        }),
      }),
      sendChat: vi.fn().mockResolvedValue({
        type: 'SEND_CHAT_SUCCESS',
        payload: {
          sessionId: 'session-rollback',
          userMessageId: 'user-rollback',
          messageId: 'assistant-rollback',
          branchId: 'branch-rollback',
          modelId: 'model-1',
          modelLabel: '主模型',
        },
      }),
      connectStream: vi.fn(() => ({
        disconnect: vi.fn(),
        onMessage: {
          addListener: vi.fn((listener: (event: unknown) => void) => {
            portMessageListener = listener;
          }),
          removeListener: vi.fn(),
        },
      })),
    });

    render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

    await user.click(await screen.findByRole('tab', { name: /总结/ }));
    expect(within(screen.getByRole('tabpanel', { name: /总结/ })).getByText('总结')).toBeVisible();

    portMessageListener?.({
      type: 'CHAT_STREAM_FAILED',
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'quick-summary',
      sessionId: 'session-rollback',
      messageId: 'assistant-rollback',
      branchId: 'branch-rollback',
      errorMessage: 'provider timeout',
      rollbackOnFailure: true,
      userMessageId: 'user-rollback',
    });

    await waitFor(() => expect(within(screen.getByRole('tabpanel', { name: /总结/ })).getByText('provider timeout')).toBeVisible());
    expect(screen.getByTestId('branch-branch-rollback')).toHaveTextContent('provider timeout');
    expect(within(screen.getByRole('tabpanel', { name: /总结/ })).getByText('总结')).toBeVisible();
    expect(screen.queryByTestId('prompt-tab-loading-quick-summary')).toBeNull();
  });

  it('发送命令失败时保留用户消息，并在本地助手回复中展示错误', async () => {
    const user = userEvent.setup();
    const apiError =
      'models/gemini-3.1-flash-lite1 is not found for API version v1beta, or is not supported for generateContent.';
    const api = createSidebarApi({
      getSidebarBootstrap: vi.fn().mockResolvedValue({
        type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
        browserTabId: 7,
        normalizedUrl: 'https://example.com/article',
        page: {
          id: 'https://example.com/article',
          url: 'https://example.com/article',
          normalizedUrl: 'https://example.com/article',
          title: '示例页面',
          faviconUrl: '',
          content: '提取内容',
          extractionMethod: 'readability',
          includePageContent: true,
          promptTabStates: [],
          createdAt: 1,
          updatedAt: 1,
          expiresAt: 2,
        },
        conversations: [],
        loadingStates: [],
        blockedByBlacklist: false,
        matchedRuleId: null,
        shouldExtract: false,
      }),
      getConfig: vi.fn().mockResolvedValue({
        type: 'GET_CONFIG_SUCCESS',
        config: createDefaultConfig({
          basic: {
            defaultModelId: 'model-1',
          },
          models: [
            {
              id: 'model-1',
              name: 'Gemini 测试模型',
              provider: 'gemini',
              enabled: true,
              model: 'gemini-3.1-flash-lite1',
              baseUrl: '',
              apiKey: 'token',
              deployment: '',
              temperature: 0,
              tools: [],
              thinkingBudget: null,
              maxOutputTokens: null,
              supportsImages: true,
              order: 0,
              deletedAt: null,
            },
          ],
        }),
      }),
      sendChat: vi.fn().mockRejectedValue(new Error(apiError)),
    });

    render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

    await user.type(await screen.findByLabelText('聊天输入'), '这条消息要保留');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => expect(api.sendChat).toHaveBeenCalledTimes(1));
    const chatPanel = screen.getByRole('tabpanel', { name: /聊天/ });
    expect(within(chatPanel).getByText('这条消息要保留')).toBeVisible();
    expect(within(chatPanel).getByText(apiError)).toBeVisible();
    expect(screen.queryByTestId('prompt-tab-loading-chat')).toBeNull();
  });

  it('流式失败早于发送响应时不会被响应重新覆盖成 loading', async () => {
    const user = userEvent.setup();
    let portMessageListener: ((event: unknown) => void) | null = null;
    let resolveSendChat: (value: unknown) => void = () => undefined;
    const sendChatPromise = new Promise((resolve) => {
      resolveSendChat = resolve;
    });
    const api = createSidebarApi({
      getSidebarBootstrap: vi.fn().mockResolvedValue({
        type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
        browserTabId: 7,
        normalizedUrl: 'https://example.com/article',
        page: {
          id: 'https://example.com/article',
          url: 'https://example.com/article',
          normalizedUrl: 'https://example.com/article',
          title: '示例页面',
          faviconUrl: '',
          content: '提取内容',
          extractionMethod: 'readability',
          includePageContent: true,
          promptTabStates: [],
          createdAt: 1,
          updatedAt: 1,
          expiresAt: 2,
        },
        conversations: [],
        loadingStates: [],
        blockedByBlacklist: false,
        matchedRuleId: null,
        shouldExtract: false,
      }),
      getConfig: vi.fn().mockResolvedValue({
        type: 'GET_CONFIG_SUCCESS',
        config: createDefaultConfig({
          basic: {
            defaultModelId: 'model-1',
          },
          models: [
            {
              id: 'model-1',
              name: '主模型',
              provider: 'openai-compatible',
              enabled: true,
              model: 'gpt-4.1-mini',
              baseUrl: 'https://api.example.com',
              apiKey: 'token',
              deployment: '',
              temperature: 0,
              tools: [],
              thinkingBudget: null,
              maxOutputTokens: null,
              supportsImages: true,
              order: 0,
              deletedAt: null,
            },
          ],
        }),
      }),
      sendChat: vi.fn().mockReturnValue(sendChatPromise),
      connectStream: vi.fn(() => ({
        disconnect: vi.fn(),
        onMessage: {
          addListener: vi.fn((listener: (event: unknown) => void) => {
            portMessageListener = listener;
          }),
          removeListener: vi.fn(),
        },
      })),
    });

    render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

    await user.type(await screen.findByLabelText('聊天输入'), '先失败');
    await user.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() => expect(api.sendChat).toHaveBeenCalledTimes(1));

    portMessageListener?.({
      type: 'CHAT_STREAM_FAILED',
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      sessionId: 'session-1',
      messageId: 'assistant-1',
      branchId: 'branch-1',
      errorMessage: 'provider timeout',
    });
    resolveSendChat({
      type: 'SEND_CHAT_SUCCESS',
      payload: {
        sessionId: 'session-1',
        userMessageId: 'user-1',
        messageId: 'assistant-1',
        branchId: 'branch-1',
        modelId: 'model-1',
        modelLabel: '主模型',
      },
    });

    const chatPanel = screen.getByRole('tabpanel', { name: /聊天/ });
    await waitFor(() => expect(within(chatPanel).getByText('provider timeout')).toBeVisible());
    await waitFor(() => expect(screen.queryByTestId('prompt-tab-loading-chat')).toBeNull());
    expect(within(chatPanel).getByText('先失败')).toBeVisible();
  });

  it('清空当前标签只影响当前 promptTab，会保留提取内容和其他标签历史', async () => {
    const user = userEvent.setup();
    const api = createSidebarApi({
      clearTabConversation: vi.fn().mockResolvedValue({
        type: 'CLEAR_TAB_CONVERSATION_SUCCESS',
        payload: {
          normalizedUrl: 'https://example.com/article',
          promptTabId: 'quick-summary',
          cleared: true,
        },
      }),
      getSidebarBootstrap: vi.fn().mockResolvedValue({
        type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
        browserTabId: 7,
        normalizedUrl: 'https://example.com/article',
        page: {
          id: 'https://example.com/article',
          url: 'https://example.com/article',
          normalizedUrl: 'https://example.com/article',
          title: '示例页面',
          faviconUrl: '',
          content: '提取内容',
          extractionMethod: 'readability',
          includePageContent: true,
          promptTabStates: [
            {
              promptTabId: 'quick-summary',
              initializedAt: 1,
              lastAutoTriggerAt: 2,
              autoTriggerStatus: 'done',
              lastClearedAt: null,
            },
          ],
          createdAt: 1,
          updatedAt: 1,
          expiresAt: 2,
        },
        conversations: [
          {
            id: 'https://example.com/article:chat',
            normalizedUrl: 'https://example.com/article',
            promptTabId: 'chat',
            messages: [
              {
                id: 'chat-answer-1',
                role: 'assistant',
                content: 'Chat 历史回答',
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
              messageId: 'chat-answer-1',
              status: 'done',
              summary: 'Chat 历史回答',
            },
            updatedAt: 1,
          },
          {
            id: 'https://example.com/article:quick-summary',
            normalizedUrl: 'https://example.com/article',
            promptTabId: 'quick-summary',
            messages: [
              {
                id: 'quick-answer-1',
                role: 'assistant',
                content: '快捷标签历史回答',
                images: [],
                status: 'done',
                errorMessage: null,
                modelId: 'model-2',
                branches: [],
                retryFromMessageId: null,
                editedAt: null,
                createdAt: 1,
                updatedAt: 1,
              },
            ],
            lastAssistantState: {
              messageId: 'quick-answer-1',
              status: 'done',
              summary: '快捷标签历史回答',
            },
            updatedAt: 1,
          },
        ],
        loadingStates: [],
        blockedByBlacklist: false,
        matchedRuleId: null,
        shouldExtract: false,
      }),
      getConfig: vi.fn().mockResolvedValue({
        type: 'GET_CONFIG_SUCCESS',
        config: createDefaultConfig({
          basic: {
            defaultModelId: 'model-1',
          },
          models: [
            {
              id: 'model-1',
              name: '主模型',
              provider: 'openai-compatible',
              enabled: true,
              model: 'gpt-4.1-mini',
              baseUrl: 'https://api.example.com',
              apiKey: 'token',
              deployment: '',
              temperature: 0,
              tools: [],
              thinkingBudget: null,
              maxOutputTokens: null,
              supportsImages: true,
              order: 0,
              deletedAt: null,
            },
            {
              id: 'model-2',
              name: '快捷模型',
              provider: 'openai-compatible',
              enabled: true,
              model: 'gpt-4.1-mini',
              baseUrl: 'https://api.example.com',
              apiKey: 'token',
              deployment: '',
              temperature: 0,
              tools: [],
              thinkingBudget: null,
              maxOutputTokens: null,
              supportsImages: false,
              order: 1,
              deletedAt: null,
            },
          ],
          quickInputs: [
            {
              id: 'quick-summary',
              name: '总结',
              prompt: '请总结当前页面',
              autoTrigger: true,
              modelId: 'model-2',
              parallelModelIds: [],
              order: 0,
              deletedAt: null,
            },
          ],
        }),
      }),
    });

    render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

    await user.click(await screen.findByRole('tab', { name: /总结/ }));
    expect(screen.getByText('快捷标签历史回答')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '清空当前标签' }));
    await user.click(within(screen.getByTestId('clear-tab-confirm')).getByRole('button', { name: '清空当前标签' }));
    expect(api.clearTabConversation).toHaveBeenCalledWith({
      tabId: 7,
      pageUrl: 'https://example.com/article',
      promptTabId: 'quick-summary',
    });
    expect(screen.getByTestId('sidebar-extraction-panel')).toHaveTextContent('提取内容');
    expect(within(screen.getByRole('alert')).getByText('已清空当前标签聊天记录')).toBeVisible();
    expect(screen.getByText('还没有聊天记录')).toBeVisible();

    await user.click(screen.getByRole('tab', { name: /聊天/ }));
    expect(screen.getByText('Chat 历史回答')).toBeVisible();
  });

  it('非空会话导出时会下载 Markdown 文件', async () => {
    const user = userEvent.setup();
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(document.body, 'removeChild');
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const createObjectURL = vi.fn(() => 'blob:conversation-export');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(window.URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(window.URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });

    const api = createSidebarApi({
      getSidebarBootstrap: vi.fn().mockResolvedValue({
        type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
        browserTabId: 7,
        normalizedUrl: 'https://example.com/article',
        page: {
          id: 'https://example.com/article',
          url: 'https://example.com/article',
          normalizedUrl: 'https://example.com/article',
          title: '示例页面',
          faviconUrl: '',
          content: '提取内容',
          extractionMethod: 'readability',
          includePageContent: true,
          promptTabStates: [],
          createdAt: 1,
          updatedAt: 1,
          expiresAt: 2,
        },
        conversations: [
          {
            id: 'https://example.com/article:chat',
            normalizedUrl: 'https://example.com/article',
            promptTabId: 'chat',
            messages: [
              {
                id: 'assistant-1',
                role: 'assistant',
                content: '可导出的回答',
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
              summary: '可导出的回答',
            },
            updatedAt: 1,
          },
        ],
        loadingStates: [],
        blockedByBlacklist: false,
        matchedRuleId: null,
        shouldExtract: false,
      }),
      exportConversation: vi.fn().mockResolvedValue({
        type: 'EXPORT_CONVERSATION_SUCCESS',
        payload: {
          filename: 'chat-export.md',
          content: '# 对话导出',
          mimeType: 'text/markdown;charset=utf-8',
        },
      }),
    });

    render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

    await user.click(await screen.findByRole('button', { name: '导出' }));

    await waitFor(() => {
      expect(api.exportConversation).toHaveBeenCalledWith({
        tabId: 7,
        pageUrl: 'https://example.com/article',
        promptTabId: 'chat',
      });
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    const downloadLink = appendSpy.mock.calls
      .map(([node]) => node)
      .find((node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement);

    expect(downloadLink?.download).toBe('chat-export.md');
    expect(downloadLink?.href).toBe('blob:conversation-export');
    expect(removeSpy).toHaveBeenCalledWith(downloadLink);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:conversation-export');
  });

  it('助手消息支持继续新增分支，并可停止和删除单个分支', async () => {
    const user = userEvent.setup();
    let portMessageListener: (event: unknown) => void = (_event: unknown) => {
      throw new Error('stream listener was not registered');
    };
    const api = createSidebarApi({
      getConfig: vi.fn().mockResolvedValue({
        type: 'GET_CONFIG_SUCCESS',
        config: createDefaultConfig({
          models: [
            {
              id: 'model-1',
              name: '主模型',
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
            {
              id: 'model-2',
              name: '分支模型',
              provider: 'openai-compatible',
              enabled: true,
              model: 'test-model-2',
              baseUrl: 'https://api.example.com',
              apiKey: 'key',
              deployment: '',
              temperature: 0.2,
              tools: [],
              thinkingBudget: null,
              maxOutputTokens: 1024,
              supportsImages: true,
              order: 1,
              deletedAt: null,
            },
          ],
        }),
      }),
      getSidebarBootstrap: vi.fn().mockResolvedValue({
        type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
        browserTabId: 7,
        normalizedUrl: 'https://example.com/article',
        page: {
          id: 'https://example.com/article',
          url: 'https://example.com/article',
          normalizedUrl: 'https://example.com/article',
          title: '示例页面',
          faviconUrl: '',
          content: '提取内容',
          extractionMethod: 'readability',
          includePageContent: true,
          promptTabStates: [],
          createdAt: 1,
          updatedAt: 1,
          expiresAt: 2,
        },
        conversations: [
          {
            id: 'https://example.com/article:chat',
            normalizedUrl: 'https://example.com/article',
            promptTabId: 'chat',
            messages: [
              {
                id: 'assistant-1',
                role: 'assistant',
                content: '主回答',
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
              summary: '主回答',
            },
            updatedAt: 1,
          },
        ],
        loadingStates: [],
        blockedByBlacklist: false,
        matchedRuleId: null,
        shouldExtract: false,
      }),
      connectStream: vi.fn(() => ({
        disconnect: vi.fn(),
        onMessage: {
          addListener: vi.fn((listener: (event: unknown) => void) => {
            portMessageListener = listener;
          }),
          removeListener: vi.fn(),
        },
      })),
    });

    render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

    const primaryBranchCard = await screen.findByTestId('branch-assistant-1:primary');
    await user.hover(primaryBranchCard);
    await user.click(within(primaryBranchCard).getByRole('button', { name: '继续新增分支' }));
    await user.click(await screen.findByRole('button', { name: '分支模型' }));
    expect(api.expandMessageBranches).toHaveBeenCalledWith({
      tabId: 7,
      pageUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'assistant-1',
      modelId: 'model-2',
    });

    await waitFor(() => expect(screen.getByTestId('branch-branch-1')).toBeVisible());
    portMessageListener?.({
      type: 'BRANCH_STREAM_CHUNK',
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      sessionId: 'branch-session-1',
      messageId: 'assistant-1',
      branchId: 'branch-1',
      chunk: '分支内容',
    });

    await waitFor(() => expect(screen.getByTestId('branch-branch-1')).toBeVisible());
    expect(screen.getByTestId('branch-branch-1')).toHaveTextContent('分支');
    expect(screen.getByTestId('branch-branch-1')).toHaveTextContent('分支模型');
    expect(screen.getByText('分支内容')).toBeVisible();

    await user.hover(screen.getByTestId('branch-branch-1'));
    await user.click(within(screen.getByTestId('branch-branch-1')).getByRole('button', { name: '停止分支' }));
    expect(api.stopBranch).toHaveBeenCalledWith({
      tabId: 7,
      pageUrl: 'https://example.com/article',
      promptTabId: 'chat',
      branchId: 'branch-1',
    });

    portMessageListener?.({
      type: 'BRANCH_STREAM_CANCELLED',
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      sessionId: 'branch-session-1',
      messageId: 'assistant-1',
      branchId: 'branch-1',
    });

    await user.hover(screen.getByTestId('branch-branch-1'));
    await user.click(within(screen.getByTestId('branch-branch-1')).getByRole('button', { name: '删除分支' }));
    await user.click(within(screen.getByTestId('delete-branch-confirm-branch-1')).getByRole('button', { name: '删除分支' }));
    expect(api.deleteBranch).toHaveBeenCalledWith({
      tabId: 7,
      pageUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'assistant-1',
      branchId: 'branch-1',
    });
    await waitFor(() => expect(screen.queryByTestId('branch-branch-1')).toBeNull());
  });

  it('侧边栏支持分支独立预览层，并可拖拽尺寸后按 Esc 关闭且不丢草稿', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const api = createSidebarApi({
      getSidebarBootstrap: vi.fn().mockResolvedValue({
        type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
        browserTabId: 7,
        normalizedUrl: 'https://example.com/article',
        page: {
          id: 'https://example.com/article',
          url: 'https://example.com/article',
          normalizedUrl: 'https://example.com/article',
          title: '示例页面',
          faviconUrl: '',
          content: '提取内容',
          extractionMethod: 'readability',
          includePageContent: true,
          promptTabStates: [],
          createdAt: 1,
          updatedAt: 1,
          expiresAt: 2,
        },
        conversations: [
          {
            id: 'https://example.com/article:chat',
            normalizedUrl: 'https://example.com/article',
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
                    modelLabel: '主模型',
                    isPrimary: true,
                    content: '# 预览标题\n\n- 预览内容',
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
        blockedByBlacklist: false,
        matchedRuleId: null,
        shouldExtract: false,
      }),
    });

    render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

    await user.type(await screen.findByLabelText('聊天输入'), '未发送草稿');
    await user.hover(screen.getByTestId('branch-branch-preview'));
    await user.click(screen.getByRole('button', { name: '打开分支预览' }));

    const dialog = await screen.findByTestId('branch-preview-dialog');
    expect(dialog).toHaveStyle({ width: '760px', height: '560px' });
    expect(screen.getByRole('heading', { name: '主模型' })).toBeVisible();
    expect(screen.queryByText('分支内容预览')).toBeNull();
    expect(screen.queryByText('预览层会复用消息区的 Markdown 渲染规则，关闭后不会影响当前会话与输入草稿。')).toBeNull();
    expect(within(screen.getByTestId('branch-preview-content')).getByText('预览标题')).toBeVisible();
    expect(within(screen.getByTestId('branch-preview-content')).getByText('预览内容')).toBeVisible();
    const previewMarkdown = screen.getByTestId('branch-preview-content').querySelector(':scope > div');
    expect(previewMarkdown).toBeInstanceOf(HTMLElement);
    expect(previewMarkdown?.className).toContain('leading-[18px]');
    expect(previewMarkdown?.className).not.toContain('leading-6');
    expect(screen.getByTestId('branch-preview-resize-handle').querySelector('svg')).not.toBeNull();

    fireEvent.mouseEnter(dialog);
    const previewActions = screen.getByTestId('branch-preview-actions');
    const previewContent = screen.getByTestId('branch-preview-content');
    Object.defineProperty(previewContent, 'scrollHeight', {
      value: 1800,
      configurable: true,
    });
    previewContent.scrollTop = 240;
    await user.click(within(previewActions).getByRole('button', { name: '定位到消息顶部' }));
    expect(previewContent.scrollTop).toBe(0);
    await user.click(within(previewActions).getByRole('button', { name: '定位到消息底部' }));
    expect(previewContent.scrollTop).toBe(1800);
    await user.click(within(previewActions).getByRole('button', { name: '复制纯文本' }));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith('预览标题\n\n预览内容'));
    expect(within(screen.getByRole('alert')).getByText('已复制纯文本')).toBeVisible();
    await user.click(within(previewActions).getByRole('button', { name: '复制 Markdown' }));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith('# 预览标题\n\n- 预览内容'));
    expect(within(screen.getByRole('alert')).getByText('已复制 Markdown')).toBeVisible();

    fireEvent.pointerDown(screen.getByTestId('branch-preview-resize-handle'), {
      clientX: 760,
      clientY: 560,
    });
    fireEvent.pointerMove(window, {
      clientX: 820,
      clientY: 620,
    });
    fireEvent.pointerUp(window);

    expect(dialog).toHaveStyle({ width: '820px', height: '620px' });
    fireEvent.click(screen.getByTestId('branch-preview-overlay'));
    expect(screen.getByTestId('branch-preview-dialog')).toBeVisible();

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByTestId('branch-preview-dialog')).toBeNull());
    expect(screen.getByLabelText('聊天输入')).toHaveValue('未发送草稿');
    expect(screen.getByTestId('branch-branch-preview')).toBeVisible();
  });

  it('已打开的分支预览在目标分支重新进入 loading 后自动关闭', async () => {
    const user = userEvent.setup();
    const portMessageListeners: Record<string, (event: unknown) => void> = {};
    const api = createSidebarApi({
      getSidebarBootstrap: vi.fn().mockResolvedValue({
        type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
        browserTabId: 7,
        normalizedUrl: 'https://example.com/article',
        page: {
          id: 'https://example.com/article',
          url: 'https://example.com/article',
          normalizedUrl: 'https://example.com/article',
          title: '示例页面',
          faviconUrl: '',
          content: '提取内容',
          extractionMethod: 'readability',
          includePageContent: true,
          promptTabStates: [],
          createdAt: 1,
          updatedAt: 1,
          expiresAt: 2,
        },
        conversations: [
          {
            id: 'https://example.com/article:chat',
            normalizedUrl: 'https://example.com/article',
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
                    modelLabel: '主模型',
                    isPrimary: true,
                    content: '预览内容',
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
        blockedByBlacklist: false,
        matchedRuleId: null,
        shouldExtract: false,
      }),
      connectStream: vi.fn((input: { promptTabId: string }) => ({
        disconnect: vi.fn(),
        onMessage: {
          addListener: vi.fn((listener: (event: unknown) => void) => {
            portMessageListeners[input.promptTabId] = listener;
          }),
          removeListener: vi.fn(),
        },
      })),
    });

    render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

    const branchCard = await screen.findByTestId('branch-branch-preview');
    await waitFor(() => expect(portMessageListeners.chat).toBeTypeOf('function'));
    await user.hover(branchCard);
    await user.click(within(branchCard).getByRole('button', { name: '打开分支预览' }));
    expect(await screen.findByTestId('branch-preview-dialog')).toBeVisible();

    const chatPortMessageListener = portMessageListeners.chat;
    if (!chatPortMessageListener) {
      throw new Error('chat stream listener was not registered');
    }
    chatPortMessageListener({
      type: 'BRANCH_STREAM_STARTED',
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      sessionId: 'branch-session-preview',
      messageId: 'assistant-preview',
      branchId: 'branch-preview',
      modelId: 'model-1',
      modelLabel: '主模型',
    });

    await waitFor(() => expect(screen.queryByTestId('branch-preview-dialog')).toBeNull());
    expect(screen.queryByRole('button', { name: '打开分支预览' })).toBeNull();
    expect(screen.getByRole('button', { name: '停止' })).toBeVisible();
  });

  it('新增分支失败时展示错误提示，不读取未定义 payload', async () => {
    const user = userEvent.setup();
    const api = createSidebarApi({
      getConfig: vi.fn().mockResolvedValue({
        type: 'GET_CONFIG_SUCCESS',
        config: createDefaultConfig({
          models: [
            {
              id: 'model-1',
              name: '主模型',
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
      getSidebarBootstrap: vi.fn().mockResolvedValue({
        type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
        browserTabId: 7,
        normalizedUrl: 'https://example.com/article',
        page: {
          id: 'https://example.com/article',
          url: 'https://example.com/article',
          normalizedUrl: 'https://example.com/article',
          title: '示例页面',
          faviconUrl: '',
          content: '提取内容',
          extractionMethod: 'readability',
          includePageContent: true,
          promptTabStates: [],
          createdAt: 1,
          updatedAt: 1,
          expiresAt: 2,
        },
        conversations: [
          {
            id: 'https://example.com/article:chat',
            normalizedUrl: 'https://example.com/article',
            promptTabId: 'chat',
            messages: [
              {
                id: 'assistant-1',
                role: 'assistant',
                content: '主回答',
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
              summary: '主回答',
            },
            updatedAt: 1,
          },
        ],
        loadingStates: [],
        blockedByBlacklist: false,
        matchedRuleId: null,
        shouldExtract: false,
      }),
      expandMessageBranches: vi.fn().mockRejectedValue(new Error('no branch models configured')),
    });

    render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

    await user.hover(await screen.findByTestId('chat-message-assistant-1'));
    await user.click(await screen.findByRole('button', { name: '继续新增分支' }));
    await user.click(await screen.findByRole('button', { name: '主模型' }));

    await waitFor(() => expect(within(screen.getByRole('alert')).getByText('新增分支失败，请重试')).toBeVisible());
    expect(screen.queryByTestId('branch-branch-1')).toBeNull();
  });

  it('支持编辑用户消息并重发，也支持重试助手消息替换旧结果', async () => {
    const user = userEvent.setup();
    let portMessageListener: (event: unknown) => void = (_event: unknown) => {
      throw new Error('stream listener was not registered');
    };
    const api = createSidebarApi({
      getSidebarBootstrap: vi.fn().mockResolvedValue({
        type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
        browserTabId: 7,
        normalizedUrl: 'https://example.com/article',
        page: {
          id: 'https://example.com/article',
          url: 'https://example.com/article',
          normalizedUrl: 'https://example.com/article',
          title: '示例页面',
          faviconUrl: '',
          content: '提取内容',
          extractionMethod: 'readability',
          includePageContent: true,
          promptTabStates: [],
          createdAt: 1,
          updatedAt: 1,
          expiresAt: 2,
        },
        conversations: [
          {
            id: 'https://example.com/article:chat',
            normalizedUrl: 'https://example.com/article',
            promptTabId: 'chat',
            messages: [
              {
                id: 'user-1',
                role: 'user',
                content: '旧问题',
                images: [],
                status: 'done',
                errorMessage: null,
                modelId: null,
                branches: [],
                retryFromMessageId: null,
                editedAt: null,
                createdAt: 1,
                updatedAt: 1,
              },
              {
                id: 'assistant-1',
                role: 'assistant',
                content: '旧回答',
                images: [],
                status: 'done',
                errorMessage: null,
                modelId: 'model-1',
                branches: [],
                retryFromMessageId: null,
                editedAt: null,
                createdAt: 2,
                updatedAt: 2,
              },
            ],
            lastAssistantState: {
              messageId: 'assistant-1',
              status: 'done',
              summary: '旧回答',
            },
            updatedAt: 2,
          },
        ],
        loadingStates: [],
        blockedByBlacklist: false,
        matchedRuleId: null,
        shouldExtract: false,
      }),
      connectStream: vi.fn(() => ({
        disconnect: vi.fn(),
        onMessage: {
          addListener: vi.fn((listener: (event: unknown) => void) => {
            portMessageListener = listener;
          }),
          removeListener: vi.fn(),
        },
      })),
    });

    render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

    await user.hover(await screen.findByTestId('chat-message-user-1'));
    await user.click(await screen.findByRole('button', { name: '编辑' }));
    await user.clear(screen.getByLabelText('编辑消息输入'));
    await user.type(screen.getByLabelText('编辑消息输入'), '新问题');
    await user.click(screen.getByRole('button', { name: '保存并重发' }));

    expect(api.editUserMessage).toHaveBeenCalledWith({
      tabId: 7,
      pageUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'user-1',
      text: '新问题',
    });
    expect(screen.getByText('新问题')).toBeVisible();

    portMessageListener?.({
      type: 'CHAT_STREAM_FINISHED',
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      sessionId: 'session-edit',
      messageId: 'assistant-edit',
      branchId: 'branch-edit-primary',
    });

    await user.hover(await screen.findByTestId('chat-message-assistant-edit'));
    const branchCard = await screen.findByTestId('branch-branch-edit-primary');
    await user.hover(branchCard);
    await waitFor(() => expect(within(branchCard).getByRole('button', { name: '重试回答' })).toBeVisible());

    await user.click(within(branchCard).getByRole('button', { name: '重试回答' }));
    expect(api.retryMessage).toHaveBeenCalledWith({
      tabId: 7,
      pageUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'assistant-edit',
      branchId: 'branch-edit-primary',
    });
  });

  it('快捷输入消息默认显示名称，编辑时展示真实提示词，编辑后展示编辑后的文本', async () => {
    const user = userEvent.setup();
    const api = createSidebarApi({
      getSidebarBootstrap: vi.fn().mockResolvedValue({
        type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
        browserTabId: 7,
        normalizedUrl: 'https://example.com/article',
        page: {
          id: 'https://example.com/article',
          url: 'https://example.com/article',
          normalizedUrl: 'https://example.com/article',
          title: '示例页面',
          faviconUrl: '',
          content: '提取内容',
          extractionMethod: 'readability',
          includePageContent: true,
          promptTabStates: [],
          createdAt: 1,
          updatedAt: 1,
          expiresAt: 2,
        },
        conversations: [
          {
            id: 'https://example.com/article:quick-summary',
            normalizedUrl: 'https://example.com/article',
            promptTabId: 'quick-summary',
            messages: [
              {
                id: 'user-quick-1',
                role: 'user',
                content: '请总结当前页面',
                displayContent: '总结',
                images: [],
                status: 'done',
                errorMessage: null,
                modelId: null,
                branches: [],
                retryFromMessageId: null,
                editedAt: null,
                createdAt: 1,
                updatedAt: 1,
              },
              {
                id: 'assistant-quick-1',
                role: 'assistant',
                content: '旧回答',
                images: [],
                status: 'done',
                errorMessage: null,
                modelId: 'model-1',
                branches: [],
                retryFromMessageId: null,
                editedAt: null,
                createdAt: 2,
                updatedAt: 2,
              },
            ],
            lastAssistantState: {
              messageId: 'assistant-quick-1',
              status: 'done',
              summary: '旧回答',
            },
            updatedAt: 2,
          },
        ],
        loadingStates: [],
        blockedByBlacklist: false,
        matchedRuleId: null,
        shouldExtract: false,
      }),
      getConfig: vi.fn().mockResolvedValue({
        type: 'GET_CONFIG_SUCCESS',
        config: createDefaultConfig({
          basic: {
            defaultModelId: 'model-1',
          },
          models: [
            {
              id: 'model-1',
              name: '主模型',
              provider: 'openai-compatible',
              enabled: true,
              model: 'gpt-4.1-mini',
              baseUrl: 'https://api.example.com',
              apiKey: 'token',
              deployment: '',
              temperature: 0,
              tools: [],
              thinkingBudget: null,
              maxOutputTokens: null,
              supportsImages: true,
              order: 0,
              deletedAt: null,
            },
          ],
          quickInputs: [
            {
              id: 'quick-summary',
              name: '总结',
              prompt: '请总结当前页面',
              autoTrigger: true,
              modelId: 'model-1',
              parallelModelIds: [],
              order: 0,
              deletedAt: null,
            },
          ],
        }),
      }),
    });

    render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

    await user.click(await screen.findByRole('tab', { name: /总结/ }));
    const summaryPanel = screen.getByRole('tabpanel', { name: /总结/ });
    expect(within(summaryPanel).getByText('总结')).toBeVisible();
    expect(within(summaryPanel).queryByText('请总结当前页面')).toBeNull();

    await user.hover(screen.getByTestId('chat-message-user-quick-1'));
    await user.click(screen.getByRole('button', { name: '编辑' }));
    expect(screen.getByLabelText('编辑消息输入')).toHaveValue('请总结当前页面');

    await user.clear(screen.getByLabelText('编辑消息输入'));
    await user.type(screen.getByLabelText('编辑消息输入'), '请总结当前页面并列出风险');
    await user.click(screen.getByRole('button', { name: '保存并重发' }));

    expect(api.editUserMessage).toHaveBeenCalledWith({
      tabId: 7,
      pageUrl: 'https://example.com/article',
      promptTabId: 'quick-summary',
      messageId: 'user-quick-1',
      text: '请总结当前页面并列出风险',
    });
    expect(within(summaryPanel).getByText('请总结当前页面并列出风险')).toBeVisible();
  });

  it('Readability 提取内容会按删除空行后的原始 Markdown 纯文本展示，并按同样内容复制', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const api = createSidebarApi({
      getSidebarBootstrap: vi.fn().mockResolvedValue({
        type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
        browserTabId: 7,
        normalizedUrl: 'https://example.com/article',
        page: {
          id: 'https://example.com/article',
          url: 'https://example.com/article',
          normalizedUrl: 'https://example.com/article',
          title: '示例页面',
          faviconUrl: '',
          content: '## 提取标题\n\n- 提取要点\n\n\n第二段',
          extractionMethod: 'readability',
          includePageContent: true,
          promptTabStates: [],
          createdAt: 1,
          updatedAt: 1,
          expiresAt: 2,
        },
        conversations: [],
        loadingStates: [],
        blockedByBlacklist: false,
        matchedRuleId: null,
        shouldExtract: false,
      }),
    });

    render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

    expect(await screen.findByTestId('sidebar-extraction-content')).toHaveTextContent('## 提取标题');
    expect(screen.getByTestId('sidebar-extraction-content')).toHaveTextContent('- 提取要点');
    expect(screen.getByTestId('sidebar-extraction-content')).toHaveTextContent('第二段');
    expect(screen.getByTestId('sidebar-extraction-content')).not.toHaveTextContent('\n\n');
    expect(screen.queryByRole('heading', { name: '提取标题' })).toBeNull();

    await user.click(screen.getByRole('button', { name: '复制提取内容' }));
    expect(writeText).toHaveBeenCalledWith('## 提取标题\n- 提取要点\n第二段');
  });
});
