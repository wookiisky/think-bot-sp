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
  createDefaultConfig,
  extensionConfigSchema,
  getEnabledCompleteModels,
  isModelConfigComplete,
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
    expect(config.models).toEqual([]);
    expect(config.quickInputs).toEqual([]);
    expect(config.blacklist).toEqual([]);
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
        },
      ],
    });

    expect(getEnabledCompleteModels(config).map((item) => item.id)).toEqual(['kept']);
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
