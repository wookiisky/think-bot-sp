import { expect, test } from './helpers/extension-fixture';

const cacheKeys = {
  page: 'page:https://example.com/article',
  conversation: 'conversation:https://example.com/article:summary',
  loading: 'loading:https://example.com/article:summary',
  ignored: 'ignored:test',
};

test('settings flow keeps language change after save and shows cache stats', async ({ context, extensionId }) => {
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

  const languageSelect = options.getByRole('combobox').first();
  await languageSelect.selectOption('en');
  await expect(options.locator('h1')).toContainText('Settings');

  await options.getByRole('button', { name: /保存|Save/ }).click();
  await expect.poll(() => handledCommandTypes).toContain('SAVE_CONFIG');

  await options.reload();

  await expect(options.locator('h1')).toContainText('Settings');
  await expect(options.getByRole('heading', { name: /本地缓存|Local Cache/ })).toBeVisible();
  await expect(options.getByTestId('cache-entry-count')).toContainText('3');
  await expect(options.getByTestId('cache-bytes')).toContainText(/B/);
  await expect(
    options.evaluate(async () => {
      const result = await chrome.storage.local.get(null);
      return {
        language: result['config:extension']?.basic?.language ?? null,
        keys: Object.keys(result).sort(),
      };
    }),
  ).resolves.toEqual({
    language: 'en',
    keys: [
      'config:extension',
      'conversation:https://example.com/article:summary',
      'ignored:test',
      'loading:https://example.com/article:summary',
      'page:https://example.com/article',
    ],
  });
});
