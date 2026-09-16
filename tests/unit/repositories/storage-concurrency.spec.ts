import { describe, expect, it, vi } from 'vitest';

import { createDefaultConfig } from '../../../src/domain/config/config-schema';
import { buildPageRecord } from '../../../src/domain/page/page-schema';
import { createChromeLocalAdapter } from '../../../src/repositories/chrome-local-adapter';
import { createConfigRepository } from '../../../src/repositories/config-repository';
import { createConversationRepository } from '../../../src/repositories/conversation-repository';
import { createPageRepository } from '../../../src/repositories/page-repository';
import { createSyncRepository } from '../../../src/repositories/sync-repository';
import { buildConversationStorageKey, buildPageStorageKey } from '../../../src/shared/storage-keys';
import { createFakeStorageArea } from '../../helpers/fake-storage';

const url = 'https://example.com/page';
const createRepositories = (storage = createFakeStorageArea()) => {
  const adapter = createChromeLocalAdapter(storage);
  const pageRepository = createPageRepository(adapter);
  const configRepository = createConfigRepository(adapter);
  const conversationRepository = createConversationRepository(adapter);
  const syncRepository = createSyncRepository({ storage: adapter });
  return { storage, adapter, pageRepository, configRepository, conversationRepository, syncRepository };
};

describe('shared storage transactions', () => {
  it('preserves simultaneous prompt-tab updates across repository and adapter instances', async () => {
    const first = createRepositories();
    const second = createRepositories(first.storage);
    await first.pageRepository.savePage(buildPageRecord({ url, now: 100 }));
    await Promise.all([
      first.pageRepository.setPromptTabState({ normalizedUrl: url, url, promptTabId: 'a', autoTriggerStatus: 'done' }),
      second.pageRepository.setPromptTabState({ normalizedUrl: url, url, promptTabId: 'b', autoTriggerStatus: 'done' }),
      first.pageRepository.setIncludePageContent({ normalizedUrl: url, url, includePageContent: false }),
    ]);
    const page = await first.pageRepository.getPage(url);
    expect(page?.promptTabStates.map((state) => state.promptTabId)).toEqual(['a', 'b']);
    expect(page?.includePageContent).toBe(false);
  });

  it('preserves concurrent conversation appends across repository instances', async () => {
    const first = createRepositories();
    const second = createRepositories(first.storage);
    await Promise.all([first, second].map(({ conversationRepository }, index) => conversationRepository.appendUserMessage({
      normalizedUrl: url, promptTabId: 'chat', messageId: `message-${index}`, content: `${index}`, images: [], now: 100,
    })));
    expect((await first.conversationRepository.getConversation(url, 'chat'))?.messages.map((message) => message.id))
      .toEqual(['message-0', 'message-1']);
  });

  it('preserves configuration edits when sync metadata is updated concurrently', async () => {
    const { configRepository } = createRepositories();
    const config = createDefaultConfig();
    config.basic.theme = 'dark';
    await Promise.all([configRepository.saveConfig(config), configRepository.updateSyncMetadata(123)]);
    expect(await configRepository.getConfig()).toMatchObject({ basic: { theme: 'dark' }, sync: { lastSyncAt: 123 } });
  });

  it('preserves concurrent tombstones and completion metadata', async () => {
    const { syncRepository } = createRepositories();
    await Promise.all([
      syncRepository.appendPageTombstone({ normalizedUrl: 'https://a.test/', deletedAt: 100 }),
      syncRepository.appendPageTombstone({ normalizedUrl: 'https://b.test/', deletedAt: 200 }),
      syncRepository.markSyncCompleted({ snapshotVersion: 3, lastSyncAt: 300 }),
    ]);
    expect(await syncRepository.getSyncState()).toMatchObject({
      snapshotVersion: 3, lastSyncAt: 300,
      tombstones: [{ normalizedUrl: 'https://a.test/', deletedAt: 100 }, { normalizedUrl: 'https://b.test/', deletedAt: 200 }],
    });
  });

  it('runs deletions after queued writes and continues after a failed mutation', async () => {
    const { pageRepository } = createRepositories();
    await expect(pageRepository.savePage({ invalid: true })).rejects.toThrow();
    await Promise.all([
      pageRepository.savePage(buildPageRecord({ url, now: 100 })),
      pageRepository.deletePage(url),
    ]);
    expect(await pageRepository.getPage(url)).toBeNull();
  });

  it('reads one storage snapshot per exported snapshot', async () => {
    const { storage, syncRepository } = createRepositories();
    const get = vi.spyOn(storage, 'get');
    await syncRepository.buildSnapshot();
    expect(get).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('does not parse unrelated malformed conversations when opening a page', async () => {
    const { storage, conversationRepository } = createRepositories();
    await storage.set({ [buildConversationStorageKey('https://other.test/', 'chat')]: { malformed: true } });
    await expect(conversationRepository.listPageConversations(url)).resolves.toEqual([]);
  });

  it('uses storage key enumeration to avoid transferring unrelated values when available', async () => {
    const storage = createFakeStorageArea();
    await storage.set({
      [buildPageStorageKey(url)]: buildPageRecord({ url, now: 100 }),
      [buildConversationStorageKey(url, 'chat')]: { large: 'unrelated message data' },
    });
    const get = vi.spyOn(storage, 'get');
    const getKeys = vi.fn(async () => Object.keys(storage.dump()));
    const pageRepository = createPageRepository(createChromeLocalAdapter({ ...storage, getKeys }));
    expect(await pageRepository.getAllPages()).toHaveLength(1);
    expect(getKeys).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledExactlyOnceWith([buildPageStorageKey(url)]);
  });
});
