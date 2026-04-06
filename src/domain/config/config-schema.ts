import { z } from 'zod';

import { CONFIG_SCHEMA_VERSION } from '../../shared/schema-version';

/** 提取区最小默认高度。 */
export const MIN_EXTRACTION_PANEL_HEIGHT = 1;
/** 提取区默认高度。 */
export const DEFAULT_EXTRACTION_PANEL_HEIGHT = 240;
/** 提取区最大默认高度。 */
export const MAX_EXTRACTION_PANEL_HEIGHT = 420;
/** 分支阅读列最小宽度。 */
export const MIN_ASSISTANT_BRANCH_COLUMN_WIDTH = 350;
/** Jina 响应模板默认占位符。 */
export const DEFAULT_JINA_RESPONSE_TEMPLATE = '{{content}}';

export const MODEL_PROVIDER_VALUES = [
  'openai-compatible',
  'gemini',
  'azure-openai',
  'anthropic',
  'amazon-bedrock',
  'google-vertex',
] as const;

export const MODEL_TOOL_VALUES = ['url_context', 'google_search'] as const;

export const REASONING_EFFORT_VALUES = ['low', 'medium', 'high', 'max'] as const;

const modelProviderSchema = z.enum(MODEL_PROVIDER_VALUES);
const reasoningEffortSchema = z.enum(REASONING_EFFORT_VALUES);

/** 兼容旧字段 branchModelIds，统一迁移到 parallelModelIds。 */
const migrateLegacyParallelModelIds = <T extends { parallelModelIds?: string[]; branchModelIds?: string[] }>(value: T): T => {
  if (Array.isArray(value.parallelModelIds)) {
    return value;
  }

  if (Array.isArray(value.branchModelIds)) {
    return {
      ...value,
      parallelModelIds: value.branchModelIds,
    };
  }

  return value;
};

/** 获取 provider 默认 Base URL。 */
export const getDefaultModelBaseUrl = (provider: z.infer<typeof modelProviderSchema>): string => {
  switch (provider) {
    case 'openai-compatible':
      return 'https://api.openai.com/v1';
    case 'gemini':
      return 'https://generativelanguage.googleapis.com/v1beta';
    case 'anthropic':
      return 'https://api.anthropic.com/v1';
    case 'azure-openai':
    case 'amazon-bedrock':
    case 'google-vertex':
      return '';
    default:
      throw new Error(`unsupported provider: ${String(provider)}`);
  }
};

/** 判断当前 provider 是否支持 reasoning effort。 */
export const providerSupportsReasoningEffort = (provider: z.infer<typeof modelProviderSchema>): boolean =>
  provider === 'anthropic' || provider === 'gemini' || provider === 'amazon-bedrock' || provider === 'google-vertex';

/** 判断当前 provider 是否支持 Google grounding tools。 */
export const providerSupportsGoogleTools = (provider: z.infer<typeof modelProviderSchema>): boolean =>
  provider === 'gemini' || provider === 'google-vertex';

/** 获取 provider 默认 tools 选项。 */
export const getDefaultModelTools = (provider: z.infer<typeof modelProviderSchema>): string[] =>
  providerSupportsGoogleTools(provider) ? [...MODEL_TOOL_VALUES] : [];

