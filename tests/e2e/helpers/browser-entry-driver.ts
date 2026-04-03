import type { BrowserContext, Page } from '@playwright/test';

/** 通过 E2E 驱动消息复用同一条扩展按钮入口逻辑。 */
export const openBrowserActionForTab = async ({
  context,
  extensionId,
  page,
  driverPage,
}: {
  context: BrowserContext;
  extensionId: string;
  page: Page;
  driverPage: Page;
}) => {
  const serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    throw new Error('未找到扩展 service worker。');
  }

  await page.bringToFront();

  const tabId = await serviceWorker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (!tab?.id) {
      throw new Error('未找到当前活动 browserTab');
    }
    return tab.id;
  });

  await driverPage.goto(`chrome-extension://${extensionId}/options.html`);
  await driverPage.evaluate(({ targetTabId, targetPageUrl }) => {
    const existing = document.getElementById('e2e-browser-action-trigger');
    existing?.remove();

    (window as typeof window & {
      __e2eBrowserActionResult?: unknown;
    }).__e2eBrowserActionResult = null;

    const button = document.createElement('button');
    button.id = 'e2e-browser-action-trigger';
    button.textContent = 'trigger';
    button.addEventListener('click', async () => {
      const result = await chrome.runtime.sendMessage({
        type: '__E2E_BROWSER_ACTION_CLICK__',
        tabId: targetTabId,
        pageUrl: targetPageUrl,
      });
      (window as typeof window & {
        __e2eBrowserActionResult?: unknown;
      }).__e2eBrowserActionResult = result;
    });
    document.body.appendChild(button);
  }, {
    targetTabId: tabId,
    targetPageUrl: page.url(),
  });
  await driverPage.getByRole('button', { name: 'trigger' }).click();
  await driverPage.waitForFunction(() => {
    return (window as typeof window & {
      __e2eBrowserActionResult?: unknown;
    }).__e2eBrowserActionResult !== null;
  });
  return driverPage.evaluate(() => {
    return (window as typeof window & {
      __e2eBrowserActionResult?: unknown;
    }).__e2eBrowserActionResult;
  });
};
