# 阶段 3 browserTab 切换后侧边栏自动隐藏修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复“切换 `browserTab` 后 side panel 自动关闭失效、切回原 tab 仍会自动恢复、修完后又出现需要点击两次才能打开”的阶段 3 浏览器入口遗留问题，并补齐对应回归测试与文档状态。

**Architecture:** 保持 `background service worker` 作为唯一浏览器入口协调层，不改动 side panel 两阶段 bootstrap 主链路。修复重点放在 `browser-entry`：把“当前哪些 `browserTab` 已启用 side panel”从 worker 进程内存迁到 `chrome.storage.session` 级运行态存储，使 `tabs.onActivated` 在 worker 休眠/重启后仍能清理旧 tab 的启用态；同时为当前活动页预配置 side panel，避免切回后出现“需要点击两次才打开”的时序问题。

**Tech Stack:** Chrome MV3、WXT、TypeScript、Vitest、Playwright、`chrome.storage.session`

---

## 执行复盘（2026-04-03）

本次修复不是一次完成，过程中出现过两次错误决策：

1. 第一轮只把问题归因到 service worker 内存态丢失，先实现了 `chrome.storage.session` 版 `browser-panel-state`。
2. 这一步确实修复了“worker 重启后无法清理旧 tab”的问题，但没有解释真实浏览器里切回原 tab 仍会恢复的现象。
3. 继续调查构建产物后，发现 WXT 会把 `entrypoints/sidepanel/*` 识别成保留 side panel 入口，并自动写入 `manifest.side_panel.default_path`。这意味着 side panel 被浏览器当成全局默认 panel，业务层再怎么清理旧 tab，也会被默认配置干扰。
4. 因此第二轮实现把扩展页路由从 `sidepanel.html` 改成了 `sidebar.html`，并把入口迁到 `entrypoints/sidebar/*`，同时同步更新 sender 校验、E2E、文档。
5. 路由问题修完后，又暴露出新的时序问题：切换 tab 后需要点击两次扩展图标才能打开 side panel。
6. 第二个错误决策是把 `sidePanel.setOptions({ enabled: true })` 放在 `action.onClicked` 回调里。真实浏览器第一次点击时只完成配置，第二次点击才真正打开。
7. 最终实现把 side panel 预配置前移到 `tabs.onActivated` 和 `tabs.onUpdated`，当前活动 tab 只预配置、不自动展示；真正展示仍由用户点击扩展图标触发。

最终落地的实现组合：

- `browser-panel-state` 使用 `chrome.storage.session` 保存已启用 tab 集合。
- `tabs.onActivated` 禁用旧 tab，并为当前活动 tab 同步 side panel 可用态。
- `tabs.onUpdated` 在 URL 真变化或活动页加载完成时重新同步当前 tab，可注入页预配置、受限页禁用。
- `tabs.onRemoved` 清理 tab 运行态。
- 黑名单放行令牌只在 URL 真实变化时清理，避免普通加载过程误清当前放行。
- E2E 增加了“切换后重新预配置，下一次点击可直接打开”的回归，`entry-shell` 测试也去掉了错误的瞬态 loading 断言。

## File Structure

### 新建文件

- `src/services/browser-entry/browser-panel-state.ts`
  - 封装 side panel 已启用 `browserTab` 集合的运行态读写，底层使用 `chrome.storage.session` 或测试替身。

### 修改文件

- `src/services/browser-entry/browser-entry.ts`
  - 注入 `browser-panel-state`，在扩展图标点击、`tabs.onActivated`、`tabs.onUpdated`、`tabs.onRemoved` 时统一维护 side panel 启用态与预配置。
- `entrypoints/background.ts`
  - 创建 `browser-panel-state` 实例并接入 `browserEntry`，补 `tabs.onUpdated` / `tabs.onRemoved` 接线与 URL 变更清理。
- `src/shared/extension-pages.ts`
  - 把 side panel 扩展页路由从 `sidepanel.html` 改成 `sidebar.html`。
- `entrypoints/sidebar/index.html`
- `entrypoints/sidebar/main.tsx`
  - 迁移 side panel 入口，避开 WXT 保留入口名。
