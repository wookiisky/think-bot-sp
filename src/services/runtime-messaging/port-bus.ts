/* eslint-disable no-unused-vars */
import { sidebarPortEventSchema, sidebarPortNameSchema, type SidebarPortEvent } from './sidebar-contract';

type SidebarPort = chrome.runtime.Port;

/** sidebar 长连接 port 总线。 */
export const createPortBus = () => {
  const listeners = new Set<(event: SidebarPortEvent) => void>();
  const ports = new Map<string, SidebarPort>();
  const disconnectingPorts = new Set<string>();

  /** 广播事件。 */
  const emit = (event: SidebarPortEvent) => {
    sidebarPortEventSchema.parse(event);
    for (const listener of listeners) {
      listener(event);
    }
  };

  /** 注册监听者。 */
  const subscribe = (listener: (event: SidebarPortEvent) => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  /** 注册 port。 */
  const register = (port: SidebarPort) => {
    const portName = sidebarPortNameSchema.parse(port.name);
    ports.set(portName, port);

    port.onDisconnect.addListener(() => {
      if (disconnectingPorts.has(portName)) {
        disconnectingPorts.delete(portName);
        return;
      }

      if (ports.get(portName) === port) {
        ports.delete(portName);
        emit({
          type: 'PORT_DISCONNECTED',
          portName,
        });
      }
    });

    emit({
      type: 'PORT_REGISTERED',
      portName,
    });
  };

  /** 主动断连 port。 */
  const disconnect = (portName: string) => {
    const nextPortName = sidebarPortNameSchema.parse(portName);
    const port = ports.get(nextPortName);
    if (!port) {
      return false;
    }

    disconnectingPorts.add(nextPortName);
    port.disconnect();
    disconnectingPorts.delete(nextPortName);
    ports.delete(nextPortName);
    emit({
      type: 'PORT_DISCONNECTED',
      portName: nextPortName,
    });
    return true;
  };

  /** 恢复 port。 */
  const recover = (port: SidebarPort) => {
    const portName = sidebarPortNameSchema.parse(port.name);
    ports.set(portName, port);
    emit({
      type: 'PORT_RECOVERED',
      portName,
    });
  };

  /** 读取已注册 port。 */
  const getPort = (portName: string) => {
    const nextPortName = sidebarPortNameSchema.parse(portName);
    return ports.get(nextPortName) ?? null;
  };

  return {
    subscribe,
    register,
    disconnect,
    recover,
    getPort,
  };
};
