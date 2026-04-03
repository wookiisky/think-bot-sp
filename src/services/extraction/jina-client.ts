/** Jina Reader 客户端。 */
export const createJinaClient = ({ fetcher = fetch }: { fetcher?: typeof fetch } = {}) => ({
  /** 按页面 URL 请求 Jina Reader。 */
  async extract(pageUrl: string): Promise<string> {
    const response = await fetcher(`https://r.jina.ai/http://${new URL(pageUrl).host}${new URL(pageUrl).pathname}${new URL(pageUrl).search}`);
    if (!response.ok) {
      throw new Error(`jina request failed: ${response.status}`);
    }

    return response.text();
  },
});
