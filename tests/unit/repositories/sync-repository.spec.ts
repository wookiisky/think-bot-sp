import { describe, expect, it, vi } from 'vitest';

import { createDefaultConfig } from '../../../src/domain/config/config-schema';
import { buildPageRecord } from '../../../src/domain/page/page-schema';
import { createChromeLocalAdapter } from '../../../src/repositories/chrome-local-adapter';
import { createConfigRepository } from '../../../src/repositories/config-repository';
import { createConversationRepository } from '../../../src/repositories/conversation-repository';
import { createPageRepository } from '../../../src/repositories/page-repository';
import { createSyncRepository } from '../../../src/repositories/sync-repository';
import { CONFIG_STORAGE_KEY, SYNC_STATE_STORAGE_KEY } from '../../../src/shared/storage-keys';
import { createFakeStorageArea } from '../../helpers/fake-storage';

describe('sync-repository', () => {
  it('导出快照时包含 tombstone 并过滤已软删页面和会话', async () => {
    const storage = createFakeStorageArea();
    const adapter = createChromeLocalAdapter(storage);
    const configRepository = createConfigRepository(adapter);
    const pageRepository = createPageRepository(adapter);
    const conversationRepository = createConversationRepository(adapter);
    const syncRepository = createSyncRepository({
      configRepository,
      pageRepository,
      conversationRepository,
      storage: adapter,
    });

    const config = await configRepository.saveConfig(
      createDefaultConfig({
        sync: {
          enabled: true,
          provider: 'gist',
          gistToken: 'token',
          gistId: 'gist-id',
          webdavUrl: '',
          webdavUsername: '',
          webdavPassword: '',
          lastSyncAt: null,
        },
      }),
    );

    await pageRepository.savePage({
      ...buildPageRecord({ url: 'https://example.com/keep', now: 1 }),
      title: '保留页',
      updatedAt: 100,
      expiresAt: 101,
    });
    await pageRepository.savePage({
      ...buildPageRecord({ url: 'https://example.com/deleted', now: 1 }),
      title: '删除页',
      updatedAt: 100,
      expiresAt: 101,
    });
    await conversationRepository.saveConversation({
      id: 'https://example.com/keep:chat',
      normalizedUrl: 'https://example.com/keep',
      promptTabId: 'chat',
      messages: [],
      lastAssistantState: null,
      updatedAt: 100,
    });
    await conversationRepository.saveConversation({
      id: 'https://example.com/deleted:chat',
      normalizedUrl: 'https://example.com/deleted',
      promptTabId: 'chat',
      messages: [],
      lastAssistantState: null,
      updatedAt: 100,
    });
    await syncRepository.appendPageTombstone({
      normalizedUrl: 'https://example.com/deleted',
      deletedAt: 200,
    });

    const snapshot = await syncRepository.buildSnapshot(config);

    expect(snapshot.snapshotVersion).toBe(1);
    expect(snapshot.config.sync.provider).toBe('gist');
    expect(snapshot.pages).toMatchObject([{ normalizedUrl: 'https://example.com/keep' }]);
    expect(snapshot.conversations).toMatchObject([{ normalizedUrl: 'https://example.com/keep', promptTabId: 'chat' }]);
    expect(snapshot.tombstones).toEqual([
      {
        normalizedUrl: 'https://example.com/deleted',
        deletedAt: 200,
      },
    ]);
  });

  it('重复写入 tombstone 时保留更晚删除时间', async () => {
    const storage = createFakeStorageArea();
    const adapter = createChromeLocalAdapter(storage);
    const syncRepository = createSyncRepository({
      configRepository: createConfigRepository(adapter),
      pageRepository: createPageRepository(adapter),
      conversationRepository: createConversationRepository(adapter),
      storage: adapter,
    });

    await syncRepository.appendPageTombstone({
      normalizedUrl: 'https://example.com/article',
      deletedAt: 100,
    });
    await syncRepository.appendPageTombstone({
      normalizedUrl: 'https://example.com/article',
      deletedAt: 80,
    });
    await syncRepository.appendPageTombstone({
      normalizedUrl: 'https://example.com/article',
      deletedAt: 120,
    });

    await expect(syncRepository.getTombstones()).resolves.toEqual([
      {
        normalizedUrl: 'https://example.com/article',
        deletedAt: 120,
      },
    ]);
  });

  it('应用合并快照时会替换本地稳定数据并清理孤儿 loading', async () => {
    const storage = createFakeStorageArea();
    const adapter = createChromeLocalAdapter(storage);
    const configRepository = createConfigRepository(adapter);
    const pageRepository = createPageRepository(adapter);
    const conversationRepository = createConversationRepository(adapter);
    const syncRepository = createSyncRepository({
      configRepository,
      pageRepository,
      conversationRepository,
      storage: adapter,
    });

    await storage.set({
      [CONFIG_STORAGE_KEY]: createDefaultConfig({
        updatedAt: 100,
        basic: {
          language: 'zh-CN',
        },
        sync: {
          enabled: true,
          provider: 'gist',
          gistToken: 'token',
          gistId: 'gist-id',
          webdavUrl: '',
          webdavUsername: '',
          webdavPassword: '',
          lastSyncAt: 11,
        },
      }),
      [SYNC_STATE_STORAGE_KEY]: {
        schemaVersion: '2.0.0',
        snapshotVersion: 2,
        tombstones: [],
        lastSyncAt: 11,
      },
    });
    await pageRepository.savePage({
      ...buildPageRecord({ url: 'https://example.com/legacy', now: 1 }),
      title: '旧页面',
      updatedAt: 100,
      expiresAt: 101,
    });
    await conversationRepository.saveConversation({
      id: 'https://example.com/legacy:chat',
      normalizedUrl: 'https://example.com/legacy',
      promptTabId: 'chat',
      messages: [],
      lastAssistantState: null,
      updatedAt: 100,
    });
    await conversationRepository.saveLoadingState({
      id: 'loading:https://example.com/legacy:chat',
      normalizedUrl: 'https://example.com/legacy',
      promptTabId: 'chat',
      sessionId: 'session-legacy',
      promptTabStatus: 'loading',
      branchStates: [],
      resumeTarget: null,
      cancelRequested: false,
      updatedAt: 100,
    });

    await syncRepository.applyMergedSnapshot({
      schemaVersion: '2.0.0',
      snapshotVersion: 7,
      exportedAt: 300,
      config: createDefaultConfig({
        updatedAt: 200,
        basic: {
          language: 'en',
        },
        sync: {
          enabled: true,
          provider: 'gist',
          gistToken: 'token',
          gistId: 'gist-id',
          webdavUrl: '',
          webdavUsername: '',
          webdavPassword: '',
          lastSyncAt: 22,
        },
      }),
      pages: [
        {
          ...buildPageRecord({ url: 'https://example.com/remote', now: 1 }),
          title: '远端页面',
          updatedAt: 220,
          expiresAt: 221,
        },
      ],
      conversations: [
        {
          id: 'https://example.com/remote:chat',
          normalizedUrl: 'https://example.com/remote',
          promptTabId: 'chat',
          messages: [],
          lastAssistantState: null,
          updatedAt: 230,
        },
      ],
      tombstones: [
        {
          normalizedUrl: 'https://example.com/deleted',
          deletedAt: 240,
        },
      ],
      lastSyncAt: 22,
    });

    await expect(configRepository.getConfig()).resolves.toMatchObject({
      updatedAt: 200,
      basic: {
        language: 'en',
      },
      sync: {
        lastSyncAt: 22,
      },
    });
    await expect(pageRepository.getPage('https://example.com/legacy')).resolves.toBeNull();
    await expect(pageRepository.getPage('https://example.com/remote')).resolves.toMatchObject({
      title: '远端页面',
    });
    await expect(conversationRepository.getConversation('https://example.com/legacy', 'chat')).resolves.toBeNull();
    await expect(conversationRepository.getConversation('https://example.com/remote', 'chat')).resolves.toMatchObject({
      updatedAt: 230,
    });
    await expect(conversationRepository.getLoadingState('https://example.com/legacy', 'chat')).resolves.toBeNull();
    await expect(syncRepository.getSyncState()).resolves.toMatchObject({
      snapshotVersion: 7,
      lastSyncAt: 22,
      tombstones: [
        {
          normalizedUrl: 'https://example.com/deleted',
          deletedAt: 240,
        },
      ],
    });
  });
  it.each(['set', 'remove'] as const)('preserves recoverable data when snapshot %s fails', async (operation) => {
    const storage = createFakeStorageArea();
    const adapter = createChromeLocalAdapter(storage);
    const configRepository = createConfigRepository(adapter);
    const pageRepository = createPageRepository(adapter);
    const conversationRepository = createConversationRepository(adapter);
    const syncRepository = createSyncRepository({ storage: adapter, configRepository, pageRepository, conversationRepository });
    const deletedUrl = 'https://example.com/deleted';
    const keptUrl = 'https://example.com/kept';
    await pageRepository.savePage(buildPageRecord({ url: deletedUrl, now: 100 }));
    await conversationRepository.appendUserMessage({ normalizedUrl: deletedUrl, promptTabId: 'chat', messageId: 'old', content: 'old', images: [], now: 100 });
    const before = storage.dump();
    const snapshot = await syncRepository.buildSnapshot();
    snapshot.pages = [buildPageRecord({ url: keptUrl, now: 300 })];
    snapshot.conversations = [];
    snapshot.tombstones = [{ normalizedUrl: deletedUrl, deletedAt: 200 }];
    const fault = vi.spyOn(storage, operation).mockRejectedValueOnce(new Error('storage failure'));

    await expect(syncRepository.applyMergedSnapshot(snapshot)).rejects.toThrow('storage failure');
    if (operation === 'set') {
      expect(storage.dump()).toEqual(before);
    } else {
      expect((await syncRepository.buildSnapshot()).pages.map((page) => page.normalizedUrl)).toEqual([keptUrl]);
      expect((await syncRepository.buildSnapshot()).conversations).toEqual([]);
    }
    fault.mockRestore();
    await syncRepository.applyMergedSnapshot(snapshot);
    expect(await pageRepository.getPage(deletedUrl)).toBeNull();
    expect(await pageRepository.getPage(keptUrl)).not.toBeNull();
    expect(await conversationRepository.getConversation(deletedUrl, 'chat')).toBeNull();
  });

  it.each([199, 200, 201])('exports only conversations created after the clear boundary (createdAt: %s)', async (createdAt) => {
    const storage = createFakeStorageArea();
    const adapter = createChromeLocalAdapter(storage);
    const configRepository = createConfigRepository(adapter);
    const pageRepository = createPageRepository(adapter);
    const conversationRepository = createConversationRepository(adapter);
    const syncRepository = createSyncRepository({ storage: adapter, configRepository, pageRepository, conversationRepository });
    const url = 'https://example.com/clear';
    await pageRepository.savePage(buildPageRecord({ url, now: 100 }));
    await pageRepository.setPromptTabState({ normalizedUrl: url, url, promptTabId: 'chat', lastClearedAt: 200 });
    await conversationRepository.appendUserMessage({ normalizedUrl: url, promptTabId: 'chat', messageId: 'message', content: 'content', images: [], now: createdAt });
    expect((await syncRepository.buildSnapshot()).conversations).toHaveLength(createdAt > 200 ? 1 : 0);
  });

  it('keeps cleared tab history hidden after cleanup fails and retries cleanup after restart', async () => {
    const storage = createFakeStorageArea();
    const adapter = createChromeLocalAdapter(storage);
    const configRepository = createConfigRepository(adapter);
    const pageRepository = createPageRepository(adapter);
    const conversationRepository = createConversationRepository(adapter);
    const syncRepository = createSyncRepository({ storage: adapter, configRepository, pageRepository, conversationRepository });
    const url = 'https://example.com/clear';
    await pageRepository.savePage(buildPageRecord({ url, now: 100 }));
    await conversationRepository.appendUserMessage({ normalizedUrl: url, promptTabId: 'chat', messageId: 'old', content: 'old', images: [], now: 100 });
    await pageRepository.setPromptTabState({ normalizedUrl: url, url, promptTabId: 'chat', lastClearedAt: 200 });
    const snapshot = await syncRepository.buildSnapshot();
    snapshot.conversations = [];
    const fault = vi.spyOn(storage, 'remove').mockRejectedValueOnce(new Error('cleanup failure'));
    await expect(syncRepository.applyMergedSnapshot(snapshot)).rejects.toThrow('cleanup failure');
    fault.mockRestore();

    const restartedStorage = createFakeStorageArea();
    await restartedStorage.set(storage.dump());
    const restartedAdapter = createChromeLocalAdapter(restartedStorage);
    const restartedConversationRepository = createConversationRepository(restartedAdapter);
    const restartedRepository = createSyncRepository({ storage: restartedAdapter, configRepository, pageRepository, conversationRepository: restartedConversationRepository });
    expect(await restartedConversationRepository.getConversation(url, 'chat')).not.toBeNull();
    const retrySnapshot = await restartedRepository.buildSnapshot();
    expect(retrySnapshot.conversations).toEqual([]);
    await restartedRepository.applyMergedSnapshot(retrySnapshot);
    expect(await restartedConversationRepository.getConversation(url, 'chat')).toBeNull();
  });

});
