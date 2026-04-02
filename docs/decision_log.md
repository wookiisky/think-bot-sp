# 决策记录

## 2026-04-01：debug 日志采用运行时结构化 console，不做持久化

- 背景：
  - side panel、content script、service worker、流式输出和同步链路跨上下文协作，排障需要统一日志口径。
  - 当前目标只是记录流程关键点用于 debug，不引入日志管理产品能力。
- 决策：
  - 新版本提供统一调试日志服务，基于运行时结构化 `console` 记录关键流程节点。
  - 调试日志不写入 `chrome.storage.local`，不参与同步，不提供设置页开关、日志查看页或导出能力。
- 原因：
  - 满足跨模块排障需求，同时避免把调试能力扩展成新的持久化和产品功能面。
  - 保持 MV3 架构简单，不把日志误用为恢复状态或历史数据来源。
- 影响范围：
  - `Services/logger.md`
  - `Services/runtime-messaging.md`
  - `Services/extraction.md`
  - `Services/llm-dispatch.md`
  - `Services/sync.md`
  - `flow.md`
- 放弃方案：
  - 持久化到本地存储。
  - 同步到远端。
  - 在设置页提供日志开关和导出入口。
- 后续同步：
  - `index.md`
  - `app.md`
  - `tech_stack.md`
  - `test/browser-automation.md`

## 2026-03-20：采用一次性重写而不是并行双轨

- 背景：
  - 现有实现脚本耦合高，消息、DOM、存储边界不清晰。
- 决策：
  - 新版本采用一次性重写，不保留旧实现与新实现并行运行。
- 原因：
  - 并行运行会放大 MV3 消息复杂度和测试成本。
  - 当前目标是重建架构，而不是做渐进兼容层。
- 影响范围：
  - 全部运行单元、消息契约、存储结构、测试基线。
- 放弃方案：
  - 新旧实现双轨共存。
  - 仅替换 UI 保留旧后台。
- 后续同步：
  - `app.md`
  - `flow.md`
  - `test/browser-automation.md`

## 2026-03-20：不兼容旧本地存储和旧同步格式

- 背景：
  - 旧实现存在多套兼容结构，重构时会严重拖累边界收敛。
- 决策：
  - 新版本不直接读取旧 `chrome.storage` 和旧远端同步结构。
- 原因：
  - 目标是保证功能等价，而不是保证数据结构兼容。
  - 可以明显降低仓储和同步实现复杂度。
- 影响范围：
  - `DataSchema/`
  - `dao/`
  - `Services/sync.md`
- 放弃方案：
  - 运行时兼容旧结构。
  - 首次启动隐式迁移旧数据。
- 后续同步：
  - `DataSchema/sync-snapshot.md`
  - `dao/sync-repository.md`

## 2026-03-20：本地持久化统一使用 chrome.storage.local

- 背景：
  - 产品以扩展上下文为主，配置、页面缓存、聊天和恢复状态都需要被多入口共享。
- 决策：
  - 本地数据统一使用 `chrome.storage.local`，并启用 `unlimitedStorage`。
- 原因：
  - 与 MV3 和 WXT 语义天然一致。
  - 降低跨上下文共享和调试复杂度。
- 影响范围：
  - 数据域设计。
  - 仓储读写和批量恢复策略。
- 放弃方案：
  - 引入 IndexedDB。
  - 配置和历史分层存储。
- 后续同步：
  - `DataSchema/`
  - `dao/`

## 2026-03-20：模型调用统一改为 Vercel AI SDK Core

- 背景：
  - 产品需要同时支持多 Provider、流式、分支、图片和取消。
- 决策：
  - 所有模型调用都通过 Vercel AI SDK Core 服务层统一封装。
- 原因：
  - 统一 `streamText`、`generateText`、Provider 适配和错误模型。
  - 避免 UI 直接理解 Provider 差异。
- 影响范围：
  - `Services/llm-dispatch.md`
  - `test/llm-and-streaming.md`
- 放弃方案：
  - 每个 Provider 自写 HTTP 适配器。
  - UI 直接调用 Provider SDK。
