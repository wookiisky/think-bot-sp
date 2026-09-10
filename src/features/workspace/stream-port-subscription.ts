import type { Logger } from '../../services/logger/logger';

/** 两个工作台共用的最小 port 形状；组件测试里的假 port 不带 onDisconnect。 */
export type StreamPortLike = {
  /** 断开订阅。 */
  disconnect: () => void;
  /** 流式消息事件。 */
  onMessage: {
    /** 监听消息。 */
    addListener: (_listener: (_message: unknown) => void) => void;
    /** 移除监听。 */
    removeListener: (_listener: (_message: unknown) => void) => void;
  };
  /** 断开事件；只有对端断开时触发，本端主动 disconnect 不会触发。 */
  onDisconnect?: {
    /** 监听断开。 */
    addListener: (_listener: () => void) => void;
    /** 移除监听。 */
    removeListener: (_listener: () => void) => void;
  };
};

/** 首次重连延迟。 */
export const STREAM_RECONNECT_BASE_DELAY_MS = 1_000;
/** 重连延迟上限。 */
export const STREAM_RECONNECT_MAX_DELAY_MS = 10_000;

type SubscribeInput = {
  /** 建立一条新的 port 连接。 */
  connect: () => StreamPortLike;
  /** 处理端口消息。 */
  onEvent: (_event: unknown) => void;
  /** 重连前的回调，供日志或状态提示。 */
  onReconnect?: (_attempt: number) => void;
  /** 定时器注入，便于测试。 */
  setTimeout?: (_callback: () => void, _delayMs: number) => unknown;
  /** 定时器清理注入。 */
  clearTimeout?: (_handle: unknown) => void;
  /** 结构化日志。 */
  logger?: Pick<Logger, 'debug' | 'warn'>;
};

/** 取 port 事件的类型和关联 id，正文 chunk 不进日志。 */
const describePortEvent = (message: unknown): Record<string, unknown> | null => {
  if (typeof message !== 'object' || message === null || !('type' in message)) {
    return null;
  }
  const event = message as { type?: unknown; sessionId?: unknown; messageId?: unknown; branchId?: unknown; status?: unknown };
  const type = String(event.type);
  if (type.endsWith('_CHUNK')) {
    return null;
  }
  return { type, sessionId: event.sessionId, messageId: event.messageId, branchId: event.branchId, status: event.status };
};

/**
 * 订阅流式 port，并在 service worker 被回收导致断开后自动重连。
 *
 * MV3 worker 空闲 30 秒即被终止，此时 port 从后台一侧断开。
 * 若不重连，前端只能停留在最后一次事件的状态；重新 connect 会唤醒 worker，
 * 由后台按持久化 loading 判定是恢复流还是收敛为失败。
 */
export const subscribeStreamPort = (input: SubscribeInput): (() => void) => {
  const schedule = input.setTimeout ?? ((callback, delayMs) => globalThis.setTimeout(callback, delayMs));
  const cancel = input.clearTimeout ?? ((handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>));
  let disposed = false;
  let attempt = 0;
  let current: { port: StreamPortLike; detach: () => void } | null = null;
  let timer: unknown = null;

  const open = () => {
    const port = input.connect();
    const handleMessage = (message: unknown) => {
      // 收到任何消息都说明链路健康，下一次断开从最短延迟重试。
      attempt = 0;
      const described = describePortEvent(message);
      if (described) {
        input.logger?.debug('port.event', described);
      }
      input.onEvent(message);
    };
    const handleDisconnect = () => {
      if (disposed || current?.port !== port) {
        return;
      }
      current.detach();
      current = null;
      attempt += 1;
      const delayMs = Math.min(STREAM_RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1), STREAM_RECONNECT_MAX_DELAY_MS);
      input.logger?.warn('port.disconnected', { attempt, reconnectInMs: delayMs });
      timer = schedule(() => {
        timer = null;
        if (disposed) {
          return;
        }
        input.onReconnect?.(attempt);
        open();
      }, delayMs);
    };
    port.onMessage.addListener(handleMessage);
    port.onDisconnect?.addListener(handleDisconnect);
    current = {
      port,
      detach: () => {
        port.onMessage.removeListener(handleMessage);
        port.onDisconnect?.removeListener(handleDisconnect);
      },
    };
  };

  open();

  return () => {
    if (disposed) {
      return;
    }
    disposed = true;
    if (timer !== null) {
      cancel(timer);
      timer = null;
    }
    if (current) {
      current.detach();
      current.port.disconnect();
      current = null;
    }
  };
};
