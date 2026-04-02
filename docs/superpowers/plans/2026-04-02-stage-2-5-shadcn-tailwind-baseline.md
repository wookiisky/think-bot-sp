# Stage 2.5 Shadcn Tailwind Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 WXT 扩展工程里落地 `Tailwind CSS + shadcn/ui` 基线，并先完成 `PageShell` 与设置页外层骨架迁移，为阶段 3 之后的 UI 开发提供统一组件与主题体系。

**Architecture:** 采用“一份全局样式入口 + 一套共享 shadcn 组件 + 渐进迁移”的方案。先补 `components.json`、Tailwind、`cn()` 和基础组件目录，再把所有入口页统一接到 `assets/styles/globals.css`，最后只迁移 `PageShell`、`SettingsShell`、`ModelForm`、`QuickInputsPanel` 的样式承载方式，不改动阶段 2 的消息、存储和日志逻辑。

**Tech Stack:** Chrome MV3、WXT、React 18、TypeScript strict、Tailwind CSS、shadcn/ui、clsx、tailwind-merge、lucide-react、Vitest、React Testing Library、Playwright。

---

## 0. 范围假设

1. 阶段 2.5 只建立设计系统基线，不在本阶段引入 sidebar/conversations 的真实业务组件树。
2. `shadcn/ui` 的 preset `b3F5SdK3Xe` 只作为初始化来源；最终文件布局以仓库当前结构为准，统一落在 `assets/styles`、`src/lib`、`src/components/ui`、`src/ui`。
3. 设置页行为必须保持阶段 2 测试口径不变，允许 DOM 结构改变，但不允许丢失可访问名称、`data-testid`、主题预览和缓存统计。
4. `PageShell` 继续承担 welcome / sidepanel / conversations 三个占位页的共享壳层职责，直到阶段 3/6 被真实工作台替换。

## 1. 文件结构

- `package.json`
  - 补 `tailwindcss`、`postcss`、`autoprefixer`、`clsx`、`tailwind-merge`、`lucide-react`。
- `components.json`
  - 定义 shadcn 项目配置，指向 `assets/styles/globals.css` 与 `@` 别名。
- `postcss.config.mjs`
  - 让 WXT/Vite 构建链处理 Tailwind。
- `tailwind.config.ts`
  - 声明内容扫描范围和主题扩展。
- `assets/styles/globals.css`
  - 全局 Tailwind 入口、shadcn token、基础层样式。
- `src/lib/utils.ts`
  - 提供 `cn()`。
- `src/components/ui/button.tsx`
  - 顶部操作按钮与折叠按钮的统一来源。
- `src/components/ui/card.tsx`
  - 壳层、设置区块和预览块的统一容器。
- `src/components/ui/input.tsx`
  - API Key、Base URL、Deployment 等输入框来源。
- `src/components/ui/select.tsx`
  - 语言、主题、模型、Provider 选择器来源。
- `src/components/ui/badge.tsx`
  - 模型完整性状态标识来源。
- `src/components/ui/separator.tsx`
  - 设置页区块之间的分隔来源。
- `src/ui/page-shell.tsx`
  - 改造成基于 shadcn 的共享壳层。
- `src/features/settings/settings-shell.tsx`
  - 改造成基于 `Card / Button / Select / Separator` 的设置页骨架。
- `src/features/settings/model-form.tsx`
  - 改造成基于 `Input / Select / Badge / Button` 的模型表单。
- `src/features/settings/quick-inputs-panel.tsx`
  - 改造成基于 `Card / Button` 的快捷输入预览区。
- `entrypoints/options/main.tsx`
  - 引入 `globals.css`。
- `entrypoints/sidepanel/main.tsx`
  - 引入 `globals.css`。
- `entrypoints/conversations/main.tsx`
  - 引入 `globals.css`。
- `entrypoints/welcome/main.tsx`
  - 引入 `globals.css`。
- `tests/component/ui/page-shell.spec.tsx`
  - 补共享壳层结构与主题类断言。
- `tests/component/options/settings-shell.spec.tsx`
  - 补设置页 shadcn 迁移后的结构回归断言。
- `tests/e2e/entry-shell.spec.ts`
  - 保持入口壳层验收口径，新增共享壳层可见断言。
- `docs/tech_stack.md`
  - 如实际落地与文档不一致则同步。
- `tasks.md`
  - 勾选阶段 2.5 已完成事项，记录验收结果。

## 2. 实施顺序

1. 先锁定测试基线，避免 UI 迁移引入行为回退。
2. 再补 Tailwind/shadcn 基础设施，确保后续组件改造有统一底座。
3. 再迁移共享壳层 `PageShell`，让三个入口页先吃到同一套布局。
4. 最后迁移设置页容器和表单控件，并跑组件 + E2E 回归。

