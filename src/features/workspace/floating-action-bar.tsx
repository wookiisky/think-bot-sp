import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

import { cn } from '../../lib/utils';
import { COMPACT_FLOATING_ACTION_CLASS } from '../../ui/compact-layout';

type FloatingActionOrientation = 'vertical' | 'horizontal';

type FloatingActionBarProps = {
  /** 浮层测试标识。 */
  testId: string;
  /** 当前是否展示。 */
  visible: boolean;
  /** 垂直布局时的按钮数量。 */
  actionCount: number;
  /** 单个按钮视觉尺寸。 */
  buttonSizePx: number;
  /** 垂直布局容器定位。 */
  verticalWrapperClassName: string;
  /** 横向布局容器定位。 */
  horizontalWrapperClassName: string;
  /** 宿主节点选择器。 */
  ownerSelector?: string;
  /** 纵向布局定位模式。 */
  verticalPositionMode?: 'owner-center' | 'visible-center';
  /** 纵向滚动视口引用。 */
  scrollViewportRef?: RefObject<HTMLElement | null>;
  /** 按钮内容。 */
  children: ReactNode;
};

const DEFAULT_OWNER_SELECTOR = '[data-testid^="chat-message-bubble-"], [data-testid^="branch-"]';
const FLOATING_ACTION_GAP_PX = 2;
const FLOATING_ACTION_BAR_PADDING_PX = 4;

/** 统一计算纵向按钮条高度，供定位逻辑复用。 */
const resolveFloatingActionBarHeight = (actionCount: number, buttonSizePx: number) =>
  actionCount * buttonSizePx + Math.max(actionCount - 1, 0) * FLOATING_ACTION_GAP_PX + FLOATING_ACTION_BAR_PADDING_PX * 2;

/** 根据容器高度选择悬浮按钮方向，避免短消息被竖排按钮撑高。 */
const resolveFloatingActionOrientation = (
  containerHeight: number,
  actionCount: number,
  buttonSizePx: number,
): FloatingActionOrientation => {
  if (containerHeight <= 0) {
    return 'vertical';
  }

  const requiredVerticalHeight =
    actionCount * buttonSizePx +
    Math.max(actionCount - 1, 0) * FLOATING_ACTION_GAP_PX +
    FLOATING_ACTION_BAR_PADDING_PX * 2;
  return containerHeight < requiredVerticalHeight ? 'horizontal' : 'vertical';
};

/** 从悬浮按钮条定位宿主节点。 */
const resolveFloatingActionOwner = (overlayElement: HTMLDivElement | null, ownerSelector: string): HTMLElement | null =>
  overlayElement?.parentElement?.closest<HTMLElement>(ownerSelector) ?? overlayElement?.parentElement ?? null;

/** 统一悬浮按钮条，按宿主高度在横排和竖排之间切换。 */
export const FloatingActionBar = ({
  testId,
  visible,
  actionCount,
  buttonSizePx,
  verticalWrapperClassName,
  horizontalWrapperClassName,
  ownerSelector = DEFAULT_OWNER_SELECTOR,
  verticalPositionMode = 'owner-center',
  scrollViewportRef,
  children,
}: FloatingActionBarProps) => {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [orientation, setOrientation] = useState<FloatingActionOrientation>('vertical');
  const [visibleCenterOffsetPx, setVisibleCenterOffsetPx] = useState<number | null>(null);

  useEffect(() => {
    const ownerElement = resolveFloatingActionOwner(overlayRef.current, ownerSelector);
    if (!ownerElement) {
      return;
    }

    const updateOrientation = () => {
      setOrientation(resolveFloatingActionOrientation(ownerElement.clientHeight, actionCount, buttonSizePx));
    };

    updateOrientation();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateOrientation);
      return () => {
        window.removeEventListener('resize', updateOrientation);
      };
    }

    const resizeObserver = new ResizeObserver(() => {
      updateOrientation();
    });
    resizeObserver.observe(ownerElement);
    return () => {
      resizeObserver.disconnect();
    };
  }, [actionCount, buttonSizePx, ownerSelector]);

  useEffect(() => {
    const overlayElement = overlayRef.current;
    const ownerElement = resolveFloatingActionOwner(overlayElement, ownerSelector);
    const viewportElement = scrollViewportRef?.current ?? null;
    if (!overlayElement || !ownerElement || !viewportElement || orientation !== 'vertical' || verticalPositionMode !== 'visible-center') {
      setVisibleCenterOffsetPx(null);
      return;
    }

    const halfActionBarHeight = resolveFloatingActionBarHeight(actionCount, buttonSizePx) / 2;
    const updateVerticalPosition = () => {
      const ownerRect = ownerElement.getBoundingClientRect();
      const viewportRect = viewportElement.getBoundingClientRect();
      const ownerHeight = ownerRect.height > 0 ? ownerRect.height : Math.max(ownerRect.bottom - ownerRect.top, 0);
      const visibleTop = Math.max(ownerRect.top, viewportRect.top);
      const visibleBottom = Math.min(ownerRect.bottom, viewportRect.bottom);
      const visibleCenterY = visibleBottom > visibleTop ? (visibleTop + visibleBottom) / 2 : ownerRect.top + ownerHeight / 2;
      const rawOffsetPx = visibleCenterY - ownerRect.top;
      const maxOffsetPx = Math.max(ownerHeight - halfActionBarHeight, halfActionBarHeight);
      const nextOffsetPx = Math.min(Math.max(rawOffsetPx, halfActionBarHeight), maxOffsetPx);
      setVisibleCenterOffsetPx(nextOffsetPx);
    };

    updateVerticalPosition();
    viewportElement.addEventListener('scroll', updateVerticalPosition, { passive: true });
    window.addEventListener('resize', updateVerticalPosition);

    if (typeof ResizeObserver === 'undefined') {
      return () => {
        viewportElement.removeEventListener('scroll', updateVerticalPosition);
        window.removeEventListener('resize', updateVerticalPosition);
      };
    }

    const resizeObserver = new ResizeObserver(() => {
      updateVerticalPosition();
    });
    resizeObserver.observe(ownerElement);
    resizeObserver.observe(viewportElement);
    return () => {
      viewportElement.removeEventListener('scroll', updateVerticalPosition);
      window.removeEventListener('resize', updateVerticalPosition);
      resizeObserver.disconnect();
    };
  }, [actionCount, buttonSizePx, orientation, ownerSelector, scrollViewportRef, verticalPositionMode]);

  return (
    <div
      ref={overlayRef}
      className={cn(
        'pointer-events-none absolute z-20',
        orientation === 'vertical' ? verticalWrapperClassName : horizontalWrapperClassName,
      )}
    >
      <div
        data-testid={testId}
        data-action-orientation={orientation}
        className={cn(
          COMPACT_FLOATING_ACTION_CLASS,
          orientation === 'vertical'
            ? verticalPositionMode === 'visible-center'
              ? 'absolute right-0 flex -translate-y-1/2 flex-col'
              : 'sticky top-1/2 flex -translate-y-1/2 flex-col'
            : 'ml-auto flex flex-row items-center',
          visible ? 'pointer-events-auto visible opacity-100' : 'pointer-events-none invisible opacity-0',
        )}
        style={
          orientation === 'vertical' && verticalPositionMode === 'visible-center' && visibleCenterOffsetPx !== null
            ? { top: `${visibleCenterOffsetPx}px`, right: 0 }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
};
