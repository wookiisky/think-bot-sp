# 同步服务

## 1. 模块定位

同步服务负责把当前配置序列化为最小快照并手动推送到 Gist 或 WebDAV，同时支持连接测试和最近同步时间回写。

## 2. 核心抽象

- `SyncConfig`
- `SyncSnapshot`
- `SyncProvider`

## 3. 能力边界

负责：

- 测试连接。
- 导出配置快照。
- 推送远端快照。
- 写入最近同步时间。

不负责：

- 直接修改 UI 表单。
- 兼容旧同步格式。
- 拉取远端快照。
- 合并页面、会话和墓碑。
- 自动同步。

## 4. 对外接口

- `testConnection(config)`
- `syncNow(config)`

Provider：

- Gist
- WebDAV

## 5. 关键流程

- 设置页编辑同步配置。
- 用户执行测试连接。
- 用户手动点击“立即同步”。
- 构建 `SyncSnapshot`。
- 推送远端。
- 成功后更新 `lastSyncAt`。
- 当前 `SyncSnapshot` 只包含 `schemaVersion / exportedAt / config`。

## 6. 错误与异常处理

- 认证失败：
  - 返回明确错误，不修改本地有效数据。
- 远端写入失败：
  - 保留本地状态和最近一次成功同步时间。
- 连接测试失败：
  - 只返回错误，不写入本地配置。
- 当前阶段不支持远端拉取，因此不存在导入和合并失败后的本地污染问题。

## 7. 数据与状态

- 读：
  - 配置
- 写：
  - `lastSyncAt`
- 不同步：
  - 页面缓存
  - 会话
  - `LoadingStateRecord`

## 8. 依赖与协作模块

- `dao/sync-repository.md`
- `dao/config-repository.md`
- `fetch`

## 9. 约束与禁止事项

- 不兼容旧远端格式。
- 不在 UI 层直接发 Gist/WebDAV 请求。
- `testConnection` 不能隐式保存配置。
- `syncNow` 必须先由配置仓储持久化，再执行远端写入。
- 当前阶段不允许把“配置快照手动推送”表述成“全量数据同步”。

## 10. 测试要求

- 职责测试：连接测试、同步成功、更新时间展示。
- 边界测试：未启用同步、未选择 provider、缺少 provider 必填凭据。
- 错误流测试：鉴权失败、网络失败。
- 异常流测试：service worker 启动后再注入测试 provider，命令执行仍命中最新 provider。
- 不变量测试：失败不会覆盖最近一次成功同步时间。

## 11. 相关文档

- `DataSchema/sync-snapshot.md`
- `test/sync-and-delete.md`
