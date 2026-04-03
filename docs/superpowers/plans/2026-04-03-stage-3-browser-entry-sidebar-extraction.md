# 阶段 3 浏览器入口、消息总线、侧边栏壳层与提取 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打通“点击扩展图标 -> 按 `browserTab` 打开 side panel -> side panel 主动拉取 bootstrap -> 黑名单判定 -> 页面提取结果展示”的最小可运行闭环。

**Architecture:** 保持 `background service worker` 作为唯一高权限协调层，浏览器入口、typed command、黑名单判定和提取编排都放在 background；`content script` 只负责最小 DOM/元数据采集；`sidepanel` 只负责主动发起 bootstrap、展示恢复态和提取结果。长连接 port 只把协议框架搭起来，不提前实现阶段 4 的真实流式聊天。

**Tech Stack:** WXT、Chrome MV3、React 18、TypeScript、Zod、Vitest、React Testing Library、Playwright、Tailwind CSS v4、shadcn/ui、@mozilla/readability

---

## File Structure

### 新建文件

- `entrypoints/content.ts`
  - content script 入口，只处理页面 DOM 与元数据采集请求。
- `src/services/browser-entry/browser-entry.ts`
  - 统一封装扩展图标点击、右键菜单、首次安装、`browserTab` 切换后的 side panel 启停行为。
- `src/services/runtime-messaging/sidebar-contract.ts`
  - 阶段 3 侧边栏 one-shot command、port 名称、Zod schema、响应类型。
- `src/services/runtime-messaging/sidebar-commands.ts`
  - `GET_SIDEBAR_BOOTSTRAP`、`CONFIRM_BLACKLIST_CONTINUE`、`SWITCH_EXTRACTION_METHOD`、`RE_EXTRACT_CONTENT` 最小处理器。
- `src/services/runtime-messaging/sender.ts`
  - extension page sender 校验。
- `src/services/runtime-messaging/port-bus.ts`
  - long-lived port 的最小注册、断连、恢复事件广播框架。
- `src/services/extraction/extraction-service.ts`
  - 提取编排：缓存优先、Readability 优先、Jina 回退、content script 自动刷新重试。
- `src/services/extraction/content-source.ts`
  - 向 content script 请求页面 HTML/元数据，并处理“断连 -> 自动刷新一次 -> 重试”的逻辑。
- `src/services/extraction/jina-client.ts`
  - Jina HTTP 请求封装。
- `src/services/blacklist/blacklist-service.ts`
  - 黑名单规则匹配和放行判定。
- `src/features/sidebar/sidebar-api.ts`
  - side panel 端的 command 调用封装。
- `src/features/sidebar/sidebar-shell.tsx`
  - 阶段 3 侧边栏最小工作台壳层。
- `tests/unit/services/runtime-messaging.spec.ts`
  - typed command、sender 校验、port 协议测试。
- `tests/unit/services/extraction.spec.ts`
  - 提取链路单测。
- `tests/unit/services/blacklist.spec.ts`
  - 黑名单服务单测。
- `tests/component/sidebar/sidebar-shell.spec.tsx`
  - 侧边栏壳层组件测试。
- `tests/e2e/helpers/browser-entry-driver.ts`
  - 浏览器入口测试驱动，隔离 Playwright 对扩展按钮可操作性的差异。
- `tests/e2e/browser-entry.spec.ts`
  - 扩展图标、受限页退化、右键菜单、首次安装 E2E。
- `tests/e2e/sidebar-extraction.spec.ts`
  - 两阶段 bootstrap、缓存优先、黑名单确认、提取回退、`browserTab` 切换语义 E2E。

### 修改文件

- `package.json`
  - 增加 `@mozilla/readability` 运行时依赖。
- `wxt.config.ts`
  - 补 `host_permissions`，统一 `side_panel.default_path` 为 `sidepanel.html`。
- `entrypoints/background.ts`
  - 组合 browser entry、runtime command、port bus、blacklist、extraction。
- `entrypoints/sidepanel/main.tsx`
  - 从占位 `PageShell` 切到真实 `SidebarShell`。
- `src/repositories/page-repository.ts`
  - 补最小页面缓存更新辅助方法，避免 background 直接拼装 page record。
- `src/repositories/conversation-repository.ts`
  - 补 side panel bootstrap 所需的页面级 conversation/loading 查询方法。
- `src/services/logger/logger.ts`
  - 保持现有实现简单，补事件级别约束测试需要的最小导出。
- `tests/unit/repositories/page-repository.spec.ts`
  - 覆盖提取结果写回不清空旧缓存。
- `tests/unit/repositories/conversation-repository.spec.ts`
  - 覆盖按页面读取会话/loading 摘要。
- `tests/unit/services/logger/logger.spec.ts`
  - 扩大为阶段 3 事件名、级别、脱敏契约测试。
- `docs/browser-entry.md`
- `docs/Platform/chrome-mv3-runtime.md`
- `docs/Services/runtime-messaging.md`
- `docs/Services/extraction.md`
- `docs/Services/blacklist.md`
- `docs/Services/logger.md`
- `docs/Workspace/sidebar.md`
- `docs/flow.md`
- `docs/test/browser-automation.md`
- `docs/test/sidebar-core.md`
  - 同步阶段 3 的实现约束、测试口径和已选技术方案。

## 实施约束

- 只做阶段 3 必需闭环，不提前落地阶段 4 的真实流式聊天。
- `content script` 只返回页面源数据，不持有配置、不做远端请求。
- `GET_SIDEBAR_BOOTSTRAP` 只返回恢复态和判定结果，不在命令内隐式触发提取。
- 黑名单放行只作用于当前打开行为，必须放内存态令牌，不能写入 `chrome.storage.local`。
- 已有缓存时，提取失败不能清空旧内容。
- `browserTab` 切换后只允许自动隐藏，不允许切回原 `browserTab` 时自动恢复。

