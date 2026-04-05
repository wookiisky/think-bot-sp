import { expect, test } from './helpers/extension-fixture';
import { openSettingsPage } from './helpers/settings-driver';

test('settings models panel can add copy delete and persist through save', async ({ context, extensionId }) => {
  const serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    throw new Error('模型面板 E2E 失败：未找到扩展 service worker。');
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
          defaultModelId: 'model-1',
          systemPrompt: '',
          filterCot: false,
          extractionMethod: 'readability',
          includePageContentByDefault: true,
        },
        models: [
          {
            id: 'model-1',
            name: '主模型',
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
            name: '备用模型',
            provider: 'gemini',
            enabled: true,
            model: 'gemini-2.5-flash',
            baseUrl: '',
            apiKey: 'gemini-key',
            deployment: '',
            temperature: 0.4,
            tools: [],
            thinkingBudget: null,
            maxOutputTokens: null,
            supportsImages: true,
            order: 1,
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
    });
  });

  const page = await openSettingsPage({ context, extensionId });
  await page.getByRole('tab', { name: '语言模型' }).click();

  await page.getByRole('button', { name: '新增模型' }).click();
  await expect(page.getByTestId(/language-model-item-model-/).filter({ hasText: '新模型' }).first()).toBeVisible();
  await page.getByLabel('模型名称').fill('新模型');
  await page.getByLabel('Model').fill('gpt-4.1-mini');
  await page.getByLabel('Base URL').fill('https://api.new-model.example.com');
  await page.getByLabel('API Key').fill('new-secret');

  await page.getByTestId('language-model-summary-model-1').click();
  await page.getByRole('button', { name: '复制模型' }).click();
  await expect(page.getByTestId(/language-model-summary-model-/).filter({ hasText: '主模型 副本' }).first()).toBeVisible();

  await page.getByTestId('language-model-summary-model-1').click();
  await page.getByTestId('language-model-item-model-1').getByRole('button', { name: '删除模型' }).click();
  await page.getByTestId('language-model-summary-model-2').click();
  await page.getByRole('button', { name: /^保存$/ }).click();

  await expect
    .poll(() =>
      page.evaluate(async () => {
        const result = await chrome.storage.local.get('config:extension');
        const config = result['config:extension'];
        return {
          defaultModelId: config ? config.basic.defaultModelId : 'missing',
          deletedModels: config?.models?.filter((item: { deletedAt: number | null }) => item.deletedAt !== null).length ?? 0,
          copiedModels: config?.models?.filter((item: { name: string }) => item.name === '主模型 副本').length ?? 0,
          newModels: config?.models?.filter((item: { name: string }) => item.name === '新模型').length ?? 0,
        };
      }),
    )
    .toEqual({
      defaultModelId: null,
      deletedModels: 1,
      copiedModels: 1,
      newModels: 1,
    });
});
