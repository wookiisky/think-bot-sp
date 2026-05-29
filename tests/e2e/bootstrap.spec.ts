import { expect, test } from './helpers/extension-fixture';

test('loads the MV3 extension and opens options/conversations shells', async ({
  context,
  extensionId,
  serviceWorkerUrl,
}) => {
  await expect(serviceWorkerUrl).toContain(`chrome-extension://${extensionId}/`);

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(options.getByTestId('settings-shell')).toBeVisible();
  await expect(options.getByRole('heading', { name: '设置', exact: true })).toBeVisible();

  const conversations = await context.newPage();
  await conversations.goto(`chrome-extension://${extensionId}/conversations.html`);
  await expect(conversations.getByTestId('conversations-shell')).toBeVisible();
  await expect(conversations.getByPlaceholder('搜索')).toBeVisible();
});
