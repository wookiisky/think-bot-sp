# 调试日志服务

## 1. 模块定位

调试日志服务负责在 extension runtime 内记录关键流程节点，提供统一的结构化 debug 日志，帮助排查 side panel、service worker、content script、流式输出和同步链路中的问题。

该服务只服务于开发和调试，不属于产品功能。

## 2. 核心抽象

- `LogLevel`：`debug | info | warn | error`。
- `LogContext`：一次日志携带的键值上下文。
- `Logger`：带 scope 的日志实例，可通过 `child` 派生。
- `describeError`：把任意 `unknown` 错误转成可记录的 `reason` 文本。

## 3. 能力边界

负责：

- 在关键流程开始、结束、回退、取消、失败时记录结构化日志。
- 统一日志级别、事件名、scope 和上下文字段。
- 把载荷序列化进消息文本，对敏感字段脱敏，对长字符串截断。
- 按级别阈值过滤输出，提供运行时切换入口。
- 为跨模块排障提供可串联的关联字段。

不负责：

- 持久化日志。
- 同步日志到远端。
- 提供日志查看页、导出能力或设置项。
- 代替业务错误处理、指标或告警系统。

## 4. 对外接口

- `createLogger(scope, context?)`：创建根 logger，scope 为运行上下文名。
- `logger.debug / info / warn / error(event, context?)`
- `logger.child(scope, context?)`：scope 以 `/` 拼接，context 合并进后续每条日志。
- `withContext(logger, context)`：给任意最小 logger 形状绑定固定字段，服务内部用它串联同一链路。
- `describeError(error, fallback?)`
- `setLogLevel(level)` / `getLogLevel()`
- `globalThis.__thinkBotLog.setLevel(level)`：在对应上下文的 DevTools console 里手动切换阈值。

### 4.1 输出格式

每条日志是一行纯文本，载荷是紧凑 JSON：

```text
[background/dispatch] chat.stream.completed {"normalizedUrl":"https://example.com/a","promptTab":"chat","sessionId":"s-1","messageId":"m-1","durationMs":1830,"flushCount":12,"contentLength":940}
```

- 不再把对象作为第二个参数交给 `console`：DevTools 持有的是活引用，折叠时只显示 `{…}`，复制文本和 E2E 抓取都拿不到字段。
- 空载荷不输出 `{}`。
- `undefined` 字段被省略。

### 4.2 级别阈值

- 开发构建和 vitest 默认 `debug`，生产构建默认 `info`。
- 阈值是每个 JS 上下文独立的：service worker、side panel、options、conversations 各自持有；在哪个 console 排障就在哪个 console 调 `__thinkBotLog.setLevel('debug')`。
- E2E 若需要观察 `debug` 事件，先通过 `serviceWorker.evaluate` 调整阈值。

### 4.3 级别语义

- `debug`：高频或仅开发需要的细节，例如每次标签切换的 side panel 预配置、每条命令的完成耗时、port 收到的非 chunk 事件。
- `info`：用户可感知的关键节点：打开、发送、流式开始/首包/完成/取消、提取完成、同步完成。
- `warn`：预期内失败、能力缺失、降级和用户取消之外的异常收敛，例如 Readability 提取为空、孤儿 loading 收敛、content script 重连。
- `error`：依赖失败或不应发生的状态：Provider 失败、命令处理失败、同步失败、结果未落库。

### 4.4 scope 约定

- 根 scope 为运行上下文：`background`、`sidebar`、`conversations`、`options`、`ui/runtime`。
- background 内按模块派生子 scope：`background/entry`、`background/command`、`background/port`、`background/port/restore`、`background/extraction`、`background/dispatch`、`background/auto_trigger`、`background/sync`、`background/loading`、`background/keepalive`、`background/model_test`。
- UI 侧 port 订阅使用 `sidebar/port/stream` 与 `conversations/port/stream`，并绑定 `promptTab`。

### 4.5 事件命名

- 形如 `<domain>.<subject>.<outcome>`，全部小写英文加下划线，不使用自然语言句子。
- 常用 outcome：`started`、`completed`、`failed`、`cancelled`、`skipped`、`accepted`、`requested`、`unavailable`、`blocked`。
- 同一事件在成功和失败路径上共享 domain 与 subject，例如 `sync.completed` / `sync.failed`。

### 4.6 脱敏与裁剪

- 键名匹配 `apikey | token | password | secret | authorization | credential`（大小写不敏感）的字段整值替换为 `[REDACTED]`，嵌套对象同样生效。
- 字符串超过 200 字符时截断为 `前 200 字符…(len=N)`，保证页面正文和用户输入不会完整进入日志。
- 嵌套深度超过 3 层时折叠为 `[object]` / `[array(n)]`。
- `Error` 值自动转为 message；不可序列化对象输出占位而不是抛错。

