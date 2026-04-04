import { z } from 'zod';

import { CONFIG_SCHEMA_VERSION } from '../../shared/schema-version';

const modelProviderSchema = z.enum(['openai-compatible', 'gemini', 'azure-openai', 'anthropic']);

const modelConfigSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    provider: modelProviderSchema,
    enabled: z.boolean(),
    model: z.string(),
    baseUrl: z.string(),
    apiKey: z.string(),
    deployment: z.string(),
    temperature: z.number(),
    tools: z.array(z.string()),
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
  });

const quickInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  prompt: z.string().min(1),
  autoTrigger: z.boolean(),
  modelId: z.string().nullable(),
  branchModelIds: z.array(z.string().min(1)).default([]),
  order: z.number().int().nonnegative(),
  deletedAt: z.number().int().nonnegative().nullable(),
});

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

export const extensionConfigSchema = z
  .object({
    version: z.literal(CONFIG_SCHEMA_VERSION),
    updatedAt: z.number().int().nonnegative(),
    basic: z.object({
      theme: z.enum(['system', 'light', 'dark']),
      language: z.enum(['zh-CN', 'en']),
      defaultModelId: z.string().min(1).nullable(),
      branchModelIds: z.array(z.string().min(1)).default([]),
      systemPrompt: z.string(),
      filterCot: z.boolean(),
      extractionMethod: z.enum(['readability', 'jina']),
      includePageContentByDefault: z.boolean(),
    }),
    models: z.array(modelConfigSchema),
    quickInputs: z.array(quickInputSchema),
    sync: syncConfigSchema,
    blacklist: z.array(blacklistRuleSchema),
  })
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

/** 判断模型是否足够完整，可进入默认模型候选。 */
export const isModelConfigComplete = (model: ModelConfig): boolean =>
  modelConfigSchema.safeParse(model).success && model.enabled && model.deletedAt === null;

/** 取出启用且完整的模型。 */
export const getEnabledCompleteModels = (config: ExtensionConfig): ModelConfig[] =>
  config.models.filter((model) => isModelConfigComplete(model));

/** 过滤无效分支模型引用，保留原顺序并去重。 */
export const sanitizeBranchModelIds = (config: ExtensionConfig, branchModelIds: string[]): string[] => {
  const enabledModelIds = new Set(getEnabledCompleteModels(config).map((model) => model.id));
  const seen = new Set<string>();

  return branchModelIds.filter((modelId) => {
    if (!enabledModelIds.has(modelId) || seen.has(modelId)) {
      return false;
    }
    seen.add(modelId);
    return true;
  });
};

/** 归一化配置中的分支模型引用。 */
export const normalizeBranchModelSelections = (config: ExtensionConfig): ExtensionConfig => ({
  ...config,
  basic: {
    ...config.basic,
    branchModelIds: sanitizeBranchModelIds(config, config.basic.branchModelIds),
  },
  quickInputs: config.quickInputs.map((quickInput) => ({
    ...quickInput,
    branchModelIds: sanitizeBranchModelIds(config, quickInput.branchModelIds),
  })),
});

/** 解析当前 promptTab 应使用的分支模型，规则为全局配置与当前配置合并。 */
export const resolvePromptTabBranchModelIds = (config: ExtensionConfig, promptTabId: string): string[] => {
  const globalBranchModelIds = sanitizeBranchModelIds(config, config.basic.branchModelIds);
  if (promptTabId === 'chat') {
    return globalBranchModelIds;
  }

  const quickInput = config.quickInputs.find((item) => item.id === promptTabId && item.deletedAt === null);
  if (!quickInput) {
    return globalBranchModelIds;
  }

  return sanitizeBranchModelIds(config, [...globalBranchModelIds, ...quickInput.branchModelIds]);
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
      branchModelIds: [],
      systemPrompt: '',
      filterCot: false,
      extractionMethod: 'readability',
      includePageContentByDefault: true,
      ...(overrides.basic ?? {}),
    },
    models: overrides.models ?? [],
    quickInputs: (overrides.quickInputs ?? []).map((quickInput) => ({
      branchModelIds: [],
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
    blacklist: overrides.blacklist ?? [],
  });
