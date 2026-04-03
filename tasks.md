# Think Bot SP 重开发计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 按任务逐项执行。本文使用 `- [ ]` 复选框跟踪进度。

**Goal:** 基于 `/docs` 完成 Think Bot 的 Chrome MV3 重开发，并按阶段交付可运行、可验证、可继续扩展的版本。

**Architecture:** 采用 `domain -> repositories -> services -> features -> ui` 分层，`background service worker` 作为唯一高权限协调层；`content script` 仅负责页面采集；`side panel / options / conversations` 只通过 typed command 和 port 与后台交互。每个阶段都先补失败测试，再做最小实现，最后跑阶段回归。

**Tech Stack:** Chrome MV3、WXT、React 18、TypeScript Strict Mode、Vite、pnpm、Tailwind CSS、shadcn/ui、zustand、react-hook-form、zod、Vitest、React Testing Library、Playwright、Vercel AI SDK。

---

## 文档基线（已完成）

- [x] 统一 side panel 首屏初始化协议为“两阶段 bootstrap”，首屏由 side panel 挂载后主动请求 `GET_SIDEBAR_BOOTSTRAP`。
- [x] 统一 `browserTab` 行为：点击扩展按钮打开 side panel；切换 `browserTab` 自动隐藏；切回原 `browserTab` 不自动展示，但会为当前活动页重新预配置，保证下一次点击可直接打开。
- [x] 统一黑名单时序：命中后先确认，放行前禁止提取和自动触发。
- [x] 统一侧边栏布局顺序：顶部控制区 -> 提取内容区 -> 快捷输入标签区 -> 聊天区。
- [x] 统一自动触发上下文规则：“强制带入页面内容”只作为请求级 override，不改写页面级 `includePageContent`。
- [x] 补齐设置页方案承接：本地缓存占用查看与清理、快捷输入折叠展开、名称与消息预览。
- [x] 补齐测试口径：空会话导出必须明确失败，不能产出空文件；同步快照不混入 loading、黑名单放行等短时运行态。

---

## 0. 实施原则

- 先做能跑通主链路的最小闭环，再做增强能力，不做平行大爆炸开发。
- 每个阶段必须同时交付：
  - 可运行的扩展增量。
  - 对应的自动化测试。
  - 关键日志点。
- 测试顺序固定为：
  - 先写 Vitest / RTL / Playwright 失败测试。
  - 实现最小代码让测试转绿。
  - 做一次小范围重构并保持回归通过。
- 任何影响消息契约、存储结构、删除语义、同步快照、测试基线的改动，都要同步更新对应文档。
- side panel 首屏初始化必须遵守“两阶段 bootstrap”：
  - 第 1 阶段只恢复缓存、会话、loading、黑名单判定和初始化摘要。
  - 第 2 阶段仅在当前打开行为已放行后，才进入提取和自动触发。

## 1. 建议目录骨架

- `entrypoints/background.ts`
- `entrypoints/content.ts`
- `entrypoints/sidepanel/App.tsx`
- `entrypoints/options/App.tsx`
- `entrypoints/conversations/App.tsx`
- `src/domain/config/*`
- `src/domain/page/*`
- `src/domain/conversation/*`
- `src/domain/loading/*`
- `src/repositories/config-repository.ts`
- `src/repositories/page-repository.ts`
- `src/repositories/conversation-repository.ts`
- `src/repositories/sync-repository.ts`
- `src/repositories/locale-repository.ts`
- `src/services/runtime-messaging/*`
- `src/services/extraction/*`
- `src/services/llm-dispatch/*`
- `src/services/sync/*`
- `src/services/blacklist/*`
- `src/services/logger/*`
- `src/services/i18n/*`
- `src/features/sidebar/*`
- `src/features/settings/*`
- `src/features/conversations/*`
- `src/shared/*`
- `tests/unit/*`
- `tests/component/*`
- `tests/e2e/*`

## 2. 统一脚本约定

- `pnpm dev`
  - 本地加载扩展开发环境。
- `pnpm build`
  - 生成可加载的 MV3 构建产物。
- `pnpm test:unit`
  - 运行 Vitest 单元测试。
- `pnpm test:component`
  - 运行 React Testing Library 组件测试。
- `pnpm test:e2e`
  - 运行 Playwright 扩展端到端测试。
- `pnpm lint`
  - 静态检查。

## 3. 阶段总览

1. 阶段 1：工程骨架与自动化基线
2. 阶段 2：领域模型、仓储和设置页基础
3. 阶段 2.5：shadcn/ui 与 Tailwind 设计系统基线
4. 阶段 3：浏览器入口、消息总线、侧边栏壳层与提取
5. 阶段 4：聊天主链路、流式恢复与日志
6. 阶段 5：快捷输入自动触发、分支、编辑/重试/导出
7. 阶段 6：对话管理页与历史恢复
8. 阶段 7：同步、删除语义与发布前回归

