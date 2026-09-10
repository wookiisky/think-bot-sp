import type * as Ai from 'ai';

import type { ModelConfig, ReasoningEffort } from '../../domain/config/config-schema';

type GenerateTextRequest = Parameters<typeof Ai.generateText>[0];

/** AI SDK providerOptions 类型，供 registry 与 dispatch 共用。 */
export type ProviderOptions = GenerateTextRequest extends { providerOptions?: infer Value } ? Value : never;

/** 按 provider / 模型解析出的请求参数。 */
export type ModelRequestOptions = {
  /** 单次输出 token 上限；`null` 表示不传，交给 provider 默认值。 */
  maxOutputTokens: number | null;
  /** 映射到底层 SDK 的 reasoning 参数；不支持时不返回。 */
  providerOptions?: ProviderOptions;
};

type ModelRequestInput = {
  /** provider 类型。 */
  provider: ModelConfig['provider'];
  /** 实际提交给 SDK 的模型标识；Azure 为 deployment 名称。 */
  modelId: string;
  /** 已解析的思考强度（模型级覆盖或全局默认）。 */
  reasoningEffort: ReasoningEffort;
};

type ClaudeFamily = 'opus' | 'sonnet' | 'haiku' | 'fable' | 'mythos' | 'unknown';

type ClaudeModelInfo = {
  /** 模型系列。 */
  family: ClaudeFamily;
  /** 以 major.minor 表示的版本号，无法解析时为 null。 */
  version: number | null;
};

/** 无法识别的 Claude 模型默认输出上限，取 4.5 代模型的公共上限，避免 SDK 兜底到 4096。 */
const CLAUDE_FALLBACK_MAX_OUTPUT_TOKENS = 64_000;

/** Gemini 2.5 仅支持 thinkingBudget，按档位换算 token 预算（flash 上限 24576）。 */
const GEMINI_THINKING_BUDGET: Record<ReasoningEffort, number> = {
  low: 1024,
  medium: 8192,
  high: 16384,
  max: 24576,
};

/** 从任意模型标识中解析 Claude 系列与版本，兼容 Bedrock / Vertex 前后缀。 */
export const parseClaudeModel = (modelId: string): ClaudeModelInfo | null => {
  const normalized = modelId.toLowerCase();
  const start = normalized.indexOf('claude-');
  if (start < 0) {
    return null;
  }

  const rest = normalized.slice(start + 'claude-'.length);
  // 新命名：claude-<family>-<major>[-<minor>]，例如 claude-opus-4-5-20251101、claude-sonnet-5；
  // OpenRouter slug 用点分隔 minor，例如 anthropic/claude-opus-4.6。
  const modern = /^(opus|sonnet|haiku|fable|mythos)-(\d+)(?:[-.](\d{1,2}))?(?!\d)/.exec(rest);
  if (modern) {
    return {
      family: modern[1] as ClaudeFamily,
      version: Number(modern[2]) + (modern[3] ? Number(modern[3]) / 10 : 0),
    };
  }

  // 旧命名：claude-3-5-sonnet、claude-3-7-sonnet、claude-3-haiku、claude-3-opus（OpenRouter 写作 claude-3.7-sonnet）。
  const legacy = /^(\d+)(?:[-.](\d{1,2}))?-(opus|sonnet|haiku)(?![a-z])/.exec(rest);
  if (legacy) {
    return {
      family: legacy[3] as ClaudeFamily,
      version: Number(legacy[1]) + (legacy[2] ? Number(legacy[2]) / 10 : 0),
    };
  }

  return { family: 'unknown', version: null };
};

/** Claude 各系列按版本的最大输出 token。 */
const getClaudeMaxOutputTokens = ({ family, version }: ClaudeModelInfo): number => {
  if (family === 'fable' || family === 'mythos') {
    return 128_000;
  }
  if (version === null || family === 'unknown') {
    return CLAUDE_FALLBACK_MAX_OUTPUT_TOKENS;
  }
  if (version >= 4.6) {
    return 128_000;
  }
  if (family === 'opus') {
    return version >= 4.5 ? 64_000 : version >= 4 ? 32_000 : 4096;
  }
  if (family === 'sonnet') {
    return version >= 3.7 ? 64_000 : version >= 3.5 ? 8192 : 4096;
  }
  // haiku
  return version >= 4 ? 64_000 : version >= 3.5 ? 8192 : 4096;
};

