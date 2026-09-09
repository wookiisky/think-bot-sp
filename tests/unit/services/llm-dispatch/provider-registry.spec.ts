import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { generateText, tool, type LanguageModel, type ToolSet } from 'ai';
import type { ModelConfig } from '../../../../src/domain/config/config-schema';

/** 构造测试模型，避免每个用例重复铺开完整配置。 */
const createModelConfig = (overrides: Partial<ModelConfig>): ModelConfig => ({
  id: 'model-1',
  name: 'Model 1',
  provider: 'openai-compatible',
  enabled: true,
  model: 'gpt-4.1-mini',
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'test-key',
  deployment: '',
  temperature: 1,
  tools: [],
  thinkingBudget: null,
  maxOutputTokens: null,
  supportsImages: false,
  order: 0,
  deletedAt: null,
  ...overrides,
});

/** 构造满足 AI SDK LanguageModel 契约的最小 fake。 */
const createFakeLanguageModel = (factoryName: string, modelId: string): LanguageModel => ({
  specificationVersion: 'v2',
  provider: factoryName,
  modelId,
  supportedUrls: {},
  doGenerate: async () => ({
    content: [],
    finishReason: 'stop',
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    },
    warnings: [],
  }),
  doStream: async () => ({
    stream: new ReadableStream(),
  }),
});

/** 构造满足 provider tool 契约的最小 fake。 */
const createFakeTool = (name: string): NonNullable<ToolSet[string]> =>
  tool({
    description: name,
    inputSchema: z.object({}),
  });

/** 构造 openai-compatible fake，贴近 chatModel 接口形状。 */
const createOpenAICompatibleFactory = () => {
  const chatModel = vi.fn((modelId: string) => createFakeLanguageModel('openai-compatible', modelId));
  const providerFactory = vi.fn(() => ({
    chatModel,
  }));

  return {
    providerFactory,
    chatModel,
  };
};

/** 构造 callable provider fake，贴近 google / anthropic 主接口。 */
const createCallableFactory = (factoryName: string) => {
  const provider = vi.fn((modelId: string) => createFakeLanguageModel(factoryName, modelId));
  const callableProvider = Object.assign(provider, {
    tools: {
      googleSearch: vi.fn(() => createFakeTool('google_search')),
      urlContext: vi.fn(() => createFakeTool('url_context')),
    },
  });
  const providerFactory = vi.fn(() => callableProvider);

  return {
    providerFactory,
    provider: callableProvider,
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.doUnmock('@ai-sdk/openai-compatible');
  vi.doUnmock('@ai-sdk/google');
  vi.doUnmock('@ai-sdk/anthropic');
});

/** 构造完整 registry 依赖。 */
const createRegistryDeps = () => {
  const openAICompatible = createOpenAICompatibleFactory();
  const googleFactory = createCallableFactory('google');
  const anthropicFactory = createCallableFactory('anthropic');
  const bedrockFactory = createCallableFactory('bedrock');

  return {
    openAICompatible,
    googleFactory,
    anthropicFactory,
    bedrockFactory,
    deps: {
      createOpenAICompatible: openAICompatible.providerFactory,
      createGoogleGenerativeAI: googleFactory.providerFactory,
      createAnthropic: anthropicFactory.providerFactory,
      createAmazonBedrock: bedrockFactory.providerFactory,
    },
  };
};

