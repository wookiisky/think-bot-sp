# 配置数据域

## 1. 数据域概述

- 名称：`ExtensionConfig`
- 存储类型：`chrome.storage.local`
- 业务意义：保存全局设置、模型配置、快捷输入、主题语言、同步配置、黑名单和导入导出主载荷。
- 所属模块：设置页、模型调度、同步、国际化、黑名单。
- 上下游依赖：
  - 上游：设置页表单、导入配置。
  - 下游：侧边栏、对话管理页、background 服务。

## 2. 字段定义

关键字段：

- `version`
  - 类型：`string`
  - 必填：是
  - 默认值：当前实现版本号
  - 含义：配置结构版本。
- `updatedAt`
  - 类型：`number`
  - 必填：是
  - 含义：整份配置最后一次成功保存或导入的时间戳，用于同步冲突判定。
- `basic`
  - 类型：`object`
  - 必填：是
  - 含义：主题、语言、默认模型、system prompt、Filter COT、提取设置。
- `models`
  - 类型：`ModelConfig[]`
  - 必填：是
  - 默认值：空数组
  - 含义：全部模型配置。
  - 字段约束：
    - `id`
      - 类型：`string`
      - 必填：是
      - 含义：模型稳定 ID，用于引用、排序和软删除。
    - `name`
      - 类型：`string`
      - 必填：是
      - 含义：设置页与其他入口展示的模型名称。
    - `provider`
      - 类型：`"openai-compatible" | "gemini" | "azure-openai" | "anthropic"`
      - 必填：是
      - 含义：Provider 类型，决定字段显隐、校验和调度适配器。
    - `enabled`
      - 类型：`boolean`
      - 必填：是
      - 含义：是否允许进入默认模型候选和发送入口。
    - `model`
      - 类型：`string`
      - 必填：条件必填
      - 含义：Provider 使用的模型标识。
    - `baseUrl`
      - 类型：`string`
      - 必填：条件必填
      - 含义：兼容 OpenAI 或代理场景的请求入口地址。
    - `apiKey`
      - 类型：`string`
      - 必填：条件必填
      - 含义：模型访问凭证，仅存于本地配置和用户显式启用的同步目标。
    - `deployment`
      - 类型：`string`
      - 必填：条件必填
      - 含义：Azure OpenAI 的 deployment 标识。
    - `temperature`
      - 类型：`number`
      - 必填：否
      - 含义：采样温度。
    - `tools`
      - 类型：`string[]`
      - 必填：否
      - 含义：模型启用的工具能力列表，例如 URL Context。
    - `thinkingBudget`
      - 类型：`number`
      - 必填：否
      - 含义：支持思考预算的模型专属参数。
    - `maxOutputTokens`
      - 类型：`number`
      - 必填：否
      - 含义：单次输出的 token 上限。
    - `supportsImages`
      - 类型：`boolean`
      - 必填：是
      - 含义：模型是否显式支持图片输入，不再通过模型名或 provider 名推断。
    - `order`
      - 类型：`number`
      - 必填：是
      - 含义：列表展示顺序和拖拽结果。
    - `deletedAt`
      - 类型：`number | null`
      - 必填：否
      - 含义：软删除时间，存在时表示不再对外展示，但保留历史引用。
- `quickInputs`
  - 类型：`QuickInput[]`
  - 必填：是
  - 默认值：内置默认模板集合
  - 含义：快捷输入定义。
- `sync`
  - 类型：`SyncConfig`
  - 必填：是
  - 含义：同步开关、Provider、连接信息、最近同步时间。
- `blacklist`
  - 类型：`BlacklistRule[]`
  - 必填：是
  - 含义：黑名单规则列表。

## 3. 索引与限制

- 建议固定 key：`config:extension`
- 单一主记录，不做拆散多 key 写入。
- 模型、快捷输入、黑名单内部对象必须带稳定 `id`。
- 删除模型和快捷输入采用软删除标记，不直接丢失历史引用。
- 设置页中的模型项采用“列表摘要 + 展开编辑”形态，但持久化仍以完整对象保存，不拆分多 key。
- Provider 差异字段允许为空，但不允许被错误地作为其他 Provider 的必填项。
- 图片输入能力必须显式写入 `supportsImages`，不能依赖模型名猜测。
- 兼容旧配置时，如果 `supportsImages` 缺失，读取后默认补为 `false`。

## 4. 读写路径

- 谁读：
  - background
  - side panel
  - options page
  - conversations page
- 谁写：
  - 仅 background 的配置命令处理器。
- 典型查询：
  - 获取默认模型。
  - 获取启用且配置完整的模型列表。
  - 获取 autoTrigger 快捷输入列表。
- 典型更新：
  - 整体保存。
  - 恢复默认。
  - 导入配置替换。

“启用且配置完整”的模型定义：

- `enabled = true`
- `deletedAt` 为空
- `name` 非空
- `provider` 合法
- Provider 关键字段完整：
  - `openai-compatible`：`baseUrl`、`apiKey`、`model`
  - `gemini`：`apiKey`、`model`
  - `azure-openai`：`baseUrl`、`apiKey`、`deployment`
  - `anthropic`：`apiKey`、`model`

## 5. 生命周期与风险

- 首次安装时写入默认值。
- 用户保存设置时整体更新。
- 导入配置时做结构校验后原子替换。
- 远端快捷输入模板导入会先转成本地 `QuickInput`，生成新本地 ID 后再进入整份配置保存流程。
- 风险：
  - 大对象整体保存可能覆盖并发修改。
  - 不完整模型进入默认模型候选会导致发送失败。
  - Provider 切换后如果旧字段校验残留，会导致用户无法保存合法配置。
  - 缺少 `updatedAt` 会导致同步时无法稳定判定本地配置和远端配置谁更新。

## 6. 测试要求

- 字段约束测试：主题、语言、默认模型、Provider 字段校验。
- Provider 测试：字段显隐、完整性判定、切换后残留字段兼容。
- 唯一性测试：模型 ID、快捷输入 ID、黑名单 ID。
- 读写一致性测试：保存后跨页面读取一致。
- 并发写入测试：快速保存配置不丢字段。
- 导入兼容测试：非法结构不覆盖现有配置。
- 同步冲突测试：本地与远端配置按 `updatedAt` 正确决策。
