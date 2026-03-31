# Think Bot 实现细节与重构约束

## 1. 文档范围

本文档承接当前实现中的数据结构、状态模型、消息契约、兼容约束和重构风险点，供开发、重构和代码审查使用。

扫描范围：

- `manifest.json`
- `sidebar/`
- `options/`
- `conversations/`
- `background/`
- `content_scripts/`
- `js/modules/`

## 2. 数据与状态模型

### 2.1 本地存储结构

当前主要使用 `chrome.storage.local`。

配置数据包含：

- 主配置
- system prompt
- 快捷输入索引与配置项
- 黑名单规则
- 同步配置

页面缓存数据采用统一 page data 结构，包含：

- `url`
- `metadata`
- `content`
- `pageState`
- `lastUpdated`
- `created`

聊天记录与页面缓存分离存储，key 语义为：

- 页面默认聊天：`url`
- 标签聊天：`url#tabId`

加载状态也单独存储，覆盖：

- tab 级 loading state
- branch 级 loading state

### 2.2 URL 归一化

为减少重复缓存，当前会对 URL 做归一化处理：

- 协议和域名小写
- 去掉 `www.`
- 去掉末尾 `/`
- 去掉 hash
- 去掉常见跟踪参数

### 2.3 缓存生命周期

当前规则：

- 页面缓存最长保留 90 天
- Service Worker 启动和安装时会执行清理
- 运行中会周期性清理过期缓存

### 2.4 压缩策略

页面内容与聊天记录支持压缩存储，以降低本地空间占用。

## 3. 运行时行为细节

### 3.1 国际化与主题

当前支持：

- `en`
- `zh_CN`

主题策略：

- Light
- Dark
- System

### 3.2 消息发送时的上下文拼装

一次请求上下文通常由以下部分构成：

- system prompt
- 可选时间前缀
- 可选页面内容
- 用户消息序列
- 可选图片

### 3.3 分支请求上下文规则

分支请求会强制带入页面内容，以保证同题多模型比较时的上下文一致性。

### 3.4 历史保存策略

- 主回答完成后自动写入历史
- 分支回答优先更新 branch 结构
- 错误分支更偏 UI 级呈现，避免历史中残留无意义 loading 记录

### 3.5 软删除策略

同步开启时，删除数据优先写入软删除标记，便于远端同步正确合并删除动作。

## 4. Source Of Truth 与状态归属

### 4.1 侧边栏局部内存状态

`sidebar/modules/state-manager.js` 维护的轻量状态包括：

- `currentUrl`
- `extractedContent`
- `currentExtractionMethod`
- `includePageContent`
- `config`

职责是前端运行态缓存，不是最终持久化源。

### 4.2 标签页运行态

`sidebar/components/tab-manager.js` 当前维护：

- `tabs`
- `activeTabId`
- 每个 tab 的 `hasInitialized`
- 每个 tab 的 `isLoading`
- 每个 tab 的 `hasContent`
- runtime 级 `activeBranches`
- runtime 级 `lastAssistantState`

这层是“当前界面表现和运行过程的 source of truth”，但不等于持久化数据。

### 4.3 持久化状态

真正的长期事实来源仍然是 `chrome.storage.local`，主要分为：

- 配置
- 页面缓存
- 聊天记录与 loading state

### 4.4 页面列表 Source Of Truth

对话管理页左侧列表以页面元数据为主来源，而不是从聊天记录倒推。

这意味着：

- 页面标题、图标、最后更新时间必须有稳定的元数据来源
- 列表构建逻辑不能依赖 DOM 或对话文本反解析

## 5. 消息契约与事件契约

重构时，消息名、载荷结构和触发时序都属于高风险兼容点。

### 5.1 前台到 background 的关键请求

