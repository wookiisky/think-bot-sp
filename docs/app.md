# 项目总览

## 1. 项目目标

Think Bot 是一个面向深度阅读与网页认知处理的 Chrome MV3 扩展。重开发目标不是做能力裁剪，而是在保持现有产品闭环不变的前提下，重建为可维护、可测试、可扩展的新架构。

Chrome manifest 展示名称固定为 `Think Bot`，描述固定为 `面向深度阅读与网页认知处理的 Chrome 扩展。`；浏览器 action tooltip 使用同一展示名称。

当前必须保留的核心能力：

- 根据浏览器入口正确打开 side panel、conversations 和快速上手文档。
- 在普通网页打开侧边栏并抽取正文。
- 使用当前页面内容、文本和图片向 LLM 发起对话。
- 通过快捷输入执行模板化分析。
- 并发生成多模型分支回答。
- 按页面维度管理历史页面和历史会话。
- 管理模型、快捷输入、黑名单、语言、主题、同步和配置导入导出。
- 支持 Gist 和 WebDAV 同步。

## 2. 主要运行单元

- `background service worker`
  - 唯一高权限协调层。
  - 负责持久化、远端请求、模型调用、同步、消息路由、删除语义。
- `content scripts`
  - 负责页面 DOM 读取与最小化页面上下文采集。
  - 不持有 API Key，不直接访问远端模型或同步后端。
- `side panel`
  - 当前网页即时工作台。
  - 展示提取内容、快捷输入、聊天、分支、图片、导出。
- `options page`
  - 长期配置中心。
- `conversations page`
  - 历史页面和会话工作台。
  - 右侧工作区沿用侧边栏的阅读与继续对话语义。

## 3. 整体架构

新实现按以下分层组织：

- `domain`
  - 稳定领域类型和规则。
- `repositories`
  - `chrome.storage.local` 的 typed 访问层。
- `services`
  - 提取、调试日志、模型调度、同步、黑名单、国际化、消息通信。
- `features`
  - 以业务能力组合多个服务和 UI 状态。
- `ui`
  - React 组件与页面壳层。
- `shared`
  - 通用工具、校验、常量、格式化。

约束：

- UI 不直接操作原始 `chrome.storage` key。
- UI 不直接拼接 Chrome runtime 消息名。
- Background 不承担页面布局逻辑。
- Content script 不承担业务编排。

## 4. 模块关系

- 侧边栏和对话管理页共享：
  - 聊天消息渲染。
  - 模型选择。
  - 快捷输入标签。
  - 分支消息与预览。
  - 图片发送。
  - 停止与清空交互。
  - 导出。
  - Markdown 渲染规则。
- 设置页独立管理长期配置，但使用相同数据结构和校验规则。
- 浏览器入口与安装生命周期统一由 background 协调，覆盖扩展图标点击、右键菜单和首次安装。
- Background 通过 typed command/port 向三个 extension pages 暴露能力。
- 调试日志只用于运行时排障，不持久化、不参与同步、也不作为恢复依据。
- 同步服务只读写新的版本化快照格式，不兼容旧远端结构。

## 5. 关键运行约束

- 目标平台固定为 Chrome MV3。
- `sidePanel.open()` 需要用户手势，不能任意后台自动打开。
- 扩展图标打开侧边栏优先依赖浏览器原生点击行为；只有真实 `chrome.action.onClicked` 普通页兜底允许调用 `sidePanel.open({ tabId })`。
- 受限页和扩展页必须关闭全局 `openPanelOnActionClick`，点击扩展图标退化到 conversations 或 options。
- service worker 会空闲终止，运行态状态必须可恢复。
- 跨域请求统一在 extension context 内完成。
- 本地持久化统一使用 `chrome.storage.local`，并申请 `unlimitedStorage`。
- 本期以新安装或已清空环境为前提，不兼容旧本地存储和旧同步格式，也不提供迁移。
- 国际化只支持中文和英文，采用平铺 `key: 文本` 配置文件。
- 图标必须本地打包，不依赖 CDN。

## 6. 外部依赖

- LLM Provider：OpenAI Compatible、Azure OpenAI、Google Gemini、Anthropic。
- 内容提取：Readability、本地 DOM；Jina HTTP 接口。
- 同步：Gist、WebDAV。
- 浏览器自动化：Playwright。

## 7. 不能破坏的产品不变量

- 页面维度仍然是历史管理主轴。
- `Chat` 与快捷输入标签的会话必须隔离保存。
- `includePageContent` 是页面级状态，不是全局开关。
- 自动触发去重状态必须按“页面 URL + 标签”持久化，不能只依赖运行时内存。
- side panel 首屏初始化必须先恢复和判定，再进入提取与自动触发。
- 分支回答必须保留模型身份、局部停止、局部删除、局部错误。
- 自动触发快捷输入必须满足“条件满足时执行且避免重复触发”。
- 黑名单放行前不能开始提取或自动触发。
- 删除在同步开启时必须走软删除语义。
- 同步必须按配置、页面、会话对象粒度合并，不能整份快照直接互相覆盖。

## 8. 相关文档

- 运行时限制：`Platform/chrome-mv3-runtime.md`
- 浏览器入口：`browser-entry.md`
- 跨模块流程：`flow.md`
- 数据域：`DataSchema/`
- 测试基线：`test/`
