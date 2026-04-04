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

  it('提取结果写回时保留旧页面状态并更新时间', async () => {
    const storage = createFakeStorageArea();
    const repo = createPageRepository(createChromeLocalAdapter(storage));
    const existingPage = buildPageRecord({
      url: 'https://example.com/article',
      now: 100,
      promptTabStates: [
        {
          promptTabId: 'chat',
          initializedAt: 100,
          lastAutoTriggerAt: null,
          autoTriggerStatus: 'idle',
          lastClearedAt: null,
        },
      ],
    });

    await repo.savePage({
      ...existingPage,
      title: '旧标题',
      faviconUrl: 'https://example.com/favicon.ico',
      content: '旧内容',
      includePageContent: false,
    });

    const saved = await repo.saveExtractionResult({
      normalizedUrl: 'https://example.com/article',
      url: 'https://example.com/article',
      title: '新标题',
      faviconUrl: 'https://example.com/new.ico',
      content: '新内容',
      extractionMethod: 'jina',
    });

    expect(saved.title).toBe('新标题');
    expect(saved.faviconUrl).toBe('https://example.com/new.ico');
    expect(saved.content).toBe('新内容');
    expect(saved.extractionMethod).toBe('jina');
    expect(saved.includePageContent).toBe(false);
    expect(saved.promptTabStates).toEqual(existingPage.promptTabStates);
    expect(saved.updatedAt).toBeGreaterThanOrEqual(existingPage.updatedAt);
    expect(saved.expiresAt).toBeGreaterThan(saved.updatedAt);
  });

  it('更新页面级 includePageContent 时保留正文和 promptTab 状态', async () => {
    const storage = createFakeStorageArea();
    const repo = createPageRepository(createChromeLocalAdapter(storage));

    await repo.savePage({
      ...buildPageRecord({
        url: 'https://example.com/article',
        now: 100,
        promptTabStates: [
          {
            promptTabId: 'chat',
            initializedAt: 90,
            lastAutoTriggerAt: null,
            autoTriggerStatus: 'idle',
            lastClearedAt: null,
          },
        ],
      }),
      title: '示例页面',
      content: '缓存正文',
      includePageContent: true,
    });

    const saved = await repo.setIncludePageContent({
      normalizedUrl: 'https://example.com/article',
      url: 'https://example.com/article',
      includePageContent: false,
    });

    expect(saved.content).toBe('缓存正文');
    expect(saved.title).toBe('示例页面');
    expect(saved.includePageContent).toBe(false);
    expect(saved.promptTabStates).toEqual([
      {
        promptTabId: 'chat',
        initializedAt: 90,
        lastAutoTriggerAt: null,
        autoTriggerStatus: 'idle',
        lastClearedAt: null,
      },
    ]);
  });

  it('更新 promptTab 状态时保留页面正文和页面级开关', async () => {
    const storage = createFakeStorageArea();
    const repo = createPageRepository(createChromeLocalAdapter(storage));

    await repo.savePage({
      ...buildPageRecord({
        url: 'https://example.com/article',
        now: 100,
      }),
      title: '示例页面',
      content: '缓存正文',
      includePageContent: false,
    });

    const saved = await repo.setPromptTabState({
      normalizedUrl: 'https://example.com/article',
      url: 'https://example.com/article',
      promptTabId: 'quick-1',
      initializedAt: 110,
      lastAutoTriggerAt: 110,
      autoTriggerStatus: 'running',
    });

    expect(saved.title).toBe('示例页面');
    expect(saved.content).toBe('缓存正文');
    expect(saved.includePageContent).toBe(false);
    expect(saved.promptTabStates).toEqual([
      {
        promptTabId: 'quick-1',
        initializedAt: 110,
        lastAutoTriggerAt: 110,
        autoTriggerStatus: 'running',
        lastClearedAt: null,
      },
    ]);
  });
});
