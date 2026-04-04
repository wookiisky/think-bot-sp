# 设置页规格与设计拉齐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `options/options.html` 的页面结构、核心配置能力、交互规则和回归测试与 `prd_docs/product-functional-spec.md`、`prd_docs/option.png` 对齐，且以 E2E 为主线建立可回归闭环。

**Architecture:** 先把当前单体 `SettingsShell` 拆成“壳层状态 + 左侧导航 + 分区面板”，再按 `Basic Settings / Quick Input Tabs / Language Models / Cloud Sync / Blacklist Settings` 五个纵向切片补齐 schema、runtime command 和 UI。所有界面控件统一服从当前 `components.json` 的 `shadcn/ui` 基线配置，优先复用已有 `src/components/ui/*`，缺失控件通过 `pnpm dlx shadcn@latest add` 按现有 `radix-mira + lucide + assets/styles/globals.css` 配置补齐，禁止额外手写一套平行设计系统。远端依赖统一收敛到 background service，默认自动化使用可注入测试 provider，真实 Gist / WebDAV 烟测继续 env-gated，不阻塞日常 CI。

**Tech Stack:** React 18、TypeScript、WXT、Zod、Vitest、Testing Library、Playwright、Tailwind CSS v4、`shadcn/ui`（`radix-mira`）、`@dnd-kit`

---

## Scope Check

- 这份规格实际覆盖 5 个相对独立的设置子系统，不适合继续在 `SettingsShell` 单文件里堆逻辑。
- 本计划仍保持“一个设置页集成计划”，但按 7 个可独立提交的纵向任务执行；每个任务都可以单独验证并提交。
- 当前仓库没有真实的 Cloud Sync command / service 实现，因此 Task 6 明确拆成“UI 契约 + background service + env-gated smoke”三层，避免把高不确定网络逻辑污染前 5 个页面任务。

## UI Consistency Rules

- 严格复用当前项目的 `shadcn/ui` 配置：
  - `style`: `radix-mira`
  - `iconLibrary`: `lucide`
  - `tailwind css`: `assets/styles/globals.css`
  - `ui alias`: `@/components/ui`
- 先用已有组件：`Button`、`Card`、`Input`、`Select`、`Separator`、`Badge`。
- 缺少的控件必须通过 `pnpm dlx shadcn@latest add` 增加源码组件，不允许为了赶进度手写自定义替代品。
- 设置页允许写布局类 `className`，但不允许脱离 shadcn token 手写另一套颜色、边框、字号体系。
- 所有新增表单、导航、反馈和弹层优先用 shadcn 组件组合，不用“样式化 div + button”拼装伪组件。

## Planned File Structure

- Create: `src/components/ui/textarea.tsx`
  - 通过 shadcn CLI 增加，多行输入统一用于 system prompt、Jina 模板、快捷输入消息。
- Create: `src/components/ui/checkbox.tsx`
  - 通过 shadcn CLI 增加，统一用于启用开关、自动触发、branch model 多选。
- Create: `src/components/ui/switch.tsx`
  - 通过 shadcn CLI 增加，统一用于布尔型配置切换。
- Create: `src/components/ui/tabs.tsx`
  - 通过 shadcn CLI 增加，统一承载左侧栏目导航的可访问语义。
- Create: `src/components/ui/alert.tsx`
  - 通过 shadcn CLI 增加，统一展示最近错误、连接测试结果和导入失败提示。
- Modify: `package.json`
  - 增加 `@dnd-kit/core`、`@dnd-kit/sortable`、`@dnd-kit/utilities`，只用于模型和快捷输入排序。
- Modify: `pnpm-lock.yaml`
  - 锁定新增依赖版本。
- Modify: `src/domain/config/config-schema.ts`
  - 扩展 Basic / Quick Input / Sync / Blacklist 字段，统一导出选择器和归一化 helper。
- Modify: `src/repositories/config-repository.ts`
  - 增加模板导入并入、同步时间写回、引用过滤与 `updatedAt` 刷新。
- Create: `src/repositories/runtime-error-repository.ts`
  - 保存最近一次可展示错误，供设置页读取。
- Create: `src/services/sync/sync-service.ts`
  - 统一测试连接、执行同步、写回 `lastSyncAt`。
- Create: `src/services/sync/gist-sync-provider.ts`
  - Gist provider 适配器。
- Create: `src/services/sync/webdav-sync-provider.ts`
  - WebDAV provider 适配器。
- Modify: `src/services/runtime-messaging/config-commands.ts`
  - 扩展设置页所需 typed command。
- Modify: `entrypoints/background.ts`
  - 注入 sync service、runtime error repository，并把新命令接到 background。
- Modify: `src/features/settings/settings-api.ts`
  - 提供 settings page 所需完整 API。
- Create: `src/features/settings/settings-shell-state.ts`
  - 保存草稿配置、已保存配置、未保存状态、当前栏目、临时错误。
- Create: `src/features/settings/settings-nav.tsx`
  - 左侧 5 个固定栏目导航。
- Create: `src/features/settings/settings-actions.tsx`
  - 顶部全局动作区，承载 `保存 / 导出配置 / 导入配置 / 重置为默认值 / 保存并同步`，全部复用 shadcn `Button / Alert`。
- Create: `src/features/settings/basic-settings-panel.tsx`
  - 基础设置：缓存、默认模型、全局 branch model、主题、语言、system prompt、Filter COT、提取设置，统一复用 shadcn 表单控件。
- Create: `src/features/settings/language-models-panel.tsx`
  - 模型列表摘要、展开编辑、新增、复制、软删除、排序，统一复用 shadcn `Card / Button / Checkbox / Input / Select`。
- Modify: `src/features/settings/model-form.tsx`
  - 补全 Model / Temperature / Tools / Thinking Budget / Max Output Tokens / Enabled / Supports Images。
- Modify: `src/features/settings/quick-inputs-panel.tsx`
  - 从只读预览升级为编辑器：新增、折叠、排序、自动触发、软删除、专属 branch model，统一复用 shadcn `Card / Textarea / Checkbox / Button`。
- Create: `src/features/settings/cloud-sync-panel.tsx`
  - 云同步配置、连接测试、状态、最近同步时间，统一复用 shadcn `Card / Alert / Input / Select / Button`。
- Create: `src/features/settings/blacklist-panel.tsx`
  - 黑名单规则列表、编辑、默认规则恢复、匹配测试，统一复用 shadcn `Card / Input / Select / Textarea / Alert / Button`。
- Modify: `src/features/settings/settings-shell.tsx`
  - 组合所有 panel，移除当前“导航 chip + 三卡片 + 预览”的临时布局。
- Modify: `src/ui/icon.tsx`
  - 增补设置页顶部所需图标，例如 `github`、`add`、`delete`、`copy`、`drag`、`sync`。
- Modify: `locales/zh-CN.yml`
  - 增加设置页完整平铺 key。
- Modify: `locales/en.yml`
  - 增加设置页完整平铺 key。
- Create: `tests/component/options/settings-layout.spec.tsx`
  - 壳层、左侧导航、未保存状态、动作区。
- Create: `tests/component/options/basic-settings-panel.spec.tsx`
  - Basic Settings 的字段与候选过滤。
- Create: `tests/component/options/language-models-panel.spec.tsx`
  - 模型新增、复制、排序、软删除、字段显隐。
