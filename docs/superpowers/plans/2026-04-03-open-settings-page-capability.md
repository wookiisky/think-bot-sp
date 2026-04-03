# 设置页统一打开能力 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提供统一的设置页打开能力，后续所有入口都通过同一实现打开独立 tab 设置页。

**Architecture:** 新增一个轻量导航能力模块，内部统一调用 `chrome.runtime.openOptionsPage()`，不在各页面重复拼接 `options.html` URL，也不通过 `chrome.tabs.create` 自行创建设置页。

**Tech Stack:** TypeScript、Chrome Extension Runtime API、Vitest

---

### Task 1: 先锁定设置页打开契约

**Files:**
- Create: `tests/unit/services/navigation/options-page.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
it('统一通过 runtime.openOptionsPage 打开设置页', async () => {
  const openOptionsPageMock = vi.fn().mockResolvedValue(undefined);
  const logger = { info: vi.fn() };

  await openOptionsPage({
    runtime: { openOptionsPage: openOptionsPageMock },
    logger,
  });

  expect(openOptionsPageMock).toHaveBeenCalledTimes(1);
  expect(logger.info).toHaveBeenCalledWith('settings.open.requested', {
    page: 'options.html',
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test:unit -- tests/unit/services/navigation/options-page.spec.ts`
Expected: FAIL，提示缺少 `src/services/navigation/options-page.ts`。

### Task 2: 实现统一能力

**Files:**
- Create: `src/services/navigation/options-page.ts`
- Test: `tests/unit/services/navigation/options-page.spec.ts`

- [ ] **Step 1: 实现最小能力**

```ts
export const openOptionsPage = async ({ runtime, logger }: OpenOptionsPageDependencies) => {
  logger.info('settings.open.requested', {
    page: EXTENSION_PAGES.options,
  });
  await runtime.openOptionsPage();
};
```

- [ ] **Step 2: 运行测试确认通过**

Run: `pnpm test:unit -- tests/unit/services/navigation/options-page.spec.ts`
Expected: PASS。

### Task 3: 更新设置页文档

**Files:**
- Modify: `docs/Workspace/settings.md`

- [ ] **Step 1: 补充入口约束**

```md
- 所有“打开设置页”入口都必须复用统一能力，并最终调用 `chrome.runtime.openOptionsPage()`。
```

- [ ] **Step 2: 检查文档和实现一致**

Check:
- 只定义统一能力，不虚构新的按钮入口
- 保持设置页仍以独立完整 tab 打开

