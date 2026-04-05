import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';

type ReadabilityMarkdownResult = {
  /** Markdown 正文。 */
  content: string;
  /** 提取标题。 */
  title: string;
};

const markdownConverter = new TurndownService({
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  headingStyle: 'atx',
});

/** 收敛 Markdown 空白，避免正文区出现过多空行。 */
const normalizeMarkdown = (content: string) => content.replace(/\n{3,}/g, '\n\n').trim();

/** 从页面文档提取 Readability Markdown。 */
export const extractReadabilityMarkdown = (documentClone: Document): ReadabilityMarkdownResult | null => {
  const article = new Readability(documentClone).parse();
  if (!article?.content?.trim()) {
    return null;
  }

  const content = normalizeMarkdown(markdownConverter.turndown(article.content));
  if (!content) {
    return null;
  }

  return {
    content,
    title: article.title?.trim() || documentClone.title.trim(),
  };
};
