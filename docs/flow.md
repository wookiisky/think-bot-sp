# 跨模块流程

## 0. 跨模块约束：关键流程调试日志

涉及模块：

- `Services/logger.md`
- `Services/runtime-messaging.md`
- `Services/extraction.md`
- `Services/llm-dispatch.md`
- `Services/sync.md`

约束：

- side panel 初始化、页面提取、消息发送、流式恢复、同步、黑名单确认这些主流程都必须记录关键开始、结束、取消、失败节点。
- 日志统一使用结构化 `console` 输出，事件名和上下文字段由 `Services/logger.md` 作为唯一主来源。
- 调试日志只用于排障，不写入本地存储，不参与同步，不作为恢复依据。
- 日志上下文必须优先携带 `browserTabId`、`pageId`、`promptTab`、`sessionId`、`branchId` 这类关联字段，而不是正文或敏感原文。

关键验证点：

- 同一条跨模块请求链路能够通过稳定字段串联。
- 用户取消和预期回退不会被误记为系统错误。
- 敏感字段不会出现在调试日志中。

## 1. 主流程：普通网页打开侧边栏

涉及模块：

- `browser-entry.md`
- `Platform/chrome-mv3-runtime.md`
- `Services/runtime-messaging.md`
- `Services/extraction.md`
- `Workspace/sidebar.md`
- `dao/page-repository.md`

流程：

1. 用户点击扩展图标。
2. background 判断当前 `browserTab` 是否为可用普通网页。
3. 可用时，background 先确保 `openPanelOnActionClick` 已启用，再为当前 `browserTab` 设置 side panel 选项，由浏览器原生完成打开。
4. side panel 完成挂载后，通过 one-shot command 主动请求 `GET_SIDEBAR_BOOTSTRAP`。
5. background 读取页面缓存、会话恢复数据、loading 状态和黑名单判定结果。
6. side panel 先渲染恢复态；有缓存则优先展示页面内容、页面状态和 `promptTab` 去重状态。
7. 若命中黑名单，则先停在确认层；若未命中或用户已放行，才继续进入提取和自动触发流程。

状态变化：

- 页面上下文进入“已绑定当前 `browserTab`”。
- 侧边栏进入“已打开”。
- 页面记录可能从“无缓存”变为“已缓存”。

关键验证点：

- `sidePanel.open()` 需要用户手势；扩展图标链路不能在异步链路里手动调用，应依赖浏览器原生点击打开行为。
- side panel 初始化只能由 side panel 自己拉取 `GET_SIDEBAR_BOOTSTRAP`，background 不主动推送首屏初始化命令。
- 普通页打开时优先显示缓存而不是空白页。
- content script 不可用时必须进入异常流而不是静默失败。
- 初始化链路应能通过调试日志串联打开请求、页面信息读取和提取分支选择。

## 2. 主流程：切换浏览器标签页后自动隐藏

流程：

1. 用户在 `browserTab A` 打开 side panel。
2. 用户切换到 `browserTab B`。
3. 若 `browserTab B` 未启用 side panel，浏览器自动隐藏 side panel。
4. background 根据 `tabs.onActivated` 清理 `browserTab A` 的 side panel 启用态。
5. 用户切回 `browserTab A` 时，side panel 不自动恢复。
6. 用户再次点击扩展图标后，side panel 才重新打开。

关键验证点：

- 产品语义是“自动隐藏，不自动恢复”，不是“切回即自动显示”。
- 清理 `browserTab A` 启用态后，重新打开仍能命中缓存和恢复 loading。
- 切换 `browserTab` 不会导致已有会话或进行中的 `promptTab` 重复自动触发。

## 3. 异常流：受限页面退化

流程：

1. 用户点击扩展图标。
2. background 判断为 Chrome 受限页面或不支持注入的页面。
3. 若当前页是 `conversations.html`，则直接打开设置页。
4. 否则不进入侧边栏抽取流程，直接打开 conversations 页面作为退化入口。

关键验证点：

- 不尝试对受限页面执行脚本。
- 用户有明确可继续工作的入口。
- `conversations.html` 再次点击扩展图标不会原地回环。

## 4. 主流程：扩展图标右键菜单打开历史页

涉及模块：

- `browser-entry.md`
- `Workspace/conversations.md`

