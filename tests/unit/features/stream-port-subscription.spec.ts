import { describe, expect, it, vi, type Mock } from 'vitest';

import { subscribeStreamPort, type StreamPortLike } from '../../../src/features/workspace/stream-port-subscription';

type FakePort = StreamPortLike & {
  /** 模拟收到消息。 */
  emit: (_message: unknown) => void;
  /** 模拟对端断开。 */
  drop: () => void;
  /** disconnect 调用记录。 */
  disconnect: Mock<() => void>;
};

/** 创建可手动触发消息和断开的假 port。 */
const createFakePort = (): FakePort => {
  const messageListeners = new Set<(_message: unknown) => void>();
  const disconnectListeners = new Set<() => void>();
  return {
    disconnect: vi.fn<() => void>(),
    onMessage: {
      addListener: (listener) => messageListeners.add(listener),
      removeListener: (listener) => messageListeners.delete(listener),
    },
    onDisconnect: {
      addListener: (listener) => disconnectListeners.add(listener),
      removeListener: (listener) => disconnectListeners.delete(listener),
    },
    emit: (message) => messageListeners.forEach((listener) => listener(message)),
    drop: () => Array.from(disconnectListeners).forEach((listener) => listener()),
  };
};

/** 手动驱动的定时器。 */
const createManualTimers = () => {
  const pending = new Map<number, { callback: () => void; delayMs: number }>();
  let nextId = 1;
  return {
    setTimeout: vi.fn((callback: () => void, delayMs: number) => {
      const id = nextId++;
      pending.set(id, { callback, delayMs });
      return id;
    }),
    clearTimeout: vi.fn((handle: unknown) => {
      pending.delete(handle as number);
    }),
    flush: () => {
      const entries = Array.from(pending.entries());
      pending.clear();
      entries.forEach(([, entry]) => entry.callback());
    },
    delays: () => Array.from(pending.values()).map((entry) => entry.delayMs),
    size: () => pending.size,
  };
};

describe('subscribeStreamPort', () => {
  it('对端断开后按退避延迟重连，收到消息后退避归零', () => {
    const ports: FakePort[] = [];
    const timers = createManualTimers();
    const onEvent = vi.fn();
    const onReconnect = vi.fn();
    const unsubscribe = subscribeStreamPort({
      connect: () => {
        const port = createFakePort();
        ports.push(port);
        return port;
      },
      onEvent,
      onReconnect,
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
    });
    expect(ports).toHaveLength(1);

    ports[0]!.drop();
    expect(timers.delays()).toEqual([1000]);
    timers.flush();
    expect(ports).toHaveLength(2);
    expect(onReconnect).toHaveBeenCalledWith(1);

    ports[1]!.drop();
    expect(timers.delays()).toEqual([2000]);
    timers.flush();
    expect(ports).toHaveLength(3);

    ports[2]!.emit({ type: 'CHAT_STREAM_CHUNK' });
    expect(onEvent).toHaveBeenCalledWith({ type: 'CHAT_STREAM_CHUNK' });
    ports[2]!.drop();
    expect(timers.delays()).toEqual([1000]);

    unsubscribe();
    expect(timers.size()).toBe(0);
  });

  it('退订后不再重连，并断开当前 port', () => {
    const ports: FakePort[] = [];
    const timers = createManualTimers();
    const unsubscribe = subscribeStreamPort({
      connect: () => {
        const port = createFakePort();
        ports.push(port);
        return port;
      },
      onEvent: vi.fn(),
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
    });

    unsubscribe();
    expect(ports[0]!.disconnect).toHaveBeenCalledTimes(1);
    ports[0]!.drop();
    expect(timers.size()).toBe(0);
    expect(ports).toHaveLength(1);
  });

  it('假 port 没有 onDisconnect 时也能正常订阅和清理', () => {
    const port = {
      disconnect: vi.fn(),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    };
    const unsubscribe = subscribeStreamPort({ connect: () => port, onEvent: vi.fn() });
    expect(port.onMessage.addListener).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(port.onMessage.removeListener).toHaveBeenCalledTimes(1);
    expect(port.disconnect).toHaveBeenCalledTimes(1);
  });
});
