import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

type ReactRootContainer = HTMLElement & {
  /** 当前挂载节点复用的 React root。 */
  __thinkBotReactRoot__?: Root;
};

/** 读取并校验 React 入口挂载节点。 */
const getReactRootContainer = (containerId: string): ReactRootContainer => {
  const container = document.getElementById(containerId);
  if (!(container instanceof HTMLElement)) {
    throw new Error(`未找到 React 挂载节点: #${containerId}`);
  }

  return container as ReactRootContainer;
};

/** 复用同一容器上的 React root，避免 HMR 重复 createRoot。 */
export const renderEntrypointApp = (element: ReactNode, containerId = 'root') => {
  const container = getReactRootContainer(containerId);
  const root = container.__thinkBotReactRoot__ ?? createRoot(container);
  container.__thinkBotReactRoot__ = root;
  root.render(element);
};
