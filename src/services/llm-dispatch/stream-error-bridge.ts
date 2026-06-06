type TextStreamResult = {
  /** 文本增量流。 */
  textStream: AsyncIterable<string>;
};

type StreamErrorBox = {
  /** 当前捕获到的流式错误，未发生时为 null。 */
  error: unknown;
};

/**
 * AI SDK v5 的 `streamText` 默认吞掉流式错误：迭代 `textStream` 时不会抛出，
 * 错误仅经 `onError` 回调暴露。本桥接器把回调里捕获的错误，在 `textStream`
 * 迭代结束时重新抛出，确保上层 dispatch 能把错误收敛为失败态而不是空回复。
 */
export const bridgeStreamError = (input: {
  /** AI SDK streamText 返回结果。 */
  result: TextStreamResult;
  /** 共享的错误容器，`onError` 回调写入、本函数读取。 */
  errorBox: StreamErrorBox;
}): TextStreamResult => ({
  textStream: (async function* () {
    for await (const chunk of input.result.textStream) {
      yield chunk;
    }
    if (input.errorBox.error !== null) {
      throw input.errorBox.error;
    }
  })(),
});

export type { StreamErrorBox, TextStreamResult };
