import { Buffer } from 'node:buffer';

import { EXTENSION_PAGES } from '../../src/shared/extension-pages';
import { buildConversationStorageKey, CONFIG_STORAGE_KEY } from '../../src/shared/storage-keys';
import { expect, test } from './helpers/extension-fixture';

test('side panel 可以发送消息、收到首包流式并在完成后写入历史', async ({ context, extensionId }) => {
  const serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    throw new Error('未找到扩展 service worker');
  }

  await serviceWorker.evaluate(async ({ storageKey }) => {
    await chrome.storage.local.set({
      [storageKey]: {
        version: '2.0.0',
        updatedAt: Date.now(),
        basic: {
          theme: 'system',
          language: 'zh-CN',
          defaultModelId: 'model-1',
          systemPrompt: '',
          filterCot: false,
          extractionMethod: 'readability',
          includePageContentByDefault: true,
        },
        models: [
          {
            id: 'model-1',
            name: '测试模型',
            provider: 'openai-compatible',
            enabled: true,
            model: 'gpt-4.1-mini',
            baseUrl: 'https://api.example.com',
            apiKey: 'token',
            deployment: '',
            temperature: 0,
            tools: [],
            thinkingBudget: null,
            maxOutputTokens: null,
            supportsImages: true,
            order: 0,
            deletedAt: null,
          },
        ],
        quickInputs: [],
        sync: {
          enabled: false,
          provider: 'none',
          gistToken: '',
          gistId: '',
          webdavUrl: '',
          webdavUsername: '',
          webdavPassword: '',
          lastSyncAt: null,
        },
        blacklist: [],
      },
    });
    (globalThis as typeof globalThis & {
      __THINK_BOT_TEST_STREAM__?: Array<string>;
    }).__THINK_BOT_TEST_STREAM__ = ['你好', '，这是测试响应'];
  }, {
    storageKey: CONFIG_STORAGE_KEY,
  });

  const page = await context.newPage();
  await page.goto('https://example.com/');
  await page.bringToFront();

  const tab = await serviceWorker.evaluate(async () => {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (!activeTab?.id || !activeTab.url) {
      throw new Error('未找到当前活动 browserTab');
    }
    return {
      id: activeTab.id,
      url: activeTab.url,
    };
  });

  const sidepanel = await context.newPage();
  await sidepanel.goto(
    `chrome-extension://${extensionId}/${EXTENSION_PAGES.sidePanel}?tabId=${tab.id}&pageUrl=${encodeURIComponent(tab.url)}`,
  );

  await expect(sidepanel.getByLabel('聊天输入')).toBeEnabled();
  await sidepanel.getByLabel('聊天输入').fill('请总结当前页面');
  await sidepanel.getByRole('button', { name: '发送' }).click();

  await expect(sidepanel.getByText('你好')).toBeVisible();
  await expect(sidepanel.getByText('你好，这是测试响应')).toBeVisible();

  await sidepanel.close();

  const reopened = await context.newPage();
  await reopened.goto(
    `chrome-extension://${extensionId}/${EXTENSION_PAGES.sidePanel}?tabId=${tab.id}&pageUrl=${encodeURIComponent(tab.url)}`,
  );
  await expect(reopened.getByText('你好，这是测试响应')).toBeVisible();
});

