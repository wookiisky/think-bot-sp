import { describe, expect, it, vi } from 'vitest';

import { createDefaultConfig } from '../../../src/domain/config/config-schema';
import { createLoadingState } from '../../../src/domain/loading/loading-state-schema';
import { buildPageRecord } from '../../../src/domain/page/page-schema';
import type { SyncSnapshot } from '../../../src/domain/sync/sync-snapshot-schema';
import { createChromeLocalAdapter } from '../../../src/repositories/chrome-local-adapter';
import { createConfigRepository } from '../../../src/repositories/config-repository';
import { createConversationRepository } from '../../../src/repositories/conversation-repository';
import { createPageRepository } from '../../../src/repositories/page-repository';
import { createSyncRepository } from '../../../src/repositories/sync-repository';
import { createSyncService } from '../../../src/services/sync/sync-service';
import { createFakeStorageArea } from '../../helpers/fake-storage';

const url = 'https://example.com/page';
const defer = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};
const setup = async () => {
  const storage = createFakeStorageArea();
  const adapter = createChromeLocalAdapter(storage);
  const configRepository = createConfigRepository(adapter);
  const pageRepository = createPageRepository(adapter);
  const conversationRepository = createConversationRepository(adapter);
  const syncRepository = createSyncRepository({ storage: adapter });
  const config = createDefaultConfig();
  Object.assign(config.sync, { enabled: true, provider: 'webdav', webdavUrl: 'https://webdav.test/snapshot' });
  await configRepository.saveConfig(config);
  await pageRepository.savePage(buildPageRecord({ url, now: 100 }));
  const requested = defer<void>();
  const remote = defer<SyncSnapshot | null>();
  let uploaded: SyncSnapshot | undefined;
  const fetchImpl = vi.fn(async (_input: unknown, init?: { method?: string; body?: unknown }) => {
    if (init?.method === 'GET') {
      requested.resolve();
      const snapshot = await remote.promise;
      return { status: snapshot ? 200 : 404, ok: !!snapshot, text: async () => JSON.stringify(snapshot) } as Response;
    }
    uploaded = JSON.parse(String(init?.body)) as SyncSnapshot;
    return { status: 200, ok: true } as Response;
  });
  const service = createSyncService({ syncRepository, fetchImpl: fetchImpl as typeof fetch });
  return { storage, adapter, config, configRepository, pageRepository, conversationRepository, syncRepository, service, requested, remote, fetchImpl, uploaded: () => uploaded };
};