- 后续同步：
  - `tech_stack.md`
  - `flow.md`

## 2026-03-20：国际化采用平铺 key:文本 资源

- 背景：
  - 仅需支持中文和英文，需求稳定且简单。
- 决策：
  - 使用 `locales/zh-CN.yml` 与 `locales/en.yml` 这类平铺字典。
- 原因：
  - 降低维护和学习成本。
  - 更适合扩展场景的轻量构建。
- 影响范围：
  - `Services/i18n.md`
  - `DataSchema/locale-resource.md`
  - `Workspace/settings.md`
- 放弃方案：
  - 引入重量级国际化框架。
  - 使用嵌套 namespace 和 ICU 规则。
- 后续同步：
  - `test/settings-core.md`

## 2026-03-20：Material Symbols 必须本地打包

- 背景：
  - 扩展页面和离线环境不适合依赖在线字体。
- 决策：
  - 图标统一使用官方 Material Symbols Outlined，本地打包随扩展发布。
- 原因：
  - 保证离线可用和风格统一。
- 影响范围：
  - `Services/icon-assets.md`
  - `Workspace/sidebar.md`
  - `Workspace/settings.md`
- 放弃方案：
  - Google Fonts 在线加载。
  - 多套图标体系并存。
- 后续同步：
  - `tech_stack.md`

## 2026-03-20：自动化浏览器测试提升为 P0

- 背景：
  - side panel、content script、service worker、长连接通信都高度依赖真实浏览器环境。
- 决策：
  - Playwright 浏览器自动化作为 P0 保护线，Vitest 作为补充。
- 原因：
  - 单纯单元测试无法覆盖 MV3 时序风险。
- 影响范围：
  - `test/browser-automation.md`
  - `flow.md`
- 放弃方案：
  - 以单测为主、人工回归为辅。
- 后续同步：
  - 全部测试文档。

## 2026-04-01：对话管理页沿用侧边栏工作台语义

- 背景：
  - 对话管理页虽然处理历史页面，但从设计图和产品目标看，它不是只读归档页，而是恢复后继续工作的主入口。
- 决策：
  - 对话管理页在右侧工作区沿用侧边栏的核心工作台语义，固定保留提取内容区、快捷输入标签区、聊天区和底部输入区。
  - 对话管理页继续复用侧边栏的模型选择、图片输入、停止、清空、导出、分支消息和 Markdown 渲染规则。
- 原因：
  - 保证用户在当前网页和历史网页之间切换时心智一致。
  - 降低两套交互语义长期漂移带来的实现和测试成本。
  - 保持历史恢复后的继续工作能力，而不是退化为单纯浏览器历史页。
- 影响范围：
  - `Workspace/conversations.md`
  - `Workspace/sidebar.md`
  - `test/conversations-core.md`
- 放弃方案：
  - 对话管理页只展示聊天记录，不保留提取内容区。
  - 对话管理页单独设计一套轻量输入和消息交互。
- 后续同步：
  - `flow.md`
  - `app.md`

## 2026-04-01：side panel 采用 browserTab 级显隐，内部标签统一命名为 promptTab

- 背景：
  - 文档中同时使用“tab”表示 Chrome 浏览器标签页和侧边栏内快捷输入标签，已经产生初始化责任和生命周期歧义。
  - Chrome 官方 side panel 对 `browserTab` 的默认行为是切到未启用页时自动隐藏、切回已打开页时自动再次显示，这与当前产品语义不一致。
- 决策：
  - 文档中统一使用 `browserTab` 表示 Chrome 标签页，使用 `promptTab` 表示 `Chat` 与快捷输入标签。
  - side panel 只按 `browserTab` 维度启用，不使用全局 panel 语义。
  - 用户切换到其他 `browserTab` 时允许浏览器自动隐藏 side panel，但切回原 `browserTab` 时不自动恢复，必须再次点击扩展图标后重新打开。
  - side panel 初始化由 side panel 自己在挂载后主动拉取 `GET_SIDEBAR_BOOTSTRAP`，background 不主动推送首屏初始化命令。
  - side panel 再次打开时，有页面缓存不重复提取；已有历史或仍在执行中的 `promptTab` 不重复自动触发。
