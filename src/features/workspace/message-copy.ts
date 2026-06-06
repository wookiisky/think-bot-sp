import removeMarkdown from 'remove-markdown';

/** 复制消息时支持的内容格式。 */
export type MessageCopyMode = 'plain' | 'markdown';

/** 按复制格式生成最终写入剪贴板的内容。 */
export const normalizeMessageCopyContent = (content: string, mode: MessageCopyMode): string => {
  if (mode === 'markdown') {
    return content;
  }

  return removeMarkdown(content)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};
