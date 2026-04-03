# Stage 2.5 Shadcn Tailwind Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 WXT 扩展工程内建立 `Tailwind CSS v4 + shadcn/ui` 设计系统基线，并完成共享入口壳层与设置页最小迁移，给后续 settings、sidepanel、conversations、welcome 提供统一的 UI 底座。

**Architecture:** 采用“测试先锁定，再补底座，再做最小迁移”的方案。样式只保留一份全局入口 `assets/styles/globals.css`，组件统一落在 `src/components/ui`，入口页通过 `PageShell` 共享外层布局，设置页只迁移承载层和基础控件来源，不改变阶段 2 已有配置读写、日志和校验逻辑。

**Tech Stack:** Chrome MV3、WXT、React 18、TypeScript strict、Tailwind CSS v4、shadcn/ui、`@tailwindcss/vite`、clsx、tailwind-merge、Vitest、React Testing Library、Playwright。

---

## 0. 范围约束

1. 阶段 2.5 只做设计系统基线，不在本阶段引入 sidebar/conversations 的真实业务视图。
2. 现有仓库使用 Tailwind CSS v4，统一通过 `@tailwindcss/vite` 和 `assets/styles/globals.css` 接入；本阶段不新增 `postcss.config.*` 和 `tailwind.config.*`。
3. `shadcn/ui` 初始化来源固定为 `preset b3F5SdK3Xe`，但最终目录结构必须服从仓库现有 `src/components/ui`、`src/lib`、`assets/styles` 布局。
4. 设置页迁移后必须保持阶段 2 的配置加载、保存、导入导出、缓存统计、语言预览和错误提示行为不变。
5. 所有入口页只共享基础壳层，不做额外主题系统抽象，不做新的设计 token 二次封装。

## 1. 文件结构

- `package.json`
  - 增加或确认 `tailwindcss`、`@tailwindcss/vite`、`shadcn`、`clsx`、`tailwind-merge`、`lucide-react`、`tw-animate-css` 依赖。
- `wxt.config.ts`
  - 挂载 `@tailwindcss/vite` 插件，并保留 `@` 到 `src` 的别名。
- `components.json`
  - 固定 shadcn 项目配置，指向 `assets/styles/globals.css` 和 `@/components/ui`。
- `assets/styles/globals.css`
  - 提供 Tailwind v4 入口、主题 token、字体与基础层样式。
- `src/lib/utils.ts`
  - 提供 `cn()` 合并函数。
- `src/components/ui/button.tsx`
  - 统一按钮来源。
- `src/components/ui/card.tsx`
  - 统一卡片容器来源。
- `src/components/ui/badge.tsx`
  - 统一状态标签来源。
- `src/components/ui/input.tsx`
  - 统一输入框来源。
- `src/components/ui/select.tsx`
  - 统一选择器来源。
- `src/components/ui/separator.tsx`
  - 统一分隔线来源。
- `src/ui/page-shell.tsx`
  - welcome / sidepanel / conversations 共享壳层。
- `src/features/settings/settings-shell.tsx`
  - 设置页主壳层、动作区、导航 chips、缓存统计和错误提示。
- `src/features/settings/model-form.tsx`
  - 模型配置表单，统一使用 shadcn 基础件。
- `src/features/settings/quick-inputs-panel.tsx`
  - 快捷输入最小预览区。
- `entrypoints/options/main.tsx`
  - 引入全局样式。
- `entrypoints/sidepanel/main.tsx`
  - 引入全局样式并使用共享壳层。
- `entrypoints/conversations/main.tsx`
  - 引入全局样式并使用共享壳层。
- `entrypoints/welcome/main.tsx`
  - 引入全局样式并使用共享壳层。
- `tests/component/ui/page-shell.spec.tsx`
  - 锁定共享壳层结构。
- `tests/component/options/settings-shell.spec.tsx`
  - 锁定设置页迁移后的动作区、导航和主题行为。
- `tests/e2e/entry-shell.spec.ts`
  - 锁定 sidepanel 入口壳层能直接打开。
