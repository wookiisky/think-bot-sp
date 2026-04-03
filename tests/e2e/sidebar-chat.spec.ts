import { EXTENSION_PAGES } from '../../src/shared/extension-pages';
import { CONFIG_STORAGE_KEY } from '../../src/shared/storage-keys';
import { expect, test } from './helpers/extension-fixture';

test('side panel 可以发送消息、收到首包流式并在完成后写入历史', async ({ context, extensionId }) => {
  const serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    throw new Error('未找到扩展 service worker');
  }

  await serviceWorker.evaluate(async ({ storageKey }) => {
    await chrome.storage.local.set({
      [storageKey]: {
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
            name: '测试模型',
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
    (globalThis as typeof globalThis & {
      __THINK_BOT_TEST_STREAM__?: Array<string>;
    }).__THINK_BOT_TEST_STREAM__ = ['你好', '，这是测试响应'];
  }, {
    storageKey: CONFIG_STORAGE_KEY,
  });

  const page = await context.newPage();
  await page.goto('https://example.com/');
  await page.bringToFront();

  const tab = await serviceWorker.evaluate(async () => {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (!activeTab?.id || !activeTab.url) {
      throw new Error('未找到当前活动 browserTab');
    }
    return {
      id: activeTab.id,
      url: activeTab.url,
    };
  });

  const sidepanel = await context.newPage();
  await sidepanel.goto(
    `chrome-extension://${extensionId}/${EXTENSION_PAGES.sidePanel}?tabId=${tab.id}&pageUrl=${encodeURIComponent(tab.url)}`,
  );

  await expect(sidepanel.getByLabel('聊天输入')).toBeEnabled();
  await sidepanel.getByLabel('聊天输入').fill('请总结当前页面');
  await sidepanel.getByRole('button', { name: '发送' }).click();

  await expect(sidepanel.getByText('你好')).toBeVisible();
  await expect(sidepanel.getByText('你好，这是测试响应')).toBeVisible();

  await sidepanel.close();

  const reopened = await context.newPage();
  await reopened.goto(
    `chrome-extension://${extensionId}/${EXTENSION_PAGES.sidePanel}?tabId=${tab.id}&pageUrl=${encodeURIComponent(tab.url)}`,
  );
  await expect(reopened.getByText('你好，这是测试响应')).toBeVisible();
});
