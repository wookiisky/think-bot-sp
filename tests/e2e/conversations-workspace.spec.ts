import { EXTENSION_PAGES } from '../../src/shared/extension-pages';
import { buildConversationStorageKey, buildLoadingStorageKey, buildPageStorageKey } from '../../src/shared/storage-keys';
import { HISTORY_PAGES, seedConversationsWorkspace } from './helpers/conversations-workspace-seed';
import { expect, test } from './helpers/extension-fixture';

test('历史页支持正文搜索、切换页面和继续聊天，并在刷新后恢复持久化回答', async ({ context, extensionId }) => {
  const worker = context.serviceWorkers()[0];
  if (!worker) throw new Error('未找到扩展 service worker');
  await seedConversationsWorkspace(worker);

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${EXTENSION_PAGES.conversations}`);
  const list = page.getByTestId('conversations-page-list');
  const search = page.getByRole('textbox', { name: '搜索历史页面' });
  await expect(list.getByTestId('conversations-page-item')).toHaveCount(2);
  await expect(page.getByText(HISTORY_PAGES[0].answer, { exact: true })).toBeVisible();

  await list.getByRole('button', { name: HISTORY_PAGES[1].title, exact: true }).click();
  await expect(page.getByTestId('conversations-detail-title')).toHaveText(HISTORY_PAGES[1].title);
  await expect(page.getByText(HISTORY_PAGES[1].answer, { exact: true })).toBeVisible();
  await expect(page.getByText(HISTORY_PAGES[0].answer, { exact: true })).toHaveCount(0);

  await search.fill('星际帆船');
  await expect(list.getByTestId('conversations-page-item')).toHaveCount(1);
  await expect(list.getByRole('button', { name: HISTORY_PAGES[0].title, exact: true })).toBeVisible();
  await expect(page.getByTestId('conversations-detail-title')).toHaveText(HISTORY_PAGES[0].title);
  await search.clear();
  await expect(list.getByTestId('conversations-page-item')).toHaveCount(2);

  // 在工作区已恢复后注入流，覆盖运行期读取测试流以及真实消息端口路径。
  await worker.evaluate(() => {
    (globalThis as typeof globalThis & { __THINK_BOT_TEST_STREAM__?: string[] })
      .__THINK_BOT_TEST_STREAM__ = ['历史继续回答', '，流已完成'];
  });
  await page.getByRole('textbox', { name: '聊天输入' }).fill('继续解释第一篇正文');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByText('历史继续回答，流已完成', { exact: true })).toBeVisible();
  const conversationKey = buildConversationStorageKey(HISTORY_PAGES[0].url, 'chat');
  const loadingKey = buildLoadingStorageKey(HISTORY_PAGES[0].url, 'chat');
  await expect.poll(() => worker.evaluate(async ({ conversationKey, loadingKey }) => {
    const stored = await chrome.storage.local.get([conversationKey, loadingKey]);
    const conversation = stored[conversationKey] as {
      messages: Array<{ role: string; content: string; status: string }>;
    };
    return {
      hasLoading: loadingKey in stored,
      messages: conversation.messages.map(({ role, content, status }) => ({ role, content, status })),
    };
  }, { conversationKey, loadingKey })).toEqual({
    hasLoading: false,
    messages: [
      { role: 'assistant', content: HISTORY_PAGES[0].answer, status: 'done' },
      { role: 'user', content: '继续解释第一篇正文', status: 'done' },
      { role: 'assistant', content: '历史继续回答，流已完成', status: 'done' },
    ],
  });

  await page.reload();
  await expect(page.getByText('历史继续回答，流已完成', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '聊天输入' })).toBeEnabled();
});

test('历史页保存标题后刷新仍保留，删除当前页面后选择剩余页面', async ({ context, extensionId }) => {
  const worker = context.serviceWorkers()[0];
  if (!worker) throw new Error('未找到扩展 service worker');
  await seedConversationsWorkspace(worker);

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${EXTENSION_PAGES.conversations}`);
  const list = page.getByTestId('conversations-page-list');
  await expect(page.getByTestId('conversations-detail-title')).toHaveText(HISTORY_PAGES[0].title);
  await page.getByRole('button', { name: '编辑页面标题', exact: true }).click();
  await page.getByRole('textbox', { name: '编辑页面标题', exact: true }).fill('保存后的历史标题');
  await page.getByRole('textbox', { name: '编辑页面标题', exact: true }).press('Enter');
  await expect(list.getByRole('button', { name: '保存后的历史标题', exact: true })).toBeVisible();
  await expect(page.getByTestId('conversations-detail-title')).toHaveText('保存后的历史标题');

  await page.reload();
  await expect(list.getByRole('button', { name: '保存后的历史标题', exact: true })).toBeVisible();
  await expect(page.getByTestId('conversations-detail-title')).toHaveText('保存后的历史标题');
  await list.getByRole('button', { name: '删除页面 保存后的历史标题', exact: true }).click();
  await page.getByTestId(`delete-page-confirm-${HISTORY_PAGES[0].url}`)
    .getByRole('button', { name: '删除页面', exact: true }).click();
  await expect(list.getByTestId('conversations-page-item')).toHaveCount(1);
  await expect(page.getByTestId('conversations-detail-title')).toHaveText(HISTORY_PAGES[1].title);
  await expect(page.getByText(HISTORY_PAGES[1].answer, { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '聊天输入' })).toBeEnabled();

  const deletedKeys = [buildPageStorageKey(HISTORY_PAGES[0].url), buildConversationStorageKey(HISTORY_PAGES[0].url, 'chat')];
  expect(await worker.evaluate(async (keys) => Object.keys(await chrome.storage.local.get(keys)), deletedKeys)).toEqual([]);
  await page.reload();
  await expect(list.getByTestId('conversations-page-item')).toHaveCount(1);
  await expect(page.getByTestId('conversations-detail-title')).toHaveText(HISTORY_PAGES[1].title);
});
