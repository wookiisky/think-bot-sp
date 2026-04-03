import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import config from '../../wxt.config';

describe('wxt manifest config', () => {
  it('设置页通过 options 入口的 manifest 元信息声明独立 tab 打开', () => {
    const optionsHtml = fs.readFileSync(
      path.resolve(__dirname, '../../entrypoints/options/index.html'),
      'utf8',
    );

    expect(optionsHtml).toContain('<meta name="manifest.open_in_tab" content="true" />');
    expect(config.manifest?.options_ui).toBeUndefined();
    expect(config.manifest?.options_page).toBeUndefined();
  });

  it('side panel 不声明全局 default_path，避免切换 browserTab 后继续常驻显示', () => {
    expect(config.manifest?.side_panel).toBeUndefined();
  });
});
