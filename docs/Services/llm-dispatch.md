# 模型调度服务

## 1. 模块定位

模型调度服务负责统一封装 Vercel AI SDK 调用、主回答与分支回答并发、图片能力校验、流式事件分发和取消。当前已落地主回答流式闭环、自动触发复用 `dispatchChat`、主回答后的分支并发扩展，以及消息编辑与重试的重放链路。

## 2. 核心抽象

- `ModelConfig`
- `ResolvedModelProvider`
- `ChatRequestContext`
- `StreamSession`
- `BranchRequest`
- `BranchResult`

## 3. 能力边界

负责：

- 把配置模型解析成可调用 provider。
- 组装主回答和分支回答上下文。
- 调用 `streamText` 与 `generateText`。
- 发送 chunk、done、error、cancel 事件。
- 维护 loading state 生命周期。
- 在用户消息编辑后重新生成受影响的后续回答。
- 保持“先持久化，后推事件”，把 port 推送视为尽力而为副作用。

不负责：

- 管理 UI 文本输入状态。
- 直接操作 DOM。
- 决定页面是否需要提取。

## 4. 对外接口

- 当前接口：
  - `dispatchChat(input): StreamSession`
  - `expandBranches(input): BranchStreamSession[]`
- `stopSession(sessionId)`
- `stopBranch(request)`
- `retryMessage(request)`
- `editUserMessage(request)`
- `expandBranches(request)`
- `deleteBranch(request)`

支持 Provider：

- OpenAI Compatible
- Azure OpenAI
- Google Gemini
- Anthropic

Provider 适配规则：

- OpenAI Compatible、Azure OpenAI -> `@ai-sdk/openai-compatible`
- Google Gemini -> `@ai-sdk/google`
- Anthropic -> `@ai-sdk/anthropic`

## 5. 关键流程

1. 读取模型配置和页面上下文。
2. 校验模型可用性与图片能力；如果图片能力不匹配，则在任何持久化和网络请求之前直接失败。
3. 若本次请求附带页面正文，则把 `PageRecord.content` 与用户消息拼成同一次用户输入；若缓存缺失或开关关闭，则退化为仅发送用户消息。
4. 先写用户消息、助手占位消息和 loading state。
5. 调用 AI SDK `streamText` 输出主回答。
6. 每个 chunk 先写会话，再推送 `CHAT_STREAM_CHUNK` 事件。
7. 流结束后把助手消息收敛到 `done`、`error` 或 `cancelled`。
8. 最后清理 loading；清理失败只允许留下残留 loading，不能覆盖主生命周期结果。
9. 继续新增分支时，先解析“全局分支模型 + 当前 `promptTab` 分支模型”的合并结果，再过滤掉主回答已使用的模型。
10. 每个分支独立写入分支占位、分支 chunk 和分支终态；单分支失败不会影响其他分支和主回答。

自动触发补充约束：

- 自动触发不走独立调度器，直接复用 `dispatchChat`。
- 自动触发当前统一以请求级 `pageContent` 注入页面正文，不改写页面级 `includePageContent`。
- 自动触发会话必须进入与手动发送同一套活跃会话注册表，保证 `STOP_SESSION`、页面级清空与恢复行为一致。

编辑与分支操作规则：

- `editUserMessage`：
  - 仅接受用户消息作为目标。
  - 更新消息内容后，裁剪该消息之后的助手结果与分支结果。
  - 基于编辑后的消息重新发起一次新的主请求。
- `retryMessage`：
  - 保留原用户消息。
  - 用新的助手消息替换旧助手消息及其后续结果。
  - 新助手消息写入 `retryFromMessageId`，用于标记替换来源。
- `expandBranches`：
  - 只对目标助手消息追加新的分支请求。
  - 不覆盖现有分支。
  - 当前分支模型来源是 `basic.branchModelIds + currentPromptTab.branchModelIds` 的合并结果。
- `stopBranch` / `deleteBranch`：
  - 仅影响目标 `branchId`。
  - 主回答和其他分支继续执行。
- 当前限制：
  - 编辑与重试的上下文重建只复用已持久化的用户消息。
  - 历史请求级 `pageContent` 注入不会被重新回放。

## 6. 错误与异常处理

- Provider 配置不完整：
  - 在发送前失败。
- 图片输入模型不支持：
  - 返回能力错误，不进入持久化和网络请求。
- 流式中断：
  - 当前目标置为错误态并回收 loading。
- 用户取消：
  - 正常结束，不标记系统错误。
- setup 在助手占位消息创建后失败：
  - 助手消息补偿收敛到 `error`。
  - `session.done` 不会启动。
- loading 清理失败：
  - 不改变已经收敛的 `done`、`error`、`cancelled` 结果。
- port 推送失败：
  - 只影响实时 UI 推送，不改变已落库消息与最终生命周期结果。
- 编辑目标非法：
  - 若目标不是用户消息或其页面、标签不匹配，则直接拒绝。

## 7. 数据与状态

- 读：
  - `ExtensionConfig`
  - `PageRecord`
  - `ConversationRecord`
- 写：
  - `ConversationRecord`
  - `LoadingStateRecord`

## 8. 依赖与协作模块

- `Services/runtime-messaging.md`
- `dao/config-repository.md`
- `dao/conversation-repository.md`

## 9. 约束与禁止事项

- API Key 不进入 content script。
- UI 不直接依赖具体 provider SDK。
- provider 分支逻辑只能留在 registry 层，不散落到业务页面。
- 分支失败不能拖垮主回答或其他分支。
- 同一 `promptTab` 的持久化写入必须串行，避免并发分支互相覆盖。

## 10. 测试要求

- 职责测试：阶段 4 先覆盖主回答流式生命周期。
- 边界测试：空文本+图片、图片能力不支持、不完整模型。
- 错误流测试：Provider 返回错误、网络中断、setup 补偿失败保护。
- 异常流测试：取消、side panel 关闭重开恢复、loading 清理失败不覆盖主结果。
- 不变量测试：终态消息不可继续追加 chunk 或覆盖终态结果。
- 不变量测试：`includePageContent=true/false`、页面正文缓存缺失时，实际发给模型的上下文与请求级开关一致。
- 可观测性测试：事件顺序固定为 `STARTED -> CHUNK* -> FINISHED | FAILED | CANCELLED`。
- E2E 允许通过 `globalThis.__THINK_BOT_TEST_STREAM__` 注入测试流桩，并通过 `globalThis.__THINK_BOT_TEST_LAST_STREAM_MESSAGES__` 观察最终送入模型的消息体；两者都仅限自动化环境，不得影响正式 provider 调用。

## 11. 相关文档

- `flow.md`
- `test/llm-and-streaming.md`
