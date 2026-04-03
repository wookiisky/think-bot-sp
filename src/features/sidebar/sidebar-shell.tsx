import { useEffect, useState } from 'react';

import type { SidebarApi } from './sidebar-api';

type ExtractionMethod = 'readability' | 'jina';
type SidebarState = 'bootstrapping' | 'blocked' | 'extracting' | 'ready' | 'error';

type SidebarShellProps = {
  /** side panel 消息 API。 */
  api: SidebarApi;
  /** 当前浏览器标签页 id。 */
  tabId: number;
  /** 当前页面 URL。 */
  pageUrl: string;
};

/** 渲染阶段 3 的最小侧边栏工作台。 */
export const SidebarShell = ({ api, tabId, pageUrl }: SidebarShellProps) => {
  const [state, setState] = useState<SidebarState>('bootstrapping');
  const [content, setContent] = useState('');
  const [method, setMethod] = useState<ExtractionMethod>('readability');

  /** 执行一次正文提取并同步 UI 状态。 */
  const runExtraction = async (nextMethod: ExtractionMethod) => {
    setState('extracting');
    const extraction = await api.reExtractContent({
      tabId,
      pageUrl,
      method: nextMethod,
    });
    setContent(extraction.payload.content);
    setMethod(extraction.payload.extractionMethod);
    setState('ready');
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const bootstrap = await api.getSidebarBootstrap({ tabId, pageUrl });
        if (cancelled) {
          return;
        }

        const nextMethod = bootstrap.page?.extractionMethod ?? 'readability';
        setMethod(nextMethod);
        setContent(bootstrap.page?.content ?? '');

        if (bootstrap.blockedByBlacklist) {
          setState('blocked');
          return;
        }

        if (!bootstrap.shouldExtract) {
          setState('ready');
          return;
        }

        setState('extracting');
        const extraction = await api.reExtractContent({ tabId, pageUrl, method: nextMethod });
        if (cancelled) {
          return;
        }

        setContent(extraction.payload.content);
        setMethod(extraction.payload.extractionMethod);
        setState('ready');
      } catch {
        if (!cancelled) {
          setState('error');
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [api, pageUrl, tabId]);

  /** 黑名单放行后继续当前页面提取。 */
  const handleConfirmContinue = async () => {
    await api.confirmBlacklistContinue({ tabId, pageUrl });
    try {
      await runExtraction(method);
    } catch {
      setState('error');
    }
  };

  /** 切换提取方式并立即重新提取。 */
  const handleSwitchMethod = async (nextMethod: ExtractionMethod) => {
    if (nextMethod === method || state === 'bootstrapping' || state === 'blocked') {
      return;
    }

    try {
      await api.switchExtractionMethod({ tabId, pageUrl, method: nextMethod });
      await runExtraction(nextMethod);
    } catch {
      setState('error');
    }
  };

  return (
    <main data-testid="sidebar-shell" className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-2">
            <button type="button" aria-pressed={method === 'readability'} onClick={() => void handleSwitchMethod('readability')}>
              Readability
            </button>
            <button type="button" aria-pressed={method === 'jina'} onClick={() => void handleSwitchMethod('jina')}>
              Jina
            </button>
          </div>
          <span className="text-xs text-muted-foreground">browserTab #{tabId}</span>
        </div>
      </header>

      <section data-testid="sidebar-extraction-panel" className="min-h-48 border-b border-border px-4 py-3">
        {state === 'bootstrapping' ? <p>正在恢复页面上下文…</p> : null}
        {state === 'blocked' ? (
          <div className="space-y-3">
            <p>当前页面命中黑名单</p>
            <p>等待放行</p>
            <button type="button" onClick={() => void handleConfirmContinue()}>
              继续提取
            </button>
          </div>
        ) : null}
        {state === 'extracting' ? <p>正在提取页面正文…</p> : null}
        {state === 'error' ? <p>提取失败，请重试。</p> : null}
        {content ? <article className="whitespace-pre-wrap">{content}</article> : null}
      </section>

      <section className="border-b border-border px-4 py-2">
        <button role="tab" aria-selected="true" type="button">
          Chat
        </button>
      </section>

      <section className="flex-1 px-4 py-3 text-sm text-muted-foreground">
        阶段 3 仅接入提取区和最小聊天占位，真实流式聊天在阶段 4 落地。
      </section>
    </main>
  );
};