/** Claude `effort` 参数从 Opus 4.5 起可用，Sonnet / Haiku 4.5 及更早版本会返回 400。 */
const getClaudeEffort = (info: ClaudeModelInfo, effort: ReasoningEffort): ReasoningEffort | null => {
  if (info.family === 'fable' || info.family === 'mythos') {
    return effort;
  }
  if (info.version === null || info.family === 'unknown') {
    return null;
  }
  if (info.version >= 4.6) {
    return effort;
  }
  if (info.family === 'opus' && info.version >= 4.5) {
    // Opus 4.5 仅支持 low / medium / high。
    return effort === 'max' ? 'high' : effort;
  }
  return null;
};

/** OpenAI reasoning 模型系列：o 系列、GPT-5 及之后、Codex。 */
const OPENAI_REASONING_MODEL_PATTERN = /\b(o[1-9]|gpt-[5-9]|codex)/i;
/** `xhigh` 仅 GPT-5.2 及以后或 codex-max 支持。 */
const OPENAI_XHIGH_PATTERN = /gpt-5\.(?:[2-9]|\d{2,})|codex-max/i;

/** 把统一档位映射为 OpenAI `reasoning_effort` 取值。 */
const toOpenAIReasoningEffort = (modelId: string, effort: ReasoningEffort): string | null => {
  if (!OPENAI_REASONING_MODEL_PATTERN.test(modelId)) {
    return null;
  }
  if (effort === 'max') {
    return OPENAI_XHIGH_PATTERN.test(modelId) ? 'xhigh' : 'high';
  }
  return effort;
};

/** Google thinkingLevel 没有 max 档，向下取 high。 */
const toGoogleThinkingLevel = (effort: ReasoningEffort) => (effort === 'max' ? 'high' : effort);

/** 解析 Google 系列的 reasoning 参数。 */
const resolveGoogleOptions = (modelId: string, effort: ReasoningEffort): ProviderOptions | undefined => {
  const normalized = modelId.toLowerCase();
  // Gemini 1.x / 2.0 与 Gemma 没有 thinking 参数，传入会被拒绝。
  if (/gemini-(?:1\.|2\.0)/.test(normalized) || normalized.includes('gemma')) {
    return undefined;
  }
  if (normalized.includes('gemini-2.5')) {
    return {
      google: {
        thinkingConfig: {
          thinkingBudget: GEMINI_THINKING_BUDGET[effort],
        },
      },
    };
  }
  // Gemini 3 及之后版本使用 thinkingLevel。
  return {
    google: {
      thinkingConfig: {
        thinkingLevel: toGoogleThinkingLevel(effort),
      },
    },
  };
};

/** OpenRouter 上支持 thinking 的 Gemini：2.5 与 3 及之后。 */
const OPENROUTER_GEMINI_REASONING_PATTERN = /google\/gemini-(?:2\.5|[3-9])/i;

/**
 * 解析 OpenRouter 的请求参数。OpenRouter 使用统一的 `reasoning` 对象，effort 由网关映射到最近的可用档位；
 * Claude 在 OpenRouter 上默认不开启 reasoning，必须显式 `enabled: true`；
 * Claude 4.6+ / Fable 额外发 `verbosity`（SDK 的 textVerbosity），它映射到 `output_config.effort` 且优先级更高。
 */
const resolveOpenRouterOptions = (modelId: string, effort: ReasoningEffort): ModelRequestOptions => {
  const normalized = modelId.toLowerCase();
  const claude = normalized.startsWith('anthropic/') ? parseClaudeModel(normalized) : null;

  if (claude) {
    // Claude 3.7 起支持 thinking；更早版本不发送。
    if (claude.family !== 'unknown' && claude.version !== null && claude.version < 3.7) {
      return { maxOutputTokens: null };
    }
    const openrouter: NonNullable<ProviderOptions>[string] = {
      reasoning: { enabled: true, effort },
    };
    if (getClaudeEffort(claude, effort)) {
      openrouter.textVerbosity = effort;
    }
    return { maxOutputTokens: null, providerOptions: { openrouter } };
  }

  if (normalized.startsWith('openai/') && OPENAI_REASONING_MODEL_PATTERN.test(normalized)) {
    return { maxOutputTokens: null, providerOptions: { openrouter: { reasoning: { effort } } } };
  }

  if (OPENROUTER_GEMINI_REASONING_PATTERN.test(normalized)) {
    return { maxOutputTokens: null, providerOptions: { openrouter: { reasoning: { enabled: true, effort } } } };
  }

  return { maxOutputTokens: null };
};

