import { vi } from 'vitest';

/** 创建能独立控制取消与持久化收尾的测试会话。 */
export const createControlledSidebarSession = (sessionId: string, branchId = sessionId) => {
  let finish!: () => void;
  let reject!: (reason: Error) => void;
  const done = new Promise<{
    sessionId: string;
    messageId: string;
    status: 'done';
    errorMessage: null;
    persisted: true;
  }>((resolve, rejectPromise) => {
    finish = () => resolve({ sessionId, messageId: 'assistant', status: 'done', errorMessage: null, persisted: true });
    reject = rejectPromise;
  });
  return { sessionId, branchId, messageId: 'assistant', cancel: vi.fn(), done, finish, reject };
};
