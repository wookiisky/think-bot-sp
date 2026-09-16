import { useCallback, useEffect, useState } from 'react';
import type { WorkspaceToastPayload } from './workspace-toast';

/** 页面级 toast 条目。 */
export type WorkspaceToast = WorkspaceToastPayload & {
  /** toast 稳定 id。 */
  id: number;
};

/** 自动消失时长。 */
const TOAST_DURATION_MS = 4000;

/** 模块级递增 id：同一毫秒内连续推送的两条 toast 也不会共享 id。 */
let nextToastId = 0;

/** 侧边栏与历史页共用的一次性 toast：只保留最新一条，4 秒后自动消失。 */
export const useWorkspaceToast = () => {
  const [toast, setToast] = useState<WorkspaceToast | null>(null);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, TOAST_DURATION_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [toast]);

  const pushToast = useCallback((tone: WorkspaceToast['tone'], message: string) => {
    nextToastId += 1;
    setToast({ id: nextToastId, tone, message });
  }, []);

  const pushWorkspaceToast = useCallback((next: WorkspaceToastPayload) => {
    pushToast(next.tone, next.message);
  }, [pushToast]);

  return { toast, pushToast, pushWorkspaceToast };
};
