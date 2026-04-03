import { describe, expect, it } from 'vitest';

import { createBlacklistService } from '../../../src/services/blacklist/blacklist-service';

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
});