---

## 阶段 1：工程骨架与自动化基线

**阶段目标**

- 建立可加载的 WXT + React + TypeScript Strict 工程。
- 让扩展能打开 side panel、settings、conversations 三个空壳页面。
- 建立 Playwright MV3 基线，确保后续每个阶段都能在真实浏览器里验证。

**阶段完成后可运行结果**

- 扩展能被 Chrome 加载。
- Playwright 能拿到 `service worker` 和 `extension id`。
- 三个页面都能打开并显示基础壳层。

**状态（2026-04-02 复核）**

- [x] 阶段 1 验收命令已复跑通过：`pnpm build`、`pnpm test:e2e -- tests/e2e/bootstrap.spec.ts`、`pnpm test:e2e -- tests/e2e/entry-shell.spec.ts`。
- [x] 当前工程满足阶段 1 的主体验收口径，可按“已完成”继续推进后续阶段。
- [x] React 主版本偏差已消除：`package.json` 已回退并锁定到 `react / react-dom 18.3.1`，与本阶段技术栈口径一致。

**相关文档**

- `docs/app.md`
- `docs/tech_stack.md`
- `docs/browser-entry.md`
- `docs/Platform/chrome-mv3-runtime.md`
- `docs/test/browser-automation.md`

**子任务**

- [x] 初始化 `WXT + React 18 + TypeScript strict + pnpm` 工程，并声明 `storage / sidePanel / activeTab / scripting / downloads / contextMenus / unlimitedStorage` 权限。
- [x] 建立基础目录骨架：`domain / repositories / services / features / ui / shared / tests`。
- [x] 先写失败测试：
  - `tests/e2e/bootstrap.spec.ts` 覆盖扩展加载、`service worker` 存在、`options` 与 `conversations` 页面可打开。
  - `tests/e2e/entry-shell.spec.ts` 覆盖 side panel 路由存在但暂未接业务能力。
- [x] 实现最小代码：
  - `background` 仅完成安装、上下文菜单和页面路由注册。
  - 三个页面只渲染壳层和环境信息。
- [x] 接入 `Vitest / RTL / Playwright`、trace/video/screenshot 保留策略、基础 mock 工具。
- [x] 为 `logger` 预留基础接口和测试桩，后续阶段直接复用。

**阶段验收**

- `pnpm build`
- `pnpm test:e2e -- tests/e2e/bootstrap.spec.ts`
- `pnpm test:e2e -- tests/e2e/entry-shell.spec.ts`

---

## 阶段 2：领域模型、仓储和设置页基础

**阶段目标**

- 先把 `ExtensionConfig / PageRecord / ConversationRecord / LoadingStateRecord` 的 schema 和仓储边界定死。
- 建立设置页最小闭环：读取、保存、恢复默认、语言主题即时预览、模型完整性判定。
- 让“后台统一读写配置、页面、会话”成为硬约束。

**阶段完成后可运行结果**

- 设置页可编辑并保存完整配置。
- background 能通过仓储读取默认配置、页面和会话数据。
- 多页面读取到的配置一致。
- 设置页可展示本地缓存占用，并具备安全清理入口。

**状态（2026-04-02 复核）**

- [x] 阶段 2 验收命令已复跑通过：`pnpm test:unit -- tests/unit/domain tests/unit/repositories tests/unit/services/runtime-messaging/config-commands.spec.ts`、`pnpm test:component -- tests/component/options`、`pnpm test:e2e -- tests/e2e/settings-flow.spec.ts`、`pnpm build`。
- [x] 设置页已补齐阶段 2 最小闭环：读取、保存、恢复默认、语言/主题即时预览、模型完整性判定、本地缓存展示与安全清理。
- [x] 阶段 2 当前可按“已完成”推进后续阶段。

**相关文档**

- `docs/DataSchema/config.md`
- `docs/DataSchema/page.md`
- `docs/DataSchema/conversation.md`
- `docs/DataSchema/loading-state.md`
- `docs/DataSchema/locale-resource.md`
- `docs/dao/config-repository.md`
- `docs/dao/page-repository.md`
- `docs/dao/conversation-repository.md`
- `docs/dao/locale-repository.md`
- `docs/Workspace/settings.md`
- `docs/Services/i18n.md`
- `docs/Services/icon-assets.md`
- `docs/test/settings-core.md`

**子任务**