流程：

1. background 在安装阶段注册扩展图标右键菜单。
2. 用户点击菜单中的 `Conversations` 入口。
3. background 直接打开 conversations 页面。
4. conversations 页面自行加载历史页面列表。

关键验证点：

- 右键菜单入口不依赖当前网页是否可注入。
- 右键菜单入口不会误触发 side panel 初始化。

## 5. 主流程：首次安装打开快速上手

涉及模块：

- `browser-entry.md`

流程：

1. 扩展首次安装完成。
2. background 读取浏览器语言。
3. 在中文和英文快速上手文档之间做选择。
4. 在新标签页打开对应文档。

关键验证点：

- 首次安装只触发一次默认打开动作。
- 文档语言选择与浏览器语言一致。

## 6. 主流程：页面内容提取

涉及模块：

- `Services/extraction.md`
- `dao/page-repository.md`

流程：

1. side panel 在初始化时先发起 `GET_SIDEBAR_BOOTSTRAP`，需要提取时再发起带来源标记的 `RE_EXTRACT_CONTENT`；只有“打开侧边栏流程”里的提取会继续进入自动触发编排。
2. background 先返回缓存、页面状态、`promptTab` 会话摘要、loading 状态和黑名单判定结果。
3. 若页面已有有效缓存，则不重复提取。
4. 若页面无缓存且当前打开流程已通过黑名单校验，background 请求 content script 提供页面 HTML 和元数据。
5. 若 content script 未连上，background 先尝试按需注入 content script，再进入一次自动刷新重连。
6. 提取服务优先使用 Readability。
7. Readability 成功则保存页面内容、提取方式、更新时间。
8. Readability 失败且允许回退时，调用 Jina 提取。
9. Jina 成功则保存新内容和方法。
10. side panel 将提取结果显示在常驻独立的提取内容区。
11. 全部失败则返回错误态，并保留当前页面上下文。

错误流：

- content script 未连接：
  - background 先尝试按需注入 content script。
  - 注入后仍失败时，再自动刷新当前页面一次并重新连接。
  - 自动恢复仍失败后，才提示用户手动刷新或重试。
- Jina 请求失败：
  - 标记提取失败，不覆盖已有成功缓存。

恢复策略：

- 重新提取始终沿用当前选择的方法。
- 已有可用缓存时，失败不清空旧内容。
- 切换 `promptTab` 不会隐藏提取内容区，也不会改变页面提取结果。
- side panel 再次打开时，若缓存仍有效则不重复提取。

关键验证点：

- 切换提取方法只影响当前页面。
- 页面级 `includePageContent` 不受提取失败影响。
- 提取内容区与聊天区必须并存，不能把提取内容降级为某个 `promptTab` 的临时内容。
- 黑名单未放行前不能触发提取。
- 提取链路应记录 Readability 失败、Jina 回退和最终完成状态。

## 7. 主流程：发送消息与流式输出

涉及模块：

- `Services/llm-dispatch.md`
- `Services/runtime-messaging.md`
- `dao/conversation-repository.md`
- `dao/config-repository.md`

流程：

1. UI 校验文本或图片至少存在一种输入，并从配置里选定一个启用且完整的模型。
2. UI 通过 `SEND_CHAT` 提交 `promptTabId / modelId / text / images / includePageContent`。
3. background 先把本次 `includePageContent` 回写到当前 `PageRecord.includePageContent`，再读取 `PageRecord.content`。
4. background 读取模型配置，校验图片能力，不匹配时在任何持久化前直接失败。
5. 若 `includePageContent=true` 且页面缓存正文非空，则把页面正文追加到最终 `system prompt` 末尾的 `# Page Content` 段；用户消息正文保持原样。若缓存缺失，则自动退化为仅发送用户消息。
6. LLM Dispatch 先写用户消息、助手占位和 `LoadingStateRecord`。
7. side panel 通过 long-lived port 订阅当前 `promptTab` 的流式事件。
8. Dispatch 使用 `streamText` 输出主回答，每个 chunk 都先落 `ConversationRecord`，再推 `CHAT_STREAM_CHUNK`。
9. side panel 关闭或 port 断开后，已落盘内容仍可见；重新打开时通过 `RESTORE_LOADING` 恢复最近一条未完成助手消息。
10. 完成、取消、错误后收敛助手状态并清理 loading state。

