# 设置页开发方案

## 1. 输入依据

- 当前实现现状：[status.md](/Users/air/woo/think-bot-sp/status.md)
- 设置页边界：[docs/Workspace/settings.md](/Users/air/woo/think-bot-sp/docs/Workspace/settings.md)
- 配置数据契约：[docs/DataSchema/config.md](/Users/air/woo/think-bot-sp/docs/DataSchema/config.md)
- 配置仓储职责：[docs/dao/config-repository.md](/Users/air/woo/think-bot-sp/docs/dao/config-repository.md)
- 消息命令边界：[docs/Services/runtime-messaging.md](/Users/air/woo/think-bot-sp/docs/Services/runtime-messaging.md)
- 国际化约束：[docs/Services/i18n.md](/Users/air/woo/think-bot-sp/docs/Services/i18n.md)
- 同步服务边界：[docs/Services/sync.md](/Users/air/woo/think-bot-sp/docs/Services/sync.md)
- 黑名单服务边界（后续阶段参考）：[docs/Services/blacklist.md](/Users/air/woo/think-bot-sp/docs/Services/blacklist.md)
- 图标约束：[docs/Services/icon-assets.md](/Users/air/woo/think-bot-sp/docs/Services/icon-assets.md)
- 回归测试口径：[docs/test/settings-core.md](/Users/air/woo/think-bot-sp/docs/test/settings-core.md)
- 现有历史计划参考：[docs/superpowers/plans/2026-04-04-settings-page-spec-alignment.md](/Users/air/woo/think-bot-sp/docs/superpowers/plans/2026-04-04-settings-page-spec-alignment.md)

## 2. 目标

构建一个与 `/docs` 对齐、且能通过真实 `options -> runtime message -> background -> repository` 链路运行的设置页。

本方案按两段推进：

1. 先补齐 `docs/Workspace/settings.md` 已声明但当前实现未对齐的阶段 2/2.5 能力。
2. 再补齐 `status.md` 中已确认缺失、但 `/docs` 已定义边界的同步能力；黑名单编辑能力暂时不做，后续单列阶段处理。

## 3. 范围

### 3.1 本次方案内

- 设置页页面骨架与导航结构重构。
- 基础设置、语言模型、快捷输入、缓存区的真实可编辑闭环。
- 设置页命令层扩展。
- 同步配置与连接测试。
- 组件测试、单元测试、E2E 回归。
- 文档同步更新。

### 3.2 不在本次方案内

- 对话管理页开发。
- 黑名单设置编辑与保存。
- 侧边栏快捷输入自动触发真实执行链路。
- 分支并发、消息编辑、历史恢复等聊天能力。
- 日志开关或日志导出能力。
- 旧数据结构迁移兼容。

## 4. 当前差距摘要

基于 [status.md](/Users/air/woo/think-bot-sp/status.md)，设置页当前主要差距有 5 类：

1. 页面结构未对齐：缺少左侧分栏工作台，当前只是顶部 chips。
2. 模型编辑未对齐：缺少列表摘要、展开编辑的完整字段集。
3. 基础设置未对齐：缺少默认模型、system prompt、Filter COT、提取设置等关键字段。
4. 配置子系统未完全落地：同步仍只有文档，没有真实编辑链路；黑名单编辑虽未实现，但本轮暂不纳入。
5. 测试与文档未收口：现有测试覆盖的是当前临时实现，不足以保护目标配置页。

## 5. 开发原则

1. 先锁测试，再改实现。
2. 先收口阶段 2/2.5 已声明能力，再扩展同步；黑名单编辑后置到单独阶段。
3. UI 不直接读写 `chrome.storage.local`，一律经 `settingsApi -> runtime command -> background -> repository`。
4. 配置按单对象保存，不拆散局部 key 写入。
5. 关键状态显式建模：当前分栏、草稿配置、已保存配置、未保存标记、最近错误。
6. 文档与测试必须和实现一起更新，不接受“代码先行、文档以后再补”。

## 6. 里程碑

### M1. 页面骨架与状态管理

目标：先把设置页从“临时页面”变成“稳定工作台”。

### M2. 阶段 2/2.5 功能补齐

目标：补齐基础设置、模型编辑、快捷输入预览/编辑，使其与 [docs/Workspace/settings.md](/Users/air/woo/think-bot-sp/docs/Workspace/settings.md) 对齐。

### M3. 同步能力落地