### Task 1: 锁定阶段 3 typed command 与 bootstrap 契约

**Files:**
- Create: `src/services/runtime-messaging/sidebar-contract.ts`
- Create: `src/services/runtime-messaging/sidebar-commands.ts`
- Create: `src/services/runtime-messaging/sender.ts`
- Create: `src/services/runtime-messaging/port-bus.ts`
- Modify: `src/repositories/conversation-repository.ts`
- Test: `tests/unit/services/runtime-messaging.spec.ts`
- Test: `tests/unit/repositories/conversation-repository.spec.ts`

- [ ] **Step 1: 先写 runtime messaging 失败单测**

```ts
import { describe, expect, it, vi } from 'vitest';

import {
  createSidebarCommandHandler,
  isSidebarCommandMessage,
  sidebarCommandTypes,
} from '../../../src/services/runtime-messaging/sidebar-commands';

describe('runtime messaging stage 3', () => {
  it('识别阶段 3 侧边栏命令并拒绝未知命令', () => {
    expect(Array.from(sidebarCommandTypes)).toEqual([
      'GET_SIDEBAR_BOOTSTRAP',
      'CONFIRM_BLACKLIST_CONTINUE',
      'SWITCH_EXTRACTION_METHOD',
      'RE_EXTRACT_CONTENT',
    ]);
    expect(isSidebarCommandMessage({ type: 'GET_SIDEBAR_BOOTSTRAP' })).toBe(true);
    expect(isSidebarCommandMessage({ type: 'CLEAR_PAGE_CONTEXT' })).toBe(false);
  });

  it('GET_SIDEBAR_BOOTSTRAP 只返回恢复态，不在处理器里直接触发提取', async () => {
    const extractionService = {
      extractPage: vi.fn(),
    };
    const handler = createSidebarCommandHandler({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      blacklistService: {
        checkUrl: vi.fn().mockReturnValue({ blocked: false, matchedRuleId: null }),
      },
      extractionService,
      pageRepository: {
        getPage: vi.fn().mockResolvedValue(null),
        saveExtractionResult: vi.fn(),
      },
      conversationRepository: {
        listPageConversations: vi.fn().mockResolvedValue([]),
        listPageLoadingStates: vi.fn().mockResolvedValue([]),
      },
      runtime: { id: 'ext-id' },
      bypassStore: new Map(),
    });

    const result = await handler(
      {
        type: 'GET_SIDEBAR_BOOTSTRAP',
        tabId: 7,
        pageUrl: 'https://example.com/article',
      },
      {
        id: 'ext-id',
        url: 'chrome-extension://ext-id/sidepanel.html',
      },
    );

    expect(result).toMatchObject({
      type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
      payload: {
        blockedByBlacklist: false,
        shouldExtract: true,
      },
    });
    expect(extractionService.extractPage).not.toHaveBeenCalled();
  });

  it('CLEAR_PAGE_CONTEXT 与 CLEAR_TAB_CONVERSATION 不属于阶段 3 命令集合', () => {
    expect(isSidebarCommandMessage({ type: 'CLEAR_PAGE_CONTEXT' })).toBe(false);
    expect(isSidebarCommandMessage({ type: 'CLEAR_TAB_CONVERSATION' })).toBe(false);
  });
});
```

- [ ] **Step 2: 先写 conversation repository 失败单测，补 bootstrap 读取边界**

```ts
it('按页面返回 conversation 与 loading 摘要，避免 background 直接扫 storage key', async () => {
  const storage = createFakeStorage({
    'conversation:https://example.com/article:chat': conversation,
    'loading:https://example.com/article:chat': loading,
    'conversation:https://example.com/other:chat': otherConversation,
  });
  const repository = createConversationRepository(storage);

  await expect(repository.listPageConversations('https://example.com/article')).resolves.toEqual([conversation]);
  await expect(repository.listPageLoadingStates('https://example.com/article')).resolves.toEqual([loading]);
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm test:unit -- tests/unit/services/runtime-messaging.spec.ts tests/unit/repositories/conversation-repository.spec.ts -v`
Expected: FAIL，提示缺少 `sidebar-commands` 导出、缺少 `listPageConversations` / `listPageLoadingStates`。

- [ ] **Step 4: 写最小消息契约、sender 校验和 port 框架**

```ts
import { z } from 'zod';

export const sidebarCommandTypes = new Set([
  'GET_SIDEBAR_BOOTSTRAP',
  'CONFIRM_BLACKLIST_CONTINUE',
  'SWITCH_EXTRACTION_METHOD',
  'RE_EXTRACT_CONTENT',
] as const);

export const getSidebarBootstrapSchema = z.object({
  type: z.literal('GET_SIDEBAR_BOOTSTRAP'),
  tabId: z.number().int().positive(),
  pageUrl: z.string().url(),
});

export const validateExtensionPageSender = ({
  sender,
  runtimeId,
  expectedPage,
}: {
  sender: chrome.runtime.MessageSender;
  runtimeId: string;
  expectedPage: string;
}) => {
  if (sender.id !== runtimeId) {
    throw new Error('invalid sender id');
  }
  if (!sender.url?.endsWith(expectedPage)) {
    throw new Error(`invalid sender page: ${sender.url ?? 'unknown'}`);
  }
};
```

- [ ] **Step 5: 写最小 bootstrap 处理器和 conversation 摘要查询**

