import { describe, expect, it, vi } from 'vitest';

import { createLogger } from '../../../../src/services/logger/logger';

describe('logger', () => {
  it('prints stable event envelopes', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const logger = createLogger('background');

    logger.info('panel.open.requested', { tabId: 7, apiKey: 'secret' });

    expect(spy).toHaveBeenCalledTimes(1);
    const [message, payload] = spy.mock.calls[0];

    expect(message).toEqual(expect.stringContaining('panel.open.requested'));
    expect(payload).toEqual({
      tabId: 7,
      apiKey: '[REDACTED]',
    });
  });
});