- Modify: `tests/component/options/quick-inputs.spec.tsx`
  - 快捷输入编辑、排序、自动触发、专属 branch model。
- Create: `tests/component/options/cloud-sync-panel.spec.tsx`
  - 同步 provider 切换、连接测试、最近同步时间。
- Create: `tests/component/options/blacklist-panel.spec.tsx`
  - 黑名单新增、编辑、重置、测试。
- Modify: `tests/component/options/settings-shell.spec.tsx`
  - 保留现有回归，同时迁移到新布局断言。
- Modify: `tests/unit/domain/config-schema.spec.ts`
  - 新字段默认值、唯一性、引用过滤、Provider 校验。
- Modify: `tests/unit/repositories/config-repository.spec.ts`
  - 模板导入与同步时间写回。
- Modify: `tests/unit/services/runtime-messaging/config-commands.spec.ts`
  - 新命令识别和路由。
- Modify: `tests/unit/features/settings-api.spec.ts`
  - 新 API 错误路径。
- Create: `tests/unit/repositories/runtime-error-repository.spec.ts`
  - 最近错误记录和覆盖。
- Create: `tests/e2e/helpers/settings-driver.ts`
  - 设置页 E2E 驱动：打开页面、选择栏目、读 storage、读最后错误。
- Create: `tests/e2e/settings-layout.spec.ts`
  - 页面结构、未保存状态、保存/重置。
- Create: `tests/e2e/settings-models.spec.ts`
  - 模型新增、复制、默认模型候选、保存后侧边栏可见。
- Create: `tests/e2e/settings-quick-inputs.spec.ts`
  - 快捷输入新增、排序、软删除、自动触发配置持久化。
- Create: `tests/e2e/settings-blacklist.spec.ts`
  - 设置页保存黑名单后，侧边栏被真实拦截。
- Create: `tests/e2e/settings-sync.spec.ts`
  - 假 provider 下连接测试、保存并同步、最近同步时间。
- Modify: `docs/Workspace/settings.md`
  - 更新设置页模块边界、结构和阶段边界。
- Modify: `docs/DataSchema/config.md`
  - 更新新字段、选择器、导入过滤规则。
- Modify: `docs/Services/runtime-messaging.md`
  - 写明设置页新增命令。
- Modify: `docs/Services/sync.md`
  - 补充默认自动化与 env-gated smoke 的边界。
- Modify: `docs/Services/blacklist.md`
  - 补充设置页黑名单编辑入口。
- Modify: `docs/test/settings-core.md`
  - 更新组件和 E2E 验收矩阵。

### Task 1: 锁定页面骨架与“未保存更改”契约

**Files:**
- Create: `tests/component/options/settings-layout.spec.tsx`
- Modify: `tests/component/options/settings-shell.spec.tsx`
- Create: `tests/e2e/helpers/settings-driver.ts`
- Create: `tests/e2e/settings-layout.spec.ts`

- [ ] **Step 1: 先写组件失败测试，固定左侧导航、动作区和未保存状态**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { createDefaultConfig } from '../../../src/domain/config/config-schema';
import { SettingsShell } from '../../../src/features/settings/settings-shell';

