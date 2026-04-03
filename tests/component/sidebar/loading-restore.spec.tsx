import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createDefaultConfig } from '../../../src/domain/config/config-schema';
import { SidebarShell } from '../../../src/features/sidebar/sidebar-shell';

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
    expect(screen.getByText('恢复生成中…')).toBeVisible();
  });
});
