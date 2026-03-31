# 黑名单服务

## 1. 模块定位

黑名单服务负责在侧边栏打开前或页面初始化时判断当前 URL 是否应阻断自动工作流，并把结果转成用户确认流程。

## 2. 核心抽象

- `BlacklistRule`
- `BlacklistMatchResult`
- `BlacklistDecision`

## 3. 能力边界

负责：

- 读取黑名单规则。
- 对 URL 做匹配。
- 生成确认层输入。

不负责：

- 渲染确认层 UI。
- 修改页面提取内容。

## 4. 对外接口

- `checkUrl(url)`
- `testPattern(pattern, url)`
- `resetDefaults()`

## 5. 关键流程

- side panel 初始化前匹配 URL。
- 命中则发送 `BLACKLIST_DETECTED`。
- 用户确认继续后才放行后续流程。

## 6. 错误与异常处理

- 规则非法时，保存阶段阻断，不把错误带到运行时。
- 匹配异常时，默认视为不通过并记录错误。

## 7. 数据与状态

- 读：
  - `ExtensionConfig.blacklist`
- 写：
  - 无运行时写入；默认规则恢复通过配置服务执行。

## 8. 依赖与协作模块

- `dao/config-repository.md`
- `Workspace/sidebar.md`

## 9. 约束与禁止事项

- 命中黑名单时不能直接开始提取或自动触发。
- 默认规则恢复不能覆盖用户新增规则。

## 10. 测试要求

- 职责测试：命中拦截、确认放行。
- 边界测试：正则边界、搜索页默认规则。
- 错误流测试：非法规则保存失败。
- 不变量测试：当前确认结果只作用于当前打开行为。

## 11. 相关文档

- `flow.md`
- `test/sidebar-core.md`
