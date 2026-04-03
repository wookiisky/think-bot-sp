import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

import type { ModelConfig } from '../../domain/config/config-schema';

type OpenAICompatibleProvider = {
  /** 兼容 OpenAI provider 的 chatModel 创建入口。 */
  chatModel: (modelId: string) => unknown;
};

type CallableProvider = (modelId: string) => unknown;

type OpenAICompatibleFactory = (settings: {
  /** Provider 名称。 */
  name: ModelConfig['provider'];
  /** 兼容 OpenAI 的基础地址。 */
  baseURL: string;
  /** Provider API Key。 */
  apiKey: string;
}) => OpenAICompatibleProvider;

type GoogleFactory = (settings: {
  /** Google provider API Key。 */
  apiKey: string;
}) => CallableProvider;

type AnthropicFactory = (settings: {
  /** Anthropic provider API Key。 */
  apiKey: string;
}) => CallableProvider;

type ProviderRegistryDeps = {
  /** OpenAI Compatible provider 工厂。 */
  createOpenAICompatible: OpenAICompatibleFactory;
  /** Google provider 工厂。 */
  createGoogleGenerativeAI: GoogleFactory;
  /** Anthropic provider 工厂。 */
  createAnthropic: AnthropicFactory;
};

/** Provider 解析后的统一句柄。 */
export type ResolvedProviderModel = {
  /** Provider 类型稳定标识。 */
  providerId: string;
  /** 当前实际提交给 SDK 的模型标识。 */
  modelId: string;
  /** UI 与日志使用的人类可读名称。 */
  modelLabel: string;
  /** 是否支持图片输入，由配置显式透传。 */
  supportsImages: boolean;
  /** 交给 AI SDK 的模型对象。 */
  sdkModel: unknown;
};

/** 穷举保护，避免新增 provider 后静默落入错误分支。 */
const assertNever = (value: never): never => {
  throw new Error(`unsupported provider: ${String(value)}`);
};

/** 创建可注入依赖的 provider registry。 */
export const createProviderRegistry = (deps: ProviderRegistryDeps) => ({
  /** 按 provider 类型解析模型配置，返回统一 provider 句柄。 */
  resolveProviderModel(model: ModelConfig): ResolvedProviderModel {
    const resolvedModelId = model.provider === 'azure-openai' ? model.deployment : model.model;

    switch (model.provider) {
      case 'openai-compatible':
      case 'azure-openai': {
        const provider = deps.createOpenAICompatible({
          name: model.provider,
          baseURL: model.baseUrl,
          apiKey: model.apiKey,
        });

        return {
          providerId: model.provider,
          modelId: resolvedModelId,
          modelLabel: model.name,
          supportsImages: model.supportsImages,
          sdkModel: provider.chatModel(resolvedModelId),
        };
      }
      case 'gemini': {
        const provider = deps.createGoogleGenerativeAI({
          apiKey: model.apiKey,
        });

        return {
          providerId: model.provider,
          modelId: resolvedModelId,
          modelLabel: model.name,
          supportsImages: model.supportsImages,
          sdkModel: provider(resolvedModelId),
        };
      }
      case 'anthropic': {
        const provider = deps.createAnthropic({
          apiKey: model.apiKey,
        });

        return {
          providerId: model.provider,
          modelId: resolvedModelId,
          modelLabel: model.name,
          supportsImages: model.supportsImages,
          sdkModel: provider(resolvedModelId),
        };
      }
      default:
        return assertNever(model.provider);
    }
  },
});

const defaultRegistry = createProviderRegistry({
  createOpenAICompatible,
  createGoogleGenerativeAI,
  createAnthropic,
});

/** 默认 registry，直接绑定官方 provider 工厂。 */
export const resolveProviderModel = (model: ModelConfig): ResolvedProviderModel =>
  defaultRegistry.resolveProviderModel(model);
