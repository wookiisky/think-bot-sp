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
- 当前已实现的其他命令：
  - `CLEAR_PAGE_CONTEXT`
  - `CLEAR_TAB_CONVERSATION`
  - `SEND_CHAT`
  - `EXPAND_MESSAGE_BRANCHES`
  - `STOP_SESSION`
  - `STOP_BRANCH`
  - `DELETE_BRANCH`
  - `EXPORT_CONVERSATION`
  - `GET_CONFIG`
  - `SAVE_CONFIG`
  - `RESET_CONFIG`
  - `IMPORT_CONFIG`
  - `EXPORT_CONFIG`
  - `GET_LOCAL_CACHE_STATS`
  - `CLEAR_LOCAL_CACHE`
  - `TEST_SYNC_CONNECTION`
  - `SYNC_NOW`
- 当前已实现的对话管理页命令：
  - `LIST_PAGES`
  - `SEARCH_PAGES`
  - `GET_PAGE_DETAIL`
  - `UPDATE_PAGE_TITLE`
  - `DELETE_PAGE`
- 已定义但当前未实现：
  - `FETCH_REMOTE_QUICK_INPUT_TEMPLATES`
  - `IMPORT_REMOTE_QUICK_INPUT_TEMPLATES`

long-lived port 事件：

- `CHAT_STREAM_STARTED`
- `BRANCH_STREAM_STARTED`
- `BRANCH_STREAM_CHUNK`
- `BRANCH_STREAM_FINISHED`
- `BRANCH_STREAM_FAILED`
- `BRANCH_STREAM_CANCELLED`
- `CHAT_STREAM_CHUNK`
- `CHAT_STREAM_FINISHED`
- `CHAT_STREAM_FAILED`
- `CHAT_STREAM_CANCELLED`
- `LOADING_STATE_UPDATE`
- `RESTORE_LOADING`

阶段 4 当前落地边界：

- 已落地：side panel one-shot command schema、sender 校验、`background` 侧 `chrome.runtime.onConnect`、按 `normalizedUrl + promptTabId` 路由的 `port-bus`、`SEND_CHAT / STOP_SESSION / CLEAR_PAGE_CONTEXT / CLEAR_TAB_CONVERSATION / EXPORT_CONVERSATION` 命令、`RESTORE_LOADING` 恢复握手、设置页 `GET_CONFIG / SAVE_CONFIG / RESET_CONFIG / IMPORT_CONFIG / EXPORT_CONFIG / GET_LOCAL_CACHE_STATS / CLEAR_LOCAL_CACHE / TEST_SYNC_CONNECTION / SYNC_NOW`。
- 已落地补充：`RE_EXTRACT_CONTENT` 成功后会在 background 内部触发自动触发去重编排；手动发送与自动触发共享同一套活跃会话注册表。
- 未落地：对话管理页复用同一条流式订阅、快捷输入远端模板命令。
- 已落地补充：对话管理页复用 `SEND_CHAT / STOP_SESSION / STOP_BRANCH / DELETE_BRANCH / EDIT_USER_MESSAGE / RETRY_MESSAGE / EXPAND_MESSAGE_BRANCHES / CLEAR_TAB_CONVERSATION / EXPORT_CONVERSATION` 与同一条流式事件协议。
- 未落地：快捷输入远端模板命令。

命令分组约束：

- 以下分组描述的是命令归属边界，不等同于“当前已全部实现”。

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
  - `GET_LOCAL_CACHE_STATS`
  - `CLEAR_LOCAL_CACHE`
  - `TEST_SYNC_CONNECTION`
  - `SYNC_NOW`
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
- 自动触发不暴露新的 one-shot command；由 `RE_EXTRACT_CONTENT` 成功后的 background 编排直接复用 `dispatchChat` 和现有流式 port 管线。
- `TEST_SYNC_CONNECTION` 只校验当前同步表单，不写入本地配置。
- `SYNC_NOW` 先持久化当前配置，再执行远端推送，成功后由仓储回写 `sync.lastSyncAt`。
- 设置页当前只覆盖本地配置闭环和最小同步闭环，不包含快捷输入远端模板导入。
- `EDIT_USER_MESSAGE`、`RETRY_MESSAGE`、`EXPAND_MESSAGE_BRANCHES`、`STOP_BRANCH`、`DELETE_BRANCH` 都复用同一条 typed command 管线和 schema 校验。
- `CLEAR_PAGE_CONTEXT` 与 `CLEAR_TAB_CONVERSATION` 必须保持语义分离：前者清理当前页面缓存、页面级状态、会话和 loading，后者只清理当前 `promptTab` 会话与 loading。
- `CLEAR_PAGE_CONTEXT` 必须先取消当前页面活跃会话并等待其生命周期收敛，再删除页面记录，避免流式尾包把刚清空的页面重新写回。
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
- 页面级清空：
  - 活跃会话必须先取消，再进入删除页面数据的操作序列。
- 对话管理页删除页面：
  - 活跃会话必须先取消。
  - 同步开启时先写入 tombstone，再清理本地页面、会话与 loading。
- 同步命令：
  - `TEST_SYNC_CONNECTION` 或 `SYNC_NOW` 失败时返回显式错误，不允许 background 吞错后伪造成功响应。

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
- 不变量测试：自动触发会话也必须被 `STOP_SESSION / CLEAR_PAGE_CONTEXT` 看到，不能落到旁路会话表。

阶段 4 当前测试现状：

- 已覆盖：one-shot command 契约、sender 校验、`port-bus` 路由、真实 `onConnect` 恢复握手、service worker 重启后的 `RESTORE_LOADING`、发送后的流式端到端闭环。
- 已覆盖：`CLEAR_PAGE_CONTEXT` 的取消后清理顺序、页面级 `includePageContent` 通过 `SEND_CHAT` 进入真实模型上下文。
- 已覆盖：自动触发首次执行、重开 side panel 不重复触发、自动触发会话进入现有停止/清理链路。
- 已覆盖：`CLEAR_TAB_CONVERSATION` 的目标标签取消与清理语义、`EXPORT_CONVERSATION` 的命令路由。
- 已覆盖：`EXPAND_MESSAGE_BRANCHES / STOP_BRANCH / DELETE_BRANCH` 命令契约、分支级流式事件和命令路由。
- 已覆盖：`EDIT_USER_MESSAGE / RETRY_MESSAGE` 命令契约，以及编辑裁剪、重试替换旧助手消息的命令路由。
- 已覆盖：设置页配置命令、同步连接测试与手动同步命令。
- 未覆盖：对话管理页复用流式订阅、快捷输入远端模板命令。

## 11. 相关文档

- `Platform/chrome-mv3-runtime.md`
- `test/llm-and-streaming.md`
- `test/browser-automation.md`