### Task 1: 锁定壳层与设置页测试基线

**Files:**
- Modify: `tests/component/ui/page-shell.spec.tsx`
- Modify: `tests/component/options/settings-shell.spec.tsx`
- Modify: `tests/e2e/entry-shell.spec.ts`

- [ ] **Step 1: 扩充 `PageShell` 组件测试，锁定共享壳层语义**

```tsx
// tests/component/ui/page-shell.spec.tsx
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { PageShell } from '../../../src/ui/page-shell';

describe('PageShell', () => {
  it('renders page name, route, and shared shell structure', () => {
    render(
      <PageShell
        title="Side Panel"
        route="/side-panel.html"
        description="Stage 1 shell only"
      />,
    );

    const main = screen.getByTestId('page-shell');
    const routeCard = within(main).getByTestId('page-shell-route');

    expect(screen.getByRole('heading', { name: 'Side Panel' })).toBeInTheDocument();
    expect(screen.getByText('Stage 1 shell only')).toBeInTheDocument();
    expect(within(routeCard).getByText('/side-panel.html')).toBeInTheDocument();
    expect(within(main).getByText(/environment/i)).toBeInTheDocument();
    expect(main.className).toMatch(/min-h-screen/);
  });
});
```

- [ ] **Step 2: 运行组件测试，确认新断言在现状下失败**

Run: `pnpm test:component -- tests/component/ui/page-shell.spec.tsx`

Expected: FAIL，报错类似 `Unable to find an element by: [data-testid="page-shell"]`，说明当前内联样式壳层还未提供稳定结构钩子。

- [ ] **Step 3: 扩充设置页组件测试，锁定迁移后必须保留的交互和结构**