## 5. 事件目录

按 scope 列出当前使用的事件及级别。带 `chat.` 前缀的流式事件在分支流上以 `branch.` 前缀出现，字段相同并附带 `branchId`。

### background/entry

| 事件 | 级别 | 关键字段 |
| --- | --- | --- |
| `entry.runtime.installed` | info | `reason` |
| `entry.action.clicked` | info | `browserTabId`、`url`、`source` |
| `entry.action.restricted` | info | `browserTabId`、`url` |
| `entry.action.redirected` | info | `browserTabId`、`from`、`to` |
| `entry.action.missing_tab` | warn | `url` |
| `entry.action.failed` | error | `browserTabId`、`source`、`reason` |
| `entry.action.unavailable` | warn | |
| `entry.handler.failed` | error | `event`、`reason`；`onInstalled / contextMenus / tabs.*` 监听器里 fire-and-forget 入口任务的未捕获异常 |
| `entry.action_behavior.synced` | debug | `openPanelOnActionClick` |
| `entry.action_behavior.unavailable` / `.failed` | warn | `reason` |
| `entry.tabs_query.unavailable` | warn | |
| `entry.active_tab_sync.failed` | warn | `reason` |
| `entry.page.opened` | info | `page`、`url`、`locale` |
| `entry.contextmenu.clicked` | info | `menuItemId` |
| `panel.opened` | info | `browserTabId`、`via` |
| `panel.enabled` / `panel.preconfigured` / `panel.disabled` / `panel.auto_hidden` / `panel.removed` | debug | `browserTabId` |
| `panel.open.unavailable` | warn | `browserTabId` |
| `panel.disable.failed` / `panel.stale_cleanup.failed` / `panel.auto_hide_failed` | warn | `browserTabId`、`reason` |
| `panel.active_tab_sync.failed` | warn | `browserTabId`、`trigger`、`reason` |

### background/command

| 事件 | 级别 | 关键字段 |
| --- | --- | --- |
| `command.completed` | debug | `source`、`type`、`browserTabId`、`durationMs` |
| `command.failed` | error | `source`、`type`、`browserTabId`、`durationMs`、`reason` |
| `panel.init.started` | debug | `browserTabId`、`normalizedUrl` |
| `page.info.loaded` | info | `hasPage`、`extractionMethod`、`contentLength`、`conversationCount`、`loadingCount`、`blockedByBlacklist`、`shouldExtract` |
| `blacklist.detected` | info | `matchedRuleId` |
| `blacklist.bypass_confirmed` | info | `browserTabId`、`normalizedUrl` |
| `blacklist.bypass.clear_failed` | warn | `browserTabId`、`reason` |
| `auto_trigger.unhandled` | error | `browserTabId`、`normalizedUrl`、`reason`；`RE_EXTRACT_CONTENT` 成功后编排自动触发时的未捕获异常 |
| `chat.send.accepted` | info | `sessionId`、`messageId`、`modelId`、`textLength`、`imageCount`、`includePageContent`、`pageContentLength`、`branchCount` |
| `chat.edit.accepted` / `chat.retry.accepted` / `chat.user_retry.accepted` | info | `targetMessageId`、`sessionId`、`messageId` |
| `chat.cancel.requested` / `branch.cancel.requested` | info | `sessionId` 或 `branchId`、`stopped` |
| `branch.expand.accepted` | info | `messageId`、`branchCount` |
| `branch.primary.selected` / `branch.delete.completed` | info | `messageId`、`branchId` |
| `page.clear.completed` / `prompt_tab.clear.completed` | info | `normalizedUrl`、`promptTab` |
| `conversation.export.requested` | debug | `promptTab` |
| `conversation.export.completed` | info | `promptTab` |

`source` 取 `sidebar`、`conversations` 或 `config`。命令处理器内部已记录业务事件，命令层不再对成功路径重复输出 info。

### background/port

| 事件 | 级别 | 关键字段 |
| --- | --- | --- |
| `port.connected` / `port.disconnected` | info | `portId` |
| `port.message.rejected` | warn | `portId`、`issues` |
| `port.restore_requested` | info | `portId`、`browserTabId`、`normalizedUrl`、`promptTab` |
| `port.restore_skipped` | debug / warn | `outcome`、`reason`；`outcome` 非 `active` 为 debug，缺少恢复数据为 warn |
| `port.restore_sent` | info | `sessionId`、`messageId`、`contentLength`、`branchCount`、`startedAt` |
| `port.restore_failed` | error | `reason` |

### background/extraction