test('includePageContent=true 时会把页面正文注入真实模型上下文', async ({ context, extensionId }) => {
  const serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    throw new Error('未找到扩展 service worker');
  }

  await serviceWorker.evaluate(async ({ storageKey }) => {
    await chrome.storage.local.set({
      [storageKey]: {
        version: '2.0.0',
        updatedAt: Date.now(),
        basic: {
          theme: 'system',
          language: 'zh-CN',
          defaultModelId: 'model-1',
          systemPrompt: '',
          filterCot: false,
          extractionMethod: 'readability',
          includePageContentByDefault: true,
        },
        models: [
          {
            id: 'model-1',
            name: '测试模型',
            provider: 'openai-compatible',
            enabled: true,
            model: 'gpt-4.1-mini',
            baseUrl: 'https://api.example.com',
            apiKey: 'token',
            deployment: '',
            temperature: 0,
            tools: [],
            thinkingBudget: null,
            maxOutputTokens: null,
            supportsImages: true,
            order: 0,
            deletedAt: null,
          },
        ],
        quickInputs: [],
        sync: {
          enabled: false,
          provider: 'none',
          gistToken: '',
          gistId: '',
          webdavUrl: '',
          webdavUsername: '',
          webdavPassword: '',
          lastSyncAt: null,
        },
        blacklist: [],
      },
    });
    (globalThis as typeof globalThis & {
      __THINK_BOT_TEST_STREAM__?: Array<string>;
      __THINK_BOT_TEST_LAST_STREAM_MESSAGES__?: Array<{ role: string; content: string; images: string[] }>;
    }).__THINK_BOT_TEST_STREAM__ = ['已收到页面上下文'];
    (globalThis as typeof globalThis & {
      __THINK_BOT_TEST_LAST_STREAM_MESSAGES__?: Array<{ role: string; content: string; images: string[] }>;
    }).__THINK_BOT_TEST_LAST_STREAM_MESSAGES__ = [];
  }, {
    storageKey: CONFIG_STORAGE_KEY,
  });

  const page = await context.newPage();
  await page.goto('https://example.com/');
  await page.bringToFront();

  const tab = await serviceWorker.evaluate(async () => {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (!activeTab?.id || !activeTab.url) {
      throw new Error('未找到当前活动 browserTab');
    }
    return {
      id: activeTab.id,
      url: activeTab.url,
    };
  });

  const sidepanel = await context.newPage();
  await sidepanel.goto(
    `chrome-extension://${extensionId}/${EXTENSION_PAGES.sidePanel}?tabId=${tab.id}&pageUrl=${encodeURIComponent(tab.url)}`,
  );

  await expect(sidepanel.getByTestId('sidebar-extraction-panel')).toContainText('Example Domain');
  await sidepanel.getByLabel('聊天输入').fill('请总结当前页面');
  await sidepanel.getByRole('button', { name: '发送' }).click();
  await expect(sidepanel.getByText('已收到页面上下文')).toBeVisible();

  await expect
    .poll(async () =>
      serviceWorker.evaluate(() =>
        (globalThis as typeof globalThis & {
          __THINK_BOT_TEST_LAST_STREAM_MESSAGES__?: Array<{ role: string; content: string; images: string[] }>;
        }).__THINK_BOT_TEST_LAST_STREAM_MESSAGES__ ?? [],
      ),
    )
    .toMatchObject([
      {
        role: 'user',
        images: [],
      },
    ]);
  const streamedMessages = await serviceWorker.evaluate(() =>
    (globalThis as typeof globalThis & {
      __THINK_BOT_TEST_LAST_STREAM_MESSAGES__?: Array<{ role: string; content: string; images: string[] }>;
    }).__THINK_BOT_TEST_LAST_STREAM_MESSAGES__ ?? [],
  );
  expect(streamedMessages[0]?.content).toContain('页面内容：');
  expect(streamedMessages[0]?.content).toContain('Example Domain');
  expect(streamedMessages[0]?.content).toContain('用户消息：请总结当前页面');
});

