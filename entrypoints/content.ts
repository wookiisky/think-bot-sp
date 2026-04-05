/// <reference types="chrome" />

import { defineContentScript } from 'wxt/utils/define-content-script';

import { extractReadabilityMarkdown } from '../src/services/extraction/readability-markdown';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      if (typeof message !== 'object' || message === null || (message as { type?: string }).type !== 'COLLECT_PAGE_SOURCE') {
        return false;
      }

      const faviconUrl = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href ?? '';
      const readability = extractReadabilityMarkdown(document.cloneNode(true) as Document);

      sendResponse({
        url: location.href,
        title: document.title,
        html: document.documentElement.outerHTML,
        text: document.body?.innerText ?? '',
        faviconUrl,
        readabilityContent: readability?.content ?? '',
        readabilityTitle: readability?.title ?? '',
      });
      return true;
    });
  },
});
