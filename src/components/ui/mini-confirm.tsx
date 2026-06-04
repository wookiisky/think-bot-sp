import { useId, useState, type ReactElement, type ReactNode } from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';

import { cn } from '../../lib/utils';
import { Button } from './button';

type MiniConfirmProps = {
  /** 触发按钮。 */
  children: ReactElement;
  /** 确认提示文案。 */
  message: ReactNode;
  /** 取消按钮文案。 */
  cancelLabel: string;
  /** 确认按钮文案。 */
  confirmLabel: string;
  /** 确认回调。 */
  onConfirm(): void | Promise<void>;
  /** 弹出方向。 */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** 对齐方式。 */
  align?: 'start' | 'center' | 'end';
  /** 偏移量。 */
  sideOffset?: number;
  /** 内容测试 id。 */
  contentTestId?: string;
  /** 自定义样式。 */
  className?: string;
};

/** 删除类操作使用的迷你确认框。 */
export const MiniConfirm = ({
  children,
  message,
  cancelLabel,
  confirmLabel,
  onConfirm,
  side = 'bottom',
  align = 'end',
  sideOffset = 8,
  contentTestId,
  className,
}: MiniConfirmProps) => {
  const descriptionId = useId();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const triggerDisabled = Boolean(children.props.disabled);

  /** 执行确认操作，并在完成后收起确认框。 */
  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (triggerDisabled || submitting) {
          return;
        }
        setOpen(nextOpen);
      }}
    >
      <PopoverPrimitive.Trigger asChild>
        <span className="inline-flex">{children}</span>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          role="alertdialog"
          aria-describedby={descriptionId}
          side={side}
          align={align}
          sideOffset={sideOffset}
          data-testid={contentTestId}
          className={cn(
            'z-50 w-52 border border-border/70 bg-popover p-2.5 ring-1 ring-foreground/5',
            'animate-in fade-in-0 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1',
            className,
          )}
        >
          <div className="grid gap-2">
            <p id={descriptionId} className="m-0 text-xs leading-5 text-foreground">
              {message}
            </p>
            <div className="flex justify-end gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={submitting}
                onClick={() => setOpen(false)}
              >
                {cancelLabel}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="xs"
                disabled={submitting}
                onClick={() => void handleConfirm()}
              >
                {confirmLabel}
              </Button>
            </div>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
};
