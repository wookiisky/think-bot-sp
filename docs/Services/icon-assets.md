# 图标资源服务

## 1. 模块定位

图标资源服务负责管理扩展内全部 Material Symbols Outlined 本地资源的组织、加载和使用约束。

## 2. 核心抽象

- `MaterialSymbolName`
- `IconFontAsset`
- `IconCssClass`

## 3. 能力边界

负责：

- 管理本地图标字体或 subset 文件。
- 提供统一图标 class 和使用规范。
- 约束图标名称来源。

不负责：

- 多套图标库混用。
- 在线拉取图标资源。

## 4. 对外接口

- `loadIconFont()`
- `renderIcon(name)`

资源约束：

- 来源：官方 Material Symbols Outlined
- 产物：本地 `woff2` 与 CSS 映射
- 使用方式：ligature 文本或受控封装组件

## 5. 关键流程

- 构建时把图标资源打包进扩展。
- 页面初始化时加载本地样式。
- UI 以统一类名渲染图标。

## 6. 错误与异常处理

- 图标名称不存在时回退到默认占位图标。
- 字体资源加载失败时不阻塞核心流程，但按钮仍需可点击。

## 7. 数据与状态

- 静态资源：
  - `assets/fonts/material-symbols-outlined.woff2`
  - `assets/styles/material-symbols.css`

## 8. 依赖与协作模块

- `Workspace/sidebar.md`
- `Workspace/settings.md`
- `Workspace/conversations.md`

## 9. 约束与禁止事项

- 禁止通过 Google Fonts 在线加载。
- 禁止在不同页面使用不同图标命名体系。
- 发布前允许做 subset，但默认以完整可用为优先。

## 10. 测试要求

- 职责测试：核心页面图标正确加载。
- 边界测试：未知图标名回退。
- 错误流测试：字体资源丢失时退化表现。

## 11. 相关文档

- `tech_stack.md`
- `test/browser-automation.md`
