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
    await expect(repo.getConfig()).resolves.toEqual(oldConfig);
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
});
