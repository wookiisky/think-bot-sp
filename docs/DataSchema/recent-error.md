# 最近错误摘要

## 1. 数据域概述

- 名称：`RecentErrorSummary`
- 存储类型：`chrome.storage.local`
- 固定 key：`error:recent`
- 业务意义：保存最近一次来自侧边栏、历史页、同步或设置页自身的结构化错误摘要，供设置页展示。
- 所属模块：设置页、background 运行时消息链路、同步流程。

## 2. 字段定义

- `source`
  - 类型：`"sidebar" | "conversations" | "sync" | "settings"`
  - 必填：是
  - 含义：错误来源模块。
- `operation`
  - 类型：`string`
  - 必填：是
  - 含义：失败操作标识，例如 `SYNC_NOW`、`RE_EXTRACT_CONTENT`。
- `message`
  - 类型：`string`
  - 必填：是
  - 含义：脱敏后的错误摘要。
- `capturedAt`
  - 类型：`number`
  - 必填：是
  - 含义：最后一次覆盖写入的时间戳。

## 3. 约束与限制

- 只保存最近一次错误，不保留历史列表。
- 只保存摘要，不保存完整响应体、请求体或日志明细。
- `message` 写入前必须做最小脱敏：
  - `Bearer xxx` 会替换为 `Bearer [redacted]`
  - `apiKey/token/password` 风格键值会替换成 `[redacted]`
- 设置页只读展示，不直接写该数据域。

## 4. 读写路径

- 谁读：
  - 设置页
- 谁写：
  - background 在关键失败点统一覆盖写入
- 当前覆盖写入点：
  - `RE_EXTRACT_CONTENT`
  - `sidebar.command.failed`
  - `conversations.command.failed`
  - `TEST_SYNC_CONNECTION`
  - `SYNC_NOW`
  - 设置相关命令失败

## 5. 生命周期

- 发生新的关键错误时覆盖旧值。
- 成功流程不会主动清空旧值；设置页只展示最近一次失败摘要。

## 6. 测试要求

- 字段约束测试：来源枚举、时间戳、空消息拒绝。
- 脱敏测试：Bearer、token、password 等敏感字段过滤。
- 读写测试：跨实例写入后读取一致。
- 设置页展示测试：background 写入后设置页可见。