目标：补齐 [docs/Services/sync.md](/Users/air/woo/think-bot-sp/docs/Services/sync.md) 对设置页的要求，黑名单编辑能力后置。

### M4. 回归与文档收口

目标：完成组件、单元、E2E 与文档更新，形成可回归基线。

## 7. 详细子任务列表

### Task 0. 建立设置页任务基线

目标：先把“要对齐什么、不做什么、如何验收”固定下来。

参考文档：

- [status.md](/Users/air/woo/think-bot-sp/status.md)
- [docs/Workspace/settings.md](/Users/air/woo/think-bot-sp/docs/Workspace/settings.md)
- [docs/test/settings-core.md](/Users/air/woo/think-bot-sp/docs/test/settings-core.md)

子任务：

1. 抽取当前设置页已实现能力、未实现能力、与文档不一致能力，形成实施前 checklist。
2. 明确本次交付的阶段边界：哪些按阶段 2/2.5 收口，哪些按后续完整能力补齐。
3. 把验收基线映射到测试类型：
   - 结构与交互用 component test。
   - 契约与命令路由用 unit test。
   - 真正链路闭环用 E2E。
4. 整理设置页涉及的主要文件和依赖：
   - `src/features/settings/*`
   - `src/domain/config/config-schema.ts`
   - `src/repositories/config-repository.ts`
   - `src/services/runtime-messaging/config-commands.ts`
   - `entrypoints/background.ts`

完成定义：

- 形成明确的任务顺序。
- 每个阶段都有输入、输出和验证方式。

### Task 1. 重构设置页壳层与导航结构

目标：把当前顶部 chips 布局重构为文档要求的完整配置页工作台。

参考文档：

- [docs/Workspace/settings.md](/Users/air/woo/think-bot-sp/docs/Workspace/settings.md)
- [docs/test/settings-core.md](/Users/air/woo/think-bot-sp/docs/test/settings-core.md)
- [docs/Services/icon-assets.md](/Users/air/woo/think-bot-sp/docs/Services/icon-assets.md)

建议输出：

- `src/features/settings/settings-shell-state.ts`
- `src/features/settings/settings-nav.tsx`
- `src/features/settings/settings-actions.tsx`
- 调整后的 `src/features/settings/settings-shell.tsx`

子任务：

1. 显式建模设置页壳层状态：
   - 当前 active section
   - saved config
   - draft config
   - has unsaved changes
   - recent error
   - saving / testing / syncing 等瞬时状态
2. 把页面导航改成固定 4 栏：
   - 基础设置
   - 标签页
   - 语言模型
   - 云同步
3. 为后续黑名单栏目预留扩展位置，但本轮不落地入口与面板。
4. 把顶部动作区抽成独立模块：
   - 保存
   - 恢复默认
   - 导出配置
   - 导入配置
   - 为后续“保存并同步”预留位置
5. 增加“未保存更改”提示，切换栏目不丢草稿。
6. 保留现有 `data-testid` 契约，并补齐新的可测试标识。
7. 检查图标来源是否继续通过本地资源统一输出，不引入新图标体系。

完成定义：

- 页面结构与 [docs/Workspace/settings.md](/Users/air/woo/think-bot-sp/docs/Workspace/settings.md) 的布局约束一致。
- 切换栏目不丢未保存草稿。

### Task 2. 补齐基础设置面板

目标：把 `basic` 配置从“零散字段”补成真实配置面板。

参考文档：

- [docs/Workspace/settings.md](/Users/air/woo/think-bot-sp/docs/Workspace/settings.md)
- [docs/DataSchema/config.md](/Users/air/woo/think-bot-sp/docs/DataSchema/config.md)
- [docs/dao/config-repository.md](/Users/air/woo/think-bot-sp/docs/dao/config-repository.md)
- [docs/Services/i18n.md](/Users/air/woo/think-bot-sp/docs/Services/i18n.md)

建议输出：

- `src/features/settings/basic-settings-panel.tsx`
- 扩展 `src/domain/config/config-schema.ts`
- 补充 `settings-shell-state.ts` 对应选择器和校验

子任务：

1. 核对 `ExtensionConfig.basic` 与 UI 字段映射。
2. 为基础设置补齐以下编辑项：
   - theme
   - language
   - defaultModelId
   - systemPrompt
   - filterCot
   - extractionMethod
   - includePageContentByDefault
3. 处理默认模型候选过滤：
   - 只显示启用且配置完整的模型
   - 与侧边栏保持相同判定逻辑