export const modelConfigSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    provider: modelProviderSchema,
    enabled: z.boolean(),
    model: z.string(),
    baseUrl: z.string(),
    apiKey: z.string(),
    deployment: z.string(),
    region: z.string().optional(),
    project: z.string().optional(),
    location: z.string().optional(),
    temperature: z.number(),
    tools: z.array(z.string()),
    reasoningEffort: reasoningEffortSchema.optional(),
    /** 兼容旧配置保留，设置页不再暴露。 */
    thinkingBudget: z.number().int().nonnegative().nullable(),
    maxOutputTokens: z.number().int().positive().nullable(),
    supportsImages: z.boolean().default(false),
    order: z.number().int().nonnegative(),
    deletedAt: z.number().int().nonnegative().nullable(),
  })
  .superRefine((value, ctx) => {
    const requiredFields: Record<string, Array<'baseUrl' | 'apiKey' | 'model' | 'deployment'>> = {
      'openai-compatible': ['baseUrl', 'apiKey', 'model'],
      gemini: ['apiKey', 'model'],
      'azure-openai': ['baseUrl', 'apiKey', 'deployment'],
      anthropic: ['apiKey', 'model'],
      'amazon-bedrock': ['apiKey', 'model'],
      'google-vertex': ['apiKey', 'model'],
    };

    for (const field of requiredFields[value.provider]) {
      if (!value[field].trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${value.provider} provider field ${field} is required`,
          path: [field],
        });
      }
    }

    if (value.provider === 'amazon-bedrock' && !(value.region ?? '').trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'amazon-bedrock provider field region is required',
        path: ['region'],
      });
    }
  });

const quickInputSchema = z.preprocess(
  (value) => (typeof value === 'object' && value !== null ? migrateLegacyParallelModelIds(value as { parallelModelIds?: string[]; branchModelIds?: string[] }) : value),
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    prompt: z.string().min(1),
    autoTrigger: z.boolean(),
    modelId: z.string().nullable(),
    parallelModelIds: z.array(z.string().min(1)).default([]),
    order: z.number().int().nonnegative(),
    deletedAt: z.number().int().nonnegative().nullable(),
  }),
);

const blacklistRuleSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['domain', 'url-prefix', 'regex']),
  pattern: z.string().min(1),
  enabled: z.boolean(),
  deletedAt: z.number().int().nonnegative().nullable(),
});

const syncConfigSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(['none', 'gist', 'webdav']),
  gistToken: z.string(),
  gistId: z.string(),
  webdavUrl: z.string(),
  webdavUsername: z.string(),
  webdavPassword: z.string(),
  lastSyncAt: z.number().int().nonnegative().nullable(),
});

type QuickInputConfig = z.infer<typeof quickInputSchema>;
type BlacklistRuleConfig = z.infer<typeof blacklistRuleSchema>;

const defaultQuickInputSeeds: Array<Omit<QuickInputConfig, 'order' | 'deletedAt'>> = [
  {
    id: 'builtin-summary',
    name: '概括',
    prompt: '请概括当前页面的核心观点、关键事实和结论，并给出一段简短总结。',
    autoTrigger: false,
    modelId: null,
    parallelModelIds: [],
  },
  {
    id: 'builtin-compress',
    name: '缩写',
    prompt: '请把当前页面内容压缩成一段更短、更密集的摘要，保留关键结论和必要上下文。',
    autoTrigger: false,
    modelId: null,
    parallelModelIds: [],
  },
  {
    id: 'builtin-refactor',
    name: '重构',
    prompt: '请重构当前内容的结构与表达，使其更清晰、更易维护，并指出主要改进点。',
    autoTrigger: false,
    modelId: null,
    parallelModelIds: [],
  },
  {
    id: 'builtin-counterintuitive',
    name: '反直觉',
    prompt: '请从反直觉角度审视当前内容，指出最容易被忽略、但最值得重新思考的部分。',
    autoTrigger: false,
    modelId: null,
    parallelModelIds: [],
  },
  {
    id: 'builtin-audit',
    name: '审计',
    prompt: '请审计当前内容中的事实、假设、风险和可能的漏洞，并按优先级给出问题清单。',
    autoTrigger: false,
    modelId: null,
    parallelModelIds: [],
  },
  {
    id: 'builtin-first-principles',
    name: '第一性原理',
    prompt: '请用第一性原理拆解当前问题，区分事实、假设和推导，再给出结论。',
    autoTrigger: false,
    modelId: null,
    parallelModelIds: [],
  },
  {
    id: 'builtin-intent-analysis',
    name: '意图分析',
    prompt: '请分析当前内容背后的真实意图、目标受众、显性诉求和隐含诉求。',
    autoTrigger: false,
    modelId: null,
    parallelModelIds: [],
  },
];

const defaultBlacklistRuleSeeds: BlacklistRuleConfig[] = [
  {
    id: 'builtin-google-search',
    type: 'regex',
    pattern: '^https?://([^.]+\\.)?google\\.[^/]+/search(?:\\?|$)',
    enabled: true,
    deletedAt: null,
  },
  {
    id: 'builtin-bing-search',
    type: 'regex',
    pattern: '^https?://([^.]+\\.)?bing\\.com/search(?:\\?|$)',
    enabled: true,
    deletedAt: null,
  },
  {
    id: 'builtin-baidu-search',
    type: 'regex',
    pattern: '^https?://([^.]+\\.)?baidu\\.com/s(?:\\?|$)',
    enabled: true,
    deletedAt: null,
  },
];

/** 默认内置快捷输入列表。 */
export const DEFAULT_QUICK_INPUTS: QuickInputConfig[] = defaultQuickInputSeeds.map((item, index) => ({
  ...item,
  order: index,
  deletedAt: null,
}));

/** 默认内置黑名单规则列表。 */
export const DEFAULT_BLACKLIST_RULES: BlacklistRuleConfig[] = defaultBlacklistRuleSeeds.map((item) => ({
  ...item,
}));

const defaultQuickInputIdSet = new Set(DEFAULT_QUICK_INPUTS.map((item) => item.id));
const defaultBlacklistRuleIdSet = new Set(DEFAULT_BLACKLIST_RULES.map((item) => item.id));

/** 判断当前快捷输入是否为系统内置项。 */
export const isBuiltInQuickInputId = (id: string) => defaultQuickInputIdSet.has(id);

/** 判断当前黑名单规则是否为系统内置项。 */
export const isBuiltInBlacklistRuleId = (id: string) => defaultBlacklistRuleIdSet.has(id);

/** 给旧配置补齐缺失的系统快捷输入，但不覆盖已有项。 */
export const mergeDefaultQuickInputs = (quickInputs: QuickInputConfig[]): QuickInputConfig[] => {
  const existingIds = new Set(quickInputs.map((item) => item.id));
  let nextOrder = quickInputs.reduce((max, item) => Math.max(max, item.order), -1) + 1;

  const missingQuickInputs = DEFAULT_QUICK_INPUTS.filter((item) => !existingIds.has(item.id)).map((item) => ({
    ...item,
    order: nextOrder++,
  }));

  return [...quickInputs, ...missingQuickInputs];
};

/** 给旧配置补齐缺失的系统黑名单规则，但不覆盖已有项。 */
export const mergeDefaultBlacklistRules = (rules: BlacklistRuleConfig[]): BlacklistRuleConfig[] => {
  const existingIds = new Set(rules.map((item) => item.id));
  const missingRules = DEFAULT_BLACKLIST_RULES.filter((item) => !existingIds.has(item.id)).map((item) => ({
    ...item,
  }));
  return [...rules, ...missingRules];
};

/** 对旧配置执行系统种子迁移。 */
export const applySystemConfigSeeds = (config: ExtensionConfig): ExtensionConfig => ({
  ...config,
  quickInputs: mergeDefaultQuickInputs(config.quickInputs),
  blacklist: mergeDefaultBlacklistRules(config.blacklist),
});

export const extensionConfigSchema = z
  .preprocess(
    (value) => {
      if (typeof value !== 'object' || value === null) {
        return value;
      }

      const input = value as {
        basic?: { parallelModelIds?: string[]; branchModelIds?: string[] };
        quickInputs?: Array<{ parallelModelIds?: string[]; branchModelIds?: string[] }>;
      };

      return {
        ...input,
        basic:
          typeof input.basic === 'object' && input.basic !== null
            ? migrateLegacyParallelModelIds(input.basic)
            : input.basic,
        quickInputs: Array.isArray(input.quickInputs)
          ? input.quickInputs.map((quickInput) => migrateLegacyParallelModelIds(quickInput))
          : input.quickInputs,
      };
    },
    z.object({
      version: z.literal(CONFIG_SCHEMA_VERSION),
      updatedAt: z.number().int().nonnegative(),
      basic: z.object({
        theme: z.enum(['system', 'light', 'dark']),
        language: z.enum(['zh-CN', 'en']),
        defaultModelId: z.string().min(1).nullable(),
        parallelModelIds: z.array(z.string().min(1)).default([]),
        systemPrompt: z.string(),
        filterCot: z.boolean(),
        extractionMethod: z.enum(['readability', 'jina']),
        extractionPanelHeight: z
          .number()
          .int()
          .min(MIN_EXTRACTION_PANEL_HEIGHT)
          .max(MAX_EXTRACTION_PANEL_HEIGHT)
          .default(DEFAULT_EXTRACTION_PANEL_HEIGHT),
        jinaApiKey: z.string().default(''),
        jinaResponseTemplate: z.string().default(DEFAULT_JINA_RESPONSE_TEMPLATE),
        includePageContentByDefault: z.boolean(),
      }),
      models: z.array(modelConfigSchema),
      quickInputs: z.array(quickInputSchema),
      sync: syncConfigSchema,
      blacklist: z.array(blacklistRuleSchema),
    }),
  )
  .superRefine((value, ctx) => {
    const idGroups = [
      ['models', value.models.map((item) => item.id)],
      ['quickInputs', value.quickInputs.map((item) => item.id)],
      ['blacklist', value.blacklist.map((item) => item.id)],
    ] as const;

    for (const [field, ids] of idGroups) {
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${field} id must be unique`,
          path: [field],
        });
      }
    }
  });