- `src/services/runtime-messaging/sender.ts`
  - sender 校验同步改成 `sidebar.html`。
- `tests/unit/services/browser-entry.spec.ts`
  - 补 worker 重建后仍能清理旧 tab 启用态、tab 切换时禁用旧 tab 并预配置当前 tab 的失败单测。
- `tests/unit/services/runtime-messaging.spec.ts`
  - sender 校验与错误文案同步更新到 `sidebar.html`。
- `tests/unit/shared/extension-pages.spec.ts`
  - 锁定 side panel 路由不能回退到 WXT 保留命名。
- `tests/e2e/helpers/browser-entry-driver.ts`
  - 补获取活动 `browserTab` 与读取指定 tab side panel 配置的辅助方法。
- `tests/e2e/browser-entry.spec.ts`
  - 补 `browserTab A -> browserTab B -> browserTab A` 的“不自动展示但重新预配置”端到端回归。
- `tests/e2e/entry-shell.spec.ts`
  - 收紧为稳定态断言，避免错误依赖瞬态 loading。
- `docs/browser-entry.md`
  - 补充 `chrome.storage.session`、保留入口名陷阱与最终入口语义。
- `docs/Platform/chrome-mv3-runtime.md`
  - 明确 side panel 启用态不能只依赖 worker 内存，且不能使用 WXT 保留入口名。
- `docs/test/browser-automation.md`
  - 收口测试复盘，记录真实点击时序与错误测试假设。
- `docs/test/sidebar-core.md`
  - 收口阶段 3 侧边栏回归现状与入口壳层测试口径。
- `docs/superpowers/plans/2026-04-03-stage-3-browser-entry-sidebar-extraction.md`
  - 更新阶段 3 复核结论，不再把该问题留在“未完成”里。
- `tasks.md`
  - 同步阶段 3 当前状态，标记该遗留项已补齐。

## 实施约束

- 只修阶段 3 遗留问题，不提前引入阶段 4 的 port 恢复、真实流式或更多入口重构。
- `sidePanel.open()` 仍禁止在异步链路里手动调用，继续依赖 `openPanelOnActionClick`。
- 新增运行态只允许使用 `chrome.storage.session`，不能写入 `chrome.storage.local`，避免把浏览器 UI 态错误升级为业务持久化数据。
- 黑名单放行令牌仍保留现有内存态设计，不借这次修复顺手改动其持久化策略。
- E2E 驱动仍只允许使用 `tests/e2e/helpers` 内的显式 helper，不把测试协议混入正式 sidebar command 集合。

### Task 1: 固化可跨 worker 休眠恢复的 browser-entry 运行态

**Files:**
- Create: `src/services/browser-entry/browser-panel-state.ts`
- Modify: `src/services/browser-entry/browser-entry.ts`
- Modify: `entrypoints/background.ts`
- Test: `tests/unit/services/browser-entry.spec.ts`

- [ ] **Step 1: 先写 browser-entry 失败单测，复现“worker 重建后旧 tab 不能被清理”**

```ts
import { describe, expect, it, vi } from 'vitest';

import { createFakeStorageArea } from '../../helpers/fake-storage';
import { createBrowserEntryService } from '../../../src/services/browser-entry/browser-entry';
import { createBrowserEntryPanelState } from '../../../src/services/browser-entry/browser-panel-state';

const createDeps = (storage = createFakeStorageArea()) => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  };
  const runtime = {
    getURL: vi.fn((route: string) => `chrome-extension://ext-id/${route}`),
  } as unknown as typeof chrome.runtime;
  const tabs = {
    create: vi.fn(),
  } as unknown as typeof chrome.tabs;
  const sidePanel = {
    setOptions: vi.fn().mockResolvedValue(undefined),
    open: vi.fn(),
    setPanelBehavior: vi.fn(),
  } as unknown as typeof chrome.sidePanel;
  const contextMenus = {
    removeAll: vi.fn(),
    create: vi.fn(),
  } as unknown as typeof chrome.contextMenus;

  return {
    storage,
    sidePanel,
    service: createBrowserEntryService({
      logger,
      runtime,
      tabs,
      sidePanel,
      contextMenus,
      getUiLocale: () => 'zh-CN',
      panelState: createBrowserEntryPanelState(storage),
    }),
  };
};

