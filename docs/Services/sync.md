# 同步服务

## 1. 模块定位

同步服务负责把新的本地数据结构序列化为统一快照并同步到 Gist 或 WebDAV，同时维持软删除语义。

## 2. 核心抽象

- `SyncConfig`
- `SyncSnapshot`
- `SyncProvider`
- `TombstoneRecord`

## 3. 能力边界

负责：

- 测试连接。
- 导出快照。
- 推送和拉取远端快照。
- 写入最近同步时间。
- 维护软删除墓碑。

不负责：

- 直接修改 UI 表单。
- 兼容旧同步格式。

## 4. 对外接口

- `testConnection(config)`
- `syncNow()`
- `exportSnapshot()`
- `recordPageDelete(normalizedUrl)`

Provider：

- Gist
- WebDAV

## 5. 关键流程

- 设置页保存同步配置。
- 用户执行测试连接。
- 保存并同步时读取全量本地数据。
- 构建 `SyncSnapshot`。
- 先用远端快照与本地快照做一次按对象粒度的合并。
- 推送远端。
- 成功后更新 `lastSyncAt`。

合并顺序：

1. 校验远端快照结构和 `schemaVersion`。
2. 合并本地与远端页面墓碑，取每个 `normalizedUrl` 下较新的 `deletedAt`。
3. 按 `ExtensionConfig.updatedAt` 决定配置胜负。
4. 按 `PageRecord.updatedAt` 合并页面，但晚于墓碑的删除优先生效。
5. 按 `ConversationRecord.updatedAt` 合并会话，但其父页面若被墓碑覆盖则整条会话丢弃。
6. 生成新的本地逻辑视图并回写本地，再推送远端整份快照。

## 6. 错误与异常处理

- 认证失败：
  - 返回明确错误，不修改本地有效数据。
- 远端写入失败：
  - 保留本地状态和墓碑。
- 远端格式非法：
  - 拒绝导入，不污染本地数据。
- 本地与远端同时修改：
  - 按对象级 `updatedAt / deletedAt` 决定胜负，不允许整份快照直接覆盖。

## 7. 数据与状态

- 读：
  - 配置、页面、会话、墓碑
- 写：
  - `lastSyncAt`
  - `tombstones`
- 不同步：
  - `LoadingStateRecord`

## 8. 依赖与协作模块

- `dao/sync-repository.md`
- `dao/config-repository.md`
- `octokit`
- `webdav`

## 9. 约束与禁止事项

- 不兼容旧远端格式。
- 不在 UI 层直接发 Gist/WebDAV 请求。
- 删除在同步开启时必须先写墓碑再做本地过滤。
- 配置、页面、会话必须按对象粒度合并，不允许只按 `snapshotVersion` 判定整包覆盖。

## 10. 测试要求

- 职责测试：连接测试、同步成功、更新时间展示。
- 边界测试：空数据同步、大数据同步。
- 错误流测试：鉴权失败、网络失败、非法快照。
- 异常流测试：同步过程中删除页面。
- 不变量测试：软删除不被远端复活。
- 冲突测试：本地改配置、远端改会话时两边都保留最新结果。

## 11. 相关文档

- `DataSchema/sync-snapshot.md`
- `test/sync-and-delete.md`
