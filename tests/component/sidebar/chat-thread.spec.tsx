import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_ASSISTANT_MARKDOWN_DISPLAY_CONFIG } from '../../../src/domain/config/assistant-markdown-display-config';
import { MIN_ASSISTANT_BRANCH_COLUMN_WIDTH } from '../../../src/domain/config/config-schema';
import { ChatThread } from '../../../src/features/sidebar/chat-thread';

const translations: Record<string, string> = {
  'common.cancel': '取消',
  'workspace.emptyMessages': '还没有聊天记录',
  'workspace.status.loading': '生成中',
  'workspace.status.done': '已完成',
  'workspace.status.error': '失败',
  'workspace.status.cancelled': '已停止',
  'workspace.editMessage': '编辑',
  'workspace.editMessageInput': '编辑消息输入',
  'workspace.saveAndResend': '保存并重发',
  'workspace.cancelEdit': '取消',
  'workspace.retryUserMessage': '重试问题',
  'workspace.retryAssistantMessage': '重试回答',
  'workspace.expandBranches': '继续新增分支',
  'workspace.selectBranchModel': '选择模型',
  'workspace.noAvailableBranchModels': '暂无可用模型',
  'workspace.stop': '停止',
  'workspace.stopBranch': '停止分支',
  'workspace.deleteBranch': '删除分支',
  'workspace.selectPrimaryBranch': '设为后续主分支',
  'workspace.openBranchPreview': '打开分支预览',
  'workspace.scrollToMessageTop': '定位到消息顶部',
  'workspace.scrollToMessageBottom': '定位到消息底部',
  'workspace.copyPlainText': '复制纯文本',
  'workspace.copyMarkdown': '复制 Markdown',
  'workspace.notice.copyPlainSuccess': '已复制纯文本',
  'workspace.notice.copyPlainFailed': '复制纯文本失败，请重试',
  'workspace.notice.copyMarkdownSuccess': '已复制 Markdown',
  'workspace.notice.copyMarkdownFailed': '复制 Markdown 失败，请重试',
};

const t = (key: string) => translations[key] ?? key;
let clipboardWriteText: ReturnType<typeof vi.fn>;
let scrollIntoViewSpy: (arg?: Parameters<HTMLElement['scrollIntoView']>[0]) => void;

