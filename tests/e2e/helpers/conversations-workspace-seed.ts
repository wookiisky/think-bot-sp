import type { Worker } from '@playwright/test';

import { createDefaultConfig } from '../../../src/domain/config/config-schema';
import { buildConversationKey, conversationRecordSchema } from '../../../src/domain/conversation/conversation-schema';
import { buildPageRecord, pageRecordSchema } from '../../../src/domain/page/page-schema';
import { buildConversationStorageKey, buildPageStorageKey, CONFIG_STORAGE_KEY } from '../../../src/shared/storage-keys';

/** 两个页面的标题和 URL 均不含正文搜索词，确保搜索覆盖实际正文。 */
export const HISTORY_PAGES = [
  { url: 'https://history.example.test/alpha', title: '第一篇历史页面', content: '第一篇正文包含独有的星际帆船线索。', answer: '第一篇已有回答' },
  { url: 'https://history.example.test/beta', title: '第二篇历史页面', content: '第二篇正文讨论山间植物。', answer: '第二篇已有回答' },
] as const;

/** 用正式 schema 构造历史记录，直接写入真实扩展存储，避免引入网页提取依赖。 */
export const seedConversationsWorkspace = async (worker: Worker) => {
  const now = Date.now();
  const config = createDefaultConfig({
    basic: { defaultModelId: 'history-model', language: 'zh-CN' },
    models: [{
      id: 'history-model', name: '历史测试模型', provider: 'openai-compatible', enabled: true,
      model: 'test-model', baseUrl: 'https://model.example.test/v1', apiKey: 'test-token',
      deployment: '', tools: [], thinkingBudget: null, supportsImages: false, order: 0, deletedAt: null,
    }],
    quickInputs: [],
    blacklist: [],
  });
  const records: Record<string, unknown> = { [CONFIG_STORAGE_KEY]: config };

  for (const [index, seed] of HISTORY_PAGES.entries()) {
    const updatedAt = now - index * 1000;
    const page = pageRecordSchema.parse({
      ...buildPageRecord({ url: seed.url, now: updatedAt }),
      title: seed.title,
      content: seed.content,
      extractionCaches: { readability: { content: seed.content, updatedAt } },
    });
    const conversation = conversationRecordSchema.parse({
      id: buildConversationKey(seed.url, 'chat'), normalizedUrl: seed.url, promptTabId: 'chat',
      messages: [{
        id: `history-assistant-${index}`, role: 'assistant', content: seed.answer, images: [],
        status: 'done', modelId: 'history-model',
        branches: [{
          id: `history-branch-${index}`, modelId: 'history-model', modelLabel: '历史测试模型',
          isPrimary: true, content: seed.answer, status: 'done', errorMessage: null,
          createdAt: updatedAt, updatedAt,
        }],
        selectedBranchId: `history-branch-${index}`, retryFromMessageId: null, editedAt: null,
        createdAt: updatedAt, updatedAt,
      }],
      lastAssistantState: { messageId: `history-assistant-${index}`, status: 'done', summary: seed.answer },
      updatedAt,
    });
    records[buildPageStorageKey(seed.url)] = page;
    records[buildConversationStorageKey(seed.url, 'chat')] = conversation;
  }

  await worker.evaluate(async (stored) => {
    await chrome.storage.local.set(stored);
  }, records);
};
