import { createLogger, describeError } from '../services/logger/logger';

type RuntimeErrorResponse = {
  /** background 返回的错误信息。 */
  error?: string;
};

const logger = createLogger('ui/runtime');

/** 取消息里的命令类型，供日志串联；拿不到时记为 unknown。 */
const resolveMessageType = (message: unknown): string =>
  typeof message === 'object' && message !== null && 'type' in message ? String((message as { type: unknown }).type) : 'unknown';

/** 发送 runtime 消息，并统一处理 Chrome 原生错误。 */
export const sendRuntimeMessage = <TResponse,>(message: unknown): Promise<TResponse> => {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    throw new Error('chrome.runtime.sendMessage is unavailable');
  }

  return new Promise<TResponse>((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: TResponse) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(response);
    });
  });
};

/** 发送 runtime 消息，并把 background 的显式错误响应收敛成异常。 */
export const requestRuntimeMessage = async <TResponse,>(message: unknown): Promise<TResponse> => {
  const type = resolveMessageType(message);
  const startedAt = Date.now();
  let response: TResponse | RuntimeErrorResponse;
  try {
    response = await sendRuntimeMessage<TResponse | RuntimeErrorResponse>(message);
  } catch (error) {
    // 走到这里说明 background 没有给出任何响应：worker 未唤醒、消息通道被关闭或扩展被重载。
    logger.warn('command.unreachable', { type, durationMs: Date.now() - startedAt, reason: describeError(error) });
    throw error;
  }
  if (typeof response === 'object' && response !== null && 'error' in response && typeof response.error === 'string') {
    logger.warn('command.rejected', { type, durationMs: Date.now() - startedAt, reason: response.error });
    throw new Error(response.error);
  }

  logger.debug('command.completed', { type, durationMs: Date.now() - startedAt });
  return response as TResponse;
};
