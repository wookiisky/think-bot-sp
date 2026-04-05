import { describe, expect, it } from 'vitest';

import type { ExtensionConfig } from '../../../src/domain/config/config-schema';
import { DEFAULT_BLACKLIST_RULES, DEFAULT_QUICK_INPUTS, createDefaultConfig } from '../../../src/domain/config/config-schema';
import { createChromeLocalAdapter } from '../../../src/repositories/chrome-local-adapter';
import { createConfigRepository } from '../../../src/repositories/config-repository';
import { CONFIG_STORAGE_KEY } from '../../../src/shared/storage-keys';
import { createFakeStorageArea } from '../../helpers/fake-storage';

describe('config-repository', () => {
  it('跨实例读写一致', async () => {
    const storage = createFakeStorageArea();
    const repoA = createConfigRepository(createChromeLocalAdapter(storage));
    const repoB = createConfigRepository(createChromeLocalAdapter(storage));
    const nextConfig = createDefaultConfig({
      basic: {
        theme: 'dark',
        language: 'en',
        defaultModelId: null,
        systemPrompt: '',
        filterCot: false,
        extractionMethod: 'readability',
        includePageContentByDefault: true,
      },
    });

    await repoA.saveConfig(nextConfig);

    await expect(repoB.getConfig()).resolves.toMatchObject({
      basic: {
        theme: 'dark',
        language: 'en',
      },
    });
  });

  it('非法导入不污染旧配置', async () => {
    const storage = createFakeStorageArea();
    const repo = createConfigRepository(createChromeLocalAdapter(storage));
    const oldConfig = createDefaultConfig();

    await repo.saveConfig(oldConfig);

    await expect(repo.importConfig('{"version":"0.0.0"}')).rejects.toThrow(/unsupported/i);
    await expect(repo.getConfig()).resolves.toMatchObject({
      ...oldConfig,
      updatedAt: expect.any(Number),
    });
  });

  it('读取旧配置时会补齐缺失的系统快捷输入和黑名单规则', async () => {
    const storage = createFakeStorageArea();
    const repo = createConfigRepository(createChromeLocalAdapter(storage));
    const oldConfig = createDefaultConfig({
      quickInputs: [
        {
          id: 'custom-quick',
          name: '自定义',
          prompt: '自定义 prompt',
          autoTrigger: false,
          modelId: null,
          branchModelIds: [],
          order: 0,
          deletedAt: null,
        },
      ],
      blacklist: [],
    });

    await storage.set({ [CONFIG_STORAGE_KEY]: oldConfig });

    const config = await repo.getConfig();

    expect(config.quickInputs.map((item) => item.id)).toContain('custom-quick');
    expect(config.quickInputs.map((item) => item.id)).toEqual(
      expect.arrayContaining(DEFAULT_QUICK_INPUTS.map((item) => item.id)),
    );
    expect(config.blacklist.map((item) => item.id)).toEqual(DEFAULT_BLACKLIST_RULES.map((item) => item.id));
  });

  it('保存非法黑名单正则时直接拒绝', async () => {
    const storage = createFakeStorageArea();
    const repo = createConfigRepository(createChromeLocalAdapter(storage));

    await expect(
      repo.saveConfig(
        createDefaultConfig({
          blacklist: [
            {
              id: 'broken-regex',
              type: 'regex',
              pattern: '[',
              enabled: true,
              deletedAt: null,
            },
          ],
        }),
      ),
    ).rejects.toThrow(/正则表达式无效/);
  });

  it('saveConfig 需要完整配置契约', async () => {
    const storage = createFakeStorageArea();
    const repo = createConfigRepository(createChromeLocalAdapter(storage));
    const partialConfig = {
      basic: {
        theme: 'dark',
      },
    } as Partial<ExtensionConfig>;

    // eslint-disable-next-line no-constant-condition
    if (false) {
      // @ts-expect-error saveConfig 只接受完整配置，不接受局部对象
      await repo.saveConfig(partialConfig);
    }

    await expect(repo.saveConfig(createDefaultConfig())).resolves.toMatchObject({
      version: expect.any(String),
    });
  });

  it('getModelById 返回目标模型，未命中时返回 null', async () => {
    const storage = createFakeStorageArea();
    const repo = createConfigRepository(createChromeLocalAdapter(storage));

    await repo.saveConfig(
      createDefaultConfig({
        models: [
          {
            id: 'm1',
            name: 'Model A',
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
            supportsImages: true,
            order: 0,
            deletedAt: null,
          },
        ],
      }),
    );

    await expect(repo.getModelById('m1')).resolves.toMatchObject({
      id: 'm1',
      name: 'Model A',
      supportsImages: true,
    });
    await expect(repo.getModelById('missing')).resolves.toBeNull();
  });

  it('updateSyncMetadata 只刷新最近同步时间，不抬高配置 updatedAt', async () => {
    const storage = createFakeStorageArea();
    const repo = createConfigRepository(createChromeLocalAdapter(storage));

    await storage.set({
      [CONFIG_STORAGE_KEY]: createDefaultConfig({
        updatedAt: 123,
        sync: {
          enabled: true,
          provider: 'gist',
          gistToken: 'token',
          gistId: 'gist-id',
          webdavUrl: '',
          webdavUsername: '',
          webdavPassword: '',
          lastSyncAt: 10,
        },
      }),
    });

    const next = await repo.updateSyncMetadata(456);

    expect(next.updatedAt).toBe(123);
    expect(next.sync.lastSyncAt).toBe(456);
  });
});
