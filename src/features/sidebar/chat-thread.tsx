import { useEffect, useRef, useState } from 'react';
import {
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
      /** 分支内容。 */
      content: string;
      /** 分支状态。 */
      status: 'loading' | 'done' | 'error' | 'cancelled';
      /** 分支错误消息。 */
      errorMessage: string | null;
    }>;
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
  onRetryAssistantMessage: (...input: [messageId: string]) => Promise<void>;
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
  restoreMessageId,
  editingMessageId,
  editingText,
  t,
  onStartEdit,
  onEditingTextChange,
  onCancelEdit,
  onSubmitEdit,
  onRetryUserMessage,
  onRetryAssistantMessage,
  onExpandBranches,
  onStop,
  onStopBranch,
  onDeleteBranch,
  onNotice,
}: ChatThreadProps) => {
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [isNarrowBranchViewport, setIsNarrowBranchViewport] = useState(false);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(max-width: 960px)');
    /** 统一同步阅读列布局，避免窄屏下出现难以操作的横向卡片。 */
    const syncViewportState = () => {
      setIsNarrowBranchViewport(mediaQuery.matches);
    };

    syncViewportState();
    mediaQuery.addEventListener?.('change', syncViewportState);
    return () => {
      mediaQuery.removeEventListener?.('change', syncViewportState);
    };
  }, []);

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
    <section className="flex-1 overflow-y-auto bg-gradient-to-b from-background via-background to-muted/20 px-4 py-3">
      <div className="divide-y divide-border/80">
        {messages.length === 0 ? <p className="text-sm text-muted-foreground">{t('workspace.emptyMessages')}</p> : null}
        {messages.map((message) => {
          const isEditing = message.role === 'user' && editingMessageId === message.id;
          const visibleContent = message.displayContent ?? message.content;
          const isAssistantLoading = message.role === 'assistant' && message.status === 'loading';
          const branchReadingLayout =
            message.branches.length > 1 && !isNarrowBranchViewport ? 'horizontal' : 'vertical';

          return (
            <div
              key={message.id}
              ref={(element) => {
                messageRefs.current[message.id] = element;
              }}
              data-testid={`chat-message-${message.id}`}
              data-message-role={message.role}
              className="group/message relative py-3"
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
              <article className={resolveMessageBubbleClass(message.role, message.status)}>
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

                    <ChatMarkdown content={visibleContent} />
                  </>
                )}

                {message.status === 'error' ? <p className="mt-2 text-xs text-destructive">{message.errorMessage ?? t('workspace.status.error')}</p> : null}
                {message.status === 'cancelled' ? (
                  <p className="mt-2 text-xs text-muted-foreground">{message.errorMessage ?? t('workspace.status.cancelled')}</p>
                ) : null}

                {message.branches.length > 0 ? (
                  <div
                    data-testid={`branch-rail-${message.id}`}
                    data-reading-layout={branchReadingLayout}
                    className={cn(
                      'mt-3 border-t border-border/70 pt-3',
                      branchReadingLayout === 'horizontal'
                        ? 'flex gap-3 overflow-x-auto pb-2 pr-1 snap-x snap-mandatory'
                        : 'grid gap-2',
                    )}
                  >
                    {message.branches.map((branch) => (
                      <section
                        key={branch.id}
                        data-testid={`branch-${branch.id}`}
                        className={cn(
                          'rounded-md border border-border/80 bg-background/70 px-3 py-2',
                          branchReadingLayout === 'horizontal' && 'min-w-[19rem] max-w-[24rem] shrink-0 snap-start',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Badge variant="outline">{t('workspace.status.branch')}</Badge>
                              <span>{branch.modelLabel}</span>
                              <WorkspaceStatusGlyph
                                label={resolveStatusLabel(branch.status, t)}
                                status={toVisualStatus(branch.status)}
                                className="size-3.5"
                              />
                            </div>
                            <div className="mt-2">
                              <ChatMarkdown content={branch.content} />
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {branch.status === 'loading' ? (
                              <Tooltip content={t('workspace.stopBranch')}>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label={t('workspace.stopBranch')}
                                  onClick={() => void onStopBranch(message.id, branch.id)}
                                >
                                  <XIcon />
                                </Button>
                              </Tooltip>
                            ) : null}
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
                      'absolute right-0 top-0 transition-opacity',
                      hoveredMessageId === message.id ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
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
                        <Tooltip content={t('workspace.retryAssistantMessage')}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('workspace.retryAssistantMessage')}
                            onClick={() => void onRetryAssistantMessage(message.id)}
                          >
                            <RotateCcwIcon />
                          </Button>
                        </Tooltip>
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
    'relative rounded-lg px-1 py-1 pr-12 transition-colors',
    role === 'assistant' && 'text-foreground',
    role === 'user' && 'text-foreground',
    role === 'system' && 'text-amber-900',
    status === 'error' && 'text-destructive',
    status === 'cancelled' && 'text-muted-foreground',
  );