/** Bedrock 上 Nova 2 及之后版本支持 reasoningConfig；Nova 1.x 会拒绝该字段。 */
const BEDROCK_NOVA_REASONING_PATTERN = /amazon\.nova-([2-9]|\d{2,})/i;
/** Bedrock 上的 gpt-oss 模型走 reasoning_effort。 */
const BEDROCK_GPT_OSS_PATTERN = /openai\.gpt-oss/i;

/** 解析 Bedrock 上不同模型家族的请求参数。 */
const resolveBedrockOptions = (modelId: string, effort: ReasoningEffort): ModelRequestOptions => {
  const claude = parseClaudeModel(modelId);
  if (claude && /anthropic\./i.test(modelId)) {
    const claudeEffort = getClaudeEffort(claude, effort);
    const resolved: ModelRequestOptions = {
      maxOutputTokens: getClaudeMaxOutputTokens(claude),
    };
    if (claudeEffort) {
      // SDK 会把 maxReasoningEffort 转成 Anthropic 的 output_config.effort。
      resolved.providerOptions = {
        bedrock: {
          reasoningConfig: {
            maxReasoningEffort: claudeEffort,
          },
        },
      };
    }
    return resolved;
  }

  if (BEDROCK_NOVA_REASONING_PATTERN.test(modelId)) {
    return {
      maxOutputTokens: null,
      providerOptions: {
        bedrock: {
          reasoningConfig: {
            type: 'enabled',
            // Nova 仅支持 low / medium / high。
            maxReasoningEffort: effort === 'max' ? 'high' : effort,
          },
        },
      },
    };
  }

  if (BEDROCK_GPT_OSS_PATTERN.test(modelId)) {
    return {
      maxOutputTokens: null,
      providerOptions: {
        bedrock: {
          reasoningConfig: {
            maxReasoningEffort: effort === 'max' ? 'high' : effort,
          },
        },
      },
    };
  }

  return { maxOutputTokens: null };
};

/** 穷举保护，避免新增 provider 后静默落入错误分支。 */
const assertNever = (value: never): never => {
  throw new Error(`unsupported provider: ${String(value)}`);
};

/**
 * 把配置层统一的思考强度映射为各 provider / 模型实际接受的请求参数，
 * 并给出代码层维护的输出 token 上限。
 */
export const resolveModelRequestOptions = ({ provider, modelId, reasoningEffort }: ModelRequestInput): ModelRequestOptions => {
  switch (provider) {
    case 'openai-compatible':
    case 'azure-openai': {
      const effort = toOpenAIReasoningEffort(modelId, reasoningEffort);
      const resolved: ModelRequestOptions = { maxOutputTokens: null };
      if (effort) {
        // openai-compatible provider 以 provider name 作为 providerOptions 键。
        resolved.providerOptions = {
          [provider]: {
            reasoningEffort: effort,
          },
        };
      }
      return resolved;
    }
    case 'anthropic': {
      const claude = parseClaudeModel(modelId) ?? { family: 'unknown', version: null };
      const effort = getClaudeEffort(claude, reasoningEffort);
      const resolved: ModelRequestOptions = {
        maxOutputTokens: getClaudeMaxOutputTokens(claude),
      };
      if (effort) {
        resolved.providerOptions = {
          anthropic: {
            effort,
          },
        };
      }
      return resolved;
    }
    case 'gemini':
    case 'google-vertex': {
      const resolved: ModelRequestOptions = { maxOutputTokens: null };
      const providerOptions = resolveGoogleOptions(modelId, reasoningEffort);
      if (providerOptions) {
        resolved.providerOptions = providerOptions;
      }
      return resolved;
    }
    case 'openrouter':
      return resolveOpenRouterOptions(modelId, reasoningEffort);
    case 'amazon-bedrock':
      return resolveBedrockOptions(modelId, reasoningEffort);
    default:
      return assertNever(provider);
  }
};
