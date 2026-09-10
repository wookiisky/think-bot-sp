import { describeError, type Logger } from '../logger/logger';

/** Chrome 空闲 30 秒即回收 MV3 service worker，取略短于该阈值的心跳间隔。 */
export const DEFAULT_KEEPALIVE_INTERVAL_MS = 20_000;

type KeepaliveDeps = {
  /** 任意轻量扩展 API 调用，Chrome 借此重置空闲计时器，例如 `chrome.runtime.getPlatformInfo()`。 */
  ping: () => Promise<unknown> | unknown;
  /** 心跳间隔，默认 20 秒。 */
  intervalMs?: number;
  /** 结构化日志。 */
  logger?: Pick<Logger, 'warn'>;
};

/**
 * 长时间流式请求期间保持 service worker 存活。
 *
 * Chrome 只把“收到扩展事件 / 调用扩展 API”视为活动；一个正在读取的 fetch 流不算。
 * 模型思考阶段没有正文 chunk，也就没有 storage 写入和 port 消息，
 * 超过 30 秒 worker 就会被回收，请求和超时定时器随之消失。
 * 持有计数为正时按固定间隔发一次心跳；多路并发请求共用一个定时器。
 */
export const createServiceWorkerKeepalive = (deps: KeepaliveDeps) => {
  const intervalMs = deps.intervalMs ?? DEFAULT_KEEPALIVE_INTERVAL_MS;
  let holders = 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  const beat = () => {
    // ping 失败只记日志：心跳是保活手段，不能反向打断正在进行的请求。
    void Promise.resolve()
      .then(() => deps.ping())
      .catch((error: unknown) => {
        deps.logger?.warn('keepalive.ping_failed', { holders, reason: describeError(error) });
      });
  };

  const stop = () => {
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };

  const acquire = () => {
    holders += 1;
    if (holders === 1) {
      timer = setInterval(beat, intervalMs);
    }
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      holders -= 1;
      if (holders === 0) {
        stop();
      }
    };
  };

  return {
    /** 持有一次保活，返回释放函数；重复释放是幂等的。 */
    acquire,
    /** 在任务执行期间保活，任务结束（无论成败）后释放。 */
    async run<T>(task: () => Promise<T>): Promise<T> {
      const release = acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
    /** 在异步迭代消费完毕（正常结束、抛错或提前 return）前保活。 */
    wrapIterable<T>(iterable: AsyncIterable<T>): AsyncIterable<T> {
      const release = acquire();
      return {
        [Symbol.asyncIterator]: () => {
          const iterator = iterable[Symbol.asyncIterator]();
          let finished = false;
          const finish = () => {
            if (!finished) {
              finished = true;
              release();
            }
          };
          return {
            async next() {
              try {
                const result = await iterator.next();
                if (result.done) {
                  finish();
                }
                return result;
              } catch (error) {
                finish();
                throw error;
              }
            },
            async return(value?: unknown) {
              try {
                return iterator.return ? await iterator.return(value) : { done: true as const, value: undefined as T };
              } finally {
                finish();
              }
            },
            async throw(error?: unknown) {
              try {
                if (iterator.throw) {
                  return await iterator.throw(error);
                }
                throw error;
              } finally {
                finish();
              }
            },
          };
        },
      };
    },
    /** 当前持有计数，供测试与日志观测。 */
    get activeCount() {
      return holders;
    },
  };
};

export type ServiceWorkerKeepalive = ReturnType<typeof createServiceWorkerKeepalive>;