test('side panel 支持 quickInputs 多标签切换，并隔离草稿与会话', async ({ context, extensionId }) => {
  const serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    throw new Error('未找到扩展 service worker');
  }

  await serviceWorker.evaluate(async ({ storageKey }) => {
    await chrome.storage.local.set({
      [storageKey]: {
        version: '2.0.0',
        updatedAt: Date.now(),
        basic: {
          theme: 'system',
          language: 'zh-CN',
          defaultModelId: 'model-1',
          systemPrompt: '',
          filterCot: false,
          extractionMethod: 'readability',
          includePageContentByDefault: true,
        },
        models: [
          {
            id: 'model-1',
            name: '主模型',
            provider: 'openai-compatible',
            enabled: true,
            model: 'gpt-4.1-mini',
            baseUrl: 'https://api.example.com',
            apiKey: 'token',
            deployment: '',
            temperature: 0,
            tools: [],
            thinkingBudget: null,
            maxOutputTokens: null,
            supportsImages: true,
            order: 0,
            deletedAt: null,
          },
          {
            id: 'model-2',
            name: '快捷模型',
            provider: 'openai-compatible',
            enabled: true,
            model: 'gpt-4.1-mini',
            baseUrl: 'https://api.example.com',
            apiKey: 'token',
            deployment: '',
            temperature: 0,
            tools: [],
            thinkingBudget: null,
            maxOutputTokens: null,
            supportsImages: false,
            order: 1,
            deletedAt: null,
          },
        ],
        quickInputs: [
          {
            id: 'quick-summary',
            name: '总结',
            prompt: '请总结当前页面',
            autoTrigger: false,
            modelId: 'model-2',
            order: 0,
            deletedAt: null,
          },
          {
            id: 'quick-translate',
            name: '翻译',
            prompt: '请翻译当前页面',
            autoTrigger: false,
            modelId: 'missing-model',
            order: 1,
            deletedAt: null,
          },
        ],
        sync: {
          enabled: false,
          provider: 'none',
          gistToken: '',
          gistId: '',
          webdavUrl: '',
          webdavUsername: '',
          webdavPassword: '',
          lastSyncAt: null,
        },
        blacklist: [],
      },
    });
    (globalThis as typeof globalThis & {
      __THINK_BOT_TEST_STREAM__?: Array<string>;
    }).__THINK_BOT_TEST_STREAM__ = ['快捷标签响应'];
  }, {
    storageKey: CONFIG_STORAGE_KEY,
  });

  const page = await context.newPage();
  await page.goto('https://example.com/');
  await page.bringToFront();

  const tab = await serviceWorker.evaluate(async () => {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (!activeTab?.id || !activeTab.url) {
      throw new Error('未找到当前活动 browserTab');
    }
    return {
      id: activeTab.id,
      url: activeTab.url,
    };
  });

  const sidepanel = await context.newPage();
  await sidepanel.goto(
    `chrome-extension://${extensionId}/${EXTENSION_PAGES.sidePanel}?tabId=${tab.id}&pageUrl=${encodeURIComponent(tab.url)}`,
  );

  await expect(sidepanel.getByRole('tab', { name: /Chat/ })).toBeVisible();
  await expect(sidepanel.getByRole('tab', { name: /总结/ })).toBeVisible();
  await expect(sidepanel.getByRole('tab', { name: /翻译/ })).toBeVisible();

  await sidepanel.getByLabel('聊天输入').fill('保留这段 chat 草稿');
  await sidepanel.getByRole('tab', { name: /总结/ }).click();
  await expect(sidepanel.getByLabel('聊天输入')).toHaveValue('请总结当前页面');
  await expect(sidepanel.getByLabel('选择模型')).toHaveValue('model-2');

  await sidepanel.getByLabel('聊天输入').fill('请总结 example.com');
  await sidepanel.getByRole('button', { name: '发送' }).click();
  await expect(sidepanel.getByText('快捷标签响应')).toBeVisible();

  await sidepanel.getByRole('tab', { name: /Chat/ }).click();
  await expect(sidepanel.getByLabel('聊天输入')).toHaveValue('保留这段 chat 草稿');

  await sidepanel.getByRole('tab', { name: /翻译/ }).click();
  await expect(sidepanel.getByLabel('聊天输入')).toHaveValue('请翻译当前页面');
  await expect(sidepanel.getByLabel('选择模型')).toHaveValue('model-1');

  await expect
    .poll(async () =>
      serviceWorker.evaluate(async ({ conversationKey }) => {
        const stored = await chrome.storage.local.get(conversationKey);
        const conversation = stored[conversationKey] as
          | {
              promptTabId: string;
              messages: Array<{ role: string; content: string }>;
            }
          | null
          | undefined;
        return conversation
          ? {
              promptTabId: conversation.promptTabId,
              roles: conversation.messages.map((message) => message.role),
              assistantContent: conversation.messages.find((message) => message.role === 'assistant')?.content ?? '',
            }
          : null;
      }, {
        conversationKey: buildConversationStorageKey('https://example.com/', 'quick-summary'),
      }),
    )
    .toMatchObject({
      promptTabId: 'quick-summary',
      roles: ['user', 'assistant'],
      assistantContent: '快捷标签响应',
    });
});

test('页面首次提取成功后会自动触发 quickInput，且重开 side panel 不重复触发', async ({ context, extensionId }) => {
  const serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    throw new Error('未找到扩展 service worker');
  }

  await serviceWorker.evaluate(async ({ storageKey }) => {
    await chrome.storage.local.set({
      [storageKey]: {
        version: '2.0.0',
        updatedAt: Date.now(),
        basic: {
          theme: 'system',
          language: 'zh-CN',
          defaultModelId: 'model-1',
          systemPrompt: '',
          filterCot: false,
          extractionMethod: 'readability',
          includePageContentByDefault: true,
        },
        models: [
          {
            id: 'model-1',
            name: '主模型',
            provider: 'openai-compatible',
            enabled: true,
            model: 'gpt-4.1-mini',
            baseUrl: 'https://api.example.com',
            apiKey: 'token',
            deployment: '',
            temperature: 0,
            tools: [],
            thinkingBudget: null,
            maxOutputTokens: null,
            supportsImages: true,
            order: 0,
            deletedAt: null,
          },
        ],
        quickInputs: [
          {
            id: 'quick-summary',
            name: '总结',
            prompt: '请总结当前页面',
            autoTrigger: true,
            modelId: 'model-1',
            order: 0,
            deletedAt: null,
          },
        ],
        sync: {
          enabled: false,
          provider: 'none',
          gistToken: '',
          gistId: '',
          webdavUrl: '',
          webdavUsername: '',
          webdavPassword: '',
          lastSyncAt: null,
        },
        blacklist: [],
      },
    });
    (globalThis as typeof globalThis & {
      __THINK_BOT_TEST_STREAM__?: Array<string>;
    }).__THINK_BOT_TEST_STREAM__ = ['自动触发回答'];
  }, {
    storageKey: CONFIG_STORAGE_KEY,
  });

  const page = await context.newPage();
  await page.goto('https://example.com/');
  await page.bringToFront();

  const tab = await serviceWorker.evaluate(async () => {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (!activeTab?.id || !activeTab.url) {
      throw new Error('未找到当前活动 browserTab');
    }
    return {
      id: activeTab.id,
      url: activeTab.url,
    };
  });

  const sidepanel = await context.newPage();
  await sidepanel.goto(
    `chrome-extension://${extensionId}/${EXTENSION_PAGES.sidePanel}?tabId=${tab.id}&pageUrl=${encodeURIComponent(tab.url)}`,
  );

  await expect(sidepanel.getByTestId('sidebar-extraction-panel')).toContainText('Example Domain');
  await expect(sidepanel.getByRole('tab', { name: /Chat/ })).toHaveAttribute('aria-selected', 'true');
  await sidepanel.getByRole('tab', { name: /总结/ }).click();
  await expect(sidepanel.getByText('自动触发回答')).toBeVisible();

  const conversationKey = buildConversationStorageKey('https://example.com/', 'quick-summary');
  await expect
    .poll(async () =>
      serviceWorker.evaluate(async ({ key }) => {
        const stored = await chrome.storage.local.get(key);
        const conversation = stored[key] as { messages?: Array<unknown> } | undefined;
        return conversation?.messages?.length ?? 0;
      }, { key: conversationKey }),
    )
    .toBe(2);

  await sidepanel.close();

  const reopened = await context.newPage();
  await reopened.goto(
    `chrome-extension://${extensionId}/${EXTENSION_PAGES.sidePanel}?tabId=${tab.id}&pageUrl=${encodeURIComponent(tab.url)}`,
  );
  await expect(reopened.getByRole('tab', { name: /总结/ })).toContainText('自动触发完成');
  await reopened.waitForTimeout(800);

  await expect
    .poll(async () =>
      serviceWorker.evaluate(async ({ key }) => {
        const stored = await chrome.storage.local.get(key);
        const conversation = stored[key] as { messages?: Array<unknown> } | undefined;
        return conversation?.messages?.length ?? 0;
      }, { key: conversationKey }),
    )
    .toBe(2);
});

