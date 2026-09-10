/**
 * 结构化调试日志。
 *
 * 每条日志输出为一行纯文本：`[scope] event {"key":"value"}`。
 * 载荷在记录时刻就被序列化进消息文本，不再把对象作为第二个参数交给 console：
 * DevTools 持有的对象是活引用，折叠时只显示 `{…}`，复制或被 E2E 抓取时也拿不到字段。
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = Record<string, unknown>;

export type Logger = {
  /** 高频、仅开发排障需要的细节；生产默认不输出。 */
  debug: (_event: string, _context?: LogContext) => void;
  /** 关键流程节点：开始、完成、用户主动操作。 */
  info: (_event: string, _context?: LogContext) => void;
  /** 预期内失败、降级、能力缺失。 */
  warn: (_event: string, _context?: LogContext) => void;
  /** 依赖失败或不应发生的状态。 */
  error: (_event: string, _context?: LogContext) => void;
  /** 派生子 logger：scope 追加一段，context 合并进后续每条日志。 */
  child: (_scope: string, _context?: LogContext) => Logger;
};

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** 命中即整值脱敏的字段名（大小写不敏感，按包含匹配）。 */
const SENSITIVE_KEY_PATTERN = /apikey|token|password|secret|authorization|credential/i;

/** 单个字符串字段保留的最大长度，超出部分用长度摘要代替，防止正文和用户输入进入日志。 */
export const MAX_STRING_LENGTH = 200;

/** 序列化时允许的最大嵌套深度。 */
const MAX_DEPTH = 3;

const REDACTED = '[REDACTED]';

const resolveDefaultLevel = (): LogLevel => {
  try {
    const env = (import.meta as { env?: { DEV?: boolean; MODE?: string } }).env;
    if (env?.MODE === 'test') {
      return 'debug';
    }
    return env?.DEV ? 'debug' : 'info';
  } catch {
    return 'info';
  }
};

let currentLevel: LogLevel = resolveDefaultLevel();

/** 调整当前 JS 上下文的日志阈值；每个扩展页面和 service worker 各自独立。 */
export const setLogLevel = (level: LogLevel) => {
  currentLevel = level;
};

export const getLogLevel = (): LogLevel => currentLevel;

const isEnabled = (level: LogLevel) => LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];

/** 统一提取错误文本，供日志 `reason` 字段使用。 */
export const describeError = (error: unknown, fallback = 'unknown error'): string => {
  if (error instanceof Error) {
    return error.message.trim() || error.name || fallback;
  }
  if (typeof error === 'string') {
    return error.trim() || fallback;
  }
  if (error === null || error === undefined) {
    return fallback;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const truncate = (value: string): string =>
  value.length <= MAX_STRING_LENGTH ? value : `${value.slice(0, MAX_STRING_LENGTH)}…(len=${value.length})`;

const sanitizeValue = (value: unknown, depth: number): unknown => {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return truncate(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value instanceof Error) {
    return describeError(value);
  }
  if (typeof value === 'function' || typeof value === 'symbol') {
    return undefined;
  }
  if (depth >= MAX_DEPTH) {
    return Array.isArray(value) ? `[array(${value.length})]` : '[object]';
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    return sanitizePayload(value as LogContext, depth + 1);
  }
  return String(value);
};

/** 脱敏并裁剪日志载荷：敏感字段整值替换，长字符串截断，深层对象折叠。 */
export const sanitizePayload = (payload?: LogContext, depth = 0): LogContext => {
  if (!payload) {
    return {};
  }

  const sanitized: LogContext = {};
  for (const key of Object.keys(payload)) {
    const value = payload[key];
    if (value === undefined) {
      continue;
    }
    sanitized[key] = SENSITIVE_KEY_PATTERN.test(key) && value !== null ? REDACTED : sanitizeValue(value, depth);
  }
  return sanitized;
};

const stringifyPayload = (payload: LogContext): string => {
  if (Object.keys(payload).length === 0) {
    return '';
  }
  try {
    return JSON.stringify(payload);
  } catch {
    return '[unserializable payload]';
  }
};

/** 生成最终输出的单行文本。 */
export const formatLogLine = (scope: string, event: string, context?: LogContext): string => {
  const serialized = stringifyPayload(sanitizePayload(context));
  return serialized ? `[${scope}] ${event} ${serialized}` : `[${scope}] ${event}`;
};

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
  }
};

const buildLogger = (scope: string, boundContext: LogContext): Logger => {
  const emit = (level: LogLevel, event: string, context?: LogContext) => {
    if (!isEnabled(level)) {
      return;
    }
    getMethod(level)(formatLogLine(scope, event, { ...boundContext, ...context }));
  };

  return {
    debug: (event, context) => emit('debug', event, context),
    info: (event, context) => emit('info', event, context),
    warn: (event, context) => emit('warn', event, context),
    error: (event, context) => emit('error', event, context),
    child: (childScope, context) => buildLogger(`${scope}/${childScope}`, { ...boundContext, ...context }),
  };
};

/** 创建指定 scope 的 logger；scope 使用运行上下文名，例如 `background`、`sidebar`、`options`。 */
export const createLogger = (scope: string, context?: LogContext): Logger => buildLogger(scope, context ?? {});

/** 给任意最小 logger 形状绑定固定上下文；服务内部用它串联同一请求链路的字段。 */
export const withContext = <T extends Partial<Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>>>(logger: T, context: LogContext): T => {
  const wrap = (method?: Logger['info']) =>
    method ? (event: string, extra?: LogContext) => method(event, { ...context, ...extra }) : undefined;
  return {
    ...logger,
    ...(logger.debug ? { debug: wrap(logger.debug) } : {}),
    ...(logger.info ? { info: wrap(logger.info) } : {}),
    ...(logger.warn ? { warn: wrap(logger.warn) } : {}),
    ...(logger.error ? { error: wrap(logger.error) } : {}),
  } as T;
};

/** 在控制台里手动切换日志级别的入口，例如 `__thinkBotLog.setLevel('debug')`。 */
const installConsoleControls = () => {
  const host = globalThis as typeof globalThis & {
    __thinkBotLog?: { setLevel: typeof setLogLevel; getLevel: typeof getLogLevel };
  };
  if (!host.__thinkBotLog) {
    host.__thinkBotLog = { setLevel: setLogLevel, getLevel: getLogLevel };
  }
};

installConsoleControls();
