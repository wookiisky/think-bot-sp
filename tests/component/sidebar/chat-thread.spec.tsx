import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
let scrollIntoViewSpy: ReturnType<typeof vi.fn>;

const createBaseProps = () => ({
  restoreMessageId: null,
  availableBranchModels: [] as Array<{ id: string; name: string }>,
  editingMessageId: null,
  editingText: '',
  t,
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
  onNotice: vi.fn(),
});

afterEach(() => {
  cleanup();
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
  it('助手分支按 Markdown 渲染，头部只保留模型名称', () => {
    render(
      <ChatThread
        {...createBaseProps()}
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
    expect(screen.getByTestId('chat-message-bubble-assistant-1').className).toContain('pr-0');
    expect(screen.queryByText('主分支')).toBeNull();
    expect(screen.queryByText('分支')).toBeNull();
    expect(screen.queryByText('#1')).toBeNull();
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

    expect(screen.getByTestId('branch-rail-assistant-legacy')).toHaveAttribute('data-reading-layout', 'single');
    expect(screen.getByTestId('branch-assistant-legacy:primary')).toHaveTextContent('只有主回答');
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

    const messageCard = screen.getByTestId('chat-message-user-1');
    expect(messageCard).toHaveAttribute('data-message-role', 'user');
    expect(screen.getByTestId('chat-message-actions-user-1').className).toContain('opacity-0');

    await user.hover(messageCard);

    expect(screen.getByTestId('chat-message-actions-user-1').className).toContain('opacity-100');
    expect(screen.getByTestId('chat-message-actions-user-1').className).toContain('sticky');
    expect(within(messageCard).getByRole('button', { name: '复制 Markdown' })).toBeVisible();
  });

  it('分支卡片 hover 后显示统一按钮组，并支持重试、预览和定位', async () => {
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
    await user.hover(branchCard);
    expect(screen.getByTestId('branch-actions-branch-2').className).toContain('sticky');
    await user.click(within(branchCard).getByRole('button', { name: '重试回答' }));
    await user.click(within(branchCard).getByRole('button', { name: '打开分支预览' }));
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

  it('助手分支在两列模式下保持 2 列并由外层容器承载横向滚动', () => {
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
    expect(screen.getByTestId('branch-rail-top-scroll-assistant-1')).toBeVisible();
    expect(branchRail).toHaveAttribute('data-reading-layout', 'responsive-two-columns');
    expect(branchRail.className).toContain('overflow-x-scroll');
    expect(branchGrid.getAttribute('style')).toContain(`repeat(2, minmax(${MIN_ASSISTANT_BRANCH_COLUMN_WIDTH}px, 1fr))`);
  });

  it('助手分支超过两列后统一使用最小列宽', () => {
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
    const branchGrid = branchRail.firstElementChild as HTMLDivElement;
    expect(branchRail).toHaveAttribute('data-reading-layout', 'fixed-multi-columns');
    expect(branchGrid.getAttribute('style')).toContain(`repeat(3, ${MIN_ASSISTANT_BRANCH_COLUMN_WIDTH}px)`);
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
