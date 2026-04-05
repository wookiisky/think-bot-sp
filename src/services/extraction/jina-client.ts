import { DEFAULT_JINA_RESPONSE_TEMPLATE } from '../../domain/config/config-schema';

type JinaExtractOptions = {
  /** Jina 可选 API Key。 */
  apiKey?: string;
  /** Jina 响应模板。 */
  responseTemplate?: string;
};

/** 将 Jina 原始响应套入用户模板。 */
export const applyJinaResponseTemplate = (content: string, template: string): string => {
  const normalizedTemplate = template.trim();
  if (!normalizedTemplate) {
    return content;
  }

  if (normalizedTemplate.includes('{{content}}')) {
    return normalizedTemplate.replaceAll('{{content}}', content);
  }

  return `${normalizedTemplate}\n\n${content}`;
};

/** Jina Reader 客户端。 */
export const createJinaClient = ({ fetcher = fetch }: { fetcher?: typeof fetch } = {}) => ({
  /** 按页面 URL 请求 Jina Reader。 */
  async extract(pageUrl: string, options: JinaExtractOptions = {}): Promise<string> {
    const apiKey = options.apiKey?.trim() ?? '';
    const response = await fetcher(
      `https://r.jina.ai/http://${new URL(pageUrl).host}${new URL(pageUrl).pathname}${new URL(pageUrl).search}`,
      apiKey
        ? {
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          }
        : undefined,
    );
    if (!response.ok) {
      throw new Error(`jina request failed: ${response.status}`);
    }

    return applyJinaResponseTemplate(
      await response.text(),
      options.responseTemplate ?? DEFAULT_JINA_RESPONSE_TEMPLATE,
    );
  },
});
