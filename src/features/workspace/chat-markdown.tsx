import type { CSSProperties } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

import type { AssistantMarkdownDisplayConfig } from '../../domain/config/assistant-markdown-display-config';
import { cn } from '../../lib/utils';

type ChatMarkdownProps = {
  /** 原始 Markdown 内容。 */
  content: string;
  /** 额外样式类名。 */
  className?: string;
  /** 助手消息 Markdown 展示配置。 */
  assistantDisplayConfig?: AssistantMarkdownDisplayConfig;
};

/** 把下划线布尔值映射成文本装饰值。 */
const resolveTextDecoration = (underline: boolean) => (underline ? 'underline' : 'none');

/** 生成单个 Markdown 层级的行内样式。 */
const createInlineStyle = (
  styleConfig: AssistantMarkdownDisplayConfig[keyof AssistantMarkdownDisplayConfig],
  fontWeight: CSSProperties['fontWeight'],
): CSSProperties => ({
  fontSize: `${styleConfig.fontSizePx}px`,
  color: styleConfig.color,
  textDecoration: resolveTextDecoration(styleConfig.underline),
  fontWeight,
});

/** 聊天消息 Markdown 渲染器。 */
export const ChatMarkdown = ({ content, className, assistantDisplayConfig }: ChatMarkdownProps) => {
  if (!content.trim()) {
    return null;
  }

  const components: Components | undefined = assistantDisplayConfig
    ? {
        h1: ({ children, ...props }) => (
          <h1
            {...props}
            className="mb-3 mt-4 leading-tight first:mt-0"
            style={createInlineStyle(assistantDisplayConfig.h1, 700)}
          >
            {children}
          </h1>
        ),
        h2: ({ children, ...props }) => (
          <h2
            {...props}
            className="mb-3 mt-4 leading-tight first:mt-0"
            style={createInlineStyle(assistantDisplayConfig.h2, 700)}
          >
            {children}
          </h2>
        ),
        h3: ({ children, ...props }) => (
          <h3
            {...props}
            className="mb-2 mt-4 leading-tight first:mt-0"
            style={createInlineStyle(assistantDisplayConfig.h3, 600)}
          >
            {children}
          </h3>
        ),
        h4: ({ children, ...props }) => (
          <h4
            {...props}
            className="mb-2 mt-4 leading-tight first:mt-0"
            style={createInlineStyle(assistantDisplayConfig.h4, 600)}
          >
            {children}
          </h4>
        ),
        p: ({ children, ...props }) => (
          <p {...props} className="whitespace-pre-wrap" style={createInlineStyle(assistantDisplayConfig.body, 400)}>
            {children}
          </p>
        ),
      }
    : undefined;

  return (
    <div
      className={cn(
        'text-sm leading-5 break-words [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-2.5 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_li]:mt-0.5 [&_ol]:list-decimal [&_ol]:pl-4.5 [&_p+_p]:mt-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:bg-muted/60 [&_pre]:p-2.5 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:list-disc [&_ul]:pl-4.5',
        className,
      )}
    >
      <ReactMarkdown rehypePlugins={[rehypeSanitize]} remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
};
