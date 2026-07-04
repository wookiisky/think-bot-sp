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
          extractionCaches: {
            readability: {
              content: '页面内容',
              updatedAt: 1,
            },
          },
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
                  durationMs: null,
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
          models: [
            {
              id: 'model-1',
              name: '主模型',
            },
            {
              id: 'model-2',
              name: '备用模型',
            },
          ],
          quickInputs: [
            {
              id: 'quick-summary',
              name: '快速总结',
            },
          ],
        }),
      },
      now: () => new Date(2026, 3, 4, 10, 0, 0),
    });

    const exported = await exporter.exportConversation({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'quick-summary',
    });

    expect(exported.type).toBe('EXPORT_CONVERSATION_SUCCESS');
    expect(exported.payload.filename).toBe('Example-Domain-Deep-Dive--快速总结--2026_04_04_10_00_00.md');
    expect(exported.payload.content).toContain('# Think Bot Conversation Export');
    expect(exported.payload.content).toContain('- 页面标题：Example Domain / Deep Dive');
    expect(exported.payload.content).toContain('- Prompt Tab：快速总结');
    expect(exported.payload.content).toContain('## System Prompt');
    expect(exported.payload.content).toContain('你是一个严谨的助手');
    expect(exported.payload.content).toContain('## 1. 用户');
    expect(exported.payload.content).toContain('## 2. 助手');
    expect(exported.payload.content).toContain('模型：主模型');
    expect(exported.payload.content).not.toContain('## 1. 用户 | done');
    expect(exported.payload.content).not.toContain('## 2. 助手 | done');
    expect(exported.payload.content).toContain('### 分支 1 | 备用模型 | done');
    expect(exported.payload.content).toContain('分支回答');
  });

  it('导出 chat 标签时使用 Chat 作为 Prompt Tab 名称', async () => {
    const exporter = createConversationExporter({
      pageRepository: {
        getPage: async () => ({
          id: 'https://example.com/chat',
          url: 'https://example.com/chat',
          normalizedUrl: 'https://example.com/chat',
          title: 'Chat Page',
          faviconUrl: '',
          content: '页面内容',
          extractionMethod: 'readability',
          extractionCaches: {},
          includePageContent: true,
          promptTabStates: [],
          createdAt: 1,
          updatedAt: 1,
          expiresAt: 2,
        }),
      },
      conversationRepository: {
        getConversation: async () => ({
          id: 'https://example.com/chat:chat',
          normalizedUrl: 'https://example.com/chat',
          promptTabId: 'chat',
          messages: [
            {
              id: 'user-1',
              role: 'user',
              content: '你好',
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
          ],
          lastAssistantState: null,
          updatedAt: 1,
        }),
      },
      configRepository: {
        getConfig: async () => ({
          basic: {
            systemPrompt: '   \n\t  ',
          },
          models: [],
          quickInputs: [],
        }),
      },
      now: () => new Date(2026, 0, 2, 3, 4, 5),
    });

    const exported = await exporter.exportConversation({
      normalizedUrl: 'https://example.com/chat',
      promptTabId: 'chat',
    });

    expect(exported.payload.filename).toBe('Chat-Page--Chat--2026_01_02_03_04_05.md');
    expect(exported.payload.content).toContain('- Prompt Tab：Chat');
    expect(exported.payload.content).toContain('## System Prompt');
    expect(exported.payload.content).not.toContain('（空）');
  });

  it('历史数据找不到显示名时回退到 promptTabId 和 modelId', async () => {
    const exporter = createConversationExporter({
      pageRepository: {
        getPage: async () => null,
      },
      conversationRepository: {
        getConversation: async () => ({
          id: 'https://example.com/article:legacy-tab',
          normalizedUrl: 'https://example.com/article',
          promptTabId: 'legacy-tab',
          messages: [
            {
              id: 'assistant-1',
              role: 'assistant',
              content: '旧回答',
              images: [],
              status: 'error',
              errorMessage: '旧模型失败',
              modelId: 'legacy-model',
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
            status: 'error',
            summary: '旧模型失败',
          },
          updatedAt: 1,
        }),
      },
      configRepository: {
        getConfig: async () => ({
          basic: {
            systemPrompt: '',
          },
          models: [],
          quickInputs: [],
        }),
      },
      now: () => new Date(2026, 5, 6, 7, 8, 9),
    });

    const exported = await exporter.exportConversation({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'legacy-tab',
    });

    expect(exported.payload.filename).toBe('https-example.com-article--legacy-tab--2026_06_06_07_08_09.md');
    expect(exported.payload.content).toContain('- Prompt Tab：legacy-tab');
    expect(exported.payload.content).toContain('## 1. 助手');
    expect(exported.payload.content).toContain('状态：error');
    expect(exported.payload.content).toContain('模型：legacy-model');
    expect(exported.payload.content).not.toContain('## 1. 助手 | error');
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
          models: [],
          quickInputs: [],
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
