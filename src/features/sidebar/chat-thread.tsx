import { useRef, useState } from 'react';
import {
  CheckIcon,
  ChevronsDownIcon,
  ChevronsUpIcon,
  CopyIcon,
  Edit3Icon,
  FileCode2Icon,
  GitBranchPlusIcon,
  RotateCcwIcon,
  SaveIcon,
  SquareIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import removeMarkdown from 'remove-markdown';

import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { MiniConfirm } from '../../components/ui/mini-confirm';
import { Textarea } from '../../components/ui/textarea';
import { Tooltip } from '../../components/ui/tooltip';
import { MIN_ASSISTANT_BRANCH_COLUMN_WIDTH } from '../../domain/config/config-schema';
import { cn } from '../../lib/utils';
import { ChatMarkdown } from '../workspace/chat-markdown';
import type { WorkspaceTranslator } from '../workspace/workspace-copy';
import { WorkspaceStatusGlyph } from '../workspace/workspace-status';

type ChatThreadProps = {
  /** 当前消息列表。 */
  messages: Array<{
    /** 消息 id。 */
    id: string;
    /** 角色。 */
    role: 'user' | 'assistant' | 'system';
    /** 内容。 */
    content: string;
    /** 展示内容。 */
    displayContent?: string;
    /** 状态。 */
    status: 'loading' | 'done' | 'error' | 'cancelled';
    /** 错误消息。 */
    errorMessage: string | null;
    /** 当前消息下的分支列表。 */
    branches: Array<{
      /** 分支 id。 */
      id: string;
      /** 分支模型 id。 */
      modelId: string;
      /** 分支模型展示名。 */
      modelLabel: string;
      /** 是否为首个主分支。 */
      isPrimary: boolean;
      /** 分支内容。 */
      content: string;
      /** 分支状态。 */
      status: 'loading' | 'done' | 'error' | 'cancelled';
      /** 分支错误消息。 */
      errorMessage: string | null;
    }>;
    /** 当前选中的主分支。 */
    selectedBranchId: string | null;
  }>;
  /** 当前恢复中的助手消息 id。 */
  restoreMessageId: string | null;
  /** 当前编辑中的用户消息 id。 */
  editingMessageId: string | null;
  /** 当前编辑草稿。 */
  editingText: string;
  /** 文案翻译函数。 */
  t: WorkspaceTranslator;
  /** 开始编辑用户消息。 */
  onStartEdit: (...input: [messageId: string, content: string]) => void;
  /** 更新编辑草稿。 */
  onEditingTextChange: (...input: [text: string]) => void;
  /** 取消编辑。 */
  onCancelEdit: () => void;
  /** 提交编辑。 */
  onSubmitEdit: (...input: [messageId: string]) => Promise<void>;
  /** 重试目标用户消息。 */
  onRetryUserMessage: (...input: [messageId: string]) => Promise<void>;
  /** 重试目标助手消息。 */
  onRetryAssistantMessage: (...input: [messageId: string, branchId: string]) => Promise<void>;
  /** 切换当前轮的主分支。 */
  onSelectAssistantBranch: (...input: [messageId: string, branchId: string]) => Promise<void>;
  /** 继续新增分支。 */
  onExpandBranches: (...input: [messageId: string]) => Promise<void>;
  /** 停止当前消息所属会话。 */
  onStop: () => Promise<void>;
  /** 停止单个分支。 */
  onStopBranch: (...input: [messageId: string, branchId: string]) => Promise<void>;
  /** 删除单个分支。 */
  onDeleteBranch: (...input: [messageId: string, branchId: string]) => Promise<void>;
  /** 更新当前工作台提示。 */
  onNotice: (...input: [notice: string]) => void;
};

/** 侧边栏聊天消息区。 */
export const ChatThread = ({
  messages,
  restoreMessageId: _restoreMessageId,
  editingMessageId,
  editingText,
  t,
  onStartEdit,
  onEditingTextChange,
  onCancelEdit,
  onSubmitEdit,
  onRetryUserMessage,
  onRetryAssistantMessage,
  onSelectAssistantBranch,
  onExpandBranches,
  onStop,
  onStopBranch,
  onDeleteBranch,
  onNotice,
}: ChatThreadProps) => {
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);

  /** 复制指定格式的消息内容。 */
  const handleCopyMessage = async (input: { content: string; mode: 'plain' | 'markdown' }) => {
    const nextContent =
      input.mode === 'plain'
        ? removeMarkdown(input.content)
            .replace(/\n{3,}/g, '\n\n')
            .trim()
        : input.content;
    if (!nextContent.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(nextContent);
      onNotice(input.mode === 'plain' ? t('workspace.notice.copyPlainSuccess') : t('workspace.notice.copyMarkdownSuccess'));
    } catch {
      onNotice(input.mode === 'plain' ? t('workspace.notice.copyPlainFailed') : t('workspace.notice.copyMarkdownFailed'));
    }
  };

  /** 滚动到目标消息顶部或底部。 */
  const scrollToMessage = (messageId: string, block: 'start' | 'end') => {
    messageRefs.current[messageId]?.scrollIntoView({
      behavior: 'smooth',
      block,
    });
  };

  return (
    <section className="flex-1 overflow-y-auto bg-gradient-to-b from-background via-background to-muted/20 px-3 py-2">
      <div>
        {messages.length === 0 ? <p className="text-sm text-muted-foreground">{t('workspace.emptyMessages')}</p> : null}
        {messages.map((message) => {
          const messageIndex = messages.findIndex((current) => current.id === message.id);
          const isEditing = message.role === 'user' && editingMessageId === message.id;
          const visibleContent = message.displayContent ?? message.content;
          const isAssistantLoading = message.role === 'assistant' && message.status === 'loading';
          const canSelectAssistantBranch = message.role === 'assistant' && messages.slice(messageIndex + 1).length === 0;

          return (
            <div
              key={message.id}
              ref={(element) => {
                messageRefs.current[message.id] = element;
              }}
              data-testid={`chat-message-${message.id}`}
              data-message-role={message.role}
              className="group/message relative py-2"
              onMouseEnter={() => setHoveredMessageId(message.id)}
              onMouseLeave={() => setHoveredMessageId((current) => (current === message.id ? null : current))}
              onFocus={() => setHoveredMessageId(message.id)}
              onBlur={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  return;
                }
                setHoveredMessageId((current) => (current === message.id ? null : current));
              }}
            >
              <article data-testid={`chat-message-bubble-${message.id}`} className={resolveMessageBubbleClass(message.role, message.status)}>
                {isAssistantLoading ? (
                  <div className="absolute right-0 top-0">
                    <Tooltip content={t('workspace.stop')}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('workspace.stop')}
                        onClick={() => void onStop()}
                      >
                        <SquareIcon />
                      </Button>
                    </Tooltip>
                  </div>
                ) : null}

                {isEditing ? (
                  <div className="grid gap-2">
                    <Textarea
                      aria-label={t('workspace.editMessageInput')}
                      value={editingText}
                      onChange={(event) => onEditingTextChange(event.target.value)}
                    />
                    <div className="flex gap-2">
                      <Tooltip content={t('workspace.saveAndResend')}>
                        <Button
                          type="button"
                          size="icon-sm"
                          aria-label={t('workspace.saveAndResend')}
                          disabled={editingText.trim().length === 0}
                          onClick={() => void onSubmitEdit(message.id)}
                        >
                          <SaveIcon />
                        </Button>
                      </Tooltip>
                      <Tooltip content={t('workspace.cancelEdit')}>
                        <Button type="button" variant="outline" size="icon-sm" aria-label={t('workspace.cancelEdit')} onClick={onCancelEdit}>
                          <XIcon />
                        </Button>
                      </Tooltip>
                    </div>
                  </div>
                ) : (
                  <>
                    {isAssistantLoading ? (
                      <div className="mb-2 flex items-center">
                        <WorkspaceStatusGlyph label={t('workspace.status.loading')} status="loading" className="size-4" />
                      </div>
                    ) : null}

                    {message.role === 'assistant' ? null : <ChatMarkdown content={visibleContent} />}
                  </>
                )}

                {message.status === 'error' ? <p className="mt-2 text-xs text-destructive">{message.errorMessage ?? t('workspace.status.error')}</p> : null}
                {message.status === 'cancelled' ? (
                  <p className="mt-2 text-xs text-muted-foreground">{message.errorMessage ?? t('workspace.status.cancelled')}</p>
                ) : null}

                {message.branches.length > 0 ? (
                  <div
                    data-testid={`branch-rail-${message.id}`}
                    data-reading-layout="grid"
                    className="mt-2 grid gap-2"
                    style={{
                      gridTemplateColumns: `repeat(auto-fit, minmax(${MIN_ASSISTANT_BRANCH_COLUMN_WIDTH}px, 1fr))`,
                    }}
                  >
                    {message.branches.map((branch) => (
                      <section
                        key={branch.id}
                        data-testid={`branch-${branch.id}`}
                        className={cn(
                          'group/branch relative border border-border/80 bg-background/70 px-3 py-2 pr-12',
                          message.selectedBranchId === branch.id && 'border-primary bg-primary/5',
                        )}
                      >
                        <div className="min-w-0">
                          <div
                            className={cn(
                              'absolute right-2 top-2 z-10 flex flex-col rounded-lg border border-border/80 bg-background/95 p-1 shadow-sm transition-opacity',
                              'pointer-events-none invisible opacity-0',
                              'group-hover/message:pointer-events-auto group-hover/message:visible group-hover/message:opacity-100',
                              'group-focus-within/message:pointer-events-auto group-focus-within/message:visible group-focus-within/message:opacity-100',
                              'group-hover/branch:pointer-events-auto group-hover/branch:visible group-hover/branch:opacity-100',
                              'group-focus-within/branch:pointer-events-auto group-focus-within/branch:visible group-focus-within/branch:opacity-100',
                            )}
                          >
                            {branch.status === 'loading' ? (
                              <Tooltip content={t(branch.isPrimary ? 'workspace.stop' : 'workspace.stopBranch')}>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label={t(branch.isPrimary ? 'workspace.stop' : 'workspace.stopBranch')}
                                  onClick={() => void (branch.isPrimary ? onStop() : onStopBranch(message.id, branch.id))}
                                >
                                  <XIcon />
                                </Button>
                              </Tooltip>
                            ) : null}
                            {branch.status !== 'loading' ? (
                              <Tooltip content={t('workspace.retryAssistantMessage')}>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label={t('workspace.retryAssistantMessage')}
                                  onClick={() => void onRetryAssistantMessage(message.id, branch.id)}
                                >
                                  <RotateCcwIcon />
                                </Button>
                              </Tooltip>
                            ) : null}
                            <Tooltip content={t('workspace.selectPrimaryBranch')}>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                aria-label={t('workspace.selectPrimaryBranch')}
                                disabled={!canSelectAssistantBranch || message.selectedBranchId === branch.id || branch.status === 'loading'}
                                onClick={() => void onSelectAssistantBranch(message.id, branch.id)}
                              >
                                <CheckIcon />
                              </Button>
                            </Tooltip>
                            {!branch.isPrimary ? (
                              <MiniConfirm
                                message={t('workspace.deleteBranch')}
                                cancelLabel={t('common.cancel')}
                                confirmLabel={t('workspace.deleteBranch')}
                                contentTestId={`delete-branch-confirm-${branch.id}`}
                                onConfirm={() => onDeleteBranch(message.id, branch.id)}
                              >
                                <Tooltip content={t('workspace.deleteBranch')}>
                                  <Button type="button" variant="ghost" size="icon-xs" aria-label={t('workspace.deleteBranch')}>
                                    <Trash2Icon />
                                  </Button>
                                </Tooltip>
                              </MiniConfirm>
                            ) : null}
                          </div>

                          <div className="flex items-start gap-3">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Badge variant="outline">{t(branch.isPrimary ? 'workspace.status.primaryBranch' : 'workspace.status.branch')}</Badge>
                              <span>{branch.modelLabel}</span>
                              <WorkspaceStatusGlyph
                                label={resolveStatusLabel(branch.status, t)}
                                status={toVisualStatus(branch.status)}
                                className="size-3.5"
                              />
                            </div>
                          </div>
                          <div className="mt-1.5">
                            <ChatMarkdown content={branch.content} />
                          </div>
                        </div>
                        {branch.status === 'error' ? <p className="mt-2 text-xs text-destructive">{branch.errorMessage ?? t('workspace.status.error')}</p> : null}
                        {branch.status === 'cancelled' ? (
                          <p className="mt-2 text-xs text-muted-foreground">{branch.errorMessage ?? t('workspace.status.cancelled')}</p>
                        ) : null}
                      </section>
                    ))}
                  </div>
                ) : null}

                {!isEditing && message.status !== 'loading' ? (
                  <div
                    data-testid={`chat-message-actions-${message.id}`}
                    className={cn(
                      'absolute right-0 top-0 z-10 transition-opacity',
                      hoveredMessageId === message.id ? 'pointer-events-auto visible opacity-100' : 'pointer-events-none invisible opacity-0',
                      message.role === 'assistant'
                        ? 'flex flex-col rounded-lg border border-border/80 bg-background/95 p-1 shadow-sm'
                        : 'flex flex-row rounded-lg border border-border/80 bg-background/95 p-1 shadow-sm',
                    )}
                  >
                    {message.role === 'user' ? (
                      <>
                        <Tooltip content={t('workspace.editMessage')}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('workspace.editMessage')}
                            onClick={() => onStartEdit(message.id, message.content)}
                          >
                            <Edit3Icon />
                          </Button>
                        </Tooltip>
                        <Tooltip content={t('workspace.retryUserMessage')}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('workspace.retryUserMessage')}
                            onClick={() => void onRetryUserMessage(message.id)}
                          >
                            <RotateCcwIcon />
                          </Button>
                        </Tooltip>
                        <Tooltip content={t('workspace.copyPlainText')}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('workspace.copyPlainText')}
                            onClick={() => void handleCopyMessage({ content: message.content, mode: 'plain' })}
                          >
                            <CopyIcon />
                          </Button>
                        </Tooltip>
                        <Tooltip content={t('workspace.copyMarkdown')}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('workspace.copyMarkdown')}
                            onClick={() => void handleCopyMessage({ content: message.content, mode: 'markdown' })}
                          >
                            <FileCode2Icon />
                          </Button>
                        </Tooltip>
                      </>
                    ) : null}

                    {message.role === 'assistant' ? (
                      <>
                        <Tooltip content={t('workspace.expandBranches')}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('workspace.expandBranches')}
                            onClick={() => void onExpandBranches(message.id)}
                          >
                            <GitBranchPlusIcon />
                          </Button>
                        </Tooltip>
                        <Tooltip content={t('workspace.scrollToMessageTop')}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('workspace.scrollToMessageTop')}
                            onClick={() => scrollToMessage(message.id, 'start')}
                          >
                            <ChevronsUpIcon />
                          </Button>
                        </Tooltip>
                        <Tooltip content={t('workspace.scrollToMessageBottom')}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('workspace.scrollToMessageBottom')}
                            onClick={() => scrollToMessage(message.id, 'end')}
                          >
                            <ChevronsDownIcon />
                          </Button>
                        </Tooltip>
                        <Tooltip content={t('workspace.copyPlainText')}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('workspace.copyPlainText')}
                            onClick={() => void handleCopyMessage({ content: message.content, mode: 'plain' })}
                          >
                            <CopyIcon />
                          </Button>
                        </Tooltip>
                        <Tooltip content={t('workspace.copyMarkdown')}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('workspace.copyMarkdown')}
                            onClick={() => void handleCopyMessage({ content: message.content, mode: 'markdown' })}
                          >
                            <FileCode2Icon />
                          </Button>
                        </Tooltip>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </article>
            </div>
          );
        })}
      </div>
    </section>
  );
};

