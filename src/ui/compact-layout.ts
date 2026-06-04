/** 入口页使用的紧凑外壳，页面背景沿用 body，避免重复装饰背景。 */
export const COMPACT_PAGE_SHELL_CLASS =
  'min-h-screen px-2 py-2 text-foreground sm:px-3 sm:py-3';

/** 全高工作台外壳，供 sidebar 和 conversations 共享。 */
export const COMPACT_WORKBENCH_CLASS =
  'h-screen min-h-0 overflow-hidden text-foreground';

/** 页面或工作台顶部工具区的统一密度。 */
export const COMPACT_HEADER_CLASS = 'shrink-0 border-b border-border px-2 py-1';

/** 设置页内容分组的统一间距。 */
export const COMPACT_SECTION_CLASS = 'grid gap-2';

/** 设置页卡片标题区的统一间距。 */
export const COMPACT_CARD_HEADER_CLASS = 'gap-1 border-b border-border/70 px-3 py-2';

/** 设置页卡片内容区的统一间距。 */
export const COMPACT_CARD_CONTENT_CLASS = 'grid gap-2.5 px-3 py-3';

/** 可折叠列表项的基础样式。 */
export const COMPACT_LIST_ITEM_CLASS = 'grid gap-2 border px-2 py-2 transition-colors';

/** 未选中列表项只保留边框和 hover 反馈。 */
export const COMPACT_LIST_ITEM_IDLE_CLASS = 'border-border/70 hover:bg-muted/35';

/** 选中列表项使用轻量主色背景，保证状态仍可识别。 */
export const COMPACT_LIST_ITEM_ACTIVE_CLASS = 'border-primary bg-primary/6';

/** prompt tab 的基础样式，供 sidebar 和 conversations 保持一致。 */
export const COMPACT_PROMPT_TAB_CLASS =
  'relative inline-flex items-center gap-1 overflow-hidden border px-1.5 py-[2px] text-left text-[11px] transition-colors';

/** 未选中 prompt tab 的统一样式。 */
export const COMPACT_PROMPT_TAB_IDLE_CLASS = 'border-border text-foreground hover:bg-muted/35';

/** 选中 prompt tab 的统一样式。 */
export const COMPACT_PROMPT_TAB_ACTIVE_CLASS = 'border-primary/40 bg-primary/8 text-foreground';

/** 拖拽柄按钮：只用于 dnd-kit sortable handle，不等同普通图标按钮。 */
export const COMPACT_DRAG_HANDLE_BUTTON_CLASS =
  'inline-flex h-7 w-7 shrink-0 items-center justify-center border border-border/70 text-sm text-muted-foreground hover:bg-muted/35 disabled:cursor-not-allowed disabled:opacity-50';

/** 整行选择按钮：用于导航、列表项、摘要行，不等同命令按钮。 */
export const COMPACT_ROW_BUTTON_CLASS = 'min-w-0 text-left transition-colors';

/** 聊天输入区控件：与 textarea 同行，需要保持 32px 高度。 */
export const COMPACT_COMPOSER_CONTROL_CLASS = 'size-8 shrink-0 rounded-none';

/** 聊天输入区模型选择框，与 composer 控件同高。 */
export const COMPACT_COMPOSER_SELECT_CLASS =
  'h-8 w-40 shrink-0 rounded-none border border-input/80 bg-transparent px-2 text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25';

/** 浮动消息工具按钮：空间极窄，使用 icon-xs，不参与普通工具栏尺寸。 */
export const COMPACT_FLOATING_ACTION_CLASS = 'border border-border/80 p-0.5 transition-opacity';

/** 尺寸调整角标：用于 resize handle，不等同普通按钮。 */
export const COMPACT_RESIZE_CORNER_BUTTON_CLASS =
  'pointer-events-auto h-5 w-5 cursor-se-resize rounded-sm border border-border/80';
