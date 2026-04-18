# 技术选型

## 1. 语言、框架、运行时

- 浏览器平台：Chrome Extensions Manifest V3
- 构建框架：WXT
- UI 框架：React 18
- 语言：TypeScript Strict Mode
- 构建工具：Vite
- 包管理：pnpm
- Node.js：LTS 版本线，默认按 20+ 执行

兼容约束：

- 所有实现以 MV3 service worker 和 extension page 语义为准。
- 不依赖 Firefox 专属 WebExtension 行为。
- 不设计需要常驻后台内存的能力。
- side panel 首屏初始化按“挂载后主动拉取 bootstrap”设计，不依赖 background 主动推送首屏消息。

开发约束：

- 本项目默认通过 `wxt.config.ts` 关闭 WXT 自动拉起浏览器，避免 Chromium 调试连接异常直接中断 `pnpm dev`。
- 本项目在 dev server 上显式开启轮询监听，处理当前环境下文件事件监听不稳定的问题；代价是开发时会多一点 CPU 占用。
- WXT 开发态的扩展页既要通过本地 websocket 做热更新，也要继续允许 background 发真实模型、同步和 Jina 请求；因此开发态 `connect-src` 不能只收窄到 localhost，而要至少覆盖 `http: https: ws: wss:`，否则会出现 side panel 能打开、但远端模型请求被 CSP 拦截的假修复。
- 本地开发时先执行 `pnpm dev`，再到 `chrome://extensions` 手动以“加载已解压的扩展程序”方式加载 `.output/chrome-mv3-dev`。
- 代码变更后由 WXT 持续 watch 并重建产物，不依赖自动打开临时浏览器 profile。

## 2. UI 与交互库

- `shadcn/ui`
  - 统一按钮、弹层、表单、选择器、分隔面板等基础交互。
  - 当前项目已使用 `preset b3F5SdK3Xe` 建立基线，组件目录固定为 `src/components/ui`。
- `Tailwind CSS`
  - 原子化样式体系。
  - 当前项目基于 Tailwind CSS v4，统一通过 `@tailwindcss/vite` 与 `assets/styles/globals.css` 接入。
- `@dnd-kit`
  - 模型与快捷输入排序。
- `@tanstack/react-virtual`
  - 历史页面高密度列表虚拟化。
- `react-markdown + remark-gfm + rehype-sanitize`
  - 助手消息、分支预览、导出预览的 Markdown 渲染。

## 3. 状态、表单、校验

- `zustand`
  - 页面运行态、UI 派生状态、局部缓存。
- `react-hook-form`
  - 设置页复杂表单。
- `zod`
  - Provider 配置、快捷输入、同步配置、黑名单、导入结构校验。

约束：

- side panel bootstrap、黑名单放行、导出请求、同步快照都必须走稳定 schema 校验。

## 4. 模型调用与文本处理

- `ai`（Vercel AI SDK Core）
  - 统一文本生成、流式输出、Provider 适配。
- `@ai-sdk/openai`
- `@ai-sdk/openai-compatible`
- `@ai-sdk/google`
- `@ai-sdk/anthropic`

选型原因：

- 统一 stream 和 non-stream 接口。
- 减少 UI 对各 Provider 差异字段的理解负担。
- 便于后续通过 provider registry 扩展新模型。
- 便于把“自动触发请求级强制带入页面内容”收口在调度层，而不是散落到 UI 状态中。

## 5. 内容提取与资源

- `@mozilla/readability`
  - 本地正文提取默认实现。
- Jina Reader HTTP 接口
  - 远端兜底提取。
- `yaml`
  - 加载中英文 `key: 文本` 语言资源。
- Material Symbols Outlined 本地资源
  - 通过本地字体文件或 subset 资源提供图标。

## 6. 同步与网络

- `octokit`
  - Gist API 访问。
- `webdav`
  - WebDAV 读写。

要求：

- 所有远端请求都在 extension context 中执行。
- Content script 不直接请求模型、Jina、Gist、WebDAV。

## 7. 测试与验证

- `Vitest`
  - 纯函数、仓储、协议、转换器单元测试。
- `React Testing Library`
  - 组件与交互测试。
- `Playwright`
  - MV3 扩展端到端自动化。

测试基线要求：

- 自动化用例必须覆盖 side panel 两阶段 bootstrap、黑名单先确认后提取、`browserTab` 切换后不自动恢复、空导出失败。

## 8. 调试与可观测性

- 运行时结构化 `console`
  - 用于记录关键流程 debug 日志。

约束：

- 不引入第三方日志平台或远端上报链路。
- 不持久化调试日志。
- 调试日志只保留最小必要上下文，并遵守敏感字段脱敏规则。

## 9. 权限与平台能力

Manifest 权限基线：

- `storage`
- `sidePanel`
- `scripting`
- `activeTab`
- `downloads`
- `contextMenus`
- `unlimitedStorage`

按功能添加的可选权限：

- 与同步、Jina、模型 Provider 对应的 `host_permissions`

## 10. 禁止事项

- 不引入 IndexedDB 作为主存储。
- 不引入重量级国际化框架。
- 不使用在线字体或在线图标资源。
- 不在 UI 直接写各 Provider SDK 调用。
- 不把调试日志做成持久化历史功能。
- 不把黑名单放行、loading、首屏 bootstrap 结果这类短时运行态混入同步快照。
