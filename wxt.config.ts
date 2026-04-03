import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
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
    },
    side_panel: {
      default_path: 'sidepanel.html'
    }
  }
});
