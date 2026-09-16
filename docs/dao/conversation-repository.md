# 会话仓储

## 1. 关联模块

- 侧边栏
- 对话管理页
- 模型调度
- 导出

## 2. 访问数据域

- `DataSchema/conversation.md`
- `DataSchema/loading-state.md`

## 3. 提供的能力

- 获取单 `promptTab` 会话。
- 按页面批量获取全部 `promptTab` 会话。
- 为 side panel bootstrap 和对话页恢复批量返回页面下会话摘要与 loading 关联数据。
- 追加用户消息。
- 创建带首个主分支的助手占位消息。
- 追加当前选中主分支 chunk。
- 把当前选中主分支与助手镜像一起收敛为 `done`、`error` 或 `cancelled`，并写入该分支本次调用的 `durationMs`。
- 编辑用户消息并裁剪其后的依赖消息。
- 按目标消息裁剪其后的全部消息。
- 追加、更新、删除分支。
- 切换当前轮继续对话使用的主分支。
- 读写 loading state。
- 清空单 `promptTab` 会话与 loading。
- 批量清除页面下所有 loading。

## 4. 事务边界与并发约束

- 启动流式时会话创建与 loading 创建必须成对出现。
- 流式完成、取消、错误后必须清理 loading；调度器和恢复器清理时传入 `expectedSessionId`，仓储在同一存储队列内检查归属，避免旧请求删除新请求状态。主请求开始时间更新同样检查会话归属。
- 用户消息重试前先取消该标签的全部活跃会话，并等待流式持久化和清理完成，再创建新一轮。
- 孤儿 loading 恢复只广播已成功持久化的分支终态；任一分支写入或标记删除失败时返回 `failed` 并保留恢复入口，下一次调用继续恢复。
- setup 若在助手占位消息创建后失败，仓储需要支持把该助手消息补偿为 `error`，避免残留 `loading`。
- `failAssistantMessage` / `failAssistantBranch` 只负责收敛终态；Provider 原始错误文本应由实时事件展示，仓储可写入 `errorMessage: null` 避免持久化错误详情。
- `finishAssistantMessage / failAssistantMessage / finishAssistantBranch / failAssistantBranch` 接收 `durationMs: number | null`；未进入模型调用阶段的失败写 `null`，不伪造成 `0`。
- `appendAssistantChunk` 只允许作用于 `loading` 且当前选中分支仍为 `loading` 的助手消息。
- `finishAssistantMessage` 与 `failAssistantMessage` 不允许覆盖已终态助手消息。
- 分支写入不得覆盖其他分支或主消息。
- 会话写入和同步回写共用存储协调器，避免同步覆盖已经保存的流式输出。
- 仓储按 key 缓存已解析记录（`record-cache.ts`）：缓存条目记录读取时的存储修订号，任何写入、删除、整库清空都会推进该 key 的修订号并让条目失效；流式 chunk 落库的热路径因此只做一次校验写入，不再每次 get + parse 整条会话。
- `getConversation / getLoadingState / listPage* / getAll*` 这些纯读方法不进入全局写队列：它们不做读改写，允许读到排队写入之前的快照，但不会再被并行分支的 chunk 写入阻塞。
- 编辑用户消息时，消息更新与后续依赖结果裁剪必须在同一事务序列内完成。
- 主分支切换只允许发生在当前轮之后没有新消息时。
- 助手分支重试前，必须先裁剪该轮之后的全部消息。
- 助手分支重试进入 `loading` 时必须清空旧 `durationMs`，等待本次终态重新写入。

## 5. 上层依赖边界

- `domain/conversation/conversation-state.ts` 集中管理分支状态转换、助手镜像和最近助手摘要；仓储负责读取、事务和持久化，公共接口及存储格式保持不变。
- 每次消息变更都从最新消息列表推导 `lastAssistantState`；修改较早轮次或未选中分支不能把摘要指向较早的助手消息。
- 上层可依赖消息级和分支级接口。
- 上层不能假设持久化结构与 UI DOM 一一对应。
- 导出逻辑从仓储读标准记录，不反查界面。

## 6. 需要验证的点

- `Chat` 与快捷输入标签隔离。
- 主回答 `loading -> 终态` 生命周期正确，且非法状态迁移会被拒绝。
- 当前选中主分支镜像正确。
- 主回答与分支回答并发写入正确。
- 用户消息编辑后后续结果裁剪正确。
- 用户消息重试后重建新一轮助手消息。
- 助手分支重试后只重跑目标分支，并裁剪其后的消息。
- 停止/删除分支局部生效；当目标分支是该助手消息的最后一个分支时，仓储会一并删除整条助手消息，避免空壳记录。
- side panel 重开后 loading 恢复。
- bootstrap 恢复链路中会话摘要、完整消息和 loading 关联正确。
- 清空单 `promptTab` 时不会误删其他标签数据。
