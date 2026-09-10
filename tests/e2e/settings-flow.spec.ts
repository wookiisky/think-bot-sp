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
  // 命令完成日志是 debug 级别，生产构建默认不输出；日志载荷序列化在消息文本里，直接从文本解析。
  serviceWorker.on('console', (message) => {
    const match = /command\.completed (\{.*\})$/.exec(message.text());
    if (!match?.[1]) {
      return;
    }
    const payload = JSON.parse(match[1]) as { source?: string; type?: string };
    if (payload.source === 'config' && typeof payload.type === 'string') {
      handledCommandTypes.push(payload.type);
    }
  });
  await serviceWorker.evaluate(() => {
    (globalThis as typeof globalThis & { __thinkBotLog?: { setLevel: (level: string) => void } }).__thinkBotLog?.setLevel('debug');
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
  await expect(options.getByTestId('cache-page-count')).toContainText('1');
  await expect(options.getByTestId('cache-bytes')).toContainText(/B/);

  await selectOption(options, /语言|Language/, 'English');
  await expect(options.locator('h1')).toContainText('Settings');
  await selectOption(options, /Theme|主题/, 'Dark');
  await expect(options.getByTestId('settings-shell')).toHaveAttribute('data-theme', 'dark');

  await options.getByRole('button', { name: /^(保存|Save)$/ }).click();
  await expect.poll(() => handledCommandTypes).toContain('SAVE_CONFIG');

  await options.reload();

  await expect(options.locator('h1')).toContainText('Settings');
  await expect(options.getByRole('combobox', { name: /Theme|主题/ })).toContainText('Dark');
  await expect(options.getByTestId('settings-shell')).toHaveAttribute('data-theme', 'dark');
  await expect(options.getByRole('heading', { name: /本地缓存|Local Cache/ })).toBeVisible();
  await expect(options.getByTestId('cache-page-count')).toContainText('1');
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
      const config = result['config:extension'] as
        | {
            basic?: {
              language?: string;
              theme?: string;
            };
          }
        | undefined;
      return {
        language: config?.basic?.language ?? null,
        theme: config?.basic?.theme ?? null,
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
