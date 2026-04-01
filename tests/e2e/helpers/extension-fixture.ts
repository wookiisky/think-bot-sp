import path from 'node:path';

import { chromium, expect, test as base, type BrowserContext } from '@playwright/test';

type ExtensionFixtures = {
  context: BrowserContext;
  extensionId: string;
};

export const test = base.extend<ExtensionFixtures>({
  context: async ({}, use) => {
    const extensionPath = path.resolve(process.cwd(), '.output/chrome-mv3');
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });

    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    const extensionsPage = await context.newPage();
    let extensionId: string | null = null;

    try {
      await extensionsPage.goto('chrome://extensions/', {
        waitUntil: 'domcontentloaded',
      });

      const devToggle = extensionsPage.locator('cr-toggle[aria-label="Developer mode"]');
      if (await devToggle.count()) {
        const isPressed = await devToggle.first().getAttribute('aria-pressed');
        if (isPressed === 'false') {
          await devToggle.first().click();
          await extensionsPage.waitForTimeout(500);
        }
      }

      await extensionsPage
        .locator('extensions-item')
        .first()
        .waitFor({ timeout: 5000 })
        .catch(() => null);

      const items = extensionsPage.locator('extensions-manager >> extensions-item');
      const itemCount = await items.count();
      for (let i = 0; i < itemCount; i++) {
        const item = items.nth(i);
        const text = await item.innerText();
        if (text.toLowerCase().includes('think-bot-sp')) {
          try {
            const optionsButton = item.getByRole('button', { name: 'Options' });
            if (await optionsButton.count()) {
              const [optionsPage] = await Promise.all([
                context.waitForEvent('page'),
                optionsButton.click(),
              ]);
              await optionsPage.waitForLoadState('domcontentloaded');
              extensionId = new URL(optionsPage.url()).host;
              await optionsPage.close();
            }
          } catch {
            // best effort; continue with other strategies
          }

          if (!extensionId) {
            extensionId = await item.getAttribute('id');
          }

          break;
        }
      }
    } finally {
      await extensionsPage.close();
    }

    const serviceWorker =
      context.serviceWorkers()[0] ??
      (await context
        .waitForEvent('serviceworker', {
          timeout: 15000,
        })
        .catch(() => null));

    if (serviceWorker) {
      extensionId = extensionId ?? new URL(serviceWorker.url()).host;
    }

    if (!extensionId) {
      throw new Error(
        'Unable to determine extension id; Developer Mode enabled but neither service worker nor extension listing provided an id',
      );
    }

    await use(extensionId);
  },
});

export { expect };
