import { EXTENSION_PAGES } from '../../src/shared/extension-pages';
import { expect, test } from './helpers/extension-fixture';
import { openBrowserActionForTab } from './helpers/browser-entry-driver';

test('普通网页点击扩展图标后按 tab 打开 side panel', async ({ context, extensionId }) => {
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

test('受限页点击扩展图标时退化到 conversations', async ({ context, extensionId }) => {
  const restricted = await context.newPage();
  await restricted.goto(`chrome-extension://${extensionId}/${EXTENSION_PAGES.options}`);

  await expect(
    openBrowserActionForTab({ context, extensionId, page: restricted, driverPage: restricted }),
  ).resolves.toEqual({
    kind: 'conversations-opened',
    url: `chrome-extension://${extensionId}/${EXTENSION_PAGES.conversations}`,
  });
});
