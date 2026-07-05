# 模型调度服务

## 1. 模块定位

模型调度服务负责统一封装 Vercel AI SDK 调用、助手分支并发、图片能力校验、流式事件分发和取消。当前已落地“所有助手消息统一建模为分支结果集合”的流式闭环、快捷输入首轮 `主模型 + 并行模型` 并发生成、手动选模型单分支扩展，以及消息编辑与重试的重放链路。

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
- 组装“当前选中主分支 + 其他分支”的上下文。
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
  - `dispatchChat(input): MultiBranchStreamSession`
  - `expandBranches(input): BranchStreamSession`
- `stopSession(sessionId)`
- `stopBranch(request)`
- `retryUserMessage(request)`
- `retryMessage(request)`
- `editUserMessage(request)`
- `expandBranches(request)`
- `deleteBranch(request)`

支持 Provider：

- OpenAI Compatible
- Azure OpenAI
- Google Gemini
- Anthropic
- Amazon Bedrock
- Google Vertex

Provider 适配规则：

- OpenAI Compatible、Azure OpenAI -> `@ai-sdk/openai-compatible`
- Google Gemini -> `@ai-sdk/google`
- Anthropic -> `@ai-sdk/anthropic`
- Amazon Bedrock -> `@ai-sdk/amazon-bedrock`
- Google Vertex -> `@ai-sdk/google-vertex`

请求参数透传规则：

- `temperature`、`maxOutputTokens` 会进入所有真实 `streamText / generateText` 调用。
- `basic.llmRequestTimeoutSeconds` 是全局大模型调用超时，默认 `60` 秒；真实聊天流和设置页测试模型都会通过 `AbortSignal` 按该值中止请求。
- `gemini / google-vertex` 的 `url_context / google_search` 通过 provider tools 透传。
- `anthropic / gemini / google-vertex / amazon-bedrock` 的 `reasoningEffort` 会映射到各自 SDK 的 providerOptions。
- 设置页“测试模型”走 background 命令链路，并统一发送 `hi` 做最小连通性校验；命令会携带当前草稿中的全局超时值。

## 5. 关键流程

1. 读取模型配置和页面上下文。
2. 校验模型可用性与图片能力；如果图片能力不匹配，则在任何持久化和网络请求之前直接失败。
3. 若本次请求附带页面正文，则把 `PageRecord.content` 追加到最终 `system prompt` 末尾的 `# Page Content` 段；用户消息正文保持原样。若缓存缺失或开关关闭，则退化为仅发送用户消息。
4. 先写用户消息、带全部首轮分支摘要的助手占位消息和 loading state。
5. 根据当前 `promptTab` 解析首轮执行计划：
   - `chat` 只跑当前主模型。
   - 快捷输入跑“当前主模型 + 全局并行模型 + 当前快捷输入额外并行模型”。
6. 主分支与并行分支分别建立流式会话；每个 chunk 都先写会话，再推送对应 `CHAT_STREAM_CHUNK / BRANCH_STREAM_CHUNK` 事件。
7. 各分支独立收敛到 `done / error / cancelled`，并同步助手消息镜像；单分支失败不会影响其他分支和主回答。
7.0. 每个已进入 `streamText` 的分支都会记录单请求 `startedAt`，STARTED 事件和 loading state 使用同一时间戳；UI 在 loader 右侧以 `mm:ss` 展示实时计时，并在 side panel 重开后延续真实已运行时间。
7.0.1. 每个已进入 `streamText` 的分支都会记录从发起调用到本地消费完流的 `durationMs`；若在调用前失败则保持 `null`。终态事件携带同一 `durationMs`，UI 可在模型名右侧即时显示秒数。
7.1. Provider 返回 `APICallError.responseBody` 或 `data` 时，实时失败事件优先携带该原始 API 返回内容，再回退到 SDK 错误消息。
7.2. 流式失败只把 `error / cancelled` 状态写入会话历史，不把 Provider 原始错误文本持久化；UI 用本次 port 事件把错误详情展示在当前回复中。若当前回复尚无内容，错误文本直接作为本地回复正文展示。
7.2.1. 若失败事件早于 UI 订阅或早于 `SEND_CHAT` 成功响应，`port-bus` 会短暂补发失败事件，UI 必须把同一 `sessionId` 标记为终态，禁止较晚的命令成功响应把错误回复重新覆盖为 loading。
7.3. 若本轮开启了 `rollbackOnFailure` 且最终为 `error`，则在错误收敛后立即回滚本轮新增的用户消息与助手消息，并把失败事件作为只读展示态发给 UI。
8. 所有首轮分支都收敛后，统一通过 `LOADING_STATE_UPDATE` 结束该轮 loading；清理失败只允许留下残留 loading，不能覆盖主生命周期结果。
9. 继续新增分支时，前端必须先让用户选择 `modelId`，后台只为这一个模型追加单分支请求。
10. 手动新增分支的候选模型固定来自“所有启用且配置完整的模型”，包含当前主模型。
11. 同一助手消息允许重复选择同一模型；UI 必须用 `模型名 #1/#2/...` 区分同模型多分支。
12. `expandBranches` 返回值除 `branchId` 外还要带上 `modelId` 和 `modelLabel`，供 UI 在收到命令成功响应后立刻插入 loading 分支占位，不能把“新增分支后的首屏反馈”完全依赖于后续流事件。

