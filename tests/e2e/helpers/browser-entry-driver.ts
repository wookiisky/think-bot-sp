import type { BrowserContext, Page } from '@playwright/test';

/** 获取扩展 service worker。 */
const getServiceWorker = (context: BrowserContext) => {
  const serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    throw new Error('未找到扩展 service worker。');
  }

  return serviceWorker;
};

/** 获取当前活动 browserTab id。 */
export const getActiveBrowserTabId = async ({ context }: { context: BrowserContext }) => {
  const serviceWorker = getServiceWorker(context);

  return serviceWorker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (!tab?.id) {
      throw new Error('未找到当前活动 browserTab');
    }
    return tab.id;
  });
};

/** 按 URL 读取 browserTab id。 */
export const getBrowserTabIdForUrl = async ({
  context,
  url,
}: {
  context: BrowserContext;
  url: string;
}) => {
  const serviceWorker = getServiceWorker(context);

  return serviceWorker.evaluate(async ({ targetPageUrl }) => {
    const [tab] = await chrome.tabs.query({
      url: targetPageUrl,
    });
    if (!tab?.id) {
      throw new Error('未找到目标 browserTab');
    }
    return tab.id;
  }, {
    targetPageUrl: url,
  });
};

/** 读取指定 browserTab 的 side panel 配置。 */
export const getSidePanelOptionsForTab = async ({
  context,
  tabId,
}: {
  context: BrowserContext;
  tabId: number;
}) => {
  const serviceWorker = getServiceWorker(context);

  return serviceWorker.evaluate(async ({ targetTabId }) => {
    if (!chrome.sidePanel?.getOptions) {
      throw new Error('当前浏览器不支持 sidePanel.getOptions。');
    }

    return chrome.sidePanel.getOptions({
      tabId: targetTabId,
    });
  }, {
    targetTabId: tabId,
  });
};

/** 激活指定 browserTab。 */
export const activateBrowserTab = async ({
  context,
  tabId,
}: {
  context: BrowserContext;
  tabId: number;
}) => {
  const serviceWorker = getServiceWorker(context);

  await serviceWorker.evaluate(async ({ targetTabId }) => {
    await chrome.tabs.update(targetTabId, {
      active: true,
    });
  }, {
    targetTabId: tabId,
  });
};

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
  await page.bringToFront();
  const tabId = await getActiveBrowserTabId({ context });

  await driverPage.goto(`chrome-extension://${extensionId}/options.html`);
  await driverPage.evaluate(({ targetTabId, targetPageUrl }) => {
    const existing = document.getElementById('e2e-browser-action-trigger');
    existing?.remove();

    const stateWindow = window as typeof window & {
      __e2eBrowserActionResult?: {
        result?: unknown;
        error?: string;
      } | null;
    };
    stateWindow.__e2eBrowserActionResult = null;

    const button = document.createElement('button');
    button.id = 'e2e-browser-action-trigger';
    button.textContent = 'trigger';
    button.addEventListener('click', async () => {
      try {
        const result = await chrome.runtime.sendMessage({
          type: '__E2E_BROWSER_ACTION_CLICK__',
          tabId: targetTabId,
          pageUrl: targetPageUrl,
        });
        stateWindow.__e2eBrowserActionResult = {
          result,
        };
      } catch (error) {
        stateWindow.__e2eBrowserActionResult = {
          error: error instanceof Error ? error.message : String(error),
        };
      }
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
    const state = (window as typeof window & {
      __e2eBrowserActionResult?: {
        result?: unknown;
        error?: string;
      } | null;
    }).__e2eBrowserActionResult;

    if (state?.error) {
      throw new Error(state.error);
    }

    return state?.result;
  });
};
