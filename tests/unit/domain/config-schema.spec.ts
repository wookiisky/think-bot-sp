import { describe, expect, it } from 'vitest';

import {
  CONFIG_SCHEMA_VERSION,
  SYNC_SNAPSHOT_SCHEMA_VERSION,
} from '../../../src/shared/schema-version';
import {
  buildConfigStorageKey,
  buildConversationStorageKey,
  buildLoadingStorageKey,
  buildPageStorageKey,
  CONFIG_STORAGE_KEY,
  CONVERSATION_STORAGE_PREFIX,
  LOADING_STORAGE_PREFIX,
  PAGE_STORAGE_PREFIX,
} from '../../../src/shared/storage-keys';
import {
  DEFAULT_EXTRACTION_PANEL_HEIGHT,
  DEFAULT_EXTRACTION_TEXT_FONT_SIZE,
  DEFAULT_JINA_RESPONSE_TEMPLATE,
  DEFAULT_LLM_REQUEST_TIMEOUT_SECONDS,
  DEFAULT_BLACKLIST_RULES,
  DEFAULT_QUICK_INPUTS,
  applySystemConfigSeeds,
  createDefaultConfig,
  extensionConfigSchema,
  getEnabledCompleteModels,
  isModelConfigComplete,
  normalizeParallelModelSelections,
  resolvePromptTabParallelModelIds,
  sanitizeParallelModelIds,
} from '../../../src/domain/config/config-schema';

