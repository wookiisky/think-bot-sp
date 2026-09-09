import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import contentScript from '../../../entrypoints/content';
import { createContentSource } from '../../../src/services/extraction/content-source';
import { createExtractionService } from '../../../src/services/extraction/extraction-service';
import { applyJinaResponseTemplate, createJinaClient } from '../../../src/services/extraction/jina-client';
import { extractReadabilityMarkdown } from '../../../src/services/extraction/readability-markdown';

vi.mock('wxt/utils/define-content-script', () => ({ defineContentScript: (definition: unknown) => definition }));
vi.mock('../../../src/services/extraction/readability-markdown', () => ({ extractReadabilityMarkdown: vi.fn() }));

const metadata = { url: 'https://example.com/article', title: 'Example', faviconUrl: '' };
const extractionInput = {
  tabId: 7,
  pageUrl: metadata.url,
  method: 'readability' as const,
  jinaApiKey: '',
  jinaResponseTemplate: '{{content}}',
};
const setupService = () => {
  const contentSource = { collect: vi.fn().mockResolvedValue(metadata) };
  const jinaClient = { extract: vi.fn().mockResolvedValue('Jina body') };
  const pageRepository = { saveExtractionResult: vi.fn(async (value) => value) };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    contentSource, jinaClient, pageRepository, logger,
    service: createExtractionService({ logger, contentSource, jinaClient, pageRepository }),
  };
};

