import type { CSSProperties } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

import type { AssistantMarkdownDisplayConfig } from '../../domain/config/assistant-markdown-display-config';
import { cn } from '../../lib/utils';

type MarkdownTextNode = {
  type: 'text';
  value: string;
  position?: {
    start?: {
      offset?: number;
    };
    end?: {
      offset?: number;
    };
  };
};

type MarkdownParentNode = {
  type: string;
  children?: MarkdownNode[];
};

type MarkdownNode = MarkdownTextNode | MarkdownParentNode;

type MarkdownFile = {
  value?: unknown;
};

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

/** 计算助手正文紧凑但不重叠的行高。 */
const resolveBodyLineHeightPx = (fontSizePx: number) => Math.max(18, Math.ceil(fontSizePx * 1.25));

const cjkQuotedStrongPattern = /\*\*([“‘"《（【「『][^*\n]*?[”’"》）】」』])\*\*/g;
const escapableMarkdownPunctuationPattern = /^[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]$/;

const isMarkdownTextNode = (node: MarkdownNode): node is MarkdownTextNode => node.type === 'text' && 'value' in node;

const createSourceMap = (sourceSegment: string, value: string): number[] => {
  const sourceIndexes: number[] = [];
  let textIndex = 0;

  for (let sourceIndex = 0; sourceIndex < sourceSegment.length && textIndex < value.length; sourceIndex += 1) {
    if (
      sourceSegment[sourceIndex] === '\\' &&
      sourceSegment[sourceIndex + 1] === value[textIndex] &&
      escapableMarkdownPunctuationPattern.test(sourceSegment[sourceIndex + 1] ?? '')
    ) {
      sourceIndex += 1;
    }

    if (sourceSegment[sourceIndex] === value[textIndex]) {
      sourceIndexes[textIndex] = sourceIndex;
      textIndex += 1;
    }
  }

  return sourceIndexes;
};

const isUnescapedStrongMatch = (
  matchIndex: number,
  matchText: string,
  sourceSegment: string,
  sourceIndexes: number[],
) => {
  const openingSourceIndex = sourceIndexes[matchIndex];
  const closingSourceIndex = sourceIndexes[matchIndex + matchText.length - 2];

  return (
    openingSourceIndex !== undefined &&
    closingSourceIndex !== undefined &&
    sourceSegment.slice(openingSourceIndex, openingSourceIndex + 2) === '**' &&
    sourceSegment.slice(closingSourceIndex, closingSourceIndex + 2) === '**'
  );
};

const splitCjkQuotedStrongText = (node: MarkdownTextNode, source: string): MarkdownNode[] => {
  const { value, position } = node;
  const startOffset = position?.start?.offset;
  const endOffset = position?.end?.offset;

  if (startOffset === undefined || endOffset === undefined) {
    return [node];
  }

  const sourceSegment = source.slice(startOffset, endOffset);
  const sourceIndexes = createSourceMap(sourceSegment, value);
  const nodes: MarkdownNode[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(cjkQuotedStrongPattern)) {
    const matchText = match[0];
    const strongText = match[1];
    const matchIndex = match.index;

    if (matchIndex === undefined || strongText === undefined) {
      continue;
    }

    if (!isUnescapedStrongMatch(matchIndex, matchText, sourceSegment, sourceIndexes)) {
      continue;
    }

    if (matchIndex > lastIndex) {
      nodes.push({ type: 'text', value: value.slice(lastIndex, matchIndex) });
    }

    nodes.push({ type: 'strong', children: [{ type: 'text', value: strongText }] });
    lastIndex = matchIndex + matchText.length;
  }

  if (lastIndex === 0) {
    return [{ type: 'text', value }];
  }

  if (lastIndex < value.length) {
    nodes.push({ type: 'text', value: value.slice(lastIndex) });
  }

  return nodes;
};

const restoreCjkQuotedStrong = (node: MarkdownNode, source: string) => {
  if (!('children' in node) || !node.children) {
    return;
  }

  const children: MarkdownNode[] = [];

  for (const child of node.children) {
    if (isMarkdownTextNode(child)) {
      children.push(...splitCjkQuotedStrongText(child, source));
      continue;
    }

    restoreCjkQuotedStrong(child, source);
    children.push(child);
  }

  node.children = children;
};

const remarkCjkQuotedStrong = () => (tree: MarkdownNode, file: MarkdownFile) => {
  restoreCjkQuotedStrong(tree, typeof file.value === 'string' ? file.value : '');
};

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

/** 生成 Markdown 正文的行内样式。 */
const createBodyInlineStyle = (styleConfig: AssistantMarkdownDisplayConfig['body']): CSSProperties => ({
  ...createInlineStyle(styleConfig, 400),
  lineHeight: `${resolveBodyLineHeightPx(styleConfig.fontSizePx)}px`,
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
            className="mb-1.5 mt-3 leading-tight first:mt-0"
            style={createInlineStyle(assistantDisplayConfig.h1, 700)}
          >
            {children}
          </h1>
        ),
        h2: ({ children, ...props }) => (
          <h2
            {...props}
            className="mb-1.5 mt-3 leading-tight first:mt-0"
            style={createInlineStyle(assistantDisplayConfig.h2, 700)}
          >
            {children}
          </h2>
        ),
        h3: ({ children, ...props }) => (
          <h3
            {...props}
            className="mb-1 mt-2.5 leading-tight first:mt-0"
            style={createInlineStyle(assistantDisplayConfig.h3, 600)}
          >
            {children}
          </h3>
        ),
        h4: ({ children, ...props }) => (
          <h4
            {...props}
            className="mb-1 mt-2.5 leading-tight first:mt-0"
            style={createInlineStyle(assistantDisplayConfig.h4, 600)}
          >
            {children}
          </h4>
        ),
        p: ({ children, ...props }) => (
          <p {...props} className="whitespace-pre-wrap" style={createBodyInlineStyle(assistantDisplayConfig.body)}>
            {children}
          </p>
        ),
      }
    : undefined;

  return (
    <div
      className={cn(
        'text-sm leading-[18px] break-words [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-orange-500 [&_blockquote]:pl-2.5 [&_blockquote]:text-muted-foreground [&_blockquote]:italic [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_li]:mt-0.5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-4.5 [&_p+_p]:mt-1 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:bg-muted/60 [&_pre]:p-2.5 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4.5',
        className,
      )}
    >
      <ReactMarkdown rehypePlugins={[rehypeSanitize]} remarkPlugins={[remarkGfm, remarkCjkQuotedStrong]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
};
