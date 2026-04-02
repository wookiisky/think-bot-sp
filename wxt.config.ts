import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
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
    action: {
      default_title: 'think-bot-sp'
    },
    options_page: 'options.html',
    side_panel: {
      default_path: 'side-panel.html'
    }
  }
});