- `GET_PAGE_INFO`
- `SWITCH_EXTRACTION_METHOD`
- `RE_EXTRACT_CONTENT`
- `SEND_LLM_MESSAGE`
- `CANCEL_LLM_REQUEST`
- `CLEAR_URL_DATA`
- `SOFT_DELETE_URL_DATA`
- `GET_CONFIG`
- `SAVE_CONFIG`
- `RESET_CONFIG`
- `CHECK_CONFIG_HEALTH`
- `SAVE_CHAT_HISTORY`
- `GET_CHAT_HISTORY`
- `GET_BATCH_CHAT_HISTORY`
- `GET_BATCH_LOADING_STATE`
- `GET_LOADING_STATE`
- `CLEAR_LOADING_STATE`
- `CLEAR_ALL_LOADING_STATES_FOR_URL`
- `SAVE_PAGE_STATE`
- `GET_ALL_PAGE_METADATA`
- `TEST_SYNC_CONNECTION`
- `GET_BLACKLIST_PATTERNS`
- `ADD_BLACKLIST_PATTERN`
- `UPDATE_BLACKLIST_PATTERN`
- `DELETE_BLACKLIST_PATTERN`
- `CHECK_BLACKLIST_URL`
- `TEST_BLACKLIST_PATTERN`
- `RESET_BLACKLIST_TO_DEFAULTS`
- `GET_SYNC_CONFIG`
- `EXPORT_CONVERSATION`
- `SIDEBAR_READY`

### 5.2 background 到前台的关键事件

- `LLM_STREAM_CHUNK`
- `LLM_STREAM_END`
- `LLM_ERROR`
- `LOADING_STATE_UPDATE`
- `TAB_CHANGED`
- `AUTO_LOAD_CONTENT`
- `AUTO_EXTRACT_CONTENT`
- `TAB_UPDATED`
- `BLACKLIST_DETECTED`
- `SIDEBAR_OPENED`
- `CLOSE_SIDEBAR`
- `PING_SIDEBAR`

### 5.3 消息层重构建议

- 如果要改造通信层，先做 message adapter
- 在 UI 层彻底脱离旧消息之前，不要直接改消息名
- stream 相关事件要继续保持“分块 / 结束 / 错误 / loading state 更新”语义分离

## 6. 重构功能不变量

### 6.1 页面与会话不变量

- 一个页面 URL 对应一份页面缓存
- 同一页面下，默认聊天与快捷输入聊天必须分离存储
- 快捷输入标签聊天不能与 `Chat` 标签混存
- 历史页面列表必须仍按页面维度组织

### 6.2 快捷输入不变量

- 快捷输入不仅是模板文本，也是标签页定义
- 快捷输入唯一 ID 必须长期稳定
- 排序、自动触发、专属分支模型都属于持久化配置
- 自动触发必须具备“条件满足时运行且避免重复触发”的语义

### 6.3 分支不变量

- 分支必须是用户可见结果，而不是隐藏后台结果
- 分支必须保留模型身份
- 分支必须能单独进入 `loading / done / error`
- 分支停止、删除、预览都必须保持局部作用域

### 6.4 页面状态不变量

- `includePageContent` 是页面级状态，不是全局一次性开关
- 页面切换后，该状态应按页面恢复
- 提取方式、提取内容、页面标题、页面元信息之间要保持关联

### 6.5 导出不变量

- 导出必须反映“当前页面 + 当前标签页 + 当前聊天结构”
- 导出必须保留 assistant 分支结构与模型信息
- 导出为空时应明确失败，而不是产出空文件

## 7. 持久化兼容约束

### 7.1 配置层兼容

当前存在新旧格式兼容逻辑，例如：

- `config.basic` 与旧平铺配置兼容
- `config.llm_models` 与旧 `config.llm` 兼容

因此重构时不能假设只有一种新结构。

### 7.2 页面缓存兼容

页面缓存使用 unified page data，并按提取方法分桶存储内容。调整存储结构时必须保留读取旧数据或提供显式迁移。

### 7.3 聊天记录兼容

当前聊天 key 语义：

- `url`
- `url#tabId`

重构时必须保留这种可解析关系，或提供显式迁移方案。

### 7.4 loading state 兼容

当前 loading state 同时存在：

- tab 级
- branch 级

branch 级 key 与 `tabId:branchId` 相关。该语义一旦改坏，会直接影响：

- 标签 loading 标记
- 侧边栏重开后的流式恢复
- 分支错误与完成后的状态回收

### 7.5 软删除兼容

同步开启时，删除并不总是物理删除，而可能写入软删除标记。

需要继续保留：

- `del` 语义
- `lastModified` 删除时间戳语义
- 软删除项读取时的过滤规则

## 8. DOM 与 UI 高风险耦合点

### 8.1 消息 DOM

