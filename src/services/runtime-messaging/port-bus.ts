import { sidebarPortEventSchema, sidebarPortNameSchema, type SidebarPortEvent } from './sidebar-contract';

type SidebarPort = chrome.runtime.Port;

type PromptTabScope = {
  /** 归一化页面 URL。 */
  normalizedUrl: string;
  /** promptTab 稳定 id。 */
  promptTabId: string;
};

type SidebarPortRecord = {
  /** 当前连接实例。 */
  port: SidebarPort;
  /** 当前订阅范围。 */
  scope: PromptTabScope | null;
};

type RecentFailureEvent = Extract<
  SidebarPortEvent,
  {
    /** 失败事件类型。 */
    type: 'CHAT_STREAM_FAILED' | 'BRANCH_STREAM_FAILED';
  }
>;

type RecentFailureRecord = {
  /** 失败事件。 */
  event: RecentFailureEvent;
  /** 过期时间戳。 */
  expiresAt: number;
};

/** 失败事件只作为实时展示补偿，不能长期保留。 */
const RECENT_FAILURE_TTL_MS = 30_000;

/** 单个 promptTab 保留最近失败事件上限。 */
const RECENT_FAILURE_LIMIT = 8;

/** 生成 promptTab 订阅范围 key。 */
const createPromptTabScopeKey = (scope: PromptTabScope) => `${scope.normalizedUrl}::${scope.promptTabId}`;

/** 判断事件是否为需要短暂补发的失败事件。 */
const isRecentFailureEvent = (event: SidebarPortEvent): event is RecentFailureEvent =>
  event.type === 'CHAT_STREAM_FAILED' || event.type === 'BRANCH_STREAM_FAILED';

/** 判断事件是否开启了新的主会话，开启后旧失败不应继续补发。 */
const isPromptTabRestartEvent = (event: SidebarPortEvent) => event.type === 'CHAT_STREAM_STARTED';

/** sidebar 长连接 port 总线。 */
export const createPortBus = () => {
  const listeners = new Set<(event: SidebarPortEvent) => void>();
  const ports = new Map<string, SidebarPortRecord>();
  const recentFailureEvents = new Map<string, RecentFailureRecord[]>();
  let nextPortId = 0;

  /** 广播内部生命周期事件。 */
  const emit = (event: SidebarPortEvent) => {
    const parsed = sidebarPortEventSchema.parse(event);
    for (const listener of listeners) {
      listener(parsed);
    }
  };

  /** 读取当前唯一 port 标识。 */
  const createPortId = (port: SidebarPort) => {
    nextPortId += 1;
    const documentId = port.sender?.documentId ?? 'unknown';
    return `${documentId}:${port.name}:${nextPortId}`;
  };

  /** 清理过期失败事件。 */
  const pruneRecentFailureEvents = (timestamp: number) => {
    for (const [scopeKey, records] of recentFailureEvents.entries()) {
      const activeRecords = records.filter((record) => record.expiresAt > timestamp);
      if (activeRecords.length === 0) {
        recentFailureEvents.delete(scopeKey);
      } else {
        recentFailureEvents.set(scopeKey, activeRecords);
      }
    }
  };

  /** 记录最近失败事件，供订阅晚到的页面补收。 */
  const rememberRecentFailureEvent = (event: RecentFailureEvent) => {
    const timestamp = Date.now();
    pruneRecentFailureEvents(timestamp);

    const scopeKey = createPromptTabScopeKey({
      normalizedUrl: event.normalizedUrl,
      promptTabId: event.promptTabId,
    });
    const records = recentFailureEvents.get(scopeKey) ?? [];
    const nextRecords = [
      ...records.filter(
        (record) =>
          record.event.type !== event.type || record.event.messageId !== event.messageId || record.event.branchId !== event.branchId,
      ),
      {
        event,
        expiresAt: timestamp + RECENT_FAILURE_TTL_MS,
      },
    ];
    recentFailureEvents.set(scopeKey, nextRecords.slice(-RECENT_FAILURE_LIMIT));
  };

  /** 补发指定范围内仍有效的失败事件。 */
  const replayRecentFailureEvents = (port: SidebarPort, scope: PromptTabScope) => {
    const timestamp = Date.now();
    pruneRecentFailureEvents(timestamp);

    const records = recentFailureEvents.get(createPromptTabScopeKey(scope)) ?? [];
    for (const record of records) {
      try {
        port.postMessage(sidebarPortEventSchema.parse(record.event));
      } catch {
        // port 已断开时交给外层恢复链路处理。
      }
    }
  };

  return {
    /** 注册内部监听者。 */
    subscribe(listener: (event: SidebarPortEvent) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    /** 注册新 port 连接，返回内部标识。 */
    register(port: SidebarPort) {
      const portName = sidebarPortNameSchema.parse(port.name);
      const portId = createPortId(port);
      ports.set(portId, {
        port,
        scope: null,
      });

      port.onDisconnect.addListener(() => {
        if (!ports.has(portId)) {
          return;
        }

        ports.delete(portId);
        emit({
          type: 'PORT_DISCONNECTED',
          portName,
        });
      });

      emit({
        type: 'PORT_REGISTERED',
        portName,
      });
      return portId;
    },

    /** 为已注册 port 绑定 promptTab 范围。 */
    bindPromptTab(portId: string, scope: PromptTabScope) {
      const record = ports.get(portId);
      if (!record) {
        return false;
      }

      record.scope = scope;
      replayRecentFailureEvents(record.port, scope);
      return true;
    },

    /** 注销指定连接。 */
    unregister(portId: string) {
      return ports.delete(portId);
    },

    /** 主动断开指定连接。 */
    disconnect(portId: string) {
      const record = ports.get(portId);
      if (!record) {
        return false;
      }

      const portName = sidebarPortNameSchema.parse(record.port.name);
      ports.delete(portId);
      record.port.disconnect();
      emit({
        type: 'PORT_DISCONNECTED',
        portName,
      });
      return true;
    },

    /** 恢复一个连接实例并返回新的内部标识。 */
    recover(port: SidebarPort) {
      const portName = sidebarPortNameSchema.parse(port.name);
      const portId = createPortId(port);
      ports.set(portId, {
        port,
        scope: null,
      });
      emit({
        type: 'PORT_RECOVERED',
        portName,
      });
      return portId;
    },

    /** 读取已注册的连接实例。 */
    getPort(portId: string) {
      return ports.get(portId)?.port ?? null;
    },

    /** 向指定 promptTab 广播流式事件。 */
    publishToPromptTab(scope: PromptTabScope, event: SidebarPortEvent) {
      const parsed = sidebarPortEventSchema.parse(event);
      const scopeKey = createPromptTabScopeKey(scope);
      if (isPromptTabRestartEvent(parsed)) {
        recentFailureEvents.delete(scopeKey);
      }
      if (isRecentFailureEvent(parsed)) {
        rememberRecentFailureEvent(parsed);
      }
      for (const record of ports.values()) {
        if (!record.scope) {
          continue;
        }
        if (record.scope.normalizedUrl !== scope.normalizedUrl || record.scope.promptTabId !== scope.promptTabId) {
          continue;
        }
        try {
          record.port.postMessage(parsed);
        } catch {
          // port 断开后由调用方依赖持久化状态恢复，不在这里升级失败。
        }
      }
    },
  };
};
