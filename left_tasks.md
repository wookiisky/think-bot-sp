# 剩余任务清单

## 1. 目标与对照范围

本清单基于以下三类来源交叉整理：

- 产品规格：`prd_docs/product-functional-spec.md`
- 当前方案文档：`docs/`
- 当前实现与测试：`src/`、`entrypoints/`、`tests/`

结论：

- 侧边栏、设置页、对话管理页的主流程已经基本打通。
- 当前剩余工作不再是“从 0 到 1 的基础搭建”，而是集中在少量产品缺口、明显的文档口径漂移，以及关键端到端自动化缺口。

---

## 2. A 类任务：规格已定义，但实现仍有缺口

### A1. 补齐“分支内容预览层”闭环

- 差异来源：
  - `prd_docs/product-functional-spec.md` 8.3.8 明确要求“每个分支可在独立 Overlay 中预览完整内容”，并支持 `Markdown`、点击遮罩关闭、`Esc` 关闭、拖拽调整尺寸。
  - `docs/Workspace/sidebar.md`、`docs/Workspace/conversations.md` 仍把“分支预览层”列为核心抽象。
  - 当前 `src/features/sidebar/chat-thread.tsx` 和 `src/features/conversations/conversations-shell.tsx` 只有分支卡片内联展示，没有独立预览层。
- 任务目标：
  - 为侧边栏和对话管理页补齐统一的分支预览层。
  - 预览层必须复用现有 Markdown 渲染器，避免维护两套渲染语义。
- 涉及模块：
  - `src/features/sidebar/chat-thread.tsx`
  - `src/features/sidebar/sidebar-shell.tsx`
  - `src/features/conversations/conversations-shell.tsx`
  - 共享 UI 组件层
  - 对应文案资源与测试
- 交付内容：
  - 分支卡片增加“打开预览”入口
  - 独立 Overlay / Dialog 容器
  - `Esc`、遮罩点击关闭
  - 预览层尺寸拖拽
  - 侧边栏与历史页统一交互
- 验收点：
  - 长分支内容不会挤压主工作区
  - 关闭后不影响当前会话、主分支选择、滚动和输入草稿
  - 组件测试和 E2E 覆盖打开、关闭、`Esc`、拖拽

### A2. 明确并落地“设置页最近错误展示区”

- 差异来源：
  - `prd_docs/product-functional-spec.md` 9.2 明确写了“另外存在错误显示区，用于展示最近一次捕获的错误”。
  - 当前代码已提供 `settingsApi.getRecentError()` 和 `recent-error-repository`，但 `src/features/settings/settings-shell.tsx` 没有真正渲染最近错误区域。
  - `docs/Workspace/settings.md`、`docs/test/settings-core.md`、组件测试对该能力的口径互相不一致，当前属于“需求存在、实现半截、文档也未统一”。
- 任务目标：
  - 先统一产品口径，再落地实现。
  - 建议采用“页面内固定错误摘要区 + 操作失败仍走 toast”的组合，而不是只保留 toast。
- 涉及模块：
  - `src/features/settings/settings-shell.tsx`
  - `src/features/settings/settings-api.ts`
  - `src/repositories/recent-error-repository.ts`
  - `docs/Workspace/settings.md`
  - `docs/test/settings-core.md`
- 交付内容：
  - 最近错误摘要区 UI
  - 首屏加载最近错误
  - 保存/同步/侧边栏/历史页错误写入后的可见性策略
  - 文档统一
- 验收点：
  - 最近错误能展示来源、操作、摘要时间
  - 不与 toast 重复冲突
  - 错误为空时 UI 有稳定空态或隐藏策略

### A3. 补齐“受限页面退化提示”产品反馈

- 差异来源：
  - `prd_docs/product-functional-spec.md` 7.1 写明：受限页面点击扩展图标时，打开 conversations，必要时给出受限页面提示。
  - 当前 `src/services/browser-entry/browser-entry.ts` 会直接退化到 conversations，但没有把“为什么退化”传递给用户。
- 任务目标：
  - 在不破坏当前入口链路的前提下，给出最小但明确的退化提示。
- 涉及模块：
  - `src/services/browser-entry/browser-entry.ts`
  - `src/features/conversations/conversations-shell.tsx` 或独立入口提示层
  - 对应文档与 E2E
- 交付内容：
  - 退化原因透传机制
  - conversations 页的一次性提示文案
- 验收点：
  - 受限页用户能理解“为什么没有进入侧边栏”
  - 普通页入口不受影响

---

## 3. B 类任务：代码已演进，但 `/docs` 口径明显滞后

### B1. 同步“云同步能力”相关文档

- 当前差异：
  - `src/services/sync/sync-service.ts` 和 `src/repositories/sync-repository.ts` 已经实现：
    - 远端读取
    - 对象级合并
    - tombstone 合并
    - 本地回写
    - 重新构建快照并推送远端
  - 但以下文档仍停留在“阶段 2 仅配置级同步”口径：
    - `docs/Workspace/settings.md`
    - `docs/decision_log.md`
    - `docs/Services/runtime-messaging.md`
- 任务目标：
  - 把“最小配置同步”旧口径更新为当前真实实现口径。
