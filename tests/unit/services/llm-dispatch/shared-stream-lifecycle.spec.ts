import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createDefaultConfig, modelConfigSchema } from '../../../../src/domain/config/config-schema';
import { createChromeLocalAdapter } from '../../../../src/repositories/chrome-local-adapter';
import { createConversationRepository } from '../../../../src/repositories/conversation-repository';
import { createChatDispatchService, type ChatStreamEvent } from '../../../../src/services/llm-dispatch/chat-dispatch-service';
import { createSidebarSessionRegistry } from '../../../../src/services/runtime-messaging/sidebar-session-registry';
import { createFakeStorageArea } from '../../../helpers/fake-storage';

const scope = { normalizedUrl: 'https://example.com/article', promptTabId: 'summary' };
const request = { ...scope, modelId: 'main', content: 'question', images: [], pageContent: '' };

const createFixture = ({ parallel = false, supportsImages = {} }: { parallel?: boolean; supportsImages?: Record<string, boolean> } = {}) => {
  const models = ['main', 'other'].map((id) => modelConfigSchema.parse({
    id, name: id, provider: 'openai-compatible', enabled: true, model: id,
    baseUrl: 'https://example.invalid/v1', apiKey: 'dummy', deployment: '',
    tools: [], thinkingBudget: null,
    supportsImages: supportsImages[id] ?? false, order: 0, deletedAt: null,
  }));
  const config = createDefaultConfig({ models, basic: { parallelModelIds: parallel ? ['other'] : [] } });
  const repository = createConversationRepository(createChromeLocalAdapter(createFakeStorageArea()));
  const events: ChatStreamEvent[] = [];
  const streamText = vi.fn<Parameters<typeof createChatDispatchService>[0]['streamText']>(async () => ({
    textStream: (async function* () { yield 'answer'; })(),
  }));
  const providerRegistry: Parameters<typeof createChatDispatchService>[0]['providerRegistry'] = {
    resolveProviderModel: (model) => ({
      providerId: model.provider, modelId: model.model, modelLabel: model.name,
      supportsImages: model.supportsImages, maxOutputTokens: null,
      sdkModel: createOpenAICompatible({ name: 'test', apiKey: 'dummy', baseURL: model.baseUrl }).chatModel(model.id),
    }),
  };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const service = createChatDispatchService({
    configRepository: {
      getConfig: async () => config,
      getModelById: async (id) => models.find((model) => model.id === id) ?? null,
    },
    conversationRepository: repository,
    providerRegistry,
    portBus: { publishToPromptTab: (event) => { events.push(event); } },
    streamText,
    logger,
  });
  return { repository, service, streamText, events, providerRegistry, models, logger };
};

afterEach(() => vi.useRealTimers());