| 事件 | 级别 | 关键字段 |
| --- | --- | --- |
| `extraction.started` | info | `browserTabId`、`normalizedUrl`、`method`、`titleLength`、`hasFavicon` |
| `extraction.readability_failed` | warn | `reason`：`empty_content` 或 `parser_failed` |
| `extraction.jina_started` | info | `hasApiKey` |
| `extraction.completed` | info | `method`、`source`、`contentLength`、`durationMs`、`autoTrigger` |
| `extraction.failed` | error | `method`、`source`、`durationMs`、`reason` |
| `extraction.method_switched` | info | `method`、`hasCachedContent` |
| `extraction.method_switch_failed` | error | `method`、`reason` |
| `content_source.disconnected` / `.reinjected` / `.reconnected` | debug | `browserTabId`、`method`、`attempt` |
| `content_source.reinject_failed` / `.reloading` / `.reconnect_failed` | warn | `browserTabId`、`method`、`reason` |

### background/dispatch

| 事件 | 级别 | 关键字段 |
| --- | --- | --- |
| `chat.turn.prepared` | debug | `messageCount`、`systemPromptLength`、`imageCount`、`models`、`timeoutSeconds`、`rollbackOnFailure` |
| `chat.stream.started` | info | `provider`、`modelId`、`messageCount`、`timeoutSeconds` |
| `chat.stream.first_chunk` | info | `ttfbMs` |
| `chat.stream.completed` | info | `durationMs`、`flushCount`、`contentLength` |
| `chat.stream.cancelled` | info | `durationMs`、`flushCount`、`contentLength` |
| `chat.stream.failed` | error | `reason`、`provider`、`modelId`、`durationMs`、`timedOut`、`persisted`、`rolledBack` |
| `chat.rollback.completed` | info | `userMessageId` |
| `branch.skipped.no_images` | warn | `promptTab`、`modelId`；本轮带图片但并行模型不支持图片，跳过该分支 |
| `chat.rollback.failed` | error | `reason` |
| `chat.loading.cleanup_failed` / `branch.loading.cleanup_failed` | warn | `reason` |

所有流式事件都携带 `normalizedUrl`、`promptTab`、`sessionId`、`messageId`。`ttfbMs` 使用墙钟时间，只用于日志，不进入落库数据。

### background/auto_trigger

| 事件 | 级别 | 关键字段 |
| --- | --- | --- |
| `auto_trigger.evaluated` | debug | `candidateCount`、`pageContentLength` |
| `auto_trigger.skipped` | debug / info / warn | `reason`：`has_conversation` 与 `loading_exists` 为 debug，`empty_page_content` 为 info，`no_available_model` 为 warn |
| `auto_trigger.started` | info | `promptTab`、`sessionId`、`messageId`、`modelId` |
| `auto_trigger.finalize_failed` | warn | `sessionId`、`reason` |
| `auto_trigger.failed` | error | `promptTab`、`modelId`、`reason` |
| `auto_trigger.reset_failed` | warn | `promptTab`、`reason`；调度失败后把 `autoTriggerStatus` 回退为 `idle` 也失败 |

### background/sync 与 background/model_test

| 事件 | 级别 | 关键字段 |
| --- | --- | --- |
| `sync.started` | info | `provider`、`revision`、`lastSyncAt` |
| `sync.remote_loaded` | info | `remoteSnapshotVersion`、`remotePages`、`remoteConversations`、`remoteTombstones`、`remoteLastSyncAt` |
| `sync.completed` | info | `provider`、`durationMs`、`snapshotBytes`、`lastSyncAt` |
| `sync.failed` | error | `provider`、`durationMs`、`reason` |
| `sync.connection_tested` | info | `provider`、`ok` |
| `sync.connection_failed` | error | `provider`、`reason` |
| `model_test.started` | info | `modelId`、`provider`、`timeoutSeconds`、`reasoningEffort` |
| `model_test.completed` | info | `durationMs`、`textLength` |
| `model_test.failed` | error | `durationMs`、`timedOut`、`reason` |

### background/loading 与 background/keepalive

| 事件 | 级别 | 关键字段 |
| --- | --- | --- |
| `loading.reconcile.startup` | warn | `reconciled` |
| `loading.reconcile.startup_failed` | warn | `reason` |
| `loading.reconcile.orphan_converged` | warn | `sessionId`、`failedBranchCount`、`startedAt`、`staleMs` |
| `loading.reconcile.branch_failed` / `.cleanup_failed` | warn | `reason` |
| `keepalive.ping_failed` | warn | `holders`、`reason` |
| `recent_error.persist_failed` | warn | `source`、`operation`、`reason` |

### UI 上下文