```tsx
// tests/component/options/settings-shell.spec.tsx
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

- [ ] **Step 4: 运行设置页组件测试，确认新增断言失败**

Run: `pnpm test:component -- tests/component/options/settings-shell.spec.tsx`

Expected: FAIL，报错类似 `Unable to find an element by: [data-testid="settings-shell-actions"]` 或 `Expected the element to have class matching /dark/`。

- [ ] **Step 5: 扩充入口页 E2E，锁定共享壳层外观钩子**

```ts
// tests/e2e/entry-shell.spec.ts
test('opens side panel shell route directly', async ({ context, extensionId }) => {
  const sidepanel = await context.newPage();
  await sidepanel.goto(`chrome-extension://${extensionId}/side-panel.html`);

  await expect(sidepanel.getByTestId('page-shell')).toBeVisible();
  await expect(sidepanel.getByRole('heading', { name: 'Side Panel' })).toBeVisible();
  await expect(sidepanel.getByTestId('page-shell-route')).toContainText('/side-panel.html');
  await expect(sidepanel.getByText(/environment/i)).toBeVisible();
});
```

- [ ] **Step 6: 运行入口页 E2E，确认新钩子当前不存在**

Run: `pnpm test:e2e -- tests/e2e/entry-shell.spec.ts`

Expected: FAIL，报错类似 `locator("[data-testid=\"page-shell\"]") resolved to 0 elements`。

- [ ] **Step 7: 提交测试基线**

```bash
git add tests/component/ui/page-shell.spec.tsx tests/component/options/settings-shell.spec.tsx tests/e2e/entry-shell.spec.ts
git commit -m "test: lock stage 2.5 shell and settings baseline"
```

### Task 2: 建立 Tailwind 与 shadcn 基础设施

**Files:**
- Modify: `package.json`
- Create: `components.json`
- Create: `postcss.config.mjs`
- Create: `tailwind.config.ts`
- Create: `assets/styles/globals.css`
- Create: `src/lib/utils.ts`
- Modify: `entrypoints/options/main.tsx`
- Modify: `entrypoints/sidepanel/main.tsx`
- Modify: `entrypoints/conversations/main.tsx`
- Modify: `entrypoints/welcome/main.tsx`

- [ ] **Step 1: 安装 Tailwind 与 shadcn 依赖**

Run: `pnpm add -D tailwindcss postcss autoprefixer && pnpm add clsx tailwind-merge lucide-react`

Expected: PASS，`package.json` 新增 `tailwindcss / postcss / autoprefixer / clsx / tailwind-merge / lucide-react`。

- [ ] **Step 2: 用 preset 初始化 shadcn**

Run: `pnpm dlx shadcn@latest init --preset b3F5SdK3Xe`

Expected: PASS，根目录出现 `components.json`，并且命令输出包含 `Writing components.json` 或等价成功提示。

- [ ] **Step 3: 规范化 `components.json`，固定到仓库目录布局**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "radix-nova",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "assets/styles/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "ui": "@/components/ui",
    "utils": "@/lib/utils",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

- [ ] **Step 4: 补齐 Tailwind 配置与全局样式入口**

```ts
// tailwind.config.ts
import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: [
    './entrypoints/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    './tests/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
} satisfies Config;
```

```css
/* assets/styles/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --ring: 215 20.2% 65.1%;
    --radius: 1rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 6%;
    --card-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --ring: 212.7 26.8% 83.9%;
  }

  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground min-h-screen antialiased;
  }
}
```

- [ ] **Step 5: 建立 PostCSS 与 `cn()` 工具**

```js
// postcss.config.mjs
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

```ts
// src/lib/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
```

- [ ] **Step 6: 所有入口页接入全局样式**

```tsx
// entrypoints/sidepanel/main.tsx
import '../../assets/styles/globals.css';

import { createRoot } from 'react-dom/client';

import { EXTENSION_PAGES } from '../../src/shared/extension-pages';
import { PageShell } from '../../src/ui/page-shell';
```

```tsx
// entrypoints/options/main.tsx
import '../../assets/styles/globals.css';
import '../../assets/styles/material-symbols.css';
```

同样修改：

```tsx
// entrypoints/conversations/main.tsx
import '../../assets/styles/globals.css';
```

```tsx
// entrypoints/welcome/main.tsx
import '../../assets/styles/globals.css';
```

- [ ] **Step 7: 运行基础设施自检**

Run: `pnpm dlx shadcn@latest info --json`

Expected: PASS，输出中的 `config` 不再为 `null`，且 `tailwindCss` 指向 `assets/styles/globals.css`。

- [ ] **Step 8: 提交基础设施**

```bash
git add package.json pnpm-lock.yaml components.json postcss.config.mjs tailwind.config.ts assets/styles/globals.css src/lib/utils.ts entrypoints/options/main.tsx entrypoints/sidepanel/main.tsx entrypoints/conversations/main.tsx entrypoints/welcome/main.tsx
git commit -m "feat: add tailwind and shadcn baseline"
```

### Task 3: 安装基础 shadcn 组件并迁移 `PageShell`

**Files:**
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/card.tsx`
- Create: `src/components/ui/badge.tsx`
- Create: `src/components/ui/separator.tsx`
- Modify: `src/ui/page-shell.tsx`

- [ ] **Step 1: 安装阶段 2.5 需要的基础组件**

Run: `pnpm dlx shadcn@latest add button card badge separator`

Expected: PASS，`src/components/ui` 下生成对应组件文件。

- [ ] **Step 2: 把 `PageShell` 改造成共享 shadcn 壳层**

```tsx
// src/ui/page-shell.tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type PageShellProps = {
  title: string;
  route: string;
  description: string;
  className?: string;
};

export const PageShell = ({ title, route, description, className }: PageShellProps) => {
  return (
    <main
      data-testid="page-shell"
      className={cn(
        'min-h-screen bg-[radial-gradient(circle_at_top,_hsl(var(--background))_0%,_hsl(var(--muted))_58%,_hsl(var(--background))_100%)] px-6 py-8',
        className,
      )}
    >
      <section className="mx-auto flex w-full max-w-5xl justify-center">
        <Card className="w-full border-border/70 bg-card/90 shadow-2xl backdrop-blur">
          <CardHeader className="gap-4">
            <div className="flex items-center justify-between gap-3">
              <Badge variant="secondary" className="rounded-full px-3 py-1 uppercase tracking-[0.22em]">
                Stage 2.5 shell
              </Badge>
              <span className="text-sm text-muted-foreground">Environment: development</span>
            </div>
            <div className="space-y-2">
              <CardTitle className="text-3xl tracking-tight">{title}</CardTitle>
              <CardDescription className="text-base leading-7">{description}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div
              data-testid="page-shell-route"
              className="rounded-2xl border bg-muted/60 px-4 py-3 font-mono text-sm text-foreground"
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

- [ ] **Step 3: 运行 `PageShell` 组件测试**

Run: `pnpm test:component -- tests/component/ui/page-shell.spec.tsx`

Expected: PASS。

- [ ] **Step 4: 运行入口页 E2E**

Run: `pnpm test:e2e -- tests/e2e/entry-shell.spec.ts`

Expected: PASS。

- [ ] **Step 5: 提交共享壳层迁移**

```bash
git add src/components/ui/button.tsx src/components/ui/card.tsx src/components/ui/badge.tsx src/components/ui/separator.tsx src/ui/page-shell.tsx
git commit -m "refactor: migrate page shell to shadcn"
```

### Task 4: 安装表单组件并迁移设置页骨架

**Files:**
- Create: `src/components/ui/input.tsx`
- Create: `src/components/ui/select.tsx`
- Modify: `src/features/settings/settings-shell.tsx`
- Modify: `src/features/settings/model-form.tsx`
- Modify: `src/features/settings/quick-inputs-panel.tsx`
- Modify: `tests/component/options/settings-shell.spec.tsx`
- Modify: `tests/component/options/quick-inputs.spec.tsx`

- [ ] **Step 1: 安装表单类组件**

Run: `pnpm dlx shadcn@latest add input select`

Expected: PASS，生成 `src/components/ui/input.tsx` 与 `src/components/ui/select.tsx`。

- [ ] **Step 2: 迁移 `ModelForm` 到 shadcn 表单控件**

```tsx
// src/features/settings/model-form.tsx
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import type { ModelConfig } from '../../domain/config/config-schema';
import { isModelConfigComplete } from '../../domain/config/config-schema';

export const ModelForm = ({ model, onChange, disabled = false }: ModelFormProps) => {
  const [showApiKey, setShowApiKey] = useState(false);
  const complete = isModelConfigComplete(model);

  return (
    <section className="grid gap-4" aria-label="模型表单">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">{model.name}</h3>
        <Badge variant={complete ? 'secondary' : 'destructive'}>
          {complete ? '配置完整' : '配置不完整'}
        </Badge>
      </div>

      <div className="grid gap-2">
        <span className="text-sm font-medium">提供方</span>
        <Select
          value={model.provider}
          disabled={disabled}
          onValueChange={(provider) => updateModel({ provider: provider as ModelConfig['provider'] })}
        >
          <SelectTrigger aria-label="Provider">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="openai-compatible">OpenAI Compatible</SelectItem>
            <SelectItem value="gemini">Gemini</SelectItem>
            <SelectItem value="azure-openai">Azure OpenAI</SelectItem>
            <SelectItem value="anthropic">Anthropic</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <span className="text-sm font-medium">API Key</span>
        <div className="flex gap-2">
          <Input
            aria-label="API Key"
            type={showApiKey ? 'text' : 'password'}
            value={model.apiKey}
            disabled={disabled}
            onChange={(event) => updateModel({ apiKey: event.target.value })}
          />
          <Button type="button" variant="outline" onClick={() => setShowApiKey((value) => !value)} disabled={disabled}>
            {showApiKey ? '隐藏' : '显示'}
          </Button>
        </div>
      </div>
    </section>
  );
};
```

- [ ] **Step 3: 迁移 `QuickInputsPanel` 到 Card + Button**

```tsx
// src/features/settings/quick-inputs-panel.tsx
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const QuickInputsPanel = ({ quickInputs }: QuickInputsPanelProps) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Card aria-label="快捷输入预览">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">快捷输入</CardTitle>
        <Button type="button" variant="outline" onClick={() => setCollapsed((value) => !value)}>
          {collapsed ? '展开预览' : '收起预览'}
        </Button>
      </CardHeader>
      {!collapsed ? (
        <CardContent>
          <ul className="grid gap-3">
            {quickInputs.length > 0 ? (
              quickInputs.map((item) => (
                <li key={item.id} className="rounded-2xl border bg-muted/40 px-4 py-3">
                  <strong className="mb-1 block">{item.name}</strong>
                  <p className="text-sm leading-6 text-muted-foreground">{item.prompt}</p>
                </li>
              ))
            ) : (
              <li className="text-sm text-muted-foreground">暂无快捷输入预览</li>
            )}
          </ul>
        </CardContent>
      ) : null}
    </Card>
  );
};
```

- [ ] **Step 4: 迁移 `SettingsShell` 外层骨架并保留原有行为**

```tsx
// src/features/settings/settings-shell.tsx
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

// 在 return 中替换外层容器
<main
  data-testid="settings-shell"
  data-theme={config.basic.theme}
  className={cn(
    'min-h-screen px-6 py-6',
    config.basic.theme === 'dark' && 'dark',
  )}
>
  <section className="mx-auto flex w-full max-w-7xl flex-col gap-6">
    <Card className="border-border/70 bg-card/90 shadow-2xl backdrop-blur">
      <CardHeader className="gap-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Stage 2 settings</p>
            <CardTitle className="text-3xl tracking-tight">{t('settings.title')}</CardTitle>
          </div>
          <div data-testid="settings-shell-actions" className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleSave} disabled={saving}>{t('settings.save')}</Button>
            <Button type="button" variant="outline" onClick={handleReset} disabled={saving}>{t('settings.reset')}</Button>
            <Button type="button" variant="outline" onClick={handleImport} disabled={saving}>导入配置</Button>
            <Button type="button" variant="outline" onClick={handleExport} disabled={saving}>导出配置</Button>
          </div>
        </div>

        <div data-testid="settings-shell-nav" className="flex flex-wrap gap-2">
          {navigationItems.map((item) => (
            <span key={item.key} className="inline-flex rounded-full border bg-muted px-3 py-1 text-sm">
              {t(item.key)}
            </span>
          ))}
        </div>
      </CardHeader>

      <CardContent className="grid gap-6">
        {error ? <section role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive">{error.title}：{error.message}</section> : null}
        <section className="grid gap-4 xl:grid-cols-[2fr_1fr_1fr]">
          {/* 模型卡片、语言主题卡片、缓存卡片保留原有数据流，只替换为 Card / Select / Button 结构 */}
        </section>
        <Separator />
        <QuickInputsPanel quickInputs={normalizeQuickInputs(config.quickInputs)} />
      </CardContent>
    </Card>
  </section>