describe('shared stream lifecycle', () => {
  it.each(['send', 'edit', 'retry'] as const)('%s batches writes while preserving persisted and published text', async (operation) => {
    const { repository, service, streamText, events } = createFixture();
    const original = await service.dispatchChat(request);
    await original.done;
    const append = vi.spyOn(repository, 'appendAssistantBranchChunk');
    events.length = 0;
    streamText.mockImplementation(async () => ({
      textStream: (async function* () { for (let i = 0; i < 1000; i += 1) yield '段'; })(),
    }));
    const session = operation === 'send'
      ? await service.dispatchChat(request)
      : operation === 'edit'
        ? await service.editUserMessage({ ...scope, messageId: original.userMessageId!, content: 'edited', pageContent: '' })
        : await service.retryUserMessage({ ...scope, messageId: original.userMessageId!, pageContent: '' });
    await expect(session.done).resolves.toMatchObject({ status: 'done', persisted: true });
    expect(append.mock.calls.length).toBeLessThan(20);
    const conversation = await repository.getConversation(scope.normalizedUrl, scope.promptTabId);
    expect(conversation?.messages.find((message) => message.id === session.messageId)?.content).toBe('段'.repeat(1000));
    expect(events.filter((event) => event.type === 'CHAT_STREAM_CHUNK').map((event) => event.chunk).join('')).toBe('段'.repeat(1000));
    expect(events.at(-1)).toMatchObject({ type: 'LOADING_STATE_UPDATE', status: 'done' });
  });

  it('旧请求完成时保留已接管标签的新请求 loading', async () => {
    const { repository, service, streamText } = createFixture();
    let releaseStream: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { releaseStream = resolve; });
    streamText.mockImplementation(async () => ({ textStream: (async function* () {
      await gate;
      yield 'answer';
    })() }));
    const session = await service.dispatchChat(request);
    const loading = await repository.getLoadingState(scope.normalizedUrl, scope.promptTabId);
    await repository.saveLoadingState({ ...loading, sessionId: 'session-new', startedAt: null });
    releaseStream();

    await expect(session.done).resolves.toMatchObject({ status: 'done' });
    await expect(repository.getLoadingState(scope.normalizedUrl, scope.promptTabId)).resolves.toMatchObject({
      sessionId: 'session-new', startedAt: null,
    });
  });

  it('branch cleanup failures do not skip the main loading cleanup or terminal event', async () => {
    vi.useFakeTimers();
    const { repository, service, events } = createFixture({ parallel: true });
    const cleanup = vi.spyOn(repository, 'removeBranchLoadingState').mockRejectedValue(new Error('cleanup failed'));
    const session = await service.dispatchChat(request);
    await expect(session.done).resolves.toMatchObject({ status: 'done', persisted: true });
    expect(cleanup).toHaveBeenCalledOnce();
    await expect(repository.getLoadingState(scope.normalizedUrl, scope.promptTabId)).resolves.toBeNull();
    expect(events.at(-1)).toMatchObject({ type: 'LOADING_STATE_UPDATE', status: 'done' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a failed terminal write is reported and does not leak timers or the registry entry', async () => {
    vi.useFakeTimers();
    const { repository, service, streamText, events } = createFixture({ parallel: true });
    streamText.mockImplementation(async () => ({ textStream: (async function* () {
      yield 'partial';
      throw new Error('upstream failed');
    })() }));
    let primaryBranchId: string | null = null;
    vi.spyOn(repository, 'failAssistantBranch').mockImplementation(async ({ branchId }) => {
      throw new Error(branchId === primaryBranchId ? 'main storage failed' : 'branch storage failed');
    });
    const session = await service.dispatchChat(request);
    primaryBranchId = session.branchId;
    const registry = createSidebarSessionRegistry();
    registry.register(session, scope);
    await expect(session.done).resolves.toMatchObject({ status: 'error', persisted: false, errorMessage: 'main storage failed' });
    await expect(session.branchSessions[0]?.done).resolves.toMatchObject({ status: 'error', persisted: false, errorMessage: 'branch storage failed' });
    expect(registry.cancelSession({ ...scope, sessionId: session.sessionId })).toBe(false);
    expect(events.at(-1)).toMatchObject({ type: 'LOADING_STATE_UPDATE', status: 'error' });
    await expect(repository.getLoadingState(scope.normalizedUrl, scope.promptTabId)).resolves.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('flushes buffered text before persisting an upstream failure', async () => {
    const { repository, service, streamText, events } = createFixture();
    streamText.mockImplementation(async () => ({ textStream: (async function* () {
      yield 'first'; yield ' buffered'; yield ' tail'; throw new Error('upstream failed');
    })() }));
    const session = await service.dispatchChat(request);
    await expect(session.done).resolves.toMatchObject({ status: 'error' });
    const conversation = await repository.getConversation(scope.normalizedUrl, scope.promptTabId);
    expect(conversation?.messages.find((message) => message.id === session.messageId)).toMatchObject({ content: 'first buffered tail', status: 'error' });
    expect(events.filter((event) => event.type === 'CHAT_STREAM_CHUNK').map((event) => event.chunk)).toEqual(['first', ' buffered tail']);
    expect(events.findIndex((event) => event.type === 'CHAT_STREAM_FAILED')).toBeGreaterThan(events.findIndex((event) => event.type === 'CHAT_STREAM_CHUNK' && event.chunk === ' buffered tail'));
  });

  it('does not publish failed writes as chunks or report a finished stream', async () => {
    const { repository, service, events } = createFixture();
    vi.spyOn(repository, 'appendAssistantBranchChunk').mockRejectedValue(new Error('write failed'));
    const session = await service.dispatchChat(request);
    await expect(session.done).resolves.toMatchObject({ status: 'error', errorMessage: 'write failed' });
    expect(events.some((event) => event.type === 'CHAT_STREAM_CHUNK' || event.type === 'CHAT_STREAM_FINISHED')).toBe(false);
  });

  it('flushes consumed text when cancelled while awaiting another chunk', async () => {
    const { repository, service, streamText } = createFixture();
    let reachedPending!: () => void;
    const pending = new Promise<void>((resolve) => { reachedPending = resolve; });
    streamText.mockImplementation(async () => ({ textStream: (async function* () {
      yield 'first'; yield ' buffered';
      reachedPending();
      await new Promise(() => {});
    })() }));
    const session = await service.dispatchChat(request);
    await pending;
    session.cancel();
    await expect(session.done).resolves.toMatchObject({ status: 'cancelled', persisted: true });
    const conversation = await repository.getConversation(scope.normalizedUrl, scope.promptTabId);
    expect(conversation?.messages.find((message) => message.id === session.messageId)).toMatchObject({ content: 'first buffered', status: 'cancelled' });
  });

  it.each(['send', 'edit', 'retry'] as const)('%s waits for loading persistence before starting any network stream', async (operation) => {
    const { repository, service, streamText } = createFixture({ parallel: true });
    const original = await service.dispatchChat(request);
    await original.done;
    streamText.mockClear();
    let finishSaving!: () => void;
    let savingStarted!: () => void;
    const gate = new Promise<void>((resolve) => { finishSaving = resolve; });
    const started = new Promise<void>((resolve) => { savingStarted = resolve; });
    const save = repository.saveLoadingState;
    vi.spyOn(repository, 'saveLoadingState').mockImplementation(async (loading) => {
      savingStarted();
      await gate;
      return save(loading);
    });
    const pending = operation === 'send'
      ? service.dispatchChat(request)
      : operation === 'edit'
        ? service.editUserMessage({ ...scope, messageId: original.userMessageId!, content: 'edited', pageContent: '' })
        : service.retryUserMessage({ ...scope, messageId: original.userMessageId!, pageContent: '' });
    await started;
    expect(streamText).not.toHaveBeenCalled();
    finishSaving();
    const session = await pending;
    await session.done;
    expect(streamText).toHaveBeenCalledTimes(2);
  });

  it.each(['send', 'edit', 'retry'] as const)('%s compensates all placeholders when loading setup fails', async (operation) => {
    vi.useFakeTimers();
    const { repository, service, streamText } = createFixture({ parallel: true });
    const original = await service.dispatchChat(request);
    await original.done;
    streamText.mockClear();
    vi.spyOn(repository, 'saveLoadingState').mockRejectedValue(new Error('setup failed'));
    const start = operation === 'send'
      ? service.dispatchChat(request)
      : operation === 'edit'
        ? service.editUserMessage({ ...scope, messageId: original.userMessageId!, content: 'edited', pageContent: '' })
        : service.retryUserMessage({ ...scope, messageId: original.userMessageId!, pageContent: '' });
    await expect(start).rejects.toThrow('setup failed');
    expect(streamText).not.toHaveBeenCalled();
    const conversation = await repository.getConversation(scope.normalizedUrl, scope.promptTabId);
    expect(conversation?.messages.at(-1)?.branches.map((branch) => branch.status)).toEqual(['error', 'error']);
    await expect(repository.getLoadingState(scope.normalizedUrl, scope.promptTabId)).resolves.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['send', 'edit', 'retry'] as const)('%s resolves every model before changing messages or starting streams', async (operation) => {
    vi.useFakeTimers();
    const { repository, service, streamText, providerRegistry } = createFixture({ parallel: true });
    const original = await service.dispatchChat(request);
    await original.done;
    const before = await repository.getConversation(scope.normalizedUrl, scope.promptTabId);
    streamText.mockClear();
    const resolve = providerRegistry.resolveProviderModel;
    vi.spyOn(providerRegistry, 'resolveProviderModel').mockImplementation((model, options) => {
      if (model.id === 'other') throw new Error('invalid provider');
      return resolve(model, options);
    });
    const start = operation === 'send'
      ? service.dispatchChat(request)
      : operation === 'edit'
        ? service.editUserMessage({ ...scope, messageId: original.userMessageId!, content: 'edited', pageContent: '' })
        : service.retryUserMessage({ ...scope, messageId: original.userMessageId!, pageContent: '' });
    await expect(start).rejects.toThrow('invalid provider');
    expect(streamText).not.toHaveBeenCalled();
    await expect(repository.getConversation(scope.normalizedUrl, scope.promptTabId)).resolves.toEqual(before);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('primary stream keeps writing to its own branch after the user selects a sibling mid-stream', async () => {
    const { repository, service, streamText } = createFixture({ parallel: true });
    let releasePrimary!: () => void;
    const gate = new Promise<void>((resolve) => { releasePrimary = resolve; });
    let primaryStarted!: () => void;
    const started = new Promise<void>((resolve) => { primaryStarted = resolve; });
    streamText.mockImplementation(async ({ model }) => ({ textStream: (async function* () {
      if ((model as { modelId: string }).modelId === 'main') {
        primaryStarted();
        await gate;
        yield 'main answer';
      } else {
        yield 'other answer';
      }
    })() }));
    const session = await service.dispatchChat(request);
    await started;
    const sibling = session.branchSessions[0]!;
    await sibling.done;
    await repository.selectAssistantBranch({ ...scope, messageId: session.messageId, branchId: sibling.branchId, now: Date.now() });
    releasePrimary();
    await expect(session.done).resolves.toMatchObject({ status: 'done', persisted: true });
    const message = (await repository.getConversation(scope.normalizedUrl, scope.promptTabId))?.messages.find((item) => item.id === session.messageId);
    expect(message?.branches.find((branch) => branch.isPrimary)).toMatchObject({ content: 'main answer', status: 'done' });
    expect(message?.branches.find((branch) => branch.id === sibling.branchId)).toMatchObject({ content: 'other answer', status: 'done' });
    expect(message?.selectedBranchId).toBe(sibling.branchId);
  });

  it('drops parallel branches whose model cannot accept images instead of persisting a doomed branch', async () => {
    const { repository, service, streamText, logger } = createFixture({ parallel: true, supportsImages: { main: true } });
    const session = await service.dispatchChat({ ...request, images: ['data:image/png;base64,AAA'] });
    await expect(session.done).resolves.toMatchObject({ status: 'done', persisted: true });
    expect(streamText).toHaveBeenCalledTimes(1);
    expect(session.branches).toHaveLength(1);
    const message = (await repository.getConversation(scope.normalizedUrl, scope.promptTabId))?.messages.find((item) => item.id === session.messageId);
    expect(message?.branches.map((branch) => branch.modelId)).toEqual(['main']);
    expect(logger.warn).toHaveBeenCalledWith('branch.skipped.no_images', expect.objectContaining({ modelId: 'other' }));
  });

  it.each(['edit', 'retry'] as const)('%s rejects replaying persisted images before persistence when the model no longer accepts images', async (operation) => {
    const { repository, service, streamText, models } = createFixture({ supportsImages: { main: true } });
    const original = await service.dispatchChat({ ...request, images: ['data:image/png;base64,AAA'] });
    await original.done;
    const before = await repository.getConversation(scope.normalizedUrl, scope.promptTabId);
    streamText.mockClear();
    models[0]!.supportsImages = false;
    const start = operation === 'edit'
      ? service.editUserMessage({ ...scope, messageId: original.userMessageId!, content: 'edited', pageContent: '' })
      : service.retryUserMessage({ ...scope, messageId: original.userMessageId!, pageContent: '' });
    await expect(start).rejects.toThrow('model does not support images');
    expect(streamText).not.toHaveBeenCalled();
    await expect(repository.getConversation(scope.normalizedUrl, scope.promptTabId)).resolves.toEqual(before);
  });

  it('rolls the turn back instead of persisting an error turn when loading setup fails under rollbackOnFailure', async () => {
    const { repository, service, streamText } = createFixture();
    vi.spyOn(repository, 'saveLoadingState').mockRejectedValue(new Error('setup failed'));
    const failBranch = vi.spyOn(repository, 'failAssistantBranch');
    await expect(service.dispatchChat({ ...request, rollbackOnFailure: true })).rejects.toThrow('setup failed');
    expect(streamText).not.toHaveBeenCalled();
    expect(failBranch).not.toHaveBeenCalled();
    await expect(repository.getConversation(scope.normalizedUrl, scope.promptTabId)).resolves.toBeNull();
    await expect(repository.getLoadingState(scope.normalizedUrl, scope.promptTabId)).resolves.toBeNull();
  });

  it('marks every placeholder as failed when loading setup and turn rollback both fail', async () => {
    const { repository, service, streamText } = createFixture({ parallel: true });
    const setupError = new Error('setup failed');
    vi.spyOn(repository, 'saveLoadingState').mockRejectedValue(setupError);
    vi.spyOn(repository, 'rollbackTurnMessages').mockRejectedValue(new Error('rollback failed'));
    await expect(service.dispatchChat({ ...request, rollbackOnFailure: true })).rejects.toBe(setupError);
    expect(streamText).not.toHaveBeenCalled();
    const conversation = await repository.getConversation(scope.normalizedUrl, scope.promptTabId);
    const assistant = conversation?.messages.find((message) => message.role === 'assistant');
    expect(assistant?.status).toBe('error');
    expect(assistant?.branches.map((branch) => branch.status)).toEqual(['error', 'error']);
    await expect(repository.getLoadingState(scope.normalizedUrl, scope.promptTabId)).resolves.toBeNull();
  });

  it('preserves the setup error and attempts every branch even when rollback compensation fails', async () => {
    const { repository, service } = createFixture({ parallel: true });
    const setupError = new Error('setup failed');
    vi.spyOn(repository, 'saveLoadingState').mockRejectedValue(setupError);
    vi.spyOn(repository, 'rollbackTurnMessages').mockRejectedValue(new Error('rollback failed'));
    const failBranch = vi.spyOn(repository, 'failAssistantBranch').mockRejectedValue(new Error('compensation failed'));
    await expect(service.dispatchChat({ ...request, rollbackOnFailure: true })).rejects.toBe(setupError);
    const conversation = await repository.getConversation(scope.normalizedUrl, scope.promptTabId);
    const assistant = conversation?.messages.find((message) => message.role === 'assistant');
    expect(failBranch.mock.calls.map(([input]) => input.branchId)).toEqual(assistant?.branches.map((branch) => branch.id));
    expect(failBranch).toHaveBeenCalledTimes(2);
  });

  it.each(['edit', 'retry'] as const)('%s reruns with the primary branch model even after a sibling was selected', async (operation) => {
    const { repository, service, streamText } = createFixture({ parallel: true });
    const original = await service.dispatchChat(request);
    await original.done;
    const sibling = original.branchSessions[0]!;
    await repository.selectAssistantBranch({ ...scope, messageId: original.messageId, branchId: sibling.branchId, now: Date.now() });
    streamText.mockClear();
    const session = operation === 'edit'
      ? await service.editUserMessage({ ...scope, messageId: original.userMessageId!, content: 'edited', pageContent: '' })
      : await service.retryUserMessage({ ...scope, messageId: original.userMessageId!, pageContent: '' });
    await session.done;
    expect(session.modelId).toBe('main');
    // 并行分支先于主分支启动，只断言集合而不断言顺序。
    expect(new Set(streamText.mock.calls.map(([call]) => (call.model as { modelId: string }).modelId))).toEqual(new Set(['main', 'other']));
  });

  it('does not tell clients to remove a turn when its rollback failed', async () => {
    const { repository, service, streamText, events } = createFixture();
    streamText.mockImplementation(async () => { throw new Error('upstream failed'); });
    vi.spyOn(repository, 'rollbackTurnMessages').mockRejectedValue(new Error('rollback failed'));
    const session = await service.dispatchChat({ ...request, rollbackOnFailure: true });
    await expect(session.done).resolves.toMatchObject({ status: 'error', persisted: true });
    expect(events.find((event) => event.type === 'CHAT_STREAM_FAILED')).not.toHaveProperty('rollbackOnFailure');
  });
});

describe('session registry rejection cleanup', () => {
  it('consumes rejected done promises and releases their scope', async () => {
    const registry = createSidebarSessionRegistry();
    const done = Promise.reject(new Error('unexpected lifecycle failure'));
    registry.register({ sessionId: 'failed', messageId: 'message', cancel: vi.fn(), done }, scope);
    await Promise.allSettled([done]);
    expect(registry.cancelSession({ ...scope, sessionId: 'failed' })).toBe(false);
  });

  it('does not release a newer record that reused a session id', async () => {
    const registry = createSidebarSessionRegistry();
    let resolveOld!: () => void;
    const oldDone = new Promise<void>((resolve) => { resolveOld = resolve; });
    registry.register({ sessionId: 'same', messageId: 'old', cancel: vi.fn(), done: oldDone }, scope);
    const cancel = vi.fn();
    registry.register({ sessionId: 'same', messageId: 'new', cancel, done: new Promise(() => {}) }, scope);
    resolveOld();
    await oldDone;
    expect(registry.cancelSession({ ...scope, sessionId: 'same' })).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
  });
});
