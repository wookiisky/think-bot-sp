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
    },
  }),
  editUserMessage: vi.fn().mockResolvedValue({
    type: 'EDIT_USER_MESSAGE_SUCCESS',
    payload: {
      editedMessageId: 'user-1',
      messageId: 'assistant-edit',
      sessionId: 'session-edit',
    },
  }),
  retryUserMessage: vi.fn().mockResolvedValue({
    type: 'RETRY_USER_MESSAGE_SUCCESS',
    payload: {
      retriedMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      branchId: 'branch-user-retry',
      modelId: 'model-1',
      modelLabel: '主模型',
      sessionId: 'session-user-retry',
    },
  }),
  retryMessage: vi.fn().mockResolvedValue({
    type: 'RETRY_MESSAGE_SUCCESS',
    payload: {
      replacedMessageId: 'assistant-1',
      messageId: 'assistant-retry',
      sessionId: 'session-retry',
    },
  }),
  expandMessageBranches: vi.fn().mockResolvedValue({
    type: 'EXPAND_MESSAGE_BRANCHES_SUCCESS',
    payload: {
      messageId: 'assistant-1',
      branchIds: ['branch-1'],
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
    expect(screen.getByTestId('sidebar-extraction-panel')).toBeVisible();
    expect(screen.getByRole('tab', { name: '聊天' })).toBeVisible();
    expect(await screen.findByText('提取内容')).toBeVisible();
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

    fireEvent.pointerDown(screen.getByTestId('sidebar-extraction-resize-handle'), {
      clientY: 200,
    });
    fireEvent.pointerMove(window, {
      clientY: 260,
    });
    fireEvent.pointerUp(window);

    expect(extractionPanel).toHaveStyle({ height: '340px' });
  });

  it('黑名单命中时先显示确认层，不自动提取', async () => {
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
    expect(api.reExtractContent).not.toHaveBeenCalled();
  });

  it('页面级动作不会破坏当前输入草稿，并支持复制和页面跳转入口', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
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
    expect(screen.getByText('已复制提取内容')).toBeVisible();

    await user.click(screen.getByRole('button', { name: '打开历史页' }));
    await user.click(screen.getByRole('button', { name: '打开设置页' }));
    await user.click(screen.getByRole('button', { name: '打开 GitHub' }));
    expect(api.openHistoryPage).toHaveBeenCalledTimes(1);
    expect(api.openSettingsPage).toHaveBeenCalledTimes(1);
    expect(api.openGithubProject).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '清空当前页面数据' }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(api.clearPageContext).toHaveBeenCalledWith({
      tabId: 7,
      pageUrl: 'https://example.com/article',
    });
    expect(screen.getAllByText('还没有聊天记录').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('聊天输入')).toHaveValue('保留这段草稿');
    expect(screen.getByText('已清空当前页面数据')).toBeVisible();
    confirmSpy.mockRestore();
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
              order: 0,
              deletedAt: null,
            },
            {
              id: 'quick-translate',
              name: '翻译',
              prompt: '请翻译当前页面',
              autoTrigger: false,
              modelId: 'missing-model',
              order: 1,
              deletedAt: null,
            },
            {
              id: 'quick-hidden',
              name: '隐藏标签',
              prompt: '不应展示',
              autoTrigger: false,
              modelId: null,
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
    });
    expect(within(screen.getByRole('tabpanel', { name: /翻译/ })).getByText('翻译')).toBeVisible();
    expect(screen.getByLabelText('聊天输入')).toHaveValue('');
    expect(screen.getByLabelText('选择模型')).toHaveValue('model-1');

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
      }),
    );

    await user.click(screen.getByRole('tab', { name: /总结/ }));
    expect(within(screen.getByRole('tabpanel', { name: /总结/ })).getByText('总结')).toBeVisible();
  });

  it('清空当前标签只影响当前 promptTab，会保留提取内容和其他标签历史', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
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

    expect(confirmSpy).toHaveBeenCalled();
    expect(api.clearTabConversation).toHaveBeenCalledWith({
      tabId: 7,
      pageUrl: 'https://example.com/article',
      promptTabId: 'quick-summary',
    });
    expect(screen.getByTestId('sidebar-extraction-panel')).toHaveTextContent('提取内容');
    expect(screen.getByText('已清空当前标签聊天记录')).toBeVisible();
    expect(screen.getByText('还没有聊天记录')).toBeVisible();

    await user.click(screen.getByRole('tab', { name: /聊天/ }));
    expect(screen.getByText('Chat 历史回答')).toBeVisible();
    confirmSpy.mockRestore();
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
    let portMessageListener: ((event: unknown) => void) | null = null;
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

    await user.click(await screen.findByRole('button', { name: '继续新增分支' }));
    expect(api.expandMessageBranches).toHaveBeenCalledWith({
      tabId: 7,
      pageUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'assistant-1',
    });

    portMessageListener?.({
      type: 'BRANCH_STREAM_STARTED',
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      sessionId: 'branch-session-1',
      messageId: 'assistant-1',
      branchId: 'branch-1',
      modelId: 'model-2',
      modelLabel: '分支模型',
    });
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

    await user.click(screen.getByRole('button', { name: '停止分支' }));
    expect(api.stopBranch).toHaveBeenCalledWith({
      tabId: 7,
      pageUrl: 'https://example.com/article',
      promptTabId: 'chat',
      branchId: 'branch-1',
    });

    await user.click(screen.getByRole('button', { name: '删除分支' }));
    expect(api.deleteBranch).toHaveBeenCalledWith({
      tabId: 7,
      pageUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'assistant-1',
      branchId: 'branch-1',
    });
    await waitFor(() => expect(screen.queryByTestId('branch-branch-1')).toBeNull());
  });

  it('支持编辑用户消息并重发，也支持重试助手消息替换旧结果', async () => {
    const user = userEvent.setup();
    let portMessageListener: ((event: unknown) => void) | null = null;
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
    });

    await waitFor(() => expect(screen.getByRole('button', { name: '重试回答' })).toBeVisible());

    await user.click(screen.getByRole('button', { name: '重试回答' }));
    expect(api.retryMessage).toHaveBeenCalledWith({
      tabId: 7,
      pageUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'assistant-edit',
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
});
