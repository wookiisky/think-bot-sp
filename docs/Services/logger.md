# 调试日志服务

## 1. 模块定位

调试日志服务负责在 extension runtime 内记录关键流程节点，提供统一的结构化 debug 日志，帮助排查 side panel、service worker、content script、流式输出和同步链路中的问题。

该服务只服务于开发和调试，不属于产品功能。

## 2. 核心抽象

- `LogLevel`
- `LogEvent`
- `LogContext`
- `Logger`

## 3. 能力边界

负责：

- 在关键流程开始、结束、回退、取消、失败时记录结构化日志。
- 统一日志级别、事件名和上下文字段。
- 对敏感字段做最小化和脱敏约束。
- 为跨模块排障提供可串联的关联字段。

不负责：

- 持久化日志。
- 同步日志到远端。
- 提供日志查看页、导出能力或设置项。
- 代替业务错误处理、指标或告警系统。

## 4. 对外接口

- `logger.debug(event, context?)`
- `logger.info(event, context?)`
- `logger.warn(event, context?)`
- `logger.error(event, context?)`

日志输出约束：

- 基于运行时结构化 `console` 输出。
- `event` 使用稳定命名，不使用随意自然语言句子。
- `context` 只携带排障所需最小字段，不挂载大对象。

推荐事件命名：

- `panel.open.requested`
- `panel.init.started`
- `page.info.loaded`
- `extraction.started`
- `extraction.readability_failed`
- `extraction.jina_fallback_started`
- `extraction.completed`
- `chat.send.accepted`
- `chat.stream.started`
- `chat.stream.first_chunk`
- `chat.stream.completed`
- `chat.stream.cancelled`
- `chat.stream.failed`
- `port.connected`
- `port.disconnected`
- `port.restore_requested`
- `sync.started`
- `sync.connection_failed`
- `sync.completed`
- `sync.failed`
- `blacklist.detected`
- `blacklist.bypass_confirmed`

## 5. 关键流程

- side panel 打开和初始化时记录入口、当前 `browserTab` 和初始化结果。
- `GET_SIDEBAR_BOOTSTRAP`、提取、重提取和方法切换时记录开始、回退和完成。
- `SEND_CHAT`、流式开始、首包、完成、取消、错误时记录请求链路。
- port 建连、断开、恢复订阅时记录连接状态。
- 同步测试连接、正式同步、对象级合并完成或失败时记录关键节点。
- 黑名单命中和用户确认结果时记录阻断和放行链路。

## 6. 错误与异常处理

- 用户取消：
  - 记录为 `info` 或 `warn`，不记为系统 `error`。
- 预期内回退：
  - 例如 Readability 失败后进入 Jina，先记录 `warn`，再记录回退开始。
- 依赖失败：
  - 例如 Provider、同步后端或 content script 连接失败，记录 `error`。
- service worker 重启恢复：
  - 恢复握手和重连只记录流程状态，不假设内存中的旧 logger 状态仍存在。

## 7. 数据与状态

- 输出介质：
  - `console.debug`
  - `console.info`
  - `console.warn`
  - `console.error`
- 运行态：
  - 无持久化状态。
  - 不写入 `chrome.storage.local`。
  - 不进入 `SyncSnapshot`。

推荐 `context` 字段：

- `module`
- `command`
- `browserTabId`
- `pageId`
- `normalizedUrl`
- `promptTab`
- `sessionId`
- `branchId`
- `provider`
- `attempt`

## 8. 依赖与协作模块

- `Services/runtime-messaging.md`
- `Services/extraction.md`
- `Services/llm-dispatch.md`
- `Services/sync.md`
- `Platform/chrome-mv3-runtime.md`

## 9. 约束与禁止事项

- 不记录 API Key、同步密钥、认证头或完整凭证。
- 不记录完整页面正文、完整用户输入、图片原始内容。
- 不把日志当作恢复状态来源。
- 不在 UI 页面和 background 中各自定义一套事件名。
- 不为调试日志新增设置页开关、导出入口或历史查看功能。

## 10. 测试要求

- 职责测试：关键主流程至少产出开始和结束日志。
- 正常流测试：side panel 初始化、提取成功、流式完成、同步成功会记录稳定事件名。
- 错误流测试：content script 断连、Provider 失败、同步失败会输出 `warn` 或 `error`。
- 异常流测试：用户取消、port 断开、service worker 重启恢复有对应日志事件。
- 不变量测试：同一 `sessionId` 或 `branchId` 的关键日志可串联；敏感字段不进入日志。
- 可观测性测试：事件名、级别和上下文字段在不同模块间保持一致。

## 11. 相关文档

- `flow.md`
- `tech_stack.md`
- `test/browser-automation.md`
