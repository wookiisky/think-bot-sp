# 页面数据域

## 1. 数据域概述

- 名称：`PageRecord`
- 存储类型：`chrome.storage.local`
- 业务意义：保存归一化 URL 对应的页面缓存、元数据、提取内容和页面级状态。
- 所属模块：侧边栏、对话管理页、提取服务。
- 上下游依赖：
  - 上游：content script、提取服务。
  - 下游：侧边栏、历史页、导出。

## 2. 字段定义

- `id`
  - 类型：`string`
  - 必填：是
  - 含义：归一化 URL。
- `url`
  - 类型：`string`
  - 必填：是
  - 含义：原始 URL。
- `normalizedUrl`
  - 类型：`string`
  - 必填：是
  - 含义：用于 key 与关联。
- `title`
  - 类型：`string`
  - 必填：否
  - 含义：页面标题。
- `faviconUrl`
  - 类型：`string`
  - 必填：否
  - 含义：图标地址。
- `content`
  - 类型：`string`
  - 必填：否
  - 含义：当前有效提取正文。
- `extractionMethod`
  - 类型：`'readability' | 'jina'`
  - 必填：是
  - 默认值：`readability`
- `includePageContent`
  - 类型：`boolean`
  - 必填：是
  - 默认值：`true`
- `promptTabStates`
  - 类型：`PromptTabState[]`
  - 必填：是
  - 默认值：空数组
  - 含义：页面下各 `promptTab` 的初始化状态和自动触发状态。
- `createdAt`
  - 类型：`number`
  - 必填：是
- `updatedAt`
  - 类型：`number`
  - 必填：是
- `expiresAt`
  - 类型：`number`
  - 必填：是
  - 含义：90 天缓存清理截止时间。

`PromptTabState` 关键字段：

- `promptTabId`
  - 类型：`string`
- `initializedAt`
  - 类型：`number | null`
- `lastAutoTriggerAt`
  - 类型：`number | null`
- `autoTriggerStatus`
  - 类型：`'idle' | 'queued' | 'running' | 'done' | 'error'`
- `lastClearedAt`
  - 类型：`number | null`

`autoTriggerStatus` 取值：

- `idle`
- `queued`
- `running`
- `done`
- `error`

## 3. 索引与限制

- 主 key：`page:{normalizedUrl}`
- 列表索引来源：页面记录自身，不从聊天反推。
- `normalizedUrl` 唯一。
- 页面记录删除时必须级联清理其会话和 loading 数据。

## 4. 读写路径

- 谁读：
  - side panel
  - conversations page
  - background
- 谁写：
  - 仅 background 的页面服务和标题编辑命令。
- 典型查询：
  - 按最近更新时间获取页面列表。
  - 按标题或 URL 搜索。
- 典型更新：
  - 提取成功后更新内容与方法。
  - 编辑标题。
  - 恢复页面级 `includePageContent`。
  - 更新 `promptTab` 初始化状态与自动触发状态。

## 5. 生命周期与风险

- 打开侧边栏首次提取时创建。
- 提取成功、标题编辑、继续对话时更新 `updatedAt`。
- 90 天未更新则可被清理。
- `promptTab` 首次手动发送或自动触发开始时写入对应 `promptTabStates.initializedAt`。
- 清空当前 `promptTab` 时重置该 `promptTab` 的 `initializedAt / lastAutoTriggerAt / autoTriggerStatus`，并记录 `lastClearedAt`。
- 风险：
  - URL 归一化不一致会导致重复页面。
  - 提取失败覆盖旧内容会导致历史丢失。
  - `promptTab` 初始化状态未持久化会导致 side panel 重开后重复自动触发。

## 6. 测试要求

- URL 归一化测试。
- 页面级状态恢复测试。
- 自动触发初始化状态恢复测试。
- 清空 `promptTab` 后自动触发可再次执行测试。
- 列表排序与搜索测试。
- 过期清理测试。
- 删除页面级联清理测试。
