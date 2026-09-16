import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { PageSummary } from '../../domain/page/page-summary';

type HistoryPagesOptions = {
  /** 保留后台的全文搜索，前端只调度读取。 */
  api: {
    listPages(): Promise<{ pages: PageSummary[] }>;
    searchPages(query: string): Promise<{ pages: PageSummary[] }>;
  };
  /** 由页面决定如何展示读取错误。 */
  onError?: (error: unknown) => void;
};

/** 管理历史列表读取；选中项变化不会触发存储访问。 */
export const useHistoryPages = ({ api, onError }: HistoryPagesOptions) => {
  const [list, setList] = useState<{ pages: PageSummary[]; selectedPageUrl: string | null }>({
    pages: [], selectedPageUrl: null,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const requestVersion = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onErrorRef = useRef(onError);
  const queryRef = useRef({ api, searchQuery });

  useLayoutEffect(() => { onErrorRef.current = onError; }, [onError]);

  // 输入改变就淘汰旧请求，不能等到防抖时间结束才失效。
  useLayoutEffect(() => {
    queryRef.current = { api, searchQuery };
    requestVersion.current += 1;
    return () => { requestVersion.current += 1; };
  }, [api, searchQuery]);

  /** 立即刷新当前查询，供标题保存或删除后调用。 */
  const refresh = useCallback(async () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const version = ++requestVersion.current;
    const { api, searchQuery } = queryRef.current;
    setStatus('loading');
    try {
      const response = searchQuery.trim() ? await api.searchPages(searchQuery) : await api.listPages();
      if (version !== requestVersion.current) return;
      setList((current) => ({
        pages: response.pages,
        selectedPageUrl: response.pages.some((page) => page.normalizedUrl === current.selectedPageUrl)
          ? current.selectedPageUrl
          : response.pages[0]?.normalizedUrl ?? null,
      }));
      setStatus('ready');
    } catch (error) {
      if (version !== requestVersion.current) return;
      setStatus('error');
      onErrorRef.current?.(error);
    }
  }, []);

  useEffect(() => {
    if (searchQuery.trim()) timer.current = setTimeout(() => { void refresh(); }, 200);
    else void refresh();
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [api, refresh, searchQuery]);

  /** 选择页面只更新界面，不重新读取列表。 */
  const selectPage = (selectedPageUrl: string | null) => setList((current) => ({ ...current, selectedPageUrl }));

  /** 先呈现已确认的标题，再刷新排序和搜索匹配；刷新失败保留保存结果。 */
  const pageUpdated = (page: PageSummary) => {
    setList((current) => ({ ...current, pages: current.pages.map((item) => item.normalizedUrl === page.normalizedUrl ? page : item) }));
    return refresh();
  };

  /** 先移除已确认删除的页面，避免后续列表读取失败时仍能操作旧页面。 */
  const pageDeleted = (normalizedUrl: string) => {
    setList((current) => {
      const pages = current.pages.filter((page) => page.normalizedUrl !== normalizedUrl);
      return {
        pages,
        selectedPageUrl: current.selectedPageUrl === normalizedUrl ? pages[0]?.normalizedUrl ?? null : current.selectedPageUrl,
      };
    });
    return refresh();
  };

  return { ...list, searchQuery, status, selectPage, setSearchQuery, refresh, pageUpdated, pageDeleted };
};