4. 让语言和主题仍保持即时预览。
5. 保存前做前端显式校验，但最终结果仍以后端 schema 为准。
6. 处理错误回显：
   - 默认模型非法
   - schema 保存失败
   - 导入覆盖失败

完成定义：

- `basic` 区所有文档声明字段都能编辑、预览、保存和恢复默认。

### Task 3. 完整化语言模型面板

目标：把当前单模型编辑表单扩展成“列表摘要 + 单项展开编辑”的真实模型管理区。

参考文档：

- [docs/Workspace/settings.md](/Users/air/woo/think-bot-sp/docs/Workspace/settings.md)
- [docs/DataSchema/config.md](/Users/air/woo/think-bot-sp/docs/DataSchema/config.md)
- [docs/dao/config-repository.md](/Users/air/woo/think-bot-sp/docs/dao/config-repository.md)
- [docs/test/settings-core.md](/Users/air/woo/think-bot-sp/docs/test/settings-core.md)

建议输出：

- `src/features/settings/language-models-panel.tsx`
- 扩展 `src/features/settings/model-form.tsx`
- 必要时补充排序/复制/软删除 helper

子任务：

1. 增加模型列表摘要视图，展示：
   - name
   - provider
   - model 或 deployment
   - enabled 状态
2. 扩展编辑字段，至少覆盖：
   - name
   - provider
   - enabled
   - model
   - baseUrl
   - apiKey
   - deployment
   - temperature
   - tools
   - thinkingBudget
   - maxOutputTokens
   - supportsImages
3. 处理 Provider 差异字段显隐与校验切换。
4. 保留 API Key 掩码与显隐逻辑。
5. 增加模型级动作：
   - 新增
   - 复制
   - 软删除
   - 排序
6. 保存前保证：
   - `id` 唯一
   - 默认模型引用稳定
   - 软删除项不进入候选

完成定义：

- 模型面板达到 [docs/Workspace/settings.md](/Users/air/woo/think-bot-sp/docs/Workspace/settings.md) 和 [docs/test/settings-core.md](/Users/air/woo/think-bot-sp/docs/test/settings-core.md) 的验收口径。

### Task 4. 把快捷输入从预览升级为可编辑面板

目标：把只读预览升级成可维护的快捷输入配置区。

参考文档：

- [docs/Workspace/settings.md](/Users/air/woo/think-bot-sp/docs/Workspace/settings.md)
- [docs/DataSchema/config.md](/Users/air/woo/think-bot-sp/docs/DataSchema/config.md)
- [docs/dao/config-repository.md](/Users/air/woo/think-bot-sp/docs/dao/config-repository.md)

建议输出：

- 扩展 `src/features/settings/quick-inputs-panel.tsx`
- 为 quick inputs 增加编辑态、排序态和校验 helper

子任务：

1. 从只读预览改成列表编辑器。
2. 补齐快捷输入字段编辑：
   - name
   - prompt
   - autoTrigger
   - modelId
   - order
   - deletedAt
3. 补齐快捷输入级动作：
   - 新增
   - 软删除
   - 排序
4. 做引用过滤：
   - 引用不存在模型时给出降级策略
   - 删除模型后快捷输入引用不应导致整个配置保存失败
5. 保证预览与保存使用同一份草稿数据。
6. 明确本阶段边界：
   - 本任务只做配置编辑，不做侧边栏自动触发执行链路。

完成定义：

- 快捷输入具备真实编辑闭环。
- 与 [status.md](/Users/air/woo/think-bot-sp/status.md) 中“只有只读预览”的问题切开。

### Task 5. 扩展配置命令与仓储能力

目标：让设置页新增的字段和动作都能走真实后台链路，不在前端伪造结果。

参考文档：

- [docs/dao/config-repository.md](/Users/air/woo/think-bot-sp/docs/dao/config-repository.md)
- [docs/Services/runtime-messaging.md](/Users/air/woo/think-bot-sp/docs/Services/runtime-messaging.md)
- [docs/DataSchema/config.md](/Users/air/woo/think-bot-sp/docs/DataSchema/config.md)

建议输出：

- 扩展 `src/repositories/config-repository.ts`
- 扩展 `src/services/runtime-messaging/config-commands.ts`
- 扩展 `src/features/settings/settings-api.ts`
- 调整 `entrypoints/background.ts`

子任务：

1. 把 `config-schema` 中的默认值、唯一性与选择器补齐。
2. 在 repository 层补齐衍生查询：
   - enabled and complete models
   - autoTrigger quick inputs
   - language / theme
