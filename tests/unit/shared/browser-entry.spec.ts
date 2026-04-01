import { describe, expect, it } from 'vitest';

import { isRestrictedUrl, resolveWelcomeLocale } from '../../../src/shared/browser-entry';

describe('browser-entry helpers', () => {
  it('treats chrome internal pages as restricted', () => {
    expect(isRestrictedUrl('chrome://extensions')).toBe(true);
    expect(isRestrictedUrl('chrome-extension://abc/options.html')).toBe(true);
    expect(isRestrictedUrl('https://example.com')).toBe(false);
  });

  it('maps ui locale into supported welcome locales', () => {
    expect(resolveWelcomeLocale('zh-CN')).toBe('zh-CN');
    expect(resolveWelcomeLocale('zh-TW')).toBe('zh-CN');
    expect(resolveWelcomeLocale('en-US')).toBe('en');
    expect(resolveWelcomeLocale('fr-FR')).toBe('en');
  });
});