- `docs/tech_stack.md`
  - 更新阶段 2.5 采用的 UI 技术和集成方式。
- `docs/Workspace/settings.md`
  - 更新设置页 UI 基线说明。
- `docs/Workspace/sidebar.md`
  - 更新共享壳层约束。
- `docs/Workspace/conversations.md`
  - 更新共享壳层约束。
- `docs/test/settings-core.md`
  - 更新组件与流程验收口径。
- `docs/test/sidebar-core.md`
  - 更新入口壳层验收口径。
- `tasks.md`
  - 勾选阶段 2.5 子任务并补充验收命令。

## 2. 实施任务

### Task 1: 锁定共享壳层和设置页测试基线

**Files:**
- Modify: `tests/component/ui/page-shell.spec.tsx`
- Modify: `tests/component/options/settings-shell.spec.tsx`
- Modify: `tests/e2e/entry-shell.spec.ts`

- [ ] **Step 1: 为 `PageShell` 写失败组件测试**

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { PageShell } from '../../../src/ui/page-shell';

describe('PageShell', () => {
  it('renders page name, route, and shared shell structure', () => {
    const sidePanelRoute = '/side-panel.html';

    render(
      <PageShell
        title="Side Panel"
        route={sidePanelRoute}
        description="Stage 1 shell only"
      />,
    );

    const main = screen.getByTestId('page-shell');
    const routeCard = within(main).getByTestId('page-shell-route');

    expect(screen.getByRole('heading', { name: 'Side Panel' })).toBeInTheDocument();
    expect(screen.getByText('Stage 1 shell only')).toBeInTheDocument();
    expect(within(routeCard).getByText(sidePanelRoute)).toBeInTheDocument();
    expect(within(main).getByText(/environment/i)).toBeInTheDocument();
    expect(main.className).toMatch(/min-h-screen/);
  });
});
```

- [ ] **Step 2: 运行测试，确认当前实现先失败**

Run: `pnpm test:component -- tests/component/ui/page-shell.spec.tsx`

Expected: FAIL，报错包含 `data-testid="page-shell"` 或 `data-testid="page-shell-route"` 缺失。

- [ ] **Step 3: 为设置页顶部动作区和主题切换写失败组件测试**

```tsx
it('加载配置后渲染设置页顶部动作区与导航 chips', async () => {
  mocks.getConfig.mockResolvedValueOnce(createDefaultConfig());
  mocks.getLocalCacheStats.mockResolvedValueOnce({ entryCount: 3, bytes: 128 });

  render(<SettingsShell />);

  expect(await screen.findByRole('heading', { name: '设置' })).toBeInTheDocument();
  expect(screen.getByTestId('settings-shell-actions')).toBeInTheDocument();
  expect(screen.getByTestId('settings-shell-nav')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '导入配置' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '导出配置' })).toBeInTheDocument();
});

it('主题切换后保留 data-theme 并更新根节点主题 class', async () => {
  mocks.getConfig.mockResolvedValueOnce(createDefaultConfig());
  mocks.getLocalCacheStats.mockResolvedValueOnce({ entryCount: 0, bytes: 0 });

  render(<SettingsShell />);

  await screen.findByRole('heading', { name: '设置' });
  fireEvent.change(screen.getByRole('combobox', { name: '主题' }), {
    target: { value: 'dark' },
  });

  const shell = screen.getByTestId('settings-shell');
  expect(shell).toHaveAttribute('data-theme', 'dark');
  expect(shell.className).toMatch(/dark/);
});
```

- [ ] **Step 4: 运行设置页组件测试，确认现状失败**

Run: `pnpm test:component -- tests/component/options/settings-shell.spec.tsx`

Expected: FAIL，报错包含 `settings-shell-actions` 缺失或根节点缺少 `dark` class。

- [ ] **Step 5: 为入口页壳层写失败 E2E**

```ts
import { EXTENSION_PAGES } from '../../src/shared/extension-pages';
import { expect, test } from './helpers/extension-fixture';

