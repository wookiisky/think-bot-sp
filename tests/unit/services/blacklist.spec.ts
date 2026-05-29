import { describe, expect, it } from 'vitest';

import { DEFAULT_BLACKLIST_RULES } from '../../../src/domain/config/config-schema';
import {
  assertBlacklistRulesPersistable,
  createBlacklistService,
} from '../../../src/services/blacklist/blacklist-service';

describe('blacklist service', () => {
  it('命中启用规则时阻断当前打开行为', () => {
    const service = createBlacklistService({
      rules: [
        {
          id: 'search',
          type: 'domain',
          pattern: 'google.com',
          enabled: true,
          deletedAt: null,
        },
      ],
    });

    expect(service.checkUrl('https://www.google.com/search?q=ai')).toEqual({
      blocked: true,
      matchedRuleId: 'search',
    });
  });

  it('禁用规则和软删除规则不参与阻断', () => {
    const service = createBlacklistService({
      rules: [
        {
          id: 'disabled',
          type: 'domain',
          pattern: 'google.com',
          enabled: false,
          deletedAt: null,
        },
        {
          id: 'deleted',
          type: 'domain',
          pattern: 'bing.com',
          enabled: true,
          deletedAt: 1,
        },
      ],
    });

    expect(service.checkUrl('https://www.google.com/search?q=ai')).toEqual({
      blocked: false,
      matchedRuleId: null,
    });
  });

  it('非法正则规则按阻断处理，避免运行时放过风险页面', () => {
    const service = createBlacklistService({
      rules: [
        {
          id: 'broken-regex',
          type: 'regex',
          pattern: '[',
          enabled: true,
          deletedAt: null,
        },
      ],
    });

    expect(service.checkUrl('https://example.com/article')).toEqual({
      blocked: true,
      matchedRuleId: 'broken-regex',
    });
  });

  it('保存前校验非法正则规则', () => {
    expect(() =>
      assertBlacklistRulesPersistable([
        {
          id: 'broken-regex',
          type: 'regex',
          pattern: '[',
          enabled: true,
          deletedAt: null,
        },
      ]),
    ).toThrow(/正则表达式无效/);
  });

  it('支持测试单条规则与恢复默认规则', () => {
    const firstBuiltInRule = DEFAULT_BLACKLIST_RULES[0];
    if (!firstBuiltInRule) {
      throw new Error('missing built-in blacklist rule');
    }

    const service = createBlacklistService({
      rules: [
        {
          id: 'custom-rule',
          type: 'domain',
          pattern: 'example.com',
          enabled: true,
          deletedAt: null,
        },
        {
          ...firstBuiltInRule,
          enabled: false,
          deletedAt: 10,
        },
      ],
    });

    expect(
      service.testPattern(
        {
          id: 'google',
          type: 'regex',
          pattern: '^https://www\\.google\\.com/search',
          enabled: true,
          deletedAt: null,
        },
        'https://www.google.com/search?q=ai',
      ),
    ).toEqual({
      valid: true,
      matched: true,
      errorMessage: null,
    });

    expect(service.resetDefaults()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'custom-rule',
        }),
        expect.objectContaining({
          id: DEFAULT_BLACKLIST_RULES[0]?.id,
          enabled: true,
          deletedAt: null,
        }),
      ]),
    );
  });
});
