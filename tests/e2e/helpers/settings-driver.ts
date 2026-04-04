import type { BrowserContext, Page } from '@playwright/test';

/** 打开设置页并等待基础壳层出现。 */
export const openSettingsPage = async ({
  context,
  extensionId,
}: {
  context: BrowserContext;
  extensionId: string;
}): Promise<Page> => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByTestId('settings-shell').waitFor();
  return page;
};
