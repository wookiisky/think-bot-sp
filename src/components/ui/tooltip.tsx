import type { ReactElement, ReactNode } from 'react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';

import { cn } from '../../lib/utils';

type TooltipProps = {
  /** tooltip 文案。 */
  content: ReactNode;
  /** 触发节点。 */
  children: ReactElement;
  /** 弹出方向。 */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** 对齐方式。 */
  align?: 'start' | 'center' | 'end';
  /** 偏移量。 */
  sideOffset?: number;
  /** 自定义样式。 */
  className?: string;
};

/** 立即显示的非原生 tooltip。 */
export const Tooltip = ({
  content,
  children,
  side = 'top',
  align = 'center',
  sideOffset = 6,
  className,
}: TooltipProps) => (
  <TooltipPrimitive.Provider delayDuration={0} skipDelayDuration={0}>
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        <span className="inline-flex">{children}</span>
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={sideOffset}
          className={cn(
            'z-50 max-w-56 border border-border/70 bg-popover px-2 py-1 text-[11px] font-medium text-popover-foreground',
            'animate-in fade-in-0 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1',
            className,
          )}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  </TooltipPrimitive.Provider>
);
