import { describe, expect, it } from 'vitest';

import {
  buildRecentErrorSummary,
  sanitizeRecentErrorMessage,
} from '../../../src/domain/error/recent-error-schema';

describe('recent-error-schema', () => {
  it('保存最近错误前会做最小脱敏', () => {
    expect(sanitizeRecentErrorMessage('Bearer secret-token')).toBe('Bearer [redacted]');
    expect(sanitizeRecentErrorMessage('token=secret-value')).toBe('token=[redacted]');
    expect(sanitizeRecentErrorMessage('password: super-secret')).toBe('password: [redacted]');
  });

  it('构造最近错误时会补 capturedAt 并保留结构化字段', () => {
    const summary = buildRecentErrorSummary(
      {
        source: 'sync',
        operation: 'SYNC_NOW',
        message: 'Bearer secret-token',
      },
      () => 123,
    );

    expect(summary).toEqual({
      source: 'sync',
      operation: 'SYNC_NOW',
      message: 'Bearer [redacted]',
      capturedAt: 123,
    });
  });
});
