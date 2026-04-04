import { describe, expect, it } from 'vitest';

import type { ExtensionConfig } from '../../../src/domain/config/config-schema';
import { createDefaultConfig } from '../../../src/domain/config/config-schema';
import { createChromeLocalAdapter } from '../../../src/repositories/chrome-local-adapter';
import { createConfigRepository } from '../../../src/repositories/config-repository';
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

  it('saveConfig 需要完整配置契约', async () => {
    const storage = createFakeStorageArea();
    const repo = createConfigRepository(createChromeLocalAdapter(storage));
    const partialConfig = {
      basic: {
        theme: 'dark',
      },
    } as Partial<ExtensionConfig>;

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
});
