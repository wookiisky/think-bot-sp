# 图标资源服务

## 1. 模块定位

图标资源服务负责管理扩展安装图标、浏览器 action 图标，以及页面内 Material Symbols Outlined 本地资源的组织、加载和使用约束。

## 2. 核心抽象

- `MaterialSymbolName`
- `IconFontAsset`
- `IconCssClass`
- `ExtensionIconPath`

## 3. 能力边界

负责：

- 管理扩展 manifest 使用的本地 PNG 图标。
- 管理页面内本地图标字体或 subset 文件。
- 提供统一图标 class 和使用规范。
- 约束图标名称来源。

不负责：

- 生成或设计产品图标源图。
- 多套页面内图标库混用。
- 在线拉取图标资源。

## 4. 对外接口

- `loadIconFont()`
- `renderIcon(name)`

页面内图标资源约束：

- 来源：官方 Material Symbols Outlined
- 产物：本地 `woff2` 与 CSS 映射
- 使用方式：ligature 文本或受控封装组件

扩展图标资源约束：

- 来源：仓库 `icons/` 目录中的 PNG 文件。
- 使用位置：`manifest.icons` 与 `manifest.action.default_icon`。
- 使用路径：`icons/icon16.png`、`icons/icon48.png`、`icons/icon128.png`。

## 5. 关键流程

- 构建时把图标资源打包进扩展。
- WXT 构建时通过 `build:publicAssets` 把 `icons/` 中的 manifest 图标复制进扩展产物。
- 页面初始化时加载本地样式。
- UI 以统一类名渲染图标。

## 6. 错误与异常处理

- 图标名称不存在时回退到默认占位图标。
- 字体资源加载失败时不阻塞核心流程，但按钮仍需可点击。

## 7. 数据与状态

- 静态资源：
  - `icons/icon16.png`
  - `icons/icon48.png`
  - `icons/icon128.png`
  - `icons/raw.png`
  - `icons/jina32.png`
  - `assets/fonts/material-symbols-outlined.woff2`
  - `assets/styles/material-symbols.css`

## 8. 依赖与协作模块

- `Workspace/sidebar.md`
- `Workspace/settings.md`
- `Workspace/conversations.md`

## 9. 约束与禁止事项

- 禁止通过 Google Fonts 在线加载。
- 禁止在不同页面使用不同图标命名体系。
- 禁止把未确认用途的 PNG 资源写入 manifest。
- 发布前允许做 subset，但默认以完整可用为优先。

## 10. 测试要求

- 职责测试：manifest 图标路径正确，核心页面图标正确加载。
- 边界测试：未知图标名回退。
- 错误流测试：字体资源丢失时退化表现。

## 11. 相关文档

- `tech_stack.md`
- `test/browser-automation.md`
