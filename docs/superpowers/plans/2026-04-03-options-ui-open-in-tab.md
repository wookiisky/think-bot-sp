# 设置页 Manifest 打开方式修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正扩展 manifest，让 Chrome 右键菜单中的“选项”始终以独立 tab 打开设置页，而不是嵌入式覆盖层。

**Architecture:** 保持设置页入口仍为 `options.html`，但不在 `wxt.config.ts` 里直接写 `options_ui/options_page`。WXT 会从 `entrypoints/options/index.html` 的 `manifest.*` 元信息生成 `options_ui`，因此要通过 `<meta name="manifest.open_in_tab" content="true" />` 控制最终 manifest。

**Tech Stack:** WXT、Chrome Extension Manifest、Vitest

---

### Task 1: 先锁定 WXT 入口配置契约

**Files:**
- Create: `tests/unit/wxt.config.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
it('设置页通过 options 入口的 manifest 元信息声明独立 tab 打开', () => {
  const optionsHtml = fs.readFileSync(
    path.resolve(__dirname, '../../entrypoints/options/index.html'),
    'utf8',
  );

  expect(optionsHtml).toContain('<meta name="manifest.open_in_tab" content="true" />');
  expect(config.manifest?.options_ui).toBeUndefined();
  expect(config.manifest?.options_page).toBeUndefined();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test:unit -- tests/unit/wxt.config.spec.ts`
Expected: FAIL，提示缺少 `manifest.open_in_tab` 元信息。

### Task 2: 修正 Options 入口元信息

**Files:**
- Modify: `entrypoints/options/index.html`
- Modify: `wxt.config.ts`
- Test: `tests/unit/wxt.config.spec.ts`

- [ ] **Step 1: 在 options 入口声明 open_in_tab**

```html
<meta name="manifest.open_in_tab" content="true" />
```

- [ ] **Step 2: 移除 wxt.config.ts 里的 options_ui/options_page 手写配置**

```ts
manifest: {
  // 不再手写 options_ui/options_page
}
```

- [ ] **Step 3: 运行测试确认通过**

Run: `pnpm test:unit -- tests/unit/wxt.config.spec.ts`
Expected: PASS。

### Task 3: 更新设置页文档

**Files:**
- Modify: `docs/Workspace/settings.md`

- [ ] **Step 1: 写入 manifest 约束**

```md
- WXT 项目里设置页是否独立 tab 打开，必须通过 `entrypoints/options/index.html` 里的 `<meta name="manifest.open_in_tab" content="true" />` 控制，不能在 `wxt.config.ts` 里手写 `options_ui/options_page`。
```

- [ ] **Step 2: 检查文档和实现一致**

Check:
- 仍然是 `options.html`
- 重点是打开方式，不误写成页面样式改造