当前大量逻辑依赖：

- `.chat-message`
- `.message-content`
- `.message-branch`
- `.message-branches`
- `[data-branch-id]`
- `[data-streaming="true"]`

如果 UI 重构时改动这些结构，最先出问题的会是：

- 流式写入
- 分支定位
- 预览入口
- 悬浮按钮定位
- 重试与分支删除

### 8.2 标签 DOM

标签状态渲染依赖类名和渲染逻辑。若切换到组件化实现，需要继续保留三类可组合语义：

- `active`
- `loading`
- `has-content`

### 8.3 设置页复杂表单 DOM

高风险区域包括：

- 模型列表展开与折叠
- branch model 多选控件
- 快捷输入折叠列表
- API Key 显隐按钮
- Sortable 拖拽后的重新绑定

## 9. 高风险模块与建议拆分边界

### 9.1 推荐优先稳定的领域模型

- `Page`
- `Conversation`
- `ConversationTab`
- `QuickInput`
- `BranchResponse`
- `ModelConfig`
- `SyncConfig`
- `BlacklistPattern`

建议先把这些对象的类型和边界定稳，再处理 UI 重写。

### 9.2 推荐优先抽象的服务边界

- Page Extraction Service
- Conversation Persistence Service
- LLM Dispatch Service
- Loading State Service
- Config Service
- Sync Service
- Page Metadata Service

### 9.3 推荐优先收口的适配层

- `chrome.runtime.sendMessage` 适配层
- `chrome.storage.local` 适配层
- content script HTML 获取适配层
- export/download 适配层

## 10. 当前高风险热点

### 10.1 `chat-manager.js`

风险原因：

- 同时承担 UI 生成、流式写入、分支逻辑、历史保存和导出协作
- 逻辑密度高
- DOM 耦合重

建议：

- 先拆请求构造
- 再拆 branch state
- 最后再拆 render adapter 与消息渲染

### 10.2 `tab-manager.js`

风险原因：

- 同时管理标签结构、状态派生、历史恢复和 loading 恢复
- 与聊天历史和 loading state 双向耦合

建议：

- 先把 tab state derivation 纯函数化
- 再替换渲染层

### 10.3 `options.js`、`model-manager.js`、`quick-inputs.js`

风险原因：

- 这是典型的巨型设置页脚本组合
- 保存、导入导出、同步、模型表单和快捷输入表单交叉很多

建议：

- 先拆配置 schema
- 再拆表单状态
- 最后拆各一级栏目

### 10.4 `storage.js`

风险原因：

- 同时承担 key 规则、统一 page data、压缩、软删除和元数据聚合
- 它是兼容性核心

建议：

- 先补读写测试
- 再替换存储实现

## 11. 推荐的重构保护策略

- 先做兼容层，再做替换
- 不要先删旧逻辑再补新逻辑
- 先把旧消息、旧 key、旧数据格式包进 adapter
- 新实现通过 adapter 与旧系统并存一段时间
- 优先保护可感知行为，而不是先追求结构美观

重构期间应优先验证：

- 侧边栏能否稳定打开并抽取页面
- 快捷输入能否正确切换与自动触发
- 分支能否正确流式、预览、删除
- 历史页面能否正确恢复
- 导入导出与同步是否仍可用

## 12. 非功能实现要求

### 12.1 性能

- 侧边栏打开后优先展示缓存
- 页面列表和快捷输入列表需支持高密度展示
- 标签切换应尽量避免整页重绘
- 长文本渲染不应出现明显布局抖动
- 批量状态获取优先使用批量接口

### 12.2 稳定性

- 刷新、关闭重开后尽量恢复关键状态
- 流式异常必须回收 loading state
- 单页数据损坏不应影响其他页面记录读取
- 单个模型配置异常不应影响其他模型可用性

### 12.3 一致性

- 侧边栏与对话管理页共享交互语义
- “启用且配置完整”的模型定义需要在所有入口一致
- 标签状态、聊天记录和 loading state 在 UI 与存储层语义应保持一致

### 12.4 可维护性

- 新增模型 Provider 时，不应破坏 selector、默认模型和同步结构
- 新增快捷输入字段时，应兼容导入导出与同步合并
- 页面状态、聊天记录和 loading state 要继续明确分层