test('opens side panel shell route directly', async ({ context, extensionId }) => {
  const sidepanel = await context.newPage();
  await sidepanel.goto(`chrome-extension://${extensionId}/${EXTENSION_PAGES.sidePanel}`);

  await expect(sidepanel.getByTestId('page-shell')).toBeVisible();
  await expect(sidepanel.getByRole('heading', { name: 'Side Panel' })).toBeVisible();
  await expect(sidepanel.getByTestId('page-shell-route')).toContainText(EXTENSION_PAGES.sidePanel);
  await expect(sidepanel.getByText(/environment/i)).toBeVisible();
});
```

- [ ] **Step 6: 运行 E2E，确认入口壳层钩子当前不存在**

Run: `pnpm test:e2e -- tests/e2e/entry-shell.spec.ts`

Expected: FAIL，报错包含 `[data-testid="page-shell"]` 不存在。

- [ ] **Step 7: 提交测试基线**

```bash
git add tests/component/ui/page-shell.spec.tsx tests/component/options/settings-shell.spec.tsx tests/e2e/entry-shell.spec.ts
git commit -m "test: lock stage 2.5 shell baseline"
```

### Task 2: 建立 Tailwind v4 与 shadcn 基础设施

**Files:**
- Modify: `package.json`
- Modify: `wxt.config.ts`
- Create: `components.json`
- Create: `assets/styles/globals.css`
- Create: `src/lib/utils.ts`
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/card.tsx`
- Create: `src/components/ui/badge.tsx`
- Create: `src/components/ui/input.tsx`
- Create: `src/components/ui/select.tsx`
- Create: `src/components/ui/separator.tsx`

- [ ] **Step 1: 安装设计系统依赖**

Run: `pnpm add tailwindcss @tailwindcss/vite shadcn clsx tailwind-merge lucide-react tw-animate-css`

Expected: PASS，`package.json` 中出现上述依赖。

- [ ] **Step 2: 初始化 shadcn 项目**

Run: `pnpm dlx shadcn@latest init --preset b3F5SdK3Xe`

Expected: PASS，根目录生成 `components.json`，`pnpm dlx shadcn@latest info --json` 返回非空 `config`。

- [ ] **Step 3: 固定 `wxt.config.ts` 的 Tailwind v4 接入方式**

```ts
import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
  }),
});
```

- [ ] **Step 4: 规范化 `components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "radix-mira",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "assets/styles/globals.css",
    "baseColor": "zinc",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

- [ ] **Step 5: 写入全局样式入口和主题 token**

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.141 0.005 285.823);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.141 0.005 285.823);
  --primary: oklch(0.52 0.105 223.128);
  --primary-foreground: oklch(0.984 0.019 200.873);
  --muted: oklch(0.967 0.001 286.375);
  --muted-foreground: oklch(0.552 0.016 285.938);
  --border: oklch(0.92 0.004 286.32);
  --input: oklch(0.92 0.004 286.32);
  --ring: oklch(0.705 0.015 286.067);
  --radius: 1rem;
}

.dark {
  --background: oklch(0.141 0.005 285.823);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.21 0.006 285.885);
  --card-foreground: oklch(0.985 0 0);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-lg: var(--radius);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }

  body {
    @apply min-h-screen bg-background text-foreground;
  }
}
```

- [ ] **Step 6: 建立 `cn()` 与最小基础组件目录**

```ts
// src/lib/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** 合并 Tailwind class，处理条件 class 和冲突 class。 */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
```

```tsx
// src/components/ui/card.tsx
import * as React from 'react';

import { cn } from '@/lib/utils';

/** 卡片根容器。 */
export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('rounded-3xl border bg-card text-card-foreground shadow-sm', className)} {...props} />,
);
Card.displayName = 'Card';
```

- [ ] **Step 7: 运行 shadcn 信息命令，确认初始化状态**

Run: `pnpm dlx shadcn@latest info --json`

