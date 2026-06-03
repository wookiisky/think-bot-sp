/** 垂直分隔拖拽线：视觉 2px，命中区向左右扩展。 */
export const WORKSPACE_VERTICAL_RESIZE_HANDLE_CLASS =
  "relative z-10 w-0.5 shrink-0 self-stretch cursor-col-resize bg-muted-foreground/35 transition-colors hover:bg-primary/50 before:absolute before:inset-y-0 before:-left-1 before:w-[10px] before:content-['']";

/** 水平分隔拖拽线：视觉 2px，命中区向上下扩展。 */
export const WORKSPACE_HORIZONTAL_RESIZE_HANDLE_CLASS =
  "relative z-10 h-0.5 w-full shrink-0 cursor-row-resize bg-muted-foreground/35 transition-colors hover:bg-primary/50 before:absolute before:inset-x-0 before:-top-1 before:h-[10px] before:content-['']";
