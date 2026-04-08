import { EXTENSION_PAGES } from '../../src/shared/extension-pages';
import { CONFIG_STORAGE_KEY } from '../../src/shared/storage-keys';
import { expect, test } from './helpers/extension-fixture';

test.fixme('conversations 页分支预览层支持打开和遮罩关闭，且不会清空草稿', async ({ context, extensionId }) => {
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
          branchModelIds: ['model-2'],
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
          {
            id: 'model-2',
            name: '分支模型',
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
    (globalThis as typeof globalThis & {
      __THINK_BOT_TEST_STREAM__?: Array<string>;
    }).__THINK_BOT_TEST_STREAM__ = ['历史分支预览测试响应'];
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

  await expect(sidepanel.getByLabel('聊天输入')).toBeEnabled({ timeout: 20_000 });
  await sidepanel.getByLabel('聊天输入').fill('先写入历史');
  await sidepanel.getByRole('button', { name: '发送' }).click();
  await expect(sidepanel.getByText('历史分支预览测试响应')).toBeVisible();

  await sidepanel.locator('[data-testid^="chat-message-"]').filter({ hasText: '历史分支预览测试响应' }).first().hover();
  await sidepanel.getByRole('button', { name: '继续新增分支' }).click();
  await sidepanel.getByRole('button', { name: '分支模型' }).click();
  const branchCard = sidepanel.locator('[data-testid^="branch-"]').filter({ hasText: '分支模型' }).first();
  await expect(branchCard).toBeVisible({ timeout: 20_000 });

  const conversations = await context.newPage();
  await conversations.goto(`chrome-extension://${extensionId}/${EXTENSION_PAGES.conversations}`);

  await expect(conversations.getByTestId('conversations-shell')).toBeVisible({ timeout: 20_000 });
  await expect(conversations.getByRole('button', { name: /Example Domain/ })).toBeVisible({ timeout: 20_000 });
  const historyBranchCard = conversations.locator('[data-testid^="branch-"]').filter({ hasText: '分支模型' }).first();
  await expect(historyBranchCard).toBeVisible({ timeout: 20_000 });

  await conversations.getByLabel('聊天输入').fill('历史页草稿');
  await historyBranchCard.hover();
  await conversations.getByRole('button', { name: '打开分支预览' }).click();

  await expect(conversations.getByTestId('branch-preview-dialog')).toBeVisible();
  await expect(conversations.getByTestId('branch-preview-content')).toContainText('历史分支预览测试响应');

  await conversations.getByTestId('branch-preview-overlay').click({ position: { x: 8, y: 8 } });

  await expect(conversations.getByTestId('branch-preview-dialog')).toHaveCount(0);
  await expect(conversations.getByLabel('聊天输入')).toHaveValue('历史页草稿');
  await expect(conversations.getByRole('tab', { name: '聊天' })).toHaveAttribute('aria-selected', 'true');
});
