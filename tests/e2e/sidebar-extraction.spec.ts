import { EXTENSION_PAGES } from '../../src/shared/extension-pages';
import { CONFIG_STORAGE_KEY } from '../../src/shared/storage-keys';
import { expect, test } from './helpers/extension-fixture';

test('side panel 先恢复 bootstrap，再在放行后进入提取', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto('https://example.com/');
  await page.bringToFront();

  const serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    throw new Error('未找到扩展 service worker。');
  }

  const tab = await serviceWorker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (!tab?.id || !tab.url) {
      throw new Error('未找到当前活动 browserTab');
    }
    return {
      id: tab.id,
      url: tab.url,
    };
  });

  await serviceWorker.evaluate(async ({ storageKey }) => {
    await chrome.storage.local.set({
      [storageKey]: {
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
        models: [],
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
        blacklist: [
          { id: 'example', type: 'domain', pattern: 'example.com', enabled: true, deletedAt: null },
        ],
      },
    });
  }, {
    storageKey: CONFIG_STORAGE_KEY,
  });

  const sidepanel = await context.newPage();
  await sidepanel.goto(
    `chrome-extension://${extensionId}/${EXTENSION_PAGES.sidePanel}?tabId=${tab.id}&pageUrl=${encodeURIComponent(page.url())}`,
  );

  await expect(sidepanel.getByText('当前页面命中黑名单')).toBeVisible();
  await expect(sidepanel.getByTestId('sidebar-extraction-panel')).toContainText('等待放行');

  await sidepanel.getByRole('button', { name: '继续提取' }).click();

  await expect(sidepanel.getByTestId('sidebar-extraction-panel')).toContainText('Example Domain');
  await expect(sidepanel.getByRole('button', { name: 'Readability' })).toHaveAttribute('aria-pressed', 'true');
});
