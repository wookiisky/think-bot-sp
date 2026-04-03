# 设置页完整 Tab 布局改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把设置页从弹窗式居中卡片观感调整为独立完整的 tab 页面布局。

**Architecture:** 保持 `options.html` 入口和设置读写链路不变，只调整 `SettingsShell` 外层页面骨架。内部模型、语言、缓存等业务卡片继续复用现有组件，避免扩大改动面。

**Tech Stack:** React、Vitest、Testing Library、Tailwind CSS v4、shadcn/ui

---

### Task 1: 先锁定布局预期

**Files:**
- Modify: `tests/component/options/settings-shell.spec.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
it('设置页使用完整 tab 页面布局而不是弹窗式卡片壳层', async () => {
  mocks.getConfig.mockResolvedValueOnce(createDefaultConfig());
  mocks.getLocalCacheStats.mockResolvedValueOnce({ entryCount: 3, bytes: 128 });

  render(<SettingsShell />);

  const shell = await screen.findByTestId('settings-shell');
  expect(shell).toHaveAttribute('data-layout', 'tab-page');
  expect(screen.queryByTestId('settings-shell-frame')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test:component -- tests/component/options/settings-shell.spec.tsx -t "设置页使用完整 tab 页面布局而不是弹窗式卡片壳层"`
Expected: FAIL，提示缺少 `data-layout="tab-page"`。

### Task 2: 调整设置页骨架

**Files:**
- Modify: `src/features/settings/settings-shell.tsx`
- Test: `tests/component/options/settings-shell.spec.tsx`

- [ ] **Step 1: 最小修改页面骨架**

```tsx
<main data-testid="settings-shell" data-layout="tab-page">
  <section className="mx-auto flex w-full max-w-7xl flex-col gap-6">
    <header className="grid gap-6 border-b border-border/70 pb-6">
      ...
    </header>

    <section className="grid gap-6">
      ...
    </section>
  </section>
</main>
```

- [ ] **Step 2: 保留业务卡片，不改配置行为**

```tsx
<Card className="rounded-3xl bg-card py-0 ring-1 ring-foreground/8">
  ...
</Card>
```

- [ ] **Step 3: 运行组件测试确认通过**

Run: `pnpm test:component -- tests/component/options/settings-shell.spec.tsx`
Expected: PASS。

### Task 3: 更新说明文档

**Files:**
- Modify: `docs/Workspace/settings.md`

- [ ] **Step 1: 更新布局说明与约束**

```md
- 设置页作为独立完整 tab 页面展示，不使用弹窗式居中大卡片作为整页壳层。
```

- [ ] **Step 2: 回看文档是否与实现一致**

Check:
- 入口仍是 `options.html`
- 只描述布局变化，不误写为打开方式改造

