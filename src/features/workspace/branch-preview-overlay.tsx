import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from 'lucide-react';

import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { ChatMarkdown } from './chat-markdown';
import type { BranchPreviewDetail, WorkspaceTranslator } from './workspace-state';

type BranchPreviewOverlayProps = {
  /** 当前是否打开。 */
  open: boolean;
  /** 当前预览中的分支详情。 */
  preview: BranchPreviewDetail | null;
  /** 工作台翻译函数。 */
  t: WorkspaceTranslator;
  /** 关闭预览层。 */
  onClose: () => void;
};

type PreviewSize = {
  /** 预览层宽度。 */
  width: number;
  /** 预览层高度。 */
  height: number;
};

type PreviewResizeState = {
  /** 拖拽开始时的鼠标横坐标。 */
  startX: number;
  /** 拖拽开始时的鼠标纵坐标。 */
  startY: number;
  /** 拖拽开始时的宽度。 */
  startWidth: number;
  /** 拖拽开始时的高度。 */
  startHeight: number;
};

const DEFAULT_PREVIEW_WIDTH = 760;
const DEFAULT_PREVIEW_HEIGHT = 560;
const MIN_PREVIEW_WIDTH = 480;
const MIN_PREVIEW_HEIGHT = 320;
const PREVIEW_VIEWPORT_GAP = 32;

/** 约束预览层宽高，避免拖拽超出视口。 */
const clampPreviewSize = (size: PreviewSize): PreviewSize => {
  if (typeof window === 'undefined') {
    return size;
  }

  const maxWidth = Math.max(MIN_PREVIEW_WIDTH, window.innerWidth - PREVIEW_VIEWPORT_GAP);
  const maxHeight = Math.max(MIN_PREVIEW_HEIGHT, window.innerHeight - PREVIEW_VIEWPORT_GAP);
  return {
    width: Math.min(maxWidth, Math.max(MIN_PREVIEW_WIDTH, size.width)),
    height: Math.min(maxHeight, Math.max(MIN_PREVIEW_HEIGHT, size.height)),
  };
};

/** 分支内容独立预览层。 */
export const BranchPreviewOverlay = ({ open, preview, t, onClose }: BranchPreviewOverlayProps) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<PreviewSize>(() =>
    clampPreviewSize({
      width: DEFAULT_PREVIEW_WIDTH,
      height: DEFAULT_PREVIEW_HEIGHT,
    }),
  );
  const [resizeState, setResizeState] = useState<PreviewResizeState | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setSize(
      clampPreviewSize({
        width: DEFAULT_PREVIEW_WIDTH,
        height: DEFAULT_PREVIEW_HEIGHT,
      }),
    );
  }, [open, preview?.branchId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    panelRef.current?.focus();
  }, [open, preview?.branchId]);

  useEffect(() => {
    if (!resizeState) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      setSize(
        clampPreviewSize({
          width: resizeState.startWidth + (event.clientX - resizeState.startX),
          height: resizeState.startHeight + (event.clientY - resizeState.startY),
        }),
      );
    };
    const handlePointerUp = () => {
      setResizeState(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [resizeState]);

  if (!open || !preview || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      data-testid="branch-preview-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="branch-preview-dialog"
        tabIndex={-1}
        className="relative flex max-w-full flex-col overflow-hidden rounded-2xl border border-border/80 bg-background shadow-2xl outline-none"
        style={size}
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border/80 px-5 py-4">
          <h2 id={titleId} className="min-w-0 truncate text-base font-semibold text-foreground">
            {preview.modelLabel}
          </h2>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t('workspace.closeBranchPreview')} onClick={onClose}>
            <XIcon />
          </Button>
        </header>

        <div data-testid="branch-preview-content" className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <ChatMarkdown content={preview.content} className="text-sm leading-6" />
          {preview.status === 'error' ? (
            <p className="mt-4 text-xs text-destructive">{preview.errorMessage ?? t('workspace.status.error')}</p>
          ) : null}
          {preview.status === 'cancelled' ? (
            <p className="mt-4 text-xs text-muted-foreground">{preview.errorMessage ?? t('workspace.status.cancelled')}</p>
          ) : null}
        </div>

        <div className="pointer-events-none absolute bottom-0 right-0 p-2">
          <button
            type="button"
            aria-label={t('workspace.resizeBranchPreview')}
            data-testid="branch-preview-resize-handle"
            className={cn(
              'pointer-events-auto h-5 w-5 cursor-se-resize rounded-sm border border-border/80 bg-background/90',
              'bg-[linear-gradient(135deg,transparent_0_45%,rgba(148,163,184,.9)_45_55%,transparent_55_65%,rgba(148,163,184,.9)_65_75%,transparent_75_100%)]',
            )}
            onPointerDown={(event) => {
              event.preventDefault();
              setResizeState({
                startX: event.clientX,
                startY: event.clientY,
                startWidth: size.width,
                startHeight: size.height,
              });
            }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
};
