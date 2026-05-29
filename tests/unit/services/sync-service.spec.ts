import { describe, expect, it, vi } from 'vitest';

import { createDefaultConfig, type ExtensionConfig } from '../../../src/domain/config/config-schema';
import { buildPageRecord } from '../../../src/domain/page/page-schema';
import { createChromeLocalAdapter } from '../../../src/repositories/chrome-local-adapter';
import { createConfigRepository } from '../../../src/repositories/config-repository';
import { createConversationRepository } from '../../../src/repositories/conversation-repository';
import { createPageRepository } from '../../../src/repositories/page-repository';
import { createSyncRepository } from '../../../src/repositories/sync-repository';
import { CONFIG_STORAGE_KEY } from '../../../src/shared/storage-keys';
import { createSyncService } from '../../../src/services/sync/sync-service';
import { createFakeStorageArea } from '../../helpers/fake-storage';

/** 构造 fetch 响应桩。 */
const createFetchResponse = ({
  status,
  json,
  text,
}: {
  /** HTTP 状态码。 */
  status: number;
  /** `json()` 返回值。 */
  json?: unknown;
  /** `text()` 返回值。 */
  text?: string;
}) => ({
  status,
  ok: status >= 200 && status < 300,
  json: vi.fn().mockResolvedValue(json),
  text: vi.fn().mockResolvedValue(text ?? ''),
});