export type ExtensionConfig = z.infer<typeof extensionConfigSchema>;
export type ModelConfig = ExtensionConfig['models'][number];

/** 解析模型的 reasoning effort，旧配置缺省时默认 high。 */
export const getResolvedReasoningEffort = (model: Pick<ModelConfig, 'reasoningEffort'>): z.infer<typeof reasoningEffortSchema> =>
  model.reasoningEffort ?? 'high';

/** 判断模型是否足够完整，可进入默认模型候选。 */
export const isModelConfigComplete = (model: ModelConfig): boolean =>
  modelConfigSchema.safeParse(model).success && model.enabled && model.deletedAt === null;

/** 取出启用且完整的模型。 */
export const getEnabledCompleteModels = (config: ExtensionConfig): ModelConfig[] =>
  config.models.filter((model) => isModelConfigComplete(model));

/** 过滤无效并行模型引用，保留原顺序并去重。 */
export const sanitizeParallelModelIds = (config: ExtensionConfig, parallelModelIds: string[] = []): string[] => {
  const enabledModelIds = new Set(getEnabledCompleteModels(config).map((model) => model.id));
  const seen = new Set<string>();

  return parallelModelIds.filter((modelId) => {
    if (!enabledModelIds.has(modelId) || seen.has(modelId)) {
      return false;
    }
    seen.add(modelId);
    return true;
  });
};

