# 同步快照数据域

## 1. 数据域概述

- 名称：`SyncSnapshot`
- 存储类型：本地 `chrome.storage.local` + 远端 Gist/WebDAV 文件
- 业务意义：保存用于远端同步的版本化快照与墓碑删除信息。
- 所属模块：同步服务、删除语义、设置页同步状态。
- 上下游依赖：
  - 上游：配置、页面、会话、黑名单。
  - 下游：远端推送、拉取合并、软删除过滤。

## 2. 字段定义

- `schemaVersion`
  - 类型：`string`
  - 必填：是
- `snapshotVersion`
  - 类型：`number`
  - 必填：是
  - 含义：同步服务本地生成的单调递增快照版本，仅用于调试和观测，不作为冲突胜负的唯一依据。
- `exportedAt`
  - 类型：`number`
  - 必填：是
- `config`
  - 类型：`ExtensionConfig`
  - 必填：是
- `pages`
  - 类型：`PageRecord[]`
  - 必填：是
- `conversations`
  - 类型：`ConversationRecord[]`
  - 必填：是
- `tombstones`
  - 类型：`Array<{ normalizedUrl, deletedAt }>`
  - 必填：是
- `lastSyncAt`
  - 类型：`number | null`
  - 必填：否

## 3. 索引与限制

- 本地状态 key：`sync:state`
- 当前本地状态最小闭环：
  - `schemaVersion`
  - `snapshotVersion`
  - `tombstones`
  - `lastSyncAt`
- 远端文件固定为单一快照文件，不做旧结构兼容。
- `normalizedUrl` 在墓碑中唯一。
- `LoadingStateRecord` 不进入同步快照。
- 同步开启时删除页面必须写入页面级墓碑。
- `config.sync.lastSyncAt` 与 `SyncSnapshot.lastSyncAt` 都只用于观测最近一次成功同步时间，不参与冲突胜负。

## 4. 读写路径

- 谁读：
  - background sync service
  - 设置页状态显示
- 谁写：
  - 仅 background sync service
- 典型查询：
  - 测试连接
  - 导出快照
  - 读取远端快照
- 典型更新：
  - 合并远端快照后回写本地稳定数据
  - 成功同步后更新 `lastSyncAt`
  - 删除数据时追加墓碑

合并规则：

- 配置：
  - 比较 `ExtensionConfig.updatedAt`
  - 时间更新的一侧整份配置生效
- 页面：
  - 按 `normalizedUrl` 合并
  - 时间更新的一侧覆盖旧页记录
- 会话：
  - 按 `ConversationRecord.id` 合并
  - 时间更新的一侧覆盖旧会话记录
- 删除：
  - 先比较页面墓碑 `deletedAt`
  - 若 `deletedAt >= page.updatedAt`，页面与其全部会话都视为已删除
  - 只有当新的页面记录 `updatedAt > deletedAt` 时，才允许同 URL 页面重新出现
- 最近同步时间：
  - 取本地与远端非空值中的较大者
  - 只在最终推送成功后更新为本次同步时间

## 5. 生命周期与风险

- 同步开启后长期存在。
- 每次同步导出全量快照。
- 风险：
  - 本地和远端时钟差导致删除比较混乱。
  - 墓碑丢失会导致远端数据被错误复活。
  - 没有统一的合并顺序会导致整包快照覆盖较新的局部数据。
  - `LoadingStateRecord` 不参与同步，因此手动同步期间不以它作为冲突依据。

## 6. 测试要求

- 快照导出结构测试。
- Gist/WebDAV 推拉测试。
- 软删除墓碑测试。
- 配置、页面、会话按 `updatedAt` 合并测试。
- 墓碑先于页面和会话应用测试。
- 本地回写后清理孤儿 conversation / loading 测试。
- 同步失败保留本地数据测试。
- 新旧远端结构隔离测试。