```ts
const bootstrap = getSidebarBootstrapSchema.parse(message);
validateExtensionPageSender({
  sender,
  runtimeId: runtime.id,
  expectedPage: 'sidepanel.html',
});

const normalizedUrl = normalizePageUrl(bootstrap.pageUrl);
const page = await pageRepository.getPage(normalizedUrl);
const conversations = await conversationRepository.listPageConversations(normalizedUrl);
const loadingStates = await conversationRepository.listPageLoadingStates(normalizedUrl);
const blacklist = blacklistService.checkUrl(bootstrap.pageUrl);

return {
  type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
  payload: {
    browserTabId: bootstrap.tabId,
    normalizedUrl,
    page,
    conversations,
    loadingStates,
    blockedByBlacklist: blacklist.blocked,
    matchedRuleId: blacklist.matchedRuleId,
    shouldExtract: !page?.content,
  },
};
```

- [ ] **Step 6: 运行测试确认转绿**

Run: `pnpm test:unit -- tests/unit/services/runtime-messaging.spec.ts tests/unit/repositories/conversation-repository.spec.ts -v`
Expected: PASS。

- [ ] **Step 7: 提交当前小步**

```bash
git add tests/unit/services/runtime-messaging.spec.ts tests/unit/repositories/conversation-repository.spec.ts src/services/runtime-messaging/sidebar-contract.ts src/services/runtime-messaging/sidebar-commands.ts src/services/runtime-messaging/sender.ts src/services/runtime-messaging/port-bus.ts src/repositories/conversation-repository.ts
git commit -m "feat: add stage 3 sidebar messaging contracts"
```

### Task 2: 锁定黑名单与提取服务的最小业务闭环

**Files:**
- Modify: `package.json`
- Modify: `wxt.config.ts`
- Create: `src/services/blacklist/blacklist-service.ts`
- Create: `src/services/extraction/content-source.ts`
- Create: `src/services/extraction/jina-client.ts`
- Create: `src/services/extraction/extraction-service.ts`
- Modify: `src/repositories/page-repository.ts`
- Test: `tests/unit/services/blacklist.spec.ts`
- Test: `tests/unit/services/extraction.spec.ts`
- Test: `tests/unit/repositories/page-repository.spec.ts`

- [ ] **Step 1: 先写 blacklist 失败单测**

```ts
import { describe, expect, it } from 'vitest';

import { createBlacklistService } from '../../../src/services/blacklist/blacklist-service';

describe('blacklist service', () => {
  it('命中启用规则时阻断当前打开行为', () => {
    const service = createBlacklistService({
      rules: [
        { id: 'search', type: 'domain', pattern: 'google.com', enabled: true, deletedAt: null },
      ],
    });

    expect(service.checkUrl('https://www.google.com/search?q=ai')).toEqual({
      blocked: true,
      matchedRuleId: 'search',
    });
  });

  it('禁用规则和软删除规则不参与阻断', () => {
    const service = createBlacklistService({
      rules: [
        { id: 'disabled', type: 'domain', pattern: 'google.com', enabled: false, deletedAt: null },
        { id: 'deleted', type: 'domain', pattern: 'bing.com', enabled: true, deletedAt: 1 },
      ],
    });

    expect(service.checkUrl('https://www.google.com/search?q=ai')).toEqual({
      blocked: false,
      matchedRuleId: null,
    });
  });
});
```

- [ ] **Step 2: 先写 extraction 失败单测**

```ts
import { describe, expect, it, vi } from 'vitest';

import { createExtractionService } from '../../../src/services/extraction/extraction-service';

describe('extraction service', () => {
  it('Readability 成功时不走 Jina 回退', async () => {
    const service = createExtractionService({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      contentSource: {
        collect: vi.fn().mockResolvedValue({
          url: 'https://example.com/article',
          title: 'Example',
          html: '<article><h1>Title</h1><p>Body</p></article>',
          text: 'Title Body',
          faviconUrl: '',
        }),
      },
      readabilityExtractor: {
        extract: vi.fn().mockReturnValue({
          content: 'Title\n\nBody',
          title: 'Title',
        }),
      },
      jinaClient: {
        extract: vi.fn(),
      },
      pageRepository: {
        saveExtractionResult: vi.fn().mockImplementation(async (value) => value),
      },
    });

    const result = await service.extractPage({
      tabId: 7,
      pageUrl: 'https://example.com/article',
      method: 'readability',
    });

    expect(result.method).toBe('readability');
    expect(result.content).toContain('Body');
    expect(jinaClient.extract).not.toHaveBeenCalled();
  });

  it('Readability 失败后回退到 Jina', async () => {
    const service = createExtractionService({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      contentSource: {
        collect: vi.fn().mockResolvedValue({
          url: 'https://example.com/article',
          title: 'Example',
          html: '<html><body><div>fallback</div></body></html>',
          text: 'fallback',
          faviconUrl: '',
        }),
      },
      readabilityExtractor: {
        extract: vi.fn().mockReturnValue(null),
      },
      jinaClient: {
        extract: vi.fn().mockResolvedValue('Jina body'),
      },
      pageRepository: {
        saveExtractionResult: vi.fn().mockImplementation(async (value) => value),
      },
    });

    await expect(
      service.extractPage({
        tabId: 7,
        pageUrl: 'https://example.com/article',
        method: 'readability',
      }),
    ).resolves.toMatchObject({
      method: 'jina',
      content: 'Jina body',
    });
  });
});
```

- [ ] **Step 3: 补 content script 自动刷新重试和空 HTML 失败用例**

