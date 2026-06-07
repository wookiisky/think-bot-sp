import type { BrowserContext, Locator, Page } from '@playwright/test';

import { expect, test } from './helpers/extension-fixture';
import { openSettingsPage } from './helpers/settings-driver';

type LayoutBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** 打开指定视口下的设置页。 */
const openSettingsPageAtViewport = async ({
  context,
  extensionId,
  width,
  height,
}: {
  context: BrowserContext;
  extensionId: string;
  width: number;
  height: number;
}): Promise<Page> => {
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByTestId('settings-shell').waitFor();
  return page;
};

/** 读取真实布局框，缺失时直接抛出可读错误。 */
const getLayoutBox = async (locator: Locator, name: string): Promise<LayoutBox> => {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error(`${name} 没有可用布局框`);
  }
  return box;
};

/** 判断两个布局框是否发生视觉重叠。 */
const hasBoxOverlap = (firstBox: LayoutBox, secondBox: LayoutBox) => {
  const firstRight = firstBox.x + firstBox.width;
  const secondRight = secondBox.x + secondBox.width;
  const firstBottom = firstBox.y + firstBox.height;
  const secondBottom = secondBox.y + secondBox.height;

  return firstBox.x < secondRight && secondBox.x < firstRight && firstBox.y < secondBottom && secondBox.y < firstBottom;
};

/** 校验未保存提示没有遮挡标题区和动作区。 */
const expectUnsavedBannerDoesNotOverlap = async (page: Page) => {
  const bannerBox = await getLayoutBox(page.getByTestId('settings-unsaved-banner'), '未保存提示');
  const titleBox = await getLayoutBox(page.getByTestId('settings-shell-title'), '设置页标题区');
  const actionsBox = await getLayoutBox(page.getByTestId('settings-shell-actions'), '设置页动作区');

  expect(hasBoxOverlap(bannerBox, titleBox)).toBe(false);
  expect(hasBoxOverlap(bannerBox, actionsBox)).toBe(false);
};

test('settings layout keeps unsaved edits across section switches', async ({ context, extensionId }) => {
  const page = await openSettingsPage({ context, extensionId });
  await page.setViewportSize({ width: 1280, height: 720 });

  await expect(page.getByRole('tab', { name: '基础设置' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '快捷输入' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '语言模型' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '云同步' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '黑名单设置' })).toBeVisible();

  await page.getByLabel('System Prompt').fill('始终使用中文回答');
  const header = page.getByTestId('settings-shell-header');
  const banner = page.getByTestId('settings-unsaved-banner');
  await expect(banner).toBeVisible();

  const headerBox = await getLayoutBox(header, '设置页浮动标题栏');
  const bannerBox = await getLayoutBox(banner, '未保存提示');
  const headerCenterX = headerBox.x + headerBox.width / 2;
  const bannerCenterX = bannerBox.x + bannerBox.width / 2;
  expect(Math.abs(headerCenterX - bannerCenterX)).toBeLessThanOrEqual(6);
  await expectUnsavedBannerDoesNotOverlap(page);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  const stickyHeaderBox = await getLayoutBox(header, '滚动后的设置页浮动标题栏');
  const stickyBannerBox = await getLayoutBox(banner, '滚动后的未保存提示');
  expect(stickyHeaderBox.y).toBeGreaterThanOrEqual(0);
  expect(stickyHeaderBox.y).toBeLessThanOrEqual(12);
  expect(stickyBannerBox.y).toBeGreaterThanOrEqual(stickyHeaderBox.y);
  expect(stickyBannerBox.y + stickyBannerBox.height).toBeLessThanOrEqual(stickyHeaderBox.y + stickyHeaderBox.height);
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeVisible();

  await page.getByRole('tab', { name: '语言模型' }).click();
  await page.getByRole('tab', { name: '基础设置' }).click();
  await expect(page.getByLabel('System Prompt')).toHaveValue('始终使用中文回答');
});

test('settings unsaved banner keeps readable layout on narrow viewport', async ({ context, extensionId }) => {
  const page = await openSettingsPageAtViewport({
    context,
    extensionId,
    width: 390,
    height: 800,
  });

  await page.getByLabel('System Prompt').fill('始终使用中文回答');

  await expect(page.getByTestId('settings-shell-header')).toBeVisible();
  await expect(page.getByTestId('settings-unsaved-banner')).toHaveText('有未保存更改');
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeVisible();
  await expectUnsavedBannerDoesNotOverlap(page);
});
