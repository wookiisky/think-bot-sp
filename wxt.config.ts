import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

/** 开发态扩展页既要连本地 HMR，也不能拦住真实远端请求。 */
export const appendDevExtensionConnectSrc = (extensionPagesCsp: string): string => {
  const directives = extensionPagesCsp
    .split(';')
    .map((directive) => directive.trim())
    .filter((directive) => directive.length > 0);
  const connectSrcDirectiveIndex = directives.findIndex((directive) =>
    directive.startsWith('connect-src '),
  );
  const requiredSources = ["'self'", 'http:', 'https:', 'ws:', 'wss:'];

  if (connectSrcDirectiveIndex === -1) {
    directives.push(`connect-src ${requiredSources.join(' ')}`);

    return `${directives.join('; ')};`;
  }

  const directiveParts = directives[connectSrcDirectiveIndex].split(/\s+/);
  const nextDirectiveParts = [...directiveParts];
  const existingSources = new Set(directiveParts.slice(1));

  for (const source of requiredSources) {
    if (!existingSources.has(source)) {
      nextDirectiveParts.push(source);
      existingSources.add(source);
    }
  }

  directives[connectSrcDirectiveIndex] = nextDirectiveParts.join(' ');

  return `${directives.join('; ')};`;
};

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  webExt: {
    // 当前环境里自动拉起 Chromium 会让 dev 进程提前退出，改成手动加载扩展以保留 watch。
    disabled: true,
  },
  hooks: {
    'vite:devServer:extendConfig': (config) => {
      config.server ??= {};
      config.server.watch = {
        ...(config.server.watch ?? {}),
        // 当前环境里的文件事件监听不稳定，开发时退回轮询以确保保存后重建。
        usePolling: true,
        interval: 200,
      };
    },
    'build:manifestGenerated': (wxt, manifest) => {
      if (wxt.config.command !== 'serve') {
        return;
      }

      const extensionPagesCsp = manifest.content_security_policy?.extension_pages;
      if (!extensionPagesCsp) {
        return;
      }

      manifest.content_security_policy = {
        ...manifest.content_security_policy,
        extension_pages: appendDevExtensionConnectSrc(extensionPagesCsp),
      };
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
  }),
  manifest: {
    permissions: [
      'storage',
      'sidePanel',
      'activeTab',
      'scripting',
      'downloads',
      'contextMenus',
      'unlimitedStorage',
    ],
    host_permissions: [
      'http://*/*',
      'https://*/*',
      'https://r.jina.ai/*',
    ],
    action: {
      default_title: 'think-bot-sp',
    },
  },
});
