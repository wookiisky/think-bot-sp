import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

import { cn } from '../../lib/utils';

type ChatMarkdownProps = {
  /** 原始 Markdown 内容。 */
  content: string;
  /** 额外样式类名。 */
  className?: string;
};

  /** 聊天消息 Markdown 渲染器。 */
export const ChatMarkdown = ({ content, className }: ChatMarkdownProps) => {
  if (!content.trim()) {
    return <span className="text-sm leading-5 text-muted-foreground">...</span>;
  }

  return (
    <div
      className={cn(
        'text-sm leading-5 break-words [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-2.5 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_li]:mt-0.5 [&_ol]:list-decimal [&_ol]:pl-4.5 [&_p]:whitespace-pre-wrap [&_p+_p]:mt-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:bg-muted/60 [&_pre]:p-2.5 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:list-disc [&_ul]:pl-4.5',
        className,
      )}
    >
      <ReactMarkdown rehypePlugins={[rehypeSanitize]} remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
};