```ts
it('content script 未连接时自动刷新一次再重试', async () => {
  const collect = vi
    .fn()
    .mockRejectedValueOnce(new Error('content script unavailable'))
    .mockResolvedValueOnce({
      url: 'https://example.com/article',
      title: 'Example',
      html: '<article><p>Recovered</p></article>',
      text: 'Recovered',
      faviconUrl: '',
    });
  const reload = vi.fn().mockResolvedValue(undefined);

  const contentSource = createContentSource({
    tabs: { sendMessage: collect, reload },
  });

  await expect(contentSource.collect({ tabId: 7 })).resolves.toMatchObject({
    text: 'Recovered',
  });
  expect(reload).toHaveBeenCalledTimes(1);
});

it('空 HTML 直接失败，不向 Jina 发送空内容', async () => {
  const jinaClient = { extract: vi.fn() };
  const service = createExtractionService({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    contentSource: {
      collect: vi.fn().mockResolvedValue({
        url: 'https://example.com/article',
        title: 'Empty',
        html: '   ',
        text: '',
        faviconUrl: '',
      }),
    },
    readabilityExtractor: { extract: vi.fn() },
    jinaClient,
    pageRepository: { saveExtractionResult: vi.fn() },
  });

  await expect(
    service.extractPage({ tabId: 7, pageUrl: 'https://example.com/article', method: 'readability' }),
  ).rejects.toThrow(/empty html/i);
  expect(jinaClient.extract).not.toHaveBeenCalled();
});
```

- [ ] **Step 4: 运行测试确认失败**

Run: `pnpm test:unit -- tests/unit/services/blacklist.spec.ts tests/unit/services/extraction.spec.ts tests/unit/repositories/page-repository.spec.ts -v`
Expected: FAIL，提示缺少 `blacklist-service`、`extraction-service`、`saveExtractionResult`。

- [ ] **Step 5: 先补依赖和 manifest 最小变更**

```json
{
  "dependencies": {
    "@mozilla/readability": "^0.6.0"
  }
}
```

```ts
export default defineConfig({
  manifest: {
    permissions: ['storage', 'sidePanel', 'activeTab', 'scripting', 'downloads', 'contextMenus', 'unlimitedStorage'],
    host_permissions: ['https://r.jina.ai/*'],
    side_panel: {
      default_path: 'sidepanel.html',
    },
  },
});
```

- [ ] **Step 6: 写最小黑名单服务**

```ts
export const createBlacklistService = ({
  rules,
}: {
  rules: Array<{
    id: string;
    type: 'domain' | 'url-prefix' | 'regex';
    pattern: string;
    enabled: boolean;
    deletedAt: number | null;
  }>;
}) => {
  const activeRules = rules.filter((rule) => rule.enabled && rule.deletedAt === null);

  return {
    checkUrl(url: string) {
      for (const rule of activeRules) {
        if (rule.type === 'domain' && new URL(url).hostname.includes(rule.pattern)) {
          return { blocked: true, matchedRuleId: rule.id };
        }
        if (rule.type === 'url-prefix' && url.startsWith(rule.pattern)) {
          return { blocked: true, matchedRuleId: rule.id };
        }
        if (rule.type === 'regex' && new RegExp(rule.pattern).test(url)) {
          return { blocked: true, matchedRuleId: rule.id };
        }
      }

      return { blocked: false, matchedRuleId: null };
    },
  };
};
```

- [ ] **Step 7: 写最小 content source 与提取服务**

```ts
export const createContentSource = ({
  tabs,
}: {
  tabs: Pick<typeof chrome.tabs, 'sendMessage' | 'reload'>;
}) => ({
  async collect({ tabId }: { tabId: number }) {
    try {
      return await tabs.sendMessage(tabId, { type: 'COLLECT_PAGE_SOURCE' });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (!reason.includes('Receiving end does not exist')) {
        throw error;
      }
      await tabs.reload(tabId);
      return tabs.sendMessage(tabId, { type: 'COLLECT_PAGE_SOURCE' });
    }
  },
});
```

```ts
const pageSource = await contentSource.collect({ tabId: input.tabId });
if (!pageSource.html.trim()) {
  throw new Error('empty html');
}

logger.info('extraction.started', { tabId: input.tabId, method: input.method });

if (input.method === 'readability') {
  const parsed = readabilityExtractor.extract(pageSource.html, pageSource.url);
  if (parsed?.content.trim()) {
    return pageRepository.saveExtractionResult({
      normalizedUrl: normalizePageUrl(pageSource.url),
      url: pageSource.url,
      title: parsed.title || pageSource.title,
      faviconUrl: pageSource.faviconUrl,
      content: parsed.content,
      extractionMethod: 'readability',
    });
  }

  logger.warn('extraction.readability_failed', {
    tabId: input.tabId,
    normalizedUrl: normalizePageUrl(pageSource.url),
  });
}

logger.info('extraction.jina_fallback_started', { tabId: input.tabId });
const jinaContent = await jinaClient.extract(pageSource.url);
return pageRepository.saveExtractionResult({
  normalizedUrl: normalizePageUrl(pageSource.url),
  url: pageSource.url,
  title: pageSource.title,
  faviconUrl: pageSource.faviconUrl,
  content: jinaContent,
  extractionMethod: 'jina',
});
```

- [ ] **Step 8: 给 page repository 增加提取结果写回辅助方法**

