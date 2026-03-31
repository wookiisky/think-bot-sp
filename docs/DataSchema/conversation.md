# 会话数据域

## 1. 数据域概述

- 名称：`ConversationRecord`
- 存储类型：`chrome.storage.local`
- 业务意义：保存页面下各标签页的聊天历史、主回答和分支回答。
- 所属模块：侧边栏、对话管理页、模型调度、导出。
- 上下游依赖：
  - 上游：LLM Dispatch、用户输入。
  - 下游：消息渲染、导出、历史恢复。

## 2. 字段定义

- `id`
  - 类型：`string`
  - 必填：是
  - 含义：`{normalizedUrl}:{tabId}`
- `normalizedUrl`
  - 类型：`string`
  - 必填：是
- `tabId`
  - 类型：`string`
  - 必填：是
  - 含义：`chat` 或快捷输入稳定 ID。
- `messages`
  - 类型：`MessageRecord[]`
  - 必填：是
- `lastAssistantState`
  - 类型：`object | null`
  - 必填：否
  - 含义：当前标签最新助手输出摘要。
- `updatedAt`
  - 类型：`number`
  - 必填：是

`MessageRecord` 关键字段：

- `id`
- `role`
- `content`
- `images`
- `status`
- `modelId`
- `branches`
- `retryFromMessageId`
- `editedAt`
- `createdAt`
- `updatedAt`

`BranchRecord` 关键字段：

- `id`
- `modelId`
- `modelLabel`
- `content`
- `status`
- `errorMessage`
- `createdAt`
- `updatedAt`

## 3. 索引与限制

- 主 key：`conversation:{normalizedUrl}:{tabId}`
- 同一页面默认聊天与快捷输入标签必须分开存储。
- 分支挂在所属助手消息下，不能独立脱离消息主链。
- 错误分支允许持久化错误结果，但不保留无意义空 loading 记录。

## 4. 读写路径

- 谁读：
  - side panel
  - conversations page
  - export service
- 谁写：
  - 仅 background 的会话服务。
- 典型查询：
  - 获取单个标签会话。
  - 批量恢复页面下多个标签会话。
- 典型更新：
- 追加用户消息。
- 增量写入主回答。
- 编辑用户消息并裁剪其后的依赖回答。
- 更新分支状态。
- 继续为既有回答新增分支。
- 删除目标分支。
- 清空单标签会话。

## 5. 生命周期与风险

- 首次发送时创建。
- 每轮用户消息和助手完成会更新 `updatedAt`。
- 编辑用户消息时，目标消息写入 `editedAt`，并且该消息之后的助手结果和分支结果必须整体裁剪后再重新发起请求。
- 页面删除或硬删除时一并删除。
- 风险：
  - 分支写入覆盖主消息。
  - tabId 不稳定导致历史错位。
  - 编辑消息但未裁剪后续依赖结果，会让会话链路与真实上下文不一致。

## 6. 测试要求

- `Chat` 与快捷输入隔离测试。
- 分支并发写入测试。
- 用户消息编辑后裁剪与重发测试。
- 重试生成新分支测试。
- 继续新增分支与删除目标分支测试。
- 清空当前标签不影响其他标签测试。
- 导出结构正确性测试。
