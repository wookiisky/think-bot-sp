import { describe, expect, it } from 'vitest';

import { createChromeLocalAdapter } from '../../../src/repositories/chrome-local-adapter';
import { createRecentErrorRepository } from '../../../src/repositories/recent-error-repository';
import { createFakeStorageArea } from '../../helpers/fake-storage';

describe('recent-error-repository', () => {
  it('跨实例读写一致，并在写入时自动脱敏', async () => {
    const storage = createFakeStorageArea();
    const repoA = createRecentErrorRepository(createChromeLocalAdapter(storage), () => 456);
    const repoB = createRecentErrorRepository(createChromeLocalAdapter(storage), () => 789);

    await repoA.saveRecentError({
      source: 'sidebar',
      operation: 'RE_EXTRACT_CONTENT',
      message: 'Bearer secret-token',
    });

    await expect(repoB.getRecentError()).resolves.toEqual({
      source: 'sidebar',
      operation: 'RE_EXTRACT_CONTENT',
      message: 'Bearer [redacted]',
      capturedAt: 456,
    });
  });

  it('没有历史错误时返回 null', async () => {
    const repo = createRecentErrorRepository(createChromeLocalAdapter(createFakeStorageArea()));

    await expect(repo.getRecentError()).resolves.toBeNull();
  });
});