```ts
async saveExtractionResult(input: {
  normalizedUrl: string;
  url: string;
  title: string;
  faviconUrl: string;
  content: string;
  extractionMethod: 'readability' | 'jina';
}) {
  const result = await storage.get<Record<string, unknown>>([getPageKey(input.normalizedUrl)]);
  const currentValue = result[getPageKey(input.normalizedUrl)];
  const current = currentValue ? pageRecordSchema.parse(currentValue) : null;
  const now = Date.now();
  const next = pageRecordSchema.parse({
    ...(current ?? buildPageRecord({ url: input.url, now })),
    title: input.title,
    faviconUrl: input.faviconUrl,
    content: input.content,
    extractionMethod: input.extractionMethod,
    updatedAt: now,
    expiresAt: now + NINETY_DAYS,
  });
  await storage.set({ [getPageKey(input.normalizedUrl)]: next });
  return next;
}
```

- [ ] **Step 9: 运行测试确认转绿**

Run: `pnpm test:unit -- tests/unit/services/blacklist.spec.ts tests/unit/services/extraction.spec.ts tests/unit/repositories/page-repository.spec.ts -v`
Expected: PASS。

- [ ] **Step 10: 提交当前小步**

```bash
git add package.json pnpm-lock.yaml wxt.config.ts src/services/blacklist/blacklist-service.ts src/services/extraction/content-source.ts src/services/extraction/jina-client.ts src/services/extraction/extraction-service.ts src/repositories/page-repository.ts tests/unit/services/blacklist.spec.ts tests/unit/services/extraction.spec.ts tests/unit/repositories/page-repository.spec.ts
git commit -m "feat: add stage 3 extraction and blacklist services"
```

### Task 3: 实现 content script 与 browser entry 行为

**Files:**
- Create: `entrypoints/content.ts`
- Create: `src/services/browser-entry/browser-entry.ts`
- Modify: `entrypoints/background.ts`
- Test: `tests/e2e/browser-entry.spec.ts`

- [ ] **Step 1: 先写 browser entry 失败 E2E**

```ts
import { openBrowserActionForTab } from './helpers/browser-entry-driver';
import { EXTENSION_PAGES } from '../../src/shared/extension-pages';
import { expect, test } from './helpers/extension-fixture';

test('普通网页点击扩展图标后按 tab 打开 side panel', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto('https://example.com/');
  await openBrowserActionForTab({ context, extensionId, page });

  const sidepanel = await context.waitForEvent('page');
  await expect(sidepanel).toHaveURL(new RegExp(`${EXTENSION_PAGES.sidePanel}$`));
});

test('受限页点击扩展图标时退化到 conversations', async ({ context, extensionId }) => {
  const restricted = await context.newPage();
  await restricted.goto(`chrome-extension://${extensionId}/options.html`);
  await openBrowserActionForTab({ context, extensionId, page: restricted });

  const conversations = await context.waitForEvent('page');
  await expect(conversations).toHaveURL(new RegExp(`${EXTENSION_PAGES.conversations}$`));
});
```

- [ ] **Step 2: 运行 E2E 确认失败**

Run: `pnpm test:e2e -- tests/e2e/browser-entry.spec.ts`
Expected: FAIL，当前没有浏览器入口测试驱动，也没有 `browserTab` 切换清理逻辑。

- [ ] **Step 3: 先补浏览器入口测试驱动，避免把测试钩子混入生产命令协议**

```ts
import type { BrowserContext, Page } from '@playwright/test';

export const openBrowserActionForTab = async ({
  context,
  extensionId,
  page,
}: {
  context: BrowserContext;
  extensionId: string;
  page: Page;
}) => {
  const serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    throw new Error('未找到扩展 service worker。');
  }

  await serviceWorker.evaluate(async ({ extensionId, url }) => {
    const [tab] = await chrome.tabs.query({ url });
    if (!tab?.id) {
      throw new Error(`未找到目标 browserTab: ${url}`);
    }
    await chrome.runtime.sendMessage({
      type: '__E2E_BROWSER_ACTION_CLICK__',
      extensionId,
      tabId: tab.id,
      url,
    });
  }, {
    extensionId,
    url: page.url(),
  });
};
```

- [ ] **Step 4: 写 content script 最小页面采集能力**

```ts
import { defineContentScript } from 'wxt/utils/define-content-script';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== 'COLLECT_PAGE_SOURCE') {
        return false;
      }

      const favicon =
        document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href ?? '';

      sendResponse({
        url: location.href,
        title: document.title,
        html: document.documentElement.outerHTML,
        text: document.body?.innerText ?? '',
        faviconUrl: favicon,
      });
      return true;
    });
  },
});
```

- [ ] **Step 5: 提取 browser entry 行为到独立服务**

```ts
export const createBrowserEntryService = ({
  logger,
  runtime,
  tabs,
  sidePanel,
  contextMenus,
  action,
}: BrowserEntryDependencies) => {
  const enabledTabIds = new Set<number>();

  const openSidePanelForTab = async (tabId: number) => {
    await sidePanel.setOptions({ tabId, path: EXTENSION_PAGES.sidePanel, enabled: true });
    await sidePanel.open({ tabId });
    enabledTabIds.add(tabId);
    logger.info('panel.open.requested', { browserTabId: tabId });
  };

  const handleTabActivated = async ({ tabId }: { tabId: number }) => {
    for (const openedTabId of Array.from(enabledTabIds)) {
      if (openedTabId === tabId) {
        continue;
      }
      enabledTabIds.delete(openedTabId);
      await sidePanel.setOptions({ tabId: openedTabId, enabled: false });
    }
  };

  return {
    openSidePanelForTab,
    handleTabActivated,
  };
};
```

- [ ] **Step 6: 在 background 接入 action、安装、右键菜单、tab 切换清理和 E2E 驱动复用入口**

```ts
const browserEntry = createBrowserEntryService({
  logger,
  runtime: chrome.runtime,
  tabs: chrome.tabs,
  sidePanel: chrome.sidePanel,
  contextMenus: chrome.contextMenus,
  action: chrome.action,
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  void browserEntry.handleTabActivated(activeInfo);
});

