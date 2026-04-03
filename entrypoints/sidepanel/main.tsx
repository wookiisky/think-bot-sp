import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';

import '../../assets/styles/globals.css';

import { createSidebarApi } from '../../src/features/sidebar/sidebar-api';
import { SidebarShell } from '../../src/features/sidebar/sidebar-shell';

const root = createRoot(document.getElementById('root')!);
type SidebarContext = {
  /** 目标浏览器标签页 id。 */
  tabId: number;
  /** 目标页面 URL。 */
  pageUrl: string;
};

/** 从 URL query 中恢复显式传入的 side panel 上下文。 */
const readContextFromQuery = (): SidebarContext | null => {
  const params = new URLSearchParams(window.location.search);
  const tabId = Number(params.get('tabId') ?? '');
  const pageUrl = params.get('pageUrl') ?? '';
  if (!Number.isInteger(tabId) || tabId <= 0 || !pageUrl) {
    return null;
  }

  return {
    tabId,
    pageUrl,
  };
};

const App = () => {
  const [context, setContext] = useState<SidebarContext | null>(null);

  useEffect(() => {
    const queryContext = readContextFromQuery();
    if (queryContext) {
      setContext(queryContext);
      return;
    }

    void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      setContext({
        tabId: tab?.id ?? 0,
        pageUrl: tab?.url ?? '',
      });
    });
  }, []);

  if (!context) {
    return <main data-testid="sidebar-shell-loading">正在加载标签页上下文…</main>;
  }

  return <SidebarShell api={createSidebarApi()} tabId={context.tabId} pageUrl={context.pageUrl} />;
};

root.render(<App />);
