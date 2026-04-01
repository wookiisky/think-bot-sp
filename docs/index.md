# 文档索引

## 1. 入口说明

本目录是 Think Bot 重开发的主文档系统，面向 Chrome MV3 扩展一次性重写。文档只描述稳定职责、边界、流程、约束与验证标准，不转写实现代码。

## 2. 顶层文档

- `app.md`：项目总览、运行单元、模块关系、关键约束。
- `browser-entry.md`：浏览器入口、受限页退化、首次安装生命周期。
- `tech_stack.md`：技术选型、核心库、版本基线、兼容约束。
- `decision_log.md`：关键产品和技术决策记录。
- `flow.md`：跨模块主流程、异常流、恢复策略、验证点。

## 3. 数据与访问

- `DataSchema/config.md`：扩展配置数据域。
- `DataSchema/page.md`：页面缓存与页面级状态数据域。
- `DataSchema/conversation.md`：会话与消息数据域。
- `DataSchema/loading-state.md`：流式恢复与加载状态数据域。
- `DataSchema/sync-snapshot.md`：同步快照与墓碑数据域。
- `DataSchema/blacklist-rule.md`：黑名单规则数据域。
- `DataSchema/locale-resource.md`：中英文静态语言资源数据域。
- `dao/config-repository.md`：配置读写抽象。
- `dao/page-repository.md`：页面与元数据读写抽象。
- `dao/conversation-repository.md`：会话、消息、分支、加载状态读写抽象。
- `dao/sync-repository.md`：同步快照与删除语义抽象。
- `dao/locale-repository.md`：语言资源加载与解析抽象。

## 4. 运行单元与服务

- `Workspace/sidebar.md`：侧边栏能力边界、状态和测试要求。
- `Workspace/settings.md`：设置页能力边界、状态和测试要求。
- `Workspace/conversations.md`：对话管理页能力边界、状态和测试要求。
- `Services/extraction.md`：Readability/Jina 提取服务。
- `Services/logger.md`：运行时结构化调试日志服务。
- `Services/llm-dispatch.md`：Vercel AI SDK 模型调度与流式协议。
- `Services/runtime-messaging.md`：typed command/port 通信层。
- `Services/sync.md`：Gist/WebDAV 同步服务。
- `Services/blacklist.md`：黑名单判定与确认流。
- `Services/i18n.md`：轻量语言资源服务。
- `Services/icon-assets.md`：本地 Material Symbols 资源管理。
- `Platform/chrome-mv3-runtime.md`：MV3 运行时限制与约束。

## 5. 测试文档

- `test/sidebar-core.md`：侧边栏核心能力回归。
- `test/settings-core.md`：设置页核心能力回归。
- `test/conversations-core.md`：对话管理页核心能力回归。
- `test/llm-and-streaming.md`：模型调度、流式、分支、恢复回归。
- `test/sync-and-delete.md`：同步、软删除、硬删除回归。
- `test/browser-automation.md`：Playwright 扩展自动化基线。

## 6. 常见任务导航

- 想看整体重写边界：`app.md`、`decision_log.md`。
- 想确认扩展入口与安装行为：`browser-entry.md`、`flow.md`。
- 想确认 MV3 限制：`Platform/chrome-mv3-runtime.md`、`Services/runtime-messaging.md`。
- 想实现页面提取：`Services/extraction.md`、`flow.md`。
- 想实现模型调用与流式：`Services/llm-dispatch.md`、`test/llm-and-streaming.md`。
- 想排查关键流程和运行时异常：`Services/logger.md`、`flow.md`。
- 想实现侧边栏或历史页：`Workspace/sidebar.md`、`Workspace/conversations.md`。
- 想实现配置、语言、图标：`Workspace/settings.md`、`Services/i18n.md`、`Services/icon-assets.md`。
- 想实现本地存储与同步：`DataSchema/`、`dao/`、`Services/sync.md`。
- 想规划自动化测试：`test/browser-automation.md`、`test/sidebar-core.md`。

## 7. 使用要求

- 新增能力先确定归属模块，再修改对应数据域、流程文档和测试文档。
- 任何影响消息契约、存储 key、删除语义、同步格式、自动化基线的改动，必须同步更新相关文档。
- 文档中的“不能破坏什么”优先级高于实现细节偏好。
