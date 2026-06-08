# 同步服务

## 1. 模块定位

同步服务负责把本地配置、页面、会话和页面级墓碑聚合成完整快照，并在 Gist / WebDAV 上执行“先读取远端、再对象级合并、回写本地、最后推送远端”的手动同步闭环，同时支持连接测试和最近同步时间回写。

## 2. 核心抽象

- `SyncConfig`
- `SyncSnapshot`
- `SyncProvider`

## 3. 能力边界

负责：

- 测试连接。
- 读取远端快照。
- 导出本地完整快照。
- 按 `updatedAt` 合并配置、页面主字段和会话。
- 按方法缓存自身 `updatedAt` 合并 `PageRecord.extractionCaches`。
- 先应用页面级 tombstone，再过滤页面与会话。
- 把合并结果回写本地稳定存储。
- 推送合并后的远端快照。
- 写入最近同步时间。

不负责：

- 直接修改 UI 表单。
- 兼容旧同步格式。
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
- 先构建本地 `SyncSnapshot`。
- 再读取远端 `SyncSnapshot`。
- 按对象时间合并配置 / 页面主字段 / 会话，并以 tombstone 为优先删除语义。
- 页面合并后再按 `readability / jina` 分别合并正文缓存，并重建当前正文镜像。
- 把合并结果回写本地 `config / pages / conversations / syncState`。
- 重新基于本地稳定视图生成新快照并推送远端。
- 成功后更新 `lastSyncAt`。

## 6. 错误与异常处理

- 认证失败：
  - 返回明确错误，不修改本地有效数据。
- 远端读取失败：
  - 直接失败，不覆盖本地有效数据。
- 远端格式非法：
  - 直接失败，不尝试“猜格式”或自动修复。
- 远端写入失败：
  - 保留本地状态和最近一次成功同步时间。
- 连接测试失败：
  - 只返回错误，不写入本地配置。

## 7. 数据与状态

- 读：
  - 配置
  - 页面
  - 会话
  - 页面级 tombstone
- 写：
  - `config`
  - `PageRecord`
  - `ConversationRecord`
  - `SyncState`
  - `lastSyncAt`
- 不同步：
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
- 墓碑判断必须先于页面和会话可见性判断，防止已删页面被旧快照复活。
- 页面墓碑只比较 `PageRecord.updatedAt`，不能因为某个方法缓存的 `updatedAt` 较新而复活已删除页面。
- 同步链路只改稳定数据，不同步 `LoadingStateRecord`、页面运行态以外的短时状态。

## 10. 测试要求

- 职责测试：连接测试、同步成功、更新时间展示。
- 职责测试：配置 / 页面主字段 / 会话按 `updatedAt` 合并，页面方法缓存按各自 `updatedAt` 合并。
- 边界测试：未启用同步、未选择 provider、缺少 provider 必填凭据。
- 错误流测试：鉴权失败、网络失败、远端不可读、远端格式非法。
- 竞争态测试：本地删远端改、本地改远端删。
- 异常流测试：service worker 启动后再注入测试 provider，命令执行仍命中最新 provider。
- 不变量测试：失败不会覆盖最近一次成功同步时间。

## 11. 相关文档

- `DataSchema/sync-snapshot.md`
- `test/sync-and-delete.md`
