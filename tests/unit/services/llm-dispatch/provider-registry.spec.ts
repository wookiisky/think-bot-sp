import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ModelConfig } from '../../../../src/domain/config/config-schema';

type CreateProviderRegistry = typeof import('../../../../src/services/llm-dispatch/provider-registry')['createProviderRegistry'];
declare const createProviderRegistryForTypeCheck: CreateProviderRegistry;

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

/** 构造 openai-compatible fake，贴近 chatModel 接口形状。 */
const createOpenAICompatibleFactory = () => {
  const chatModel = vi.fn((modelId: string) => ({
    factoryName: 'openai-compatible',
    modelId,
  }));
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
  const provider = vi.fn((modelId: string) => ({
    factoryName,
    modelId,
  }));
  const providerFactory = vi.fn(() => provider);

  return {
    providerFactory,
    provider,
  };
};

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('@ai-sdk/openai-compatible');
  vi.doUnmock('@ai-sdk/google');
  vi.doUnmock('@ai-sdk/anthropic');
});

// eslint-disable-next-line no-constant-condition
if (false) {
  const wrongOpenAIFactory = vi.fn(() => vi.fn((modelId: string) => ({ modelId })));

  // @ts-expect-error openai-compatible 工厂必须返回带 chatModel 的 provider
  createProviderRegistryForTypeCheck({
    createOpenAICompatible: wrongOpenAIFactory,
    createGoogleGenerativeAI: vi.fn(() => vi.fn((modelId: string) => ({ modelId }))),
    createAnthropic: vi.fn(() => vi.fn((modelId: string) => ({ modelId }))),
  });
}

describe('provider-registry', () => {
  it('默认导出的 resolveProviderModel 绑定官方 provider 工厂', async () => {
    const openAICompatible = createOpenAICompatibleFactory();
    const googleFactory = createCallableFactory('google');
    const anthropicFactory = createCallableFactory('anthropic');

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
    const openAICompatible = createOpenAICompatibleFactory();
    const googleFactory = createCallableFactory('google');
    const anthropicFactory = createCallableFactory('anthropic');
    const registry = createProviderRegistry({
      createOpenAICompatible: openAICompatible.providerFactory,
      createGoogleGenerativeAI: googleFactory.providerFactory,
      createAnthropic: anthropicFactory.providerFactory,
    });

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
    const openAICompatible = createOpenAICompatibleFactory();
    const googleFactory = createCallableFactory('google');
    const anthropicFactory = createCallableFactory('anthropic');
    const registry = createProviderRegistry({
      createOpenAICompatible: openAICompatible.providerFactory,
      createGoogleGenerativeAI: googleFactory.providerFactory,
      createAnthropic: anthropicFactory.providerFactory,
    });

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
    const openAICompatible = createOpenAICompatibleFactory();
    const googleFactory = createCallableFactory('google');
    const anthropicFactory = createCallableFactory('anthropic');
    const registry = createProviderRegistry({
      createOpenAICompatible: openAICompatible.providerFactory,
      createGoogleGenerativeAI: googleFactory.providerFactory,
      createAnthropic: anthropicFactory.providerFactory,
    });

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