错误流：

- Provider 配置不完整：
  - 请求在进入模型层前失败。
- 页面正文缺失：
  - 不把空正文拼进请求，直接退化为仅发送用户消息。
- 用户取消：
  - 视为正常终止，清理 loading state，不标记系统错误。
- 流式中断：
  - 记录错误结果并回收 loading。

关键验证点：

- API Key 只在 background 服务层使用。
- 页面级 `includePageContent` 必须在后续 bootstrap 中可恢复，不允许只依赖设置页默认值。
- `SEND_CHAT / STOP_SESSION` 必须以 `promptTabId` 为作用域，`Chat` 与快捷输入会话不能串写。
- side panel 关闭再打开后，仍能基于持久化 loading state 恢复 UI。
- port 推送失败不能覆盖已落库的主生命周期结果。
- 流式链路应记录发送受理、首个 chunk、完成、取消和失败事件。

## 8. 主流程：快捷输入与自动触发

当前代码已落地：

- side panel 会把 `ExtensionConfig.quickInputs` 渲染为 `Chat + quickInputs` 多 `promptTab` 工作台。
- 每个 `promptTab` 有独立草稿、模型选择、消息线程和 loading 恢复。
- 切换 `promptTab` 只影响聊天与输入区，不影响提取区。
- 只有侧边栏打开流程中的页面提取成功后，background 才会读取 `autoTrigger=true` 的快捷输入并执行后台去重自动触发。
- 自动触发会话会注册到与手动发送相同的活跃会话表，因此页面级清空仍能先取消会话再删数据。

当前流程：

流程：

1. 页面内容加载完成后，background 读取快捷输入配置。
2. 过滤 `autoTrigger=true` 的快捷输入。
3. 对每个候选 `promptTab` 检查：
   - 页面内容是否存在。
   - 当前 `promptTab` 是否已有历史。
   - 当前 `promptTab` 是否正在 loading。
   - 当前 `promptTab` 是否已初始化。
4. 满足条件时后台发起发送，不切换当前可见 `promptTab`；当前实现统一对自动触发请求注入页面正文，但不改写页面级 `includePageContent`。
5. 对应 `promptTab` 进入 loading，完成后切为 `has-content`。

关键验证点：

- 自动触发不打断用户当前 `promptTab`。
- 自动触发不会因重开侧边栏而重复执行。
- side panel 再次打开时，已有历史或仍在执行中的 `promptTab` 不重复自动触发。
- 清空当前 `promptTab` 后，该 `promptTab` 自动触发状态会被重置，后续重新进入页面时可再次自动触发。
- 自动触发的“强制带入页面内容”只作用于该次请求，不修改页面级开关。

## 9. 主流程：分支并发分析

流程：

1. 请求进入 dispatch pipeline。
2. background 解析主模型、全局 branch models、快捷输入专属 branch models。
3. 为每个分支分配独立 `branchId` 和 loading state。
4. 主回答和分支回答并行执行。
5. 每个分支独立发送 chunk、done、error。
6. 分支完成后单独写回历史。

错误流和恢复：

- 单个分支失败不影响其他分支。
- 停止和删除只作用于目标分支。

关键验证点：

- 分支必须保留模型身份。
- 分支预览依赖完整 Markdown 内容。
- 宽屏下多分支以横向阅读列展示，窄屏自动回落纵向列表。

## 10. 主流程：历史恢复与继续对话

涉及模块：

- `Workspace/conversations.md`
- `dao/page-repository.md`
- `dao/conversation-repository.md`

流程：

1. conversations 页面加载历史页面元数据列表。
2. 用户选中某个页面。
3. 页面读取：
   - 页面记录
   - `promptTab` 结构
   - `promptTab` 会话
   - loading state
4. UI 恢复页面标题、URL、提取内容、`promptTab`、消息、图片区和输入区。
5. 用户可继续发送消息，行为与侧边栏一致。

关键验证点：

- 历史页左栏以页面元数据为 source of truth。
- 右侧工作区同时保留提取内容区和聊天区。
- loading 恢复要覆盖主会话和分支状态。
- 删除页面只影响目标页面。

## 11. 主流程：页面级清空与 promptTab 级清空

