type SidebarSession = {
  /** 本次流式会话 id。 */
  sessionId: string;
  /** 当前助手消息 id。 */
  messageId: string;
  /** 主动取消当前会话。 */
  cancel: () => void;
  /** 会话完成 promise。 */
  done: Promise<unknown>;
};

type SidebarSessionScope = {
  /** 会话所属页面。 */
  normalizedUrl: string;
  /** 会话所属 promptTab。 */
  promptTabId: string;
  /** 所属分支 id。 */
  branchId?: string;
};

type SidebarSessionRecord = SidebarSession & SidebarSessionScope;

/** 创建侧边栏活跃会话注册表，统一服务手动发送和自动触发。 */
export const createSidebarSessionRegistry = () => {
  const activeSessions = new Map<string, SidebarSessionRecord>();

  /** 注册单个生命周期；分支归属只由 scope 决定，协调器不能继承主分支 id。 */
  const register = (session: SidebarSession, scope: SidebarSessionScope) => {
    const record: SidebarSessionRecord = {
      sessionId: session.sessionId,
      messageId: session.messageId,
      cancel: session.cancel,
      done: session.done,
      normalizedUrl: scope.normalizedUrl,
      promptTabId: scope.promptTabId,
    };
    if (scope.branchId !== undefined) {
      record.branchId = scope.branchId;
    }
    activeSessions.set(session.sessionId, record);
    const release = () => {
      if (activeSessions.get(session.sessionId) === record) {
        activeSessions.delete(session.sessionId);
      }
    };
    // 同时消费成功与失败，避免 finally 产生无人处理的 rejected promise。
    void session.done.then(release, release);
  };

  return {
    register,

    /** 注册整轮协调器与附加分支；协调器负责整轮取消，附加分支可独立停止。 */
    registerTurn(input: {
      /** 整轮生命周期，done 等待全部分支收尾。 */
      coordinator: SidebarSession;
      /** 可独立取消的附加分支，不包含主分支。 */
      branchSessions: Array<SidebarSession & { branchId: string }>;
      /** 整轮所属页面与标签。 */
      scope: Pick<SidebarSessionScope, 'normalizedUrl' | 'promptTabId'>;
    }) {
      register(input.coordinator, input.scope);
      for (const branch of input.branchSessions) {
        register(branch, { ...input.scope, branchId: branch.branchId });
      }
    },

    /** 当前 worker 内该 promptTab 是否仍有活跃会话；worker 重启后注册表为空，持久化 loading 即为孤儿。 */
    hasPromptTabSessions(input: { normalizedUrl: string; promptTabId: string }) {
      return Array.from(activeSessions.values()).some(
        (session) => session.normalizedUrl === input.normalizedUrl && session.promptTabId === input.promptTabId,
      );
    },

    /** 精确取消某个会话，只接受 scope 一致的会话。 */
    cancelSession(input: {
      /** 会话 id。 */
      sessionId: string;
      /** 页面归一化 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
    }) {
      const session = activeSessions.get(input.sessionId);
      if (!session) {
        return false;
      }
      if (session.normalizedUrl !== input.normalizedUrl || session.promptTabId !== input.promptTabId) {
        return false;
      }

      session.cancel();
      return true;
    },

    /** 精确取消某个分支会话，只接受 scope 一致的会话。 */
    cancelBranchSession(input: {
      /** 页面归一化 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 分支稳定 id。 */
      branchId: string;
    }) {
      const session = Array.from(activeSessions.values()).find(
        (item) =>
          item.normalizedUrl === input.normalizedUrl &&
          item.promptTabId === input.promptTabId &&
          item.branchId === input.branchId,
      );
      if (!session) {
        return false;
      }

      session.cancel();
      return true;
    },

    /** 取消某个分支会话并等待生命周期收敛。 */
    async cancelBranchSessionAndWait(input: {
      /** 页面归一化 URL。 */
      normalizedUrl: string;
      /** promptTab 稳定 id。 */
      promptTabId: string;
      /** 分支稳定 id。 */
      branchId: string;
    }) {
      const session = Array.from(activeSessions.values()).find(
        (item) =>
          item.normalizedUrl === input.normalizedUrl &&
          item.promptTabId === input.promptTabId &&
          item.branchId === input.branchId,
      );
      if (!session) {
        return false;
      }

      session.cancel();
      await Promise.allSettled([session.done]);
      return true;
    },

    /** 取消当前页面所有活跃会话，并等待生命周期收敛。 */
    async cancelPageSessions(normalizedUrl: string) {
      const pageSessions = Array.from(activeSessions.values()).filter((session) => session.normalizedUrl === normalizedUrl);
      for (const session of pageSessions) {
        session.cancel();
      }
      await Promise.allSettled(pageSessions.map((session) => session.done));
      return pageSessions.length;
    },

    /** 取消当前 promptTab 的全部活跃会话，并等待生命周期收敛。 */
    async cancelPromptTabSessions(input: { normalizedUrl: string; promptTabId: string }) {
      const promptTabSessions = Array.from(activeSessions.values()).filter(
        (session) => session.normalizedUrl === input.normalizedUrl && session.promptTabId === input.promptTabId,
      );
      for (const session of promptTabSessions) {
        session.cancel();
      }
      await Promise.allSettled(promptTabSessions.map((session) => session.done));
      return promptTabSessions.length;
    },
  };
};

export type { SidebarSession, SidebarSessionScope };
