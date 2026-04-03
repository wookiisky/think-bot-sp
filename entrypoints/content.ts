/// <reference types="chrome" />

import { defineContentScript } from 'wxt/utils/define-content-script';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      if (typeof message !== 'object' || message === null || (message as { type?: string }).type !== 'COLLECT_PAGE_SOURCE') {
        return false;
      }

      const faviconUrl = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href ?? '';

      sendResponse({
        url: location.href,
        title: document.title,
        html: document.documentElement.outerHTML,
        text: document.body?.innerText ?? '',
        faviconUrl,
      });
      return true;
    });
  },
});