describe('provider-registry', () => {
  it('默认导出的 resolveProviderModel 绑定官方 provider 工厂', async () => {
    const { openAICompatible, googleFactory, anthropicFactory } = createRegistryDeps();

    vi.doMock('@ai-sdk/openai-compatible', () => ({
      createOpenAICompatible: openAICompatible.providerFactory,
    }));
    vi.doMock('@ai-sdk/google', () => ({
      createGoogleGenerativeAI: googleFactory.providerFactory,
    }));
    vi.doMock('@ai-sdk/anthropic', () => ({
      createAnthropic: anthropicFactory.providerFactory,
    }));

    const { resolveProviderModel } = await import(
      '../../../../src/services/llm-dispatch/provider-registry'
    );

    const openaiResolved = resolveProviderModel(
      createModelConfig({
        provider: 'openai-compatible',
        model: 'gpt-4.1-mini',
        supportsImages: true,
      }),
    );
    const geminiResolved = resolveProviderModel(
      createModelConfig({
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        baseUrl: '',
      }),
    );
    const anthropicResolved = resolveProviderModel(
      createModelConfig({
        provider: 'anthropic',
        model: 'claude-3-7-sonnet-latest',
        baseUrl: '',
      }),
    );

    expect(openAICompatible.providerFactory).toHaveBeenCalledWith({
      name: 'openai-compatible',
      baseURL: 'https://api.example.com/v1',
      apiKey: 'test-key',
    });
    expect(openAICompatible.chatModel).toHaveBeenCalledWith('gpt-4.1-mini');
    expect(googleFactory.providerFactory).toHaveBeenCalledWith({
      apiKey: 'test-key',
    });
    expect(googleFactory.provider).toHaveBeenCalledWith('gemini-2.5-flash');
    expect(anthropicFactory.providerFactory).toHaveBeenCalledWith({
      apiKey: 'test-key',
    });
    expect(anthropicFactory.provider).toHaveBeenCalledWith('claude-3-7-sonnet-latest');
    expect(openaiResolved.providerId).toBe('openai-compatible');
    expect(geminiResolved.providerId).toBe('gemini');
    expect(anthropicResolved.providerId).toBe('anthropic');
  });

  it('openai-compatible 与 azure-openai 共用 openai-compatible factory', async () => {
    const { createProviderRegistry } = await import(
      '../../../../src/services/llm-dispatch/provider-registry'
    );
    const { openAICompatible, googleFactory, anthropicFactory, deps } = createRegistryDeps();
    const registry = createProviderRegistry(deps);

    const openaiResolved = registry.resolveProviderModel(
      createModelConfig({
        provider: 'openai-compatible',
        model: 'gpt-4.1-mini',
        supportsImages: true,
      }),
    );
    const azureResolved = registry.resolveProviderModel(
      createModelConfig({
        provider: 'azure-openai',
        name: 'Azure Model',
        model: '',
        baseUrl: 'https://resource.openai.azure.com/openai/deployments/my-deployment',
        deployment: 'my-deployment',
      }),
    );

    expect(openAICompatible.providerFactory).toHaveBeenCalledTimes(2);
    expect(openAICompatible.chatModel).toHaveBeenNthCalledWith(1, 'gpt-4.1-mini');
    expect(openAICompatible.chatModel).toHaveBeenNthCalledWith(2, 'my-deployment');
    expect(openaiResolved.providerId).toBe('openai-compatible');
    expect(openaiResolved.modelId).toBe('gpt-4.1-mini');
    expect(openaiResolved.supportsImages).toBe(true);
    expect(azureResolved.providerId).toBe('azure-openai');
    expect(azureResolved.modelId).toBe('my-deployment');
    expect(googleFactory.providerFactory).not.toHaveBeenCalled();
    expect(anthropicFactory.providerFactory).not.toHaveBeenCalled();
  });

  it('gemini 使用 callable google provider', async () => {
    const { createProviderRegistry } = await import(
      '../../../../src/services/llm-dispatch/provider-registry'
    );
    const { openAICompatible, googleFactory, anthropicFactory, deps } = createRegistryDeps();
    const registry = createProviderRegistry(deps);

    const resolved = registry.resolveProviderModel(
      createModelConfig({
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        baseUrl: '',
      }),
    );

    expect(googleFactory.providerFactory).toHaveBeenCalledWith({
      apiKey: 'test-key',
    });
    expect(googleFactory.provider).toHaveBeenCalledWith('gemini-2.5-flash');
    expect(resolved.providerId).toBe('gemini');
    expect(resolved.modelId).toBe('gemini-2.5-flash');
    expect(resolved.supportsImages).toBe(false);
    expect(openAICompatible.providerFactory).not.toHaveBeenCalled();
    expect(anthropicFactory.providerFactory).not.toHaveBeenCalled();
  });

  it('anthropic 使用 callable anthropic provider', async () => {
    const { createProviderRegistry } = await import(
      '../../../../src/services/llm-dispatch/provider-registry'
    );
    const { openAICompatible, googleFactory, anthropicFactory, deps } = createRegistryDeps();
    const registry = createProviderRegistry(deps);

    const resolved = registry.resolveProviderModel(
      createModelConfig({
        provider: 'anthropic',
        model: 'claude-3-7-sonnet-latest',
        baseUrl: '',
      }),
    );

    expect(anthropicFactory.providerFactory).toHaveBeenCalledWith({
      apiKey: 'test-key',
    });
    expect(anthropicFactory.provider).toHaveBeenCalledWith('claude-3-7-sonnet-latest');
    expect(resolved.providerId).toBe('anthropic');
    expect(resolved.modelId).toBe('claude-3-7-sonnet-latest');
    expect(resolved.supportsImages).toBe(false);
    expect(openAICompatible.providerFactory).not.toHaveBeenCalled();
    expect(googleFactory.providerFactory).not.toHaveBeenCalled();
  });
});