- [x] 先写失败单测：
  - `tests/unit/domain/config-schema.spec.ts` 覆盖 `version / updatedAt`、Provider 字段约束、默认模型完整性判定、软删除模型过滤、模型 / 快捷输入 / 黑名单稳定 ID 唯一性。
  - `tests/unit/domain/page-schema.spec.ts` 覆盖 URL 归一化、`promptTabStates` 重置语义、页面级 `includePageContent`、`expiresAt` 生成规则。
  - `tests/unit/domain/conversation-schema.spec.ts` 覆盖 `Chat` 与快捷输入隔离、分支挂载规则。
  - `tests/unit/domain/loading-state.spec.ts` 覆盖单 `promptTab` 单主 session 约束。
- [x] 实现 Zod schema、类型定义、默认值工厂和 shared 常量。
- [x] 先写失败仓储测试：
  - `tests/unit/repositories/config-repository.spec.ts` 覆盖跨页面读写一致、快速重复保存不丢字段、非法导入不覆盖现有配置。
  - `tests/unit/repositories/page-repository.spec.ts` 覆盖页面级状态恢复、过期页面清理、删除页面级联清理。
  - `tests/unit/repositories/conversation-repository.spec.ts`
  - `tests/unit/repositories/locale-repository.spec.ts`
- [x] 实现 typed repositories，统一封装 `chrome.storage.local`，禁止 UI 直接读写原始 key。
- [x] 先写失败组件测试：
  - `tests/component/options/settings-shell.spec.tsx` 覆盖配置加载、保存、默认值恢复、语言切换即时预览。
  - `tests/component/options/model-form.spec.tsx` 覆盖 Provider 切换字段显隐、API Key 掩码、不可保存的不完整模型。
  - `tests/component/options/quick-inputs.spec.tsx` 覆盖快捷输入折叠展开、名称与消息预览。
- [x] 实现设置页基础：
  - 基础设置、语言模型、标签页、黑名单四个核心区域的骨架。
  - 读取 / 保存完整配置。
  - 语言资源加载与 key 对齐校验。
  - 本地图标资源接入。
  - 本地缓存占用展示与安全清理入口。
- [x] 固定配置与快照版本常量、导入校验和拒绝策略：
  - `ExtensionConfig.version` 与 `SyncSnapshot.schemaVersion` 统一由 shared 常量提供。
  - 非法结构或不支持版本的导入直接拒绝，不污染现有本地数据。
- [x] 在 background 暴露 `GET_CONFIG / SAVE_CONFIG / RESET_CONFIG / IMPORT_CONFIG / EXPORT_CONFIG` 最小命令处理器。

**阶段验收**

- `pnpm test:unit -- tests/unit/domain`
- `pnpm test:unit -- tests/unit/repositories`
- `pnpm test:component -- tests/component/options`
- `pnpm build`

---

## 阶段 2.5：shadcn/ui 与 Tailwind 设计系统基线

**阶段目标**

- 在现有 WXT 工程内补齐 `Tailwind CSS + shadcn/ui` 基础设施，收口后续 settings、side panel、conversations 的基础 UI 组件来源。
- 使用 `preset b3F5SdK3Xe` 初始化 shadcn，避免继续扩散自定义壳层样式与重复表单结构。
- 在不打断既有阶段 1/2 能力的前提下，为阶段 3 之后的工作提供统一的主题 token、组件目录和样式入口。

**阶段完成后可运行结果**

- 工程内存在可用的 `components.json`、Tailwind 样式入口和 shadcn 组件目录。
- `pnpm dlx shadcn@latest info --json` 返回非空 `config`，不再是未初始化状态。
- `options / sidepanel / conversations / welcome` 四个入口页至少有一层共享的 shadcn 基础布局可复用。

**状态（2026-04-03 完成）**

- [x] 当前仓库已完成 shadcn 初始化：`pnpm dlx shadcn@latest info --json` 返回非空 `config`，并已安装 `badge / button / card / input / select / separator`。
- [x] 当前仓库已接入 Tailwind CSS v4：统一通过 `@tailwindcss/vite` 和 `assets/styles/globals.css` 提供样式基线。
- [x] 该阶段已在阶段 3 前落地，后续页面可复用统一的 shadcn 基础组件与主题 token。
- [x] Playwright E2E 已改为先构建当前源码，再加载 `.output/chrome-mv3`，避免入口壳层回归读取旧产物。

**相关文档**

- `docs/tech_stack.md`
- `docs/Workspace/settings.md`
- `docs/Workspace/sidebar.md`
- `docs/Workspace/conversations.md`
- `docs/test/settings-core.md`
- `docs/test/sidebar-core.md`
- `docs/test/conversations-core.md`

**子任务**

- [x] 先写失败测试：
  - `tests/component/ui/page-shell.spec.tsx` 已补充共享基础布局、主题 class 和公共容器结构断言。
  - `tests/component/options/settings-shell.spec.tsx` 已补充顶部动作区和主题 root class 断言。
