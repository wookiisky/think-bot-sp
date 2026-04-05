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
- 在保存前校验正则规则是否合法。
- 为设置页提供单条规则测试能力。
- 在恢复默认时只重建系统内置规则。
- 生成确认层输入。

不负责：

- 渲染确认层 UI。
- 修改页面提取内容。

## 4. 对外接口

- `checkUrl(url)`
- `testPattern(rule, url)`
- `resetDefaults()`

## 5. 关键流程

- side panel 初始化前匹配 URL。
- side panel bootstrap 阶段完成 URL 匹配并返回阻断结果。
- 命中则发送 `BLACKLIST_DETECTED` 或在 bootstrap 结果中标记 `blocked`。
- 用户确认继续并发送 `CONFIRM_BLACKLIST_CONTINUE` 后才放行后续流程。
- 放行令牌只保存在当前 service worker 内存中，按 `browserTab + normalizedUrl` 组合键隔离。
- 默认规则当前覆盖 Google / Bing / 百度搜索结果页，命中后默认阻断。

## 6. 错误与异常处理

- 规则非法时，保存阶段阻断，不把错误带到运行时。
- 匹配异常时，运行时默认视为阻断并记录错误，避免非法正则把页面误放行。
- 设置页测试规则时，如果测试 URL 非法或正则无效，直接返回错误文案，不写入持久化配置。

## 7. 数据与状态

- 读：
  - `ExtensionConfig.blacklist`
- 写：
- 无运行时写入；默认规则恢复通过配置服务执行。
- 系统内置规则使用稳定 id 管理，旧配置读取时按“补缺不覆盖”补种。

## 8. 依赖与协作模块

- `dao/config-repository.md`
- `Workspace/sidebar.md`

## 9. 约束与禁止事项

- 命中黑名单时不能直接开始提取或自动触发。
- 默认规则恢复不能覆盖用户新增规则。
- 域名规则必须按“精确域名或子域名”匹配，不能用字符串 `includes` 误伤。
- 黑名单放行不能写入持久化存储，也不能跨 `browserTab` 复用。

## 10. 测试要求

- 职责测试：命中拦截、确认放行、单条规则测试、恢复默认。
- 边界测试：正则边界、搜索页默认规则、子域名匹配。
- 错误流测试：非法规则保存失败、非法测试 URL。
- 不变量测试：当前确认结果只作用于当前打开行为。

## 11. 相关文档

- `flow.md`
- `test/sidebar-core.md`
