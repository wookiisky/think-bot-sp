import { EXTENSION_PAGES } from '../../src/shared/extension-pages';
import { expect, test } from './helpers/extension-fixture';

test('opens side panel shell route directly', async ({ context, extensionId }) => {
  const sidepanel = await context.newPage();
  await sidepanel.goto(`chrome-extension://${extensionId}/${EXTENSION_PAGES.sidePanel}`);

  await expect(sidepanel).toHaveURL(new RegExp(`${EXTENSION_PAGES.sidePanel}$`));
  await expect(sidepanel.getByTestId('sidebar-shell')).toBeVisible();
  await expect(sidepanel.getByTestId('sidebar-extraction-panel')).toBeVisible();
  await expect(sidepanel.getByRole('tab', { name: /Chat|聊天/ })).toBeVisible();
});
