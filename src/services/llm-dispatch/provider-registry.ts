import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createVertex } from '@ai-sdk/google-vertex/edge';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

import { getResolvedReasoningEffort, type ModelConfig } from '../../domain/config/config-schema';

type OpenAICompatibleProvider = {
  /** 兼容 OpenAI provider 的 chatModel 创建入口。 */
  chatModel: (modelId: string) => unknown;
};

type CallableProvider = (modelId: string) => unknown;

type GoogleToolProvider = CallableProvider & {
  /** Provider 内建 tool 工厂。 */
  tools: {
    /** Google Search grounding。 */
    googleSearch: (_settings: Record<string, never>) => unknown;
    /** URL Context。 */
    urlContext: (_settings: Record<string, never>) => unknown;
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

type VertexFactory = (settings: {
  /** Vertex API Key。 */
  apiKey?: string;
  /** Vertex Project。 */
  project?: string;
  /** Vertex Location。 */
  location?: string;
  /** Vertex Base URL。 */
  baseURL?: string;
}) => GoogleToolProvider;

type ProviderRegistryDeps = {
  /** OpenAI Compatible provider 工厂。 */
  createOpenAICompatible: OpenAICompatibleFactory;
  /** Google provider 工厂。 */
  createGoogleGenerativeAI: GoogleFactory;
  /** Anthropic provider 工厂。 */
  createAnthropic: AnthropicFactory;
  /** Bedrock provider 工厂。 */
  createAmazonBedrock: BedrockFactory;
  /** Vertex provider 工厂。 */
  createVertex: VertexFactory;
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
  /** 顶层采样温度。 */
  temperature: number;
  /** 单次输出 token 上限。 */
  maxOutputTokens: number | null;
  /** provider tools。 */
  tools?: Record<string, unknown>;
  /** providerOptions。 */
  providerOptions?: Record<string, unknown>;
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

/** 把统一 reasoning effort 映射到 Google Thinking Level。 */
const toGoogleThinkingLevel = (effort: ReturnType<typeof getResolvedReasoningEffort>) =>
  effort === 'max' ? 'high' : effort;

/** 仅 Amazon Nova 模型支持 maxReasoningEffort。 */
const supportsBedrockEffort = (modelId: string) => modelId.startsWith('amazon.') || modelId.startsWith('us.amazon.');

/** 构造 Gemini / Vertex tools。 */
const buildGoogleTools = (provider: GoogleToolProvider, toolIds: string[]) => {
  const nextTools: Record<string, unknown> = {};

  if (toolIds.includes('url_context')) {
    nextTools.url_context = provider.tools.urlContext({});
  }

  if (toolIds.includes('google_search')) {
    nextTools.google_search = provider.tools.googleSearch({});
  }

  return Object.keys(nextTools).length > 0 ? nextTools : undefined;
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
          temperature: model.temperature,
          maxOutputTokens: model.maxOutputTokens,
        };
      }
      case 'gemini': {
        const provider = deps.createGoogleGenerativeAI({
          apiKey: model.apiKey,
          baseURL: toOptionalString(model.baseUrl),
        });

        return {
          providerId: model.provider,
          modelId: resolvedModelId,
          modelLabel: model.name,
          supportsImages: model.supportsImages,
          sdkModel: provider(resolvedModelId),
          temperature: model.temperature,
          maxOutputTokens: model.maxOutputTokens,
          tools: buildGoogleTools(provider, model.tools),
          providerOptions: {
            google: {
              thinkingConfig: {
                thinkingLevel: toGoogleThinkingLevel(getResolvedReasoningEffort(model)),
              },
            },
          },
        };
      }
      case 'anthropic': {
        const provider = deps.createAnthropic({
          apiKey: model.apiKey,
          baseURL: toOptionalString(model.baseUrl),
        });

        return {
          providerId: model.provider,
          modelId: resolvedModelId,
          modelLabel: model.name,
          supportsImages: model.supportsImages,
          sdkModel: provider(resolvedModelId),
          temperature: model.temperature,
          maxOutputTokens: model.maxOutputTokens,
          providerOptions: {
            anthropic: {
              effort: getResolvedReasoningEffort(model),
            },
          },
        };
      }
      case 'amazon-bedrock': {
        const provider = deps.createAmazonBedrock({
          apiKey: toOptionalString(model.apiKey),
          region: toOptionalString(model.region),
          baseURL: toOptionalString(model.baseUrl),
        });

        return {
          providerId: model.provider,
          modelId: resolvedModelId,
          modelLabel: model.name,
          supportsImages: model.supportsImages,
          sdkModel: provider(resolvedModelId),
          temperature: model.temperature,
          maxOutputTokens: model.maxOutputTokens,
          providerOptions: supportsBedrockEffort(resolvedModelId)
            ? {
                bedrock: {
                  reasoningConfig: {
                    type: 'enabled',
                    maxReasoningEffort: getResolvedReasoningEffort(model),
                  },
                },
              }
            : undefined,
        };
      }
      case 'google-vertex': {
        const provider = deps.createVertex({
          apiKey: toOptionalString(model.apiKey),
          project: toOptionalString(model.project),
          location: toOptionalString(model.location),
          baseURL: toOptionalString(model.baseUrl),
        });

        return {
          providerId: model.provider,
          modelId: resolvedModelId,
          modelLabel: model.name,
          supportsImages: model.supportsImages,
          sdkModel: provider(resolvedModelId),
          temperature: model.temperature,
          maxOutputTokens: model.maxOutputTokens,
          tools: buildGoogleTools(provider, model.tools),
          providerOptions: {
            vertex: {
              thinkingConfig: {
                thinkingLevel: toGoogleThinkingLevel(getResolvedReasoningEffort(model)),
              },
            },
          },
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
  createAmazonBedrock,
  createVertex,
});

/** 默认 registry，直接绑定官方 provider 工厂。 */
export const resolveProviderModel = (model: ModelConfig): ResolvedProviderModel =>
  defaultRegistry.resolveProviderModel(model);
