type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SENSITIVE_KEYS = new Set(['apiKey', 'gistToken', 'webdavPassword', 'authorization']);

/** 脱敏日志载荷中的敏感字段，避免配置或凭据进入控制台。 */
export const sanitizePayload = (payload?: Record<string, unknown>): Record<string, unknown> => {
  if (!payload) {
    return {};
  }

  const sanitized: Record<string, unknown> = {};
  for (const key of Object.keys(payload)) {
    sanitized[key] = SENSITIVE_KEYS.has(key) ? '[REDACTED]' : payload[key];
  }

  return sanitized;
};

const formatMessage = (scope: string, event: string): string => `[${scope}] ${event}`;

const getMethod = (level: LogLevel) => {
  switch (level) {
    case 'debug':
      return console.debug;
    case 'info':
      return console.info;
    case 'warn':
      return console.warn;
    case 'error':
      return console.error;
    default:
      return console.log;
  }
};

export const createLogger = (scope: string) => {
  const emit = (level: LogLevel, event: string, payload?: Record<string, unknown>) => {
    const method = getMethod(level);
    method(formatMessage(scope, event), sanitizePayload(payload));
  };

  return {
    debug: (event: string, payload?: Record<string, unknown>) => emit('debug', event, payload),
    info: (event: string, payload?: Record<string, unknown>) => emit('info', event, payload),
    warn: (event: string, payload?: Record<string, unknown>) => emit('warn', event, payload),
    error: (event: string, payload?: Record<string, unknown>) => emit('error', event, payload),
  };
};
