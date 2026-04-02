import { describe, expect, it } from 'vitest';

import { createLocaleRepository } from '../../../src/repositories/locale-repository';

describe('locale-repository', () => {
  it('加载 zh-CN 与 en 资源并保持 key 对齐', async () => {
    const repository = createLocaleRepository();
    const result = await repository.loadResources();

    expect(result.locales).toEqual(['zh-CN', 'en']);
    expect(result.missingKeys).toEqual([]);
    expect(result.t('settings.title', 'zh-CN')).toBe('设置');
    expect(result.t('settings.title', 'en')).toBe('Settings');
  });

  it('按 key 回退查询', async () => {
    const repository = createLocaleRepository();
    const result = await repository.loadResources();

    expect(result.t('not.existing.key', 'en')).toBe('not.existing.key');
    expect(result.t('settings.save', 'en')).toBe('Save');
  });
});