流程：

1. 用户触发顶部垃圾桶按钮时，UI 发起页面级清空命令。
2. background 先取消该页面仍在进行中的请求，并等待这些请求的生命周期收敛。
3. background 清理当前页面缓存、页面级状态、`promptTab` 会话和 loading state。
4. side panel 保留当前布局骨架，并回到“页面待重新提取、`promptTab` 待重新初始化”的初始态；当前输入草稿不因页面级清空而丢失。
5. 用户触发底部清空按钮时，UI 发起当前 `promptTab` 会话清空命令。
6. background 只清理当前 `promptTab` 会话和该 `promptTab` 相关 loading state。
7. UI 保留页面提取内容、其他 `promptTab` 历史和页面级状态不变。

关键验证点：

- 顶部清空和底部清空必须作用于不同数据范围。
- 页面级清空后，重新进入页面可以重新提取并重新自动触发。
- `promptTab` 级清空后，不影响页面提取内容和其他 `promptTab`。

## 12. 主流程：会话导出

流程：

1. 用户在当前 `promptTab` 点击“导出”。
2. side panel 通过 `EXPORT_CONVERSATION` 把当前 `pageUrl + promptTabId` 提交给 background。
3. background 从标准会话记录和当前配置读取 `system prompt`、主回答和分支结构，渲染 Markdown。
4. background 返回文件名、MIME 类型和 Markdown 内容。
5. side panel 只负责触发本地下载，不在 UI 侧拼装导出内容。

关键验证点：

- 导出范围必须只属于当前 `promptTab`。
- Markdown 必须包含页面标题、页面 URL、`promptTab`、`system prompt`、主回答和分支结构。
- 空会话必须明确失败，不能生成空文件。

## 13. 主流程：同步与删除

涉及模块：

- `Services/sync.md`
- `dao/sync-repository.md`

流程：

1. 用户在设置页配置 Gist 或 WebDAV。
2. background 测试连接。
3. 保存并同步时，读取本地数据域聚合成 `SyncSnapshot`。
4. 读取远端快照并按对象粒度完成本地、远端合并：
   - 配置、页面、会话先按 `updatedAt` 取更新对象
   - 再以页面墓碑裁剪页面与会话可见性
5. 回写新的本地逻辑视图，并清理孤儿 `conversation / loading`。
6. 推送远端快照并更新 `lastSyncAt`。
7. 删除页面时：
   - 同步开启：写墓碑并过滤本地读取结果。
   - 同步关闭：直接物理删除。

关键验证点：

- 软删除与硬删除路径不能混淆。
- 同步失败不覆盖本地有效数据。
- 本地和远端同时修改不同对象时，不允许整份快照互相覆盖。
- 远端格式非法时不能“猜格式”继续覆盖本地。
- 同步链路应记录连接失败、同步开始、合并完成和推送失败等关键节点。

## 14. 主流程：消息编辑与分支操作

流程：

1. UI 对目标消息或分支发起 typed command。
2. background 校验目标对象属于当前页面和 `promptTab`。
3. 用户消息编辑：
   - 更新目标用户消息内容
   - 裁剪其后的依赖回答和分支
   - 重新发起从该消息开始的新请求
4. 用户消息重试：
   - 保留原用户消息
   - 命中该用户消息后的第一条助手消息
   - 把新结果追加为该助手消息的新分支
5. 分支继续新增：
   - 只为目标助手消息追加新的 branch request
   - 保留已有分支不变
6. 停止或删除分支：
   - 只影响目标 branchId

关键验证点：

- 编辑用户消息后，不允许保留过期的后续回答。
- 重试只替换主链上的目标助手消息，继续新增分支只追加到分支区。
- 停止和删除必须局部生效。

## 14. 主流程：黑名单确认

流程：

1. 页面初始化时 background 校验当前 URL 是否命中黑名单。
2. 命中时 side panel 展示确认层。
3. 用户确认继续后，side panel 通过 `CONFIRM_BLACKLIST_CONTINUE` 放行本次打开行为。
4. 放行后才进入提取与会话流程。
5. 用户取消则关闭侧边栏或返回安全状态。

关键验证点：

- 黑名单命中必须先阻断自动工作流。
- 用户确认结果只影响当前打开行为。