- [x] 使用项目包管理器初始化 shadcn：
  - 由于 WXT 未被 shadcn CLI 直接识别，已通过临时 Vite 工程应用 `preset b3F5SdK3Xe`，再将产物落回当前仓库。
  - 当前仓库已生成并校验 `components.json`、Tailwind v4 样式入口和组件目录。
- [x] 补齐 UI 基础设施：
  - 已接入 Tailwind 到 WXT 各入口页。
  - 已建立共享 `src/components/ui` 与 `src/lib/utils.ts`。
  - 已统一主题 token，以及 `Card / Button / Badge / Input / Select / Separator` 基础件来源。
- [x] 做最小迁移，不做平行重写：
  - 已将 `PageShell`、`SettingsShell`、`ModelForm`、`QuickInputsPanel` 迁到 shadcn 基础布局。
  - 已保持现有交互、测试口径和日志点不变。
- [x] 补文档：
  - 已同步 `docs/tech_stack.md`。
  - 已同步 `docs/Workspace/settings.md`、`docs/Workspace/sidebar.md`、`docs/Workspace/conversations.md`、`docs/test/settings-core.md`、`docs/test/sidebar-core.md`。
  - 已记录 `preset b3F5SdK3Xe` 的使用结果，后续新增组件统一通过 shadcn CLI 管理。

**阶段验收**

- `pnpm dlx shadcn@latest info --json`
- `pnpm test:component -- tests/component/ui/page-shell.spec.tsx`
- `pnpm test:component -- tests/component/options/settings-shell.spec.tsx`
- `pnpm test:e2e -- tests/e2e/entry-shell.spec.ts`
- `pnpm build`

---

## 阶段 3：浏览器入口、消息总线、侧边栏壳层与提取

**阶段目标**

- 打通“用户点击扩展图标 -> side panel 打开 -> side panel 自主拉取页面信息 -> 页面提取结果展示”的最小主链路。
- 建立 typed command / long-lived port 消息框架。
- 实现黑名单阻断、Readability 优先与 Jina 回退、content script 自动刷新重试。

**阶段完成后可运行结果**

- 在普通网页点击扩展图标可打开 side panel。
- side panel 能显示缓存或提取结果。
- 受限页退化到 conversations 页面。
- 切换 `browserTab` 后 side panel 自动隐藏，切回原 tab 不自动展示，但下一次点击应可直接打开。
- 黑名单命中时先停在确认层，放行后才继续提取与自动触发。

**状态（2026-04-03 复核）**

- [x] 当前仓库已打通阶段 3 最小闭环：普通网页入口、两阶段 bootstrap、黑名单确认、正文提取展示。
- [x] 当前仓库已落地阶段 3 关键实现：`browser-entry`、`sidebar` typed command、sender 校验、content script 采集、Readability/Jina 提取、页面/会话恢复查询。
- [x] 当前仓库已通过阶段 3 基础回归：`pnpm build`、阶段 3 相关 unit/component 测试、`tests/e2e/browser-entry.spec.ts`、`tests/e2e/sidebar-extraction.spec.ts`。
- [x] 切换 `browserTab` 后 side panel 自动隐藏、切回原 tab 不自动展示、当前活动页重新预配置并保证下一次点击可直接打开，已补齐真实浏览器回归。
- [ ] 当前自动化遗漏：右键菜单打开 conversations、首次安装打开文档，尚未形成 E2E 回归。
- [ ] 当前消息总线只完成阶段 3 one-shot command 和最小 `port-bus` 框架，`background` 侧 `onConnect` / 恢复握手尚未接入，不能按“已完成流式恢复框架”验收。

**修复过程复盘（2026-04-03）**

- 第一轮错误判断只盯住了 service worker 内存态，先补了 `chrome.storage.session` 运行态；这只解决了 worker 重启后的旧 tab 清理，不足以解释真实浏览器里的自动恢复。
- 第二轮排查构建产物后确认，WXT 保留入口名 `sidepanel.html` 会自动注入 `manifest.side_panel.default_path`，这是浏览器入口语义失真的结构性原因。
- 第三轮在路由改成 `sidebar.html` 后，又暴露出“需要点击两次才能打开”的时序问题，最终通过在 `tabs.onActivated` / `tabs.onUpdated` 里预配置当前活动页 side panel 收口。
- 阶段 3 相关文档、单测、E2E 已同步反映这次修复过程，后续若再改浏览器入口，必须同时校验这三类约束：不自动展示、单击可打开、构建产物不含全局 `default_path`。

**相关文档**

