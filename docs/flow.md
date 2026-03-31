# 跨模块流程

## 1. 主流程：普通网页打开侧边栏

涉及模块：

- `Platform/chrome-mv3-runtime.md`
- `Services/runtime-messaging.md`
- `Services/extraction.md`
- `Workspace/sidebar.md`
- `dao/page-repository.md`

流程：

1. 用户点击扩展图标。
2. background 判断当前 tab 是否为可用普通网页。
3. 可用时调用 `sidePanel.open()` 并发送页面初始化命令。
4. side panel 通过 one-shot command 请求当前页面基础信息和缓存状态。
5. background 读取页面缓存。
6. 有缓存则先返回页面内容与页面状态，再决定是否后台补刷新。
7. 无缓存则驱动 content script 读取 DOM，并进入正文提取流程。

状态变化：

- 页面上下文进入“已绑定当前 tab”。
- 侧边栏进入“已打开”。
- 页面记录可能从“无缓存”变为“已缓存”。

关键验证点：

- `sidePanel.open()` 只能由用户点击链路触发。
- 普通页打开时优先显示缓存而不是空白页。
- content script 不可用时必须进入异常流而不是静默失败。

## 2. 异常流：受限页面退化

流程：

1. 用户点击扩展图标。
2. background 判断为 Chrome 受限页面或不支持注入的页面。
3. 不进入侧边栏抽取流程。
4. 直接打开 conversations 页面作为退化入口。

关键验证点：

- 不尝试对受限页面执行脚本。
- 用户有明确可继续工作的入口。

## 3. 主流程：页面内容提取

涉及模块：

- `Services/extraction.md`
- `dao/page-repository.md`

流程：

1. UI 发起 `GET_PAGE_INFO` 或 `RE_EXTRACT_CONTENT`。
2. background 请求 content script 提供页面 HTML 和元数据。
3. 提取服务优先使用 Readability。
4. Readability 成功则保存页面内容、提取方式、更新时间。
5. Readability 失败且允许回退时，调用 Jina 提取。
6. Jina 成功则保存新内容和方法。
7. 全部失败则返回错误态，并保留当前页面上下文。

错误流：

- content script 未连接：
  - background 自动刷新当前页面一次并重新注入 content script。
  - 自动恢复仍失败后，才提示用户手动刷新或重试。
- Jina 请求失败：
  - 标记提取失败，不覆盖已有成功缓存。

恢复策略：

- 重新提取始终沿用当前选择的方法。
- 已有可用缓存时，失败不清空旧内容。

关键验证点：

- 切换提取方法只影响当前页面。
- 页面级 `includePageContent` 不受提取失败影响。

## 4. 主流程：发送消息与流式输出

涉及模块：

- `Services/llm-dispatch.md`
- `Services/runtime-messaging.md`
- `dao/conversation-repository.md`
- `dao/config-repository.md`

流程：

1. UI 校验文本或图片至少存在一种输入。
2. UI 通过 one-shot command 提交发送请求。
3. background 读取当前页面状态、模型配置、system prompt、快捷输入上下文。
4. LLM Dispatch 组装 `ChatRequestContext`。
5. background 创建 `StreamSession` 并落盘 loading state。
6. side panel 或 conversations 页面通过 long-lived port 订阅流式事件。
7. Dispatch 使用 `streamText` 推送 chunk、完成、错误或取消事件。
8. 主回答完成后写入历史并清理 loading state。

错误流：

- Provider 配置不完整：
  - 请求在进入模型层前失败。
- 用户取消：
  - 视为正常终止，清理 loading state，不标记系统错误。
- 流式中断：
  - 记录错误结果并回收 loading。

关键验证点：

- API Key 只在 background 服务层使用。
- side panel 关闭再打开后，仍能基于持久化 loading state 恢复 UI。

## 5. 主流程：快捷输入与自动触发

流程：

1. 页面内容加载完成后，background 读取快捷输入配置。
2. 过滤 `autoTrigger=true` 的快捷输入。
3. 对每个候选标签检查：
   - 页面内容是否存在。
   - 当前标签是否已有历史。
   - 当前标签是否已初始化。
4. 满足条件时后台发起发送，不切换当前可见标签。
5. 对应标签进入 loading，完成后切为 `has-content`。

关键验证点：

- 自动触发不打断用户当前标签。
- 自动触发不会因重开侧边栏而重复执行。
- 清空当前标签后，该标签自动触发状态会被重置，后续重新进入页面时可再次自动触发。

## 6. 主流程：分支并发分析

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

## 7. 主流程：历史恢复与继续对话

涉及模块：

- `Workspace/conversations.md`
- `dao/page-repository.md`
- `dao/conversation-repository.md`

流程：

1. conversations 页面加载历史页面元数据列表。
2. 用户选中某个页面。
3. 页面读取：
   - 页面记录
   - 标签结构
   - 标签会话
   - loading state
4. UI 恢复提取内容、标签、消息、图片区和输入区。
5. 用户可继续发送消息，行为与侧边栏一致。

关键验证点：

- 历史页左栏以页面元数据为 source of truth。
- 删除页面只影响目标页面。

## 8. 主流程：同步与删除

涉及模块：

- `Services/sync.md`
- `dao/sync-repository.md`

流程：

1. 用户在设置页配置 Gist 或 WebDAV。
2. background 测试连接。
3. 保存并同步时，读取本地数据域聚合成 `SyncSnapshot`。
4. 读取远端快照并按对象粒度完成本地、远端合并：
   - 先应用页面墓碑
   - 再按 `updatedAt` 合并配置、页面、会话
5. 回写新的本地逻辑视图。
6. 推送远端快照并更新 `lastSyncAt`。
7. 删除页面时：
   - 同步开启：写墓碑并过滤本地读取结果。
   - 同步关闭：直接物理删除。

关键验证点：

- 软删除与硬删除路径不能混淆。
- 同步失败不覆盖本地有效数据。
- 本地和远端同时修改不同对象时，不允许整份快照互相覆盖。

## 9. 主流程：消息编辑与分支操作

流程：

1. UI 对目标消息或分支发起 typed command。
2. background 校验目标对象属于当前页面和标签。
3. 用户消息编辑：
   - 更新目标用户消息内容
   - 裁剪其后的依赖回答和分支
   - 重新发起从该消息开始的新请求
4. 用户消息重试：
   - 保留原用户消息
   - 为该轮回答生成新的主结果或分支结果
5. 分支继续新增：
   - 只为目标助手消息追加新的 branch request
   - 保留已有分支不变
6. 停止或删除分支：
   - 只影响目标 branchId

关键验证点：

- 编辑用户消息后，不允许保留过期的后续回答。
- 重试和继续新增分支都不能覆盖已有分支。
- 停止和删除必须局部生效。

## 10. 主流程：黑名单确认

流程：

1. 页面初始化时 background 校验当前 URL 是否命中黑名单。
2. 命中时 side panel 展示确认层。
3. 用户确认继续才进入提取与会话流程。
4. 用户取消则关闭侧边栏或返回安全状态。

关键验证点：

- 黑名单命中必须先阻断自动工作流。
- 用户确认结果只影响当前打开行为。
