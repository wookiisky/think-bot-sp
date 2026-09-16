import { useEffect, useState } from 'react';

type DragState = {
  /** 拖拽开始时的指针坐标。 */
  start: number;
  /** 拖拽开始时的尺寸。 */
  startSize: number;
};

/** 通过窗口级 pointer 事件拖拽调整一个尺寸；轴向决定读取 clientX 还是 clientY。 */
export const useDragResize = ({
  axis,
  initialSize,
  clamp,
}: {
  /** 拖拽轴向。 */
  axis: 'x' | 'y';
  /** 初始尺寸。 */
  initialSize: number;
  /** 尺寸约束；应传入稳定引用。 */
  clamp: (size: number) => number;
}) => {
  const [size, setSizeState] = useState(() => clamp(initialSize));
  const [dragState, setDragState] = useState<DragState | null>(null);

  useEffect(() => {
    if (!dragState) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const position = axis === 'x' ? event.clientX : event.clientY;
      setSizeState(clamp(dragState.startSize + (position - dragState.start)));
    };
    const handlePointerUp = () => {
      setDragState(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [axis, clamp, dragState]);

  /** 从拖拽手柄的 pointerdown 开始一次拖拽。 */
  const startDrag = (event: { clientX: number; clientY: number }) => {
    setDragState({ start: axis === 'x' ? event.clientX : event.clientY, startSize: size });
  };

  /** 程序化设置尺寸，例如从配置恢复。 */
  const setSize = (next: number) => setSizeState(clamp(next));

  return { size, setSize, startDrag };
};