describe('browser-entry service', () => {
  it('切换到其他 browserTab 时会禁用旧 tab 的 side panel', async () => {
    const { service, sidePanel } = createDeps();

    await service.handleActionClick({
      id: 7,
      url: 'https://example.com/a',
    });

    await service.handleTabActivated({ tabId: 8 });

    expect(sidePanel.setOptions).toHaveBeenLastCalledWith({
      tabId: 7,
      enabled: false,
    });
  });

  it('service worker 重建后仍能清理旧 tab 的 side panel 启用态', async () => {
    const storage = createFakeStorageArea();
    const first = createDeps(storage);

    await first.service.handleActionClick({
      id: 7,
      url: 'https://example.com/a',
    });

    const second = createDeps(storage);
    await second.service.handleTabActivated({ tabId: 8 });

    expect(second.sidePanel.setOptions).toHaveBeenCalledWith({
      tabId: 7,
      enabled: false,
    });
  });
});
```

- [ ] **Step 2: 运行单测确认当前实现失败**

Run: `pnpm test:unit -- tests/unit/services/browser-entry.spec.ts -v`
Expected: FAIL，第二个用例提示 `setOptions({ tabId: 7, enabled: false })` 未被调用，因为当前实现只依赖 `enabledTabIds` 内存集合。

- [ ] **Step 3: 新建最小 `browser-panel-state` 运行态封装**

```ts
type SessionStorageLike = {
  /** 按 key 读取运行态存储。 */
  get<T = Record<string, unknown>>(
    keys?: string | string[] | Record<string, unknown> | null | undefined,
  ): Promise<T>;
  /** 批量写入运行态存储。 */
  set(items: Record<string, unknown>): Promise<void>;
};

const ENABLED_BROWSER_TAB_IDS_KEY = 'browser-entry:enabled-browser-tab-ids';

/** 创建 browser-entry side panel 运行态仓储。 */
export const createBrowserEntryPanelState = (storage: SessionStorageLike) => {
  /** 读取当前已启用 side panel 的 browserTab 列表。 */
  const listEnabledTabIds = async (): Promise<number[]> => {
    const stored = await storage.get<{ [ENABLED_BROWSER_TAB_IDS_KEY]: unknown }>({
      [ENABLED_BROWSER_TAB_IDS_KEY]: [],
    });
    const raw = stored[ENABLED_BROWSER_TAB_IDS_KEY];
    if (!Array.isArray(raw)) {
      return [];
    }

    return Array.from(
      new Set(
        raw.filter((value): value is number => Number.isInteger(value) && value > 0),
      ),
    );
  };

  /** 覆盖保存当前已启用 side panel 的 browserTab 列表。 */
  const saveEnabledTabIds = async (tabIds: number[]) => {
    await storage.set({
      [ENABLED_BROWSER_TAB_IDS_KEY]: Array.from(new Set(tabIds)).sort((left, right) => left - right),
    });
  };

  return {
    listEnabledTabIds,
    /** 记录某个 browserTab 已启用 side panel。 */
    async markEnabled(tabId: number) {
      const tabIds = await listEnabledTabIds();
      await saveEnabledTabIds([...tabIds, tabId]);
    },
    /** 清理当前激活 tab 之外的旧启用态，并返回被清理的 tab 列表。 */
    async clearOthers(activeTabId: number) {
      const tabIds = await listEnabledTabIds();
      const staleTabIds = tabIds.filter((tabId) => tabId !== activeTabId);
      await saveEnabledTabIds(tabIds.filter((tabId) => tabId === activeTabId));
      return staleTabIds;
    },
    /** 清理单个 browserTab 的启用态。 */
    async clearTab(tabId: number) {
      const tabIds = await listEnabledTabIds();
      await saveEnabledTabIds(tabIds.filter((currentTabId) => currentTabId !== tabId));
    },
  };
};
```

- [ ] **Step 4: 在 browser-entry 与 background 接线运行态，并补 tab 关闭清理**

```ts
// src/services/browser-entry/browser-entry.ts
type BrowserEntryDependencies = {
  /** 结构化日志。 */
  logger: BrowserEntryLogger;
  /** runtime 能力。 */
  runtime: typeof chrome.runtime;
  /** tabs 能力。 */
  tabs: typeof chrome.tabs;
  /** side panel 能力。 */
  sidePanel: typeof chrome.sidePanel;
  /** contextMenus 能力。 */
  contextMenus: typeof chrome.contextMenus;
  /** 当前浏览器 UI 语言。 */
  getUiLocale: () => string;
  /** side panel browserTab 启用态。 */
  panelState: {
    /** 记录某个 browserTab 已启用 side panel。 */
    markEnabled(tabId: number): Promise<void>;
    /** 清理当前激活 tab 之外的旧启用态。 */
    clearOthers(activeTabId: number): Promise<number[]>;
    /** 清理单个 browserTab 的启用态。 */
    clearTab(tabId: number): Promise<void>;
  };
};

