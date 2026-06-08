# 页面提取服务

## 1. 模块定位

页面提取服务负责把当前网页转成可供对话引用的正文文本，并维护提取方法状态。

## 2. 核心抽象

- `ExtractionRequest`
- `ExtractionResult`
- `ExtractionMethod`
- `PageSourcePayload`

## 3. 能力边界

负责：

- 通过 content script 获取 HTML 和页面元数据。
- 使用 Readability 提取正文。
- 使用 Jina 提取正文。
- 消费基础设置中的 Jina API Key、Jina 响应模板和默认提取方法。
- 更新页面记录中对应方法的正文缓存、当前正文镜像、方法和时间戳。

不负责：

- 决定 side panel 是否打开。
- 决定是否把页面内容附加到 LLM 上下文。
- 持有 UI 运行态。

## 4. 对外接口

- `extractPage(request)`
- `switchMethod(request)`
- `reExtract(request)`

输出包含：

- `content`
- `method`
- `metadata`
- `status`
- `error`

## 5. 关键流程

- 初始化时优先读取当前方法缓存。
- 切换提取方法只读取对应方法缓存，不触发新提取。
- 手动重新提取时只刷新当前方法缓存。
- Readability 失败时直接失败并保留旧 Readability 缓存，不回退 Jina。
- 调用 Jina 时会带上用户配置的可选 API Key。
- Jina 返回正文后会按 `jinaResponseTemplate` 生成最终文本：
  - 模板包含 `{{content}}` 时做占位替换。
  - 模板不包含 `{{content}}` 时把原始正文追加到模板尾部。
- 成功后写入 `PageRecord`。
- content script 未连接时，background 先尝试按需注入 `content-scripts/content.js`，仍未连上时再自动刷新当前页面并有限次重试；只有自动恢复失败后才把错误抛给 UI。

## 6. 错误与异常处理

- content script 未连接：
  - 先尝试一次按需注入 content script。
  - 注入后仍不可用，再执行一次自动刷新重试。
  - 自动刷新后仍失败时返回连接错误并允许上层手动重试。
- HTML 为空：
  - 直接失败，不发送空内容到 Jina。
- Readability 失败：
  - 保留旧 Readability 缓存并上报错误。
- Jina 失败：
  - 保留旧缓存并上报错误。
- Jina 模板为空：
  - 退化为直接使用原始 Reader 响应。

## 7. 数据与状态

- 读：
  - `PageRecord`
  - `ExtensionConfig.basic.extractionMethod`
  - `ExtensionConfig.basic.jinaApiKey`
  - `ExtensionConfig.basic.jinaResponseTemplate`
- 写：
  - `PageRecord.content`
  - `PageRecord.extractionMethod`
  - `PageRecord.extractionCaches`
  - `PageRecord.updatedAt`

## 8. 依赖与协作模块

- `Services/runtime-messaging.md`
- `dao/page-repository.md`
- content script DOM 采集逻辑

## 9. 约束与禁止事项

- 不在 content script 发起跨域 Jina 请求。
- 不因一次提取失败清空已有有效缓存。
- 不把提取方法做成全局共享状态。
- 不在提取服务里持久化提取区高度或文本字号；这些值只作为 UI 默认状态由设置配置消费。
- `GET_SIDEBAR_BOOTSTRAP` 不触发提取，提取只由 `RE_EXTRACT_CONTENT` 显式启动。

## 10. 测试要求

- 职责测试：Readability 提取、Readability 失败不回退、Jina 提取、方法切换读缓存、Jina API Key 与响应模板生效。
- 边界测试：空正文、极短正文、复杂 DOM。
- 错误流测试：content script 未连接、Jina 失败。
- 异常流测试：自动刷新重试、手动重试提取、切换方法后刷新。
- 不变量测试：页面级状态不串页。

## 11. 相关文档

- `flow.md`
- `test/sidebar-core.md`
