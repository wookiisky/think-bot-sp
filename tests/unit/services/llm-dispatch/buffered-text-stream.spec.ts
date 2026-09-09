import { afterEach, describe, expect, it, vi } from 'vitest';

import { consumeBufferedTextStream } from '../../../../src/services/llm-dispatch/buffered-text-stream';

const settle = async () => {
  for (let index = 0; index < 20; index++) await Promise.resolve();
};

const controlledStream = () => {
  let resolveNext: (result: IteratorResult<string>) => void;
  let rejectNext: (error: unknown) => void;
  const iterator = {
    next: vi.fn(() => new Promise<IteratorResult<string>>((resolve, reject) => {
      resolveNext = resolve;
      rejectNext = reject;
    })),
    return: vi.fn(async () => ({ done: true as const, value: undefined })),
  };
  return {
    stream: { [Symbol.asyncIterator]: () => iterator },
    iterator,
    push: (value: string) => resolveNext({ done: false, value }),
    end: () => resolveNext({ done: true, value: undefined }),
    fail: (error: unknown) => rejectNext(error),
  };
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('consumeBufferedTextStream', () => {
  it('writes the first nonempty chunk immediately and batches thousands of later chunks', async () => {
    const write = vi.fn(async (_text: string) => {});
    const onFirstChunk = vi.fn();
    async function* chunks() {
      yield '';
      yield 'first';
      expect(write).toHaveBeenCalledWith('first');
      for (let index = 0; index < 2000; index++) yield 'x';
    }
    await consumeBufferedTextStream(chunks(), {
      signal: new AbortController().signal,
      write,
      onFirstChunk,
    });
    expect(onFirstChunk).toHaveBeenCalledTimes(1);
    expect(write.mock.calls.map(([text]) => text).join('')).toBe(`first${'x'.repeat(2000)}`);
    expect(write.mock.calls.length).toBeLessThan(20);
  });

  it('flushes after 50 ms even while the next chunk is pending', async () => {
    vi.useFakeTimers();
    const source = controlledStream();
    const write = vi.fn(async (_text: string) => {});
    const done = consumeBufferedTextStream(source.stream, { signal: new AbortController().signal, write });
    await settle();
    source.push('first');
    await settle();
    source.push('second');
    await settle();
    expect(write).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(49);
    expect(write).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(write.mock.calls).toEqual([['first'], ['second']]);
    expect(source.iterator.next).toHaveBeenCalledTimes(3);
    source.end();
    await done;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps every write within 8192 UTF-8 bytes, preserving Unicode and a large input chunk', async () => {
    const text = `${'🙂中é'.repeat(10000)}end`;
    const write = vi.fn(async (_text: string) => {});
    async function* chunks() {
      yield text;
      yield text;
    }
    await consumeBufferedTextStream(chunks(), { signal: new AbortController().signal, write });
    expect(write.mock.calls.map(([chunk]) => chunk).join('')).toBe(text + text);
    for (const [chunk] of write.mock.calls) {
      expect(new TextEncoder().encode(chunk).length).toBeLessThanOrEqual(8192);
      expect(new TextDecoder().decode(new TextEncoder().encode(chunk))).toBe(chunk);
    }
  });

  it('waits for each write before requesting another chunk', async () => {
    const source = controlledStream();
    const signal = new AbortController().signal;
    const removeListener = vi.spyOn(signal, 'removeEventListener');
    let finishWrite!: () => void;
    const write = vi.fn(() => new Promise<void>((resolve) => { finishWrite = resolve; }));
    const done = consumeBufferedTextStream(source.stream, { signal, write });
    await settle();
    source.push('first');
    await settle();
    expect(source.iterator.next).toHaveBeenCalledTimes(1);
    // The completed read's abort waiter is released even while its write stalls.
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
    finishWrite();
    await settle();
    expect(source.iterator.next).toHaveBeenCalledTimes(2);
    source.end();
    await done;
  });

  it('flushes consumed text before propagating an upstream failure', async () => {
    const error = new Error('stream failed');
    const write = vi.fn(async (_text: string) => {});
    async function* chunks() {
      yield 'first';
      yield 'buffered';
      throw error;
    }
    await expect(consumeBufferedTextStream(chunks(), {
      signal: new AbortController().signal, write,
    })).rejects.toBe(error);
    expect(write.mock.calls).toEqual([['first'], ['buffered']]);
  });

  it('flushes on cancellation, removes resources, and does not wait for a hung iterator return', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
    const source = controlledStream();
    source.iterator.return.mockImplementation(() => new Promise(() => {}));
    const write = vi.fn(async (_text: string) => {});
    const done = consumeBufferedTextStream(source.stream, { signal: controller.signal, write });
    const rejected = expect(done).rejects.toMatchObject({ name: 'AbortError' });
    await settle();
    source.push('first');
    await settle();
    source.push('buffered');
    await settle();
    controller.abort();
    await rejected;
    expect(write.mock.calls).toEqual([['first'], ['buffered']]);
    expect(source.iterator.return).toHaveBeenCalledOnce();
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
    // A producer that rejects next() after cancellation must not leak a rejection.
    source.fail(new Error('late next failure'));
    await settle();
  });

  it('does not retry a failed write or hide it behind cancellation', async () => {
    const controller = new AbortController();
    const failure = new Error('storage failed');
    const write = vi.fn(async (_text: string) => {
      controller.abort();
      throw failure;
    });
    async function* chunks() {
      yield 'first';
      yield 'unread';
    }
    await expect(consumeBufferedTextStream(chunks(), { signal: controller.signal, write })).rejects.toBe(failure);
    expect(write.mock.calls).toEqual([['first']]);
  });

  it('reports a failed cancellation flush instead of the abort error, without retrying', async () => {
    const controller = new AbortController();
    const source = controlledStream();
    const failure = new Error('flush failed');
    const write = vi.fn(async (_text: string) => {})
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(failure);
    const done = consumeBufferedTextStream(source.stream, { signal: controller.signal, write });
    const rejected = expect(done).rejects.toBe(failure);
    await settle();
    source.push('first');
    await settle();
    source.push('buffered');
    await settle();
    controller.abort();
    await rejected;
    expect(write.mock.calls).toEqual([['first'], ['buffered']]);
  });

  it('exits when a timer-triggered write fails while next() is still pending', async () => {
    vi.useFakeTimers();
    const source = controlledStream();
    const failure = new Error('timer flush failed');
    const write = vi.fn(async (_text: string) => {})
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(failure);
    const done = consumeBufferedTextStream(source.stream, { signal: new AbortController().signal, write });
    const rejected = expect(done).rejects.toBe(failure);
    await settle();
    source.push('first');
    await settle();
    source.push('buffered');
    await settle();
    await vi.advanceTimersByTimeAsync(50);
    await rejected;
    expect(write.mock.calls).toEqual([['first'], ['buffered']]);
    expect(source.iterator.return).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not read from a stream when already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const source = controlledStream();
    const write = vi.fn(async (_text: string) => {});
    await expect(consumeBufferedTextStream(source.stream, { signal: controller.signal, write }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(source.iterator.next).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
});
