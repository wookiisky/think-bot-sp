const FLUSH_INTERVAL_MS = 50;
const MAX_BUFFER_BYTES = 8192;

interface BufferedTextStreamOptions {
  signal: AbortSignal;
  write: (chunk: string) => Promise<void>;
  onFirstChunk?: () => void;
}

type StreamEvent =
  | { type: 'next'; result: IteratorResult<string> }
  | { type: 'error'; error: unknown }
  | { type: 'abort' }
  | { type: 'flush' };

const waitForEvent = async (
  events: Promise<StreamEvent>[],
  signal: AbortSignal,
): Promise<StreamEvent> => {
  let onAbort = () => {};
  // Scope this promise to one wait. Reusing an unresolved abort promise would
  // retain one Promise.race reaction per chunk for the entire stream lifetime.
  const aborted = new Promise<StreamEvent>((resolve) => {
    onAbort = () => resolve({ type: 'abort' });
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    if (signal.aborted) return { type: 'abort' };
    return await Promise.race([...events, aborted]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
};

/** Batch streamed text without delaying its first chunk or reading ahead during writes. */
export const consumeBufferedTextStream = async (
  stream: AsyncIterable<string>,
  { signal, write, onFirstChunk }: BufferedTextStreamOptions,
): Promise<void> => {
  const iterator = stream[Symbol.asyncIterator]();
  let buffer = '';
  let bufferBytes = 0;
  let firstChunk = true;
  let writeFailed = false;
  let completed = false;
  let deadline = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timerEvent: Promise<StreamEvent> | undefined;
  let pendingNext: Promise<StreamEvent> | undefined;
  const abortError = () => signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
  const clearTimer = () => {
    clearTimeout(timer);
    timer = undefined;
    timerEvent = undefined;
  };
  const flush = async () => {
    clearTimer();
    if (!buffer) return;
    const text = buffer;
    // A rejected write must never be retried: it may already have persisted the text.
    buffer = '';
    bufferBytes = 0;
    try {
      await write(text);
    } catch (error) {
      writeFailed = true;
      throw error;
    }
  };
  const startTimer = () => {
    if (timerEvent) return;
    deadline = Date.now() + FLUSH_INTERVAL_MS;
    timerEvent = new Promise<StreamEvent>((resolve) => {
      timer = setTimeout(() => resolve({ type: 'flush' }), FLUSH_INTERVAL_MS);
    });
  };

  try {
    while (true) {
      if (signal.aborted) throw abortError();
      // Also check the clock when a producer resolves next() immediately in a loop.
      if (buffer && Date.now() >= deadline) await flush();
      if (signal.aborted) throw abortError();
      pendingNext ??= Promise.resolve()
        .then(() => iterator.next())
        .then<StreamEvent, StreamEvent>(
          (result) => ({ type: 'next', result }),
          (error: unknown) => ({ type: 'error', error }),
        );
      const event = await waitForEvent([
        pendingNext,
        ...(timerEvent ? [timerEvent] : []),
      ], signal);
      if (event.type === 'abort') throw abortError();
      if (event.type === 'error') throw event.error;
      if (event.type === 'flush') {
        await flush();
        continue;
      }
      pendingNext = undefined;
      if (event.result.done) {
        await flush();
        if (signal.aborted) throw abortError();
        completed = true;
        return;
      }
      const chunk = event.result.value;
      if (!chunk) continue;
      const flushImmediately = firstChunk;
      if (firstChunk) {
        firstChunk = false;
        onFirstChunk?.();
      }
      // Split at code point boundaries; byte accounting stays conservative for
      // isolated surrogates and never splits a valid surrogate pair in this chunk.
      let start = 0;
      for (let offset = 0; offset < chunk.length;) {
        const point = chunk.codePointAt(offset)!;
        const bytes = point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
        if (bufferBytes + bytes > MAX_BUFFER_BYTES) {
          buffer += chunk.slice(start, offset);
          await flush();
          start = offset;
        }
        if (bufferBytes === 0) startTimer();
        bufferBytes += bytes;
        offset += point > 0xffff ? 2 : 1;
      }
      buffer += chunk.slice(start);
      if (flushImmediately || bufferBytes === MAX_BUFFER_BYTES) await flush();
    }
  } catch (error) {
    // Flush text already consumed on cancellation and upstream failures. If this
    // write fails, its error takes precedence over the original stream error.
    if (!writeFailed) await flush();
    throw error;
  } finally {
    clearTimer();
    if (!completed) {
      // Async generators can queue return() behind an indefinitely pending next().
      // Ask the producer to close, but do not let it block cancellation or hide errors.
      void Promise.resolve().then(() => iterator.return?.()).catch(() => {});
    }
  }
};