Expected: PASS，输出 JSON，且 `config.css` 指向 `assets/styles/globals.css`。

- [ ] **Step 8: 提交基础设施**

```bash
git add package.json pnpm-lock.yaml wxt.config.ts components.json assets/styles/globals.css src/lib/utils.ts src/components/ui
git commit -m "feat: add stage 2.5 design system baseline"
```

### Task 3: 迁移共享入口壳层和四个入口页

**Files:**
- Modify: `src/ui/page-shell.tsx`
- Modify: `entrypoints/options/main.tsx`
- Modify: `entrypoints/sidepanel/main.tsx`
- Modify: `entrypoints/conversations/main.tsx`
- Modify: `entrypoints/welcome/main.tsx`

- [ ] **Step 1: 先让四个入口页接入同一份全局样式**

```tsx
// entrypoints/sidepanel/main.tsx
import { createRoot } from 'react-dom/client';

import '../../assets/styles/globals.css';

import { EXTENSION_PAGES } from '../../src/shared/extension-pages';
import { PageShell } from '../../src/ui/page-shell';

const root = createRoot(document.getElementById('root')!);
root.render(
  <PageShell
    title="Side Panel"
    route={EXTENSION_PAGES.sidePanel}
    description="Stage 1 placeholder for the Side Panel surface."
  />,
);
```

- [ ] **Step 2: 实现共享 `PageShell`**

```tsx
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { cn } from '../lib/utils';

type PageShellProps = {
  title: string;
  route: string;
  description: string;
  className?: string;
};

/** 通用入口页壳层，统一占位页的布局和主题基线。 */
export const PageShell = ({ title, route, description, className }: PageShellProps) => {
  return (
    <main
      data-testid="page-shell"
      className={cn(
        'min-h-screen bg-[radial-gradient(circle_at_top,_var(--color-background)_0%,_var(--color-muted)_56%,_var(--color-background)_100%)] px-6 py-8',
        className,
      )}
    >
      <section className="mx-auto flex w-full max-w-5xl justify-center">
        <Card className="w-full gap-0 rounded-3xl bg-card/90 py-0 shadow-2xl ring-1 ring-foreground/8 backdrop-blur">
          <CardHeader className="gap-4 border-b border-border/70 px-6 py-6">
            <div className="flex items-center justify-between gap-3">
              <Badge variant="secondary" className="rounded-full px-3 py-1 uppercase tracking-[0.22em]">
                Stage 2.5 shell
              </Badge>
              <span className="text-xs text-muted-foreground">Environment: development</span>
            </div>
            <div className="flex flex-col gap-2">
              <h1 className="font-heading text-3xl font-medium tracking-tight">{title}</h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground">{description}</p>
            </div>
          </CardHeader>
          <CardContent className="px-6 py-6">
            <div
              data-testid="page-shell-route"
              className="rounded-2xl border border-border/70 bg-muted/60 px-4 py-3 font-mono text-sm text-foreground"
            >
              {route}
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
};
```

- [ ] **Step 3: 运行壳层组件测试**

Run: `pnpm test:component -- tests/component/ui/page-shell.spec.tsx`

Expected: PASS。

- [ ] **Step 4: 运行入口壳层 E2E**

Run: `pnpm test:e2e -- tests/e2e/entry-shell.spec.ts`

Expected: PASS。

- [ ] **Step 5: 提交共享壳层迁移**

```bash
git add src/ui/page-shell.tsx entrypoints/options/main.tsx entrypoints/sidepanel/main.tsx entrypoints/conversations/main.tsx entrypoints/welcome/main.tsx
git commit -m "feat: migrate extension entry shells to shadcn baseline"
```

### Task 4: 迁移设置页外层与最小表单控件

**Files:**
- Modify: `src/features/settings/settings-shell.tsx`
- Modify: `src/features/settings/model-form.tsx`
- Modify: `src/features/settings/quick-inputs-panel.tsx`

- [ ] **Step 1: 用 `Card / Button / Separator` 重写设置页外层承载结构**

