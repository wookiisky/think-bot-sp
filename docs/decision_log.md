# 决策记录

## 2026-09-10：思考强度统一到配置层并在基础设置给默认值，移除 Temperature 与 Max Output Tokens

- 背景：
  - 原 `reasoningEffort` 仅对部分 provider 暴露，缺省按 `high` 处理，OpenAI 系列完全没有思考强度控制。
  - Claude 4.7 及之后与 OpenAI reasoning 模型会拒绝 `temperature`；用户手填的 `maxOutputTokens` 容易超出模型上限或留空后被 SDK 兜底到 4096。
- 决策：
  - `basic.reasoningEffort` 作为全局默认（`medium`），模型级 `reasoningEffort` 变为可选覆盖，所有 provider 都可配置。
  - 新增 `services/llm-dispatch/model-request-options.ts`，按 provider 与模型 id 把统一档位映射为各 SDK 实际接受的参数，不支持的模型不发送。
  - 删除模型配置中的 `temperature` 与 `maxOutputTokens`；输出 token 上限改由代码按 Claude 系列 / 版本给定，其他 provider 交给默认值。
  - 新增独立的 `openrouter` provider（复用 `@ai-sdk/openai-compatible`，不引入官方 `@openrouter/ai-sdk-provider`，其 ai v5 兼容线已停留在 1.5.x）：OpenRouter 的 reasoning 契约与 OpenAI 顶层 `reasoning_effort` 不同，按 provider id 分支比在 openai-compatible 里嗅探 URL 更明确。
- 原因：
  - 配置层只保留一个语义清晰的档位，模型差异收敛到一处映射表，便于新增模型时维护。
  - 避免向不支持的模型发送采样或 reasoning 参数导致 400。
- 影响范围：
  - `DataSchema/config.md`
  - `Services/llm-dispatch.md`
  - `Workspace/settings.md`
  - `test/settings-core.md`
- 放弃方案：
  - 保留 Temperature / Max Output Tokens 作为高级选项：会继续把模型兼容性问题暴露给用户。
  - 只在 provider 层判断是否支持 reasoning：无法区分同一 provider 下不同模型家族。

## 2026-05-10：输入区改为 Textarea 横向布局，拖拽直接调整 textarea 高度

- 背景：
  - 输入区原为单行 `<Input>` + 按钮同行布局，但保留了外层面板 `minHeight` 拖拽机制，导致拖拽后输入框下方出现大片空白，输入框本身不变高。
  - 用户期望拖拽手柄直接放大输入框本体，支持多行输入和阅读，而不是在下方预留无用空间。
- 决策：
  - 把单行 `<Input>` 替换为多行 `<Textarea>`，采用横向布局：`textarea` 占据左侧主区（`flex-1 min-w-[240px]`），图片按钮、模型选择、页面内容开关、清空、导出、发送按钮紧贴 `textarea` 右侧同行（`items-end` 底部对齐）。
  - 拖拽手柄直接调整 `textarea` 的 `style.height`（32px 起，最大 220px），不再调整外层面板 `minHeight`。
  - 默认单行贴底、下方零空白；向上拖可放大 `textarea` 显示多行内容；Shift+Enter 换行，内容超出时 `textarea` 内部滚动。
  - 移除外层面板的 `minHeight` 内联样式、`composerHeight` 状态、`ResizeObserver` 测量逻辑和相关工具函数。
- 原因：
  - 让拖拽语义与用户预期一致：拖拽 = 放大输入框，而不是在输入框下方留白。
  - 支持多行输入和阅读长文本，提升输入体验。
  - 消除下方空白，让输入区紧贴底部，消息区自动填满剩余空间。
- 影响范围：
  - `src/features/sidebar/chat-input.tsx` — 主要重构
  - `src/features/conversations/conversations-shell.tsx` — 自动生效（共用同一组件）
  - `docs/Workspace/sidebar.md`
  - `docs/Workspace/conversations.md`
  - `docs/test/sidebar-core.md`
  - `docs/test/conversations-core.md`
  - `prd_docs/product-functional-spec.md`