3. 补齐新的 runtime commands：
   - `TEST_SYNC_CONNECTION`
   - `SYNC_NOW`
   - `FETCH_REMOTE_QUICK_INPUT_TEMPLATES`
   - `IMPORT_REMOTE_QUICK_INPUT_TEMPLATES`
4. 让 `settingsApi` 与新命令一一对应。
5. 保证保存、重置、导入、导出仍为原子操作，不拆局部 key。
6. 错误都走统一异常出口，避免 UI 对不同命令写不同风格的 error 解析。

完成定义：

- 设置页所有新增操作都能通过真实 background 命令调用。

### Task 6. 落地云同步配置与连接测试

目标：让设置页具备同步配置编辑和测试连接能力，并为后续同步执行留出真实入口。

参考文档：

- [docs/Workspace/settings.md](/Users/air/woo/think-bot-sp/docs/Workspace/settings.md)
- [docs/Services/sync.md](/Users/air/woo/think-bot-sp/docs/Services/sync.md)
- [docs/DataSchema/config.md](/Users/air/woo/think-bot-sp/docs/DataSchema/config.md)
- [docs/Services/runtime-messaging.md](/Users/air/woo/think-bot-sp/docs/Services/runtime-messaging.md)

建议输出：

- `src/features/settings/cloud-sync-panel.tsx`
- `src/services/sync/sync-service.ts`
- provider 适配层

子任务：

1. 为 `sync` 配置补齐 UI 字段：
   - enabled
   - provider
   - gistToken
   - gistId
   - webdavUrl
   - webdavUsername
   - webdavPassword
   - lastSyncAt
2. 设计 provider 切换行为：
   - `none`
   - `gist`
   - `webdav`
3. 实现 `TEST_SYNC_CONNECTION` 命令闭环。
4. 实现 `SYNC_NOW` 命令闭环。
5. 约束远端请求只在 background service 执行。
6. 实现同步结果反馈：
   - 成功
   - 认证失败
   - 网络失败
   - 远端非法数据
7. 增加 env-gated smoke 测试入口，避免真实网络依赖阻塞常规回归。

完成定义：

- 设置页能保存同步配置并执行连接测试。
- 同步能力至少形成最小闭环，而不是只有占位字段。

### Task 7. 黑名单编辑能力暂缓

目标：明确黑名单编辑不纳入本轮设置页交付，避免范围漂移。

参考文档：

- [docs/Workspace/settings.md](/Users/air/woo/think-bot-sp/docs/Workspace/settings.md)
- [docs/Services/blacklist.md](/Users/air/woo/think-bot-sp/docs/Services/blacklist.md)
- [docs/DataSchema/config.md](/Users/air/woo/think-bot-sp/docs/DataSchema/config.md)
- [docs/test/settings-core.md](/Users/air/woo/think-bot-sp/docs/test/settings-core.md)

子任务：

1. 在本方案中明确标记：黑名单编辑、测试、保存链路暂时不做。
2. 保留 [docs/Services/blacklist.md](/Users/air/woo/think-bot-sp/docs/Services/blacklist.md) 作为后续阶段输入，不在本轮拆解实现任务。
3. 如果设置页壳层需要预留扩展位，只保留结构扩展点，不新增用户可见入口。
4. 测试与验收中不再把黑名单面板和黑名单保存链路纳入当前范围。

完成定义：

- 当前任务范围中已显式排除黑名单编辑能力，文档内外口径一致。

### Task 8. 补齐国际化、图标和可观测性细节

目标：避免主功能做完后出现文本、图标和错误回显的碎片化问题。

参考文档：

- [docs/Services/i18n.md](/Users/air/woo/think-bot-sp/docs/Services/i18n.md)
- [docs/Services/icon-assets.md](/Users/air/woo/think-bot-sp/docs/Services/icon-assets.md)
- [docs/decision_log.md](/Users/air/woo/think-bot-sp/docs/decision_log.md)

子任务：

1. 为设置页新增文案补齐 `locales/zh-CN.yml` 与 `locales/en.yml`。
2. 保持平铺 key，不引入嵌套结构。
3. 为新按钮和状态补齐本地图标映射。
4. 统一错误展示组件，避免各面板自行拼错误样式。
5. 复核不引入日志开关、日志导出、黑名单编辑等文档明确暂不做的功能。

完成定义：

- 设置页新增 UI 全部具备双语文案和统一错误表现。