</main>
```

- [ ] **Step 5: 跑设置页与快捷输入组件测试**

Run: `pnpm test:component -- tests/component/options/settings-shell.spec.tsx tests/component/options/quick-inputs.spec.tsx`

Expected: PASS。

- [ ] **Step 6: 跑阶段 2 既有组件回归**

Run: `pnpm test:component -- tests/component/options`

Expected: PASS，确认 `model-form.spec.tsx`、`quick-inputs.spec.tsx`、`settings-shell.spec.tsx` 全部转绿。

- [ ] **Step 7: 提交设置页迁移**

```bash
git add src/components/ui/input.tsx src/components/ui/select.tsx src/features/settings/settings-shell.tsx src/features/settings/model-form.tsx src/features/settings/quick-inputs-panel.tsx tests/component/options/settings-shell.spec.tsx tests/component/options/quick-inputs.spec.tsx
git commit -m "refactor: migrate settings shell to shadcn"
```

### Task 5: 文档同步与阶段验收

**Files:**
- Modify: `docs/tech_stack.md`
- Modify: `tasks.md`

- [ ] **Step 1: 同步技术栈文档与阶段任务状态**

```md
<!-- docs/tech_stack.md -->
- `shadcn/ui`
  - 通过 `components.json` + `preset b3F5SdK3Xe` 初始化，组件目录统一为 `src/components/ui`。
