import { describe, expect, it } from 'vitest';

import { createConversationExporter } from '../../../src/services/export/conversation-exporter';

describe('conversation-exporter', () => {
  it('导出 Markdown 时包含页面信息、消息内容和分支', async () => {
    const exporter = createConversationExporter({
      pageRepository: {
        getPage: async () => ({
          id: 'https://example.com/article',
          url: 'https://example.com/article',
          normalizedUrl: 'https://example.com/article',
          title: 'Example Domain / Deep Dive',
          faviconUrl: '',
          content: '页面内容',
          extractionMethod: 'readability',
          includePageContent: true,
          promptTabStates: [],
          createdAt: 1,
          updatedAt: 1,
          expiresAt: 2,
        }),
      },
      conversationRepository: {
        getConversation: async () => ({
          id: 'https://example.com/article:quick-summary',
          normalizedUrl: 'https://example.com/article',
          promptTabId: 'quick-summary',
          messages: [
            {
              id: 'user-1',
              role: 'user',
              content: '请总结',
              images: [],
              status: 'done',
              errorMessage: null,
              modelId: null,
              branches: [],
              selectedBranchId: null,
              retryFromMessageId: null,
              editedAt: null,
              createdAt: 1,
              updatedAt: 1,
            },
            {
              id: 'assistant-1',
              role: 'assistant',
              content: '主回答',
              images: [],
              status: 'done',
              errorMessage: null,
              modelId: 'model-1',
              branches: [
                {
                  id: 'branch-1',
                  modelId: 'model-2',
                  modelLabel: '备用模型',
                  isPrimary: false,
                  content: '分支回答',
                  status: 'done',
                  errorMessage: null,
                  createdAt: 2,
                  updatedAt: 2,
                },
              ],
              selectedBranchId: null,
              retryFromMessageId: null,
              editedAt: null,
              createdAt: 2,
              updatedAt: 2,
            },
          ],
          lastAssistantState: {
            messageId: 'assistant-1',
            status: 'done',
            summary: '主回答',
          },
          updatedAt: 2,
        }),
      },
      configRepository: {
        getConfig: async () => ({
          basic: {
            systemPrompt: '你是一个严谨的助手',
          },
        }),
      },
      now: () => new Date('2026-04-04T10:00:00.000Z'),
    });

    const exported = await exporter.exportConversation({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'quick-summary',
    });

    expect(exported.type).toBe('EXPORT_CONVERSATION_SUCCESS');
    expect(exported.payload.filename).toBe('think-bot-sp-Example-Domain-Deep-Dive-quick-summary-2026-04-04.md');
    expect(exported.payload.content).toContain('# Think Bot Conversation Export');
    expect(exported.payload.content).toContain('- 页面标题：Example Domain / Deep Dive');
    expect(exported.payload.content).toContain('- Prompt Tab：quick-summary');
    expect(exported.payload.content).toContain('## System Prompt');
    expect(exported.payload.content).toContain('你是一个严谨的助手');
    expect(exported.payload.content).toContain('## 1. 用户 | done');
    expect(exported.payload.content).toContain('## 2. 助手 | done');
    expect(exported.payload.content).toContain('### 分支 1 | 备用模型 | done');
    expect(exported.payload.content).toContain('分支回答');
  });

  it('空会话不会导出文件', async () => {
    const exporter = createConversationExporter({
      pageRepository: {
        getPage: async () => null,
      },
      conversationRepository: {
        getConversation: async () => ({
          id: 'https://example.com/article:chat',
          normalizedUrl: 'https://example.com/article',
          promptTabId: 'chat',
          messages: [
            {
              id: 'assistant-1',
              role: 'assistant',
              content: '',
              images: [],
              status: 'done',
              errorMessage: null,
              modelId: 'model-1',
              branches: [],
              selectedBranchId: null,
              retryFromMessageId: null,
              editedAt: null,
              createdAt: 1,
              updatedAt: 1,
            },
          ],
          lastAssistantState: {
            messageId: 'assistant-1',
            status: 'done',
            summary: '',
          },
          updatedAt: 1,
        }),
      },
      configRepository: {
        getConfig: async () => ({
          basic: {
            systemPrompt: '',
          },
        }),
      },
    });

    await expect(
      exporter.exportConversation({
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
      }),
    ).rejects.toThrow('conversation is empty');
  });
});