| scope | 事件 | 级别 | 关键字段 |
| --- | --- | --- | --- |
| `ui/runtime` | `command.completed` | debug | `type`、`durationMs` |
| `ui/runtime` | `command.rejected` | warn | `type`、`durationMs`、`reason`；background 已返回显式错误 |
| `ui/runtime` | `command.unreachable` | warn | `type`、`durationMs`、`reason`；background 没有任何响应 |
| `sidebar` | `sidebar.bootstrap.failed` | error | `browserTabId`、`reason` |
| `sidebar/port/stream`、`conversations/port/stream` | `port.event` | debug | `type`、`sessionId`、`messageId`、`branchId`、`status`；chunk 事件不记录 |
| 同上 | `port.disconnected` | warn | `attempt`、`reconnectInMs` |
| `options` | `settings.loaded` | info | `modelCount`、`quickInputCount`、`language`、`syncProvider`、`cachePageCount`、`cacheBytes` |
| `options` | `settings.saved` | info | `language`、`theme`、`modelCount`、`defaultModelId`、`syncProvider` |
| `options` | `settings.save.blocked` | warn | `reason`、`defaultModelId` |
| `options` | `settings.import.completed` / `settings.export.completed` / `settings.reset.completed` / `settings.cache.cleared` | info | |
| `options` | `settings.load.failed` / `settings.save.failed` / `settings.import.failed` / `settings.export.failed` / `settings.reset.failed` / `settings.cache.clear_failed` / `settings.quick_input_templates.import_failed` / `settings.model_test.failed` | error | `reason` |
| `options` | `settings.open.requested` | info | `url` |

## 6. 错误与异常处理

- 用户取消：记录为 `info`，不记为系统 `error`。
- 预期内失败：例如 Readability 提取为空、content script 断连重连，记录 `warn`。
- 依赖失败：例如 Provider、同步后端失败，记录 `error`。
- 命令失败：background 侧 `command.failed` 为 `error`；UI 侧 `command.rejected` 为 `warn`，避免同一错误在两个 console 里都以 error 出现。
- service worker 重启恢复：恢复握手和重连只记录流程状态，不假设内存中的旧 logger 状态仍存在。
- 日志自身的异常（不可序列化、循环引用）输出占位，不能影响业务流程。

## 7. 数据与状态

- 输出介质：`console.debug / info / warn / error`，每次调用只传一个字符串参数。
- 运行态：仅一个进程内的级别阈值；不写入 `chrome.storage`，不进入 `SyncSnapshot`。

推荐 `context` 字段：

- 关联字段：`browserTabId`、`normalizedUrl`、`promptTab`、`sessionId`、`messageId`、`branchId`、`portId`。
- 输入摘要：`modelId`、`provider`、`method`、`source`、`type`、`textLength`、`imageCount`、`pageContentLength`、`messageCount`。
- 结果摘要：`durationMs`、`ttfbMs`、`contentLength`、`flushCount`、`snapshotBytes`、`reason`、`timedOut`、`persisted`。

## 8. 依赖与协作模块

- `Services/runtime-messaging.md`
- `Services/extraction.md`
- `Services/llm-dispatch.md`
- `Services/sync.md`
- `Platform/chrome-mv3-runtime.md`

## 9. 约束与禁止事项

- 不记录 API Key、同步密钥、认证头或完整凭证。
- 不记录完整页面正文、完整用户输入、图片原始内容；只记录长度和计数。
- 不把对象作为第二个参数交给 `console`，载荷必须序列化进消息文本。
- 不在 UI 页面和 background 中各自定义一套事件名。
- 成功路径不在多层重复记录同一件事：命令层只在 debug 记录耗时，业务事件由处理器记录。
- 不为调试日志新增设置页开关、导出入口或历史查看功能。

## 10. 测试要求

- 契约测试：`tests/unit/services/logger/logger.spec.ts` 覆盖单行格式、空载荷、级别过滤、child、withContext、脱敏、截断、循环引用、`describeError`。
- 正常流测试：side panel 初始化、提取成功、流式完成、同步成功会记录稳定事件名和关键字段。
- 错误流测试：content script 断连、Provider 失败、同步失败会输出 `warn` 或 `error`。
- 异常流测试：用户取消、port 断开、service worker 重启恢复有对应日志事件。
- 不变量测试：同一 `sessionId` 或 `branchId` 的关键日志可串联；敏感字段不进入日志。
- E2E：从 console 文本解析 `event {json}`，需要 debug 事件时先调 `__thinkBotLog.setLevel('debug')`。

## 11. 相关文档

- `flow.md`
- `tech_stack.md`
- `test/browser-automation.md`
- `decision_log.md`
