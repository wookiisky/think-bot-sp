# 模型调度服务

## 1. 模块定位

模型调度服务负责统一封装 Vercel AI SDK 调用、主回答与分支回答并发、图片能力校验、流式事件分发和取消。

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

不负责：

- 管理 UI 文本输入状态。
- 直接操作 DOM。
- 决定页面是否需要提取。

## 4. 对外接口

- `startChat(request): StreamSession`
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
2. 校验模型可用性与图片能力。
3. 生成主请求和分支请求。
4. 为每个请求建立独立状态。
5. 调用 AI SDK 流式输出。
6. 以 `PortStreamEvent` 推送增量事件。
7. 完成后写历史并清理 loading。

编辑与分支操作规则：

- `editUserMessage`：
  - 仅接受用户消息作为目标。
  - 更新消息内容后，裁剪该消息之后的助手结果。
  - 基于编辑后的消息重新发起一次新的主请求。
- `retryMessage`：
  - 保留原用户消息。
  - 新结果作为同轮回答的新增结果写回。
- `expandBranches`：
  - 只对目标助手消息追加新的分支请求。
  - 不覆盖现有分支。
- `stopBranch` / `deleteBranch`：
  - 仅影响目标 `branchId`。
  - 主回答和其他分支继续执行。

## 6. 错误与异常处理

- Provider 配置不完整：
  - 在发送前失败。
- 图片输入模型不支持：
  - 返回能力错误，不进入网络请求。
- 流式中断：
  - 当前目标置为错误态并回收 loading。
- 用户取消：
  - 正常结束，不标记系统错误。
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

## 10. 测试要求

- 职责测试：主回答、分支回答、重试、继续分支。
- 边界测试：空文本+图片、图片能力不支持、不完整模型。
- 错误流测试：Provider 返回错误、网络中断、非法编辑目标。
- 异常流测试：取消、side panel 关闭重开恢复。
- 不变量测试：分支模型身份、局部停止、局部删除、编辑消息后不保留过期结果。
- 可观测性测试：流式 chunk、done、error 事件序列。

## 11. 相关文档

- `flow.md`
- `test/llm-and-streaming.md`
