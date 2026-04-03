import { describe, expect, it } from 'vitest';

import { EXTENSION_PAGES } from '../../../src/shared/extension-pages';

describe('extension pages', () => {
  it('side panel 页面不使用 WXT 保留的 sidepanel.html 命名，避免构建时被自动写入全局 default_path', () => {
    expect(EXTENSION_PAGES.sidePanel).not.toBe('sidepanel.html');
    expect(EXTENSION_PAGES.sidePanel).not.toMatch(/(^|\/)sidepanel\.html$/);
    expect(EXTENSION_PAGES.sidePanel).not.toMatch(/\.sidepanel\.html$/);
  });
});
