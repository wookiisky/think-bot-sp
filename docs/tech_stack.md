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

## 2. UI 与交互库

- `shadcn/ui`
  - 统一按钮、弹层、表单、选择器、分隔面板等基础交互。
- `Tailwind CSS`
  - 原子化样式体系。
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

## 8. 权限与平台能力

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

## 9. 禁止事项

- 不引入 IndexedDB 作为主存储。
- 不引入重量级国际化框架。
- 不使用在线字体或在线图标资源。
- 不在 UI 直接写各 Provider SDK 调用。
