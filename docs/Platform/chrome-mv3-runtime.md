# Chrome MV3 运行时约束

## 1. 平台定位

本文件描述 Think Bot 重开发必须遵守的 Chrome MV3 运行时事实、权限边界和限制条件。

术语约定：

- `browserTab`：Chrome 浏览器标签页。
- `promptTab`：side panel 或 conversations 中的 `Chat` / 快捷输入标签。

## 2. 运行单元限制

### 2.1 Side Panel

- `sidePanel.open()` 需要用户手势。
- 扩展图标点击打开 side panel 时，优先使用 `sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`，不要在异步链路里手动补一次 `open()`。
- side panel 是 extension page，可访问 Chrome API。
- side panel 默认存在全局 panel 和 `browserTab` 级 panel 两种语义，业务侧必须显式使用 `browserTab` 级 panel。
- 切换到未启用 side panel 的 `browserTab` 时，浏览器会自动隐藏 side panel。
- Chrome 官方默认行为是切回已打开过的 `browserTab` 时 side panel 会自动再次显示；产品若要求“不自动展示”，必须在 `browserTab` 切换后主动清理上一 `browserTab` 的启用态。
- 上一条清理不能只依赖 service worker 全局变量；`browserTab` 启用集合需要放在 `chrome.storage.session` 这类可跨 worker 休眠恢复的运行态存储里，才能在 worker 重启后继续做旧 tab 清理，同时还要为当前活动页重新预配置 side panel，避免下一次点击退化成双击打开。
- side panel 首屏初始化更安全的方式是“挂载后主动拉取 bootstrap”；不要依赖 `sidePanel.open()` 或浏览器原生打开之后由 background 立即推送初始化消息。

### 2.2 Content Script

- 运行在 isolated world。
- 只能使用受限 Chrome 扩展能力。
- 与页面脚本的桥接需显式注入或 DOM 通道。
- 不直接持有模型 API Key、同步凭证和远端写入能力。
- 阶段 3 的内容采集固定暴露 `COLLECT_PAGE_SOURCE`，返回 `url / title / html / text / faviconUrl`。

### 2.3 Service Worker

- 会空闲终止并重新启动。
- 不能依赖全局变量保存关键业务状态。
- 适合作为权限调度中心，不适合作为持久内存。
- 对必须跨休眠恢复的运行态数据，优先使用可恢复存储做辅助清理，不要把它误当成业务持久化。

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
- `activeTab`：用户显式触发下访问当前 `browserTab`。
- `scripting`：按需执行脚本或注入桥接。
- `downloads`：导出 Markdown 与配置文件。
- `storage`：本地持久化。

阶段 3 额外约束：

- `host_permissions` 需要覆盖 `http://*/*`、`https://*/*` 和 `https://r.jina.ai/*`，否则网页采集和 Jina 回退都不稳定。
- 当 `tabs.sendMessage` 未连上 content script 时，background 可以先按需注入 content script，再走一次自动刷新重连。

权限约束：

- 自动提取只允许发生在 side panel 已打开后的初始化流程中。
- 不能把“打开 `browserTab`”理解成“任意网页标签页一创建就后台自动提取”。
- `promptTab` 自动触发去重必须依赖持久化状态，不能只依赖 UI 内存。
- 黑名单命中时，提取与自动触发必须等待当前打开行为被显式放行后才能开始。

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
- `browserTab` 切换后 side panel 自动隐藏，切回原 `browserTab` 不自动展示，但下一次点击应可直接打开。
- 受限页不能尝试注入脚本。
- service worker 重启后 loading 恢复正确。
- host permissions 缺失时错误可诊断。

## 9. 相关文档

- `Services/runtime-messaging.md`
- `flow.md`
- `test/browser-automation.md`
