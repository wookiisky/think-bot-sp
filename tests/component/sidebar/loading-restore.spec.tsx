import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultConfig } from '../../../src/domain/config/config-schema';
import { SidebarShell } from '../../../src/features/sidebar/sidebar-shell';

afterEach(() => {
  cleanup();
});

describe('SidebarShell loading restore', () => {
  it('重开 side panel 后展示恢复中的助手消息', async () => {
    const api = {
      getSidebarBootstrap: vi.fn().mockResolvedValue({
        type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
        browserTabId: 7,
        normalizedUrl: 'https://example.com/article',
        page: null,
        conversations: [
          {
            id: 'https://example.com/article:chat',
            normalizedUrl: 'https://example.com/article',
            promptTabId: 'chat',
            messages: [
              {
                id: 'assistant-1',
                role: 'assistant',
                content: '部分回答',
                images: [],
                status: 'loading',
                errorMessage: null,
                modelId: 'model-1',
                branches: [],
                retryFromMessageId: null,
                editedAt: null,
                createdAt: 1,
                updatedAt: 2,
              },
            ],
            lastAssistantState: {
              messageId: 'assistant-1',
              status: 'loading',
              summary: '部分回答',
            },
            updatedAt: 2,
          },
        ],
        loadingStates: [
          {
            id: 'loading:https://example.com/article:chat',
            normalizedUrl: 'https://example.com/article',
            promptTabId: 'chat',
            sessionId: 'session-1',
            promptTabStatus: 'loading',
            branchStates: [],
            resumeTarget: { messageId: 'assistant-1' },
            cancelRequested: false,
            updatedAt: 2,
          },
        ],
        blockedByBlacklist: false,
        matchedRuleId: null,
        shouldExtract: false,
      }),
      confirmBlacklistContinue: vi.fn(),
      reExtractContent: vi.fn(),
      switchExtractionMethod: vi.fn(),
      clearPageContext: vi.fn(),
      clearTabConversation: vi.fn(),
      openHistoryPage: vi.fn(),
      openSettingsPage: vi.fn(),
      openGithubProject: vi.fn(),
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
      sendChat: vi.fn(),
      editUserMessage: vi.fn(),
      retryUserMessage: vi.fn(),
      retryMessage: vi.fn(),
      selectAssistantBranch: vi.fn(),
      expandMessageBranches: vi.fn(),
      stopBranch: vi.fn(),
      deleteBranch: vi.fn(),
      stopSession: vi.fn(),
      exportConversation: vi.fn(),
      connectStream: vi.fn(() => ({
        disconnect: vi.fn(),
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      })),
    };

    render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

    expect(await screen.findByText('部分回答')).toBeVisible();
    const branchCard = screen.getByTestId('branch-assistant-1:primary');
    expect(branchCard).toHaveTextContent('部分回答');
    expect(within(branchCard).queryByRole('button', { name: '停止' })).not.toBeNull();
    expect(screen.queryByText('恢复生成中')).toBeNull();
  });

  it('存在快捷输入 loading 时优先打开对应 promptTab', async () => {
    const api = {
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
              promptTabId: 'quick-1',
              initializedAt: 1,
              lastAutoTriggerAt: 1,
              autoTriggerStatus: 'running',
              lastClearedAt: null,
            },
          ],
          createdAt: 1,
          updatedAt: 1,
          expiresAt: 2,
        },
        conversations: [
          {
            id: 'https://example.com/article:quick-1',
            normalizedUrl: 'https://example.com/article',
            promptTabId: 'quick-1',
            messages: [
              {
                id: 'assistant-quick-1',
                role: 'assistant',
                content: '快捷标签恢复内容',
                images: [],
                status: 'loading',
                errorMessage: null,
                modelId: 'model-1',
                branches: [],
                retryFromMessageId: null,
                editedAt: null,
                createdAt: 1,
                updatedAt: 2,
              },
            ],
            lastAssistantState: {
              messageId: 'assistant-quick-1',
              status: 'loading',
              summary: '快捷标签恢复内容',
            },
            updatedAt: 2,
          },
        ],
        loadingStates: [
          {
            id: 'loading:https://example.com/article:quick-1',
            normalizedUrl: 'https://example.com/article',
            promptTabId: 'quick-1',
            sessionId: 'session-quick-1',
            promptTabStatus: 'loading',
            branchStates: [],
            resumeTarget: { messageId: 'assistant-quick-1' },
            cancelRequested: false,
            updatedAt: 2,
          },
        ],
        blockedByBlacklist: false,
        matchedRuleId: null,
        shouldExtract: false,
      }),
      confirmBlacklistContinue: vi.fn(),
      reExtractContent: vi.fn(),
      switchExtractionMethod: vi.fn(),
      clearPageContext: vi.fn(),
      clearTabConversation: vi.fn(),
      openHistoryPage: vi.fn(),
      openSettingsPage: vi.fn(),
      openGithubProject: vi.fn(),
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
              id: 'quick-1',
              name: '问题拆解',
              prompt: '请拆解这个问题',
              autoTrigger: true,
              modelId: 'model-1',
              parallelModelIds: [],
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
      selectAssistantBranch: vi.fn(),
      expandMessageBranches: vi.fn(),
      stopBranch: vi.fn(),
      deleteBranch: vi.fn(),
      stopSession: vi.fn(),
      exportConversation: vi.fn(),
      connectStream: vi.fn(() => ({
        disconnect: vi.fn(),
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      })),
    };

    render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

    expect(await screen.findByText('快捷标签恢复内容')).toBeVisible();
    expect(screen.getByRole('tab', { name: /问题拆解/ })).toHaveAttribute('aria-selected', 'true');
    const branchCard = screen.getByTestId('branch-assistant-quick-1:primary');
    expect(branchCard).toHaveTextContent('快捷标签恢复内容');
    expect(within(branchCard).queryByRole('button', { name: '停止' })).not.toBeNull();
    expect(screen.queryByText('恢复生成中')).toBeNull();
  });
});
