import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { usePageScope } from '../../../src/features/workspace/use-page-scope';

describe('页面命令生命周期', () => {
  it('A → B → A 后，最初 A 页面发出的命令仍过期', () => {
    const { result, rerender } = renderHook(({ page }) => usePageScope(page), { initialProps: { page: 'A' } });
    const originalPage = result.current;
    expect(originalPage()).toBe(true);
    rerender({ page: 'B' });
    expect(originalPage()).toBe(false);
    rerender({ page: 'A' });
    expect(originalPage()).toBe(false);
    expect(result.current()).toBe(true);
  });

  it('卸载后不再接受请求回写', () => {
    const { result, unmount } = renderHook(() => usePageScope('A'));
    const currentPage = result.current;
    act(() => unmount());
    expect(currentPage()).toBe(false);
  });
});