describe('official provider contracts (offline)', () => {
  it.each<ModelConfig['provider']>([
    'openai-compatible', 'azure-openai', 'gemini', 'anthropic', 'amazon-bedrock', 'google-vertex',
  ])('%s returns the model protocol accepted by AI SDK 5', async (provider) => {
    const fetchStub = vi.fn(() => { throw new Error('Unexpected network request'); });
    vi.stubGlobal('fetch', fetchStub);
    const { resolveProviderModel } = await import('../../../../src/services/llm-dispatch/provider-registry');
    const resolved = resolveProviderModel(createModelConfig({ provider, deployment: 'deployment' }));
    expect(typeof resolved.sdkModel).toBe('object');
    if (typeof resolved.sdkModel === 'string') throw new Error('Expected a provider model');
    expect(resolved.sdkModel.specificationVersion).toBe('v2');
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it.each(['', 'https://proxy.example.com/vertex/'])('Vertex Express preserves API-key auth, tools and reasoning with baseUrl=%s', async (baseUrl) => {
    const fetchStub = vi.fn(async (_url: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => Response.json({
      candidates: [{ content: { role: 'model', parts: [{ text: 'offline answer' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2, totalTokenCount: 3 },
    }));
    vi.stubGlobal('fetch', fetchStub);
    const { resolveProviderModel } = await import('../../../../src/services/llm-dispatch/provider-registry');
    const resolved = resolveProviderModel(createModelConfig({
      provider: 'google-vertex', model: 'gemini-3-flash-preview', baseUrl,
      project: 'ignored-in-express-mode', location: 'us-central1',
      reasoningEffort: 'max', tools: ['url_context', 'google_search'],
    }));
    if (!resolved.tools || !resolved.providerOptions) throw new Error('Expected Google tools and reasoning');
    const result = await generateText({
      model: resolved.sdkModel, prompt: 'hello', maxRetries: 0,
      tools: resolved.tools, providerOptions: resolved.providerOptions,
    });
    expect(result.text).toBe('offline answer');
    expect(resolved.providerId).toBe('google-vertex');
    expect(fetchStub).toHaveBeenCalledOnce();
    const request = fetchStub.mock.calls[0];
    if (!request?.[1]) throw new Error('Expected a fetch request');
    expect(request[0]).toBe(`${baseUrl ? baseUrl.replace(/\/$/, '') : 'https://aiplatform.googleapis.com/v1/publishers/google'}/models/gemini-3-flash-preview:generateContent`);
    expect(new Headers(request[1].headers).get('x-goog-api-key')).toBe('test-key');
    const body = JSON.parse(String(request[1].body));
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'high' });
    expect(body.tools).toEqual(expect.arrayContaining([{ urlContext: {} }, { googleSearch: {} }]));
  });

  it('Bedrock bearer token and Nova reasoning survive a real SDK generation', async () => {
    const fetchStub = vi.fn(async (_url: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => Response.json({
      output: { message: { role: 'assistant', content: [{ text: 'offline answer' }] } },
      stopReason: 'end_turn', usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      metrics: { latencyMs: 1 },
    }));
    vi.stubGlobal('fetch', fetchStub);
    const { resolveProviderModel } = await import('../../../../src/services/llm-dispatch/provider-registry');
    const resolved = resolveProviderModel(createModelConfig({
      provider: 'amazon-bedrock', model: 'us.amazon.nova-2-lite-v1:0',
      region: 'us-east-1', baseUrl: '', reasoningEffort: 'medium',
    }));
    if (!resolved.providerOptions) throw new Error('Expected Bedrock reasoning');
    const result = await generateText({
      model: resolved.sdkModel, prompt: 'hello', maxRetries: 0,
      providerOptions: resolved.providerOptions,
    });
    expect(result.text).toBe('offline answer');
    expect(fetchStub).toHaveBeenCalledOnce();
    const request = fetchStub.mock.calls[0];
    if (!request?.[1]) throw new Error('Expected a fetch request');
    expect(request[0]).toContain('bedrock-runtime.us-east-1.amazonaws.com');
    expect(new Headers(request[1].headers).get('authorization')).toBe('Bearer test-key');
    const body = JSON.parse(String(request[1].body));
    expect(body.additionalModelRequestFields.reasoningConfig).toEqual({ type: 'enabled', maxReasoningEffort: 'medium' });
  });
});
