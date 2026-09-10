import { cleanup, render, screen } from '@testing-library/react';
import ReactMarkdown from 'react-markdown';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_ASSISTANT_MARKDOWN_DISPLAY_CONFIG } from '../../../src/domain/config/assistant-markdown-display-config';
import { ChatMarkdown } from '../../../src/features/workspace/chat-markdown';

vi.mock('react-markdown', async (importOriginal) => {
  const original = await importOriginal<typeof import('react-markdown')>();
  return { ...original, default: vi.fn(original.default) };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ChatMarkdown', () => {
  it('空内容不渲染 Markdown 容器', () => {
    const { container } = render(<ChatMarkdown content="   " />);

    expect(container.firstElementChild).toBeNull();
  });

  it('流式追加正文时保留已有标题和段落节点', () => {
    const content = '# 一级标题\n\n## 二级标题\n\n### 三级标题\n\n#### 四级标题\n\n已有段落';
    const { rerender } = render(
      <ChatMarkdown content={content} assistantDisplayConfig={DEFAULT_ASSISTANT_MARKDOWN_DISPLAY_CONFIG} />,
    );
    const headings = screen.getAllByRole('heading');
    const paragraph = screen.getByText('已有段落');

    rerender(
      <ChatMarkdown content={`${content}追加内容\n\n新段落`} assistantDisplayConfig={DEFAULT_ASSISTANT_MARKDOWN_DISPLAY_CONFIG} />,
    );

    screen.getAllByRole('heading').forEach((heading, index) => {
      expect(heading).toBe(headings[index]);
    });
    expect(screen.getByText('已有段落追加内容')).toBe(paragraph);
    expect(screen.getByText('新段落')).toBeVisible();
  });

  it('容器或展示设置变化时复用正文解析，同时更新样式', () => {
    const content = '# 标题\n\n正文';
    const { rerender } = render(
      <ChatMarkdown content={content} assistantDisplayConfig={DEFAULT_ASSISTANT_MARKDOWN_DISPLAY_CONFIG} />,
    );
    const paragraph = screen.getByText('正文');
    const initialParseCount = vi.mocked(ReactMarkdown).mock.calls.length;

    rerender(
      <ChatMarkdown content={content} className="text-muted-foreground" assistantDisplayConfig={DEFAULT_ASSISTANT_MARKDOWN_DISPLAY_CONFIG} />,
    );
    expect(vi.mocked(ReactMarkdown).mock.calls.length).toBe(initialParseCount);

    rerender(
      <ChatMarkdown
        content={content}
        assistantDisplayConfig={{
          ...DEFAULT_ASSISTANT_MARKDOWN_DISPLAY_CONFIG,
          body: { fontSizePx: 30, color: '#111827', underline: true },
        }}
      />,
    );
    expect(vi.mocked(ReactMarkdown).mock.calls.length).toBe(initialParseCount);
    expect(screen.getByText('正文')).toBe(paragraph);
    expect(paragraph).toHaveStyle({ fontSize: '30px', lineHeight: '38px', textDecoration: 'underline' });

    rerender(<ChatMarkdown content={content} />);
    expect(vi.mocked(ReactMarkdown).mock.calls.length).toBe(initialParseCount);
    expect(screen.getByText('正文')).toBe(paragraph);
    expect(paragraph.style.fontSize).toBe('');
  });

  it('普通 Markdown 使用紧凑的默认行距和块间距', () => {
    const { container } = render(<ChatMarkdown content={'第一段\n\n第二段\n\n- 条目'} />);
    const markdownContainer = container.firstElementChild;

    expect(markdownContainer).not.toBeNull();
    expect(markdownContainer?.className).toContain('leading-[18px]');
    expect(markdownContainer?.className).toContain('[&_p+_p]:mt-1');
    expect(markdownContainer?.className).toContain('[&_ul]:my-1');
    expect(markdownContainer?.className).toContain('[&_ol]:my-1');
  });

  it('会渲染紧贴中文正文的中文引号加粗内容', () => {
    const { container } = render(
      <ChatMarkdown content="* **颠覆性未来**：AI的终极形态绝不是一个**“隐形的基础设施”**。谁还在卷Chatbot。" />,
    );

    const strong = screen.getByText('“隐形的基础设施”');

    expect(strong.tagName).toBe('STRONG');
    expect(screen.getByText('颠覆性未来').tagName).toBe('STRONG');
    expect(container.textContent).not.toContain('**“隐形的基础设施”**');
  });

  it('会保留转义后的中文引号加粗字面量', () => {
    const { container } = render(<ChatMarkdown content={'* \\*\\*“隐形的基础设施”\\*\\*'} />);

    expect(screen.getByText('**“隐形的基础设施”**')).toBeVisible();
    expect(container.querySelector('strong')).toBeNull();
  });

  it('引用使用橙色边线和斜体样式', () => {
    const { container } = render(<ChatMarkdown content="> 引用内容" />);
    const markdownContainer = container.firstElementChild;
    const blockquote = screen.getByText('引用内容').closest('blockquote');

    expect(blockquote).not.toBeNull();
    expect(markdownContainer?.className).toContain('[&_blockquote]:border-orange-500');
    expect(markdownContainer?.className).toContain('[&_blockquote]:italic');
    expect(markdownContainer?.className).toContain('[&_blockquote]:px-2.5');
    expect(markdownContainer?.className).toContain('[&_blockquote]:py-1');
  });

  it('助手标题保留配置样式并使用更紧凑的标题间距', () => {
    render(
      <ChatMarkdown
        content={'# 一级标题\n\n### 三级标题\n\n正文'}
        assistantDisplayConfig={{
          ...DEFAULT_ASSISTANT_MARKDOWN_DISPLAY_CONFIG,
          h1: {
            fontSizePx: 30,
            color: '#1d4ed8',
            underline: true,
          },
          h3: {
            fontSizePx: 20,
            color: '#16a34a',
            underline: false,
          },
        }}
      />,
    );

    const h1 = screen.getByRole('heading', { name: '一级标题', level: 1 });
    const h3 = screen.getByRole('heading', { name: '三级标题', level: 3 });

    expect(h1.className).toContain('mb-1.5');
    expect(h1.className).toContain('mt-3');
    expect(h1).toHaveStyle({
      fontSize: '30px',
      color: 'rgb(29, 78, 216)',
      textDecoration: 'underline',
    });
    expect(h3.className).toContain('mb-1');
    expect(h3.className).toContain('mt-2.5');
    expect(h3).toHaveStyle({
      fontSize: '20px',
      color: 'rgb(22, 163, 74)',
      textDecoration: 'none',
    });
  });

  it('助手列表项和正文粗体按展示配置渲染，标题内粗体跟随标题色，松散列表段落跟随列表项样式', () => {
    const { container } = render(
      <ChatMarkdown
        content={'# 标题含**标题粗体**\n\n正文含**粗体**\n\n- 紧凑列表项\n\n- 松散列表项\n\n  第二段'}
        assistantDisplayConfig={{
          ...DEFAULT_ASSISTANT_MARKDOWN_DISPLAY_CONFIG,
          body: { fontSizePx: 16, color: '#111827', underline: false },
          list: { fontSizePx: 20, color: '#0f766e', underline: true },
          strong: { color: '#be123c' },
        }}
      />,
    );

    const listItems = container.querySelectorAll('li');
    expect(listItems).toHaveLength(2);
    expect(listItems[0]).toHaveStyle({
      fontSize: '20px',
      lineHeight: '25px',
      color: 'rgb(15, 118, 110)',
      textDecoration: 'underline',
    });

    const loosePargraph = screen.getByText('松散列表项');
    expect(loosePargraph.tagName).toBe('P');
    expect(loosePargraph.style.fontSize).toBe('');
    expect(screen.getByText('第二段').style.fontSize).toBe('');

    const strong = screen.getByText('粗体');
    expect(strong.tagName).toBe('STRONG');
    expect(strong).toHaveStyle({ color: 'rgb(190, 18, 60)' });
    expect(strong.closest('p')).toHaveStyle({ fontSize: '16px' });

    const headingStrong = screen.getByText('标题粗体');
    expect(headingStrong.tagName).toBe('STRONG');
    expect(headingStrong.style.color).toBe('');
  });

  it('助手正文默认字号 16px 使用 20px 行高', () => {
    render(<ChatMarkdown content="正文" assistantDisplayConfig={DEFAULT_ASSISTANT_MARKDOWN_DISPLAY_CONFIG} />);

    expect(screen.getByText('正文')).toHaveStyle({
      fontSize: '16px',
      lineHeight: '20px',
    });
  });

  it('助手正文大字号会计算安全行高，避免多行文本重叠', () => {
    render(
      <ChatMarkdown
        content="大字号正文"
        assistantDisplayConfig={{
          ...DEFAULT_ASSISTANT_MARKDOWN_DISPLAY_CONFIG,
          body: {
            fontSizePx: 30,
            color: '#111827',
            underline: false,
          },
        }}
      />,
    );

    expect(screen.getByText('大字号正文')).toHaveStyle({
      fontSize: '30px',
      lineHeight: '38px',
    });
  });
});
