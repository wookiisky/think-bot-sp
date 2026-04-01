# 浏览器自动化基线

## 1. 关联能力

- MV3 扩展加载
- side panel 打开
- content script 注入
- service worker 协调
- 端到端主流程

## 2. 核心职责清单

- 使用 Playwright persistent context 加载 unpacked MV3 扩展。
- 获取 service worker 与 extension id。
- 跑通 side panel、settings、conversations 三个入口。
- 覆盖扩展图标点击、右键菜单和首次安装入口。
- 在真实浏览器中验证流式消息和恢复行为。

## 3. 验证点

- 启动基线：
  - 扩展成功加载。
  - service worker 可获取。
  - extension id 稳定可用于打开页面。
  - 首次安装会按浏览器语言打开快速上手文档。
- P0 主流程：
  - 普通网页打开 side panel。
  - `browserTab A` 打开 side panel，切到 `browserTab B` 自动隐藏，切回 `browserTab A` 不自动恢复，再次点击扩展图标后重新打开。
  - 右键菜单打开 conversations 页面。
  - 提取、发送、快捷输入、分支、取消、恢复、消息编辑。
  - 设置页模型与语言配置、远端快捷输入模板导入。
  - conversations 页面恢复、继续对话、打开原网页不改变当前选中。
  - 黑名单与受限页退化。
- 可观测性：
  - 关键流程可在浏览器 console 中观察到稳定日志事件名。
  - 调试日志不输出 API Key、同步密钥、完整页面正文和完整用户输入。
- 同步流程：
  - 连接测试。
  - 删除语义。
  - 本地与远端对象级合并。

## 4. 关键边界条件

- side panel 只能由用户操作触发。
- `browserTab` 切换后 side panel 自动隐藏，切回原 `browserTab` 不自动恢复。
- 右键菜单不依赖当前页面是否可注入。
- service worker 在测试中被回收后重新唤起。
- content script 注入失败。

## 5. 测试环境要求

- 浏览器固定用 Playwright 自带 `chromium`。
- 使用 persistent context。
- 失败默认保留 trace、video、screenshot。
- 通过测试桩控制模型与同步返回，避免依赖真实外部服务。

## 6. 必须长期回归的高风险场景

- side panel 打开时机错误。
- `browserTab` 切换后 side panel 自动恢复，违背产品语义。
- 流式过程中关闭 side panel 后无法恢复。
- service worker 重启导致消息丢失。
- content script 与 background 消息不通。
- 重新打开 side panel 后重复提取页面内容。
- 自动触发在 side panel 重开后重复执行。
