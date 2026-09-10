import type { LanguageModel, ToolSet } from 'ai';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

import { DEFAULT_OPENROUTER_BASE_URL, type ModelConfig, type ReasoningEffort } from '../../domain/config/config-schema';
import { resolveModelRequestOptions, type ProviderOptions } from './model-request-options';

type OpenAICompatibleProvider = {
  /** 兼容 OpenAI provider 的 chatModel 创建入口。 */
  chatModel: (modelId: string) => LanguageModel;
};

type CallableProvider = (modelId: string) => LanguageModel;

type GoogleToolProvider = CallableProvider & {
  /** Provider 内建 tool 工厂。 */
  tools: {
    /** Google Search grounding。 */
    googleSearch: (_settings: Record<string, never>) => NonNullable<ToolSet[string]>;
    /** URL Context。 */
    urlContext: (_settings: Record<string, never>) => NonNullable<ToolSet[string]>;
  };
};

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
  /** Google provider Base URL。 */
  baseURL?: string;
}) => GoogleToolProvider;

type AnthropicFactory = (settings: {
  /** Anthropic provider API Key。 */
  apiKey: string;
  /** Anthropic provider Base URL。 */
  baseURL?: string;
}) => CallableProvider;

type BedrockFactory = (settings: {
  /** Bedrock Bearer Token。 */
  apiKey?: string;
  /** Bedrock 区域。 */
  region?: string;
  /** Bedrock Base URL。 */
  baseURL?: string;
}) => CallableProvider;

type ProviderRegistryDeps = {
  /** OpenAI Compatible provider 工厂。 */
  createOpenAICompatible: OpenAICompatibleFactory;
  /** Google provider 工厂。 */
  createGoogleGenerativeAI: GoogleFactory;
  /** Anthropic provider 工厂。 */
  createAnthropic: AnthropicFactory;
  /** Bedrock provider 工厂。 */
  createAmazonBedrock: BedrockFactory;
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
  sdkModel: LanguageModel;
  /** 单次输出 token 上限，由代码按 provider / 模型给定；null 表示交给 provider 默认值。 */
  maxOutputTokens: number | null;
  /** provider tools。 */
  tools?: ToolSet;
  /** providerOptions。 */
  providerOptions?: ProviderOptions;
};

/** 穷举保护，避免新增 provider 后静默落入错误分支。 */
const assertNever = (value: never): never => {
  throw new Error(`unsupported provider: ${String(value)}`);
};

/** 清理可选 URL，空字符串不向 SDK 透传。 */
const toOptionalString = (value: string | undefined): string | undefined => {
  const normalized = value?.trim() ?? '';
  return normalized ? normalized : undefined;
};

/** 构造 Gemini / Vertex tools。 */
const buildGoogleTools = (provider: GoogleToolProvider, toolIds: string[]): ToolSet | undefined => {
  const nextTools: ToolSet = {};

  if (toolIds.includes('url_context')) {
    nextTools.url_context = provider.tools.urlContext({});
  }

  if (toolIds.includes('google_search')) {
    nextTools.google_search = provider.tools.googleSearch({});
  }

  return Object.keys(nextTools).length > 0 ? nextTools : undefined;
};

/** resolveProviderModel 的运行时输入。 */
export type ResolveProviderModelOptions = {
  /** 已解析的思考强度，由调用方按“模型覆盖优先、否则跟随基础设置”得出。 */
  reasoningEffort: ReasoningEffort;
};