自动触发补充约束：

- 自动触发不走独立调度器，直接复用 `dispatchChat`。
- 自动触发当前统一以请求级 `pageContent` 注入页面正文，不改写页面级 `includePageContent`。
- 自动触发、编辑重发、用户重试、助手分支重试和继续新增分支，统一复用“页面正文追加到最终 system prompt”这套拼装规则。
- 快捷输入首轮自动触发会按“主模型 + 并行模型”并发生成同一条助手消息的分支集合。
- 自动触发会话必须进入与手动发送同一套活跃会话注册表，保证 `STOP_SESSION`、页面级清空与恢复行为一致。
- 自动触发首轮失败时启用 `rollbackOnFailure`，不持久化用户消息、助手错误态和 `auto-error` 标签状态。

编辑与分支操作规则：

- `editUserMessage`：
  - 仅接受用户消息作为目标。
  - 更新消息内容后，裁剪该消息之后的助手结果与分支结果。
  - 基于编辑后的消息重新发起一次新的主请求。
- `retryMessage`：
  - 仅接受助手消息内的某个目标分支。
  - 先裁剪该轮之后的全部消息。
  - 只重跑目标分支，不替换整条助手消息。
- `retryUserMessage`：
  - 仅接受用户消息作为目标。
  - 裁剪该用户消息之后的全部消息。
  - 基于“到该用户消息为止”的历史重新生成一条新的助手消息。
- `selectAssistantBranch`：
  - 仅允许切换当前轮最后一条助手消息。
  - 后续继续对话时，历史上下文统一取 `selectedBranchId` 对应分支内容。
- `expandBranches`：
  - 只对目标助手消息追加一个新的分支请求。
  - 必须显式传入用户选中的 `modelId`。
  - 不覆盖现有分支，且允许重复选择同一模型。
  - 命令成功返回后，前端必须先用返回的分支摘要渲染 loading 分支，再继续消费 `BRANCH_STREAM_*` 事件。
- `stopBranch` / `deleteBranch`：
  - 仅影响目标 `branchId`。
  - 主回答和其他分支继续执行。
- 当前限制：
  - 编辑与重试的上下文重建只复用已持久化的用户消息。
  - 历史请求级 `pageContent` 注入不会被重新回放；只会使用本次请求显式传入的页面正文重新拼装最终 system prompt。

## 6. 错误与异常处理

- Provider 配置不完整：
  - 在发送前失败。
- 图片输入模型不支持：
  - 返回能力错误，不进入持久化和网络请求。
- 流式中断：
  - 当前目标分支置为错误态并回收 loading。
- 用户取消：
  - 正常结束，不标记系统错误。
- Provider 明确返回错误文本：
  - 通过 `CHAT_STREAM_FAILED / BRANCH_STREAM_FAILED` 直接透传给 UI，UI 在当前回复消息中展示。
  - 若目标回复或分支尚无正文，UI 必须把错误文本作为本地正文渲染，不能只依赖 toast 或底部小字提示。
  - 若失败事件先于 `SEND_CHAT` 成功响应到达，UI 只允许用后续成功响应补齐本地用户消息 id，不得把已失败的助手消息改回 loading。
  - 持久化的 `ConversationRecord` 只保留 `status: error` 与已有输出内容，`errorMessage` 保持 `null`，避免把 Provider 原始错误写入历史。
- setup 在助手占位消息创建后失败：
  - 助手消息补偿收敛到 `error`。
  - `session.done` 不会启动。
- 首轮快捷输入开启 `rollbackOnFailure` 后流式失败：
  - 先把助手消息收敛到 `error`，随后立即回滚本轮新增的用户消息和助手消息。
  - 返回给 UI 的失败事件只用于当前会话展示，不再作为可恢复历史落库。
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
- 页面正文只能追加到最终 system prompt 末尾的 `# Page Content` 段，不能改写用户消息正文。
- 编辑重发、用户重试、助手重试和继续新增分支，必须复用同一套页面正文拼装规则。
- 可观测性测试：主流事件顺序固定为 `STARTED -> CHUNK* -> FINISHED | FAILED | CANCELLED`，且主流事件必须携带 `branchId`，`STARTED` 还必须携带 `modelId/modelLabel`。
- E2E 允许通过 `globalThis.__THINK_BOT_TEST_STREAM__` 注入测试流桩，并通过 `globalThis.__THINK_BOT_TEST_LAST_STREAM_MESSAGES__` 观察最终送入模型的消息体；两者都仅限自动化环境，不得影响正式 provider 调用。

## 11. 相关文档

- `flow.md`
- `test/llm-and-streaming.md`
