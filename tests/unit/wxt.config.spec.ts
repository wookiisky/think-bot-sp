import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import config, { appendDevExtensionConnectSrc } from '../../wxt.config';

/** 读取当前测试覆盖的静态 manifest 配置。 */
const getStaticManifest = () => {
  const manifest = config.manifest;
  if (!manifest || typeof manifest === 'function' || 'then' in manifest) {
    throw new Error('expected static manifest config');
  }

  return manifest;
};

describe('wxt manifest config', () => {
  it('设置页通过 options 入口的 manifest 元信息声明独立 tab 打开', () => {
    const optionsHtml = fs.readFileSync(
      path.resolve(__dirname, '../../entrypoints/options/index.html'),
      'utf8',
    );

    expect(optionsHtml).toContain('<meta name="manifest.open_in_tab" content="true" />');
    const manifest = getStaticManifest();
    expect(manifest.options_ui).toBeUndefined();
    expect(manifest.options_page).toBeUndefined();
  });

  it('side panel 不声明全局 default_path，避免切换 browserTab 后继续常驻显示', () => {
    const manifest = getStaticManifest();
    expect(manifest.side_panel).toBeUndefined();
  });

  it('开发态扩展页同时放行本地 HMR 和远端网络请求', () => {
    const nextCsp = appendDevExtensionConnectSrc(
      "script-src 'self' 'wasm-unsafe-eval' http://localhost:3001; object-src 'self';",
    );

    expect(nextCsp).toContain("script-src 'self' 'wasm-unsafe-eval' http://localhost:3001");
    expect(nextCsp).toContain("connect-src 'self' http: https: ws: wss:");
    expect(nextCsp).toContain("object-src 'self'");
  });

  it('已有 connect-src 时补齐缺失协议且不重复追加已有来源', () => {
    const nextCsp = appendDevExtensionConnectSrc(
      "script-src 'self'; connect-src 'self' https: wss:; object-src 'self';",
    );

    expect(nextCsp).toContain("connect-src 'self' https: wss: http: ws:");
    expect(nextCsp.match(/connect-src 'self'/g)).toHaveLength(1);
    expect(nextCsp.match(/https:/g)).toHaveLength(1);
    expect(nextCsp.match(/wss:/g)).toHaveLength(1);
  });
});