it('左侧导航固定为五个栏目并在切换后保留未保存表单', async () => {
  mocks.getConfig.mockResolvedValueOnce(
    createDefaultConfig({
      models: [
        {
          id: 'model-1',
          name: '主模型',
          provider: 'openai-compatible',
          enabled: true,
          model: 'gpt-4o-mini',
          baseUrl: 'https://api.example.com',
          apiKey: 'secret',
          deployment: '',
          temperature: 0.2,
          tools: [],
          thinkingBudget: null,
          maxOutputTokens: null,
          supportsImages: true,
          order: 0,
          deletedAt: null,
        },
      ],
    }),
  );
  mocks.getLocalCacheStats.mockResolvedValueOnce({ entryCount: 0, bytes: 0 });

  render(<SettingsShell />);

  await screen.findByRole('tab', { name: '基础设置' });
  expect(screen.getAllByRole('tab')).toHaveLength(5);
  expect(screen.getByRole('tab', { name: '基础设置' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByTestId('settings-shell-actions')).toHaveTextContent('保存并同步');

  const user = userEvent.setup();
  await user.clear(screen.getByLabelText('System Prompt'));
  await user.type(screen.getByLabelText('System Prompt'), '始终使用中文回答');
  expect(screen.getByText('有未保存更改')).toBeInTheDocument();

  await user.click(screen.getByRole('tab', { name: '语言模型' }));
  await user.click(screen.getByRole('tab', { name: '基础设置' }));
  expect(screen.getByLabelText('System Prompt')).toHaveValue('始终使用中文回答');
});
```

- [ ] **Step 2: 运行组件测试，确认当前实现失败**

Run: `pnpm test:component -- tests/component/options/settings-layout.spec.tsx`
Expected: FAIL，提示缺少 `tab` 导航、`保存并同步` 和 `System Prompt` 字段。

- [ ] **Step 3: 写 E2E 失败测试，固定整页布局与未保存提示**

```ts
import { expect, test } from './helpers/extension-fixture';
import { openSettingsPage } from './helpers/settings-driver';

test('settings layout keeps unsaved edits across section switches', async ({ context, extensionId }) => {
  const page = await openSettingsPage({ context, extensionId });

  await expect(page.getByRole('tab', { name: '基础设置' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '语言模型' })).toBeVisible();
  await expect(page.getByRole('button', { name: '保存并同步' })).toBeVisible();

  await page.getByLabel('System Prompt').fill('始终使用中文回答');
  await expect(page.getByText('有未保存更改')).toBeVisible();

  await page.getByRole('tab', { name: '语言模型' }).click();
  await page.getByRole('tab', { name: '基础设置' }).click();
  await expect(page.getByLabel('System Prompt')).toHaveValue('始终使用中文回答');
});
```

- [ ] **Step 4: 运行 E2E，确认旧页面结构不满足要求**

Run: `pnpm build`
Expected: PASS，生成 `.output/chrome-mv3`。

Run: `pnpm test:e2e -- tests/e2e/settings-layout.spec.ts`
Expected: FAIL，提示找不到 `基础设置` tab 或 `System Prompt` 字段。

- [ ] **Step 5: 提交测试基线**

```bash
git add tests/component/options/settings-layout.spec.tsx tests/component/options/settings-shell.spec.tsx tests/e2e/helpers/settings-driver.ts tests/e2e/settings-layout.spec.ts
git commit -m "test: lock settings page layout and dirty-state contract"
```

### Task 2: 拆出设置页壳层状态与左侧后台式布局

**Files:**
- Create: `src/features/settings/settings-shell-state.ts`
- Create: `src/features/settings/settings-nav.tsx`
- Create: `src/features/settings/settings-actions.tsx`
- Modify: `src/features/settings/settings-shell.tsx`
- Modify: `src/ui/icon.tsx`
- Modify: `locales/zh-CN.yml`
- Modify: `locales/en.yml`
- Test: `tests/component/options/settings-layout.spec.tsx`
- Test: `tests/e2e/settings-layout.spec.ts`

- [ ] **Step 1: 先按当前 `components.json` 补齐缺失的 shadcn/ui 组件**

Run: `pnpm dlx shadcn@latest add tabs textarea checkbox switch alert`
Expected: PASS，新增组件落到 `src/components/ui/`，样式继续复用 `assets/styles/globals.css`，不改 alias 与 preset。

- [ ] **Step 2: 先实现壳层状态 hook，显式建模栏目与未保存状态**

```ts
import { useMemo, useState } from 'react';

import type { ExtensionConfig } from '../../domain/config/config-schema';

export type SettingsSectionId = 'basic' | 'quick-inputs' | 'models' | 'sync' | 'blacklist';

const serializeConfig = (config: ExtensionConfig) => JSON.stringify(config);

export const useSettingsShellState = (initialConfig: ExtensionConfig) => {
  const [savedConfig, setSavedConfig] = useState(initialConfig);
  const [draftConfig, setDraftConfig] = useState(initialConfig);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('basic');

  const hasUnsavedChanges = useMemo(
    () => serializeConfig(savedConfig) !== serializeConfig(draftConfig),
    [savedConfig, draftConfig],
  );

  return {
    savedConfig,
    draftConfig,
    setDraftConfig,
    replaceSavedConfig(nextConfig: ExtensionConfig) {
      setSavedConfig(nextConfig);
      setDraftConfig(nextConfig);
    },
    activeSection,
    setActiveSection,
    hasUnsavedChanges,
  };
};
```

- [ ] **Step 3: 实现左侧五栏目导航，不再使用导航 chips**

```tsx
import type { SettingsSectionId } from './settings-shell-state';

const items: Array<{ id: SettingsSectionId; label: string }> = [
  { id: 'basic', label: '基础设置' },
  { id: 'quick-inputs', label: '标签页' },
  { id: 'models', label: '语言模型' },
  { id: 'sync', label: '云同步' },
  { id: 'blacklist', label: '黑名单设置' },
];

export const SettingsNav = ({
  activeSection,
  onChange,
}: {
  activeSection: SettingsSectionId;
  onChange: (section: SettingsSectionId) => void;
}) => (
  <nav aria-label="设置导航" data-testid="settings-shell-nav" className="grid gap-2">
    {items.map((item) => (
      <button
        key={item.id}
        type="button"
        role="tab"
        aria-selected={activeSection === item.id}
        className={activeSection === item.id ? 'rounded-xl border border-primary bg-primary/10 px-4 py-3 text-left text-primary' : 'rounded-xl px-4 py-3 text-left text-muted-foreground'}
        onClick={() => onChange(item.id)}
      >
        {item.label}
      </button>
    ))}
  </nav>
);
```

- [ ] **Step 4: 改写 `SettingsShell`，组合顶部动作区、左侧导航和右侧分区容器**

```tsx
<main data-testid="settings-shell" data-layout="settings-backoffice" data-theme={draftConfig.basic.theme}>
  <section className="mx-auto grid min-h-screen w-full max-w-[1680px] grid-cols-[280px_minmax(0,1fr)] gap-10 px-8 py-6">
    <aside className="border-r border-border pr-6">
      <SettingsNav activeSection={activeSection} onChange={setActiveSection} />
    </aside>

    <section className="grid gap-6">
      <SettingsActions
        hasUnsavedChanges={hasUnsavedChanges}
        saving={saving}
        onSave={handleSave}
        onSaveAndSync={handleSaveAndSync}
        onImport={handleImport}
        onExport={handleExport}
        onReset={handleReset}
      />

      {activeSection === 'basic' ? (
        <BasicSettingsPanel
          config={draftConfig}
          cacheStats={cacheStats}
          disabled={saving}
          onChange={setDraftConfig}
          onClearCache={handleClearCache}
        />
      ) : null}
      {activeSection === 'quick-inputs' ? (
        <QuickInputsPanel
          config={draftConfig}
          disabled={saving}
          onChange={setDraftConfig}
        />
      ) : null}
      {activeSection === 'models' ? (
        <LanguageModelsPanel
          config={draftConfig}
          disabled={saving}
          onChange={setDraftConfig}
        />
      ) : null}
      {activeSection === 'sync' ? (
        <CloudSyncPanel
          config={draftConfig}
          disabled={saving}
          onChange={setDraftConfig}
          onTestConnection={handleTestSync}
          onSyncNow={handleSaveAndSync}
        />
      ) : null}
      {activeSection === 'blacklist' ? (
        <BlacklistPanel
          config={draftConfig}
          disabled={saving}
          onChange={setDraftConfig}
          onResetDefaults={handleResetBlacklistDefaults}
          onTestRule={handleTestBlacklistRule}
        />
      ) : null}
    </section>
  </section>
</main>
```

- [ ] **Step 5: 跑目标测试，确认新壳层通过**

Run: `pnpm test:component -- tests/component/options/settings-layout.spec.tsx tests/component/options/settings-shell.spec.tsx`
Expected: PASS。

Run: `pnpm test:e2e -- tests/e2e/settings-layout.spec.ts`
Expected: PASS。

- [ ] **Step 6: 提交页面壳层改造**

```bash
git add src/components/ui/tabs.tsx src/components/ui/textarea.tsx src/components/ui/checkbox.tsx src/components/ui/switch.tsx src/components/ui/alert.tsx src/features/settings/settings-shell-state.ts src/features/settings/settings-nav.tsx src/features/settings/settings-actions.tsx src/features/settings/settings-shell.tsx src/ui/icon.tsx locales/zh-CN.yml locales/en.yml tests/component/options/settings-layout.spec.tsx tests/component/options/settings-shell.spec.tsx tests/e2e/settings-layout.spec.ts
git commit -m "feat: rebuild settings page shell with sidebar navigation"
```

### Task 3: 补齐 Basic Settings 的配置契约与面板

**Files:**
- Modify: `src/domain/config/config-schema.ts`
- Create: `src/features/settings/basic-settings-panel.tsx`
- Modify: `src/features/settings/settings-shell.tsx`
- Modify: `tests/unit/domain/config-schema.spec.ts`
- Create: `tests/component/options/basic-settings-panel.spec.tsx`
- Modify: `docs/DataSchema/config.md`

- [ ] **Step 1: 先写 schema 与组件失败测试，固定基础设置字段**

```ts
it('basic settings 包含默认模型、全局 branch models 和提取设置默认值', () => {
  const config = createDefaultConfig();

  expect(config.basic.globalBranchModelIds).toEqual([]);
  expect(config.basic.defaultExtractionContentHeight).toBe(320);
  expect(config.basic.jinaApiKey).toBe('');
  expect(config.basic.jinaResponseTemplate).toBe('');
});
```

```tsx
it('默认模型候选只展示启用且配置完整的模型', async () => {
  render(
    <BasicSettingsPanel
      config={createDefaultConfig({
        basic: {
          ...createDefaultConfig().basic,
          defaultModelId: 'good-model',
        },
        models: [
          { ...completeModel('good-model', '主模型'), order: 0 },
          { ...completeModel('disabled-model', '禁用模型'), enabled: false, order: 1 },
          { ...completeModel('broken-model', '不完整模型'), apiKey: '', order: 2 },
        ],
      })}
      cacheStats={{ entryCount: 1, bytes: 16 }}
      disabled={false}
      onChange={vi.fn()}
      onClearCache={vi.fn()}
    />,
  );

  await userEvent.setup().click(screen.getByRole('combobox', { name: '默认模型' }));
  const listbox = await screen.findByRole('listbox');
  expect(within(listbox).getByText('主模型')).toBeInTheDocument();
  expect(within(listbox).queryByText('禁用模型')).not.toBeInTheDocument();
  expect(within(listbox).queryByText('不完整模型')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: 运行失败测试**

Run: `pnpm test:unit -- tests/unit/domain/config-schema.spec.ts -t "basic settings 包含默认模型、全局 branch models 和提取设置默认值"`
Expected: FAIL，提示 `globalBranchModelIds` 等字段不存在。

Run: `pnpm test:component -- tests/component/options/basic-settings-panel.spec.tsx`
Expected: FAIL，提示缺少 `BasicSettingsPanel`。

- [ ] **Step 3: 扩展配置 schema 和默认值**

```ts
const basicConfigSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']),
  language: z.enum(['zh-CN', 'en']),
  defaultModelId: z.string().min(1).nullable(),
  globalBranchModelIds: z.array(z.string().min(1)),
  systemPrompt: z.string(),
  filterCot: z.boolean(),
  extractionMethod: z.enum(['readability', 'jina']),
  defaultExtractionContentHeight: z.number().int().min(160).max(720),
  jinaApiKey: z.string(),
  jinaResponseTemplate: z.string(),
  includePageContentByDefault: z.boolean(),
});

export const extensionConfigSchema = z.object({
  version: z.literal(CONFIG_SCHEMA_VERSION),
  updatedAt: z.number().int().nonnegative(),
  basic: basicConfigSchema,
  models: z.array(modelConfigSchema),
  quickInputs: z.array(quickInputSchema),
  sync: syncConfigSchema,
  blacklist: z.array(blacklistRuleSchema),
});

export const createDefaultConfig = (overrides: Partial<ExtensionConfig> = {}): ExtensionConfig =>
  extensionConfigSchema.parse({
    version: CONFIG_SCHEMA_VERSION,
    updatedAt: overrides.updatedAt ?? Date.now(),
    basic: {
      theme: 'system',
      language: 'zh-CN',
      defaultModelId: null,
      globalBranchModelIds: [],
      systemPrompt: '',
      filterCot: false,
      extractionMethod: 'readability',
      defaultExtractionContentHeight: 320,
      jinaApiKey: '',
      jinaResponseTemplate: '',
      includePageContentByDefault: true,
      ...(overrides.basic ?? {}),
    },
    models: overrides.models ?? [],
    quickInputs: overrides.quickInputs ?? [],
    sync: {
      enabled: false,
      provider: 'none',
      gistToken: '',
      gistId: '',
      webdavUrl: '',
      webdavUsername: '',
      webdavPassword: '',
      lastSyncAt: null,
      ...(overrides.sync ?? {}),
    },
    blacklist: overrides.blacklist ?? [],
  });
```

- [ ] **Step 4: 实现基础设置面板，覆盖缓存、主题、语言、提取与高级字段**

```tsx
export const BasicSettingsPanel = ({
  config,
  cacheStats,
  disabled,
  onChange,
  onClearCache,
}: BasicSettingsPanelProps) => {
  const enabledCompleteModels = getEnabledCompleteModels(config);

  return (
    <section className="grid gap-6">
      <Card>
        <CardHeader><CardTitle>基础设置</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-medium">默认模型</span>
            <Select value={config.basic.defaultModelId ?? '__none__'} disabled={disabled} onValueChange={(value) => onChange({
              ...config,
              basic: { ...config.basic, defaultModelId: value === '__none__' ? null : value },
            })}>
              <SelectTrigger aria-label="默认模型"><SelectValue placeholder="选择默认模型" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">未设置</SelectItem>
                {enabledCompleteModels.map((model) => <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">System Prompt</span>
            <Input aria-label="System Prompt" value={config.basic.systemPrompt} disabled={disabled} onChange={(event) => onChange({
              ...config,
              basic: { ...config.basic, systemPrompt: event.target.value },
            })} />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" aria-label="Filter COT" checked={config.basic.filterCot} disabled={disabled} onChange={(event) => onChange({
              ...config,
              basic: { ...config.basic, filterCot: event.target.checked },
            })} />
            <span>Filter COT</span>
          </label>

          <Button type="button" variant="outline" onClick={onClearCache} disabled={disabled}>清理本地缓存</Button>
        </CardContent>
      </Card>
    </section>
  );
};
```

- [ ] **Step 5: 跑通过本任务测试并更新文档**

Run: `pnpm test:unit -- tests/unit/domain/config-schema.spec.ts tests/unit/repositories/config-repository.spec.ts`
Expected: PASS。

Run: `pnpm test:component -- tests/component/options/basic-settings-panel.spec.tsx tests/component/options/settings-layout.spec.tsx`
Expected: PASS。

- [ ] **Step 6: 提交基础设置切片**

```bash
git add src/domain/config/config-schema.ts src/features/settings/basic-settings-panel.tsx src/features/settings/settings-shell.tsx tests/unit/domain/config-schema.spec.ts tests/component/options/basic-settings-panel.spec.tsx docs/DataSchema/config.md
git commit -m "feat: add basic settings panel and config fields"
```

### Task 4: 拉齐 Language Models 的列表摘要、展开编辑与排序

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/features/settings/language-models-panel.tsx`
- Modify: `src/features/settings/model-form.tsx`
- Modify: `src/features/settings/settings-shell.tsx`
- Create: `tests/component/options/language-models-panel.spec.tsx`
- Modify: `tests/component/options/model-form.spec.tsx`
- Create: `tests/e2e/settings-models.spec.ts`

- [ ] **Step 1: 先写失败测试，锁定模型列表摘要、复制、软删除和排序**

```tsx
it('语言模型页支持新增、复制、软删除和拖拽后保存顺序', async () => {
  const user = userEvent.setup();
  render(<LanguageModelsPanel config={createConfigWithTwoModels()} disabled={false} onChange={onChange} />);

  await user.click(screen.getByRole('button', { name: '新增新模型' }));
  expect(screen.getAllByRole('button', { name: /展开模型/ })).toHaveLength(3);

  await user.click(screen.getByRole('button', { name: '复制 主模型' }));
  expect(screen.getAllByRole('button', { name: /展开模型/ })).toHaveLength(4);

  await user.click(screen.getByRole('button', { name: '删除 备用模型' }));
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
    models: expect.arrayContaining([expect.objectContaining({ id: 'model-2', deletedAt: expect.any(Number) })]),
  }));
});
```

- [ ] **Step 2: 运行失败测试**

Run: `pnpm test:component -- tests/component/options/language-models-panel.spec.tsx tests/component/options/model-form.spec.tsx`
Expected: FAIL，提示缺少 `LanguageModelsPanel` 或 `新增新模型` 按钮。

- [ ] **Step 3: 用成熟库接入排序，并实现模型列表摘要**

```tsx
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

export const LanguageModelsPanel = ({ config, disabled, onChange }: LanguageModelsPanelProps) => {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const visibleModels = [...config.models].filter((model) => model.deletedAt === null).sort((a, b) => a.order - b.order);

  return (
    <section className="grid gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-semibold text-primary">语言模型</h2>
        <Button type="button" onClick={() => onChange(addModel(config))}>新增新模型</Button>
      </div>

      <DndContext sensors={sensors} onDragEnd={(event) => onChange(reorderModels(config, event))}>
        <SortableContext items={visibleModels.map((model) => model.id)} strategy={verticalListSortingStrategy}>
          {visibleModels.map((model) => (
            <ModelSummaryRow key={model.id} model={model} disabled={disabled} onChange={onChange} />
          ))}
        </SortableContext>
      </DndContext>
    </section>
  );
};
```

- [ ] **Step 4: 补全 `ModelForm` 字段，覆盖 spec 中的 Provider 差异能力**

```tsx
<label className="grid gap-2">
  <span className="text-sm font-medium">模型 ID</span>
  <Input aria-label="模型 ID" value={model.model} disabled={disabled} onChange={(event) => updateModel({ model: event.target.value })} />
</label>

<label className="grid gap-2">
  <span className="text-sm font-medium">Temperature</span>
  <Input
    aria-label="Temperature"
    type="number"
    value={String(model.temperature)}
    disabled={disabled}
    onChange={(event) => updateModel({ temperature: Number(event.target.value || 0) })}
  />
</label>

<label className="grid gap-2">
  <span className="text-sm font-medium">最大输出 token</span>
  <Input
    aria-label="最大输出 token"
    type="number"
    value={model.maxOutputTokens === null ? '' : String(model.maxOutputTokens)}
    disabled={disabled}
    onChange={(event) => updateModel({ maxOutputTokens: event.target.value ? Number(event.target.value) : null })}
  />
</label>

<label className="flex items-center gap-2 text-sm">
  <input
    aria-label="启用模型"
    type="checkbox"
    checked={model.enabled}
    disabled={disabled}
    onChange={(event) => updateModel({ enabled: event.target.checked })}
  />
  <span>启用模型</span>
</label>
```

- [ ] **Step 5: 补一个真正的 E2E，验证保存后侧边栏能看到新模型**

```ts
test('saving a new complete model makes it available to sidebar model selector', async ({ context, extensionId }) => {
  const settings = await openSettingsPage({ context, extensionId });
  await settings.getByRole('tab', { name: '语言模型' }).click();
  await settings.getByRole('button', { name: '新增新模型' }).click();

  await settings.getByLabel('显示名称').fill('Playwright 模型');
  await settings.getByLabel('模型 ID').fill('gpt-4o-mini');
  await settings.getByLabel('Base URL').fill('https://api.example.com');
  await settings.getByLabel('API Key').fill('secret');
  await settings.getByRole('button', { name: '保存' }).click();

  const sidebar = await context.newPage();
  await sidebar.goto(`chrome-extension://${extensionId}/sidebar.html?tabId=1&pageUrl=https%3A%2F%2Fexample.com`);
  await expect(sidebar.getByRole('combobox', { name: '选择模型' })).toContainText('Playwright 模型');
});
```

- [ ] **Step 6: 运行通过并提交**

Run: `pnpm test:component -- tests/component/options/language-models-panel.spec.tsx tests/component/options/model-form.spec.tsx`
Expected: PASS。

Run: `pnpm test:e2e -- tests/e2e/settings-models.spec.ts`
Expected: PASS。

```bash
git add package.json pnpm-lock.yaml src/features/settings/language-models-panel.tsx src/features/settings/model-form.tsx src/features/settings/settings-shell.tsx tests/component/options/language-models-panel.spec.tsx tests/component/options/model-form.spec.tsx tests/e2e/settings-models.spec.ts
git commit -m "feat: align settings language models section"
```

### Task 5: 把 Quick Input Tabs 从只读预览升级为完整编辑器

**Files:**
- Modify: `src/domain/config/config-schema.ts`
- Modify: `src/repositories/config-repository.ts`
- Modify: `src/features/settings/quick-inputs-panel.tsx`
- Modify: `src/features/settings/settings-shell.tsx`
- Modify: `tests/component/options/quick-inputs.spec.tsx`
- Modify: `tests/unit/repositories/config-repository.spec.ts`
- Create: `tests/e2e/settings-quick-inputs.spec.ts`

- [ ] **Step 1: 先写失败测试，固定新增、折叠、自动触发、专属 branch model 与软删除**

```tsx
it('快捷输入页支持新增、折叠、自动触发、专属 branch model 和软删除', async () => {
  const user = userEvent.setup();
  render(<QuickInputsPanel config={createQuickInputsConfig()} disabled={false} onChange={onChange} />);

  await user.click(screen.getByRole('button', { name: '新增快捷输入' }));
  await user.type(screen.getByLabelText('快捷输入名称'), '总结');
  await user.type(screen.getByLabelText('快捷输入消息'), '请总结当前页面');
  await user.click(screen.getByRole('checkbox', { name: '自动触发' }));
  await user.click(screen.getByRole('checkbox', { name: 'branch: Claude 3.7' }));

  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
    quickInputs: expect.arrayContaining([
      expect.objectContaining({
        name: '总结',
        autoTrigger: true,
        branchModelIds: ['branch-model-1'],
      }),
    ]),
  }));
});
```

- [ ] **Step 2: 运行失败测试**

Run: `pnpm test:component -- tests/component/options/quick-inputs.spec.tsx`
Expected: FAIL，提示缺少 `branchModelIds` 或 `新增快捷输入`。

- [ ] **Step 3: 扩展 Quick Input schema，并在 repository 中支持模板并入和未知引用过滤**

```ts
const quickInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  prompt: z.string().min(1),
  autoTrigger: z.boolean(),
  branchModelIds: z.array(z.string().min(1)),
  order: z.number().int().nonnegative(),
  deletedAt: z.number().int().nonnegative().nullable(),
});