- `docs/browser-entry.md`
- `docs/Platform/chrome-mv3-runtime.md`
- `docs/Services/runtime-messaging.md`
- `docs/Services/extraction.md`
- `docs/Services/blacklist.md`
- `docs/Workspace/sidebar.md`
- `docs/flow.md`
- `docs/test/browser-automation.md`
- `docs/test/sidebar-core.md`

**子任务**

- [ ] 先写失败单测：
  - `tests/unit/services/runtime-messaging.spec.ts` 覆盖 command 路由、sender 校验、schema 错误、`GET_SIDEBAR_BOOTSTRAP / CONFIRM_BLACKLIST_CONTINUE` 契约、`CLEAR_PAGE_CONTEXT` 与 `CLEAR_TAB_CONVERSATION` 契约分离。
  - `tests/unit/services/extraction.spec.ts` 覆盖 Readability 成功、Jina 回退、空 HTML、content script 未连接自动刷新重试。
  - `tests/unit/services/blacklist.spec.ts` 覆盖命中拦截、确认放行、非法规则阻断。
- [ ] 实现 typed command / port 协议、命令名常量、sender 校验与基础恢复握手。
- [ ] 先写失败 E2E：
  - `tests/e2e/browser-entry.spec.ts` 覆盖普通页打开 side panel、受限页退化、`browserTab` 切换隐藏后不自动展示且下一次点击可直接打开。
  - `tests/e2e/sidebar-extraction.spec.ts` 覆盖 side panel 两阶段 bootstrap 初始化、缓存优先、黑名单先确认后提取、Readability/Jina 切换、`browserTab` 切换隐藏后的入口语义不回归。
- [ ] 实现 `browser entry`：
  - 扩展图标点击逻辑。
  - `browserTab` 切换后 side panel 启用态清理。
  - 首次安装文档打开。
  - 右键菜单打开 conversations。
- [ ] 实现 side panel 两阶段 bootstrap：
  - side panel 挂载后主动发送 `GET_SIDEBAR_BOOTSTRAP`。
  - background 只返回恢复与判定数据，不在 bootstrap 内隐式触发提取。
  - 黑名单放行后通过 `CONFIRM_BLACKLIST_CONTINUE` 进入提取与自动触发。
- [ ] 实现 content script 最小 DOM 采集与 background 提取服务。
- [ ] 实现 side panel 壳层：
  - 顶部控制区最小骨架。
  - 常驻提取内容区。
  - `Chat` 默认 `promptTab`。
  - 黑名单确认层和提取失败态。
- [ ] 在关键节点加入结构化日志：
  - `panel.open.requested`
  - `panel.init.started`
  - `page.info.loaded`
  - `extraction.started`
  - `extraction.readability_failed`
  - `extraction.jina_fallback_started`
  - `extraction.completed`
- [ ] 为 logger 建立契约测试：
  - `tests/unit/services/logger.spec.ts` 覆盖事件名稳定、级别一致、上下文字段透传、敏感字段过滤。

**阶段验收**

- `pnpm test:unit -- tests/unit/services/runtime-messaging.spec.ts`
- `pnpm test:unit -- tests/unit/services/extraction.spec.ts`
- `pnpm test:e2e -- tests/e2e/browser-entry.spec.ts`
- `pnpm test:e2e -- tests/e2e/sidebar-extraction.spec.ts`

---

## 阶段 4：聊天主链路、流式恢复与日志

**阶段目标**

- 打通“side panel 发送文本/图片 -> background 调度模型 -> port 流式输出 -> 写入会话与 loading -> side panel 重开恢复”的主链路。
- 建立统一 Provider registry、最小图片能力校验、会话与 loading 生命周期。
- 让 service worker 重启和 port 断开不破坏可见状态恢复。

**阶段完成后可运行结果**

- 用户可以在 side panel 发送文本消息。
- 支持图片输入的模型可以发送图片；不支持时能在发送前被阻断。
- side panel 关闭后重新打开，loading 状态与已生成内容可恢复。
- 有效会话可导出；空会话导出明确失败。

**相关文档**

- `docs/Services/llm-dispatch.md`
- `docs/Services/runtime-messaging.md`
- `docs/Services/logger.md`
- `docs/DataSchema/conversation.md`
- `docs/DataSchema/loading-state.md`
- `docs/dao/conversation-repository.md`
- `docs/Workspace/sidebar.md`
- `docs/flow.md`
- `docs/test/llm-and-streaming.md`
- `docs/test/sidebar-core.md`

**子任务**

- [ ] 先写失败单测：
  - `tests/unit/services/llm-dispatch/provider-registry.spec.ts` 覆盖 4 类 Provider 解析与能力判定。
  - `tests/unit/services/llm-dispatch/session-lifecycle.spec.ts` 覆盖 loading 创建、chunk 更新、完成清理、取消清理、错误回收。
  - `tests/unit/repositories/conversation-editing.spec.ts` 覆盖主消息增量写入与 loading 恢复查询。
