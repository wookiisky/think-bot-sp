import { expect, test } from './helpers/extension-fixture';
import { openSettingsPage } from './helpers/settings-driver';

test('settings layout keeps unsaved edits across section switches', async ({ context, extensionId }) => {
  const page = await openSettingsPage({ context, extensionId });

  await expect(page.getByRole('tab', { name: '基础设置' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '快捷输入' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '语言模型' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '云同步' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '黑名单设置' })).toBeVisible();

  await page.getByLabel('System Prompt').fill('始终使用中文回答');
  await expect(page.getByText('有未保存更改')).toBeVisible();

  await page.getByRole('tab', { name: '语言模型' }).click();
  await page.getByRole('tab', { name: '基础设置' }).click();
  await expect(page.getByLabel('System Prompt')).toHaveValue('始终使用中文回答');
});
