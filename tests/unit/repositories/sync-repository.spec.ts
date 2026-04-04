import { describe, expect, it } from 'vitest';

import { createDefaultConfig } from '../../../src/domain/config/config-schema';
import { buildPageRecord } from '../../../src/domain/page/page-schema';
import { createChromeLocalAdapter } from '../../../src/repositories/chrome-local-adapter';
import { createConfigRepository } from '../../../src/repositories/config-repository';
import { createConversationRepository } from '../../../src/repositories/conversation-repository';
import { createPageRepository } from '../../../src/repositories/page-repository';
import { createSyncRepository } from '../../../src/repositories/sync-repository';
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
});
