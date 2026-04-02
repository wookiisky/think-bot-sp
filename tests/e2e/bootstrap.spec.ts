import { expect, test } from './helpers/extension-fixture';

test('loads the MV3 extension and opens options/conversations shells', async ({
  context,
  extensionId,
  serviceWorkerUrl,
}) => {
  await expect(serviceWorkerUrl).toContain(`chrome-extension://${extensionId}/`);

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(options.getByRole('heading', { name: 'Options' })).toBeVisible();
  await expect(options.getByText(/environment/i)).toBeVisible();

  const conversations = await context.newPage();
  await conversations.goto(`chrome-extension://${extensionId}/conversations.html`);
  await expect(conversations.getByRole('heading', { name: 'Conversations' })).toBeVisible();
  await expect(conversations.getByText(/environment/i)).toBeVisible();
});
