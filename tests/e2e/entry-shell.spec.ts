import { expect, test } from './helpers/extension-fixture';

test('opens side panel shell route directly', async ({ context, extensionId }) => {
  const sidepanel = await context.newPage();
  await sidepanel.goto(`chrome-extension://${extensionId}/side-panel.html`);

  await expect(sidepanel.getByRole('heading', { name: 'Side Panel' })).toBeVisible();
  await expect(sidepanel.getByText('Stage 1 shell only')).toBeVisible();
  await expect(sidepanel.getByText(/environment/i)).toBeVisible();
});