- 原因：
  - 避免 `browserTab` 与 `promptTab` 混淆导致的实现偏差。
  - 降低 `sidePanel.open()` 后首屏消息丢失的竞态风险。
  - 让 side panel 生命周期与产品预期一致，并保持自动触发幂等。
- 影响范围：
  - `browser-entry.md`
  - `flow.md`
  - `Platform/chrome-mv3-runtime.md`
  - `Workspace/sidebar.md`
  - `DataSchema/page.md`
  - `DataSchema/conversation.md`
  - `DataSchema/loading-state.md`
  - `test/browser-automation.md`
  - `test/sidebar-core.md`
- 放弃方案：
  - 使用“tab”同时指代两类对象。
  - 依赖 Chrome 默认行为让 side panel 在切回原 `browserTab` 时自动恢复。
  - 由 background 在 `sidePanel.open()` 后立即推送初始化消息。
- 后续同步：
  - `dao/page-repository.md`
  - `dao/conversation-repository.md`

## 2026-04-01：side panel 采用两阶段 bootstrap 初始化，黑名单先于提取与自动触发

- 背景：
  - 用户期望点击扩展按钮后打开 side panel，但切换 `browserTab` 时自动关闭，切回原页后仍保持关闭。
  - Chrome side panel 受用户手势和 `browserTab` 级显隐约束，首屏恢复、黑名单拦截、缓存展示与自动触发之间容易产生竞态。
- 决策：
  - side panel 首屏初始化统一采用“两阶段 bootstrap”协议。
  - 第一阶段由 side panel 挂载后主动请求 `GET_SIDEBAR_BOOTSTRAP`，只恢复缓存、会话、loading、黑名单判定和初始化摘要。
  - 第二阶段在 side panel 完成首屏恢复后受控执行：黑名单命中时先展示确认层，只有用户通过 `CONFIRM_BLACKLIST_CONTINUE` 放行后，才允许提取和自动触发。
  - 自动触发若需要强制带入页面内容，只作为请求级 override，不改写页面级 `includePageContent`。
- 原因：
  - 避免 background 主动推送首屏消息带来的竞态和丢包风险。
  - 保证黑名单不会被提取和自动触发抢跑。
  - 让缓存恢复、提取和自动触发的顺序与产品语义一致。
- 影响范围：
  - `browser-entry.md`
  - `flow.md`
  - `Workspace/sidebar.md`
  - `Services/runtime-messaging.md`
  - `Services/blacklist.md`
  - `DataSchema/page.md`
  - `test/sidebar-core.md`
- 放弃方案：
  - 在打开 side panel 后立即开始提取，再由 UI 补弹黑名单确认层。
  - 自动触发直接复用页面级 `includePageContent` 持久状态改写。

## 2026-04-02：阶段2只做本地同步字段持久化，不做远端同步执行

- 背景：
  - 阶段2已经补齐设置页、配置仓储、页面仓储和相关回归测试。
  - 现在需要先稳定本地闭环，再把远端同步执行拆到后续阶段单独实现。
- 决策：
  - 阶段2只负责把设置页里的同步相关字段写入本地配置，不交付“保存并同步”入口和连接测试执行链路。
  - 不在当前阶段执行真正的远端同步，不把 Gist/WebDAV 的落盘过程视为已完成能力。
- 原因：
  - 先保证本地配置保存、刷新、导入导出和缓存统计这一条最小闭环稳定。
  - 远端同步执行依赖额外的失败重试、凭证处理和冲突控制，应该单独评估和测试。
- 影响范围：
  - `Workspace/settings.md`
  - `dao/config-repository.md`
  - `dao/page-repository.md`
  - `test/settings-core.md`
- 放弃方案：
  - 在阶段2同时完成远端同步执行。
  - 把同步执行和本地保存混成同一个不可拆分流程。