/** 创建可注入依赖的 provider registry。 */
export const createProviderRegistry = (deps: ProviderRegistryDeps) => ({
  /** 按 provider 类型解析模型配置，返回统一 provider 句柄。 */
  resolveProviderModel(model: ModelConfig, options: ResolveProviderModelOptions): ResolvedProviderModel {
    const resolvedModelId = model.provider === 'azure-openai' ? model.deployment : model.model;
    const requestOptions = resolveModelRequestOptions({
      provider: model.provider,
      modelId: resolvedModelId,
      reasoningEffort: options.reasoningEffort,
    });

    switch (model.provider) {
      case 'openai-compatible':
      case 'openrouter':
      case 'azure-openai': {
        // OpenRouter 允许留空 Base URL，回退到官方地址；name 决定 providerOptions 键。
        const baseURL =
          model.provider === 'openrouter' ? (toOptionalString(model.baseUrl) ?? DEFAULT_OPENROUTER_BASE_URL) : model.baseUrl;
        const provider = deps.createOpenAICompatible({
          name: model.provider,
          baseURL,
          apiKey: model.apiKey,
        });

        const resolved: ResolvedProviderModel = {
          providerId: model.provider,
          modelId: resolvedModelId,
          modelLabel: model.name,
          supportsImages: model.supportsImages,
          sdkModel: provider.chatModel(resolvedModelId),
          maxOutputTokens: requestOptions.maxOutputTokens,
        };
        if (requestOptions.providerOptions) {
          resolved.providerOptions = requestOptions.providerOptions;
        }

        return resolved;
      }
      case 'gemini':
      case 'google-vertex': {
        const settings: Parameters<GoogleFactory>[0] = {
          apiKey: model.apiKey,
        };
        const baseURL = toOptionalString(model.baseUrl);
        if (baseURL !== undefined) {
          settings.baseURL = baseURL;
        }
        // 当前 Vertex 配置使用 API key，与官方 Vertex Express 路径一致。
        // Express 模式不使用 project/location；自定义 baseURL 仍优先。
        if (model.provider === 'google-vertex' && baseURL === undefined) {
          settings.baseURL = 'https://aiplatform.googleapis.com/v1/publishers/google';
        }
        const provider = deps.createGoogleGenerativeAI(settings);
        const resolved: ResolvedProviderModel = {
          providerId: model.provider,
          modelId: resolvedModelId,
          modelLabel: model.name,
          supportsImages: model.supportsImages,
          sdkModel: provider(resolvedModelId),
          maxOutputTokens: requestOptions.maxOutputTokens,
        };
        if (requestOptions.providerOptions) {
          resolved.providerOptions = requestOptions.providerOptions;
        }
        const tools = buildGoogleTools(provider, model.tools);
        if (tools) {
          resolved.tools = tools;
        }

        return resolved;
      }
      case 'anthropic': {
        const settings: Parameters<AnthropicFactory>[0] = {
          apiKey: model.apiKey,
        };
        const baseURL = toOptionalString(model.baseUrl);
        if (baseURL !== undefined) {
          settings.baseURL = baseURL;
        }
        const provider = deps.createAnthropic(settings);
        const resolved: ResolvedProviderModel = {
          providerId: model.provider,
          modelId: resolvedModelId,
          modelLabel: model.name,
          supportsImages: model.supportsImages,
          sdkModel: provider(resolvedModelId),
          maxOutputTokens: requestOptions.maxOutputTokens,
        };
        if (requestOptions.providerOptions) {
          resolved.providerOptions = requestOptions.providerOptions;
        }

        return resolved;
      }
      case 'amazon-bedrock': {
        const settings: Parameters<BedrockFactory>[0] = {};
        const apiKey = toOptionalString(model.apiKey);
        const region = toOptionalString(model.region);
        const baseURL = toOptionalString(model.baseUrl);
        if (apiKey !== undefined) {
          settings.apiKey = apiKey;
        }
        if (region !== undefined) {
          settings.region = region;
        }
        if (baseURL !== undefined) {
          settings.baseURL = baseURL;
        }
        const provider = deps.createAmazonBedrock(settings);
        const resolved: ResolvedProviderModel = {
          providerId: model.provider,
          modelId: resolvedModelId,
          modelLabel: model.name,
          supportsImages: model.supportsImages,
          sdkModel: provider(resolvedModelId),
          maxOutputTokens: requestOptions.maxOutputTokens,
        };
        if (requestOptions.providerOptions) {
          resolved.providerOptions = requestOptions.providerOptions;
        }

        return resolved;
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
  createAmazonBedrock,
});

/** 默认 registry，直接绑定官方 provider 工厂。 */
export const resolveProviderModel = (model: ModelConfig, options: ResolveProviderModelOptions): ResolvedProviderModel =>
  defaultRegistry.resolveProviderModel(model, options);
