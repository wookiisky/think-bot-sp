import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PageSummary } from '../../../src/domain/page/page-summary';
import { useHistoryPages } from '../../../src/features/conversations/use-history-pages';

/** 创建包含列表所需字段的页面。 */
const page = (name: string): PageSummary => ({ normalizedUrl: name, url: name, title: name, faviconUrl: '' });
/** 创建可控制响应顺序的列表请求。 */
const deferred = () => {
  let resolve!: (value: { pages: PageSummary[] }) => void;
  const promise = new Promise<{ pages: PageSummary[] }>((done) => { resolve = done; });
  return { promise, resolve };
};
/** 建立最小历史列表 API。 */
const createApi = () => ({
  listPages: vi.fn().mockResolvedValue({ pages: [page('A'), page('B')] }),
  searchPages: vi.fn().mockResolvedValue({ pages: [page('B')] }),
});

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('历史列表读取', () => {
  it('首次只读取一次，切换页面不重新读取', async () => {
    const api = createApi();
    const { result } = renderHook(() => useHistoryPages({ api }));
    await act(async () => {});
    expect(api.listPages).toHaveBeenCalledTimes(1);
    expect(result.current.selectedPageUrl).toBe('A');
    act(() => result.current.selectPage('B'));
    expect(api.listPages).toHaveBeenCalledTimes(1);
    expect(result.current.selectedPageUrl).toBe('B');
  });

  it('连续输入只在最后一次输入 200ms 后搜索，保留正文搜索 API', async () => {
    vi.useFakeTimers();
    const api = createApi();
    const { result } = renderHook(() => useHistoryPages({ api }));
    await act(async () => {});
    act(() => result.current.setSearchQuery('正'));
    await act(async () => { vi.advanceTimersByTime(100); });
    act(() => result.current.setSearchQuery('正文'));
    await act(async () => { vi.advanceTimersByTime(199); });
    expect(api.searchPages).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(api.searchPages).toHaveBeenCalledExactlyOnceWith('正文');
    expect(result.current.selectedPageUrl).toBe('B');
  });

  it('新搜索尚在防抖时就忽略旧响应，包括查询 A→B→A', async () => {
    vi.useFakeTimers();
    const api = createApi();
    const old = deferred();
    api.searchPages.mockReturnValueOnce(old.promise);
    const { result } = renderHook(() => useHistoryPages({ api }));
    await act(async () => {});
    act(() => result.current.setSearchQuery('A'));
    await act(async () => { vi.advanceTimersByTime(200); });
    act(() => result.current.setSearchQuery('B'));
    act(() => result.current.setSearchQuery('A'));
    await act(async () => { old.resolve({ pages: [page('过期')] }); });
    expect(result.current.pages.map((item) => item.title)).toEqual(['A', 'B']);
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(result.current.pages).toEqual([page('B')]);
  });

  it('显式刷新沿用当前搜索并保留有效选择，删除后选下一页', async () => {
    vi.useFakeTimers();
    const api = createApi();
    const { result } = renderHook(() => useHistoryPages({ api }));
    await act(async () => {});
    const refreshBeforeSearch = result.current.refresh;
    act(() => result.current.selectPage('B'));
    await act(async () => { await result.current.refresh(); });
    expect(result.current.selectedPageUrl).toBe('B');
    api.listPages.mockResolvedValue({ pages: [page('A')] });
    await act(async () => { await result.current.refresh(); });
    expect(result.current.selectedPageUrl).toBe('A');
    act(() => result.current.setSearchQuery('正文'));
    await act(async () => { await refreshBeforeSearch(); });
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(api.searchPages).toHaveBeenCalledExactlyOnceWith('正文');
  });

  it('较早的刷新不能覆盖新结果，卸载后不通知错误', async () => {
    const api = createApi();
    const first = deferred();
    api.listPages.mockReturnValueOnce(first.promise);
    const onError = vi.fn();
    const { result, unmount } = renderHook(() => useHistoryPages({ api, onError }));
    await act(async () => { await result.current.refresh(); });
    await act(async () => { first.resolve({ pages: [page('过期')] }); });
    expect(result.current.pages).toEqual([page('A'), page('B')]);
    let reject!: (error: Error) => void;
    api.listPages.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
    act(() => { void result.current.refresh(); });
    unmount();
    await act(async () => { reject(new Error('offline')); });
    expect(onError).not.toHaveBeenCalled();
  });

  it('读取失败保留已有结果，显式刷新可以恢复', async () => {
    const api = createApi();
    const onError = vi.fn();
    const { result } = renderHook(() => useHistoryPages({ api, onError }));
    await act(async () => {});
    api.listPages.mockRejectedValueOnce(new Error('offline'));
    await act(async () => { await result.current.refresh(); });
    expect(result.current.status).toBe('error');
    expect(result.current.pages).toEqual([page('A'), page('B')]);
    expect(onError).toHaveBeenCalledOnce();
    api.listPages.mockResolvedValue({ pages: [] });
    await act(async () => { await result.current.refresh(); });
    expect(result.current.status).toBe('ready');
    expect(result.current.selectedPageUrl).toBeNull();
  });

  it('已保存的标题和已删除页面不会因后续刷新失败而回退', async () => {
    const api = createApi();
    const { result } = renderHook(() => useHistoryPages({ api }));
    await act(async () => {});
    api.listPages.mockRejectedValue(new Error('offline'));
    await act(async () => { await result.current.pageUpdated({ ...page('A'), title: '新标题' }); });
    expect(result.current.pages[0]?.title).toBe('新标题');
    await act(async () => { await result.current.pageDeleted('A'); });
    expect(result.current.pages).toEqual([page('B')]);
    expect(result.current.selectedPageUrl).toBe('B');
  });
});
