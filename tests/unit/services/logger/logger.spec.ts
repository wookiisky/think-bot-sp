import { describe, expect, it, vi } from 'vitest';

import { createLogger } from '../../../../src/services/logger/logger';

describe('logger stage 3 contract', () => {
  it('稳定输出阶段 3 关键事件名和脱敏字段', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const logger = createLogger('background');

    try {
      logger.info('panel.init.started', {
        browserTabId: 7,
        normalizedUrl: 'https://example.com',
        apiKey: 'secret',
        gistToken: 'gist-secret',
      });
      logger.warn('extraction.readability_failed', {
        browserTabId: 7,
        normalizedUrl: 'https://example.com',
        authorization: 'Bearer secret',
      });

      expect(infoSpy).toHaveBeenCalledWith('[background] panel.init.started', {
        browserTabId: 7,
        normalizedUrl: 'https://example.com',
        apiKey: '[REDACTED]',
        gistToken: '[REDACTED]',
      });
      expect(warnSpy).toHaveBeenCalledWith('[background] extraction.readability_failed', {
        browserTabId: 7,
        normalizedUrl: 'https://example.com',
        authorization: '[REDACTED]',
      });
    } finally {
      infoSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});
