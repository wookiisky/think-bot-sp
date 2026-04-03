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
- 创建助手占位消息。
- 追加主回答 chunk。
- 把主回答收敛为 `done`、`error` 或 `cancelled`。
- 编辑用户消息并裁剪其后的依赖消息。
- 追加、更新、删除分支。
- 读写 loading state。
- 清空单 `promptTab` 会话。
- 批量清除页面下所有 loading。

## 4. 事务边界与并发约束

- 启动流式时会话创建与 loading 创建必须成对出现。
- 流式完成、取消、错误后必须清理 loading。
- setup 若在助手占位消息创建后失败，仓储需要支持把该助手消息补偿为 `error`，避免残留 `loading`。
- `appendAssistantChunk` 只允许作用于 `loading` 助手消息。
- `finishAssistantMessage` 与 `failAssistantMessage` 不允许覆盖已终态助手消息。
- 分支写入不得覆盖其他分支或主消息。
- 编辑用户消息时，消息更新与后续依赖结果裁剪必须在同一事务序列内完成。

## 5. 上层依赖边界

- 上层可依赖消息级和分支级接口。
- 上层不能假设持久化结构与 UI DOM 一一对应。
- 导出逻辑从仓储读标准记录，不反查界面。

## 6. 需要验证的点

- `Chat` 与快捷输入标签隔离。
- 主回答 `loading -> 终态` 生命周期正确，且非法状态迁移会被拒绝。
- 主回答与分支回答并发写入正确。
- 用户消息编辑后后续结果裁剪正确。
- 停止/删除分支局部生效。
- side panel 重开后 loading 恢复。
- bootstrap 恢复链路中会话摘要、完整消息和 loading 关联正确。
