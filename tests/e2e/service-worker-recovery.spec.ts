import { EXTENSION_PAGES } from '../../src/shared/extension-pages';
import { expect, test } from './helpers/extension-fixture';

test('worker 重启后仍能恢复持久化 loading', async ({ context, extensionId }) => {
  const serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    throw new Error('未找到扩展 service worker');
  }

  await serviceWorker.evaluate(async () => {
    await chrome.storage.local.set({
      'conversation:https://example.com/article:chat': {
        id: 'https://example.com/article:chat',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        messages: [
          {
            id: 'assistant-1',
            role: 'assistant',
            content: '恢复中的回答',
            images: [],
            status: 'loading',
            errorMessage: null,
            modelId: 'model-1',
            branches: [],
            retryFromMessageId: null,
            editedAt: null,
            createdAt: 1,
            updatedAt: 2,
          },
        ],
        lastAssistantState: {
          messageId: 'assistant-1',
          status: 'loading',
          summary: '恢复中的回答',
        },
        updatedAt: 2,
      },
      'loading:https://example.com/article:chat': {
        id: 'loading:https://example.com/article:chat',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-restore',
        promptTabStatus: 'loading',
        branchStates: [],
        resumeTarget: { messageId: 'assistant-1' },
        cancelRequested: false,
        updatedAt: 2,
      },
    });
  });

  const sidepanel = await context.newPage();
  await sidepanel.goto(
    `chrome-extension://${extensionId}/${EXTENSION_PAGES.sidePanel}?tabId=7&pageUrl=${encodeURIComponent('https://example.com/article')}`,
  );

  await expect(sidepanel.getByText('恢复中的回答')).toBeVisible();
  await expect(sidepanel.getByRole('button', { name: '停止' })).toBeVisible();
  await expect(sidepanel.getByText('恢复生成中…')).toHaveCount(0);
});
