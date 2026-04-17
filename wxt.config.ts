import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

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
      'unlimitedStorage'
    ],
    host_permissions: [
      'http://*/*',
      'https://*/*',
      'https://r.jina.ai/*'
    ],
    action: {
      default_title: 'think-bot-sp'
    }
  }
});
