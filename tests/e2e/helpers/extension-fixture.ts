import path from 'node:path';

import { chromium, expect, test as base, type BrowserContext } from '@playwright/test';

type ExtensionFixtures = {
  /** 持久化浏览器上下文，用于加载并操作 MV3 扩展。 */
  context: BrowserContext;
  /** 当前测试运行时解析出的扩展 ID。 */
  extensionId: string;
  /** 当前扩展 service worker 的完整地址。 */
  serviceWorkerUrl: string;
};

export const test = base.extend<ExtensionFixtures>({
  // 创建持久化浏览器上下文，并把打包产物作为 unpacked extension 加载进去。
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const extensionPath = path.resolve(process.cwd(), '.output/chrome-mv3');
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });

    await use(context);
    await context.close();
  },
  // Phase 1 基线要求能稳定拿到 service worker；拿不到就直接失败，不做静默降级。
  serviceWorkerUrl: async ({ context }, use) => {
    const serviceWorker =
      context.serviceWorkers()[0] ??
      (await context
        .waitForEvent('serviceworker', {
          timeout: 15000,
        })
        .catch(() => null));

    if (!serviceWorker) {
      throw new Error('Phase 1 E2E 基线失败：未能在 15 秒内获取扩展 service worker。');
    }

    await use(serviceWorker.url());
  },
  // 扩展 ID 统一从 service worker URL 解析，避免测试夹具依赖 chrome://extensions UI 结构。
  extensionId: async ({ serviceWorkerUrl }, use) => {
    await use(new URL(serviceWorkerUrl).host);
  },
});

export { expect };