test('页面级清空会同时清理提取内容和当前页面历史，但不清空当前输入草稿', async ({ context, extensionId }) => {
  const serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    throw new Error('未找到扩展 service worker');
  }

  await serviceWorker.evaluate(async ({ storageKey }) => {
    await chrome.storage.local.set({
      [storageKey]: {
        version: '2.0.0',
        updatedAt: Date.now(),
        basic: {
          theme: 'system',
          language: 'zh-CN',
          defaultModelId: 'model-1',
          systemPrompt: '',
          filterCot: false,
          extractionMethod: 'readability',
          includePageContentByDefault: true,
        },
        models: [
          {
            id: 'model-1',
            name: '测试模型',
            provider: 'openai-compatible',
            enabled: true,
            model: 'gpt-4.1-mini',
            baseUrl: 'https://api.example.com',
            apiKey: 'token',
            deployment: '',
            temperature: 0,
            tools: [],
            thinkingBudget: null,
            maxOutputTokens: null,
            supportsImages: true,
            order: 0,
            deletedAt: null,
          },
        ],
        quickInputs: [],
        sync: {
          enabled: false,
          provider: 'none',
          gistToken: '',
          gistId: '',
          webdavUrl: '',
          webdavUsername: '',
          webdavPassword: '',
          lastSyncAt: null,
        },
        blacklist: [],
      },
    });
    (globalThis as typeof globalThis & {
      __THINK_BOT_TEST_STREAM__?: Array<string>;
    }).__THINK_BOT_TEST_STREAM__ = ['页面历史回答'];
  }, {
    storageKey: CONFIG_STORAGE_KEY,
  });

  const page = await context.newPage();
  await page.goto('https://example.com/');
  await page.bringToFront();

  const tab = await serviceWorker.evaluate(async () => {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (!activeTab?.id || !activeTab.url) {
      throw new Error('未找到当前活动 browserTab');
    }
    return {
      id: activeTab.id,
      url: activeTab.url,
    };
  });

  const sidepanel = await context.newPage();
  await sidepanel.goto(
    `chrome-extension://${extensionId}/${EXTENSION_PAGES.sidePanel}?tabId=${tab.id}&pageUrl=${encodeURIComponent(tab.url)}`,
  );

  await expect(sidepanel.getByTestId('sidebar-extraction-panel')).toContainText('Example Domain');
  await sidepanel.getByLabel('聊天输入').fill('先生成一条历史');
  await sidepanel.getByRole('button', { name: '发送' }).click();
  await expect(sidepanel.getByText('页面历史回答')).toBeVisible();
  await sidepanel.getByLabel('聊天输入').fill('这段草稿要保留');

  sidepanel.on('dialog', (dialog) => dialog.accept());
  await sidepanel.getByRole('button', { name: '清空当前页面数据' }).click();

  await expect(sidepanel.getByTestId('sidebar-extraction-panel')).not.toContainText('Example Domain');
  await expect(sidepanel.getByText('还没有聊天记录。')).toBeVisible();
  await expect(sidepanel.getByLabel('聊天输入')).toHaveValue('这段草稿要保留');

  await expect
    .poll(async () =>
      serviceWorker.evaluate(async () => {
        const all = await chrome.storage.local.get(null);
        return Object.keys(all).filter((key) => key.includes('https://example.com/'));
      }),
    )
    .toEqual([]);
});

