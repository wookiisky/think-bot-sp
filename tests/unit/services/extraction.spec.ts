import { describe, expect, it, vi } from 'vitest';

import { createContentSource } from '../../../src/services/extraction/content-source';
import { createExtractionService } from '../../../src/services/extraction/extraction-service';

describe('extraction service', () => {
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
    });

    expect(result).toMatchObject({
      extractionMethod: 'readability',
      content: 'Title\n\nBody',
    });
    expect(jinaClient.extract).not.toHaveBeenCalled();
    expect(pageRepository.saveExtractionResult).toHaveBeenCalledTimes(1);
  });

  it('Readability 失败后回退到 Jina', async () => {
    const jinaClient = {
      extract: vi.fn().mockResolvedValue('Jina body'),
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
      pageRepository: {
        saveExtractionResult: vi.fn(async (value) => value),
      },
    });

    await expect(
      service.extractPage({
        tabId: 7,
        pageUrl: 'https://example.com/article',
        method: 'readability',
      }),
    ).resolves.toMatchObject({
      extractionMethod: 'jina',
      content: 'Jina body',
    });
    expect(jinaClient.extract).toHaveBeenCalledWith('https://example.com/article');
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
      }),
    ).rejects.toThrow(/empty html/i);
    expect(jinaClient.extract).not.toHaveBeenCalled();
  });
});

describe('content source', () => {
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
