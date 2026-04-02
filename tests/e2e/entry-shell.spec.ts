import { EXTENSION_PAGES } from '../../src/shared/extension-pages';
import { expect, test } from './helpers/extension-fixture';

test('opens side panel shell route directly', async ({ context, extensionId }) => {
  const sidepanel = await context.newPage();
  await sidepanel.goto(`chrome-extension://${extensionId}/${EXTENSION_PAGES.sidePanel}`);

  await expect(sidepanel.getByRole('heading', { name: 'Side Panel' })).toBeVisible();
  await expect(sidepanel.getByText(/Side Panel surface/i)).toBeVisible();
  await expect(sidepanel.getByText(/environment/i)).toBeVisible();
});
