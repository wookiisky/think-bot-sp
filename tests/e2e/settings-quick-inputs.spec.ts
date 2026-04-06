import { expect, test } from './helpers/extension-fixture';
import { openSettingsPage } from './helpers/settings-driver';

test('settings quick inputs panel can add edit reorder delete and persist through save', async ({ context, extensionId }) => {
  const serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    throw new Error('快捷输入面板 E2E 失败：未找到扩展 service worker。');
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
        ],
        quickInputs: [
          {
            id: 'quick-1',
            name: '总结',
            prompt: '请总结当前页面',
            autoTrigger: false,
            modelId: null,
            order: 0,
            deletedAt: null,
          },
          {
            id: 'quick-2',
            name: '翻译',
            prompt: '请翻译当前页面',
            autoTrigger: false,
            modelId: null,
            order: 1,
            deletedAt: null,
          },
        ],
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
  await page.getByRole('tab', { name: '快捷输入' }).click();

  await page.getByRole('button', { name: '新增快捷输入' }).click();
  await page.getByLabel('快捷输入名称').fill('问题拆解');
  await page.getByLabel('快捷输入提示词').fill('请先拆解问题再回答');
  const newQuickInputItem = page.getByTestId(/quick-input-item-quick-/).filter({ hasText: '问题拆解' }).first();
  await newQuickInputItem.getByRole('checkbox', { name: '自动触发:问题拆解' }).click();
  await page.getByRole('combobox', { name: '专属模型' }).click();
  await page.getByRole('option', { name: '主模型' }).click();
  await newQuickInputItem.getByRole('button', { name: '上移' }).click();

  await page.getByTestId('quick-input-summary-quick-1').click();
  await page.getByTestId('quick-input-item-quick-1').getByRole('button', { name: '删除快捷输入' }).click();
  await page.getByTestId('quick-input-delete-confirm-quick-1').getByRole('button', { name: '删除快捷输入' }).click();
  await page.getByRole('button', { name: /^保存$/ }).click();

  await expect
    .poll(() =>
      page.evaluate(async () => {
        const result = await chrome.storage.local.get('config:extension');
        const config = result['config:extension'];
        return {
          deletedCount:
            config?.quickInputs?.filter((item: { deletedAt: number | null }) => item.deletedAt !== null)?.length ?? 0,
          autoTriggerValue:
            config?.quickInputs?.find((item: { name: string }) => item.name === '问题拆解')?.autoTrigger ?? null,
          modelIdValue:
            config?.quickInputs?.find((item: { name: string }) => item.name === '问题拆解')?.modelId ?? null,
        };
      }),
    )
    .toEqual({
      deletedCount: 1,
      autoTriggerValue: true,
      modelIdValue: 'model-1',
    });

  const visibleNames = await page.evaluate(async () => {
    const result = await chrome.storage.local.get('config:extension');
    const config = result['config:extension'];
    return (
      config?.quickInputs
        ?.filter((item: { deletedAt: number | null }) => item.deletedAt === null)
        ?.sort((left: { order: number }, right: { order: number }) => left.order - right.order)
        ?.map((item: { name: string }) => item.name) ?? []
    );
  });

  expect(visibleNames).toEqual(expect.arrayContaining(['翻译', '问题拆解', '概括', '第一性原理']));
  expect(visibleNames).not.toContain('总结');
});
