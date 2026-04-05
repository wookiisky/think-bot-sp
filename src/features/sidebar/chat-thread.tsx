import { useEffect, useRef, useState } from 'react';
import { CopyIcon, Edit3Icon, GitBranchPlusIcon, RotateCcwIcon, SaveIcon, Trash2Icon, XIcon } from 'lucide-react';
import removeMarkdown from 'remove-markdown';

import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { Textarea } from '../../components/ui/textarea';
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
  onStopBranch,
  onDeleteBranch,
  onNotice,
}: ChatThreadProps) => {
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [isNarrowBranchViewport, setIsNarrowBranchViewport] = useState(false);

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
      <div className="flex flex-col gap-3">
        {messages.length === 0 ? <p className="text-sm text-muted-foreground">{t('workspace.emptyMessages')}</p> : null}
        {messages.map((message) => {
          const statusLabel = resolveStatusLabel(message.status, t);
          const isEditing = message.role === 'user' && editingMessageId === message.id;
          const visibleContent = message.displayContent ?? message.content;
          const branchReadingLayout =
            message.branches.length > 1 && !isNarrowBranchViewport ? 'horizontal' : 'vertical';

          return (
            <div
              key={message.id}
              ref={(element) => {
                messageRefs.current[message.id] = element;
              }}
            >
              <Card
                data-testid={`chat-message-${message.id}`}
                size="sm"
                className={cn(
                  'border border-border/80 bg-card/80 py-3 shadow-sm ring-1 ring-foreground/5',
                  message.role === 'assistant' && 'border-primary/25',
                  message.role === 'user' && 'border-border',
                  message.status === 'error' && 'border-destructive/30',
                )}
              >
                <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border/70 pb-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={message.role === 'assistant' ? 'default' : 'outline'}>
                      {t(`workspace.role.${message.role}`)}
                    </Badge>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      <WorkspaceStatusGlyph label={statusLabel} status={toVisualStatus(message.status)} className="size-3.5" />
                      <span>{statusLabel}</span>
                    </span>
                  </div>

                  {message.role === 'assistant' && message.status !== 'loading' ? (
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={t('workspace.retryAssistantMessage')}
                        title={t('workspace.retryAssistantMessage')}
                        onClick={() => void onRetryAssistantMessage(message.id)}
                      >
                        <RotateCcwIcon data-icon="inline-start" />
                        {t('workspace.retryAssistantMessage')}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={t('workspace.expandBranches')}
                        title={t('workspace.expandBranches')}
                        onClick={() => void onExpandBranches(message.id)}
                      >
                        <GitBranchPlusIcon data-icon="inline-start" />
                        {t('workspace.expandBranches')}
                      </Button>
                    </div>
                  ) : null}
                </CardHeader>

                <CardContent className="grid gap-3">
                  {isEditing ? (
                    <div className="grid gap-2">
                      <Textarea
                        aria-label={t('workspace.editMessageInput')}
                        value={editingText}
                        onChange={(event) => onEditingTextChange(event.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          aria-label={t('workspace.saveAndResend')}
                          disabled={editingText.trim().length === 0}
                          onClick={() => void onSubmitEdit(message.id)}
                        >
                          <SaveIcon data-icon="inline-start" />
                          {t('workspace.saveAndResend')}
                        </Button>
                        <Button type="button" variant="outline" size="sm" aria-label={t('workspace.cancelEdit')} onClick={onCancelEdit}>
                          <XIcon data-icon="inline-start" />
                          {t('workspace.cancelEdit')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <ChatMarkdown content={visibleContent} />
                  )}

                  {restoreMessageId === message.id ? (
                    <div className="flex items-center gap-2 text-xs text-primary">
                      <WorkspaceStatusGlyph label={t('workspace.status.restore')} status="loading" className="size-3.5" />
                      <span>{t('workspace.status.restore')}</span>
                    </div>
                  ) : null}

                  {message.status === 'error' ? <p className="text-xs text-destructive">{message.errorMessage ?? t('workspace.status.error')}</p> : null}
                  {message.status === 'cancelled' ? (
                    <p className="text-xs text-muted-foreground">{message.errorMessage ?? t('workspace.status.cancelled')}</p>
                  ) : null}

                  {!isEditing ? (
                    <div className="flex flex-wrap justify-end gap-1">
                      {message.role === 'user' ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={t('workspace.editMessage')}
                            title={t('workspace.editMessage')}
                            onClick={() => onStartEdit(message.id, message.content)}
                          >
                            <Edit3Icon data-icon="inline-start" />
                            {t('workspace.editMessage')}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={t('workspace.retryUserMessage')}
                            title={t('workspace.retryUserMessage')}
                            onClick={() => void onRetryUserMessage(message.id)}
                          >
                            <RotateCcwIcon data-icon="inline-start" />
                            {t('workspace.retryUserMessage')}
                          </Button>
                        </>
                      ) : null}
                      {message.role === 'assistant' ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={t('workspace.scrollToMessageTop')}
                            title={t('workspace.scrollToMessageTop')}
                            onClick={() => scrollToMessage(message.id, 'start')}
                          >
                            {t('workspace.scrollToMessageTop')}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={t('workspace.scrollToMessageBottom')}
                            title={t('workspace.scrollToMessageBottom')}
                            onClick={() => scrollToMessage(message.id, 'end')}
                          >
                            {t('workspace.scrollToMessageBottom')}
                          </Button>
                        </>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={t('workspace.copyPlainText')}
                        title={t('workspace.copyPlainText')}
                        onClick={() => void handleCopyMessage({ content: message.content, mode: 'plain' })}
                      >
                        <CopyIcon data-icon="inline-start" />
                        {t('workspace.copyPlainText')}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={t('workspace.copyMarkdown')}
                        title={t('workspace.copyMarkdown')}
                        onClick={() => void handleCopyMessage({ content: message.content, mode: 'markdown' })}
                      >
                        <CopyIcon data-icon="inline-start" />
                        {t('workspace.copyMarkdown')}
                      </Button>
                    </div>
                  ) : null}

                  {message.branches.length > 0 ? (
                    <div
                      data-testid={`branch-rail-${message.id}`}
                      data-reading-layout={branchReadingLayout}
                      className={cn(
                        'border-t border-border/70 pt-3',
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
                                <WorkspaceStatusGlyph label={resolveStatusLabel(branch.status, t)} status={toVisualStatus(branch.status)} className="size-3.5" />
                              </div>
                              <div className="mt-2">
                                <ChatMarkdown content={branch.content} />
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              {branch.status === 'loading' ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label={t('workspace.stopBranch')}
                                  title={t('workspace.stopBranch')}
                                  onClick={() => void onStopBranch(message.id, branch.id)}
                                >
                                  <XIcon />
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                aria-label={t('workspace.deleteBranch')}
                                title={t('workspace.deleteBranch')}
                                onClick={() => void onDeleteBranch(message.id, branch.id)}
                              >
                                <Trash2Icon />
                              </Button>
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
                </CardContent>
              </Card>
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
