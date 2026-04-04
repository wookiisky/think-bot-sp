import {
  AlertCircleIcon,
  CheckCircle2Icon,
  LoaderCircleIcon,
  PauseCircleIcon,
  SparklesIcon,
} from 'lucide-react';

import { cn } from '../../lib/utils';

/** 工作台可视状态。 */
export type WorkspaceVisualStatus = 'idle' | 'loading' | 'done' | 'error' | 'cancelled' | 'auto';

type WorkspaceStatusGlyphProps = {
  /** 当前状态。 */
  status: WorkspaceVisualStatus;
  /** 无障碍名称。 */
  label: string;
  /** 外层样式。 */
  className?: string;
};

/** 工作台状态图标，统一收敛 loading / done / error 的视觉反馈。 */
export const WorkspaceStatusGlyph = ({ status, label, className }: WorkspaceStatusGlyphProps) => {
  if (status === 'loading') {
    return <LoaderCircleIcon aria-label={label} className={cn('animate-spin text-primary', className)} />;
  }

  if (status === 'done') {
    return <CheckCircle2Icon aria-label={label} className={cn('text-emerald-600', className)} />;
  }

  if (status === 'error') {
    return <AlertCircleIcon aria-label={label} className={cn('text-destructive', className)} />;
  }

  if (status === 'cancelled') {
    return <PauseCircleIcon aria-label={label} className={cn('text-muted-foreground', className)} />;
  }

  if (status === 'auto') {
    return <SparklesIcon aria-label={label} className={cn('text-amber-600', className)} />;
  }

  return <span aria-label={label} className={cn('size-2 rounded-full bg-border', className)} />;
};