const openSidePanelForTab = async (tabId: number): Promise<BrowserEntryActionResult> => {
  const path = stripLeadingSlash(EXTENSION_PAGES.sidePanel);
  await sidePanel.setOptions({
    tabId,
    path,
    enabled: true,
  });
  await panelState.markEnabled(tabId);
  logger.info('侧边栏入口已绑定当前标签页', {
    browserTabId: tabId,
    path,
  });
  return {
    kind: 'sidepanel-opened',
    tabId,
  };
};

const handleTabActivated = async ({ tabId }: { tabId: number }) => {
  const staleTabIds = await panelState.clearOthers(tabId);
  for (const staleTabId of staleTabIds) {
    await sidePanel.setOptions({
      tabId: staleTabId,
      enabled: false,
    });
    logger.info('panel.auto_hidden', {
      browserTabId: staleTabId,
    });
  }
};

const handleTabRemoved = async (tabId: number) => {
  await panelState.clearTab(tabId);
  logger.debug('panel.runtime_state_cleared', {
    browserTabId: tabId,
  });
};

return {
  configureActionClickBehavior,
  handleActionClick,
  handleContextMenuClick,
  handleInstalled,
  handleTabActivated,
  handleTabRemoved,
  handleE2EBrowserActionClick,
  registerContextMenu,
};
```

```ts
// entrypoints/background.ts
import { createBrowserEntryPanelState } from '../src/services/browser-entry/browser-panel-state';

const browserEntry = createBrowserEntryService({
  logger,
  runtime: chrome.runtime,
  tabs: chrome.tabs,
  sidePanel: chrome.sidePanel,
  contextMenus: chrome.contextMenus,
  getUiLocale: () => chrome.i18n?.getUILanguage?.() ?? 'en',
  panelState: createBrowserEntryPanelState(chrome.storage.session),
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  for (const key of Array.from(bypassStore.keys())) {
    if (!key.startsWith(`${activeInfo.tabId}:`)) {
      bypassStore.delete(key);
    }
  }
  void browserEntry.handleTabActivated(activeInfo);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearBypassForTab(tabId);
  void browserEntry.handleTabRemoved(tabId);
});
```

- [ ] **Step 5: 运行单测确认修复通过**

Run: `pnpm test:unit -- tests/unit/services/browser-entry.spec.ts -v`
Expected: PASS，新增的 tab 切换与 worker 重建回归通过，原有入口测试继续通过。

- [ ] **Step 6: 提交这一小步**

```bash
git add src/services/browser-entry/browser-panel-state.ts src/services/browser-entry/browser-entry.ts entrypoints/background.ts tests/unit/services/browser-entry.spec.ts
git commit -m "fix: persist browser sidepanel tab state"
```

### Task 2: 补真实 browserTab 切换回归，锁死“不自动恢复”语义

**Files:**
- Modify: `tests/e2e/helpers/browser-entry-driver.ts`
- Modify: `tests/e2e/browser-entry.spec.ts`

- [ ] **Step 1: 先写失败 E2E，覆盖 `browserTab A -> B -> A` 不自动恢复**

```ts
import { EXTENSION_PAGES } from '../../src/shared/extension-pages';
import { expect, test } from './helpers/extension-fixture';
import {
  getActiveBrowserTabId,
  getSidePanelOptionsForTab,
  openBrowserActionForTab,
} from './helpers/browser-entry-driver';

