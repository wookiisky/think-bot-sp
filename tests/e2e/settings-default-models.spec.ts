import { expect, test } from './helpers/extension-fixture';
import { openSettingsPage } from './helpers/settings-driver';

test('settings default model selector only shows enabled and complete models', async ({ context, extensionId }) => {
  const serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    throw new Error('默认模型候选 E2E 失败：未找到扩展 service worker。');
  }

  await serviceWorker.evaluate(async () => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({
      'config:extension': {
        version: '2.0.0',
        updatedAt: Date.now(),
        basic: {
          theme: 'system',
          language: 'zh-CN',
          defaultModelId: null,
          systemPrompt: '',
          filterCot: false,
          extractionMethod: 'readability',
          includePageContentByDefault: true,
        },
        models: [
          {
            id: 'model-1',
            name: '可用模型',
            provider: 'openai-compatible',
            enabled: true,
            model: 'gpt-4o-mini',
            baseUrl: 'https://api.example.com',
            apiKey: 'secret',
            deployment: '',
            temperature: 0.2,
            tools: [],
            thinkingBudget: null,
            maxOutputTokens: null,
            supportsImages: false,
            order: 0,
            deletedAt: null,
          },
          {
            id: 'model-2',
            name: '禁用模型',
            provider: 'openai-compatible',
            enabled: false,
            model: 'gpt-4o-mini',
            baseUrl: 'https://api.example.com',
            apiKey: 'secret',
            deployment: '',
            temperature: 0.2,
            tools: [],
            thinkingBudget: null,
            maxOutputTokens: null,
            supportsImages: false,
            order: 1,
            deletedAt: null,
          },
          {
            id: 'model-3',
            name: '已删除模型',
            provider: 'openai-compatible',
            enabled: true,
            model: 'gpt-4o-mini',
            baseUrl: 'https://api.example.com',
            apiKey: 'secret',
            deployment: '',
            temperature: 0.2,
            tools: [],
            thinkingBudget: null,
            maxOutputTokens: null,
            supportsImages: false,
            order: 2,
            deletedAt: Date.now(),
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
    });
  });

  const page = await openSettingsPage({ context, extensionId });
  await page.getByRole('combobox', { name: '默认模型' }).click();

  await expect(page.getByRole('option', { name: '可用模型' })).toBeVisible();
  await expect(page.getByRole('option', { name: '不设置默认模型' })).toBeVisible();
  await expect(page.getByRole('option', { name: '禁用模型' })).toHaveCount(0);
  await expect(page.getByRole('option', { name: '已删除模型' })).toHaveCount(0);
});
