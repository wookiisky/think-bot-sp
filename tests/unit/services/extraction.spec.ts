import { describe, expect, it, vi } from 'vitest';

import { createContentSource } from '../../../src/services/extraction/content-source';
import { createExtractionService } from '../../../src/services/extraction/extraction-service';
import { applyJinaResponseTemplate, createJinaClient } from '../../../src/services/extraction/jina-client';

describe('extraction service', () => {
  it('优先使用 content script 预提取的 Readability Markdown', async () => {
    const jinaClient = {
      extract: vi.fn(),
    };
    const pageRepository = {
      saveExtractionResult: vi.fn(async (value) => value),
    };
    const service = createExtractionService({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      contentSource: {
        collect: vi.fn().mockResolvedValue({
          url: 'https://example.com/article',
          title: 'Example',
          html: '<article><h1>Title</h1><p>Body</p></article>',
          text: 'Title Body',
          faviconUrl: '',
          readabilityContent: '# Title\n\nBody',
          readabilityTitle: 'Title',
        }),
      },
      readabilityExtractor: {
        extract: vi.fn(),
      },
      jinaClient,
      pageRepository,
    });

    const result = await service.extractPage({
      tabId: 7,
      pageUrl: 'https://example.com/article',
      method: 'readability',
      jinaApiKey: '',
      jinaResponseTemplate: '{{content}}',
    });

    expect(result).toMatchObject({
      extractionMethod: 'readability',
      content: '# Title\n\nBody',
      title: 'Title',
    });
    expect(pageRepository.saveExtractionResult).toHaveBeenCalledTimes(1);
    expect(jinaClient.extract).not.toHaveBeenCalled();
  });

  it('Readability 成功时不走 Jina 回退', async () => {
    const jinaClient = {
      extract: vi.fn(),
    };
    const pageRepository = {
      saveExtractionResult: vi.fn(async (value) => value),
    };
    const service = createExtractionService({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      contentSource: {
        collect: vi.fn().mockResolvedValue({
          url: 'https://example.com/article',
          title: 'Example',
          html: '<article><h1>Title</h1><p>Body</p></article>',
          text: 'Title Body',
          faviconUrl: '',
        }),
      },
      readabilityExtractor: {
        extract: vi.fn().mockReturnValue({
          content: 'Title\n\nBody',
          title: 'Title',
        }),
      },
      jinaClient,
      pageRepository,
    });

    const result = await service.extractPage({
      tabId: 7,
      pageUrl: 'https://example.com/article',
      method: 'readability',
      jinaApiKey: '',
      jinaResponseTemplate: '{{content}}',
    });

    expect(result).toMatchObject({
      extractionMethod: 'readability',
      content: 'Title\n\nBody',
    });
    expect(jinaClient.extract).not.toHaveBeenCalled();
    expect(pageRepository.saveExtractionResult).toHaveBeenCalledTimes(1);
  });

  it('Readability 失败后不回退到 Jina', async () => {
    const jinaClient = {
      extract: vi.fn().mockResolvedValue('Jina body'),
    };
    const pageRepository = {
      saveExtractionResult: vi.fn(async (value) => value),
    };
    const service = createExtractionService({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      contentSource: {
        collect: vi.fn().mockResolvedValue({
          url: 'https://example.com/article',
          title: 'Example',
          html: '<html><body><div>fallback</div></body></html>',
          text: 'fallback',
          faviconUrl: '',
        }),
      },
      readabilityExtractor: {
        extract: vi.fn().mockReturnValue(null),
      },
      jinaClient,
      pageRepository,
    });

    await expect(
      service.extractPage({
        tabId: 7,
        pageUrl: 'https://example.com/article',
        method: 'readability',
        jinaApiKey: '',
        jinaResponseTemplate: '{{content}}',
      }),
    ).rejects.toThrow(/readability extraction failed/i);
    expect(jinaClient.extract).not.toHaveBeenCalled();
    expect(pageRepository.saveExtractionResult).not.toHaveBeenCalled();
  });

  it('Jina 方法只请求 Jina 并写入 Jina 结果', async () => {
    const jinaClient = {
      extract: vi.fn().mockResolvedValue('Jina body'),
    };
    const pageRepository = {
      saveExtractionResult: vi.fn(async (value) => value),
    };
    const service = createExtractionService({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      contentSource: {
        collect: vi.fn().mockResolvedValue({
          url: 'https://example.com/article',
          title: 'Example',
          html: '<html><body><div>jina</div></body></html>',
          text: 'jina',
          faviconUrl: '',
        }),
      },
      readabilityExtractor: {
        extract: vi.fn(),
      },
      jinaClient,
      pageRepository,
    });

    await expect(
      service.extractPage({
        tabId: 7,
        pageUrl: 'https://example.com/article',
        method: 'jina',
        jinaApiKey: '',
        jinaResponseTemplate: '{{content}}',
      }),
    ).resolves.toMatchObject({
      extractionMethod: 'jina',
      content: 'Jina body',
    });
    expect(jinaClient.extract).toHaveBeenCalledWith('https://example.com/article', {
      apiKey: '',
      responseTemplate: '{{content}}',
    });
  });

  it('空 HTML 直接失败，不向 Jina 发送空内容', async () => {
    const jinaClient = {
      extract: vi.fn(),
    };
    const service = createExtractionService({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      contentSource: {
        collect: vi.fn().mockResolvedValue({
          url: 'https://example.com/article',
          title: 'Empty',
          html: '   ',
          text: '',
          faviconUrl: '',
        }),
      },
      readabilityExtractor: {
        extract: vi.fn(),
      },
      jinaClient,
      pageRepository: {
        saveExtractionResult: vi.fn(),
      },
    });

    await expect(
      service.extractPage({
        tabId: 7,
        pageUrl: 'https://example.com/article',
        method: 'readability',
        jinaApiKey: '',
        jinaResponseTemplate: '{{content}}',
      }),
    ).rejects.toThrow(/empty html/i);
    expect(jinaClient.extract).not.toHaveBeenCalled();
  });
});