/** 归一化配置中的并行模型引用。 */
export const normalizeParallelModelSelections = (config: ExtensionConfig): ExtensionConfig => ({
  ...config,
  basic: {
    ...config.basic,
    parallelModelIds: sanitizeParallelModelIds(config, config.basic.parallelModelIds),
  },
  quickInputs: config.quickInputs.map((quickInput) => ({
    ...quickInput,
    parallelModelIds: sanitizeParallelModelIds(config, quickInput.parallelModelIds),
  })),
});

/** 解析当前快捷输入 promptTab 应使用的并行模型，规则为全局配置与当前配置合并。 */
export const resolvePromptTabParallelModelIds = (config: ExtensionConfig, promptTabId: string): string[] => {
  const globalParallelModelIds = sanitizeParallelModelIds(config, config.basic.parallelModelIds);
  if (promptTabId === 'chat') {
    return [];
  }

  const quickInput = config.quickInputs.find((item) => item.id === promptTabId && item.deletedAt === null);
  if (!quickInput) {
    return globalParallelModelIds;
  }

  return sanitizeParallelModelIds(config, [...globalParallelModelIds, ...quickInput.parallelModelIds]);
};

/** 生成默认配置。 */
export const createDefaultConfig = (overrides: Partial<ExtensionConfig> = {}): ExtensionConfig =>
  extensionConfigSchema.parse({
    version: CONFIG_SCHEMA_VERSION,
    updatedAt: overrides.updatedAt ?? Date.now(),
    basic: {
      theme: 'system',
      language: 'zh-CN',
      defaultModelId: null,
      parallelModelIds: [],
      systemPrompt: '',
      filterCot: false,
      extractionMethod: 'readability',
      extractionPanelHeight: DEFAULT_EXTRACTION_PANEL_HEIGHT,
      jinaApiKey: '',
      jinaResponseTemplate: DEFAULT_JINA_RESPONSE_TEMPLATE,
      includePageContentByDefault: true,
      ...(overrides.basic ?? {}),
    },
    models: overrides.models ?? [],
    quickInputs: (overrides.quickInputs ?? DEFAULT_QUICK_INPUTS).map((quickInput) => ({
      parallelModelIds: [],
      ...quickInput,
    })),
    sync: {
      enabled: false,
      provider: 'none',
      gistToken: '',
      gistId: '',
      webdavUrl: '',
      webdavUsername: '',
      webdavPassword: '',
      lastSyncAt: null,
      ...(overrides.sync ?? {}),
    },
    blacklist: overrides.blacklist ?? DEFAULT_BLACKLIST_RULES,
  });
