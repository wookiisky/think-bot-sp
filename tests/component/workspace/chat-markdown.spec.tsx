import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_ASSISTANT_MARKDOWN_DISPLAY_CONFIG } from '../../../src/domain/config/assistant-markdown-display-config';
import { ChatMarkdown } from '../../../src/features/workspace/chat-markdown';

afterEach(() => {
  cleanup();
});

describe('ChatMarkdown', () => {
  it('空内容不渲染 Markdown 容器', () => {
    const { container } = render(<ChatMarkdown content="   " />);

    expect(container.firstElementChild).toBeNull();
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

  it('助手正文默认字号使用 18px 行高', () => {
    render(<ChatMarkdown content="正文" assistantDisplayConfig={DEFAULT_ASSISTANT_MARKDOWN_DISPLAY_CONFIG} />);

    expect(screen.getByText('正文')).toHaveStyle({
      fontSize: '14px',
      lineHeight: '18px',
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