describe('extraction service', () => {
  it('使用 content script 返回的 Readability Markdown，只请求所选方法', async () => {
    const { service, contentSource, jinaClient, pageRepository } = setupService();
    contentSource.collect.mockResolvedValue({ ...metadata, readability: { content: '# Title\n\nBody', title: 'Title' } });

    await expect(service.extractPage(extractionInput)).resolves.toMatchObject({
      extractionMethod: 'readability', content: '# Title\n\nBody', title: 'Title',
    });
    expect(contentSource.collect).toHaveBeenCalledWith({ tabId: 7, method: 'readability' });
    expect(pageRepository.saveExtractionResult).toHaveBeenCalledTimes(1);
    expect(jinaClient.extract).not.toHaveBeenCalled();
  });

  it('Readability 没有标题时使用页面标题', async () => {
    const { service, contentSource } = setupService();
    contentSource.collect.mockResolvedValue({ ...metadata, readability: { content: 'Body', title: '  ' } });
    await expect(service.extractPage(extractionInput)).resolves.toMatchObject({ title: 'Example' });
  });

  it.each([null, undefined, { content: '   ', title: 'Title' }])('Readability 无正文时失败，不回退 Jina 或保存结果：%s', async (readability) => {
    const { service, contentSource, jinaClient, pageRepository, logger } = setupService();
    contentSource.collect.mockResolvedValue({ ...metadata, readability });
    await expect(service.extractPage(extractionInput)).rejects.toThrow('readability extraction failed');
    expect(logger.warn).toHaveBeenCalledWith('extraction.readability_failed', expect.any(Object));
    expect(jinaClient.extract).not.toHaveBeenCalled();
    expect(pageRepository.saveExtractionResult).not.toHaveBeenCalled();
  });

  it('Jina 只需要页面元数据，不依赖 HTML、纯文本或 Readability 正文', async () => {
    const { service, contentSource, jinaClient } = setupService();
    await expect(service.extractPage({ ...extractionInput, method: 'jina' })).resolves.toMatchObject({
      extractionMethod: 'jina', content: 'Jina body',
    });
    expect(contentSource.collect).toHaveBeenCalledWith({ tabId: 7, method: 'jina' });
    expect(jinaClient.extract).toHaveBeenCalledWith(metadata.url, { apiKey: '', responseTemplate: '{{content}}' });
  });

  it('Jina 请求失败时不保存结果', async () => {
    const { service, jinaClient, pageRepository } = setupService();
    jinaClient.extract.mockRejectedValue(new Error('jina request failed: 503'));
    await expect(service.extractPage({ ...extractionInput, method: 'jina' })).rejects.toThrow('jina request failed: 503');
    expect(pageRepository.saveExtractionResult).not.toHaveBeenCalled();
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
  it.each(['readability', 'jina'] as const)('在请求消息中传递 %s 方法', async (method) => {
    const sendMessage = vi.fn().mockResolvedValue(metadata);
    const tabs = { sendMessage, executeScript: vi.fn(), reload: vi.fn() };
    await expect(createContentSource({ tabs }).collect({ tabId: 7, method })).resolves.toEqual(metadata);
    expect(sendMessage).toHaveBeenCalledWith(7, { type: 'COLLECT_PAGE_SOURCE', method });
    expect(tabs.executeScript).not.toHaveBeenCalled();
    expect(tabs.reload).not.toHaveBeenCalled();
  });

  it('content script 未连接时注入脚本，并保留方法重试', async () => {
    const sendMessage = vi.fn()
      .mockRejectedValueOnce(new Error('Could not establish connection. Receiving end does not exist.'))
      .mockResolvedValueOnce(metadata);
    const tabs = { sendMessage, executeScript: vi.fn().mockResolvedValue(undefined), reload: vi.fn() };
    await expect(createContentSource({ tabs }).collect({ tabId: 7, method: 'readability' })).resolves.toEqual(metadata);
    expect(tabs.executeScript).toHaveBeenCalledWith(7);
    expect(tabs.reload).not.toHaveBeenCalled();
    expect(sendMessage.mock.calls).toEqual([
      [7, { type: 'COLLECT_PAGE_SOURCE', method: 'readability' }],
      [7, { type: 'COLLECT_PAGE_SOURCE', method: 'readability' }],
    ]);
  });

  it('注入失败时自动刷新一次，重试仍使用 Jina 方法', async () => {
    const sendMessage = vi.fn()
      .mockRejectedValueOnce(new Error('Could not establish connection. Receiving end does not exist.'))
      .mockResolvedValueOnce(metadata);
    const tabs = {
      sendMessage,
      executeScript: vi.fn().mockRejectedValue(new Error('executeScript failed')),
      reload: vi.fn().mockResolvedValue(undefined),
    };
    await expect(createContentSource({ tabs }).collect({ tabId: 7, method: 'jina' })).resolves.toEqual(metadata);
    expect(tabs.reload).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenLastCalledWith(7, { type: 'COLLECT_PAGE_SOURCE', method: 'jina' });
  });

  it('页面采集错误直接传递，不刷新标签页', async () => {
    const tabs = {
      sendMessage: vi.fn().mockRejectedValue(new Error('permission denied')),
      executeScript: vi.fn(), reload: vi.fn(),
    };
    await expect(createContentSource({ tabs }).collect({ tabId: 7, method: 'jina' })).rejects.toThrow('permission denied');
    expect(tabs.executeScript).not.toHaveBeenCalled();
    expect(tabs.reload).not.toHaveBeenCalled();
  });
});

describe('content script payload', () => {
  let listener: (message: unknown, sender: unknown, sendResponse: (...args: unknown[]) => void) => boolean;
  beforeEach(() => {
    vi.mocked(extractReadabilityMarkdown).mockReset();
    vi.stubGlobal('chrome', { runtime: { onMessage: { addListener: (callback: typeof listener) => { listener = callback; } } } });
    (contentScript.main as () => void)();
    document.title = 'Current page';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('Jina 消息只返回元数据，不克隆文档或执行 Readability', () => {
    const clone = vi.spyOn(document, 'cloneNode');
    const sendResponse = vi.fn();
    listener({ type: 'COLLECT_PAGE_SOURCE', method: 'jina' }, {}, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith({ url: location.href, title: 'Current page', faviconUrl: '' });
    expect(clone).not.toHaveBeenCalled();
    expect(extractReadabilityMarkdown).not.toHaveBeenCalled();
  });

  it('Readability 消息只返回提取结果和元数据，不传输 HTML 或纯文本副本', () => {
    const readability = { content: '# Article', title: 'Article' };
    vi.mocked(extractReadabilityMarkdown).mockReturnValue(readability);
    const sendResponse = vi.fn();
    listener({ type: 'COLLECT_PAGE_SOURCE', method: 'readability' }, {}, sendResponse);
    expect(extractReadabilityMarkdown).toHaveBeenCalledTimes(1);
    expect(extractReadabilityMarkdown).toHaveBeenCalledWith(expect.any(Document));
    expect(vi.mocked(extractReadabilityMarkdown).mock.calls[0]?.[0]).not.toBe(document);
    expect(sendResponse).toHaveBeenCalledWith({ url: location.href, title: 'Current page', faviconUrl: '', readability });
  });

  it('Readability 抛错时返回明确失败结果，由服务报告错误', () => {
    vi.mocked(extractReadabilityMarkdown).mockImplementation(() => { throw new Error('parse failed'); });
    const sendResponse = vi.fn();
    listener({ type: 'COLLECT_PAGE_SOURCE', method: 'readability' }, {}, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ readability: null }));
  });

  it('忽略缺少方法或未知方法的消息', () => {
    const sendResponse = vi.fn();
    expect(listener({ type: 'COLLECT_PAGE_SOURCE' }, {}, sendResponse)).toBe(false);
    expect(listener({ type: 'COLLECT_PAGE_SOURCE', method: 'other' }, {}, sendResponse)).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
    expect(extractReadabilityMarkdown).not.toHaveBeenCalled();
  });
});
