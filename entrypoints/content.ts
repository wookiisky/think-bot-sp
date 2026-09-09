/// <reference types="chrome" />

import { defineContentScript } from 'wxt/utils/define-content-script';

import type { PageSource } from '../src/services/extraction/page-source';
import { extractReadabilityMarkdown } from '../src/services/extraction/readability-markdown';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      if (typeof message !== 'object' || message === null || (message as { type?: string }).type !== 'COLLECT_PAGE_SOURCE') {
        return false;
      }

      const method = (message as { method?: unknown }).method;
      if (method !== 'readability' && method !== 'jina') {
        return false;
      }

      const source: PageSource = {
        url: location.href,
        title: document.title,
        faviconUrl: document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href ?? '',
      };
      if (method === 'readability') {
        try {
          source.readability = extractReadabilityMarkdown(document.cloneNode(true) as Document);
        } catch {
          // 正文提取失败也返回元数据，由后台统一报告提取失败。
          source.readability = null;
        }
      }

      sendResponse(source);
      return true;
    });
  },
});
