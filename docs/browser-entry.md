# 浏览器入口与安装生命周期

## 1. 模块定位

本文件描述用户如何进入 Think Bot，以及 background 在浏览器入口、首次安装和受限页退化中的职责边界。

术语约定：

- `browserTab`：Chrome 浏览器标签页。
- `promptTab`：side panel 内的 `Chat` 或某个快捷输入标签。

## 2. 入口类型

- 点击扩展图标：
  - 普通网页进入 side panel 工作流。
  - 受限页面退化到 conversations 页面。
- 扩展图标右键菜单：
  - 直接打开 conversations 页面。
- 首次安装：
  - 根据浏览器语言打开对应的快速上手文档。

## 2.1 阶段 3 已落地约束

- side panel 默认入口固定为 `sidepanel.html`，不再使用其他别名路径。
- 浏览器入口测试驱动只允许走 `tests/e2e/helpers` 中的显式 `__E2E_BROWSER_ACTION_CLICK__` 协议，正式命令集合不混入测试指令。
- `sidepanel.html` 支持通过 `tabId` 和 `pageUrl` query 显式恢复上下文，仅用于 E2E 和调试复现，不改变正式按钮点击链路。

## 3. 责任边界

负责：

- 判断当前 `browserTab` 是否可进入 side panel。
- 在用户点击扩展图标时打开 `browserTab` 级 side panel。
- 在 `browserTab` 切换时维护 side panel 自动隐藏且不自动恢复的行为。
- 在受限页提供退化入口。
- 注册并处理扩展图标右键菜单。
- 在首次安装时打开本地化快速上手文档。

不负责：

- 在无用户手势时强行打开 side panel。
- 在入口层执行正文提取或模型请求。
- 让 side panel、settings、conversations 自行判断浏览器入口事件。

## 4. 关键流程

### 4.1 点击扩展图标

1. 用户点击扩展图标。
2. background 读取当前活动 `browserTab` 与 URL。
3. 若页面可注入，则先通过 `sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` 让浏览器接管扩展图标点击打开行为，再为当前 `browserTab` 调用 `sidePanel.setOptions({ tabId: browserTabId, path, enabled: true })`。
4. side panel 完成挂载后主动发起 `GET_SIDEBAR_BOOTSTRAP`。
5. background 返回当前页面缓存、会话恢复数据、loading 状态、黑名单判定结果和是否需要继续提取的初始化摘要。
6. side panel 先渲染恢复态；若命中黑名单，则只展示确认层，不直接执行提取和自动触发。
7. 用户确认继续后，side panel 再发起 `CONFIRM_BLACKLIST_CONTINUE`，随后进入提取和自动触发流程。

### 4.2 切换浏览器标签页

1. 用户在 `browserTab A` 已打开 side panel 时切换到 `browserTab B`。
2. 若 `browserTab B` 未启用 side panel，浏览器自动隐藏 side panel。
3. background 在监听到 `browserTab` 切换后，清理 `browserTab A` 的 side panel 启用态，避免用户切回时自动恢复。
4. 用户切回 `browserTab A` 时，side panel 保持隐藏。
5. 用户再次点击扩展图标后，才重新打开 `browserTab A` 的 side panel。

### 4.3 受限页面退化

1. 用户点击扩展图标。
2. background 判断当前页面为 Chrome 内部页、扩展页或其他不可注入页面。
3. 不尝试执行脚本注入。
4. 直接打开 conversations 页面，并在需要时带上受限页提示。

### 4.4 扩展图标右键菜单

1. 扩展安装完成后注册上下文菜单。
2. 用户点击菜单中的 `Conversations` 入口。
3. background 直接打开 conversations 页面。
4. 该路径不依赖当前网页是否可注入。

### 4.5 首次安装

1. 扩展首次安装完成。
2. background 读取浏览器语言。
3. 选择中文或英文快速上手文档。
4. 在新标签页打开对应文档。

## 5. 数据与状态

- 浏览器运行态输入：
  - 当前活动 `browserTab`
  - 当前 `browserTab` URL
  - 浏览器语言
- 持久化依赖：
  - 无强依赖业务数据
- 下游协作：
  - `flow.md`
  - `Workspace/sidebar.md`
  - `Workspace/conversations.md`

## 6. 约束与禁止事项

- `sidePanel.open()` 需要用户手势；扩展图标链路优先使用 `openPanelOnActionClick`，不要在异步消息或 `await` 之后手动调用。
- side panel 必须按 `browserTab` 维度启用，不能退化成全局 panel。
- `browserTab` 切换后 side panel 只允许自动隐藏，不允许切回原 `browserTab` 时自动恢复。
- 右键菜单入口只能打开 conversations，不能隐式进入 side panel。
- 首次安装只负责打开快速上手文档，不预热页面提取和模型调用。
- 受限页判断失败不能降级为“先尝试注入，失败再说”。
- side panel 首屏初始化必须由 side panel 主动拉取 bootstrap，background 不主动推送首屏命令。
- 黑名单未放行前，不能开始提取或自动触发。
- side panel 再次打开时，有缓存不重复提取；已有会话或 loading 的 `promptTab` 不重复自动触发。

## 7. 测试要求

- 职责测试：点击扩展图标、`browserTab` 切换、右键菜单、首次安装。
- 边界测试：普通页、受限页、无活动 `browserTab`。
- 错误流测试：页面打开失败、上下文菜单未注册。
- 不变量测试：右键菜单不依赖当前页面可注入性；首次安装按语言选择文档；切回原 `browserTab` 不自动恢复 side panel。

## 8. 相关文档

- `Platform/chrome-mv3-runtime.md`
- `flow.md`
- `test/browser-automation.md`
