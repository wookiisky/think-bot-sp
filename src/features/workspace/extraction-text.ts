/** 归一化提取区 Markdown 纯文本，统一移除空行。 */
export const normalizeExtractionText = (content: string) =>
  content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .join('\n')
    .trim();