### Task 9. 测试矩阵补齐

目标：按文档口径建立真实回归保护线。

参考文档：

- [docs/test/settings-core.md](/Users/air/woo/think-bot-sp/docs/test/settings-core.md)
- [docs/Services/runtime-messaging.md](/Users/air/woo/think-bot-sp/docs/Services/runtime-messaging.md)
- [docs/Services/sync.md](/Users/air/woo/think-bot-sp/docs/Services/sync.md)

建议输出：

- component tests
- unit tests
- e2e tests

子任务：

1. Component tests
   - 布局与导航
   - 基础设置字段
   - 模型面板
   - 快捷输入面板
   - 云同步面板
2. Unit tests
   - `config-schema`
   - `config-repository`
   - `config-commands`
   - `settings-api`
   - `sync-service`
3. E2E tests
   - 设置页打开与保存
   - 导入导出
   - 默认模型候选过滤
   - 快捷输入保存
   - 同步连接测试
4. 补错误流和异常流：
   - 保存失败
   - 导入失败
   - 导出失败
   - 缓存清理失败
   - provider 切换字段残留
   - 快速重复保存

完成定义：

- 测试覆盖与 [docs/test/settings-core.md](/Users/air/woo/think-bot-sp/docs/test/settings-core.md) 一致。

### Task 10. 文档同步更新

目标：让 `/docs` 与实现重新对齐，避免再次出现“代码和文档各说各话”。

参考文档：

- [docs/Workspace/settings.md](/Users/air/woo/think-bot-sp/docs/Workspace/settings.md)
- [docs/DataSchema/config.md](/Users/air/woo/think-bot-sp/docs/DataSchema/config.md)
- [docs/Services/runtime-messaging.md](/Users/air/woo/think-bot-sp/docs/Services/runtime-messaging.md)
- [docs/Services/sync.md](/Users/air/woo/think-bot-sp/docs/Services/sync.md)
- [docs/test/settings-core.md](/Users/air/woo/think-bot-sp/docs/test/settings-core.md)

子任务：

1. 更新设置页模块边界与已交付能力。
2. 更新 `ExtensionConfig` 字段与默认值说明。
3. 更新设置页新增命令与错误流。
4. 更新同步服务中“设置页入口”的说明，并补充黑名单编辑暂缓的边界说明。
5. 更新测试文档中的验收矩阵。
6. 回写 `status.md` 中设置页相关结论。

完成定义：

- 文档中的设置页口径与代码一致。

## 8. 推荐执行顺序

1. Task 0
2. Task 1
3. Task 2
4. Task 3
5. Task 4
6. Task 5
7. Task 6
8. Task 8
9. Task 9
10. Task 10

说明：Task 7 为后续阶段占位任务，不纳入本轮执行顺序。

## 9. 风险与应对

### 风险 1. 设置页 UI 重构过大，容易把当前可用能力打坏

应对：

- 先建壳层状态，再逐块替换旧面板。
- 每完成一个面板就补 component test。

### 风险 2. schema 与 UI 字段扩展不同步

应对：

- 所有新增字段先改 [docs/DataSchema/config.md](/Users/air/woo/think-bot-sp/docs/DataSchema/config.md) 对应的数据模型。
- 再改 schema、repository、UI。

### 风险 3. 同步能力引入真实网络依赖，拖慢开发节奏

应对：

- 把同步拆成 UI、命令、service、env-gated smoke 四层。
- 默认回归只跑 fake provider 或 mock transport。

### 风险 4. 黑名单需求继续挂在本轮方案中，导致范围失控

应对：

- 在范围、任务、测试、验收中统一标记黑名单编辑暂不做。
- 相关文档只保留“后续阶段处理”的边界说明。

## 10. 验收标准

1. 设置页结构与 [docs/Workspace/settings.md](/Users/air/woo/think-bot-sp/docs/Workspace/settings.md) 对齐。
2. 配置字段与 [docs/DataSchema/config.md](/Users/air/woo/think-bot-sp/docs/DataSchema/config.md) 对齐。
3. 配置命令与 [docs/Services/runtime-messaging.md](/Users/air/woo/think-bot-sp/docs/Services/runtime-messaging.md) 对齐。
4. 同步能力形成真实后台闭环，黑名单编辑明确不在本轮验收内。
5. 回归测试与 [docs/test/settings-core.md](/Users/air/woo/think-bot-sp/docs/test/settings-core.md) 对齐。
6. 文档完成同步更新。