- [ ] 实现 Provider registry、`ChatRequestContext` 组装、`StreamSession` 生命周期。
- [ ] 先写失败组件测试：
  - `tests/component/sidebar/chat-input.spec.tsx` 覆盖文本发送、图片添加/移除、禁用态与发送前校验。
  - `tests/component/sidebar/loading-restore.spec.tsx` 覆盖重开恢复后的 loading 展示。
- [ ] 先写失败组件测试：
  - `tests/component/sidebar/export-guard.spec.tsx` 覆盖空会话不导出空文件。
- [ ] 先写失败 E2E：
  - `tests/e2e/sidebar-chat.spec.ts` 覆盖发送、首包流式、完成写历史、关闭重开恢复。
  - `tests/e2e/service-worker-recovery.spec.ts` 覆盖 worker 重启后重新订阅恢复。
- [ ] 实现 `SEND_CHAT / STOP_SESSION` 命令处理与 port 推送：
  - `STREAM_CHUNK`
  - `STREAM_DONE`
  - `STREAM_ERROR`
  - `STREAM_CANCELLED`
  - `LOADING_STATE_UPDATE`
  - `RESTORE_LOADING`
- [ ] 将侧边栏聊天区、输入区与 loading 恢复接入真实数据。
- [ ] 补关键日志：
  - `chat.send.accepted`
  - `chat.stream.started`
  - `chat.stream.first_chunk`
  - `chat.stream.completed`
  - `chat.stream.cancelled`
  - `chat.stream.failed`
  - `port.connected`
  - `port.disconnected`
  - `port.restore_requested`

**阶段验收**

- `pnpm test:unit -- tests/unit/services/llm-dispatch`
- `pnpm test:component -- tests/component/sidebar/chat-input.spec.tsx`
- `pnpm test:e2e -- tests/e2e/sidebar-chat.spec.ts`
- `pnpm test:e2e -- tests/e2e/service-worker-recovery.spec.ts`

---

## 阶段 5：快捷输入自动触发、分支、编辑/重试/导出

**阶段目标**

- 实现 `promptTab` 隔离、自动触发幂等、分支并发、消息编辑、重试、继续新增分支、局部停止/删除和导出。
- 保证页面级动作与 `promptTab` 级动作严格分离。
- 把侧边栏核心工作台做成真正可用版本。

**阶段完成后可运行结果**

- 快捷输入 `promptTab` 可自动触发且不会重复执行。
- 分支回答可并行显示，且支持局部停止、局部删除、继续新增。
- 编辑用户消息后旧结果被裁剪，重试与导出可用。
- 自动触发如需强制带入页面内容，只影响该次请求，不污染页面级 `includePageContent`。

**相关文档**

- `docs/Workspace/sidebar.md`
- `docs/Services/llm-dispatch.md`
- `docs/DataSchema/page.md`
- `docs/DataSchema/conversation.md`
- `docs/DataSchema/loading-state.md`
- `docs/dao/page-repository.md`
- `docs/dao/conversation-repository.md`
- `docs/flow.md`
- `docs/test/sidebar-core.md`
- `docs/test/llm-and-streaming.md`

**子任务**

- [ ] 先写失败单测：
  - `tests/unit/features/prompt-tab-auto-trigger.spec.ts` 覆盖 `initializedAt / lastAutoTriggerAt / autoTriggerStatus / lastClearedAt` 语义，以及请求级 `forceIncludePageContent` override 不改写页面级状态。
  - `tests/unit/repositories/branch-operations.spec.ts` 覆盖新增分支、删除目标分支、局部停止、错误分支持久化。
  - `tests/unit/repositories/message-editing.spec.ts` 覆盖编辑用户消息后的后续裁剪、重试生成新增结果。
- [ ] 先写失败组件测试：
  - `tests/component/sidebar/prompt-tabs.spec.tsx` 覆盖多行换行、状态标记、切换不隐藏提取区。
  - `tests/component/sidebar/branch-actions.spec.tsx` 覆盖继续新增分支、局部停止、局部删除、分支预览。
  - `tests/component/sidebar/export.spec.tsx` 覆盖导出按钮、导出载荷结构、空会话导出失败。
- [ ] 先写失败 E2E：
  - `tests/e2e/sidebar-prompt-tabs.spec.ts` 覆盖自动触发幂等、清空当前 `promptTab` 后可再次自动触发。
  - `tests/e2e/sidebar-branching.spec.ts` 覆盖分支并发、编辑消息、重试、继续新增分支、局部删除。
  - `tests/e2e/sidebar-clear-and-export.spec.ts` 覆盖页面级清空、`promptTab` 级清空、导出。
