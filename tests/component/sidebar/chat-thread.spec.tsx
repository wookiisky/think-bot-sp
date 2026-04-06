import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatThread } from '../../../src/features/sidebar/chat-thread';

const translations: Record<string, string> = {
  'common.cancel': '取消',
  'workspace.emptyMessages': '还没有聊天记录',
  'workspace.status.loading': '生成中',
  'workspace.status.done': '已完成',
  'workspace.status.error': '失败',
  'workspace.status.cancelled': '已停止',
  'workspace.status.restore': '恢复生成中',
  'workspace.status.branch': '分支',
  'workspace.status.primaryBranch': '主分支',
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
  it('会把主消息和分支按 Markdown 渲染出来', () => {
    render(
      <ChatThread
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
        restoreMessageId={null}
        availableBranchModels={[]}
        editingMessageId={null}
        editingText=""
        t={t}
        onStartEdit={vi.fn()}
        onEditingTextChange={vi.fn()}
        onCancelEdit={vi.fn()}
        onSubmitEdit={vi.fn()}
        onRetryUserMessage={vi.fn()}
        onRetryAssistantMessage={vi.fn()}
        onSelectAssistantBranch={vi.fn()}
        onExpandBranches={vi.fn()}
        onStop={vi.fn()}
        onStopBranch={vi.fn()}
        onDeleteBranch={vi.fn()}
        onNotice={vi.fn()}
      />,
    );

    expect(screen.getByText('主回答').tagName).toBe('STRONG');
    expect(screen.getByRole('link', { name: '链接' })).toHaveAttribute('href', 'https://example.com');
    expect(screen.getByText('分支结果')).toBeVisible();
    expect(screen.getByTestId('chat-message-bubble-assistant-1').className).toContain('bg-muted/55');
    expect(screen.queryByText('当前用于后续对话')).toBeNull();
  });

  it('消息卡片不再显示角色行，hover 后才显示操作按钮', async () => {
    const user = userEvent.setup();

    render(
      <ChatThread
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
        restoreMessageId={null}
        availableBranchModels={[]}
        editingMessageId={null}
        editingText=""
        t={t}
        onStartEdit={vi.fn()}
        onEditingTextChange={vi.fn()}
        onCancelEdit={vi.fn()}
        onSubmitEdit={vi.fn()}
        onRetryUserMessage={vi.fn()}
        onRetryAssistantMessage={vi.fn()}
        onSelectAssistantBranch={vi.fn()}
        onExpandBranches={vi.fn()}
        onStop={vi.fn()}
        onStopBranch={vi.fn()}
        onDeleteBranch={vi.fn()}
        onNotice={vi.fn()}
      />,
    );

    const messageCard = screen.getByTestId('chat-message-user-1');
    expect(messageCard).toHaveAttribute('data-message-role', 'user');
    expect(within(messageCard).queryByText('你')).toBeNull();
    expect(within(screen.getByTestId('chat-message-actions-user-1')).getByRole('button', { name: '复制纯文本' })).toBeVisible();
    expect(screen.getByTestId('chat-message-actions-user-1').className).toContain('opacity-0');

    await user.hover(messageCard);

    expect(screen.getByTestId('chat-message-actions-user-1').className).toContain('opacity-100');
    expect(within(messageCard).getByRole('button', { name: '复制 Markdown' })).toBeVisible();
  });

  it('支持用户重试和助手消息滚动定位', async () => {
    const user = userEvent.setup();
    const onRetryUserMessage = vi.fn().mockResolvedValue(undefined);

    render(
      <ChatThread
        messages={[
          {
            id: 'user-1',
            role: 'user',
            content: '旧问题',
            status: 'done',
            errorMessage: null,
            branches: [],
            selectedBranchId: null,
          },
          {
            id: 'assistant-1',
            role: 'assistant',
            content: '',
            status: 'done',
            errorMessage: null,
            branches: [
              {
                id: 'branch-1',
                modelId: 'model-1',
                modelLabel: '主模型',
                isPrimary: true,
                content: '旧回答',
                status: 'done',
                errorMessage: null,
              },
            ],
            selectedBranchId: 'branch-1',
          },
        ]}
        restoreMessageId={null}
        availableBranchModels={[]}
        editingMessageId={null}
        editingText=""
        t={t}
        onStartEdit={vi.fn()}
        onEditingTextChange={vi.fn()}
        onCancelEdit={vi.fn()}
        onSubmitEdit={vi.fn()}
        onRetryUserMessage={onRetryUserMessage}
        onRetryAssistantMessage={vi.fn()}
        onSelectAssistantBranch={vi.fn()}
        onExpandBranches={vi.fn()}
        onStop={vi.fn()}
        onStopBranch={vi.fn()}
        onDeleteBranch={vi.fn()}
        onNotice={vi.fn()}
      />,
    );

    await user.hover(screen.getByTestId('chat-message-user-1'));
    await user.click(within(screen.getByTestId('chat-message-user-1')).getByRole('button', { name: '重试问题' }));
    expect(onRetryUserMessage).toHaveBeenCalledWith('user-1');

    await user.hover(screen.getByTestId('chat-message-assistant-1'));
    await user.click(within(screen.getByTestId('chat-message-assistant-1')).getByRole('button', { name: '定位到消息顶部' }));
    expect(scrollIntoViewSpy).toHaveBeenCalled();
  });

  it('助手生成中时在消息内显示 loading 和停止按钮，不展示恢复文案', () => {
    const onStop = vi.fn().mockResolvedValue(undefined);

    render(
      <ChatThread
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
        restoreMessageId={null}
        availableBranchModels={[]}
        editingMessageId={null}
        editingText=""
        t={t}
        onStartEdit={vi.fn()}
        onEditingTextChange={vi.fn()}
        onCancelEdit={vi.fn()}
        onSubmitEdit={vi.fn()}
        onRetryUserMessage={vi.fn()}
        onRetryAssistantMessage={vi.fn()}
        onSelectAssistantBranch={vi.fn()}
        onExpandBranches={vi.fn()}
        onStop={onStop}
        onStopBranch={vi.fn()}
        onDeleteBranch={vi.fn()}
        onNotice={vi.fn()}
      />,
    );

    expect(screen.getAllByLabelText('生成中').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '停止' }).length).toBeGreaterThan(0);
    expect(screen.queryByText('恢复生成中')).toBeNull();
    expect(screen.queryByTestId('chat-message-actions-assistant-loading')).toBeNull();
  });

  it('分支会按响应式 grid 展示，并使用通用最小列宽', () => {
    render(
      <ChatThread
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
        restoreMessageId={null}
        availableBranchModels={[]}
        editingMessageId={null}
        editingText=""
        t={t}
        onStartEdit={vi.fn()}
        onEditingTextChange={vi.fn()}
        onCancelEdit={vi.fn()}
        onSubmitEdit={vi.fn()}
        onRetryUserMessage={vi.fn()}
        onRetryAssistantMessage={vi.fn()}
        onSelectAssistantBranch={vi.fn()}
        onExpandBranches={vi.fn()}
        onStop={vi.fn()}
        onStopBranch={vi.fn()}
        onDeleteBranch={vi.fn()}
        onNotice={vi.fn()}
      />,
    );

    const branchRail = screen.getByTestId('branch-rail-assistant-1');
    expect(branchRail).toHaveAttribute('data-reading-layout', 'grid');
    expect(branchRail.getAttribute('style')).toContain('minmax(350px, 1fr)');
  });

  it('分支操作按钮挂在各自分支卡片右侧悬浮区', async () => {
    const user = userEvent.setup();
    const onRetryAssistantMessage = vi.fn().mockResolvedValue(undefined);
    const onSelectAssistantBranch = vi.fn().mockResolvedValue(undefined);

    render(
      <ChatThread
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
                isPrimary: false,
                content: '分支一',
                status: 'done',
                errorMessage: null,
              },
            ],
            selectedBranchId: null,
          },
        ]}
        restoreMessageId={null}
        availableBranchModels={[]}
        editingMessageId={null}
        editingText=""
        t={t}
        onStartEdit={vi.fn()}
        onEditingTextChange={vi.fn()}
        onCancelEdit={vi.fn()}
        onSubmitEdit={vi.fn()}
        onRetryUserMessage={vi.fn()}
        onRetryAssistantMessage={onRetryAssistantMessage}
        onSelectAssistantBranch={onSelectAssistantBranch}
        onExpandBranches={vi.fn()}
        onStop={vi.fn()}
        onStopBranch={vi.fn()}
        onDeleteBranch={vi.fn()}
        onNotice={vi.fn()}
      />,
    );

    const branchCard = screen.getByTestId('branch-branch-1');
    await user.hover(branchCard);
    await user.click(within(branchCard).getByRole('button', { name: '重试回答' }));
    await user.click(within(branchCard).getByRole('button', { name: '设为后续主分支' }));

    expect(onRetryAssistantMessage).toHaveBeenCalledWith('assistant-1', 'branch-1');
    expect(onSelectAssistantBranch).toHaveBeenCalledWith('assistant-1', 'branch-1');
  });

  it('窄屏测试下仍保持 grid 布局，由浏览器自行换列', () => {
    render(
      <ChatThread
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
        restoreMessageId={null}
        availableBranchModels={[]}
        editingMessageId={null}
        editingText=""
        t={t}
        onStartEdit={vi.fn()}
        onEditingTextChange={vi.fn()}
        onCancelEdit={vi.fn()}
        onSubmitEdit={vi.fn()}
        onRetryUserMessage={vi.fn()}
        onRetryAssistantMessage={vi.fn()}
        onSelectAssistantBranch={vi.fn()}
        onExpandBranches={vi.fn()}
        onStop={vi.fn()}
        onStopBranch={vi.fn()}
        onDeleteBranch={vi.fn()}
        onNotice={vi.fn()}
      />,
    );

    const branchRail = screen.getByTestId('branch-rail-assistant-1');
    expect(branchRail).toHaveAttribute('data-reading-layout', 'grid');
    expect(branchRail.getAttribute('style')).toContain('minmax(350px, 1fr)');
  });

  it('继续新增分支会先弹出模型列表，并允许同模型分支显示序号', async () => {
    const user = userEvent.setup();
    const onExpandBranches = vi.fn().mockResolvedValue(undefined);

    render(
      <ChatThread
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
        restoreMessageId={null}
        availableBranchModels={[
          { id: 'model-1', name: '模型一' },
          { id: 'model-2', name: '模型二' },
        ]}
        editingMessageId={null}
        editingText=""
        t={t}
        onStartEdit={vi.fn()}
        onEditingTextChange={vi.fn()}
        onCancelEdit={vi.fn()}
        onSubmitEdit={vi.fn()}
        onRetryUserMessage={vi.fn()}
        onRetryAssistantMessage={vi.fn()}
        onSelectAssistantBranch={vi.fn()}
        onExpandBranches={onExpandBranches}
        onStop={vi.fn()}
        onStopBranch={vi.fn()}
        onDeleteBranch={vi.fn()}
        onNotice={vi.fn()}
      />,
    );

    await user.hover(screen.getByTestId('chat-message-assistant-1'));
    await user.click(screen.getByRole('button', { name: '继续新增分支' }));

    expect(await screen.findByText('选择模型')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '模型二' }));

    expect(onExpandBranches).toHaveBeenCalledWith('assistant-1', 'model-2');
    expect(screen.getByTestId('branch-branch-1')).toHaveTextContent('模型一 #1');
    expect(screen.getByTestId('branch-branch-2')).toHaveTextContent('模型一 #2');
  });
});