test('切换 browserTab 后会自动隐藏，切回原 tab 不自动恢复', async ({ context, extensionId }) => {
  const pageA = await context.newPage();
  await pageA.goto('https://example.com/');
  const driverPage = await context.newPage();

  const result = await openBrowserActionForTab({
    context,
    extensionId,
    page: pageA,
    driverPage,
  });
  expect(result).toEqual({
    kind: 'sidepanel-opened',
    tabId: expect.any(Number),
  });

  const tabAId = await getActiveBrowserTabId({ context, page: pageA });
  const pageB = await context.newPage();
  await pageB.goto('https://example.org/');
  const tabBId = await getActiveBrowserTabId({ context, page: pageB });
  expect(tabBId).not.toBe(tabAId);

  await expect
    .poll(async () => (await getSidePanelOptionsForTab({ context, tabId: tabAId })).enabled ?? true)
    .toBe(false);

  await pageA.bringToFront();

  await expect
    .poll(async () => (await getSidePanelOptionsForTab({ context, tabId: tabAId })).enabled ?? true)
    .toBe(false);

  await expect(
    openBrowserActionForTab({
      context,
      extensionId,
      page: pageA,
      driverPage,
    }),
  ).resolves.toEqual({
    kind: 'sidepanel-opened',
    tabId: tabAId,
  });

  await expect
    .poll(async () => (await getSidePanelOptionsForTab({ context, tabId: tabAId })).path)
    .toBe(EXTENSION_PAGES.sidePanel);
});
```

- [ ] **Step 2: 运行 E2E 确认失败**

Run: `pnpm test:e2e -- tests/e2e/browser-entry.spec.ts`
Expected: FAIL，旧 tab 的 side panel 仍处于启用态，切回原 tab 后断言 `enabled === false` 失败。

- [ ] **Step 3: 给 E2E helper 补最小查询能力，避免在测试里重复写 service worker 访问逻辑**

```ts
import type { BrowserContext, Page } from '@playwright/test';

/** 获取当前活动 browserTab id。 */
export const getActiveBrowserTabId = async ({
  context,
  page,
}: {
  context: BrowserContext;
  page: Page;
}) => {
  const serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    throw new Error('未找到扩展 service worker。');
  }

  await page.bringToFront();
  return serviceWorker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (!tab?.id) {
      throw new Error('未找到当前活动 browserTab');
    }
    return tab.id;
  });
};

/** 读取指定 browserTab 当前 side panel 配置。 */
export const getSidePanelOptionsForTab = async ({
  context,
  tabId,
}: {
  context: BrowserContext;
  tabId: number;
}) => {
  const serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    throw new Error('未找到扩展 service worker。');
  }

  return serviceWorker.evaluate(async (targetTabId) => {
    const sidePanelApi = chrome.sidePanel as typeof chrome.sidePanel & {
      getOptions(options: { tabId: number }): Promise<{
        enabled?: boolean;
        path?: string;
      }>;
    };
    const options = await sidePanelApi.getOptions({ tabId: targetTabId });
    return {
      enabled: options.enabled ?? true,
      path: options.path ?? null,
    };
  }, tabId);
};
```

- [ ] **Step 4: 再次运行 E2E，确认真实 tab 切换语义通过**

Run: `pnpm test:e2e -- tests/e2e/browser-entry.spec.ts`
Expected: PASS，新增“不自动恢复”场景和原有普通页/受限页入口场景都通过。

- [ ] **Step 5: 提交这一小步**

```bash
git add tests/e2e/helpers/browser-entry-driver.ts tests/e2e/browser-entry.spec.ts
git commit -m "test: cover browser tab sidepanel auto hide"
```

### Task 3: 收口阶段 3 状态、文档与回归命令

**Files:**
- Modify: `docs/browser-entry.md`
- Modify: `docs/Platform/chrome-mv3-runtime.md`
- Modify: `docs/test/browser-automation.md`
- Modify: `docs/test/sidebar-core.md`
- Modify: `docs/superpowers/plans/2026-04-03-stage-3-browser-entry-sidebar-extraction.md`
- Modify: `tasks.md`

- [ ] **Step 1: 更新浏览器入口、平台约束和测试文档**

```md
<!-- docs/browser-entry.md -->
- 浏览器入口运行态：
  - side panel 已启用 `browserTab` 集合保存在 `chrome.storage.session`。
  - 该状态只用于跨 service worker 休眠恢复旧 tab 的 side panel 清理，不属于业务持久化数据。

