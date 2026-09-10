import { EXTENSION_PAGES } from '../../src/shared/extension-pages';
import { buildLoadingStorageKey, buildPageStorageKey, CONFIG_STORAGE_KEY } from '../../src/shared/storage-keys';
import { expect, test } from './helpers/extension-fixture';

test('worker 重启后遗留的 loading 会被收敛为失败而不是永远生成中', async ({ context, extensionId }) => {
  const serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    throw new Error('未找到扩展 service worker');
  }

  const normalizedUrl = 'https://example.com/article';
  await serviceWorker.evaluate(async ({ configKey, pageKey, loadingKey, targetUrl }) => {
    await chrome.storage.local.set({
      [configKey]: {
        version: '2.0.0',
        updatedAt: 2,
        basic: {
          theme: 'system',
          language: 'zh-CN',
          defaultModelId: 'model-1',
          systemPrompt: '',
          filterCot: false,
          extractionMethod: 'readability',
          includePageContentByDefault: true,
        },
        models: [
          {
            id: 'model-1',
            name: '恢复测试模型',
            provider: 'openai-compatible',
            enabled: true,
            model: 'gpt-4.1-mini',
            baseUrl: 'https://api.example.com',
            apiKey: 'token',
            deployment: '',
            tools: [],
            thinkingBudget: null,
            supportsImages: false,
            order: 0,
            deletedAt: null,
          },
        ],
        quickInputs: [],
        sync: {
          enabled: false,
          provider: 'none',
          gistToken: '',
          gistId: '',
          webdavUrl: '',
          webdavUsername: '',
          webdavPassword: '',
          lastSyncAt: null,
        },
        blacklist: [],
      },
      [pageKey]: {
        id: targetUrl,
        url: targetUrl,
        normalizedUrl: targetUrl,
        title: 'Example Article',
        faviconUrl: '',
        content: '恢复测试正文',
        extractionMethod: 'readability',
        includePageContent: true,
        promptTabStates: [],
        createdAt: 1,
        updatedAt: 2,
        expiresAt: 3,
      },
      'conversation:https://example.com/article:chat': {
        id: 'https://example.com/article:chat',
        normalizedUrl: targetUrl,
        promptTabId: 'chat',
        messages: [
          {
            id: 'assistant-1',
            role: 'assistant',
            content: '恢复中的回答',
            images: [],
            status: 'loading',
            errorMessage: null,
            modelId: 'model-1',
            branches: [
              {
                id: 'branch-1',
                modelId: 'model-1',
                modelLabel: '恢复测试模型',
                isPrimary: true,
                content: '恢复中的回答',
                status: 'loading',
                errorMessage: null,
                createdAt: 1,
                updatedAt: 2,
              },
            ],
            selectedBranchId: 'branch-1',
            retryFromMessageId: null,
            editedAt: null,
            createdAt: 1,
            updatedAt: 2,
          },
        ],
        lastAssistantState: {
          messageId: 'assistant-1',
          status: 'loading',
          summary: '恢复中的回答',
        },
        updatedAt: 2,
      },
      [loadingKey]: {
        id: loadingKey,
        normalizedUrl: targetUrl,
        promptTabId: 'chat',
        sessionId: 'session-restore',
        promptTabStatus: 'loading',
        branchStates: [],
        resumeTarget: {
          messageId: 'assistant-1',
          branchId: 'branch-1',
        },
        cancelRequested: false,
        updatedAt: 2,
      },
    });
  }, {
    configKey: CONFIG_STORAGE_KEY,
    pageKey: buildPageStorageKey(normalizedUrl),
    loadingKey: buildLoadingStorageKey(normalizedUrl, 'chat'),
    targetUrl: normalizedUrl,
  });

  const sidepanel = await context.newPage();
  await sidepanel.goto(
    `chrome-extension://${extensionId}/${EXTENSION_PAGES.sidePanel}?tabId=7&pageUrl=${encodeURIComponent('https://example.com/article')}`,
  );

  await expect(sidepanel.getByTestId('sidebar-extraction-panel')).toContainText('恢复测试正文');
  const branchCard = sidepanel.getByTestId('branch-branch-1');
  await expect(branchCard).toContainText('恢复测试模型');
  // 重启后的 worker 里没有对应会话，持久化 loading 是孤儿：必须收敛为失败并告知用户，而不是恢复成无人收尾的“生成中”。
  await expect(branchCard).toContainText('后台服务已重启');
  await branchCard.hover();
  await expect(branchCard.getByRole('button', { name: '停止' })).toHaveCount(0);
  await expect(sidepanel.getByText('恢复生成中…')).toHaveCount(0);

  const persisted = await serviceWorker.evaluate(async ({ loadingKey, conversationKey }) => {
    const stored = await chrome.storage.local.get([loadingKey, conversationKey]);
    const conversation = stored[conversationKey] as {
      messages: Array<{ id: string; status: string; branches: Array<{ id: string; status: string; errorMessage: string | null }> }>;
    };
    return {
      hasLoading: loadingKey in stored,
      assistant: conversation.messages.find((message) => message.id === 'assistant-1') ?? null,
    };
  }, {
    loadingKey: buildLoadingStorageKey(normalizedUrl, 'chat'),
    conversationKey: 'conversation:https://example.com/article:chat',
  });
  expect(persisted.hasLoading).toBe(false);
  expect(persisted.assistant?.status).toBe('error');
  expect(persisted.assistant?.branches[0]).toMatchObject({ id: 'branch-1', status: 'error' });
  expect(persisted.assistant?.branches[0]?.errorMessage).toContain('后台服务已重启');
});
