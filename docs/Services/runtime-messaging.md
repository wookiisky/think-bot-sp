# 运行时消息服务

## 1. 模块定位

运行时消息服务负责统一管理 extension pages、content script 和 background 之间的 typed command 与长连接流式事件。

## 2. 核心抽象

- `CommandMap`
- `EventMap`
- `PortStreamEvent`
- `MessageSenderContext`

## 3. 能力边界

负责：

- one-shot command 编解码。
- long-lived port 生命周期管理。
- sender 校验。
- 为背景页重启后的恢复握手预留协议框架。

不负责：

- 业务数据持久化。
- UI 组件渲染。
- Provider 调用。

## 4. 对外接口

one-shot command：

- 阶段 4 当前已实现：
  - `GET_SIDEBAR_BOOTSTRAP`
  - `CONFIRM_BLACKLIST_CONTINUE`
  - `SWITCH_EXTRACTION_METHOD`
  - `RE_EXTRACT_CONTENT`
- `SEND_CHAT`
- `STOP_SESSION`
- `EXPORT_CONVERSATION`
- `GET_CONFIG`
- `SAVE_CONFIG`
- `RESET_CONFIG`
- `IMPORT_CONFIG`
- `EXPORT_CONFIG`
- `TEST_SYNC_CONNECTION`
- `SYNC_NOW`
- `FETCH_REMOTE_QUICK_INPUT_TEMPLATES`
- `IMPORT_REMOTE_QUICK_INPUT_TEMPLATES`
- `LIST_PAGES`
- `SEARCH_PAGES`
- `GET_PAGE_DETAIL`
- `UPDATE_PAGE_TITLE`
- `DELETE_PAGE`

long-lived port 事件：

- `CHAT_STREAM_STARTED`
- `CHAT_STREAM_CHUNK`
- `CHAT_STREAM_FINISHED`
- `CHAT_STREAM_FAILED`
- `CHAT_STREAM_CANCELLED`
- `LOADING_STATE_UPDATE`
- `RESTORE_LOADING`

阶段 4 当前落地边界：

- 已落地：side panel one-shot command schema、sender 校验、`background` 侧 `chrome.runtime.onConnect`、按 `normalizedUrl + promptTabId` 路由的 `port-bus`、`SEND_CHAT / STOP_SESSION` 命令、`RESTORE_LOADING` 恢复握手。
- 未落地：分支级命令、消息编辑、重试、对话管理页复用同一条流式订阅。

命令分组约束：

- 侧边栏页面使用：
  - `GET_SIDEBAR_BOOTSTRAP`
  - `CONFIRM_BLACKLIST_CONTINUE`
  - `SWITCH_EXTRACTION_METHOD`
  - `RE_EXTRACT_CONTENT`
  - `CLEAR_PAGE_CONTEXT`
  - `SEND_CHAT`
  - `STOP_SESSION`
  - `STOP_BRANCH`
  - `DELETE_BRANCH`
  - `EDIT_USER_MESSAGE`
  - `RETRY_MESSAGE`
  - `EXPAND_MESSAGE_BRANCHES`
  - `CLEAR_TAB_CONVERSATION`
  - `EXPORT_CONVERSATION`
- 设置页使用：
  - `GET_CONFIG`
  - `SAVE_CONFIG`
  - `RESET_CONFIG`
  - `IMPORT_CONFIG`
  - `EXPORT_CONFIG`
  - `TEST_SYNC_CONNECTION`
  - `SYNC_NOW`
  - `FETCH_REMOTE_QUICK_INPUT_TEMPLATES`
  - `IMPORT_REMOTE_QUICK_INPUT_TEMPLATES`
