import { EXTENSION_PAGES } from '../../src/shared/extension-pages';
import { expect, test } from './helpers/extension-fixture';
import {
  activateBrowserTab,
  getActiveBrowserTabId,
  getBrowserTabIdForUrl,
  getSidePanelOptionsForTab,
  openBrowserActionForTab,
} from './helpers/browser-entry-driver';

test('普通网页通过 __E2E_BROWSER_ACTION_CLICK__ 协议打开 side panel', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto('https://example.com/');
  const driverPage = await context.newPage();

  await expect(
    openBrowserActionForTab({ context, extensionId, page, driverPage }),
  ).resolves.toEqual({
    kind: 'sidepanel-opened',
    tabId: expect.any(Number),
  });
  await driverPage.close();
});

test('浏览器内部页通过 __E2E_BROWSER_ACTION_CLICK__ 协议退化到 conversations', async ({ context, extensionId }) => {
  const restricted = await context.newPage();
  await restricted.goto('chrome://extensions');
  const driverPage = await context.newPage();
  const restrictedTabId = await getActiveBrowserTabId({ context });

  await expect.poll(
    async () => getSidePanelOptionsForTab({ context, tabId: restrictedTabId }),
    {
      timeout: 5000,
      message: '浏览器内部页必须禁用 side panel，避免真实扩展按钮先打开侧边栏',
    },
  ).toMatchObject({
    enabled: false,
  });

  await expect(
    openBrowserActionForTab({ context, extensionId, page: restricted, driverPage }),
  ).resolves.toEqual({
    kind: 'conversations-opened',
    url: `chrome-extension://${extensionId}/${EXTENSION_PAGES.conversations}`,
  });

  await driverPage.close();
});

test('从浏览器内部页切回普通网页后会恢复 side panel 预配置', async ({ context }) => {
  const restricted = await context.newPage();
  await restricted.goto('chrome://extensions');
  const restrictedTabId = await getActiveBrowserTabId({ context });

  await expect.poll(
    async () => getSidePanelOptionsForTab({ context, tabId: restrictedTabId }),
    {
      timeout: 5000,
      message: '浏览器内部页应关闭 side panel 配置',
    },
  ).toMatchObject({
    enabled: false,
  });

  const page = await context.newPage();
  await page.goto('https://example.com/');
  const pageTabId = await getBrowserTabIdForUrl({
    context,
    url: page.url(),
  });
  await activateBrowserTab({
    context,
    tabId: pageTabId,
  });

  await expect.poll(
    async () => getSidePanelOptionsForTab({ context, tabId: pageTabId }),
    {
      timeout: 5000,
      message: '普通网页应恢复 side panel 预配置，保证下一次真实点击可打开',
    },
  ).toMatchObject({
    enabled: true,
    path: 'sidebar.html',
  });
});

test('conversations 页通过 __E2E_BROWSER_ACTION_CLICK__ 协议继续进入设置页', async ({ context, extensionId }) => {
  const conversations = await context.newPage();
  await conversations.goto(`chrome-extension://${extensionId}/${EXTENSION_PAGES.conversations}`);
  const driverPage = await context.newPage();

  await expect(
    openBrowserActionForTab({ context, extensionId, page: conversations, driverPage }),
  ).resolves.toEqual({
    kind: 'options-opened',
    url: `chrome-extension://${extensionId}/${EXTENSION_PAGES.options}`,
  });

  await driverPage.close();
});

test('browserTab 切换后会为当前活动页预配置 side panel，保证下一次点击可直接打开', async ({ context, extensionId }) => {
  const pageA = await context.newPage();
  await pageA.goto('https://example.com/');

  const driverPage = await context.newPage();
  const tabAId = await getBrowserTabIdForUrl({
    context,
    url: pageA.url(),
  });

  await expect(
    openBrowserActionForTab({ context, extensionId, page: pageA, driverPage }),
  ).resolves.toMatchObject({
    kind: 'sidepanel-opened',
  });

  await expect(getSidePanelOptionsForTab({ context, tabId: tabAId })).resolves.toMatchObject({
    enabled: true,
    path: 'sidebar.html',
  });

  const pageB = await context.newPage();
  await pageB.goto('https://example.org/');
  const tabBId = await getBrowserTabIdForUrl({
    context,
    url: pageB.url(),
  });
  await activateBrowserTab({
    context,
    tabId: tabBId,
  });

  await expect.poll(
    async () => getSidePanelOptionsForTab({ context, tabId: tabAId }),
    {
      timeout: 5000,
      message: '切到 browserTab B 后，tab A 的 side panel 应被禁用',
    },
  ).toMatchObject({
    enabled: false,
  });
  await expect.poll(
    async () => getSidePanelOptionsForTab({ context, tabId: tabBId }),
    {
      timeout: 5000,
      message: '切到 browserTab B 后，tab B 的 side panel 应被预配置',
    },
  ).toMatchObject({
    enabled: true,
    path: 'sidebar.html',
  });

  await activateBrowserTab({
    context,
    tabId: tabAId,
  });
  await expect.poll(
    async () => getSidePanelOptionsForTab({ context, tabId: tabAId }),
    {
      timeout: 5000,
      message: '切回 browserTab A 后，tab A 的 side panel 应重新预配置，保证下一次点击即可打开',
    },
  ).toMatchObject({
    enabled: true,
    path: 'sidebar.html',
  });

  await expect(
    openBrowserActionForTab({ context, extensionId, page: pageA, driverPage }),
  ).resolves.toMatchObject({
    kind: 'sidepanel-opened',
  });

  await expect(getSidePanelOptionsForTab({ context, tabId: tabAId })).resolves.toMatchObject({
    enabled: true,
    path: 'sidebar.html',
  });

  await driverPage.close();
});