- 放弃方案：
  - 保持单行 `<Input>` 并只调整其 `height`（输入框变胖但不支持多行）。
  - 彻底移除拖拽手柄（失去高度调整能力）。
  - 把 `textarea` 和按钮分成两行（占用更多纵向空间）。
- 后续同步：
  - 测试已通过，文档已更新。

## 2026-04-04：阶段 2 同步先落”配置快照手动推送”最小闭环

- 背景：
  - 设置页已经具备本地配置闭环，但“云同步”一直停留在导航占位，文档和代码口径开始分叉。
  - MV3 service worker 生命周期短，测试环境下的同步 provider 注入如果在启动时固化，E2E 很容易误走真实网络。
- 决策：
  - 阶段 2 只交付配置级别的手动同步闭环：设置页可编辑 provider 配置、测试连接、手动同步并回写 `lastSyncAt`。
  - 当前同步快照只包含 `schemaVersion / exportedAt / config`，不拉取远端，不做页面、会话、墓碑和冲突合并。
  - background 中测试 provider 必须按命令调用时动态解析，不能在 service worker 启动时拍平为一次性快照。
- 原因：
  - 先把用户真正能操作的最小同步能力跑通，避免继续维持占位 UI。
  - 控制实现范围，避免在设置页阶段把同步扩展成历史数据合并工程。
  - 保证浏览器自动化测试稳定，不让 MV3 worker 生命周期反向污染测试结果。
- 影响范围：
  - `Workspace/settings.md`
  - `Services/sync.md`
  - `Services/runtime-messaging.md`
  - `test/settings-core.md`
  - `test/sync-and-delete.md`
- 放弃方案：
  - 在当前阶段直接实现全量快照拉取、对象级合并和删除传播。
  - 把测试 provider 绑定在 service worker 启动时的全局变量快照上。
- 后续同步：
  - `prd_docs/product-functional-spec.md`
  - `docs/index.md`
  - `app.md`

## 2026-09-10：调试日志改为单行文本、分级过滤与统一事件命名

- 背景：
  - 旧日志把载荷对象作为 `console` 第二个参数输出，DevTools 折叠时只显示 `{…}`，复制文本和 E2E 抓取都拿不到字段，对象被后续修改后展开看到的也不是记录时刻的值。
  - 事件名中英混用，`info` 承担了几乎全部输出，每次标签切换和每条命令都产生多条日志，关键失败反而缺少耗时、模型、输入规模等定位信息。
  - 同步、模型测试、content script 重连、port 恢复推送、UI 侧命令失败等环节没有日志。
- 决策：
  - 每条日志输出为一行文本 `[scope] event {json}`，载荷在记录时刻序列化，敏感字段脱敏、长字符串截断、深层对象折叠都在序列化点统一完成。
  - 引入级别阈值：开发和测试默认 `debug`，生产默认 `info`；可在对应 console 通过 `__thinkBotLog.setLevel` 切换，不做持久化，不提供设置项。
  - 事件名统一为 `<domain>.<subject>.<outcome>` 英文命名；background 按模块派生子 scope；UI 侧通过 `requestRuntimeMessage` 集中记录命令失败。
  - 高频状态同步降为 `debug`；命令层成功路径只记录 `debug` 耗时，业务事件由处理器记录；失败路径统一携带 `reason`、`durationMs` 与输入摘要。
- 原因：
  - 排障时需要能直接复制、检索的文本，而不是依赖 DevTools 交互。
  - 生产环境减少噪音，开发环境保留完整细节，二者用同一套事件名。
- 影响范围：
  - `Services/logger.md`
  - `flow.md`
  - `tech_stack.md`
  - `test/browser-automation.md`
- 放弃方案：
  - 同时输出文本和对象参数：噪音翻倍，且仍无法保证对象值稳定。
  - 按构建模式剥离所有 debug 调用：无法在生产环境临时开启排障。

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