const handleActionClick = async (tab: chrome.tabs.Tab) => {
  if (!tab?.id) {
    openConversationsPage();
    return;
  }
  if (isRestrictedUrl(tab.url ?? '')) {
    openConversationsPage();
    return;
  }
  await browserEntry.openSidePanelForTab(tab.id);
};

chrome.action.onClicked.addListener((tab) => {
  void handleActionClick(tab);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== '__E2E_BROWSER_ACTION_CLICK__') {
    return false;
  }
  void chrome.tabs.get(message.tabId).then(handleActionClick).then(() => sendResponse({ ok: true }));
  return true;
});
```

- [ ] **Step 7: 运行 E2E 确认转绿**

Run: `pnpm test:e2e -- tests/e2e/browser-entry.spec.ts`
Expected: PASS。

- [ ] **Step 8: 提交当前小步**

```bash
git add entrypoints/content.ts src/services/browser-entry/browser-entry.ts entrypoints/background.ts tests/e2e/helpers/browser-entry-driver.ts tests/e2e/browser-entry.spec.ts
git commit -m "feat: add stage 3 browser entry flow"
```

### Task 4: 实现 side panel 两阶段 bootstrap 与最小工作台壳层

**Files:**
- Create: `src/features/sidebar/sidebar-api.ts`
- Create: `src/features/sidebar/sidebar-shell.tsx`
- Modify: `entrypoints/sidepanel/main.tsx`
- Modify: `entrypoints/background.ts`
- Test: `tests/component/sidebar/sidebar-shell.spec.tsx`
- Test: `tests/e2e/sidebar-extraction.spec.ts`

- [ ] **Step 1: 先写 sidebar shell 失败组件测试**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SidebarShell } from '../../../src/features/sidebar/sidebar-shell';

describe('SidebarShell', () => {
  it('挂载后主动拉取 bootstrap，并保持提取区常驻显示', async () => {
    const api = {
      getSidebarBootstrap: vi.fn().mockResolvedValue({
        browserTabId: 7,
        normalizedUrl: 'https://example.com/article',
        page: null,
        blockedByBlacklist: false,
        shouldExtract: true,
      }),
      confirmBlacklistContinue: vi.fn(),
      reExtractContent: vi.fn(),
      switchExtractionMethod: vi.fn(),
    };

    render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

    await waitFor(() => expect(api.getSidebarBootstrap).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('sidebar-extraction-panel')).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Chat' })).toBeVisible();
  });

  it('黑名单命中时先显示确认层，不自动提取', async () => {
    const api = {
      getSidebarBootstrap: vi.fn().mockResolvedValue({
        browserTabId: 7,
        normalizedUrl: 'https://example.com/article',
        page: null,
        blockedByBlacklist: true,
        shouldExtract: true,
      }),
      confirmBlacklistContinue: vi.fn(),
      reExtractContent: vi.fn(),
      switchExtractionMethod: vi.fn(),
    };

    render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

    expect(await screen.findByText('当前页面命中黑名单')).toBeVisible();
    expect(api.reExtractContent).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 再写 sidebar extraction 失败 E2E**

```ts
import { openBrowserActionForTab } from './helpers/browser-entry-driver';
import { expect, test } from './helpers/extension-fixture';

