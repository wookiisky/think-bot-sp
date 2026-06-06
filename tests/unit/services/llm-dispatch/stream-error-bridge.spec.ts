import { describe, expect, it } from 'vitest';

import { bridgeStreamError, type StreamErrorBox } from '../../../../src/services/llm-dispatch/stream-error-bridge';

/** 构造一个会逐块产出、结束时不抛错的伪 textStream，模拟 AI SDK v5 吞错行为。 */
const createSwallowingResult = (chunks: string[]) => ({
  textStream: (async function* () {
    for (const chunk of chunks) {
      yield chunk;
    }
  })(),
});

const collect = async (stream: AsyncIterable<string>) => {
  const received: string[] = [];
  for await (const chunk of stream) {
    received.push(chunk);
  }
  return received;
};

describe('bridgeStreamError', () => {
  it('无错误时按原样透传全部增量并正常结束', async () => {
    const errorBox: StreamErrorBox = { error: null };
    const bridged = bridgeStreamError({
      result: createSwallowingResult(['第一段', '第二段']),
      errorBox,
    });

    await expect(collect(bridged.textStream)).resolves.toEqual(['第一段', '第二段']);
  });

  it('onError 在流结束后写入错误时，迭代结束阶段重新抛出', async () => {
    const errorBox: StreamErrorBox = { error: null };
    const apiError = new Error('models/gemini-3.1-flash-lite1 is not found for API version v1beta.');
    const bridged = bridgeStreamError({
      result: {
        textStream: (async function* () {
          // AI SDK 吞错：先正常产出零个增量，错误经回调旁路写入。
          errorBox.error = apiError;
          if (false) {
            yield '';
          }
        })(),
      },
      errorBox,
    });

    await expect(collect(bridged.textStream)).rejects.toBe(apiError);
  });

  it('已产出部分增量后再失败，先交付增量再抛出错误', async () => {
    const errorBox: StreamErrorBox = { error: null };
    const apiError = new Error('stream broke mid-way');
    const received: string[] = [];
    const bridged = bridgeStreamError({
      result: {
        textStream: (async function* () {
          yield '前缀';
          errorBox.error = apiError;
        })(),
      },
      errorBox,
    });

    await expect(
      (async () => {
        for await (const chunk of bridged.textStream) {
          received.push(chunk);
        }
      })(),
    ).rejects.toBe(apiError);
    expect(received).toEqual(['前缀']);
  });
});
