import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_STRING_LENGTH,
  createLogger,
  describeError,
  formatLogLine,
  getLogLevel,
  sanitizePayload,
  setLogLevel,
  withContext,
} from '../../../../src/services/logger/logger';

describe('logger contract', () => {
  const initialLevel = getLogLevel();

  afterEach(() => {
    setLogLevel(initialLevel);
    vi.restoreAllMocks();
  });

  it('把载荷序列化进单行文本，并对敏感字段脱敏', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logger = createLogger('background');

    logger.info('chat.stream.started', {
      sessionId: 'session-1',
      promptTab: 'chat',
      apiKey: 'secret',
    });
    logger.error('chat.stream.failed', {
      sessionId: 'session-1',
      authorization: 'Bearer secret',
    });

    expect(infoSpy).toHaveBeenCalledWith('[background] chat.stream.started {"sessionId":"session-1","promptTab":"chat","apiKey":"[REDACTED]"}');
    expect(errorSpy).toHaveBeenCalledWith('[background] chat.stream.failed {"sessionId":"session-1","authorization":"[REDACTED]"}');
  });

  it('空载荷不输出多余的 {}', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    createLogger('background').info('runtime.installed');
    createLogger('background').info('runtime.installed', {});
    expect(infoSpy).toHaveBeenNthCalledWith(1, '[background] runtime.installed');
    expect(infoSpy).toHaveBeenNthCalledWith(2, '[background] runtime.installed');
  });

  it('按阈值过滤 debug，且可在运行时切换', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const logger = createLogger('background');

    setLogLevel('info');
    logger.debug('panel.enabled', { browserTabId: 1 });
    expect(debugSpy).not.toHaveBeenCalled();

    setLogLevel('debug');
    logger.debug('panel.enabled', { browserTabId: 1 });
    expect(debugSpy).toHaveBeenCalledWith('[background] panel.enabled {"browserTabId":1}');
  });

  it('child 追加 scope 并把固定上下文合并进每条日志', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const logger = createLogger('background').child('dispatch', { sessionId: 's-1' });

    logger.warn('chat.loading.cleanup_failed', { reason: 'boom' });

    expect(warnSpy).toHaveBeenCalledWith('[background/dispatch] chat.loading.cleanup_failed {"sessionId":"s-1","reason":"boom"}');
  });

  it('withContext 给最小 logger 形状绑定上下文，仍可与 mock 配合', () => {
    const base = { info: vi.fn(), warn: vi.fn() };
    const scoped = withContext(base, { sessionId: 's-1', branchId: 'b-1' });

    scoped.info('branch.stream.started', { provider: 'openai' });

    expect(base.info).toHaveBeenCalledWith('branch.stream.started', { sessionId: 's-1', branchId: 'b-1', provider: 'openai' });
    expect(base.warn).not.toHaveBeenCalled();
  });

  it('长字符串截断为摘要，Error 值转成 message，undefined 字段被省略', () => {
    const longText = 'x'.repeat(MAX_STRING_LENGTH + 50);
    const sanitized = sanitizePayload({
      content: longText,
      error: new Error('disk full'),
      skipped: undefined,
      nested: { gistToken: 'abc', items: [1, 'two'] },
    });

    expect(sanitized.content).toBe(`${'x'.repeat(MAX_STRING_LENGTH)}…(len=${MAX_STRING_LENGTH + 50})`);
    expect(sanitized.error).toBe('disk full');
    expect('skipped' in sanitized).toBe(false);
    expect(sanitized.nested).toEqual({ gistToken: '[REDACTED]', items: [1, 'two'] });
  });

  it('formatLogLine 对循环引用等不可序列化对象给出占位而不是抛错', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => formatLogLine('background', 'weird', { cyclic })).not.toThrow();
    expect(formatLogLine('background', 'weird', { count: 2 })).toBe('[background] weird {"count":2}');
  });

  it('describeError 统一提取错误文本', () => {
    expect(describeError(new Error('  boom '))).toBe('boom');
    expect(describeError('plain')).toBe('plain');
    expect(describeError(undefined)).toBe('unknown error');
    expect(describeError({ status: 500 })).toBe('{"status":500}');
  });
});