- 交付内容：
  - 明确 settings 页当前已经进入“配置 + 页面 + 会话 + tombstone”的手动同步闭环
  - 同步失败、墓碑优先级、`LoadingStateRecord` 不同步等限制写清楚
  - 删除旧的阶段性占位描述
- 验收点：
  - 文档不再误导后续开发
  - `docs/index.md` 的导航描述与真实实现一致

### B2. 同步“运行时消息能力”文档

- 当前差异：
  - `docs/Services/runtime-messaging.md` 仍写有“对话管理页复用流式订阅未落地”等旧结论。
  - 实际代码中：
    - conversations 已复用侧边栏聊天命令链路
    - conversations 已复用相同的流式事件协议
- 任务目标：
  - 更新 runtime-messaging 文档中的“当前已实现 / 未实现”边界。
- 涉及模块：
  - `docs/Services/runtime-messaging.md`
  - 如有必要同步 `docs/flow.md`
- 交付内容：
  - 修正文档中的未落地项
  - 把仍未落地的内容只保留真正未做的部分
- 验收点：
  - 文档中的命令矩阵、流式能力、sender 约束与代码一致

### B3. 同步“快捷输入远端模板导入”文档口径

- 当前差异：
  - 规格要求支持从云端导入快捷输入模板，当前 `src/features/settings/quick-input-template-service.ts` 已经实现直接拉取并导入。
  - 但部分文档仍把该能力标记为未落地或未进入正式命令体系。
- 任务目标：
  - 明确当前是“设置页直接拉取远端模板并导入草稿配置”的实现，而不是 background typed command。
- 涉及模块：
  - `docs/Workspace/settings.md`
  - `docs/Services/runtime-messaging.md`
  - `docs/test/settings-core.md`
- 验收点：
  - 文档能说明当前实现路径、边界和限制
  - 后续若要迁移到 background，也有清晰基线

### B4. 统一“最近错误展示”的文档结论

- 当前差异：
  - 规格要求有错误显示区。
  - 当前 Workspace / test 文档与组件测试对“是否展示最近错误区域”结论冲突。
- 任务目标：
  - 在 A2 做出产品决策后，统一这些文档。
- 涉及模块：
  - `docs/Workspace/settings.md`
  - `docs/test/settings-core.md`
  - 如有必要同步 `docs/index.md`

---

## 4. C 类任务：关键自动化与验收缺口

### C1. 补齐 conversations 页真实扩展环境 E2E

- 当前差异：
  - `docs/test/conversations-core.md` 已明确仍缺：
    - 真实扩展环境下继续对话流程
    - conversations 页流式恢复端到端验证
  - `tests/e2e/` 当前没有 conversations 专项 E2E 文件。
- 任务目标：
  - 补齐对话管理页从“恢复 -> 继续对话 -> 流式 -> 清空/导出”的真实链路自动化。
- 建议覆盖：
  - 选中历史页面并恢复右侧工作台
  - 继续发送文本/图片
  - loading 恢复
  - 页面删除软删/硬删分流
  - 标题编辑成功与失败回滚
  - 分支重试、主分支切换、继续新增分支

### C2. 为“分支预览层”补齐组件测试与 E2E

- 前置依赖：
  - A1 完成后执行
- 任务目标：
  - 补齐预览层打开、关闭、Esc、拖拽、长内容展示的自动化。

### C3. 补齐设置页高价值 E2E 空白项

- 当前缺口方向：
  - 黑名单规则新增/编辑/匹配测试
  - 模型连通性测试
  - 最近错误展示区
  - 快捷输入远端模板导入
  - 新 provider 关键字段切换
- 当前依据：
  - `tests/e2e/` 已覆盖基础设置、模型、快捷输入、同步、默认模型和布局
  - 但尚未看到 blacklist、recent error、template import、model test 的真实浏览器链路覆盖
- 任务目标：
  - 让设置页关键链路从“组件回归为主”提升到“关键能力有真实 E2E 兜底”

### C4. 补齐侧边栏剩余高风险场景回归

- 当前缺口方向：
  - `docs/test/sidebar-core.md` 已明确仍未覆盖：
    - 极端“长文本 + 多分支 + 超高输入区”组合布局
    - 真实浏览器剪贴板权限稳定校验
- 任务目标：
  - 为后续 UI 迭代保留回归护栏，避免布局和复制能力退化。

---

## 5. 建议排期顺序

### 第一批：先处理真正影响产品闭环和认知一致性的任务

1. A1 分支内容预览层
2. A2 最近错误展示区口径决策与落地
3. B1/B2/B4 文档同步

### 第二批：补齐关键 E2E 保护线

1. C1 conversations 页真实扩展环境 E2E
2. C3 设置页高价值 E2E 空白项
3. C4 侧边栏高风险场景补测

### 第三批：低风险收尾

1. A3 受限页退化提示
2. B3 快捷输入远端模板导入文档口径整理

---

## 6. 最终判断

如果只看主功能闭环，当前项目已经进入“可用但仍有少量关键缺口”的阶段，而不是“大面积未实现”阶段。

真正应该优先解决的，不是继续铺更多新能力，而是：

- 把规格里仍缺的少量关键交互补齐
- 把已经变化的实现及时回写到 `/docs`
- 把 conversations 和设置页的关键链路补上真实 E2E

否则后续继续迭代时，最大的风险不是功能做不出来，而是“代码、文档、测试”三套事实继续分叉。