describe('sync-service', () => {
  it('在服务创建后注入测试 provider 也能生效', async () => {
    let testProvider:
      | {
          /** 测试连接。 */
          testConnection: (sync: ExtensionConfig['sync']) => Promise<{ provider: 'gist'; ok: true; message: string }>;
          /** 执行同步。 */
          syncNow: (config: ExtensionConfig) => Promise<{ provider: 'gist'; lastSyncAt: number; snapshotBytes: number }>;
        }
      | null = null;

    const service = createSyncService({
      getTestProvider: () => testProvider,
      fetchImpl: vi.fn(),
      now: () => 456,
    });

    testProvider = {
      testConnection: vi.fn().mockResolvedValue({
        provider: 'gist',
        ok: true,
        message: '连接成功',
      }),
      syncNow: vi.fn().mockResolvedValue({
        provider: 'gist',
        lastSyncAt: 123,
        snapshotBytes: 64,
      }),
    };

    const config = createDefaultConfig({
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
    });

    await expect(service.testConnection(config.sync)).resolves.toEqual({
      provider: 'gist',
      ok: true,
      message: '连接成功',
    });
    await expect(service.syncNow(config)).resolves.toEqual({
      provider: 'gist',
      lastSyncAt: 123,
      snapshotBytes: 64,
    });

    expect(testProvider.testConnection).toHaveBeenCalledWith(config.sync);
    expect(testProvider.syncNow).toHaveBeenCalledWith(config);
  });

  it('gist 同步会先拉远端、按对象时间合并并以 tombstone 为准回写本地', async () => {
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
      now: () => 400,
    });
    const localConfig = createDefaultConfig({
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
        lastSyncAt: null,
      },
    });

    await storage.set({ [CONFIG_STORAGE_KEY]: localConfig });
    await pageRepository.savePage({
      ...buildPageRecord({ url: 'https://example.com/article-a', now: 1 }),
      title: '本地旧页',
      updatedAt: 120,
      expiresAt: 121,
    });
    await pageRepository.savePage({
      ...buildPageRecord({ url: 'https://example.com/article-b', now: 1 }),
      title: '本地已删页',
      updatedAt: 120,
      expiresAt: 121,
    });
    await pageRepository.savePage({
      ...buildPageRecord({ url: 'https://example.com/article-c', now: 1 }),
      title: '本地更新页',
      updatedAt: 420,
      expiresAt: 421,
    });
    await conversationRepository.saveConversation({
      id: 'https://example.com/article-a:chat',
      normalizedUrl: 'https://example.com/article-a',
      promptTabId: 'chat',
      messages: [],
      lastAssistantState: null,
      updatedAt: 120,
    });
    await conversationRepository.saveConversation({
      id: 'https://example.com/article-b:chat',
      normalizedUrl: 'https://example.com/article-b',
      promptTabId: 'chat',
      messages: [],
      lastAssistantState: null,
      updatedAt: 120,
    });
    await syncRepository.appendPageTombstone({
      normalizedUrl: 'https://example.com/article-b',
      deletedAt: 300,
    });

    const remoteSnapshot = {
      schemaVersion: '2.0.0',
      snapshotVersion: 7,
      exportedAt: 380,
      config: createDefaultConfig({
        updatedAt: 220,
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
          lastSyncAt: 280,
        },
      }),
      pages: [
        {
          ...buildPageRecord({ url: 'https://example.com/article-a', now: 1 }),
          title: '远端新页',
          updatedAt: 260,
          expiresAt: 261,
        },
        {
          ...buildPageRecord({ url: 'https://example.com/article-b', now: 1 }),
          title: '远端被删除页',
          updatedAt: 250,
          expiresAt: 251,
        },
        {
          ...buildPageRecord({ url: 'https://example.com/article-c', now: 1 }),
          title: '远端较旧页',
          updatedAt: 350,
          expiresAt: 351,
        },
        {
          ...buildPageRecord({ url: 'https://example.com/article-d', now: 1 }),
          title: '远端新增页',
          updatedAt: 270,
          expiresAt: 271,
        },
      ],
      conversations: [
        {
          id: 'https://example.com/article-a:chat',
          normalizedUrl: 'https://example.com/article-a',
          promptTabId: 'chat',
          messages: [],
          lastAssistantState: null,
          updatedAt: 260,
        },
        {
          id: 'https://example.com/article-b:chat',
          normalizedUrl: 'https://example.com/article-b',
          promptTabId: 'chat',
          messages: [],
          lastAssistantState: null,
          updatedAt: 250,
        },
        {
          id: 'https://example.com/article-d:chat',
          normalizedUrl: 'https://example.com/article-d',
          promptTabId: 'chat',
          messages: [],
          lastAssistantState: null,
          updatedAt: 270,
        },
      ],
      tombstones: [
        {
          normalizedUrl: 'https://example.com/article-b',
          deletedAt: 280,
        },
      ],
      lastSyncAt: 280,
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        createFetchResponse({
          status: 200,
          json: {
            files: {
              'think-bot-sp-sync.json': {
                content: JSON.stringify(remoteSnapshot),
              },
            },
          },
        }),
      )
      .mockResolvedValueOnce(createFetchResponse({ status: 200 }));
    const service = createSyncService({
      fetchImpl: fetchImpl as typeof fetch,
      now: () => 500,
      syncRepository,
    });

    const result = await service.syncNow(localConfig);

    expect(result).toEqual({
      provider: 'gist',
      lastSyncAt: 500,
      snapshotBytes: expect.any(Number),
    });
    await expect(configRepository.getConfig()).resolves.toMatchObject({
      updatedAt: 220,
      basic: {
        language: 'en',
      },
      sync: {
        lastSyncAt: 280,
      },
    });
    await expect(pageRepository.getPage('https://example.com/article-a')).resolves.toMatchObject({
      title: '远端新页',
      updatedAt: 260,
    });
    await expect(pageRepository.getPage('https://example.com/article-b')).resolves.toBeNull();
    await expect(pageRepository.getPage('https://example.com/article-c')).resolves.toMatchObject({
      title: '本地更新页',
      updatedAt: 420,
    });
    await expect(pageRepository.getPage('https://example.com/article-d')).resolves.toMatchObject({
      title: '远端新增页',
      updatedAt: 270,
    });
    await expect(conversationRepository.getConversation('https://example.com/article-a', 'chat')).resolves.toMatchObject({
      updatedAt: 260,
    });
    await expect(conversationRepository.getConversation('https://example.com/article-b', 'chat')).resolves.toBeNull();
    await expect(syncRepository.getSyncState()).resolves.toMatchObject({
      snapshotVersion: 8,
      lastSyncAt: 500,
      tombstones: [
        {
          normalizedUrl: 'https://example.com/article-b',
          deletedAt: 300,
        },
      ],
    });

    const patchBody = JSON.parse((fetchImpl.mock.calls[1]?.[1]?.body as string) ?? '{}') as {
      files: Record<string, { content: string }>;
    };
    const pushedSnapshotFile = patchBody.files['think-bot-sp-sync.json'];
    if (!pushedSnapshotFile) {
      throw new Error('sync snapshot file was not uploaded');
    }
    const pushedSnapshot = JSON.parse(pushedSnapshotFile.content) as {
      config: { basic: { language: string }; sync: { lastSyncAt: number } };
      pages: Array<{ normalizedUrl: string; title: string; updatedAt: number }>;
      conversations: Array<{ normalizedUrl: string; updatedAt: number }>;
      tombstones: Array<{ normalizedUrl: string; deletedAt: number }>;
      lastSyncAt: number;
      snapshotVersion: number;
    };

    expect(pushedSnapshot.config.basic.language).toBe('en');
    expect(pushedSnapshot.config.sync.lastSyncAt).toBe(500);
    expect(pushedSnapshot.lastSyncAt).toBe(500);
    expect(pushedSnapshot.snapshotVersion).toBe(8);
    expect(pushedSnapshot.pages).toMatchObject([
      {
        normalizedUrl: 'https://example.com/article-a',
        title: '远端新页',
        updatedAt: 260,
      },
      {
        normalizedUrl: 'https://example.com/article-c',
        title: '本地更新页',
        updatedAt: 420,
      },
      {
        normalizedUrl: 'https://example.com/article-d',
        title: '远端新增页',
        updatedAt: 270,
      },
    ]);
    expect(pushedSnapshot.conversations).toMatchObject([
      {
        normalizedUrl: 'https://example.com/article-a',
        updatedAt: 260,
      },
      {
        normalizedUrl: 'https://example.com/article-d',
        updatedAt: 270,
      },
    ]);
    expect(pushedSnapshot.tombstones).toEqual([
      {
        normalizedUrl: 'https://example.com/article-b',
        deletedAt: 300,
      },
    ]);
  });

  it('远端快照格式非法时不会覆盖本地有效数据', async () => {
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
      now: () => 300,
    });
    const localConfig = createDefaultConfig({
      updatedAt: 100,
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
    });

    await storage.set({ [CONFIG_STORAGE_KEY]: localConfig });
    await pageRepository.savePage({
      ...buildPageRecord({ url: 'https://example.com/stable', now: 1 }),
      title: '本地稳定页',
      updatedAt: 150,
      expiresAt: 151,
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      createFetchResponse({
        status: 200,
        json: {
          files: {
            'think-bot-sp-sync.json': {
              content: '{',
            },
          },
        },
      }),
    );
    const service = createSyncService({
      fetchImpl: fetchImpl as typeof fetch,
      now: () => 600,
      syncRepository,
    });

    await expect(service.syncNow(localConfig)).rejects.toThrow(/远端快照格式非法/);
    await expect(pageRepository.getPage('https://example.com/stable')).resolves.toMatchObject({
      title: '本地稳定页',
      updatedAt: 150,
    });
    await expect(syncRepository.getSyncState()).resolves.toMatchObject({
      snapshotVersion: 0,
      lastSyncAt: null,
      tombstones: [],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('webdav 远端文件不存在时按首次同步处理，并推送本地完整快照', async () => {
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
      now: () => 610,
    });
    const localConfig = createDefaultConfig({
      updatedAt: 100,
      sync: {
        enabled: true,
        provider: 'webdav',
        gistToken: '',
        gistId: '',
        webdavUrl: 'https://dav.example.com/sync.json',
        webdavUsername: 'user',
        webdavPassword: 'pass',
        lastSyncAt: null,
      },
    });

    await storage.set({ [CONFIG_STORAGE_KEY]: localConfig });
    await pageRepository.savePage({
      ...buildPageRecord({ url: 'https://example.com/webdav', now: 1 }),
      title: 'WebDAV 页面',
      updatedAt: 160,
      expiresAt: 161,
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(createFetchResponse({ status: 404 }))
      .mockResolvedValueOnce(createFetchResponse({ status: 201 }));
    const service = createSyncService({
      fetchImpl: fetchImpl as typeof fetch,
      now: () => 700,
      syncRepository,
    });

    const result = await service.syncNow(localConfig);

    expect(result).toEqual({
      provider: 'webdav',
      lastSyncAt: 700,
      snapshotBytes: expect.any(Number),
    });
    await expect(syncRepository.getSyncState()).resolves.toMatchObject({
      snapshotVersion: 2,
      lastSyncAt: 700,
    });

    const putPayload = JSON.parse((fetchImpl.mock.calls[1]?.[1]?.body as string) ?? '{}') as {
      pages: Array<{ normalizedUrl: string; title: string }>;
      lastSyncAt: number;
      config: { sync: { lastSyncAt: number } };
    };
    expect(putPayload.pages).toMatchObject([
      {
        normalizedUrl: 'https://example.com/webdav',
        title: 'WebDAV 页面',
      },
    ]);
    expect(putPayload.lastSyncAt).toBe(700);
    expect(putPayload.config.sync.lastSyncAt).toBe(700);
  });
});