```tsx
return (
  <main
    data-testid="settings-shell"
    data-theme={config.basic.theme}
    className={cn(
      'min-h-screen px-6 py-8',
      config.basic.theme === 'dark' ? 'dark bg-background text-foreground' : 'bg-background text-foreground',
    )}
  >
    <section className="mx-auto grid max-w-6xl gap-6">
      <Card className="rounded-3xl bg-card/90 shadow-2xl ring-1 ring-foreground/8">
        <CardHeader className="gap-4 border-b border-border/70">
          <div data-testid="settings-shell-actions" className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-2xl">设置</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={handleSave} disabled={saving}>保存</Button>
              <Button type="button" variant="outline" onClick={handleImport} disabled={saving}>导入配置</Button>
              <Button type="button" variant="outline" onClick={handleExport} disabled={saving}>导出配置</Button>
            </div>
          </div>
          <div data-testid="settings-shell-nav" className="flex flex-wrap gap-2">
            {navigationItems.map((item) => (
              <span key={item.key} className="rounded-full border border-border/70 bg-muted/60 px-3 py-1 text-xs text-muted-foreground">
                {t(item.key)}
              </span>
            ))}
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 py-6">
          <Separator />
        </CardContent>
      </Card>
    </section>
  </main>
);
```

- [ ] **Step 2: 迁移模型表单到统一基础件**

```tsx
<section className="grid gap-4" aria-label="模型表单">
  <div className="flex items-center justify-between gap-3">
    <h3 className="text-base font-semibold">{model.name}</h3>
    <Badge variant={complete ? 'secondary' : 'destructive'}>
      {complete ? '配置完整' : '配置不完整'}
    </Badge>
  </div>

  <label className="grid gap-2">
    <span className="text-sm font-medium">提供方</span>
    <select
      aria-label="Provider"
      value={model.provider}
      disabled={disabled}
      onChange={(event) => updateModel({ provider: event.target.value as ModelConfig['provider'] })}
      className={fieldClassName}
    >
      <option value="openai-compatible">OpenAI Compatible</option>
      <option value="gemini">Gemini</option>
      <option value="azure-openai">Azure OpenAI</option>
      <option value="anthropic">Anthropic</option>
    </select>
  </label>

  <label className="grid gap-2">
    <span className="text-sm font-medium">API Key</span>
    <div className="flex items-center gap-2">
      <Input aria-label="API Key" type={showApiKey ? 'text' : 'password'} value={model.apiKey} disabled={disabled} onChange={(event) => updateModel({ apiKey: event.target.value })} />
      <Button type="button" variant="outline" onClick={() => setShowApiKey((value) => !value)} disabled={disabled}>
        {showApiKey ? '隐藏' : '显示'}
      </Button>
    </div>
  </label>
</section>
```

- [ ] **Step 3: 迁移快捷输入预览卡片**

```tsx
<Card aria-label="快捷输入预览" className="rounded-3xl bg-card/90 shadow-xl ring-1 ring-foreground/8">
  <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
    <CardTitle className="text-base">快捷输入</CardTitle>
    <Button type="button" variant="outline" onClick={() => setCollapsed((value) => !value)}>
      {collapsed ? '展开预览' : '收起预览'}
    </Button>
  </CardHeader>
</Card>
```

- [ ] **Step 4: 运行设置页组件测试**

Run: `pnpm test:component -- tests/component/options/settings-shell.spec.tsx`

Expected: PASS。

- [ ] **Step 5: 运行完整组件回归**

Run: `pnpm test:component`

Expected: PASS。

- [ ] **Step 6: 提交设置页迁移**

```bash
git add src/features/settings/settings-shell.tsx src/features/settings/model-form.tsx src/features/settings/quick-inputs-panel.tsx
git commit -m "feat: migrate settings shell to shadcn baseline"
```

### Task 5: 同步文档与阶段验收