<!-- docs/Platform/chrome-mv3-runtime.md -->
- side panel 启用态不能只依赖 service worker 全局变量；若产品要求“切回原 tab 不自动展示”，必须使用可跨 worker 休眠恢复的运行态存储辅助清理旧 tab，并为当前活动页重新预配置 side panel。

<!-- docs/test/browser-automation.md -->
- 已覆盖：普通网页点击扩展图标、受限页退化、两阶段 bootstrap、黑名单确认后提取、`browserTab` 切换自动隐藏且切回不自动展示，但下一次点击可直接打开。
- 已知问题：本项已修复，后续只保留右键菜单和首次安装欢迎页的自动化补齐。

<!-- docs/test/sidebar-core.md -->
- 已覆盖自动化：两阶段 bootstrap、黑名单确认后提取、普通网页入口、受限页退化、`browserTab` 切换隐藏后不自动展示且重新预配置。
- 已知问题：阶段 3 不再保留 “切换 `browserTab` 自动关闭 side panel 失效”。
```

- [ ] **Step 2: 更新阶段 3 总计划和 `tasks.md` 当前状态**

```md
<!-- docs/superpowers/plans/2026-04-03-stage-3-browser-entry-sidebar-extraction.md -->
- 已落地：
  - `browserTab` 切换后会自动隐藏 side panel，切回原 `browserTab` 不自动展示，但当前活动页会重新预配置，下一次点击可直接打开。
- 未完成：
  - 右键菜单入口、首次安装欢迎页尚未形成 E2E 回归。

<!-- tasks.md -->
- [x] 统一 `browserTab` 行为：点击扩展按钮打开 side panel；切换 `browserTab` 自动隐藏；切回原 `browserTab` 不自动展示，但当前活动页会重新预配置。
- [x] 阶段 3 当前已补齐 `browserTab` 切换隐藏语义回归；剩余遗留项仅为右键菜单和首次安装欢迎页 E2E。
```

- [ ] **Step 3: 跑本次修复的最小验收命令**

Run: `pnpm test:unit -- tests/unit/services/browser-entry.spec.ts -v`
Expected: PASS

Run: `pnpm test:e2e -- tests/e2e/browser-entry.spec.ts`
Expected: PASS

Run: `pnpm test:e2e -- tests/e2e/sidebar-extraction.spec.ts`
Expected: PASS，确认 side panel 主链路未回归。

Run: `pnpm build`
Expected: PASS，Chrome MV3 构建成功。

- [ ] **Step 4: 提交文档与状态收口**

```bash
git add docs/browser-entry.md docs/Platform/chrome-mv3-runtime.md docs/test/browser-automation.md docs/test/sidebar-core.md docs/superpowers/plans/2026-04-03-stage-3-browser-entry-sidebar-extraction.md tasks.md
git commit -m "docs: close stage 3 sidebar tab switch gap"
```

## Self-Review

- 覆盖性：
  - 已覆盖用户指出的已知问题“切换 tab 自动关闭 sidebar 失效”。
  - 已覆盖实现、单测、E2E、阶段状态文档和 `tasks.md` 收口。
  - 未把右键菜单、首次安装欢迎页混进本次修复，保持范围单一。
- 占位符检查：
  - 所有任务都给了明确文件、代码片段、命令和预期结果，没有 `TODO` / `TBD` / “类似前文” 占位描述。
- 一致性检查：
  - 统一使用 `browserTab`、`side panel`、`chrome.storage.session`、`panelState` 这组命名，没有前后切换术语。