- [ ] 实现页面级状态与 `promptTab` 状态管理：
  - 自动触发去重。
  - 页面级 `includePageContent` 恢复。
  - 页面级清空与 `promptTab` 级清空的不同命令和不同确认文案。
- [ ] 实现 `STOP_BRANCH / DELETE_BRANCH / EDIT_USER_MESSAGE / RETRY_MESSAGE / EXPAND_MESSAGE_BRANCHES / CLEAR_PAGE_CONTEXT / CLEAR_TAB_CONVERSATION / EXPORT_CONVERSATION`。
- [ ] 在侧边栏接入分支 UI、分支预览层、导出和清空动作。

**阶段验收**

- `pnpm test:unit -- tests/unit/features/prompt-tab-auto-trigger.spec.ts`
- `pnpm test:component -- tests/component/sidebar/prompt-tabs.spec.tsx`
- `pnpm test:e2e -- tests/e2e/sidebar-prompt-tabs.spec.ts`
- `pnpm test:e2e -- tests/e2e/sidebar-branching.spec.ts`
- `pnpm test:e2e -- tests/e2e/sidebar-clear-and-export.spec.ts`

---

## 阶段 6：对话管理页与历史恢复

**阶段目标**

- 实现“按页面维度浏览历史 -> 恢复提取内容与聊天 -> 在历史上下文上继续工作”的 conversations 页面。
- 保持与侧边栏一致的工作台语义，而不是做成只读归档页。
- 实现页面列表、搜索、标题编辑、删除、继续对话和 loading 恢复。

**阶段完成后可运行结果**

- conversations 页面可加载历史页面列表。
- 选中页面后可恢复提取内容、`promptTab`、聊天和 loading。
- 可以在历史页面上继续发送消息、编辑消息、管理分支。
- 空会话页面不导出空文件。

**相关文档**

- `docs/Workspace/conversations.md`
- `docs/Workspace/sidebar.md`
- `docs/dao/page-repository.md`
- `docs/dao/conversation-repository.md`
- `docs/dao/config-repository.md`
- `docs/Services/runtime-messaging.md`
- `docs/Services/llm-dispatch.md`
- `docs/flow.md`
- `docs/decision_log.md`
- `docs/test/conversations-core.md`

**子任务**

- [ ] 先写失败单测：
  - `tests/unit/features/conversations-page.spec.ts` 覆盖列表排序、搜索、页面恢复聚合、标题编辑回滚。
  - `tests/unit/repositories/page-delete.spec.ts` 覆盖删除前级联检查与同步开关分支。
- [ ] 先写失败组件测试：
  - `tests/component/conversations/page-list.spec.tsx` 覆盖搜索、选中、删除按钮不误触发选中。
  - `tests/component/conversations/workbench.spec.tsx` 覆盖提取区常驻、标签切换、标题 `Enter / Esc / blur` 行为、左右栏拖拽、先恢复历史再恢复 loading 的顺序。
- [ ] 先写失败 E2E：
  - `tests/e2e/conversations-history.spec.ts` 覆盖列表加载、搜索、恢复页面、打开原网页不改变当前选中。
  - `tests/e2e/conversations-continue-chat.spec.ts` 覆盖继续对话、分支操作、loading 恢复、空会话导出失败。
- [ ] 实现 conversations 页面：
  - 左侧页面列表。
  - 中间拖拽分隔条。
  - 右侧提取内容区、`promptTab` 区、聊天区、输入区。
- [ ] 复用侧边栏聊天能力，避免重新定义消息协议和交互。
- [ ] 实现 `LIST_PAGES / SEARCH_PAGES / GET_PAGE_DETAIL / UPDATE_PAGE_TITLE / DELETE_PAGE` 命令与页面聚合查询。

**阶段验收**

- `pnpm test:unit -- tests/unit/features/conversations-page.spec.ts`
- `pnpm test:component -- tests/component/conversations`
- `pnpm test:e2e -- tests/e2e/conversations-history.spec.ts`
- `pnpm test:e2e -- tests/e2e/conversations-continue-chat.spec.ts`

---

## 阶段 7：同步、删除语义与发布前回归

**阶段目标**

- 实现 Gist / WebDAV 同步、对象级合并、页面级墓碑、软删除 / 硬删除分流。
- 完成设置页剩余高级能力：连接测试、保存并同步、远端快捷输入模板导入、配置导入导出。
- 用 Playwright 跑完整 P0 回归，达到可发布质量。

**阶段完成后可运行结果**