test('标签级清空只移除当前 promptTab 历史，保留页面正文和其他标签会话', async ({ context, extensionId }) => {
  const serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    throw new Error('未找到扩展 service worker');
  }

  await serviceWorker.evaluate(async ({ storageKey }) => {
    await chrome.storage.local.set({
      [storageKey]: {
        version: '2.0.0',
        updatedAt: Date.now(),
        basic: {
          theme: 'system',
          language: 'zh-CN',
          defaultModelId: 'model-1',
          systemPrompt: '',
          filterCot: false,
          extractionMethod: 'readability',
          includePageContentByDefault: true,
        },
        models: [
          {
            id: 'model-1',
            name: '主模型',
            provider: 'openai-compatible',
            enabled: true,
            model: 'gpt-4.1-mini',
            baseUrl: 'https://api.example.com',
            apiKey: 'token',
            deployment: '',
            temperature: 0,
            tools: [],
            thinkingBudget: null,
            maxOutputTokens: null,
            supportsImages: true,
            order: 0,
            deletedAt: null,
          },
        ],
        quickInputs: [
          {
            id: 'quick-summary',
            name: '总结',
            prompt: '请总结当前页面',
            autoTrigger: false,
            modelId: 'model-1',
            order: 0,
            deletedAt: null,
          },
        ],
        sync: {
          enabled: false,
          provider: 'none',
          gistToken: '',
          gistId: '',
          webdavUrl: '',
          webdavUsername: '',
          webdavPassword: '',
          lastSyncAt: null,
        },
        blacklist: [],
      },
    });
    (globalThis as typeof globalThis & {
      __THINK_BOT_TEST_STREAM__?: Array<string>;
    }).__THINK_BOT_TEST_STREAM__ = ['标签清空测试响应'];
  }, {
    storageKey: CONFIG_STORAGE_KEY,
  });

  const page = await context.newPage();
  await page.goto('https://example.com/');
  await page.bringToFront();

  const tab = await serviceWorker.evaluate(async () => {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (!activeTab?.id || !activeTab.url) {
      throw new Error('未找到当前活动 browserTab');
    }
    return {
      id: activeTab.id,
      url: activeTab.url,
    };
  });

  const sidepanel = await context.newPage();
  await sidepanel.goto(
    `chrome-extension://${extensionId}/${EXTENSION_PAGES.sidePanel}?tabId=${tab.id}&pageUrl=${encodeURIComponent(tab.url)}`,
  );

  await expect(sidepanel.getByTestId('sidebar-extraction-panel')).toContainText('Example Domain');

  await sidepanel.getByLabel('聊天输入').fill('先生成 chat 历史');
  await sidepanel.getByRole('button', { name: '发送' }).click();
  await expect(sidepanel.getByText('标签清空测试响应')).toBeVisible();

  await sidepanel.getByRole('tab', { name: /总结/ }).click();
  await sidepanel.getByLabel('聊天输入').fill('再生成快捷标签历史');
  await sidepanel.getByRole('button', { name: '发送' }).click();
  await expect(sidepanel.getByRole('tabpanel', { name: /总结/ }).getByText('标签清空测试响应')).toBeVisible();

  sidepanel.on('dialog', (dialog) => dialog.accept());
  await sidepanel.getByRole('button', { name: '清空当前标签' }).click();

  await expect(sidepanel.getByText('已清空当前标签聊天记录')).toBeVisible();
  await expect(sidepanel.getByText('还没有聊天记录。')).toBeVisible();
  await expect(sidepanel.getByTestId('sidebar-extraction-panel')).toContainText('Example Domain');

  await sidepanel.getByRole('tab', { name: /Chat/ }).click();
  await expect(sidepanel.getByRole('tabpanel', { name: /Chat/ }).getByText('标签清空测试响应')).toBeVisible();

  await expect
    .poll(async () =>
      serviceWorker.evaluate(async ({ chatKey, quickKey }) => {
        const stored = await chrome.storage.local.get([chatKey, quickKey]);
        return {
          hasChatConversation: Boolean(stored[chatKey]),
          hasQuickConversation: Boolean(stored[quickKey]),
        };
      }, {
        chatKey: buildConversationStorageKey('https://example.com/', 'chat'),
        quickKey: buildConversationStorageKey('https://example.com/', 'quick-summary'),
      }),
    )
    .toEqual({
      hasChatConversation: true,
      hasQuickConversation: false,
    });
});

