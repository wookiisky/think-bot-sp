import { normalizePageUrl } from '../../domain/page/page-schema';

type ExtractionMethod = 'readability' | 'jina';

type PageSource = {
  /** 页面 URL。 */
  url: string;
  /** 页面标题。 */
  title: string;
  /** 页面 HTML。 */
  html: string;
  /** 页面纯文本。 */
  text: string;
  /** 页面 favicon。 */
  faviconUrl: string;
  /** content script 内预提取的 Readability Markdown。 */
  readabilityContent?: string;
  /** content script 内预提取的 Readability 标题。 */
  readabilityTitle?: string;
};

type ExtractionLogger = {
  /** 记录信息日志。 */
  info: LoggerMethod;
  /** 记录警告日志。 */
  warn: LoggerMethod;
  /** 记录错误日志。 */
  error: LoggerMethod;
};

type LoggerMethod = (...args: [string, (Record<string, unknown> | undefined)?]) => void;

type ReadabilityResult = {
  /** 提取后的正文。 */
  content: string;
  /** 提取后的标题。 */
  title: string;
};

type ExtractionInput = {
  /** 浏览器标签页 id。 */
  tabId: number;
  /** 页面 URL。 */
  pageUrl: string;
  /** 当前提取方法。 */
  method: ExtractionMethod;
  /** Jina 可选 API Key。 */
  jinaApiKey: string;
  /** Jina 响应模板。 */
  jinaResponseTemplate: string;
};

type SavedExtractionResult = {
  /** 页面归一化 URL。 */
  normalizedUrl: string;
  /** 页面原始 URL。 */
  url: string;
  /** 页面标题。 */
  title: string;
  /** 页面 favicon。 */
  faviconUrl: string;
  /** 正文内容。 */
  content: string;
  /** 实际使用的提取方法。 */
  extractionMethod: ExtractionMethod;
};

type ExtractionDependencies = {
  /** 结构化日志。 */
  logger: ExtractionLogger;
  /** 页面源采集器。 */
  contentSource: {
    collect: (...args: [{ tabId: number }]) => Promise<PageSource>;
  };
  /** Readability 提取器。 */
  readabilityExtractor: {
    extract: (...args: [string, string]) => ReadabilityResult | null;
  };
  /** Jina 客户端。 */
  jinaClient: {
    extract: (...args: [string, { apiKey?: string; responseTemplate?: string }?]) => Promise<string>;
  };
  /** 页面仓储。 */
  pageRepository: {
    saveExtractionResult: (...args: [SavedExtractionResult]) => Promise<SavedExtractionResult>;
  };
};

/** 创建提取服务，统一收口 Readability 优先和 Jina 回退。 */
export const createExtractionService = (dependencies: ExtractionDependencies) => {
  const { logger, contentSource, readabilityExtractor, jinaClient, pageRepository } = dependencies;

  return {
    /** 采集页面内容并写回页面仓储。 */
    async extractPage(input: ExtractionInput): Promise<SavedExtractionResult> {
      const pageSource = await contentSource.collect({ tabId: input.tabId });
      const normalizedUrl = normalizePageUrl(pageSource.url);

      if (!pageSource.html.trim()) {
        throw new Error('empty html');
      }

      logger.info('extraction.started', {
        tabId: input.tabId,
        normalizedUrl,
        method: input.method,
      });

      if (input.method === 'readability') {
        if (pageSource.readabilityContent?.trim()) {
          return pageRepository.saveExtractionResult({
            normalizedUrl,
            url: pageSource.url,
            title: pageSource.readabilityTitle?.trim() || pageSource.title,
            faviconUrl: pageSource.faviconUrl,
            content: pageSource.readabilityContent,
            extractionMethod: 'readability',
          });
        }

        const parsed = readabilityExtractor.extract(pageSource.html, pageSource.url);
        if (parsed?.content.trim()) {
          return pageRepository.saveExtractionResult({
            normalizedUrl,
            url: pageSource.url,
            title: parsed.title || pageSource.title,
            faviconUrl: pageSource.faviconUrl,
            content: parsed.content,
            extractionMethod: 'readability',
          });
        }

        logger.warn('extraction.readability_failed', {
          tabId: input.tabId,
          normalizedUrl,
        });
      }

      logger.info('extraction.jina_fallback_started', {
        tabId: input.tabId,
        normalizedUrl,
      });
      const content = await jinaClient.extract(pageSource.url, {
        apiKey: input.jinaApiKey,
        responseTemplate: input.jinaResponseTemplate,
      });
      return pageRepository.saveExtractionResult({
        normalizedUrl,
        url: pageSource.url,
        title: pageSource.title,
        faviconUrl: pageSource.faviconUrl,
        content,
        extractionMethod: 'jina',
      });
    },
  };
};
