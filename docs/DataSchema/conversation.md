# 会话数据域

## 1. 数据域概述

- 名称：`ConversationRecord`
- 存储类型：`chrome.storage.local`
- 业务意义：保存页面下各 `promptTab` 的聊天历史；每条助手消息统一由“分支结果集合 + 当前选中主分支”组成。
- 所属模块：侧边栏、对话管理页、模型调度、导出。
- 上下游依赖：
  - 上游：LLM Dispatch、用户输入。
  - 下游：消息渲染、导出、历史恢复。

## 2. 字段定义

- `id`
  - 类型：`string`
  - 必填：是
  - 含义：`{normalizedUrl}:{promptTabId}`
- `normalizedUrl`
  - 类型：`string`
  - 必填：是
- `promptTabId`
  - 类型：`string`
  - 必填：是
  - 含义：`chat` 或快捷输入稳定 ID。
- `messages`
  - 类型：`MessageRecord[]`
  - 必填：是
- `lastAssistantState`
  - 类型：`object | null`
  - 必填：否
  - 含义：当前 `promptTab` 最新助手输出摘要。
- `updatedAt`
  - 类型：`number`
  - 必填：是

`MessageRecord` 关键字段：

- `id`
- `role`
- `content`
- `displayContent`
- `images`
- `status`
- `errorMessage`
- `modelId`
- `branches`
- `selectedBranchId`
- `retryFromMessageId`
- `editedAt`
- `createdAt`
- `updatedAt`

`BranchRecord` 关键字段：

- `id`
- `modelId`
- `modelLabel`
- `isPrimary`
- `content`
- `status`
- `errorMessage`
- `createdAt`
- `updatedAt`

## 3. 索引与限制

- 主 key：`conversation:{normalizedUrl}:{promptTabId}`
- 同一页面默认聊天与快捷输入 `promptTab` 必须分开存储。
- 分支挂在所属助手消息下，不能独立脱离消息主链。
- 助手消息存在分支时，`selectedBranchId` 必须指向当前消息内的某个分支。
- 助手消息顶层 `content/status/errorMessage/modelId` 只是当前选中主分支的镜像，不再单独代表另一份主回答。
- 错误分支允许持久化 `error` 状态和已生成内容，但 Provider 原始错误文本只作为实时 UI 展示态，不写入历史 `errorMessage`。
- 阶段 4 的主回答消息状态机固定为 `loading -> done | error | cancelled`，进入终态后不能继续追加 chunk 或覆盖终态结果。
- 同一 `promptTab` 下若存在多分支并发写入，仓储层必须串行化写操作，避免分支互相覆盖。

## 4. 读写路径

- 谁读：
  - side panel
  - conversations page
  - export service
- 谁写：
  - 仅 background 的会话服务。
- 典型查询：
  - 获取单个 `promptTab` 会话。
  - 批量恢复页面下多个 `promptTab` 会话。
- 典型更新：
- 追加用户消息。
- 先创建带首个主分支的助手占位消息，再按 chunk 增量写入当前选中分支。
- 将当前选中分支和助手消息镜像一起从 `loading` 收敛到 `done`、`error` 或 `cancelled`。
- 编辑用户消息并裁剪其后的依赖回答。
- 切换助手消息的 `selectedBranchId`。
- 更新分支状态。
- 继续为既有回答新增分支。
- 删除目标分支。
- 清空单 `promptTab` 会话。

## 5. 生命周期与风险

- 首次发送时创建。
- 每轮用户消息和助手完成会更新 `updatedAt`。
- 阶段 4 主聊天流要求每个 chunk 先落 `ConversationRecord`，再通知 UI，避免侧边栏看到比持久化更“新”的状态。
- 若 setup 在助手占位消息创建后失败，允许保留用户消息，但助手消息必须立刻收敛为 `error`，不能永久停在 `loading`。
- 编辑用户消息时，目标消息写入 `editedAt`，并且该消息之后的助手结果和分支结果必须整体裁剪后再重新发起请求。
- 自动触发的快捷输入用户消息允许额外保存 `displayContent`，用于 UI 展示快捷输入名称；编辑后必须回退为真实文本展示。
- 用户消息重试时，目标用户消息后的全部结果必须被裁剪，并重建该轮新的助手消息。
- 助手分支重试时，不再替换整条助手消息；而是裁剪该轮之后的消息，并只重跑目标分支。
- 页面删除或硬删除时一并删除。
- 风险：
  - 分支写入覆盖主消息。
  - `promptTabId` 不稳定导致历史错位。
  - 编辑消息但未裁剪后续依赖结果，会让会话链路与真实上下文不一致。

## 6. 测试要求

- `Chat` 与快捷输入隔离测试。
- 分支并发写入测试。
- 用户消息编辑后裁剪与重发测试。
- 主分支切换与镜像同步测试。
- 分支级重试与历史裁剪测试。
- 继续新增分支与删除目标分支测试。
- 清空当前 `promptTab` 不影响其他 `promptTab` 测试。
- 导出结构正确性测试。