- `Tailwind CSS`
  - 全局样式入口固定为 `assets/styles/globals.css`，所有扩展入口页统一引入。
```

```md
<!-- tasks.md -->
- [x] 当前仓库尚未初始化 shadcn：`pnpm dlx shadcn@latest info --json` 返回 `config: null`、`components: []`。
- [x] 当前仓库尚未接入 Tailwind：`tailwindVersion / tailwindConfig / tailwindCss` 均为空，需要先补基础设施再推进后续 UI 工作。
- [x] 该阶段应先于阶段 3 大规模侧边栏 UI 实现落地，否则后续页面会继续积累一次性样式和重复组件。
```

- [ ] **Step 2: 运行阶段 2.5 验收命令**

Run: `pnpm dlx shadcn@latest info --json`

Expected: PASS，`config` 非空，`components` 至少包含 `button / card / badge / separator / input / select`。

Run: `pnpm test:component -- tests/component/ui/page-shell.spec.tsx`

Expected: PASS。

Run: `pnpm test:component -- tests/component/options/settings-shell.spec.tsx`

Expected: PASS。

Run: `pnpm test:e2e -- tests/e2e/entry-shell.spec.ts`

Expected: PASS。

Run: `pnpm build`

Expected: PASS，WXT 构建不报 Tailwind 或别名解析错误。

- [ ] **Step 3: 提交验收与文档**

```bash
git add docs/tech_stack.md tasks.md
git commit -m "docs: finalize stage 2.5 shadcn baseline"
```

## 3. 自检结论

1. **需求覆盖**
   - `tasks.md` 阶段 2.5 要求的失败测试、preset 初始化、Tailwind 接入、共享 UI 目录、最小迁移、文档同步和验收命令，均已映射到 Task 1-5。
2. **占位符扫描**
   - 计划中未保留 `TODO / TBD / later` 之类占位语句。
3. **命名一致性**
   - 统一使用 `assets/styles/globals.css`、`src/components/ui`、`PageShell`、`SettingsShell`、`ModelForm`、`QuickInputsPanel`。

