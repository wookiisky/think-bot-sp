# 加载状态数据域

## 1. 数据域概述

- 名称：`LoadingStateRecord`
- 存储类型：`chrome.storage.local`
- 业务意义：保存 `promptTab` 级和 branch 级 loading 恢复数据，支撑 side panel 重开后的 UI 恢复。
- 所属模块：模型调度、侧边栏、对话管理页。
- 上下游依赖：
  - 上游：LLM Dispatch、取消请求。
  - 下游：UI 恢复、停止操作、状态回收。

## 2. 字段定义

- `id`
  - 类型：`string`
  - 必填：是
  - 含义：`{normalizedUrl}:{promptTabId}`
- `normalizedUrl`
- `promptTabId`
- `sessionId`
  - 类型：`string`
  - 含义：一次发送请求的唯一会话。
- `promptTabStatus`
  - 类型：`'idle' | 'loading' | 'cancelled' | 'error'`
- `branchStates`
  - 类型：`Array<{ branchId, status, modelId }>`
  - 含义：分支级 loading、取消、错误恢复状态。
- `resumeTarget`
  - 类型：`{ messageId, branchId? } | null`
- `cancelRequested`
  - 类型：`boolean`
- `updatedAt`

## 3. 索引与限制

- 主 key：`loading:{normalizedUrl}:{promptTabId}`
- 一个 `promptTab` 同一时刻只允许一个主 session。
- `branchId` 在同一 `sessionId` 下唯一。
- 完成、取消、错误后必须清理或归档为可恢复终态，不能长期残留 loading。

## 4. 读写路径

- 谁读：
  - side panel
  - conversations page
  - background
- 谁写：
  - 仅 background 的流式调度层。
- 典型查询：
  - 批量获取某页面全部 `promptTab` loading。
  - 获取单个 `promptTab` loading。
- 典型更新：
- 开始请求时创建。
- 分支状态变化时增量更新。
- 取消时设置 `cancelRequested`。
- 停止单个分支时只更新目标 `branchStates`，不能影响同一 `sessionId` 下其他分支。
- 结束时清理。

## 5. 生命周期与风险

- 发送前创建。
- 流式期间持续更新。
- 结束后立刻回收。
- 风险：
  - service worker 重启导致内存状态丢失。
  - side panel 关闭期间状态未落盘，导致恢复失败。

## 6. 测试要求

- 主会话与分支 loading 恢复测试。
- side panel 重开恢复测试。
- 取消请求清理测试。
- 单分支停止与删除恢复测试。
- 分支错误回收测试。
- 多 `promptTab` 并发 loading 隔离测试。