**Files:**
- Modify: `docs/tech_stack.md`
- Modify: `docs/Workspace/settings.md`
- Modify: `docs/Workspace/sidebar.md`
- Modify: `docs/Workspace/conversations.md`
- Modify: `docs/test/settings-core.md`
- Modify: `docs/test/sidebar-core.md`
- Modify: `tasks.md`

- [ ] **Step 1: 更新技术栈文档**

```md
- `shadcn/ui`
  - 统一按钮、弹层、表单、选择器、分隔面板等基础交互。
  - 当前项目已使用 `preset b3F5SdK3Xe` 建立基线，组件目录固定为 `src/components/ui`。
- `Tailwind CSS`
  - 原子化样式体系。
  - 当前项目基于 Tailwind CSS v4，统一通过 `@tailwindcss/vite` 与 `assets/styles/globals.css` 接入。
```

- [ ] **Step 2: 更新工作区与测试文档**

```md
## 阶段 2.5 基线

- settings / sidepanel / conversations / welcome 共用 `assets/styles/globals.css`。
- 共享入口页壳层统一使用 `src/ui/page-shell.tsx`。
- 设置页最小基础件统一来自 `src/components/ui`。
- 入口壳层验收使用 `tests/e2e/entry-shell.spec.ts`。
- 设置页组件验收使用 `tests/component/options/settings-shell.spec.tsx`。
```

- [ ] **Step 3: 更新 `tasks.md` 阶段状态**

```md
- [x] 当前仓库已完成 shadcn 初始化：`pnpm dlx shadcn@latest info --json` 返回非空 `config`，并已安装 `badge / button / card / input / select / separator`。
- [x] 当前仓库已接入 Tailwind CSS v4：统一通过 `@tailwindcss/vite` 和 `assets/styles/globals.css` 提供样式基线。
- [x] 已将 `PageShell`、`SettingsShell`、`ModelForm`、`QuickInputsPanel` 迁到 shadcn 基础布局。
```

- [ ] **Step 4: 执行阶段验收命令**

Run: `pnpm dlx shadcn@latest info --json && pnpm test:component -- tests/component/ui/page-shell.spec.tsx && pnpm test:component -- tests/component/options/settings-shell.spec.tsx && pnpm test:e2e -- tests/e2e/entry-shell.spec.ts && pnpm build`

Expected: PASS，所有命令通过。

- [ ] **Step 5: 提交文档和验收结果**

```bash
git add docs/tech_stack.md docs/Workspace/settings.md docs/Workspace/sidebar.md docs/Workspace/conversations.md docs/test/settings-core.md docs/test/sidebar-core.md tasks.md
git commit -m "docs: record stage 2.5 baseline"
```

## 3. 自检结果

### 3.1 需求覆盖

1. `tasks.md` 中“存在可用的 components.json、Tailwind 样式入口和 shadcn 组件目录”由 Task 2 覆盖。
2. “`shadcn info --json` 返回非空 config”由 Task 2 Step 2、Step 7 和 Task 5 Step 4 覆盖。
3. “四个入口页至少有一层共享的 shadcn 基础布局可复用”由 Task 3 覆盖。
4. “设置页外层和基础表单迁移，但不打断阶段 1/2 能力”由 Task 1、Task 4 覆盖。
5. “同步文档和验收”由 Task 5 覆盖。

### 3.2 占位符扫描

1. 计划内没有使用 `TODO`、`TBD`、`实现细节略`、`类似 Task N` 等占位表达。
2. 每个代码步骤都给出了明确文件与可执行代码片段。
3. 每个验证步骤都给出了实际命令和预期结果。

### 3.3 类型与命名一致性

1. 计划统一使用 `PageShell`、`SettingsShell`、`ModelForm`、`QuickInputsPanel` 这些仓库中已存在的组件名。
2. 入口页统一使用 `EXTENSION_PAGES.sidePanel` / `conversations` / `welcome`。
3. 主题入口统一使用 `assets/styles/globals.css`，没有混入 `tailwind.config.ts` 或 PostCSS 旧方案。
