import { createContext, memo, useContext, type CSSProperties, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

import type {
  AssistantMarkdownDisplayConfig,
  AssistantMarkdownTextStyle,
} from '../../domain/config/assistant-markdown-display-config';
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
  styleConfig: AssistantMarkdownTextStyle,
  fontWeight: CSSProperties['fontWeight'],
): CSSProperties => ({
  fontSize: `${styleConfig.fontSizePx}px`,
  color: styleConfig.color,
  textDecoration: resolveTextDecoration(styleConfig.underline),
  fontWeight,
});

/** 生成 Markdown 正文或列表项的行内样式。 */
const createBodyInlineStyle = (styleConfig: AssistantMarkdownTextStyle): CSSProperties => ({
  ...createInlineStyle(styleConfig, 400),
  lineHeight: `${resolveBodyLineHeightPx(styleConfig.fontSizePx)}px`,
});

const AssistantDisplayContext = createContext<AssistantMarkdownDisplayConfig | undefined>(undefined);

/** 标记当前是否处于列表项内部，松散列表里的段落需要继承列表项样式而不是正文样式。 */
const ListItemContext = createContext(false);

/** 标记当前是否处于标题内部，标题里的粗体跟随标题色，不套用正文粗体色。 */
const HeadingContext = createContext(false);

/** 标题内容统一包一层 HeadingContext，避免四个标题组件各写一遍。 */
const HeadingChildren = ({ children }: { children: ReactNode }) => (
  <HeadingContext.Provider value={true}>{children}</HeadingContext.Provider>
);

/** 元素类型保持稳定，展示设置通过 context 更新，不重新解析正文。 */
const markdownComponents: Components = {
  h1: function MarkdownH1({ node: _node, children, ...props }) {
    const config = useContext(AssistantDisplayContext);
    return (
      <h1
        {...props}
        className={config ? 'mb-1.5 mt-3 leading-tight first:mt-0' : undefined}
        style={config ? createInlineStyle(config.h1, 700) : undefined}
      >
        <HeadingChildren>{children}</HeadingChildren>
      </h1>
    );
  },
  h2: function MarkdownH2({ node: _node, children, ...props }) {
    const config = useContext(AssistantDisplayContext);
    return (
      <h2
        {...props}
        className={config ? 'mb-1.5 mt-3 leading-tight first:mt-0' : undefined}
        style={config ? createInlineStyle(config.h2, 700) : undefined}
      >
        <HeadingChildren>{children}</HeadingChildren>
      </h2>
    );
  },
  h3: function MarkdownH3({ node: _node, children, ...props }) {
    const config = useContext(AssistantDisplayContext);
    return (
      <h3
        {...props}
        className={config ? 'mb-1 mt-2.5 leading-tight first:mt-0' : undefined}
        style={config ? createInlineStyle(config.h3, 600) : undefined}
      >
        <HeadingChildren>{children}</HeadingChildren>
      </h3>
    );
  },
  h4: function MarkdownH4({ node: _node, children, ...props }) {
    const config = useContext(AssistantDisplayContext);
    return (
      <h4
        {...props}
        className={config ? 'mb-1 mt-2.5 leading-tight first:mt-0' : undefined}
        style={config ? createInlineStyle(config.h4, 600) : undefined}
      >
        <HeadingChildren>{children}</HeadingChildren>
      </h4>
    );
  },
  p: function MarkdownParagraph({ node: _node, children, ...props }) {
    const config = useContext(AssistantDisplayContext);
    const insideListItem = useContext(ListItemContext);
    return (
      <p
        {...props}
        className={config ? 'whitespace-pre-wrap' : undefined}
        style={config && !insideListItem ? createBodyInlineStyle(config.body) : undefined}
      >
        {children}
      </p>
    );
  },
  li: function MarkdownListItem({ node: _node, children, ...props }) {
    const config = useContext(AssistantDisplayContext);
    return (
      <li {...props} style={config ? createBodyInlineStyle(config.list) : undefined}>
        <ListItemContext.Provider value={true}>{children}</ListItemContext.Provider>
      </li>
    );
  },
  strong: function MarkdownStrong({ node: _node, children, ...props }) {
    const config = useContext(AssistantDisplayContext);
    const insideHeading = useContext(HeadingContext);
    return (
      <strong {...props} style={config && !insideHeading ? { color: config.strong.color } : undefined}>
        {children}
      </strong>
    );
  },
};

/** 只有正文变化时才重新执行 Markdown 解析和清理。 */
const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown rehypePlugins={[rehypeSanitize]} remarkPlugins={[remarkGfm, remarkCjkQuotedStrong]} components={markdownComponents}>
      {content}
    </ReactMarkdown>
  );
});

/** 聊天消息 Markdown 渲染器。 */
export const ChatMarkdown = memo(function ChatMarkdown({ content, className, assistantDisplayConfig }: ChatMarkdownProps) {
  if (!content.trim()) {
    return null;
  }

  return (
    <div
      className={cn(
        'text-sm leading-[18px] break-words [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-orange-500 [&_blockquote]:px-2.5 [&_blockquote]:py-1 [&_blockquote]:text-muted-foreground [&_blockquote]:italic [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_li]:mt-0.5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-4.5 [&_p+_p]:mt-1 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:bg-muted/60 [&_pre]:p-2.5 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4.5',
        className,
      )}
    >
      <AssistantDisplayContext.Provider value={assistantDisplayConfig}>
        <MarkdownContent content={content} />
      </AssistantDisplayContext.Provider>
    </div>
  );
});