test('助手消息支持继续新增分支，并展示分支结果', async ({ context, extensionId }) => {
  const serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    throw new Error('未找到扩展 service worker');
  }

  await serviceWorker.evaluate(async ({ storageKey }) => {
    await chrome.storage.local.set({
      [storageKey]: {
        version: '2.0.0',
        updatedAt: Date.now(),
        basic: {
          theme: 'system',
          language: 'zh-CN',
          defaultModelId: 'model-1',
          branchModelIds: ['model-2'],
          systemPrompt: '',
          filterCot: false,
          extractionMethod: 'readability',
          includePageContentByDefault: true,
        },
        models: [
          {
            id: 'model-1',
            name: '主模型',
            provider: 'openai-compatible',
            enabled: true,
            model: 'gpt-4.1-mini',
            baseUrl: 'https://api.example.com',
            apiKey: 'token',
            deployment: '',
            temperature: 0,
            tools: [],
            thinkingBudget: null,
            maxOutputTokens: null,
            supportsImages: true,
            order: 0,
            deletedAt: null,
          },
          {
            id: 'model-2',
            name: '分支模型',
            provider: 'openai-compatible',
            enabled: true,
            model: 'gpt-4.1-mini',
            baseUrl: 'https://api.example.com',
            apiKey: 'token',
            deployment: '',
            temperature: 0,
            tools: [],
            thinkingBudget: null,
            maxOutputTokens: null,
            supportsImages: true,
            order: 1,
            deletedAt: null,
          },
        ],
        quickInputs: [],
        sync: {
          enabled: false,
          provider: 'none',
          gistToken: '',
          gistId: '',
          webdavUrl: '',
          webdavUsername: '',
          webdavPassword: '',
          lastSyncAt: null,
        },
        blacklist: [],
      },
    });
    (globalThis as typeof globalThis & {
      __THINK_BOT_TEST_STREAM__?: Array<string>;
    }).__THINK_BOT_TEST_STREAM__ = ['分支测试响应'];
  }, {
    storageKey: CONFIG_STORAGE_KEY,
  });

  const page = await context.newPage();
  await page.goto('https://example.com/');
  await page.bringToFront();

  const tab = await serviceWorker.evaluate(async () => {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (!activeTab?.id || !activeTab.url) {
      throw new Error('未找到当前活动 browserTab');
    }
    return {
      id: activeTab.id,
      url: activeTab.url,
    };
  });

  const sidepanel = await context.newPage();
  await sidepanel.goto(
    `chrome-extension://${extensionId}/${EXTENSION_PAGES.sidePanel}?tabId=${tab.id}&pageUrl=${encodeURIComponent(tab.url)}`,
  );

  await sidepanel.getByLabel('聊天输入').fill('先生成主回答');
  await sidepanel.getByRole('button', { name: '发送' }).click();
  await expect(sidepanel.getByText('分支测试响应')).toBeVisible();

  await sidepanel.getByRole('button', { name: '继续新增分支' }).click();
  await expect(sidepanel.getByText('分支 · 分支模型')).toBeVisible();
  await expect(sidepanel.getByRole('button', { name: '删除分支' })).toBeVisible();
});

