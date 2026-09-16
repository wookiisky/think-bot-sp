/** 判断是否为取消错误。 */
export const isAbortError = (error: unknown): boolean =>
  error instanceof Error && (error.name === 'AbortError' || error.message === 'aborted');

/** 判断未知值是否可按普通对象读取。 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** 计算本次流式调用耗时；未进入模型调用时不记录。 */
export const resolveInvocationDurationMs = (startedAt: number | null, endedAt: number): number | null =>
  startedAt === null ? null : Math.max(0, endedAt - startedAt);

/** 把原始 API 错误载荷转成可展示文本。 */
const stringifyRawErrorPayload = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  if (value === undefined || value === null) {
    return null;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return null;
  }
};

/** 优先提取 provider 原始响应，避免只展示 SDK 包装后的摘要。 */
const getRawApiErrorMessage = (error: unknown): string | null => {
  if (!isRecord(error)) {
    return null;
  }

  const responseBody = stringifyRawErrorPayload(error.responseBody);
  if (responseBody) {
    return responseBody;
  }

  const data = stringifyRawErrorPayload(error.data);
  if (data) {
    return data;
  }

  return getRawApiErrorMessage(error.cause);
};

/** 统一提取错误文本。 */
export const getErrorMessage = (error: unknown, fallback: string): string =>
  getRawApiErrorMessage(error) ?? (error instanceof Error && error.message.trim() ? error.message : fallback);

/** 带超时的模型请求取消域。 */
export type ModelAbortScope = {
  /** 取消信号。 */
  signal: AbortSignal;
  /** 主动取消。 */
  cancel: () => void;
  /** 清理超时定时器。 */
  clear: () => void;
  /** 是否因超时中止。 */
  isTimedOut: () => boolean;
};

/** 创建带超时的模型请求取消域。 */
export const createModelAbortScope = (timeoutSeconds: number): ModelAbortScope => {
  const abortController = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    abortController.abort();
  }, timeoutSeconds * 1000);

  return {
    signal: abortController.signal,
    cancel: () => abortController.abort(),
    clear: () => clearTimeout(timeoutId),
    isTimedOut: () => timedOut,
  };
};

/** 流的种类：主回答或并行分支，只影响缺省错误文案。 */
export type StreamKind = 'chat' | 'branch';

/** 流的失败结论。 */
export type StreamFailure = {
  /** 最终状态。 */
  status: 'error' | 'cancelled';
  /** 错误消息。 */
  errorMessage: string;
};

/** 根据取消来源判断最终流状态；文案按流种类直接给定，不再事后字符串替换。 */
export const resolveStreamFailure = (
  error: unknown,
  abortScope: ModelAbortScope,
  timeoutSeconds: number,
  kind: StreamKind,
): StreamFailure => {
  if (abortScope.isTimedOut()) {
    return {
      status: 'error',
      errorMessage: `大模型调用超时（${timeoutSeconds} 秒）`,
    };
  }

  if (isAbortError(error)) {
    return {
      status: 'cancelled',
      errorMessage: kind === 'chat' ? 'stream cancelled' : 'branch stream cancelled',
    };
  }

  return {
    status: 'error',
    errorMessage: getErrorMessage(error, kind === 'chat' ? 'chat dispatch failed' : 'branch dispatch failed'),
  };
};