const createRect = (input: { top: number; bottom: number; left?: number; right?: number; width?: number; height?: number }): DOMRect => {
  const left = input.left ?? 0;
  const width = input.width ?? Math.max((input.right ?? left) - left, 0);
  const height = input.height ?? Math.max(input.bottom - input.top, 0);
  const right = input.right ?? left + width;
  return {
    x: left,
    y: input.top,
    top: input.top,
    bottom: input.bottom,
    left,
    right,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect;
};

const createBaseProps = () => ({
  restoreMessageId: null,
  availableBranchModels: [] as Array<{ id: string; name: string }>,
  editingMessageId: null,
  editingText: '',
  t,
  assistantMarkdownDisplayConfig: DEFAULT_ASSISTANT_MARKDOWN_DISPLAY_CONFIG,
  onStartEdit: vi.fn(),
  onEditingTextChange: vi.fn(),
  onCancelEdit: vi.fn(),
  onSubmitEdit: vi.fn(),
  onRetryUserMessage: vi.fn(),
  onRetryAssistantMessage: vi.fn(),
  onSelectAssistantBranch: vi.fn(),
  onExpandBranches: vi.fn(),
  onStop: vi.fn(),
  onStopBranch: vi.fn(),
  onDeleteBranch: vi.fn(),
  onOpenBranchPreview: vi.fn(),
  onToast: vi.fn(),
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  clipboardWriteText = vi.fn().mockResolvedValue(undefined);
  const nextNavigator = Object.create(globalThis.navigator);
  Object.defineProperty(nextNavigator, 'clipboard', {
    value: {
      writeText: clipboardWriteText,
    },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'navigator', {
    value: nextNavigator,
    configurable: true,
  });
  scrollIntoViewSpy = vi.fn();
  HTMLElement.prototype.scrollIntoView = scrollIntoViewSpy;
});

describe('ChatThread', () => {
  it('助手分支按 Markdown 渲染，头部模型名和预览按钮作为整体居中显示', () => {
    const onOpenBranchPreview = vi.fn();

    render(
      <ChatThread
        {...createBaseProps()}
        onOpenBranchPreview={onOpenBranchPreview}
        messages={[
          {
            id: 'assistant-1',
            role: 'assistant',
            content: '**主回答** [链接](https://example.com)',
            status: 'done',
            errorMessage: null,
            branches: [
              {
                id: 'branch-1',
                modelId: 'model-2',
                modelLabel: '分支模型',
                isPrimary: true,
                content: '**主回答** [链接](https://example.com)\n\n- 分支结果',
                status: 'done',
                errorMessage: null,
              },
            ],
            selectedBranchId: 'branch-1',
          },
        ]}
      />,
    );

    expect(screen.getByText('主回答').tagName).toBe('STRONG');
    expect(screen.getByRole('link', { name: '链接' })).toHaveAttribute('href', 'https://example.com');
    expect(screen.getByText('分支结果')).toBeVisible();
    expect(screen.getByTestId('branch-branch-1')).toHaveTextContent('分支模型');
    expect(screen.getByTestId('chat-message-bubble-assistant-1').className).not.toContain('bg-muted/55');
    expect(screen.getByTestId('chat-message-bubble-assistant-1').className).not.toContain('border');
    expect(screen.getByTestId('chat-message-bubble-assistant-1').className).toContain('bg-background');
    expect(screen.getByTestId('chat-message-bubble-assistant-1').className).toContain('w-full');
    expect(screen.getByTestId('chat-message-bubble-assistant-1').className).not.toContain('px-0.5');
    expect(screen.getByTestId('chat-message-bubble-assistant-1').className).toContain('pr-0');
    expect(screen.getByTestId('branch-branch-1').className).toContain('border-t-2');
    expect(screen.getByTestId('branch-branch-1').className).toContain('border-t-primary');
    expect(screen.getByTestId('branch-branch-1').className).toContain('px-2');
    expect(screen.getByTestId('branch-branch-1').className).toContain('pr-10');
    expect(screen.getByTestId('branch-branch-1').className).not.toContain('px-2.5');
    expect(screen.getByTestId('branch-branch-1').className).not.toContain('border-primary');
    expect(screen.getByTestId('branch-branch-1').className).not.toContain('bg-primary/5');
    expect(screen.queryByText('主分支')).toBeNull();
    expect(screen.queryByText('分支')).toBeNull();
    expect(screen.queryByText('#1')).toBeNull();
    expect(screen.getByTestId('branch-header-branch-1').className).toContain('justify-center');
    expect(screen.getByTestId('branch-header-branch-1').className).toContain('text-[11px]');
    expect(screen.getByTestId('branch-header-branch-1').className).not.toContain('text-xs');
    expect(within(screen.getByTestId('branch-branch-1')).getByRole('button', { name: '打开分支预览' })).toBeVisible();
  });

  it('助手消息 Markdown 会按展示配置渲染标题和正文样式', () => {
    render(
      <ChatThread
        {...createBaseProps()}
        assistantMarkdownDisplayConfig={{
          h1: {
            fontSizePx: 30,
            color: '#1d4ed8',
            underline: true,
          },
          h2: DEFAULT_ASSISTANT_MARKDOWN_DISPLAY_CONFIG.h2,
          h3: DEFAULT_ASSISTANT_MARKDOWN_DISPLAY_CONFIG.h3,
          h4: DEFAULT_ASSISTANT_MARKDOWN_DISPLAY_CONFIG.h4,
          body: {
            fontSizePx: 16,
            color: '#111827',
            underline: false,
          },
        }}
        messages={[
          {
            id: 'assistant-styled',
            role: 'assistant',
            content: '# 标题\n\n正文',
            status: 'done',
            errorMessage: null,
            branches: [],
            selectedBranchId: null,
          },
        ]}
      />,
    );

    expect(screen.getByRole('heading', { name: '标题', level: 1 })).toHaveStyle({
      fontSize: '30px',
      color: 'rgb(29, 78, 216)',
      textDecoration: 'underline',
    });
    expect(screen.getByText('正文')).toHaveStyle({
      fontSize: '16px',
      color: 'rgb(17, 24, 39)',
      textDecoration: 'none',
    });
  });

  it('旧助手消息也统一按分支卡片展示', () => {
    render(
      <ChatThread
        {...createBaseProps()}
        messages={[
          {
            id: 'assistant-legacy',
            role: 'assistant',
            content: '只有主回答',
            status: 'done',
            errorMessage: null,
            branches: [],
            selectedBranchId: null,
          },
        ]}
      />,
    );

    const branchRail = screen.getByTestId('branch-rail-assistant-legacy');
    const branchGrid = branchRail.firstElementChild as HTMLDivElement;
    const branchCard = screen.getByTestId('branch-assistant-legacy:primary');
    expect(branchRail).toHaveAttribute('data-reading-layout', 'single');
    expect(branchRail.className).toContain('overflow-x-hidden');
    expect(screen.queryByTestId('branch-rail-top-scroll-assistant-legacy')).toBeNull();
    expect(branchGrid.className).toContain('w-full');
    expect(branchGrid.getAttribute('style')).toContain('minmax(0, 1fr)');
    expect(branchCard.className).toContain('w-full');
    expect(branchCard.className).not.toContain('border');
    expect(branchCard).toHaveTextContent('只有主回答');
    expect(screen.queryByTestId('chat-message-actions-assistant-legacy')).toBeNull();
  });

  it('用户消息 hover 后显示操作按钮', async () => {
    const user = userEvent.setup();

    render(
      <ChatThread
        {...createBaseProps()}
        messages={[
          {
            id: 'user-1',
            role: 'user',
            content: '**用户问题**',
            status: 'done',
            errorMessage: null,
            branches: [],
            selectedBranchId: null,
          },
        ]}
      />,
    );

    const messageList = screen.getByTestId('chat-thread-scroll-viewport').firstElementChild as HTMLDivElement;
    const messageCard = screen.getByTestId('chat-message-user-1');
    const messageBubble = screen.getByTestId('chat-message-bubble-user-1');
    expect(screen.getByTestId('chat-thread-scroll-viewport').className).not.toContain('px-2');
    expect(messageList.className).toContain('w-full');
    expect(messageList.className).toContain('divide-y');
    expect(messageList.className).toContain('divide-border/70');
    expect(messageCard).toHaveAttribute('data-message-role', 'user');
    expect(messageCard.className).toContain('w-full');
    expect(messageCard.className).not.toContain('py-');
    expect(messageBubble.className).toContain('bg-muted/55');
    expect(messageBubble.className).toContain('w-full');
    expect(messageBubble.className).not.toContain('border');
    expect(screen.getByTestId('chat-message-actions-user-1').className).toContain('opacity-0');

    await user.hover(messageCard);

    expect(screen.getByTestId('chat-message-actions-user-1').className).toContain('opacity-100');
    expect(screen.getByTestId('chat-message-actions-user-1').className).toContain('sticky');
    expect(within(messageCard).getByRole('button', { name: '复制 Markdown' })).toBeVisible();
  });

  it('短消息高度不足时，用户消息和助手分支的悬浮按钮都会切成横排', async () => {
    const user = userEvent.setup();
    const clientHeightSpy = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
      const testId = this.getAttribute('data-testid');
      if (testId === 'chat-message-bubble-user-short' || testId === 'branch-branch-short') {
        return 32;
      }
      return 240;
    });

    render(
      <ChatThread
        {...createBaseProps()}
        messages={[
          {
            id: 'user-short',
            role: 'user',
            content: '短消息',
            status: 'done',
            errorMessage: null,
            branches: [],
            selectedBranchId: null,
          },
          {
            id: 'assistant-short',
            role: 'assistant',
            content: '短回答',
            status: 'done',
            errorMessage: null,
            branches: [
              {
                id: 'branch-short',
                modelId: 'model-1',
                modelLabel: '模型一',
                isPrimary: true,
                content: '短回答',
                status: 'done',
                errorMessage: null,
              },
            ],
            selectedBranchId: 'branch-short',
          },
        ]}
      />,
    );

    await user.hover(screen.getByTestId('chat-message-user-short'));
    await waitFor(() => {
      expect(screen.getByTestId('chat-message-actions-user-short')).toHaveAttribute('data-action-orientation', 'horizontal');
    });
    expect(screen.getByTestId('chat-message-actions-user-short').className).toContain('flex-row');

    await waitFor(() => {
      expect(screen.getByTestId('branch-actions-branch-short')).toHaveAttribute('data-action-orientation', 'horizontal');
    });
    expect(screen.getByTestId('branch-actions-branch-short').className).toContain('flex-row');
    await user.hover(screen.getByTestId('branch-branch-short'));
    expect(screen.getByTestId('branch-actions-branch-short').className).toContain('opacity-100');
    expect(screen.getByTestId('branch-actions-branch-short').parentElement?.className).toContain('top-1');
    expect(screen.getByTestId('branch-actions-branch-short').parentElement?.className).toContain('right-px');
    expect(screen.getByTestId('branch-actions-branch-short').parentElement?.className).not.toContain('-top-1');

    clientHeightSpy.mockRestore();
  });

  it('顶部滚动条和分支区滚动位置保持同步', async () => {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.getAttribute('data-testid') === 'branch-rail-content-assistant-sync' ? 960 : 0;
    });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.getAttribute('data-testid') === 'branch-rail-assistant-sync' ? 600 : 240;
    });

    render(
      <ChatThread
        {...createBaseProps()}
        messages={[
          {
            id: 'assistant-sync',
            role: 'assistant',
            content: '主回答',
            status: 'done',
            errorMessage: null,
            branches: [
              {
                id: 'branch-1',
                modelId: 'model-1',
                modelLabel: '模型一',
                isPrimary: true,
                content: '分支一',
                status: 'done',
                errorMessage: null,
              },
              {
                id: 'branch-2',
                modelId: 'model-2',
                modelLabel: '模型二',
                isPrimary: false,
                content: '分支二',
                status: 'done',
                errorMessage: null,
              },
              {
                id: 'branch-3',
                modelId: 'model-3',
                modelLabel: '模型三',
                isPrimary: false,
                content: '分支三',
                status: 'done',
                errorMessage: null,
              },
            ],
            selectedBranchId: 'branch-1',
          },
        ]}
      />,
    );

    const topScrollbar = await screen.findByTestId('branch-rail-top-scroll-assistant-sync');
    const branchRail = screen.getByTestId('branch-rail-assistant-sync');
    const branchGrid = screen.getByTestId('branch-rail-content-assistant-sync');

    expect(branchGrid.getAttribute('style')).toContain(`repeat(3, minmax(${MIN_ASSISTANT_BRANCH_COLUMN_WIDTH}px, 1fr))`);
    topScrollbar.scrollLeft = 96;
    fireEvent.scroll(topScrollbar);
    expect(branchRail.scrollLeft).toBe(96);

    fireEvent.scroll(branchRail);
    branchRail.scrollLeft = 168;
    fireEvent.scroll(branchRail);
    expect(topScrollbar.scrollLeft).toBe(168);
  });

  it('分支卡片 hover 后显示统一按钮组，并支持重试和定位；预览按钮常驻显示', async () => {
    const user = userEvent.setup();
    const onRetryAssistantMessage = vi.fn().mockResolvedValue(undefined);
    const onSelectAssistantBranch = vi.fn().mockResolvedValue(undefined);
    const onOpenBranchPreview = vi.fn();

    render(
      <ChatThread
        {...createBaseProps()}
        messages={[
          {
            id: 'assistant-1',
            role: 'assistant',
            content: '主回答',
            status: 'done',
            errorMessage: null,
            branches: [
              {
                id: 'branch-1',
                modelId: 'model-1',
                modelLabel: '模型一',
                isPrimary: true,
                content: '分支一',
                status: 'done',
                errorMessage: null,
              },
              {
                id: 'branch-2',
                modelId: 'model-2',
                modelLabel: '模型二',
                isPrimary: false,
                content: '分支二',
                status: 'done',
                errorMessage: null,
              },
            ],
            selectedBranchId: 'branch-1',
          },
        ]}
        onRetryAssistantMessage={onRetryAssistantMessage}
        onSelectAssistantBranch={onSelectAssistantBranch}
        onOpenBranchPreview={onOpenBranchPreview}
      />,
    );

    const branchCard = screen.getByTestId('branch-branch-2');
    await user.click(within(branchCard).getByRole('button', { name: '打开分支预览' }));
    await user.hover(branchCard);
    expect(screen.getByTestId('branch-actions-branch-2').className).toContain('absolute');
    expect(screen.getByTestId('branch-actions-branch-2')).toHaveStyle({ right: '0px' });
    expect(screen.getByTestId('branch-actions-branch-2').parentElement?.className).toContain('right-px');
    await user.click(within(branchCard).getByRole('button', { name: '重试回答' }));
    await user.click(within(branchCard).getByRole('button', { name: '设为后续主分支' }));
    expect(within(branchCard).getByRole('button', { name: '复制纯文本' })).toBeVisible();
    expect(within(branchCard).getByRole('button', { name: '复制 Markdown' })).toBeVisible();
    await user.hover(branchCard);
    await user.click(within(branchCard).getByRole('button', { name: '定位到消息顶部' }));
    await user.click(within(branchCard).getByRole('button', { name: '定位到消息底部' }));

    expect(onRetryAssistantMessage).toHaveBeenCalledWith('assistant-1', 'branch-2');
    expect(onOpenBranchPreview).toHaveBeenCalledWith('assistant-1', 'branch-2');
    expect(onSelectAssistantBranch).toHaveBeenCalledWith('assistant-1', 'branch-2');
    expect(scrollIntoViewSpy).toHaveBeenCalled();
  });

  it('助手分支内容为空时不再渲染省略号占位', () => {
    render(
      <ChatThread
        {...createBaseProps()}
        messages={[
          {
            id: 'assistant-loading',
            role: 'assistant',
            content: '',
            status: 'loading',
            errorMessage: null,
            branches: [
              {
                id: 'branch-loading',
                modelId: 'model-1',
                modelLabel: '模型一',
                isPrimary: true,
                content: '',
                status: 'loading',
                errorMessage: null,
              },
            ],
            selectedBranchId: 'branch-loading',
          },
        ]}
      />,
    );

    expect(screen.queryByText('...')).toBeNull();
    expect(screen.getByTestId('branch-branch-loading')).toHaveTextContent('模型一');
  });

  it('长分支卡片的按钮按当前可视区域中点更新纵向位置', async () => {
    const user = userEvent.setup();
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    const rectState = {
      viewport: { top: 0, bottom: 200, left: 0, width: 320 },
      branch: { top: -100, bottom: 500, left: 0, width: 280 },
    };

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const testId = this.getAttribute('data-testid');
      if (testId === 'chat-thread-scroll-viewport') {
        return createRect(rectState.viewport);
      }
      if (testId === 'branch-branch-visible-center') {
        return createRect(rectState.branch);
      }
      return originalGetBoundingClientRect.call(this);
    });

    render(
      <ChatThread
        {...createBaseProps()}
        messages={[
          {
            id: 'assistant-visible-center',
            role: 'assistant',
            content: '主回答',
            status: 'done',
            errorMessage: null,
            branches: [
              {
                id: 'branch-visible-center',
                modelId: 'model-1',
                modelLabel: '模型一',
                isPrimary: true,
                content: '长回答',
                status: 'done',
                errorMessage: null,
              },
            ],
            selectedBranchId: 'branch-visible-center',
          },
        ]}
      />,
    );

    const branchCard = screen.getByTestId('branch-branch-visible-center');
    const viewport = screen.getByTestId('chat-thread-scroll-viewport');
    await user.hover(branchCard);

    await waitFor(() => {
      expect(screen.getByTestId('branch-actions-branch-visible-center')).toHaveStyle({ top: '200px' });
    });
    expect(screen.getByTestId('branch-actions-branch-visible-center')).toHaveStyle({ right: '0px' });
    expect(screen.getByTestId('branch-actions-branch-visible-center').parentElement?.className).toContain('right-px');

    rectState.branch = { top: -250, bottom: 350, left: 0, width: 280 };
    fireEvent.scroll(viewport);

    await waitFor(() => {
      expect(screen.getByTestId('branch-actions-branch-visible-center')).toHaveStyle({ top: '350px' });
    });
  });

  it('助手分支在两列模式下平分宽度且不展示横向滚动条', () => {
    render(
      <ChatThread
        {...createBaseProps()}
        messages={[
          {
            id: 'assistant-1',
            role: 'assistant',
            content: '主回答',
            status: 'done',
            errorMessage: null,
            branches: [
              {
                id: 'branch-1',
                modelId: 'model-1',
                modelLabel: '模型一',
                isPrimary: true,
                content: '分支一',
                status: 'done',
                errorMessage: null,
              },
              {
                id: 'branch-2',
                modelId: 'model-2',
                modelLabel: '模型二',
                isPrimary: false,
                content: '分支二',
                status: 'done',
                errorMessage: null,
              },
            ],
            selectedBranchId: 'branch-1',
          },
        ]}
      />,
    );

    const branchRail = screen.getByTestId('branch-rail-assistant-1');
    const branchGrid = branchRail.firstElementChild as HTMLDivElement;
    expect(screen.queryByTestId('branch-rail-top-scroll-assistant-1')).toBeNull();
    expect(branchRail).toHaveAttribute('data-reading-layout', 'responsive-two-columns');
    expect(branchRail.parentElement?.className).not.toContain('mt-');
    expect(branchRail.className).toContain('overflow-x-hidden');
    expect(branchRail.className).not.toContain('pb-');
    expect(branchGrid.className).toContain('divide-x');
    expect(branchGrid.className).toContain('divide-border/70');
    expect(branchGrid.getAttribute('style')).toContain('repeat(2, minmax(0, 1fr))');
    expect(screen.getByTestId('branch-branch-1').className).toContain('border-t-2');
    expect(screen.getByTestId('branch-branch-1').className).toContain('border-t-primary');
    expect(screen.getByTestId('branch-branch-1').className).not.toContain('border-primary');
    expect(screen.getByTestId('branch-branch-1').className).not.toContain('bg-primary/5');
    expect(screen.getByTestId('branch-branch-2').className).not.toContain('border');
  });

  it('助手分支超过两列且宽度充足时平分宽度并隐藏顶部滚动条', async () => {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.getAttribute('data-testid') === 'branch-rail-content-assistant-1' ? 900 : 0;
    });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.getAttribute('data-testid') === 'branch-rail-assistant-1' ? 900 : 240;
    });

    render(
      <ChatThread
        {...createBaseProps()}
        messages={[
          {
            id: 'assistant-1',
            role: 'assistant',
            content: '主回答',
            status: 'done',
            errorMessage: null,
            branches: [
              {
                id: 'branch-1',
                modelId: 'model-1',
                modelLabel: '模型一',
                isPrimary: true,
                content: '分支一',
                status: 'done',
                errorMessage: null,
              },
              {
                id: 'branch-2',
                modelId: 'model-2',
                modelLabel: '模型二',
                isPrimary: false,
                content: '分支二',
                status: 'done',
                errorMessage: null,
              },
              {
                id: 'branch-3',
                modelId: 'model-3',
                modelLabel: '模型三',
                isPrimary: false,
                content: '分支三',
                status: 'done',
                errorMessage: null,
              },
            ],
            selectedBranchId: 'branch-1',
          },
        ]}
      />,
    );

    const branchRail = screen.getByTestId('branch-rail-assistant-1');
    const branchGrid = screen.getByTestId('branch-rail-content-assistant-1');
    await waitFor(() => expect(screen.queryByTestId('branch-rail-top-scroll-assistant-1')).toBeNull());
    expect(branchRail).toHaveAttribute('data-reading-layout', 'fixed-multi-columns');
    expect(branchRail.parentElement?.className).not.toContain('mt-');
    expect(branchRail.className).toContain('w-full');
    expect(branchRail.className).toContain('max-w-full');
    expect(branchRail.className).toContain('overflow-x-auto');
    expect(branchRail.className).not.toContain('pb-');
    expect(branchGrid.getAttribute('style')).toContain(`repeat(3, minmax(${MIN_ASSISTANT_BRANCH_COLUMN_WIDTH}px, 1fr))`);
    expect(branchGrid.className).toContain('min-w-full');
    expect(branchGrid.className).toContain('divide-x');
  });

  it('继续新增分支从分支卡片按钮打开模型列表，且不再显示同模型序号', async () => {
    const user = userEvent.setup();
    const onExpandBranches = vi.fn().mockResolvedValue(undefined);

    render(
      <ChatThread
        {...createBaseProps()}
        messages={[
          {
            id: 'assistant-1',
            role: 'assistant',
            content: '主回答',
            status: 'done',
            errorMessage: null,
            branches: [
              {
                id: 'branch-1',
                modelId: 'model-1',
                modelLabel: '模型一',
                isPrimary: true,
                content: '主回答',
                status: 'done',
                errorMessage: null,
              },
              {
                id: 'branch-2',
                modelId: 'model-1',
                modelLabel: '模型一',
                isPrimary: false,
                content: '第二个同模型分支',
                status: 'done',
                errorMessage: null,
              },
            ],
            selectedBranchId: 'branch-1',
          },
        ]}
        availableBranchModels={[
          { id: 'model-1', name: '模型一' },
          { id: 'model-2', name: '模型二' },
        ]}
        onExpandBranches={onExpandBranches}
      />,
    );

    const branchCard = screen.getByTestId('branch-branch-1');
    await user.hover(branchCard);
    await user.click(within(branchCard).getByRole('button', { name: '继续新增分支' }));

    expect(await screen.findByText('选择模型')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '模型二' }));

    expect(onExpandBranches).toHaveBeenCalledWith('assistant-1', 'model-2');
    expect(screen.getByTestId('branch-branch-1')).toHaveTextContent('模型一');
    expect(screen.getByTestId('branch-branch-2')).toHaveTextContent('模型一');
    expect(screen.queryByText('#1')).toBeNull();
    expect(screen.queryByText('#2')).toBeNull();
  });

  it('删除按钮通过 mini confirm 触发分支删除，loading 主分支在卡片内显示停止按钮', async () => {
    const user = userEvent.setup();
    const onDeleteBranch = vi.fn().mockResolvedValue(undefined);
    const onStop = vi.fn().mockResolvedValue(undefined);

    render(
      <ChatThread
        {...createBaseProps()}
        messages={[
          {
            id: 'assistant-loading',
            role: 'assistant',
            content: '流式内容',
            status: 'loading',
            errorMessage: null,
            branches: [
              {
                id: 'branch-loading',
                modelId: 'model-1',
                modelLabel: '主模型',
                isPrimary: true,
                content: '流式内容',
                status: 'loading',
                errorMessage: null,
              },
            ],
            selectedBranchId: 'branch-loading',
          },
        ]}
        onDeleteBranch={onDeleteBranch}
        onStop={onStop}
      />,
    );

    const branchCard = screen.getByTestId('branch-branch-loading');
    await user.hover(branchCard);
    await user.click(within(branchCard).getByRole('button', { name: '停止' }));
    expect(onStop).toHaveBeenCalledTimes(1);

    await user.click(within(branchCard).getByRole('button', { name: '删除分支' }));
    await user.click(within(screen.getByTestId('delete-branch-confirm-branch-loading')).getByRole('button', { name: '删除分支' }));

    await waitFor(() => expect(onDeleteBranch).toHaveBeenCalledWith('assistant-loading', 'branch-loading'));
    expect(screen.queryByTestId('chat-message-actions-assistant-loading')).toBeNull();
  });
});
