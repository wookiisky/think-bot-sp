import type { Page } from '@playwright/test';

import { expect, test } from './helpers/extension-fixture';

const cacheKeys = {
  page: 'page:https://example.com/article',
  conversation: 'conversation:https://example.com/article:summary',
  loading: 'loading:https://example.com/article:summary',
  ignored: 'ignored:test',
};

/** 打开 shadcn Select 并选择目标选项。 */
const selectOption = async (page: Page, label: RegExp | string, optionText: string) => {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: optionText, exact: true }).click();
};

test('settings flow keeps language and theme after save, then reset to defaults', async ({ context, extensionId }) => {
  const serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    throw new Error('阶段 2 E2E 失败：未找到扩展 service worker。');
  }

  const handledCommandTypes: string[] = [];
  serviceWorker.on('console', (message) => {
    if (!message.text().includes('配置命令处理成功')) {
      return;
    }

    const payload = message.args()[1];
    if (!payload) {
      return;
    }

    void payload.jsonValue().then((value) => {
      const type = typeof value === 'object' && value && 'type' in value ? value.type : null;
      if (typeof type === 'string') {
        handledCommandTypes.push(type);
      }
    });
  });

  await serviceWorker.evaluate(async ({ page, conversation, loading, ignored }) => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({
      [page]: { id: 'page-1' },
      [conversation]: { id: 'conversation-1' },
      [loading]: { id: 'loading-1' },
      [ignored]: { value: true },
    });
  }, cacheKeys);

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);

  await expect.poll(() => handledCommandTypes).toContain('GET_CONFIG');
  await expect.poll(() => handledCommandTypes).toContain('GET_LOCAL_CACHE_STATS');
  await expect(options.locator('h1')).toContainText('设置');
  await expect(options.getByTestId('cache-entry-count')).toContainText('3');
  await expect(options.getByTestId('cache-bytes')).toContainText(/B/);

  await selectOption(options, /语言|Language/, 'English');
  await expect(options.locator('h1')).toContainText('Settings');
  await selectOption(options, /Theme|主题/, 'Dark');
  await expect(options.getByTestId('settings-shell')).toHaveAttribute('data-theme', 'dark');

  await options.getByRole('button', { name: /保存|Save/ }).click();
  await expect.poll(() => handledCommandTypes).toContain('SAVE_CONFIG');

  await options.reload();

  await expect(options.locator('h1')).toContainText('Settings');
  await expect(options.getByRole('combobox', { name: /Theme|主题/ })).toContainText('Dark');
  await expect(options.getByTestId('settings-shell')).toHaveAttribute('data-theme', 'dark');
  await expect(options.getByRole('heading', { name: /本地缓存|Local Cache/ })).toBeVisible();
  await expect(options.getByTestId('cache-entry-count')).toContainText('3');
  await expect(options.getByTestId('cache-bytes')).toContainText(/B/);

  await options.getByRole('button', { name: /恢复默认|Reset/ }).click();
  await expect.poll(() => handledCommandTypes).toContain('RESET_CONFIG');
  await expect(options.locator('h1')).toContainText('设置');
  await expect(options.getByRole('combobox', { name: /语言|Language/ })).toContainText('中文');
  await expect(options.getByRole('combobox', { name: /主题|Theme/ })).toContainText('System');
  await expect(options.getByTestId('settings-shell')).toHaveAttribute('data-theme', 'system');
  await expect(
    options.evaluate(async () => {
      const result = await chrome.storage.local.get(null);
      return {
        language: result['config:extension']?.basic?.language ?? null,
        theme: result['config:extension']?.basic?.theme ?? null,
        keys: Object.keys(result).sort(),
      };
    }),
  ).resolves.toEqual({
    language: 'zh-CN',
    theme: 'system',
    keys: [
      'config:extension',
      'conversation:https://example.com/article:summary',
      'ignored:test',
      'loading:https://example.com/article:summary',
      'page:https://example.com/article',
    ],
  });
});