describe('jina client', () => {
  it('支持把原始响应套入模板', () => {
    expect(applyJinaResponseTemplate('正文', '摘要开始\n{{content}}\n摘要结束')).toBe('摘要开始\n正文\n摘要结束');
    expect(applyJinaResponseTemplate('正文', '前缀')).toBe('前缀\n\n正文');
  });

  it('配置了 API Key 时会带鉴权头并套用模板', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '原始正文',
    });
    const client = createJinaClient({ fetcher });

    await expect(
      client.extract('https://example.com/article?foo=bar', {
        apiKey: 'jina-key',
        responseTemplate: '包装\n{{content}}',
      }),
    ).resolves.toBe('包装\n原始正文');

    expect(fetcher).toHaveBeenCalledWith('https://r.jina.ai/http://example.com/article?foo=bar', {
      headers: {
        Authorization: 'Bearer jina-key',
      },
    });
  });
});

describe('content source', () => {
  it('content script 未连接时回退到 executeScript 直接采集页面内容', async () => {
    const sendMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error('Could not establish connection. Receiving end does not exist.'))
      .mockResolvedValueOnce({
        url: 'https://example.com/article',
        title: 'Injected',
        html: '<article><p>Injected</p></article>',
        text: 'Injected',
        faviconUrl: '',
      });
    const executeScript = vi.fn().mockResolvedValue(undefined);
    const contentSource = createContentSource({
      tabs: {
        executeScript,
        reload: vi.fn(),
        sendMessage,
      },
    });

    await expect(contentSource.collect({ tabId: 7 })).resolves.toMatchObject({
      title: 'Injected',
      text: 'Injected',
    });
    expect(executeScript).toHaveBeenCalledWith(7);
  });

  it('content script 未连接时自动刷新一次再重试', async () => {
    const sendMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error('Could not establish connection. Receiving end does not exist.'))
      .mockResolvedValueOnce({
        url: 'https://example.com/article',
        title: 'Example',
        html: '<article><p>Recovered</p></article>',
        text: 'Recovered',
        faviconUrl: '',
      });
    const reload = vi.fn().mockResolvedValue(undefined);
    const contentSource = createContentSource({
      tabs: {
        executeScript: vi.fn().mockRejectedValue(new Error('executeScript failed')),
        reload,
        sendMessage,
      },
    });

    await expect(contentSource.collect({ tabId: 7 })).resolves.toMatchObject({
      text: 'Recovered',
    });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });
});