/** 把运行态映射到统一视觉状态。 */
const toVisualStatus = (status: 'loading' | 'done' | 'error' | 'cancelled') => {
  switch (status) {
    case 'loading':
      return 'loading';
    case 'done':
      return 'done';
    case 'error':
      return 'error';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'idle';
  }
};

/** 解析状态标签文案。 */
const resolveStatusLabel = (status: 'loading' | 'done' | 'error' | 'cancelled', t: WorkspaceTranslator) => {
  switch (status) {
    case 'loading':
      return t('workspace.status.loading');
    case 'done':
      return t('workspace.status.done');
    case 'error':
      return t('workspace.status.error');
    case 'cancelled':
      return t('workspace.status.cancelled');
    default:
      return '';
  }
};

/** 统一根据角色和运行态生成消息气泡样式。 */
const resolveMessageBubbleClass = (role: 'user' | 'assistant' | 'system', status: 'loading' | 'done' | 'error' | 'cancelled') =>
  cn(
    'relative px-0.5 py-0.5 pr-12 transition-colors',
    role === 'assistant' && 'bg-muted/55 text-foreground',
    role === 'user' && 'text-foreground',
    role === 'system' && 'text-amber-900',
    status === 'error' && 'text-destructive',
    status === 'cancelled' && 'text-muted-foreground',
  );
