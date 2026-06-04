import { useMemo, useState } from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';

import { cn } from '../../lib/utils';
import { buttonVariants } from './button';

type MultiSelectOption = {
  /** 选项稳定值。 */
  value: string;
  /** 选项展示名。 */
  label: string;
  /** 是否禁用当前选项。 */
  disabled?: boolean;
};

type MultiSelectPopoverProps = {
  /** 控件标签。 */
  label: string;
  /** 未选择时的占位文案。 */
  placeholder: string;
  /** 已选择数量文案模板，使用 `{count}` 占位。 */
  summaryTemplate: string;
  /** 当前可选项。 */
  options: MultiSelectOption[];
  /** 当前选中值。 */
  values: string[];
  /** 空状态文案。 */
  emptyText: string;
  /** 是否禁用交互。 */
  disabled?: boolean;
  /** 选中变化回调。 */
  onChange(nextValues: string[]): void;
};

/** 多选下拉，负责紧凑展示和勾选多个模型引用。 */
export const MultiSelectPopover = ({
  label,
  placeholder,
  summaryTemplate,
  options,
  values,
  emptyText,
  disabled = false,
  onChange,
}: MultiSelectPopoverProps) => {
  const [open, setOpen] = useState(false);
  const valueSet = useMemo(() => new Set(values), [values]);
  const selectedCount = values.filter((value) => options.some((option) => option.value === value)).length;
  const summary = selectedCount > 0 ? summaryTemplate.replace('{count}', String(selectedCount)) : placeholder;

  /** 切换单个选项的勾选状态，并保持现有顺序稳定。 */
  const toggleValue = (value: string, checked: boolean) => {
    if (checked) {
      const nextValues = options.filter((option) => valueSet.has(option.value) || option.value === value).map((option) => option.value);
      onChange(nextValues);
      return;
    }

    onChange(values.filter((item) => item !== value));
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className={cn(buttonVariants({ variant: 'outline', className: 'w-full justify-between' }))}
          aria-label={label}
          disabled={disabled}
        >
          <span className={cn('truncate', selectedCount === 0 && 'text-muted-foreground')}>{summary}</span>
          <ChevronDownIcon className="size-3 text-muted-foreground" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          align="start"
          sideOffset={6}
          className={cn(
            'z-50 w-[var(--radix-popover-trigger-width)] min-w-48 border border-border/70 bg-popover p-2 ring-1 ring-foreground/5',
            'animate-in fade-in-0 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1',
          )}
        >
          {options.length > 0 ? (
            <div className="grid gap-1">
              {options.map((option) => {
                const checked = valueSet.has(option.value);

                return (
                  <label
                    key={option.value}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm transition-colors hover:bg-muted/35',
                      option.disabled && 'cursor-not-allowed opacity-50',
                    )}
                  >
                    <input
                      type="checkbox"
                      aria-label={`${label}:${option.label}`}
                      checked={checked}
                      disabled={disabled || option.disabled}
                      onChange={(event) => toggleValue(option.value, event.target.checked)}
                    />
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {checked ? <CheckIcon className="size-3 text-primary" /> : null}
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="m-0 px-2 py-1 text-sm text-muted-foreground">{emptyText}</p>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
};
