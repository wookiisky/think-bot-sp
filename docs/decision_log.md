# 决策记录

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