test('用户消息支持编辑重发，助手消息支持重试并替换旧结果', async ({ context, extensionId }) => {
  const serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    throw new Error('未找到扩展 service worker');
  }

  await serviceWorker.evaluate(async ({ storageKey }) => {
    await chrome.storage.local.set({
      [storageKey]: {
        version: '2.0.0',
        updatedAt: Date.now(),
        basic: {
          theme: 'system',
          language: 'zh-CN',
          defaultModelId: 'model-1',
          branchModelIds: [],
          systemPrompt: '',
          filterCot: false,
          extractionMethod: 'readability',
          includePageContentByDefault: true,
        },
        models: [
          {
            id: 'model-1',
            name: '主模型',
            provider: 'openai-compatible',
            enabled: true,
            model: 'gpt-4.1-mini',
            baseUrl: 'https://api.example.com',
            apiKey: 'token',
            deployment: '',
            temperature: 0,
            tools: [],
            thinkingBudget: null,
            maxOutputTokens: null,
            supportsImages: true,
            order: 0,
            deletedAt: null,
          },
        ],
        quickInputs: [],
        sync: {
          enabled: false,
          provider: 'none',
          gistToken: '',
          gistId: '',
          webdavUrl: '',
          webdavUsername: '',
          webdavPassword: '',
          lastSyncAt: null,
        },
        blacklist: [],
      },
    });
    (globalThis as typeof globalThis & {
      __THINK_BOT_TEST_STREAM__?: Array<string>;
    }).__THINK_BOT_TEST_STREAM__ = ['旧回答'];
  }, {
    storageKey: CONFIG_STORAGE_KEY,
  });

  const page = await context.newPage();
  await page.goto('https://example.com/');
  await page.bringToFront();

  const tab = await serviceWorker.evaluate(async () => {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (!activeTab?.id || !activeTab.url) {
      throw new Error('未找到当前活动 browserTab');
    }
    return {
      id: activeTab.id,
      url: activeTab.url,
    };
  });

  const sidepanel = await context.newPage();
  await sidepanel.goto(
    `chrome-extension://${extensionId}/${EXTENSION_PAGES.sidePanel}?tabId=${tab.id}&pageUrl=${encodeURIComponent(tab.url)}`,
  );

  await sidepanel.getByLabel('聊天输入').fill('旧问题');
  await sidepanel.getByRole('button', { name: '发送' }).click();
  await expect(sidepanel.getByText('旧回答')).toBeVisible();

  await serviceWorker.evaluate(() => {
    (globalThis as typeof globalThis & {
      __THINK_BOT_TEST_STREAM__?: Array<string>;
    }).__THINK_BOT_TEST_STREAM__ = ['编辑后回答'];
  });

  await sidepanel.getByRole('button', { name: '编辑' }).click();
  await sidepanel.getByLabel('编辑消息输入').fill('新问题');
  await sidepanel.getByRole('button', { name: '保存并重发' }).click();

  await expect(sidepanel.getByText('新问题')).toBeVisible();
  await expect(sidepanel.getByText('编辑后回答')).toBeVisible();
  await expect(sidepanel.getByText('旧回答')).toHaveCount(0);

  await expect
    .poll(async () =>
      serviceWorker.evaluate(({ key }) => chrome.storage.local.get(key).then((stored) => stored[key]), {
        key: buildConversationStorageKey('https://example.com/', 'chat'),
      }),
    )
    .toMatchObject({
      promptTabId: 'chat',
      messages: [
        expect.objectContaining({
          role: 'user',
          content: '新问题',
        }),
        expect.objectContaining({
          role: 'assistant',
          content: '编辑后回答',
        }),
      ],
    });

  const conversationAfterEdit = await serviceWorker.evaluate(({ key }) => chrome.storage.local.get(key).then((stored) => stored[key]), {
    key: buildConversationStorageKey('https://example.com/', 'chat'),
  });

  const previousAssistantId = (conversationAfterEdit as {
    messages: Array<{ id: string; role: string }>;
  }).messages.find((message) => message.role === 'assistant')?.id;
  expect(previousAssistantId).toBeTruthy();

  await serviceWorker.evaluate(() => {
    (globalThis as typeof globalThis & {
      __THINK_BOT_TEST_STREAM__?: Array<string>;
    }).__THINK_BOT_TEST_STREAM__ = ['重试后回答'];
  });

  await sidepanel.getByRole('button', { name: '重试' }).click();
  await expect(sidepanel.getByText('重试后回答')).toBeVisible();

  await expect
    .poll(async () =>
      serviceWorker.evaluate(({ key }) => chrome.storage.local.get(key).then((stored) => stored[key]), {
        key: buildConversationStorageKey('https://example.com/', 'chat'),
      }),
    )
    .toMatchObject({
      promptTabId: 'chat',
      messages: [
        expect.objectContaining({
          role: 'user',
          content: '新问题',
        }),
        expect.objectContaining({
          role: 'assistant',
          content: '重试后回答',
          retryFromMessageId: previousAssistantId,
        }),
      ],
    });

  await expect(sidepanel.getByText('编辑后回答')).toHaveCount(0);
});

