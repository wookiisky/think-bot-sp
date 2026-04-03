/* eslint-disable no-unused-vars */
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

/** sidebar 长连接 port 总线。 */
export const createPortBus = () => {
  const listeners = new Set<(event: SidebarPortEvent) => void>();
  const ports = new Map<string, SidebarPortRecord>();
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
