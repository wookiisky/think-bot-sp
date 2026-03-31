# Chrome MV3 运行时约束

## 1. 平台定位

本文件描述 Think Bot 重开发必须遵守的 Chrome MV3 运行时事实、权限边界和限制条件。

## 2. 运行单元限制

### 2.1 Side Panel

- `sidePanel.open()` 需要用户手势。
- side panel 是 extension page，可访问 Chrome API。
- side panel 打开状态、当前 tab 关联关系由浏览器控制，不可假设长期稳定。

### 2.2 Content Script

- 运行在 isolated world。
- 只能使用受限 Chrome 扩展能力。
- 与页面脚本的桥接需显式注入或 DOM 通道。
- 不直接持有模型 API Key、同步凭证和远端写入能力。

### 2.3 Service Worker

- 会空闲终止并重新启动。
- 不能依赖全局变量保存关键业务状态。
- 适合作为权限调度中心，不适合作为持久内存。

## 3. 网络与跨域限制

- content script 的网络行为仍受页面上下文限制。
- 模型请求、Jina 请求、Gist/WebDAV 同步都必须在 extension context 中执行。
- 远端访问依赖正确的 `host_permissions`。

## 4. 权限边界

必须权限：

- `storage`
- `sidePanel`
- `activeTab`
- `scripting`
- `downloads`
- `contextMenus`
- `unlimitedStorage`

权限用途：

- `sidePanel`：打开和管理侧边栏。
- `activeTab`：用户显式触发下访问当前标签页。
- `scripting`：按需执行脚本或注入桥接。
- `downloads`：导出 Markdown 与配置文件。
- `storage`：本地持久化。

## 5. 通信限制

- 普通 CRUD 用 one-shot message。
- 流式输出必须用 long-lived port。
- 所有来自 content script 的输入都必须做 sender 与参数校验。
- 端口断开不等于任务结束。

## 6. 数据与恢复限制

- loading、恢复锚点、任务元数据必须持久化。
- side panel 或页面关闭后，仍要能在下次打开时恢复状态。
- service worker 重启后要能从持久化层恢复流式会话的可见状态。

## 7. 安全要求

- 不把 API Key 暴露给页面环境。
- 不信任 content script 传入的 URL、HTML、标题和消息参数。
- 对导入配置、同步快照、消息载荷统一做 schema 校验。

## 8. 测试要求

- 侧边栏只能在用户操作链路中打开。
- 受限页不能尝试注入脚本。
- service worker 重启后 loading 恢复正确。
- host permissions 缺失时错误可诊断。

## 9. 相关文档

- `Services/runtime-messaging.md`
- `flow.md`
- `test/browser-automation.md`