describe('sync and local mutations', () => {
  it('keeps a page created while the first remote request is pending', async () => {
    const context = await setup();
    const syncing = context.service.syncNow(context.config);
    await context.requested.promise;
    const createdUrl = 'https://example.com/new';
    await context.pageRepository.savePage(buildPageRecord({ url: createdUrl, now: 200 }));
    context.remote.resolve(null);
    await syncing;
    expect(await context.pageRepository.getPage(createdUrl)).not.toBeNull();
    expect(context.uploaded()?.pages.map((page) => page.normalizedUrl)).toContain(createdUrl);
  });

  it('preserves edits made during GET even if the remote clock is ahead', async () => {
    const context = await setup();
    const remote = await context.syncRepository.buildSnapshot();
    remote.pages[0] = { ...remote.pages[0]!, title: 'Remote', updatedAt: Date.now() + 100_000, expiresAt: Date.now() + 200_000 };
    remote.config.updatedAt = Date.now() + 100_000;
    remote.config.basic.theme = 'light';
    const syncing = context.service.syncNow(context.config);
    await context.requested.promise;
    await context.pageRepository.updatePageTitle({ normalizedUrl: url, title: 'Local edit' });
    const edited = await context.configRepository.getConfig();
    edited.basic.theme = 'dark';
    await context.configRepository.saveConfig(edited);
    context.remote.resolve(remote);
    await syncing;
    expect(await context.pageRepository.getPage(url)).toMatchObject({ title: 'Local edit' });
    expect(await context.configRepository.getConfig()).toMatchObject({ basic: { theme: 'dark' } });
  });

  it.each(['deletePage', 'clearCache'] as const)('does not resurrect local data after %s during GET', async (operation) => {
    const context = await setup();
    await context.conversationRepository.appendUserMessage({ normalizedUrl: url, promptTabId: 'chat', messageId: 'user', content: 'hello', images: [], now: 100 });
    const remote = await context.syncRepository.buildSnapshot();
    const syncing = context.service.syncNow(context.config);
    await context.requested.promise;
    if (operation === 'deletePage') {
      await context.syncRepository.appendPageTombstone({ normalizedUrl: url, deletedAt: 200 });
      await context.pageRepository.deletePage(url);
    } else await context.pageRepository.clearCache();
    context.remote.resolve(remote);
    await syncing;
    expect(await context.pageRepository.getPage(url)).toBeNull();
    expect(await context.conversationRepository.getConversation(url, 'chat')).toBeNull();
    expect(context.uploaded()?.pages).toEqual([]);
  });

  it('does not resurrect a cleared prompt tab while retaining its page', async () => {
    const context = await setup();
    await context.conversationRepository.appendUserMessage({ normalizedUrl: url, promptTabId: 'chat', messageId: 'user', content: 'hello', images: [], now: 100 });
    const remote = await context.syncRepository.buildSnapshot();
    const syncing = context.service.syncNow(context.config);
    await context.requested.promise;
    await context.conversationRepository.clearPromptTabData(url, 'chat');
    context.remote.resolve(remote);
    await syncing;
    expect(await context.pageRepository.getPage(url)).not.toBeNull();
    expect(await context.conversationRepository.getConversation(url, 'chat')).toBeNull();
  });

  it.each([false, true])('keeps completed tab clears across sync (restart: %s)', async (restart) => {
    const context = await setup();
    await context.conversationRepository.appendUserMessage({ normalizedUrl: url, promptTabId: 'chat', messageId: 'old', content: 'old', images: [], now: 100 });
    await context.conversationRepository.appendUserMessage({ normalizedUrl: url, promptTabId: 'other', messageId: 'other', content: 'keep', images: [], now: 100 });
    const remote = await context.syncRepository.buildSnapshot();
    await context.conversationRepository.clearPromptTabData(url, 'chat');
    await context.pageRepository.setPromptTabState({ normalizedUrl: url, url, promptTabId: 'chat', lastClearedAt: 200 });
    // A later edit to another tab must not erase the earlier clear marker.
    remote.pages[0] = { ...remote.pages[0]!, updatedAt: Date.now() + 1000, expiresAt: Date.now() + 2000 };
    if (restart) {
      const saved = context.storage.dump();
      const restartedStorage = createFakeStorageArea();
      await restartedStorage.set(saved);
      const adapter = createChromeLocalAdapter(restartedStorage);
      context.syncRepository = createSyncRepository({ storage: adapter });
      context.service = createSyncService({ syncRepository: context.syncRepository, fetchImpl: context.fetchImpl as typeof fetch });
    }
    context.remote.resolve(remote);
    await context.service.syncNow(context.config);
    expect(context.uploaded()?.conversations.map((conversation) => conversation.promptTabId)).toEqual(['other']);
    expect(context.uploaded()?.pages[0]?.promptTabStates).toContainEqual(expect.objectContaining({ promptTabId: 'chat', lastClearedAt: 200 }));
    expect((await context.syncRepository.buildSnapshot()).conversations.map((conversation) => conversation.promptTabId)).toEqual(['other']);
  });

  it('keeps new chat after clear even if an old remote chat was updated later', async () => {
    const context = await setup();
    await context.conversationRepository.appendUserMessage({ normalizedUrl: url, promptTabId: 'chat', messageId: 'old', content: 'old', images: [], now: 100 });
    const remote = await context.syncRepository.buildSnapshot();
    remote.conversations[0]!.updatedAt = 500;
    await context.conversationRepository.clearPromptTabData(url, 'chat');
    await context.pageRepository.setPromptTabState({ normalizedUrl: url, url, promptTabId: 'chat', lastClearedAt: 200 });
    await context.conversationRepository.appendUserMessage({ normalizedUrl: url, promptTabId: 'chat', messageId: 'new', content: 'new', images: [], now: 300 });
    context.remote.resolve(remote);
    await context.service.syncNow(context.config);
    expect((await context.conversationRepository.getConversation(url, 'chat'))?.messages.map((message) => message.id)).toEqual(['new']);
    expect(context.uploaded()?.conversations[0]?.messages.map((message) => message.id)).toEqual(['new']);
  });

  it.each([false, true])('applies remote tab clears while preserving active local requests (active: %s)', async (active) => {
    const context = await setup();
    const target = { normalizedUrl: url, promptTabId: 'chat', messageId: 'assistant' };
    await context.conversationRepository.appendAssistantMessage({
      ...target, now: 100, selectedBranchId: 'branch',
      initialBranches: [{ id: 'branch', modelId: 'model', modelLabel: 'Model', isPrimary: true }],
    });
    await context.pageRepository.setPromptTabState({ normalizedUrl: url, url, promptTabId: 'chat', lastClearedAt: 200 });
    const remote = await context.syncRepository.buildSnapshot();
    await context.pageRepository.setPromptTabState({ normalizedUrl: url, url, promptTabId: 'chat', lastClearedAt: null });
    if (active) {
      await context.conversationRepository.saveLoadingState(createLoadingState({ normalizedUrl: url, promptTabId: 'chat', sessionId: 'old-session', now: 100 }));
    }
    context.remote.resolve(remote);
    await context.service.syncNow(context.config);
    if (active) {
      await context.conversationRepository.appendAssistantChunk({ ...target, chunk: 'continued', now: 300 });
      expect((await context.conversationRepository.getConversation(url, 'chat'))?.messages[0]?.content).toBe('continued');
      expect(await context.conversationRepository.getLoadingState(url, 'chat')).not.toBeNull();
      expect(context.uploaded()?.conversations).toHaveLength(1);
    } else {
      expect(await context.conversationRepository.getConversation(url, 'chat')).toBeNull();
      expect(context.uploaded()?.conversations).toEqual([]);
      expect((await context.pageRepository.getPage(url))?.promptTabStates).toContainEqual(expect.objectContaining({ promptTabId: 'chat', lastClearedAt: 200 }));
    }
  });

  it.each([false, true])('preserves an active assistant and subsequent chunks (remote deletes page: %s)', async (deleted) => {
    const context = await setup();
    await context.conversationRepository.appendAssistantMessage({
      normalizedUrl: url, promptTabId: 'chat', messageId: 'assistant', now: 100, selectedBranchId: 'branch',
      initialBranches: [{ id: 'branch', modelId: 'model', modelLabel: 'Model', isPrimary: true }],
    });
    await context.conversationRepository.saveLoadingState(createLoadingState({ normalizedUrl: url, promptTabId: 'chat', sessionId: 'session', now: 100 }));
    const remote = await context.syncRepository.buildSnapshot();
    remote.conversations[0] = { ...remote.conversations[0]!, messages: [], updatedAt: 1000 };
    if (deleted) remote.tombstones.push({ normalizedUrl: url, deletedAt: 1000 });
    const syncing = context.service.syncNow(context.config);
    await context.requested.promise;
    context.remote.resolve(remote);
    await syncing;
    await context.conversationRepository.appendAssistantChunk({ normalizedUrl: url, promptTabId: 'chat', messageId: 'assistant', chunk: 'continued', now: 200 });
    expect((await context.conversationRepository.getConversation(url, 'chat'))?.messages[0]?.content).toBe('continued');
    expect((await context.syncRepository.buildSnapshot()).pages).toHaveLength(1);
  });

  it.each([false, true])('preserves a branch-only request started before sync (remote deletes page: %s)', async (deleted) => {
    const context = await setup();
    const target = { normalizedUrl: url, promptTabId: 'chat', messageId: 'assistant' };
    await context.conversationRepository.appendAssistantMessage({
      ...target, now: 100, selectedBranchId: 'primary',
      initialBranches: [{ id: 'primary', modelId: 'model', modelLabel: 'Model', isPrimary: true }],
    });
    await context.conversationRepository.finishAssistantMessage({ ...target, now: 110, durationMs: 10 });
    await context.conversationRepository.appendAssistantBranch({
      ...target, branchId: 'comparison', modelId: 'model', modelLabel: 'Model', now: 120,
    });
    const loading = await context.conversationRepository.upsertBranchLoadingState({
      ...target, sessionId: 'branch-session', branchId: 'comparison', modelId: 'model', status: 'loading', now: 120,
    });
    expect(loading.promptTabStatus).toBe('idle');
    expect(loading.branchStates[0]?.status).toBe('loading');
    const conversation = await context.conversationRepository.getConversation(url, 'chat');
    const page = await context.pageRepository.getPage(url);
    const remote = await context.syncRepository.buildSnapshot();
    remote.conversations[0] = { ...remote.conversations[0]!, messages: [], updatedAt: 1000 };
    if (deleted) remote.tombstones.push({ normalizedUrl: url, deletedAt: 1000 });

    // No local mutation follows the revision capture: protection must detect branch activity.
    const syncing = context.service.syncNow(context.config);
    await context.requested.promise;
    context.remote.resolve(remote);
    await syncing;

    expect(await context.pageRepository.getPage(url)).toEqual(page);
    expect(await context.conversationRepository.getConversation(url, 'chat')).toEqual(conversation);
    expect(await context.conversationRepository.getLoadingState(url, 'chat')).toEqual(loading);
    await context.conversationRepository.appendAssistantBranchChunk({ ...target, branchId: 'comparison', chunk: 'continued', now: 200 });
    await context.conversationRepository.finishAssistantBranch({ ...target, branchId: 'comparison', now: 210, durationMs: 90 });
    const completed = await context.conversationRepository.getConversation(url, 'chat');
    expect(completed?.messages[0]?.branches.find((branch) => branch.id === 'comparison'))
      .toMatchObject({ content: 'continued', status: 'done' });
    expect((await context.syncRepository.buildSnapshot()).pages).toHaveLength(1);
  });

  it.each(['main', 'branch'] as const)('keeps %s loading while its assistant message has not been persisted yet', async (kind) => {
    const context = await setup();
    if (kind === 'main') {
      await context.conversationRepository.saveLoadingState(createLoadingState({ normalizedUrl: url, promptTabId: 'chat', sessionId: 'session', now: 100 }));
    } else {
      await context.conversationRepository.upsertBranchLoadingState({
        normalizedUrl: url, promptTabId: 'chat', messageId: 'assistant', sessionId: 'session',
        branchId: 'comparison', modelId: 'model', status: 'loading', now: 100,
      });
    }
    const syncing = context.service.syncNow(context.config);
    await context.requested.promise;
    context.remote.resolve(null);
    await syncing;
    expect(await context.conversationRepository.getLoadingState(url, 'chat')).toMatchObject({
      sessionId: 'session', promptTabStatus: kind === 'main' ? 'loading' : 'idle',
    });
  });

  it('queues a local write behind snapshot commit without losing the write', async () => {
    const context = await setup();
    const reading = defer<void>();
    const release = defer<void>();
    const originalGet = context.storage.get;
    let held = false;
    vi.spyOn(context.storage, 'get').mockImplementation(async (keys) => {
      const result = await originalGet(keys);
      if (keys === null && !held) {
        held = true;
        reading.resolve();
        await release.promise;
      }
      return result;
    });
    const syncing = context.service.syncNow(context.config);
    await context.requested.promise;
    context.remote.resolve(null);
    await reading.promise;
    const writing = context.pageRepository.updatePageTitle({ normalizedUrl: url, title: 'After commit' });
    release.resolve();
    await Promise.all([syncing, writing]);
    expect(await context.pageRepository.getPage(url)).toMatchObject({ title: 'After commit' });
  });

  it('uses a single full read for merge and upload', async () => {
    const context = await setup();
    const get = vi.spyOn(context.storage, 'get');
    context.remote.resolve(null);
    await context.service.syncNow(context.config);
    expect(get.mock.calls.filter(([keys]) => keys === null)).toHaveLength(1);
  });

  it('serializes simultaneous sync requests without blocking local writes during GET', async () => {
    const context = await setup();
    const first = context.service.syncNow(context.config);
    const second = context.service.syncNow(context.config);
    await context.requested.promise;
    expect(context.fetchImpl.mock.calls.filter(([, init]) => init?.method === 'GET')).toHaveLength(1);
    await context.pageRepository.updatePageTitle({ normalizedUrl: url, title: 'Still editable' });
    context.remote.resolve(null);
    await Promise.all([first, second]);
    expect(context.fetchImpl.mock.calls.map(([, init]) => init?.method)).toEqual(['GET', 'PUT', 'GET', 'PUT']);
    expect(await context.pageRepository.getPage(url)).toMatchObject({ title: 'Still editable' });
  });
});