const normalizeImportedQuickInput = ({
  template,
  enabledModelIds,
  index,
}: {
  template: { name: string; prompt: string; autoTrigger: boolean; branchModelIds: string[] };
  enabledModelIds: Set<string>;
  index: number;
}) => ({
  id: crypto.randomUUID(),
  name: template.name,
  prompt: template.prompt,
  autoTrigger: template.autoTrigger,
  branchModelIds: template.branchModelIds.filter((modelId) => enabledModelIds.has(modelId)),
  order: index,
  deletedAt: null,
});
```

- [ ] **Step 4: 改写 `QuickInputsPanel`，用编辑列表取代折叠预览**

```tsx
export const QuickInputsPanel = ({ config, disabled, onChange }: QuickInputsPanelProps) => {
  const branchModels = getEnabledCompleteModels(config);
  const quickInputs = [...config.quickInputs].filter((item) => item.deletedAt === null).sort((a, b) => a.order - b.order);

  return (
    <section className="grid gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-semibold text-primary">标签页</h2>
        <Button type="button" onClick={() => onChange(addQuickInput(config))} disabled={disabled}>新增快捷输入</Button>
      </div>

      {quickInputs.map((item) => (
        <Card key={item.id}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{item.name || '未命名快捷输入'}</CardTitle>
            <Button type="button" variant="outline" onClick={() => onChange(softDeleteQuickInput(config, item.id))}>删除</Button>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Input aria-label="快捷输入名称" value={item.name} onChange={(event) => onChange(updateQuickInput(config, item.id, { name: event.target.value }))} />
            <Input aria-label="快捷输入消息" value={item.prompt} onChange={(event) => onChange(updateQuickInput(config, item.id, { prompt: event.target.value }))} />
            <label className="flex items-center gap-2">
              <input type="checkbox" aria-label="自动触发" checked={item.autoTrigger} onChange={(event) => onChange(updateQuickInput(config, item.id, { autoTrigger: event.target.checked }))} />
              <span>自动触发</span>
            </label>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">专属 branch models</legend>
              {branchModels.map((model) => (
                <label key={model.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    aria-label={`branch: ${model.name}`}
                    checked={item.branchModelIds.includes(model.id)}
                    onChange={() => onChange(toggleQuickInputBranchModel(config, item.id, model.id))}
                  />
                  <span>{model.name}</span>
                </label>
              ))}
            </fieldset>
          </CardContent>
        </Card>
      ))}
    </section>
  );
};
```

- [ ] **Step 5: 补 E2E，验证排序与软删除会真正持久化**

```ts
test('quick inputs persist order and soft delete markers after save', async ({ context, extensionId }) => {
  const page = await openSettingsPage({ context, extensionId });
  await page.getByRole('tab', { name: '标签页' }).click();

  await page.getByRole('button', { name: '新增快捷输入' }).click();
  await page.getByLabel('快捷输入名称').fill('总结');
  await page.getByLabel('快捷输入消息').fill('请总结当前页面');
  await page.getByRole('button', { name: '保存' }).click();

  const stored = await readStoredConfig({ context });
  expect(stored.quickInputs[0].name).toBe('总结');
  expect(stored.quickInputs[0].deletedAt).toBeNull();
});
```

- [ ] **Step 6: 运行通过并提交**

Run: `pnpm test:component -- tests/component/options/quick-inputs.spec.tsx`
Expected: PASS。

Run: `pnpm test:e2e -- tests/e2e/settings-quick-inputs.spec.ts`
Expected: PASS。

```bash
git add src/domain/config/config-schema.ts src/repositories/config-repository.ts src/features/settings/quick-inputs-panel.tsx src/features/settings/settings-shell.tsx tests/component/options/quick-inputs.spec.tsx tests/unit/repositories/config-repository.spec.ts tests/e2e/settings-quick-inputs.spec.ts
git commit -m "feat: add quick input tabs editor to settings page"
```

### Task 6: 落 Cloud Sync 的 UI、typed command 与 background service

**Files:**
- Create: `src/services/sync/sync-service.ts`
- Create: `src/services/sync/gist-sync-provider.ts`
- Create: `src/services/sync/webdav-sync-provider.ts`
- Modify: `src/services/runtime-messaging/config-commands.ts`
- Modify: `entrypoints/background.ts`
- Modify: `src/features/settings/settings-api.ts`
- Create: `src/features/settings/cloud-sync-panel.tsx`
- Modify: `src/features/settings/settings-actions.tsx`
- Modify: `tests/unit/services/runtime-messaging/config-commands.spec.ts`
- Modify: `tests/unit/features/settings-api.spec.ts`
- Create: `tests/component/options/cloud-sync-panel.spec.tsx`
- Create: `tests/e2e/settings-sync.spec.ts`
- Modify: `docs/Services/runtime-messaging.md`
- Modify: `docs/Services/sync.md`

- [ ] **Step 1: 先写失败测试，锁定新命令和 UI 状态**

```ts
it('暴露 sync 与远端模板相关命令', () => {
  expect(Array.from(supportedCommandTypes)).toEqual(expect.arrayContaining([
    'TEST_SYNC_CONNECTION',
    'SYNC_NOW',
    'FETCH_REMOTE_QUICK_INPUT_TEMPLATES',
    'IMPORT_REMOTE_QUICK_INPUT_TEMPLATES',
    'GET_LAST_RUNTIME_ERROR',
  ]));
});
```

```tsx
it('云同步页展示 provider 配置、连接测试和最近同步时间', async () => {
  render(<CloudSyncPanel config={createDefaultConfig()} disabled={false} onChange={vi.fn()} onTestConnection={vi.fn()} onSyncNow={vi.fn()} />);

  expect(screen.getByRole('combobox', { name: '同步 Provider' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '连接测试' })).toBeInTheDocument();
  expect(screen.getByText('尚未同步')).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行失败测试**

Run: `pnpm test:unit -- tests/unit/services/runtime-messaging/config-commands.spec.ts tests/unit/features/settings-api.spec.ts`
Expected: FAIL，提示命令类型缺失。

Run: `pnpm test:component -- tests/component/options/cloud-sync-panel.spec.tsx`
Expected: FAIL，提示缺少 `CloudSyncPanel`。

- [ ] **Step 3: 扩展 typed command，并在 background 注入 sync service**

```ts
type SupportedCommandType =
  | 'GET_CONFIG'
  | 'SAVE_CONFIG'
  | 'RESET_CONFIG'
  | 'IMPORT_CONFIG'
  | 'EXPORT_CONFIG'
  | 'GET_LOCAL_CACHE_STATS'
  | 'CLEAR_LOCAL_CACHE'
  | 'TEST_SYNC_CONNECTION'
  | 'SYNC_NOW'
  | 'FETCH_REMOTE_QUICK_INPUT_TEMPLATES'
  | 'IMPORT_REMOTE_QUICK_INPUT_TEMPLATES'
  | 'GET_LAST_RUNTIME_ERROR';

case 'TEST_SYNC_CONNECTION':
  return {
    type: 'TEST_SYNC_CONNECTION_SUCCESS',
    result: await syncService.testConnection(command.config),
  };
case 'SYNC_NOW':
  return {
    type: 'SYNC_NOW_SUCCESS',
    result: await syncService.syncNow(),
  };
```

```ts
const syncService = createSyncService({
  configRepository,
  pageRepository,
  conversationRepository,
  fetch: globalThis.fetch.bind(globalThis),
});
const runtimeErrorRepository = createRuntimeErrorRepository(storage);
```

- [ ] **Step 4: 实现 `CloudSyncPanel` 和顶部“保存并同步”动作**

```tsx
export const CloudSyncPanel = ({ config, disabled, onChange, onTestConnection, onSyncNow }: CloudSyncPanelProps) => (
  <section className="grid gap-6">
    <header className="flex items-center justify-between">
      <h2 className="text-3xl font-semibold text-primary">云同步</h2>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onTestConnection} disabled={disabled}>连接测试</Button>
        <Button type="button" onClick={onSyncNow} disabled={disabled}>保存并同步</Button>
      </div>
    </header>

    <Card>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="text-sm font-medium">同步 Provider</span>
          <Select value={config.sync.provider} onValueChange={(value) => onChange({
            ...config,
            sync: { ...config.sync, provider: value as ExtensionConfig['sync']['provider'] },
          })}>
            <SelectTrigger aria-label="同步 Provider"><SelectValue placeholder="选择 Provider" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="gist">Gist</SelectItem>
              <SelectItem value="webdav">WebDAV</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <p className="text-sm text-muted-foreground">{config.sync.lastSyncAt ? `最近同步：${new Date(config.sync.lastSyncAt).toLocaleString()}` : '尚未同步'}</p>
      </CardContent>
    </Card>
  </section>
);
```

- [ ] **Step 5: 增加 E2E，用测试 provider 跑通连接测试和同步时间写回**

```ts
test('sync panel can test connection and update last sync time', async ({ context, extensionId }) => {
  const serviceWorker = context.serviceWorkers()[0];
  await serviceWorker?.evaluate(() => {
    (globalThis as typeof globalThis & { __THINK_BOT_TEST_SYNC__?: { ok: boolean } }).__THINK_BOT_TEST_SYNC__ = { ok: true };
  });

  const page = await openSettingsPage({ context, extensionId });
  await page.getByRole('tab', { name: '云同步' }).click();
  await page.getByRole('combobox', { name: '同步 Provider' }).click();
  await page.getByRole('option', { name: 'Gist' }).click();
  await page.getByRole('button', { name: '连接测试' }).click();
  await expect(page.getByText('连接成功')).toBeVisible();

  await page.getByRole('button', { name: '保存并同步' }).click();
  await expect(page.getByText(/最近同步：/)).toBeVisible();
});
```

- [ ] **Step 6: 运行通过并提交**

Run: `pnpm test:unit -- tests/unit/services/runtime-messaging/config-commands.spec.ts tests/unit/features/settings-api.spec.ts`
Expected: PASS。

Run: `pnpm test:component -- tests/component/options/cloud-sync-panel.spec.tsx`
Expected: PASS。

Run: `pnpm test:e2e -- tests/e2e/settings-sync.spec.ts`
Expected: PASS。

```bash
git add src/services/sync/sync-service.ts src/services/sync/gist-sync-provider.ts src/services/sync/webdav-sync-provider.ts src/services/runtime-messaging/config-commands.ts entrypoints/background.ts src/features/settings/settings-api.ts src/features/settings/cloud-sync-panel.tsx src/features/settings/settings-actions.tsx tests/unit/services/runtime-messaging/config-commands.spec.ts tests/unit/features/settings-api.spec.ts tests/component/options/cloud-sync-panel.spec.tsx tests/e2e/settings-sync.spec.ts docs/Services/runtime-messaging.md docs/Services/sync.md
git commit -m "feat: add settings cloud sync workflow"
```

### Task 7: 拉齐 Blacklist Settings 与最近错误展示

**Files:**
- Create: `src/repositories/runtime-error-repository.ts`
- Create: `src/features/settings/blacklist-panel.tsx`
- Modify: `src/features/settings/settings-api.ts`
- Modify: `src/features/settings/settings-shell.tsx`
- Modify: `src/services/runtime-messaging/config-commands.ts`
- Modify: `entrypoints/background.ts`
- Create: `tests/unit/repositories/runtime-error-repository.spec.ts`
- Create: `tests/component/options/blacklist-panel.spec.tsx`
- Create: `tests/e2e/settings-blacklist.spec.ts`
- Modify: `docs/Services/blacklist.md`
- Modify: `docs/Workspace/settings.md`

- [ ] **Step 1: 先写失败测试，锁定黑名单编辑、测试和最近错误显示**

```tsx
it('黑名单页支持新增规则、测试匹配和恢复默认', async () => {
  render(<BlacklistPanel config={createDefaultConfig()} disabled={false} onChange={vi.fn()} onResetDefaults={vi.fn()} onTestRule={vi.fn()} />);

  expect(screen.getByRole('button', { name: '新增规则' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '恢复默认规则' })).toBeInTheDocument();
  expect(screen.getByLabelText('匹配测试 URL')).toBeInTheDocument();
});
```

```ts
it('后写入的最近错误会覆盖旧错误', async () => {
  const repo = createRuntimeErrorRepository(createChromeLocalAdapter(createFakeStorageArea()));

  await repo.writeError({ scope: 'sync', message: '第一次错误' });
  await repo.writeError({ scope: 'sidebar', message: '最后错误' });

  await expect(repo.readLatestError()).resolves.toMatchObject({
    scope: 'sidebar',
    message: '最后错误',
  });
});
```

- [ ] **Step 2: 运行失败测试**

Run: `pnpm test:unit -- tests/unit/repositories/runtime-error-repository.spec.ts`
Expected: FAIL，提示缺少 `runtime-error-repository`。

Run: `pnpm test:component -- tests/component/options/blacklist-panel.spec.tsx`
Expected: FAIL，提示缺少 `BlacklistPanel`。

- [ ] **Step 3: 实现错误仓储，并把 background 错误写入最近错误**

```ts
const RUNTIME_ERROR_STORAGE_KEY = 'runtime-error:latest';

export const createRuntimeErrorRepository = (storage: ChromeLocalAdapter) => ({
  async writeError(input: { scope: string; message: string }) {
    await storage.set({
      [RUNTIME_ERROR_STORAGE_KEY]: {
        ...input,
        occurredAt: Date.now(),
      },
    });
  },
  async readLatestError() {
    const result = await storage.get<Record<string, unknown>>([RUNTIME_ERROR_STORAGE_KEY]);
    return (result[RUNTIME_ERROR_STORAGE_KEY] as { scope: string; message: string; occurredAt: number } | undefined) ?? null;
  },
  async clearLatestError() {
    await storage.remove([RUNTIME_ERROR_STORAGE_KEY]);
  },
});
```

```ts
.catch((error: unknown) => {
  const reason = error instanceof Error ? error.message : String(error);
  void runtimeErrorRepository.writeError({ scope: 'config-command', message: reason });
  sendResponse({ error: reason });
});
```

- [ ] **Step 4: 实现黑名单面板，并在设置页加载最近错误**

```tsx
export const BlacklistPanel = ({ config, disabled, onChange, onResetDefaults, onTestRule }: BlacklistPanelProps) => (
  <section className="grid gap-6">
    <header className="flex items-center justify-between">
      <h2 className="text-3xl font-semibold text-primary">黑名单设置</h2>
      <div className="flex gap-2">
        <Button type="button" onClick={() => onChange(addBlacklistRule(config))} disabled={disabled}>新增规则</Button>
        <Button type="button" variant="outline" onClick={onResetDefaults} disabled={disabled}>恢复默认规则</Button>
      </div>
    </header>

    <Card>
      <CardContent className="grid gap-4">
        <Input aria-label="匹配测试 URL" placeholder="https://example.com/search?q=ai" />
        {config.blacklist.filter((rule) => rule.deletedAt === null).map((rule) => (
          <div key={rule.id} className="grid gap-2 md:grid-cols-[160px_minmax(0,1fr)_auto]">
            <Select value={rule.type} onValueChange={(value) => onChange(updateBlacklistRule(config, rule.id, { type: value as typeof rule.type }))}>
              <SelectTrigger aria-label={`规则类型 ${rule.id}`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="domain">domain</SelectItem>
                <SelectItem value="url-prefix">url-prefix</SelectItem>
                <SelectItem value="regex">regex</SelectItem>
              </SelectContent>
            </Select>
            <Input aria-label={`规则表达式 ${rule.id}`} value={rule.pattern} onChange={(event) => onChange(updateBlacklistRule(config, rule.id, { pattern: event.target.value }))} />
            <Button type="button" variant="outline" onClick={() => onTestRule(rule.id)}>测试</Button>
          </div>
        ))}
      </CardContent>
    </Card>
  </section>
);
```

- [ ] **Step 5: 增加跨入口 E2E，验证设置页保存后真实影响侧边栏**

```ts
test('blacklist saved from settings blocks sidebar bootstrap on matching page', async ({ context, extensionId }) => {
  const settings = await openSettingsPage({ context, extensionId });
  await settings.getByRole('tab', { name: '黑名单设置' }).click();
  await settings.getByRole('button', { name: '新增规则' }).click();
  await settings.getByLabel(/规则表达式/).fill('example.com/search');
  await settings.getByRole('button', { name: '保存' }).click();

  const page = await context.newPage();
  await page.goto('https://example.com/search?q=ai');

  const sidebar = await context.newPage();
  await sidebar.goto(`chrome-extension://${extensionId}/sidebar.html?tabId=1&pageUrl=${encodeURIComponent('https://example.com/search?q=ai')}`);
  await expect(sidebar.getByText('当前页面命中黑名单')).toBeVisible();
});
```

- [ ] **Step 6: 运行通过并提交**

Run: `pnpm test:unit -- tests/unit/repositories/runtime-error-repository.spec.ts`
Expected: PASS。

Run: `pnpm test:component -- tests/component/options/blacklist-panel.spec.tsx`
Expected: PASS。

Run: `pnpm test:e2e -- tests/e2e/settings-blacklist.spec.ts`
Expected: PASS。

```bash
git add src/repositories/runtime-error-repository.ts src/features/settings/blacklist-panel.tsx src/features/settings/settings-api.ts src/features/settings/settings-shell.tsx src/services/runtime-messaging/config-commands.ts entrypoints/background.ts tests/unit/repositories/runtime-error-repository.spec.ts tests/component/options/blacklist-panel.spec.tsx tests/e2e/settings-blacklist.spec.ts docs/Services/blacklist.md docs/Workspace/settings.md
git commit -m "feat: add blacklist settings and surfaced runtime errors"
```

### Task 8: 收口完整 E2E 回归、文档与验收

**Files:**
- Modify: `tests/e2e/settings-layout.spec.ts`
- Modify: `tests/e2e/settings-models.spec.ts`
- Modify: `tests/e2e/settings-quick-inputs.spec.ts`
- Modify: `tests/e2e/settings-sync.spec.ts`
- Modify: `tests/e2e/settings-blacklist.spec.ts`
- Modify: `docs/Workspace/settings.md`
- Modify: `docs/test/settings-core.md`
- Modify: `docs/DataSchema/config.md`
- Modify: `docs/Services/runtime-messaging.md`
- Modify: `docs/Services/sync.md`
- Modify: `docs/Services/blacklist.md`

- [ ] **Step 1: 把关键回归场景补成最终 E2E 矩阵**

```ts
test('sync panel updates lastSyncAt', async ({ context, extensionId }) => {
  const page = await openSettingsPage({ context, extensionId });
  await page.getByRole('tab', { name: '云同步' }).click();
  await page.getByRole('combobox', { name: '同步 Provider' }).click();
  await page.getByRole('option', { name: 'Gist' }).click();
  await page.getByRole('button', { name: '连接测试' }).click();
  await expect(page.getByText('连接成功')).toBeVisible();
  await page.getByRole('button', { name: '保存并同步' }).click();
  await expect(page.getByText(/最近同步：/)).toBeVisible();
});
```

- [ ] **Step 2: 先跑分层测试，再跑完整回归**

Run: `pnpm test:unit`
Expected: PASS。

Run: `pnpm test:component`
Expected: PASS。

Run: `pnpm build`
Expected: PASS。

Run: `pnpm test:e2e -- tests/e2e/settings-layout.spec.ts tests/e2e/settings-models.spec.ts tests/e2e/settings-quick-inputs.spec.ts tests/e2e/settings-sync.spec.ts tests/e2e/settings-blacklist.spec.ts`
Expected: PASS。

- [ ] **Step 3: 更新设置页工作区文档，写清实际结构和边界**

```md
- 页面采用左侧纵向导航 + 右侧详情区的后台式结构。
- 顶部常驻动作固定为“保存 / 导出配置 / 导入配置 / 重置为默认值 / 保存并同步”。
- 默认自动化覆盖假 provider 同步流；真实 Gist / WebDAV 只在 env-gated smoke 中验证。
- 最近一次 runtime 错误由 background 写入 `runtime-error:latest`，设置页只读展示。
```

- [ ] **Step 4: 更新测试文档，明确主回归入口**

```md
- 主回归命令：`pnpm test:unit && pnpm test:component && pnpm build && pnpm test:e2e -- tests/e2e/settings-*.spec.ts`
- 默认 E2E 必须覆盖布局、模型、快捷输入、同步、黑名单五条主链路。
- 真实 provider smoke 需要显式环境变量，不作为日常 CI 成功条件。
```

- [ ] **Step 5: 提交验收与文档更新**

```bash
git add tests/e2e/settings-layout.spec.ts tests/e2e/settings-models.spec.ts tests/e2e/settings-quick-inputs.spec.ts tests/e2e/settings-sync.spec.ts tests/e2e/settings-blacklist.spec.ts docs/Workspace/settings.md docs/test/settings-core.md docs/DataSchema/config.md docs/Services/runtime-messaging.md docs/Services/sync.md docs/Services/blacklist.md
git commit -m "docs: finalize settings page spec alignment and regression coverage"
```

## Self-Review

### 1. Spec coverage

- `9.2 页面结构`：Task 1-2 覆盖左侧导航、顶部动作区、错误显示区。
- `9.3 Basic Settings`：Task 3 覆盖默认模型、全局 branch model、主题、语言、system prompt、Filter COT、提取设置、缓存。
- `9.4 Quick Input Tabs`：Task 5 覆盖新增、排序、折叠、自动触发、软删除、专属 branch model；Task 6 覆盖远端模板导入命令。
- `9.5 Language Models`：Task 4 覆盖列表摘要、Provider 差异字段、新增、复制、删除、排序。
- `9.6 Cloud Sync`：Task 6 覆盖 provider 配置、连接测试、保存并同步、同步状态与最近同步时间。
- `9.7 Blacklist Settings`：Task 7 覆盖规则列表、新增、编辑、删除、默认规则恢复、匹配测试。
- `9.8 配置导入导出`：Task 2 / 6 / 8 覆盖顶部导入导出动作和真实 background command。
- `9.9 错误信息展示`：Task 7 覆盖最近错误存储和展示。
- `11.2 设置页交互规则`：Task 1-7 全部覆盖，尤其是未保存状态、导航切换不丢表单、默认模型候选过滤、导入成功后重建控件状态、同步后更新时间。

### 2. Placeholder scan

- 已排除 `TODO` / `TBD` / “稍后实现”。
- 高不确定的同步 provider 不是占位，而是明确拆成默认自动化和 env-gated smoke 两层。
- 所有任务都给出具体文件、命令和最小代码片段。

### 3. Type consistency

- 栏目标识统一使用 `basic | quick-inputs | models | sync | blacklist`。
- Quick Input 专属分支模型统一命名为 `branchModelIds`，不与旧 `modelId` 混用。
- 最近错误统一走 `runtime-error:latest` 与 `createRuntimeErrorRepository`。
- 默认模型和 branch model 候选都复用 `getEnabledCompleteModels(config)`，保证各入口口径一致。
