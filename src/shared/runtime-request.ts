type RuntimeErrorResponse = {
  /** background 返回的错误信息。 */
  error?: string;
};

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
  const response = await sendRuntimeMessage<TResponse | RuntimeErrorResponse>(message);
  if (typeof response === 'object' && response !== null && 'error' in response && typeof response.error === 'string') {
    throw new Error(response.error);
  }

  return response as TResponse;
};
