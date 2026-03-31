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
- 按需回退到 Jina。
- 更新页面记录中的内容、方法和时间戳。

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

- 初始化时优先读取缓存。
- 需要新提取时先尝试 Readability。
- Readability 失败且允许回退时再调用 Jina。
- 成功后写入 `PageRecord`。
- content script 未连接时，background 先自动刷新当前页面一次并重试注入；只有自动恢复失败后才把错误抛给 UI。

## 6. 错误与异常处理

- content script 未连接：
  - 先执行一次自动刷新重试。
  - 自动刷新后仍失败时返回连接错误并允许上层手动重试。
- HTML 为空：
  - 直接失败，不发送空内容到 Jina。
- Jina 失败：
  - 保留旧缓存并上报错误。

## 7. 数据与状态

- 读：
  - `PageRecord`
  - `ExtensionConfig.basic.extraction`
- 写：
  - `PageRecord.content`
  - `PageRecord.extractionMethod`
  - `PageRecord.updatedAt`

## 8. 依赖与协作模块

- `Services/runtime-messaging.md`
- `dao/page-repository.md`
- content script DOM 采集逻辑

## 9. 约束与禁止事项

- 不在 content script 发起跨域 Jina 请求。
- 不因一次提取失败清空已有有效缓存。
- 不把提取方法做成全局共享状态。

## 10. 测试要求

- 职责测试：Readability 提取、Jina 回退、方法切换。
- 边界测试：空正文、极短正文、复杂 DOM。
- 错误流测试：content script 未连接、Jina 失败。
- 异常流测试：自动刷新重试、手动重试提取、切换方法后刷新。
- 不变量测试：页面级状态不串页。

## 11. 相关文档

- `flow.md`
- `test/sidebar-core.md`
