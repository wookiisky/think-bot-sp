import { describe, expect, it, vi } from 'vitest';

import { createLogger } from '../../../../src/services/logger/logger';

describe('logger contract', () => {
  it('阶段 4 日志事件名稳定且继续脱敏', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logger = createLogger('background');

    try {
      logger.info('chat.stream.started', {
        sessionId: 'session-1',
        promptTab: 'chat',
        apiKey: 'secret',
      });
      logger.error('chat.stream.failed', {
        sessionId: 'session-1',
        authorization: 'Bearer secret',
      });

      expect(infoSpy).toHaveBeenCalledWith('[background] chat.stream.started', {
        sessionId: 'session-1',
        promptTab: 'chat',
        apiKey: '[REDACTED]',
      });
      expect(errorSpy).toHaveBeenCalledWith('[background] chat.stream.failed', {
        sessionId: 'session-1',
        authorization: '[REDACTED]',
      });
    } finally {
      infoSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
