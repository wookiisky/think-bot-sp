import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createServiceWorkerKeepalive } from '../../../../src/services/runtime-messaging/service-worker-keepalive';

describe('service-worker keepalive', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('持有期间按间隔心跳，释放后停止', async () => {
    const ping = vi.fn().mockResolvedValue(undefined);
    const keepalive = createServiceWorkerKeepalive({ ping, intervalMs: 1000 });

    const release = keepalive.acquire();
    expect(keepalive.activeCount).toBe(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(ping).toHaveBeenCalledTimes(3);

    release();
    release();
    expect(keepalive.activeCount).toBe(0);
    await vi.advanceTimersByTimeAsync(3000);
    expect(ping).toHaveBeenCalledTimes(3);
  });

  it('多路并发共用一个定时器，最后一路释放才停止', async () => {
    const ping = vi.fn().mockResolvedValue(undefined);
    const keepalive = createServiceWorkerKeepalive({ ping, intervalMs: 1000 });

    const releaseA = keepalive.acquire();
    const releaseB = keepalive.acquire();
    await vi.advanceTimersByTimeAsync(1000);
    expect(ping).toHaveBeenCalledTimes(1);

    releaseA();
    await vi.advanceTimersByTimeAsync(1000);
    expect(ping).toHaveBeenCalledTimes(2);

    releaseB();
    await vi.advanceTimersByTimeAsync(2000);
    expect(ping).toHaveBeenCalledTimes(2);
  });

  it('ping 失败只记日志，不影响持有状态', async () => {
    const warn = vi.fn();
    const keepalive = createServiceWorkerKeepalive({
      ping: () => Promise.reject(new Error('no runtime')),
      intervalMs: 1000,
      logger: { warn },
    });

    const release = keepalive.acquire();
    await vi.advanceTimersByTimeAsync(1000);
    expect(warn).toHaveBeenCalledWith('keepalive.ping_failed', { reason: 'no runtime' });
    expect(keepalive.activeCount).toBe(1);
    release();
  });

  it('run 在任务失败时也会释放', async () => {
    const keepalive = createServiceWorkerKeepalive({ ping: () => undefined, intervalMs: 1000 });

    await expect(keepalive.run(async () => {
      expect(keepalive.activeCount).toBe(1);
      throw new Error('boom');
    })).rejects.toThrow('boom');
    expect(keepalive.activeCount).toBe(0);
  });

  it('wrapIterable 在流消费完、抛错或提前 return 时都会释放', async () => {
    const keepalive = createServiceWorkerKeepalive({ ping: () => undefined, intervalMs: 1000 });
    const source = async function* () {
      yield 'a';
      yield 'b';
    };

    const chunks: string[] = [];
    for await (const chunk of keepalive.wrapIterable(source())) {
      chunks.push(chunk);
      expect(keepalive.activeCount).toBe(1);
    }
    expect(chunks).toEqual(['a', 'b']);
    expect(keepalive.activeCount).toBe(0);

    const failing = async function* () {
      yield 'a';
      throw new Error('stream failed');
    };
    await expect((async () => {
      for await (const chunk of keepalive.wrapIterable(failing())) {
        expect(chunk).toBe('a');
      }
    })()).rejects.toThrow('stream failed');
    expect(keepalive.activeCount).toBe(0);

    for await (const chunk of keepalive.wrapIterable(source())) {
      expect(chunk).toBe('a');
      break;
    }
    expect(keepalive.activeCount).toBe(0);
  });
});