test('side panel 先恢复 bootstrap，再在放行后进入提取', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto('https://example.com/');

  const serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    throw new Error('未找到扩展 service worker。');
  }
  await serviceWorker.evaluate(async () => {
    await chrome.storage.local.set({
      'config:extension': {
        version: '2.0.0',
        updatedAt: Date.now(),
        basic: {
          theme: 'system',
          language: 'zh-CN',
          defaultModelId: null,
          systemPrompt: '',
          filterCot: false,
          extractionMethod: 'readability',
          includePageContentByDefault: true,
        },
        models: [],
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
        blacklist: [
          { id: 'example', type: 'domain', pattern: 'example.com', enabled: true, deletedAt: null },
        ],
      },
    });
  });
  await openBrowserActionForTab({ context, extensionId, page });

  const sidepanel = await context.waitForEvent('page');
  await expect(sidepanel.getByText('当前页面命中黑名单')).toBeVisible();
  await expect(sidepanel.getByTestId('sidebar-extraction-panel')).toContainText('等待放行');

  await sidepanel.getByRole('button', { name: '继续提取' }).click();
  await expect(sidepanel.getByTestId('sidebar-extraction-panel')).toContainText(/Readability|Jina|正文/);
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm test:component -- tests/component/sidebar/sidebar-shell.spec.tsx && pnpm test:e2e -- tests/e2e/sidebar-extraction.spec.ts`
Expected: FAIL，当前 `sidepanel/main.tsx` 仍是占位 `PageShell`，没有 bootstrap 和确认层。

- [ ] **Step 4: 写 side panel API 封装**

```ts
export const createSidebarApi = () => ({
  getSidebarBootstrap(input: { tabId: number; pageUrl: string }) {
    return chrome.runtime.sendMessage({
      type: 'GET_SIDEBAR_BOOTSTRAP',
      ...input,
    });
  },
  confirmBlacklistContinue(input: { tabId: number; pageUrl: string }) {
    return chrome.runtime.sendMessage({
      type: 'CONFIRM_BLACKLIST_CONTINUE',
      ...input,
    });
  },
  reExtractContent(input: { tabId: number; pageUrl: string; method: 'readability' | 'jina' }) {
    return chrome.runtime.sendMessage({
      type: 'RE_EXTRACT_CONTENT',
      ...input,
    });
  },
  switchExtractionMethod(input: { tabId: number; pageUrl: string; method: 'readability' | 'jina' }) {
    return chrome.runtime.sendMessage({
      type: 'SWITCH_EXTRACTION_METHOD',
      ...input,
    });
  },
});
```

- [ ] **Step 5: 写最小 SidebarShell，明确两阶段 bootstrap**

```tsx
export const SidebarShell = ({
  api,
  tabId,
  pageUrl,
}: {
  api: ReturnType<typeof createSidebarApi>;
  tabId: number;
  pageUrl: string;
}) => {
  const [state, setState] = useState<'bootstrapping' | 'blocked' | 'extracting' | 'ready' | 'error'>('bootstrapping');
  const [content, setContent] = useState('');
  const [method, setMethod] = useState<'readability' | 'jina'>('readability');

  useEffect(() => {
    let cancelled = false;

    void api.getSidebarBootstrap({ tabId, pageUrl }).then((result) => {
      if (cancelled) {
        return;
      }
      setMethod(result.payload.page?.extractionMethod ?? 'readability');
      setContent(result.payload.page?.content ?? '');
      if (result.payload.blockedByBlacklist) {
        setState('blocked');
        return;
      }
      if (result.payload.page?.content) {
        setState('ready');
        return;
      }
      setState('extracting');
      void api
        .reExtractContent({ tabId, pageUrl, method: result.payload.page?.extractionMethod ?? 'readability' })
        .then((extraction) => {
          if (!cancelled) {
            setContent(extraction.payload.content);
            setMethod(extraction.payload.method);
            setState('ready');
          }
        })
        .catch(() => {
          if (!cancelled) {
            setState('error');
          }
        });
    });

    return () => {
      cancelled = true;
    };
  }, [api, pageUrl, tabId]);

  return (
    <main data-testid="sidebar-shell" className="flex min-h-screen flex-col bg-background">
      <header className="border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button type="button" aria-pressed={method === 'readability'}>Readability</button>
            <button type="button" aria-pressed={method === 'jina'}>Jina</button>
          </div>
          <span className="text-xs text-muted-foreground">browserTab #{tabId}</span>
        </div>
      </header>

      <section data-testid="sidebar-extraction-panel" className="min-h-48 border-b px-4 py-3">
        {state === 'blocked' ? '等待放行' : null}
        {state === 'extracting' ? '正在提取页面正文…' : null}
        {state === 'error' ? '提取失败，请重试。' : null}
        {content ? <article className="whitespace-pre-wrap">{content}</article> : null}
      </section>

      <section className="border-b px-4 py-2">
        <button role="tab" aria-selected="true" type="button">Chat</button>
      </section>

      <section className="flex-1 px-4 py-3 text-sm text-muted-foreground">
        阶段 3 仅接入提取区和最小聊天占位，真实流式聊天在阶段 4 落地。
      </section>
    </main>
  );
};
```

- [ ] **Step 6: 在 background 完成 bootstrap 放行与提取命令**

```ts
case 'CONFIRM_BLACKLIST_CONTINUE': {
  bypassStore.set(`${message.tabId}:${normalizePageUrl(message.pageUrl)}`, Date.now());
  logger.info('blacklist.bypass_confirmed', {
    browserTabId: message.tabId,
    normalizedUrl: normalizePageUrl(message.pageUrl),
  });

  return {
    type: 'CONFIRM_BLACKLIST_CONTINUE_SUCCESS',
    payload: { allowed: true },
  };
}

case 'RE_EXTRACT_CONTENT': {
  const result = await extractionService.extractPage({
    tabId: message.tabId,
    pageUrl: message.pageUrl,
    method: message.method,
  });
  logger.info('extraction.completed', {
    browserTabId: message.tabId,
    normalizedUrl: result.normalizedUrl,
    method: result.method,
  });
  return {
    type: 'RE_EXTRACT_CONTENT_SUCCESS',
    payload: result,
  };
}
```

- [ ] **Step 7: 替换 sidepanel 入口页**

```tsx
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';

import '../../assets/styles/globals.css';

import { createSidebarApi } from '../../src/features/sidebar/sidebar-api';
import { SidebarShell } from '../../src/features/sidebar/sidebar-shell';

const root = createRoot(document.getElementById('root')!);

const App = () => {
  const [context, setContext] = useState<{ tabId: number; pageUrl: string } | null>(null);

  useEffect(() => {
    void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      setContext({
        tabId: tab?.id ?? 0,
        pageUrl: tab?.url ?? '',
      });
    });
  }, []);

  if (!context) {
    return <main data-testid="sidebar-shell-loading">正在加载标签页上下文…</main>;
  }

  return <SidebarShell api={createSidebarApi()} tabId={context.tabId} pageUrl={context.pageUrl} />;
};

root.render(<App />);
```

- [ ] **Step 8: 运行组件测试与 E2E 确认转绿**

Run: `pnpm test:component -- tests/component/sidebar/sidebar-shell.spec.tsx && pnpm test:e2e -- tests/e2e/sidebar-extraction.spec.ts`
Expected: PASS。

- [ ] **Step 9: 提交当前小步**

```bash
git add src/features/sidebar/sidebar-api.ts src/features/sidebar/sidebar-shell.tsx entrypoints/sidepanel/main.tsx entrypoints/background.ts tests/component/sidebar/sidebar-shell.spec.tsx tests/e2e/sidebar-extraction.spec.ts
git commit -m "feat: add stage 3 sidebar bootstrap shell"
```

### Task 5: 收口 logger 契约、文档和阶段回归

**Files:**
- Modify: `src/services/logger/logger.ts`
- Modify: `tests/unit/services/logger/logger.spec.ts`
- Modify: `docs/browser-entry.md`
- Modify: `docs/Platform/chrome-mv3-runtime.md`
- Modify: `docs/Services/runtime-messaging.md`
- Modify: `docs/Services/extraction.md`
- Modify: `docs/Services/blacklist.md`
- Modify: `docs/Services/logger.md`
- Modify: `docs/Workspace/sidebar.md`
- Modify: `docs/flow.md`
- Modify: `docs/test/browser-automation.md`
- Modify: `docs/test/sidebar-core.md`

- [ ] **Step 1: 先扩 logger 契约测试**

```ts
import { describe, expect, it, vi } from 'vitest';