- 设置页可测试连接并执行同步。
- 同步开启时删除页面写墓碑且本地读取被过滤。
- 同步关闭时删除页面做物理清理。
- 本地和远端并发修改能按对象粒度正确合并。
- 同步快照不混入 loading、黑名单放行、bootstrap 结果等短时运行态。

**相关文档**

- `docs/Services/sync.md`
- `docs/Services/logger.md`
- `docs/DataSchema/sync-snapshot.md`
- `docs/dao/sync-repository.md`
- `docs/dao/config-repository.md`
- `docs/Workspace/settings.md`
- `docs/test/sync-and-delete.md`
- `docs/test/settings-core.md`
- `docs/test/browser-automation.md`
- `docs/flow.md`

**子任务**

- [ ] 先写失败单测：
  - `tests/unit/services/sync/snapshot.spec.ts` 覆盖 `schemaVersion / snapshotVersion / exportedAt`、快照导出结构、`LoadingStateRecord` 与其他短时运行态不进入快照。
  - `tests/unit/services/sync/merge.spec.ts` 覆盖配置 / 页面 / 会话按对象粒度合并、墓碑优先级、删除后复活条件、远端 `schemaVersion` 非法直接拒绝。
  - `tests/unit/repositories/sync-repository.spec.ts` 覆盖软删除过滤、最近同步时间、同步失败不污染本地数据。
- [ ] 先写失败组件测试：
  - `tests/component/options/sync-settings.spec.tsx` 覆盖测试连接、保存并同步、最近同步时间展示、远端模板导入。
  - `tests/component/options/import-export.spec.tsx` 覆盖配置导入导出与非法结构保护。
- [ ] 先写失败 E2E：
  - `tests/e2e/sync-gist.spec.ts`
  - `tests/e2e/sync-webdav.spec.ts`
  - `tests/e2e/delete-semantics.spec.ts`
  - `tests/e2e/full-regression.spec.ts`
- [ ] 实现 `testConnection / syncNow / exportSnapshot / recordPageDelete / fetchRemoteQuickInputTemplates / importRemoteQuickInputTemplates` 及 Gist / WebDAV provider。
- [ ] 完成设置页高级能力：
  - 远端快捷输入模板导入。
  - 保存并同步。
  - 配置导入导出。
- [ ] 为同步与删除链路补日志：
  - `sync.started`
  - `sync.connection_failed`
  - `sync.completed`
  - `sync.failed`
- [ ] 将日志契约回归纳入发布前检查：
  - 关键链路至少具备开始 / 结束或失败事件。
  - 事件级别与上下文字段在 background、side panel、conversations 间保持一致。
  - 日志不包含 API Key、同步密钥、正文原文或图片原始内容。
- [ ] 跑完整回归并修复所有阶段间漂移问题。

**阶段验收**

- `pnpm test:unit -- tests/unit/services/sync`
- `pnpm test:component -- tests/component/options/sync-settings.spec.tsx`
- `pnpm test:e2e -- tests/e2e/sync-gist.spec.ts`
- `pnpm test:e2e -- tests/e2e/sync-webdav.spec.ts`
- `pnpm test:e2e -- tests/e2e/delete-semantics.spec.ts`
- `pnpm test:e2e -- tests/e2e/full-regression.spec.ts`
- `pnpm build`

---

## 4. 跨阶段约束清单

- `background` 是唯一允许直接访问模型、同步和仓储写入的上下文。
- `content script` 不持有 API Key，不直接访问 Jina、Provider、Gist、WebDAV。
- UI 不直接操作原始 `chrome.storage.local` key。
- UI 不直接拼接消息名。
- `promptTab` 必须独立持久化，不能与 `browserTab` 混用。
- side panel 首屏初始化统一使用 `GET_SIDEBAR_BOOTSTRAP`，background 不主动推送首屏初始化命令。
- 提取内容区在 side panel 和 conversations 中都必须常驻显示。
- 自动触发去重必须依赖持久化状态，不依赖内存。
- 黑名单放行前不能开始提取或自动触发。
- 空会话导出必须明确失败，不能产出空文件。
- 删除语义必须在同步开启与关闭两种模式下都可验证。

## 5. 最终验收口径

- 单元测试覆盖：
  - schema、仓储、消息协议、提取、模型调度、同步合并、日志契约。
- 组件测试覆盖：
  - 设置页、侧边栏、对话管理页三个工作台的关键交互。
- 端到端覆盖：
  - 扩展入口、提取、发送、分支、恢复、历史恢复、同步、删除。
- 日志覆盖：
  - side panel 初始化、提取、发送、流式、恢复、同步、黑名单关键链路都有稳定事件名、统一级别和可串联上下文字段。
- 文档同步：
  - 若实现与 `/docs` 有偏差，先修正文档再继续开发。
