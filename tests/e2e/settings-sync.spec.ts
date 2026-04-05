import { expect, test } from './helpers/extension-fixture';
import { openSettingsPage } from './helpers/settings-driver';

test('settings sync panel can test connection and sync with injected provider', async ({ context, extensionId }) => {
  const serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    throw new Error('同步面板 E2E 失败：未找到扩展 service worker。');
  }

  await serviceWorker.evaluate(() => {
    (globalThis as typeof globalThis & {
      __THINK_BOT_TEST_SYNC_PROVIDER__?: {
        testConnection: (sync: unknown) => Promise<unknown>;
        syncNow: (config: unknown) => Promise<unknown>;
      };
    }).__THINK_BOT_TEST_SYNC_PROVIDER__ = {
      async testConnection() {
        return {
          provider: 'gist',
          ok: true,
          message: '连接成功',
        };
      },
      async syncNow() {
        return {
          provider: 'gist',
          lastSyncAt: 123456,
          snapshotBytes: 256,
        };
      },
    };
  });

  const page = await openSettingsPage({ context, extensionId });
  await page.getByRole('tab', { name: '云同步' }).click();
  await page.getByRole('checkbox', { name: '启用同步' }).click();
  await page.getByRole('combobox', { name: '同步提供方' }).click();
  await page.getByRole('option', { name: 'Gist' }).click();
  await page.getByLabel('Gist Token').fill('token');
  await page.getByLabel('Gist ID').fill('gist-id');

  await page.getByRole('button', { name: '测试连接' }).click();
  await expect(page.getByText('连接成功')).toBeVisible();

  await page.getByRole('button', { name: '立即同步' }).click();
  await expect(page.getByText('已同步 256 B')).toBeVisible();
  await expect(page.getByText('123456')).toBeVisible();
});
