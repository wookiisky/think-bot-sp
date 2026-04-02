import { describe, expect, it } from 'vitest';

import { buildPageRecord } from '../../../src/domain/page/page-schema';
import { createChromeLocalAdapter } from '../../../src/repositories/chrome-local-adapter';
import { createPageRepository } from '../../../src/repositories/page-repository';
import { createFakeStorageArea } from '../../helpers/fake-storage';

describe('page-repository', () => {
  it('页面恢复后只清理过期数据', async () => {
    const storage = createFakeStorageArea();
    const repo = createPageRepository(createChromeLocalAdapter(storage));
    const freshPage = buildPageRecord({ url: 'https://example.com/fresh', now: 100 });
    const expiredPage = { ...buildPageRecord({ url: 'https://example.com/old', now: 100 }), updatedAt: 98, expiresAt: 99 };

    await repo.savePage(freshPage);
    await repo.savePage(expiredPage);

    await repo.cleanupExpiredPages(100);

    await expect(repo.getPage('https://example.com/fresh')).resolves.not.toBeNull();
    await expect(repo.getPage('https://example.com/old')).resolves.toBeNull();
  });

  it('级联删除只影响页面相关 key', async () => {
    const storage = createFakeStorageArea();
    const pageRepo = createPageRepository(createChromeLocalAdapter(storage));

    await pageRepo.savePage(buildPageRecord({ url: 'https://example.com/a', now: 1 }));
    await storage.set({
      'conversation:https://example.com/a:chat': { sentinel: true },
      'conversation:https://example.com/a:extra:chat': { sentinel: true },
      'loading:https://example.com/a:chat': { sentinel: true },
      'loading:https://example.com/a:extra:chat': { sentinel: true },
      'config:extension': { keep: true },
    });

    await pageRepo.deletePage('https://example.com/a');

    expect(storage.dump()['config:extension']).toEqual({ keep: true });
    expect(storage.dump()['conversation:https://example.com/a:chat']).toBeUndefined();
    expect(storage.dump()['loading:https://example.com/a:chat']).toBeUndefined();
    expect(storage.dump()['page:https://example.com/a']).toBeUndefined();
    expect(storage.dump()['conversation:https://example.com/a:extra:chat']).toEqual({ sentinel: true });
    expect(storage.dump()['loading:https://example.com/a:extra:chat']).toEqual({ sentinel: true });
  });

  it('解构后仍可清理过期页面', async () => {
    const storage = createFakeStorageArea();
    const repo = createPageRepository(createChromeLocalAdapter(storage));
    const expiredPage = { ...buildPageRecord({ url: 'https://example.com/old', now: 100 }), updatedAt: 98, expiresAt: 99 };

    await repo.savePage(expiredPage);

    const { cleanupExpiredPages } = repo;
    await expect(cleanupExpiredPages(100)).resolves.toEqual(['https://example.com/old']);
    await expect(repo.getPage('https://example.com/old')).resolves.toBeNull();
  });
});