- 对话管理页使用：
  - `LIST_PAGES`
  - `SEARCH_PAGES`
  - `GET_PAGE_DETAIL`
  - `UPDATE_PAGE_TITLE`
  - `DELETE_PAGE`
  - `SEND_CHAT`
  - `STOP_SESSION`
  - `STOP_BRANCH`
  - `DELETE_BRANCH`
  - `EDIT_USER_MESSAGE`
  - `RETRY_MESSAGE`
  - `EXPAND_MESSAGE_BRANCHES`
  - `CLEAR_TAB_CONVERSATION`
  - `EXPORT_CONVERSATION`

## 5. 关键流程

- extension page 发 one-shot command 到 background。
- side panel 首屏初始化统一走 `GET_SIDEBAR_BOOTSTRAP`，只拉取恢复和判定数据，不在该命令内隐式触发提取。
- side panel sender 校验固定检查 `runtime.id` 和 URL `pathname` 为 `sidebar.html`，允许 query 参数存在。
- 流式任务创建后，UI 建立 port 订阅。
- background 按 `normalizedUrl + promptTabId` 路由事件，保持同一 `promptTab` 的实时流与恢复流统一入口。
- side panel 重开后，通过 `SUBSCRIBE_SIDEBAR_STREAM` 触发 `RESTORE_LOADING` 重新订阅。
- 所有会改变历史或页面状态的动作都必须经由 one-shot command 进入 background，不允许 UI 直接绕过消息层访问仓储。
- `EDIT_USER_MESSAGE`、`RETRY_MESSAGE`、`EXPAND_MESSAGE_BRANCHES`、`STOP_BRANCH`、`DELETE_BRANCH` 都复用同一条 typed command 管线和 schema 校验。
- `CLEAR_PAGE_CONTEXT` 与 `CLEAR_TAB_CONVERSATION` 必须保持语义分离：前者清理当前页面缓存、页面级状态、会话和 loading，后者只清理当前 `promptTab` 会话与 loading。
- `CONFIRM_BLACKLIST_CONTINUE` 只放行当前 `browserTab + normalizedUrl` 的当前打开行为，不能持久化为全局白名单或页面长期状态。

## 6. 错误与异常处理

- sender 非法：
  - 直接拒绝请求。
- 参数结构非法：
  - 返回 schema 错误。
- port 断开：
  - 不视为任务终止，loading state 继续保留，side panel 重连后通过持久化恢复。
- service worker 重启：
  - 新建端口后按持久化状态恢复。
- 黑名单确认超时或页面上下文失效：
  - 拒绝本次放行请求，要求 UI 重新获取页面上下文。

## 7. 数据与状态

- 短生命周期内存：
  - 当前已连接端口映射。
- 持久化依赖：
  - `LoadingStateRecord`

## 8. 依赖与协作模块

- `Platform/chrome-mv3-runtime.md`
- `Services/llm-dispatch.md`
- `Services/extraction.md`

## 9. 约束与禁止事项

- 流式消息必须走 long-lived port，不走 one-shot message 轮询。
- 所有 content script 消息都视为不可信输入。
- 不依赖 service worker 全局变量保存恢复关键状态。
- 不把消息名写死在多个 UI 页面。
- 页面列表、页面详情、标题编辑、消息编辑、分支操作都必须有独立命令名，不允许用“万能命令 + 任意 payload”逃避 schema。

## 10. 测试要求

- 职责测试：command 路由、port 流式事件、恢复握手。
- 边界测试：非法 sender、非法参数、重复连接。
- 错误流测试：port 中断、service worker 重启。
- 异常流测试：side panel 关闭重连、conversations 页面恢复。
- 不变量测试：同一 `sessionId` 的事件顺序正确。

阶段 4 当前测试现状：

- 已覆盖：one-shot command 契约、sender 校验、`port-bus` 路由、真实 `onConnect` 恢复握手、service worker 重启后的 `RESTORE_LOADING`、发送后的流式端到端闭环。
- 未覆盖：分支级流式协议和对话管理页复用流式订阅。

## 11. 相关文档

- `Platform/chrome-mv3-runtime.md`
- `test/llm-and-streaming.md`
- `test/browser-automation.md`