import { createLogger } from '../../../src/services/logger/logger';

describe('logger stage 3 contract', () => {
  it('稳定输出阶段 3 关键事件名和脱敏字段', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const logger = createLogger('background');

    logger.info('panel.init.started', { browserTabId: 7, normalizedUrl: 'https://example.com', apiKey: 'secret' });
    logger.warn('extraction.readability_failed', { browserTabId: 7, normalizedUrl: 'https://example.com' });

    expect(infoSpy).toHaveBeenCalledWith('[background] panel.init.started', {
      browserTabId: 7,
      normalizedUrl: 'https://example.com',
      apiKey: '[REDACTED]',
    });
    expect(warnSpy).toHaveBeenCalledWith('[background] extraction.readability_failed', {
      browserTabId: 7,
      normalizedUrl: 'https://example.com',
    });
  });
});
```

- [ ] **Step 2: 运行 logger 单测确认失败**

Run: `pnpm test:unit -- tests/unit/services/logger/logger.spec.ts -v`
Expected: FAIL，当前 logger 测试只覆盖单一 happy path。

- [ ] **Step 3: 保持 logger 实现简单，只补阶段 3 需要的最小契约**

```ts
const SENSITIVE_KEYS = new Set(['apiKey', 'gistToken', 'webdavPassword', 'authorization']);

export const sanitizePayload = (payload?: Record<string, unknown>): Record<string, unknown> => {
  if (!payload) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [
      key,
      SENSITIVE_KEYS.has(key) ? '[REDACTED]' : value,
    ]),
  );
};
```

- [ ] **Step 4: 同步关键文档，只记录已经做出的实现决策**

```md
- `GET_SIDEBAR_BOOTSTRAP` 只返回恢复态、黑名单判定和是否需要继续提取的摘要，不隐式执行提取。
- `content script` 只暴露 `COLLECT_PAGE_SOURCE`，返回 `url / title / html / text / faviconUrl`。
- background 提取链路固定为“缓存优先 -> Readability -> Jina 回退 -> 写回 page repository”。
- 黑名单放行使用当前 service worker 内存态令牌，只对当前打开行为生效，不写入持久化存储。
- side panel 阶段 3 只交付顶部控制区、常驻提取区、默认 `Chat` promptTab 和确认/失败态。
```

- [ ] **Step 5: 运行阶段 3 验收命令**

Run: `pnpm test:unit -- tests/unit/services/runtime-messaging.spec.ts tests/unit/services/extraction.spec.ts tests/unit/services/blacklist.spec.ts tests/unit/services/logger/logger.spec.ts`
Expected: PASS。

Run: `pnpm test:component -- tests/component/sidebar/sidebar-shell.spec.tsx`
Expected: PASS。

Run: `pnpm test:e2e -- tests/e2e/browser-entry.spec.ts tests/e2e/sidebar-extraction.spec.ts`
Expected: PASS。

Run: `pnpm build`
Expected: PASS。

- [ ] **Step 6: 提交阶段 3 收口**

```bash
git add src/services/logger/logger.ts tests/unit/services/logger/logger.spec.ts docs/browser-entry.md docs/Platform/chrome-mv3-runtime.md docs/Services/runtime-messaging.md docs/Services/extraction.md docs/Services/blacklist.md docs/Services/logger.md docs/Workspace/sidebar.md docs/flow.md docs/test/browser-automation.md docs/test/sidebar-core.md
git commit -m "docs: finalize stage 3 browser entry and extraction plan"
```

## 阶段验收清单

- `pnpm test:unit -- tests/unit/services/runtime-messaging.spec.ts`
- `pnpm test:unit -- tests/unit/services/extraction.spec.ts`
- `pnpm test:unit -- tests/unit/services/blacklist.spec.ts`
- `pnpm test:unit -- tests/unit/services/logger/logger.spec.ts`
- `pnpm test:component -- tests/component/sidebar/sidebar-shell.spec.tsx`
- `pnpm test:e2e -- tests/e2e/browser-entry.spec.ts`
- `pnpm test:e2e -- tests/e2e/sidebar-extraction.spec.ts`
- `pnpm build`

## 风险与检查点

- `sidepanel.html` 与 `wxt.config.ts` 的 `side_panel.default_path` 当前不一致，必须在 Task 2 一并收口，否则 action 打开和 E2E 路径会继续分叉。
- `sidePanel.open()` 真实浏览器要求用户手势；如果 Playwright 版本无法稳定驱动扩展按钮，E2E 驱动只能复用同一条 `handleActionClick` 逻辑，且必须局限在 `tests/e2e/helpers` 与显式 `__E2E_*` 协议内，不能污染正式命令集合。
- `content script` 自动刷新重试只能做一次，避免在受限页或特殊站点进入无限刷新。
- 阶段 3 不要提前实现 `SEND_CHAT`、`STREAM_CHUNK` 等阶段 4 能力，port bus 只做框架和日志。
- 所有中文日志事件只允许出现在注释和补充说明里，真正的事件名保持稳定英文点号命名。