describe('config schema', () => {
  it('统一配置与快照版本常量', () => {
    expect(CONFIG_SCHEMA_VERSION).toBe(SYNC_SNAPSHOT_SCHEMA_VERSION);
  });

  it('生成默认配置时写入版本和基础字段', () => {
    const config = createDefaultConfig({ updatedAt: 123 });

    expect(config.version).toBe(CONFIG_SCHEMA_VERSION);
    expect(config.updatedAt).toBe(123);
    expect(config.basic.defaultModelId).toBeNull();
    expect(config.basic.parallelModelIds).toEqual([]);
    expect(config.basic.extractionPanelHeight).toBe(DEFAULT_EXTRACTION_PANEL_HEIGHT);
    expect(config.basic.extractionTextFontSize).toBe(DEFAULT_EXTRACTION_TEXT_FONT_SIZE);
    expect(config.basic.llmRequestTimeoutSeconds).toBe(DEFAULT_LLM_REQUEST_TIMEOUT_SECONDS);
    expect(config.basic.jinaApiKey).toBe('');
    expect(config.basic.jinaResponseTemplate).toBe(DEFAULT_JINA_RESPONSE_TEMPLATE);
    expect(config.models).toEqual([]);
    expect(config.quickInputs.map((item) => item.id)).toEqual(DEFAULT_QUICK_INPUTS.map((item) => item.id));
    expect(config.blacklist.map((item) => item.id)).toEqual(DEFAULT_BLACKLIST_RULES.map((item) => item.id));
  });

  it('旧配置缺少 parallelModelIds、提取参数和模型调用超时时 parse 后自动补默认值', () => {
    const config = extensionConfigSchema.parse({
      ...createDefaultConfig(),
      basic: {
        ...createDefaultConfig().basic,
        llmRequestTimeoutSeconds: undefined,
      },
      quickInputs: [
        {
          id: 'quick-1',
          name: '总结',
          prompt: '请总结当前页面',
          autoTrigger: false,
          modelId: null,
          order: 0,
          deletedAt: null,
        },
      ],
    });

    expect(config.basic.parallelModelIds).toEqual([]);
    expect(config.basic.extractionPanelHeight).toBe(DEFAULT_EXTRACTION_PANEL_HEIGHT);
    expect(config.basic.extractionTextFontSize).toBe(DEFAULT_EXTRACTION_TEXT_FONT_SIZE);
    expect(config.basic.llmRequestTimeoutSeconds).toBe(DEFAULT_LLM_REQUEST_TIMEOUT_SECONDS);
    expect(config.basic.jinaApiKey).toBe('');
    expect(config.basic.jinaResponseTemplate).toBe(DEFAULT_JINA_RESPONSE_TEMPLATE);
    expect(config.quickInputs[0]?.parallelModelIds).toEqual([]);
  });

  it('旧配置缺少 sync 字段或其子字段时 parse 后自动补默认值', () => {
    const legacyWithoutSync = {
      ...createDefaultConfig(),
    } as Record<string, unknown>;
    delete legacyWithoutSync.sync;

    const parsedWithoutSync = extensionConfigSchema.parse(legacyWithoutSync);
    expect(parsedWithoutSync.sync).toEqual({
      enabled: false,
      provider: 'none',
      gistToken: '',
      gistId: '',
      webdavUrl: '',
      webdavUsername: '',
      webdavPassword: '',
      lastSyncAt: null,
    });

    const parsedWithPartialSync = extensionConfigSchema.parse({
      ...createDefaultConfig(),
      sync: {
        enabled: true,
        provider: 'gist',
        gistToken: 'token',
      },
    });

    expect(parsedWithPartialSync.sync).toEqual({
      enabled: true,
      provider: 'gist',
      gistToken: 'token',
      gistId: '',
      webdavUrl: '',
      webdavUsername: '',
      webdavPassword: '',
      lastSyncAt: null,
    });
  });

  it('会给旧配置补齐缺失的系统快捷输入和黑名单规则，但不覆盖已有项', () => {
    const firstQuickInput = DEFAULT_QUICK_INPUTS[0];
    const firstBlacklistRule = DEFAULT_BLACKLIST_RULES[0];
    if (!firstQuickInput || !firstBlacklistRule) {
      throw new Error('missing default seed');
    }

    const seededConfig = applySystemConfigSeeds(
      createDefaultConfig({
        quickInputs: [
          {
            ...firstQuickInput,
            name: '我自己的概括',
            order: 0,
          },
        ],
        blacklist: [
          {
            ...firstBlacklistRule,
            enabled: false,
          },
        ],
      }),
    );

    expect(seededConfig.quickInputs).toHaveLength(DEFAULT_QUICK_INPUTS.length);
    expect(seededConfig.quickInputs[0]?.name).toBe('我自己的概括');
    expect(seededConfig.blacklist).toHaveLength(DEFAULT_BLACKLIST_RULES.length);
    expect(seededConfig.blacklist[0]?.enabled).toBe(false);
  });

  it('过滤软删除和不完整模型', () => {
    expect(
      isModelConfigComplete({
        id: 'kept',
        name: 'Kept',
        provider: 'openai-compatible',
        enabled: true,
        model: 'gpt-4.1-mini',
        baseUrl: 'https://api.example.com',
        apiKey: 'key',
        deployment: '',
        temperature: 1,
        tools: [],
        thinkingBudget: null,
        maxOutputTokens: null,
        order: 0,
        deletedAt: null,
        supportsImages: true,
      }),
    ).toBe(true);

    expect(
      isModelConfigComplete({
        id: 'deleted',
        name: 'Deleted',
        provider: 'openai-compatible',
        enabled: true,
        model: 'gpt-4.1-mini',
        baseUrl: 'https://api.example.com',
        apiKey: 'key',
        deployment: '',
        temperature: 1,
        tools: [],
        thinkingBudget: null,
        maxOutputTokens: null,
        order: 1,
        deletedAt: 10,
        supportsImages: false,
      }),
    ).toBe(false);

    const config = createDefaultConfig({
      models: [
          {
            id: 'kept',
            name: 'Kept',
            provider: 'openai-compatible',
          enabled: true,
          model: 'gpt-4.1-mini',
          baseUrl: 'https://api.example.com',
          apiKey: 'key',
          deployment: '',
          temperature: 1,
          tools: [],
          thinkingBudget: null,
            maxOutputTokens: null,
            order: 0,
            deletedAt: null,
            supportsImages: true,
          },
          {
            id: 'skipped',
            name: 'Skipped',
          provider: 'gemini',
          enabled: false,
          model: 'gemini-2.5-flash',
          baseUrl: '',
          apiKey: 'key',
          deployment: '',
          temperature: 1,
          tools: [],
          thinkingBudget: null,
            maxOutputTokens: null,
            order: 1,
            deletedAt: null,
            supportsImages: false,
          },
        ],
      });

    expect(getEnabledCompleteModels(config).map((item) => item.id)).toEqual(['kept']);
  });

  it('parse 后保留显式图片能力字段', () => {
    const config = createDefaultConfig({
      models: [
        {
          id: 'm1',
          name: '图片模型',
          provider: 'openai-compatible',
          enabled: true,
          model: 'gpt-4.1-mini',
          baseUrl: 'https://api.example.com',
          apiKey: 'key',
          deployment: '',
          temperature: 1,
          tools: [],
          thinkingBudget: null,
          maxOutputTokens: null,
          order: 0,
          deletedAt: null,
          supportsImages: true,
        },
      ],
    });

    const parsed = extensionConfigSchema.parse(config);

    expect(parsed.models[0]?.supportsImages).toBe(true);
  });

  it('旧配置缺少 supportsImages 时 parse 后默认补 false', () => {
    const config = extensionConfigSchema.parse({
      ...createDefaultConfig(),
      models: [
        {
          id: 'legacy',
          name: 'Legacy',
          provider: 'openai-compatible',
          enabled: true,
          model: 'gpt-4.1-mini',
          baseUrl: 'https://api.example.com',
          apiKey: 'key',
          deployment: '',
          temperature: 1,
          tools: [],
          thinkingBudget: null,
          maxOutputTokens: null,
          order: 0,
          deletedAt: null,
        },
      ],
    });

    expect(config.models[0]?.supportsImages).toBe(false);
  });

  it('拒绝重复 models 稳定 id 和错误 provider 字段', () => {
    expect(
      extensionConfigSchema.safeParse({
        ...createDefaultConfig(),
        models: [
          {
            id: 'm1',
            name: 'A',
            provider: 'openai-compatible',
            enabled: true,
            model: 'gpt-4.1-mini',
            baseUrl: 'https://api.example.com',
            apiKey: 'key',
            deployment: '',
            temperature: 1,
            tools: [],
            thinkingBudget: null,
            maxOutputTokens: null,
            order: 0,
            deletedAt: null,
            supportsImages: false,
          },
          {
            id: 'm1',
            name: 'B',
            provider: 'gemini',
            enabled: true,
            model: 'gemini-2.5-flash',
            baseUrl: '',
            apiKey: 'key',
            deployment: '',
            temperature: 1,
            tools: [],
            thinkingBudget: null,
            maxOutputTokens: null,
            order: 1,
            deletedAt: null,
            supportsImages: false,
          },
        ],
      }).success,
    ).toBe(false);

    expect(
      extensionConfigSchema.safeParse({
        ...createDefaultConfig(),
        models: [
          {
            id: 'm2',
            name: 'B',
            provider: 'azure-openai',
            enabled: true,
            model: '',
            baseUrl: '',
            apiKey: 'key',
            deployment: '',
            temperature: 1,
            tools: [],
            thinkingBudget: null,
            maxOutputTokens: null,
            order: 0,
            deletedAt: null,
            supportsImages: false,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('拒绝重复 quickInputs 稳定 id', () => {
    expect(
      extensionConfigSchema.safeParse({
        ...createDefaultConfig(),
        quickInputs: [
          {
            id: 'q1',
            name: 'Summarize',
            prompt: 'Summarize the page',
            autoTrigger: false,
            modelId: null,
            order: 0,
            deletedAt: null,
          },
          {
            id: 'q1',
            name: 'Translate',
            prompt: 'Translate the page',
            autoTrigger: false,
            modelId: null,
            order: 1,
            deletedAt: null,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('拒绝重复 blacklist 稳定 id', () => {
    expect(
      extensionConfigSchema.safeParse({
        ...createDefaultConfig(),
        blacklist: [
          {
            id: 'b1',
            type: 'domain',
            pattern: 'example.com',
            enabled: true,
            deletedAt: null,
          },
          {
            id: 'b1',
            type: 'url-prefix',
            pattern: 'https://example.com/private',
            enabled: true,
            deletedAt: null,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('会过滤失效或重复的并行模型引用，并按快捷输入合并全局与专属配置', () => {
    const config = createDefaultConfig({
      basic: {
        ...createDefaultConfig().basic,
        parallelModelIds: ['model-1', 'model-2', 'model-1', 'missing-model'],
      },
      models: [
        {
          id: 'model-1',
          name: '主模型',
          provider: 'openai-compatible',
          enabled: true,
          model: 'gpt-4.1-mini',
          baseUrl: 'https://api.example.com',
          apiKey: 'key',
          deployment: '',
          temperature: 1,
          tools: [],
          thinkingBudget: null,
          maxOutputTokens: null,
          order: 0,
          deletedAt: null,
          supportsImages: false,
        },
        {
          id: 'model-2',
          name: '备用模型',
          provider: 'gemini',
          enabled: true,
          model: 'gemini-2.5-flash',
          baseUrl: '',
          apiKey: 'key',
          deployment: '',
          temperature: 1,
          tools: [],
          thinkingBudget: null,
          maxOutputTokens: null,
          order: 1,
          deletedAt: null,
          supportsImages: false,
        },
        {
          id: 'model-3',
          name: '第三模型',
          provider: 'anthropic',
          enabled: true,
          model: 'claude-3-5-sonnet',
          baseUrl: '',
          apiKey: 'key',
          deployment: '',
          temperature: 1,
          tools: [],
          thinkingBudget: null,
          maxOutputTokens: null,
          order: 2,
          deletedAt: null,
          supportsImages: false,
        },
      ],
      quickInputs: [
        {
          id: 'quick-1',
          name: '总结',
          prompt: '请总结当前页面',
          autoTrigger: false,
          modelId: null,
          parallelModelIds: ['model-3', 'model-2', 'missing-model'],
          order: 0,
          deletedAt: null,
        },
      ],
    });

    expect(sanitizeParallelModelIds(config, ['model-1', 'missing-model', 'model-1', 'model-2'])).toEqual(['model-1', 'model-2']);
    expect(normalizeParallelModelSelections(config).basic.parallelModelIds).toEqual(['model-1', 'model-2']);
    expect(normalizeParallelModelSelections(config).quickInputs[0]?.parallelModelIds).toEqual(['model-3', 'model-2']);
    expect(resolvePromptTabParallelModelIds(config, 'chat')).toEqual([]);
    expect(resolvePromptTabParallelModelIds(config, 'quick-1')).toEqual(['model-1', 'model-2', 'model-3']);
  });

  it('构造稳定 storage key', () => {
    expect(CONFIG_STORAGE_KEY).toBe('config:extension');
    expect(PAGE_STORAGE_PREFIX).toBe('page:');
    expect(CONVERSATION_STORAGE_PREFIX).toBe('conversation:');
    expect(LOADING_STORAGE_PREFIX).toBe('loading:');
    expect(buildConfigStorageKey()).toBe(CONFIG_STORAGE_KEY);
    expect(buildPageStorageKey('https://example.com')).toBe('page:https://example.com');
    expect(buildConversationStorageKey('https://example.com', 'chat')).toBe(
      'conversation:https://example.com:chat',
    );
    expect(buildLoadingStorageKey('https://example.com', 'chat')).toBe(
      'loading:https://example.com:chat',
    );
  });
});
