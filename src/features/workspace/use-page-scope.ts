import { useLayoutEffect, useMemo, useRef } from 'react';

/** 命令闭包持有发起时的页面版本，切页和卸载后不再写回旧响应。 */
export const usePageScope = (pageKey: string | null) => {
  const scope = useMemo(() => ({ pageKey, active: false }), [pageKey]);
  const scopeRef = useRef(scope);
  useLayoutEffect(() => {
    scopeRef.current = scope;
    scope.active = true;
    return () => { scope.active = false; };
  }, [scope]);
  return () => scope.active && scopeRef.current === scope;
};
