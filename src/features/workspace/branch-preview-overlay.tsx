import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronsDownIcon, ChevronsUpIcon, CopyIcon, FileCode2Icon, Maximize2Icon, XIcon } from 'lucide-react';

import { Button } from '../../components/ui/button';
import { Tooltip } from '../../components/ui/tooltip';
import type { AssistantMarkdownDisplayConfig } from '../../domain/config/assistant-markdown-display-config';
import { COMPACT_RESIZE_CORNER_BUTTON_CLASS } from '../../ui/compact-layout';
import { ChatMarkdown } from './chat-markdown';
import { FloatingActionBar } from './floating-action-bar';
import { normalizeMessageCopyContent, type MessageCopyMode } from './message-copy';
import type { BranchPreviewDetail } from './workspace-state';
import type { WorkspaceTranslator } from './workspace-copy';

type BranchPreviewOverlayProps = {
  /** 当前是否打开。 */
  open: boolean;
  /** 当前预览中的分支详情。 */
  preview: BranchPreviewDetail | null;
  /** 工作台翻译函数。 */
  t: WorkspaceTranslator;
  /** 助手消息 Markdown 展示配置。 */
  assistantMarkdownDisplayConfig: AssistantMarkdownDisplayConfig;
  /** 关闭预览层。 */
  onClose: () => void;
  /** 更新当前工作台提示。 */
  onNotice: (...input: [notice: string]) => void;
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

type PreviewPosition = {
  /** 预览层左侧坐标。 */
  left: number;
  /** 预览层顶部坐标。 */
  top: number;
};

type PreviewMoveState = {
  /** 拖拽开始时的鼠标横坐标。 */
  startX: number;
  /** 拖拽开始时的鼠标纵坐标。 */
  startY: number;
  /** 拖拽开始时的左侧坐标。 */
  startLeft: number;
  /** 拖拽开始时的顶部坐标。 */
  startTop: number;
};

const DEFAULT_PREVIEW_WIDTH = 760;
const DEFAULT_PREVIEW_HEIGHT = 560;
const MIN_PREVIEW_WIDTH = 480;
const MIN_PREVIEW_HEIGHT = 320;
const PREVIEW_VIEWPORT_GAP = 32;
const PREVIEW_VIEWPORT_MARGIN = PREVIEW_VIEWPORT_GAP / 2;
const PREVIEW_ACTION_BUTTON_SIZE_PX = 20;
const PREVIEW_ACTION_COUNT = 4;

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

/** 约束预览层位置，保证窗口完整留在视口内。 */
const clampPreviewPosition = (position: PreviewPosition, size: PreviewSize): PreviewPosition => {
  if (typeof window === 'undefined') {
    return position;
  }

  const maxLeft = Math.max(PREVIEW_VIEWPORT_MARGIN, window.innerWidth - size.width - PREVIEW_VIEWPORT_MARGIN);
  const maxTop = Math.max(PREVIEW_VIEWPORT_MARGIN, window.innerHeight - size.height - PREVIEW_VIEWPORT_MARGIN);
  return {
    left: Math.min(maxLeft, Math.max(PREVIEW_VIEWPORT_MARGIN, position.left)),
    top: Math.min(maxTop, Math.max(PREVIEW_VIEWPORT_MARGIN, position.top)),
  };
};

/** 计算默认预览层尺寸。 */
const getDefaultPreviewSize = (): PreviewSize =>
  clampPreviewSize({
    width: DEFAULT_PREVIEW_WIDTH,
    height: DEFAULT_PREVIEW_HEIGHT,
  });

/** 计算默认居中位置。 */
const getCenteredPreviewPosition = (size: PreviewSize): PreviewPosition => {
  if (typeof window === 'undefined') {
    return {
      left: PREVIEW_VIEWPORT_MARGIN,
      top: PREVIEW_VIEWPORT_MARGIN,
    };
  }

  return clampPreviewPosition(
    {
      left: (window.innerWidth - size.width) / 2,
      top: (window.innerHeight - size.height) / 2,
    },
    size,
  );
};

/** 分支内容独立预览层。 */
export const BranchPreviewOverlay = ({
  open,
  preview,
  t,
  assistantMarkdownDisplayConfig,
  onClose,
  onNotice,
}: BranchPreviewOverlayProps) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const suppressOverlayClickRef = useRef(false);
  const suppressOverlayClickResetTimerRef = useRef<number | null>(null);
  const [size, setSize] = useState<PreviewSize>(() => getDefaultPreviewSize());
  const [position, setPosition] = useState<PreviewPosition>(() => getCenteredPreviewPosition(getDefaultPreviewSize()));
  const [resizeState, setResizeState] = useState<PreviewResizeState | null>(null);
  const [moveState, setMoveState] = useState<PreviewMoveState | null>(null);
  const [actionsVisible, setActionsVisible] = useState(false);

  const clearOverlayClickResetTimer = useCallback(() => {
    if (suppressOverlayClickResetTimerRef.current === null || typeof window === 'undefined') {
      return;
    }

    window.clearTimeout(suppressOverlayClickResetTimerRef.current);
    suppressOverlayClickResetTimerRef.current = null;
  }, []);

  const beginPointerInteraction = useCallback(() => {
    clearOverlayClickResetTimer();
    suppressOverlayClickRef.current = true;
  }, [clearOverlayClickResetTimer]);

  const scheduleOverlayClickSuppressionReset = useCallback(() => {
    clearOverlayClickResetTimer();
    if (typeof window === 'undefined') {
      suppressOverlayClickRef.current = false;
      return;
    }

    suppressOverlayClickResetTimerRef.current = window.setTimeout(() => {
      suppressOverlayClickRef.current = false;
      suppressOverlayClickResetTimerRef.current = null;
    }, 0);
  }, [clearOverlayClickResetTimer]);

  /** 滚动预览内容到顶部或底部。 */
  const scrollPreviewContent = (positionTarget: 'top' | 'bottom') => {
    const contentElement = contentRef.current;
    if (!contentElement) {
      return;
    }

    contentElement.scrollTop = positionTarget === 'top' ? 0 : contentElement.scrollHeight;
  };

  /** 复制预览内容。 */
  const handleCopyPreview = async (mode: MessageCopyMode) => {
    if (!preview) {
      return;
    }

    const nextContent = normalizeMessageCopyContent(preview.content, mode);
    if (!nextContent.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(nextContent);
      onNotice(mode === 'plain' ? t('workspace.notice.copyPlainSuccess') : t('workspace.notice.copyMarkdownSuccess'));
    } catch {
      onNotice(mode === 'plain' ? t('workspace.notice.copyPlainFailed') : t('workspace.notice.copyMarkdownFailed'));
    }
  };

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
    return () => {
      clearOverlayClickResetTimer();
    };
  }, [clearOverlayClickResetTimer]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const nextSize = getDefaultPreviewSize();
    setSize(nextSize);
    setPosition(getCenteredPreviewPosition(nextSize));
  }, [open, preview?.id]);

  useEffect(() => {
    if (!open) {
      return;
    }

    panelRef.current?.focus();
  }, [open, preview?.id]);

  useEffect(() => {
    if (!resizeState) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const nextSize = clampPreviewSize({
        width: resizeState.startWidth + (event.clientX - resizeState.startX),
        height: resizeState.startHeight + (event.clientY - resizeState.startY),
      });
      setSize(nextSize);
      setPosition((currentPosition) => clampPreviewPosition(currentPosition, nextSize));
    };
    const handlePointerUp = () => {
      setResizeState(null);
      scheduleOverlayClickSuppressionReset();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [resizeState, scheduleOverlayClickSuppressionReset]);

  useEffect(() => {
    if (!moveState) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      setPosition(
        clampPreviewPosition(
          {
            left: moveState.startLeft + (event.clientX - moveState.startX),
            top: moveState.startTop + (event.clientY - moveState.startY),
          },
          size,
        ),
      );
    };
    const handlePointerUp = () => {
      setMoveState(null);
      scheduleOverlayClickSuppressionReset();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [moveState, scheduleOverlayClickSuppressionReset, size]);

  if (!open || !preview || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      data-testid="branch-preview-overlay"
      className="fixed inset-0 z-50 bg-background/55"
      onClick={(event) => {
        if (suppressOverlayClickRef.current) {
          suppressOverlayClickRef.current = false;
          clearOverlayClickResetTimer();
          return;
        }

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
        className="absolute flex max-w-full flex-col overflow-hidden border border-border/80 bg-background ring-1 ring-foreground/8 outline-none"
        style={{ ...size, ...position }}
        onMouseEnter={() => setActionsVisible(true)}
        onMouseLeave={(event) => {
          const relatedTarget = event.relatedTarget;
          if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) {
            return;
          }
          setActionsVisible(false);
        }}
        onFocus={() => setActionsVisible(true)}
        onBlur={(event) => {
          const relatedTarget = event.relatedTarget;
          if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) {
            return;
          }
          setActionsVisible(false);
        }}
      >
        <header
          data-testid="branch-preview-titlebar"
          className="flex shrink-0 cursor-move select-none items-center justify-between gap-2 border-b border-border/80 px-3 py-2"
          onPointerDown={(event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement) || target.closest('button')) {
              return;
            }

            event.preventDefault();
            beginPointerInteraction();
            setMoveState({
              startX: event.clientX,
              startY: event.clientY,
              startLeft: position.left,
              startTop: position.top,
            });
          }}
        >
          <h2 id={titleId} className="min-w-0 truncate text-base font-semibold text-foreground">
            {preview.modelLabel}
          </h2>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t('workspace.closeBranchPreview')} onClick={onClose}>
            <XIcon />
          </Button>
        </header>

        <FloatingActionBar
          testId="branch-preview-actions"
          visible={actionsVisible}
          actionCount={PREVIEW_ACTION_COUNT}
          buttonSizePx={PREVIEW_ACTION_BUTTON_SIZE_PX}
          verticalWrapperClassName="inset-y-0 right-px"
          horizontalWrapperClassName="top-1 right-px"
          ownerSelector='[data-testid="branch-preview-dialog"]'
        >
          <Tooltip content={t('workspace.scrollToMessageTop')}>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t('workspace.scrollToMessageTop')}
              onClick={() => scrollPreviewContent('top')}
            >
              <ChevronsUpIcon />
            </Button>
          </Tooltip>
          <Tooltip content={t('workspace.scrollToMessageBottom')}>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t('workspace.scrollToMessageBottom')}
              onClick={() => scrollPreviewContent('bottom')}
            >
              <ChevronsDownIcon />
            </Button>
          </Tooltip>
          <Tooltip content={t('workspace.copyPlainText')}>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t('workspace.copyPlainText')}
              onClick={() => void handleCopyPreview('plain')}
            >
              <CopyIcon />
            </Button>
          </Tooltip>
          <Tooltip content={t('workspace.copyMarkdown')}>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t('workspace.copyMarkdown')}
              onClick={() => void handleCopyPreview('markdown')}
            >
              <FileCode2Icon />
            </Button>
          </Tooltip>
        </FloatingActionBar>

        <div ref={contentRef} data-testid="branch-preview-content" className="min-h-0 flex-1 overflow-y-auto px-3 py-2 pr-10">
          <ChatMarkdown
            content={preview.content}
            className="text-sm leading-6"
            assistantDisplayConfig={assistantMarkdownDisplayConfig}
          />
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
            className={COMPACT_RESIZE_CORNER_BUTTON_CLASS}
            onPointerDown={(event) => {
              event.preventDefault();
              beginPointerInteraction();
              setResizeState({
                startX: event.clientX,
                startY: event.clientY,
                startWidth: size.width,
                startHeight: size.height,
              });
            }}
          >
            <Maximize2Icon className="size-3" />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