test('图片预览可移除，提取区和输入区支持拖拽后仍可发送', async ({ context, extensionId }) => {
  const serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    throw new Error('未找到扩展 service worker');
  }

  await serviceWorker.evaluate(async ({ storageKey }) => {
    await chrome.storage.local.set({
      [storageKey]: {
        version: '2.0.0',
        updatedAt: Date.now(),
        basic: {
          theme: 'system',
          language: 'zh-CN',
          defaultModelId: 'model-1',
          branchModelIds: [],
          systemPrompt: '',
          filterCot: false,
          extractionMethod: 'readability',
          includePageContentByDefault: true,
        },
        models: [
          {
            id: 'model-1',
            name: '主模型',
            provider: 'openai-compatible',
            enabled: true,
            model: 'gpt-4.1-mini',
            baseUrl: 'https://api.example.com',
            apiKey: 'token',
            deployment: '',
            temperature: 0,
            tools: [],
            thinkingBudget: null,
            maxOutputTokens: null,
            supportsImages: true,
            order: 0,
            deletedAt: null,
          },
        ],
        quickInputs: [],
        sync: {
          enabled: false,
          provider: 'none',
          gistToken: '',
          gistId: '',
          webdavUrl: '',
          webdavUsername: '',
          webdavPassword: '',
          lastSyncAt: null,
        },
        blacklist: [],
      },
    });
    (globalThis as typeof globalThis & {
      __THINK_BOT_TEST_STREAM__?: Array<string>;
      __THINK_BOT_TEST_LAST_STREAM_MESSAGES__?: Array<{ role: string; content: string; images: string[] }>;
    }).__THINK_BOT_TEST_STREAM__ = ['拖拽后发送成功'];
    (globalThis as typeof globalThis & {
      __THINK_BOT_TEST_LAST_STREAM_MESSAGES__?: Array<{ role: string; content: string; images: string[] }>;
    }).__THINK_BOT_TEST_LAST_STREAM_MESSAGES__ = [];
  }, {
    storageKey: CONFIG_STORAGE_KEY,
  });

  const page = await context.newPage();
  await page.goto('https://example.com/');
  await page.bringToFront();

  const tab = await serviceWorker.evaluate(async () => {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (!activeTab?.id || !activeTab.url) {
      throw new Error('未找到当前活动 browserTab');
    }
    return {
      id: activeTab.id,
      url: activeTab.url,
    };
  });

  const sidepanel = await context.newPage();
  await sidepanel.goto(
    `chrome-extension://${extensionId}/${EXTENSION_PAGES.sidePanel}?tabId=${tab.id}&pageUrl=${encodeURIComponent(tab.url)}`,
  );

  await expect(sidepanel.getByTestId('sidebar-extraction-panel')).toContainText('Example Domain');
  await sidepanel.getByLabel('添加图片').setInputFiles({
    name: 'dot.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0j8AAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(sidepanel.getByAltText('已选图片 1')).toBeVisible();

  const extractionHeightBefore = await sidepanel.getByTestId('sidebar-extraction-panel').evaluate((element) => element.getBoundingClientRect().height);
  const extractionHandleBox = await sidepanel.getByTestId('sidebar-extraction-resize-handle').boundingBox();
  if (!extractionHandleBox) {
    throw new Error('未找到提取区拖拽手柄');
  }
  await sidepanel.mouse.move(extractionHandleBox.x + extractionHandleBox.width / 2, extractionHandleBox.y + extractionHandleBox.height / 2);
  await sidepanel.mouse.down();
  await sidepanel.mouse.move(extractionHandleBox.x + extractionHandleBox.width / 2, extractionHandleBox.y + extractionHandleBox.height / 2 + 40);
  await sidepanel.mouse.up();

  const composerHeightBefore = await sidepanel.getByLabel('聊天输入').evaluate((element) => element.getBoundingClientRect().height);
  const composerHandleBox = await sidepanel.getByTestId('chat-input-resize-handle').boundingBox();
  if (!composerHandleBox) {
    throw new Error('未找到输入区拖拽手柄');
  }
  await sidepanel.mouse.move(composerHandleBox.x + composerHandleBox.width / 2, composerHandleBox.y + composerHandleBox.height / 2);
  await sidepanel.mouse.down();
  await sidepanel.mouse.move(composerHandleBox.x + composerHandleBox.width / 2, composerHandleBox.y + composerHandleBox.height / 2 - 40);
  await sidepanel.mouse.up();

  await expect
    .poll(async () => sidepanel.getByTestId('sidebar-extraction-panel').evaluate((element) => element.getBoundingClientRect().height))
    .toBeGreaterThan(extractionHeightBefore + 20);
  await expect
    .poll(async () => sidepanel.getByLabel('聊天输入').evaluate((element) => element.getBoundingClientRect().height))
    .toBeGreaterThan(composerHeightBefore + 20);

  await sidepanel.getByRole('button', { name: '移除图片 1' }).click();
  await expect(sidepanel.getByAltText('已选图片 1')).toHaveCount(0);

  await sidepanel.getByLabel('聊天输入').fill('检查移除后发送');
  await sidepanel.getByRole('button', { name: '发送' }).click();
  await expect(sidepanel.getByText('拖拽后发送成功')).toBeVisible();

  await expect
    .poll(async () =>
      serviceWorker.evaluate(() =>
        (globalThis as typeof globalThis & {
          __THINK_BOT_TEST_LAST_STREAM_MESSAGES__?: Array<{ role: string; content: string; images: string[] }>;
        }).__THINK_BOT_TEST_LAST_STREAM_MESSAGES__ ?? [],
      ),
    )
    .toMatchObject([
      {
        role: 'user',
        images: [],
      },
    ]);
  const streamedMessages = await serviceWorker.evaluate(() =>
    (globalThis as typeof globalThis & {
      __THINK_BOT_TEST_LAST_STREAM_MESSAGES__?: Array<{ role: string; content: string; images: string[] }>;
    }).__THINK_BOT_TEST_LAST_STREAM_MESSAGES__ ?? [],
  );
  expect(streamedMessages[0]?.content).toContain('用户消息：检查移除后发送');
});
