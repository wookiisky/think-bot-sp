import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  CheckIcon,
  ChevronsDownIcon,
  ChevronsUpIcon,
  CopyIcon,
  Edit3Icon,
  EyeIcon,
  FileCode2Icon,
  GitBranchPlusIcon,
  RotateCcwIcon,
  SaveIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import { Popover as PopoverPrimitive } from 'radix-ui';

import { Button } from '../../components/ui/button';
import { MiniConfirm } from '../../components/ui/mini-confirm';
import { Textarea } from '../../components/ui/textarea';
import { Tooltip } from '../../components/ui/tooltip';
import type { AssistantMarkdownDisplayConfig } from '../../domain/config/assistant-markdown-display-config';
import { MIN_ASSISTANT_BRANCH_COLUMN_WIDTH } from '../../domain/config/config-schema';
import { cn } from '../../lib/utils';
import { ChatMarkdown } from '../workspace/chat-markdown';
import { FloatingActionBar } from '../workspace/floating-action-bar';
import { normalizeMessageCopyContent, type MessageCopyMode } from '../workspace/message-copy';
import type { WorkspaceTranslator } from '../workspace/workspace-copy';
import { WorkspaceStatusGlyph } from '../workspace/workspace-status';

type ChatThreadMessage = ChatThreadProps['messages'][number];
type ChatThreadBranch = ChatThreadMessage['branches'][number];

const USER_MESSAGE_ACTION_BUTTON_SIZE_PX = 24;
const USER_MESSAGE_ACTION_COUNT = 4;
const ASSISTANT_BRANCH_ACTION_BUTTON_SIZE_PX = 20;
const ASSISTANT_BRANCH_ACTION_COUNT = 8;

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
  /** 当前可用的分支模型列表。 */
  availableBranchModels: Array<{
    /** 模型 id。 */
    id: string;
    /** 模型展示名。 */
    name: string;
  }>;
  /** 当前编辑中的用户消息 id。 */
  editingMessageId: string | null;
  /** 当前编辑草稿。 */
  editingText: string;
  /** 文案翻译函数。 */
  t: WorkspaceTranslator;
  /** 助手消息 Markdown 展示配置。 */
  assistantMarkdownDisplayConfig: AssistantMarkdownDisplayConfig;
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
  onExpandBranches: (...input: [messageId: string, modelId: string]) => Promise<void>;
  /** 停止当前消息所属会话。 */
  onStop: () => Promise<void>;
  /** 停止单个分支。 */
  onStopBranch: (...input: [messageId: string, branchId: string]) => Promise<void>;
  /** 删除单个分支。 */
  onDeleteBranch: (...input: [messageId: string, branchId: string]) => Promise<void>;
  /** 打开单个分支的预览层。 */
  onOpenBranchPreview?: (...input: [messageId: string, branchId: string]) => void;
  /** 更新当前工作台提示。 */
  onNotice: (...input: [notice: string]) => void;
};

type AssistantBranchRailProps = {
  /** 助手消息 id。 */
  messageId: string;
  /** 当前展示分支。 */
  branches: ChatThreadBranch[];
  /** 当前选中主分支。 */
  selectedBranchId: string | null;
  /** 可用模型列表。 */
  availableBranchModels: ChatThreadProps['availableBranchModels'];
  /** 是否允许切换主分支。 */
  canSelectAssistantBranch: boolean;
  /** 当前 hover 的分支目标。 */
  hoveredBranchTarget: { messageId: string; branchId: string } | null;
  /** 当前展开模型弹层的目标。 */
  expandBranchPopoverTarget: { messageId: string; branchId: string } | null;
  /** 分支节点引用。 */
  branchRefs: RefObject<Record<string, HTMLElement | null>>;
  /** 聊天滚动视口引用。 */
  scrollViewportRef: RefObject<HTMLElement | null>;
  /** 文案翻译函数。 */
  t: WorkspaceTranslator;
  /** 助手消息 Markdown 展示配置。 */
  assistantMarkdownDisplayConfig: AssistantMarkdownDisplayConfig;
  /** 更新当前 hover 的分支。 */
  onHoverBranch: (target: { messageId: string; branchId: string } | null) => void;
  /** 更新分支模型弹层目标。 */
  onExpandBranchPopoverTarget: (...input: [{ messageId: string; branchId: string } | null]) => void;
  /** 新增分支。 */
  onExpandBranches: ChatThreadProps['onExpandBranches'];
  /** 停止当前会话。 */
  onStop: ChatThreadProps['onStop'];
  /** 停止单个分支。 */
  onStopBranch: ChatThreadProps['onStopBranch'];
  /** 重试分支。 */
  onRetryAssistantMessage: ChatThreadProps['onRetryAssistantMessage'];
  /** 打开分支预览。 */
  onOpenBranchPreview: NonNullable<ChatThreadProps['onOpenBranchPreview']>;
  /** 切换主分支。 */
  onSelectAssistantBranch: ChatThreadProps['onSelectAssistantBranch'];
  /** 定位到分支位置。 */
  onScrollToBranch: (...input: [branchId: string, block: 'start' | 'end']) => void;
  /** 复制消息内容。 */
  onCopyMessage: (...input: [{ content: string; mode: MessageCopyMode }]) => Promise<void>;
  /** 删除分支。 */
  onDeleteBranch: ChatThreadProps['onDeleteBranch'];
};

/** 侧边栏聊天消息区。 */
export const ChatThread = ({
  messages,
  restoreMessageId: _restoreMessageId,
  availableBranchModels,
  editingMessageId,
  editingText,
  t,
  assistantMarkdownDisplayConfig,
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
  onOpenBranchPreview,
  onNotice,
}: ChatThreadProps) => {
  const branchRefs = useRef<Record<string, HTMLElement | null>>({});
  const threadViewportRef = useRef<HTMLElement | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [hoveredBranchTarget, setHoveredBranchTarget] = useState<{ messageId: string; branchId: string } | null>(null);
  const [expandBranchPopoverTarget, setExpandBranchPopoverTarget] = useState<{ messageId: string; branchId: string } | null>(null);
  const handleOpenBranchPreview = onOpenBranchPreview ?? (() => {});

  /** 复制指定格式的消息内容。 */
  const handleCopyMessage = async (input: { content: string; mode: MessageCopyMode }) => {
    const nextContent = normalizeMessageCopyContent(input.content, input.mode);
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

  /** 滚动到目标分支顶部或底部。 */
  const scrollToBranch = (branchId: string, block: 'start' | 'end') => {
    branchRefs.current[branchId]?.scrollIntoView({
      behavior: 'smooth',
      block,
      inline: 'nearest',
    });
  };

  return (
    <section
      ref={threadViewportRef}
      data-testid="chat-thread-scroll-viewport"
      className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto"
    >
      <div className="min-w-0 w-full divide-y divide-border/70">
        {messages.length === 0 ? <p className="text-sm text-muted-foreground">{t('workspace.emptyMessages')}</p> : null}
        {messages.map((message) => {
          const messageIndex = messages.findIndex((current) => current.id === message.id);
          const isEditing = message.role === 'user' && editingMessageId === message.id;
          const visibleContent = message.displayContent ?? message.content;
          const displayBranches = resolveDisplayBranches(message, t('workspace.status.primaryBranch'));
          const hasAssistantBranches = message.role === 'assistant' && displayBranches.length > 0;
          const canSelectAssistantBranch = message.role === 'assistant' && messages.slice(messageIndex + 1).length === 0;

          return (
            <div
              key={message.id}
              data-testid={`chat-message-${message.id}`}
              data-message-role={message.role}
              className="group/message relative min-w-0 w-full"
              onMouseEnter={() => setHoveredMessageId(message.id)}
              onMouseLeave={() => setHoveredMessageId((current) => (current === message.id ? null : current))}
              onFocus={() => setHoveredMessageId(message.id)}
              onBlur={(event) => {
                const relatedTarget = event.relatedTarget;
                if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) {
                  return;
                }
                setHoveredMessageId((current) => (current === message.id ? null : current));
              }}
            >
              <article
                data-testid={`chat-message-bubble-${message.id}`}
                className={resolveMessageBubbleClass(message.role, message.status)}
              >
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
                ) : hasAssistantBranches ? null : message.role === 'assistant' ? (
                  <ChatMarkdown content={visibleContent} assistantDisplayConfig={assistantMarkdownDisplayConfig} />
                ) : (
                  <ChatMarkdown content={visibleContent} />
                )}

                {!hasAssistantBranches && message.status === 'error' ? (
                  <p className="mt-1 text-xs text-destructive">{message.errorMessage ?? t('workspace.status.error')}</p>
                ) : null}
                {!hasAssistantBranches && message.status === 'cancelled' ? (
                  <p className="mt-1 text-xs text-muted-foreground">{message.errorMessage ?? t('workspace.status.cancelled')}</p>
                ) : null}

                {hasAssistantBranches ? (
                  <AssistantBranchRail
                    messageId={message.id}
                    branches={displayBranches}
                    selectedBranchId={message.selectedBranchId}
                    availableBranchModels={availableBranchModels}
                    canSelectAssistantBranch={canSelectAssistantBranch}
                    hoveredBranchTarget={hoveredBranchTarget}
                    expandBranchPopoverTarget={expandBranchPopoverTarget}
                    branchRefs={branchRefs}
                    scrollViewportRef={threadViewportRef}
                    t={t}
                    assistantMarkdownDisplayConfig={assistantMarkdownDisplayConfig}
                    onHoverBranch={setHoveredBranchTarget}
                    onExpandBranchPopoverTarget={setExpandBranchPopoverTarget}
                    onExpandBranches={onExpandBranches}
                    onStop={onStop}
                    onStopBranch={onStopBranch}
                    onRetryAssistantMessage={onRetryAssistantMessage}
                    onOpenBranchPreview={handleOpenBranchPreview}
                    onSelectAssistantBranch={onSelectAssistantBranch}
                    onScrollToBranch={scrollToBranch}
                    onCopyMessage={handleCopyMessage}
                    onDeleteBranch={onDeleteBranch}
                  />
                ) : null}

                {!isEditing && message.status !== 'loading' && message.role === 'user' ? (
                  <FloatingActionBar
                    testId={`chat-message-actions-${message.id}`}
                    visible={hoveredMessageId === message.id}
                    actionCount={USER_MESSAGE_ACTION_COUNT}
                    buttonSizePx={USER_MESSAGE_ACTION_BUTTON_SIZE_PX}
                    verticalWrapperClassName="inset-y-0 right-1"
                    horizontalWrapperClassName="-top-1 right-1"
                  >
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
                  </FloatingActionBar>
                ) : null}
              </article>
            </div>
          );
        })}
      </div>
    </section>
  );
};

/** 助手分支阅读区，包含上下同步滚动条和固定定位按钮栏。 */
const AssistantBranchRail = ({
  messageId,
  branches,
  selectedBranchId,
  availableBranchModels,
  canSelectAssistantBranch,
  hoveredBranchTarget,
  expandBranchPopoverTarget,
  branchRefs,
  scrollViewportRef,
  t,
  assistantMarkdownDisplayConfig,
  onHoverBranch,
  onExpandBranchPopoverTarget,
  onExpandBranches,
  onStop,
  onStopBranch,
  onRetryAssistantMessage,
  onOpenBranchPreview,
  onSelectAssistantBranch,
  onScrollToBranch,
  onCopyMessage,
  onDeleteBranch,
}: AssistantBranchRailProps) => {
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const bottomScrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const syncingScrollRef = useRef<'top' | 'bottom' | null>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const activeBranchId = hoveredBranchTarget?.messageId === messageId ? hoveredBranchTarget.branchId : null;

  useEffect(() => {
    const contentElement = contentRef.current;
    const bottomElement = bottomScrollRef.current;
    const updateMetrics = () => {
      setContentWidth(contentElement?.scrollWidth ?? 0);
      setViewportWidth(bottomElement?.clientWidth ?? 0);
    };

    updateMetrics();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateMetrics);
      return () => {
        window.removeEventListener('resize', updateMetrics);
      };
    }

    const resizeObserver = new ResizeObserver(() => {
      updateMetrics();
    });
    if (contentElement) {
      resizeObserver.observe(contentElement);
    }
    if (bottomElement) {
      resizeObserver.observe(bottomElement);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [branches.length]);

  const syncScroll = (source: 'top' | 'bottom') => {
    const topElement = topScrollRef.current;
    const bottomElement = bottomScrollRef.current;
    if (!topElement || !bottomElement) {
      return;
    }
    if (syncingScrollRef.current && syncingScrollRef.current !== source) {
      syncingScrollRef.current = null;
      return;
    }

    syncingScrollRef.current = source;
    const nextScrollLeft = source === 'top' ? topElement.scrollLeft : bottomElement.scrollLeft;
    if (source === 'top') {
      bottomElement.scrollLeft = nextScrollLeft;
    } else {
      topElement.scrollLeft = nextScrollLeft;
    }
  };

  const hasHorizontalOverflow = branches.length > 2 && contentWidth > viewportWidth;
  const topScrollbarWidth = Math.max(contentWidth, viewportWidth);

  return (
    <div className="min-w-0 w-full">
      {hasHorizontalOverflow ? (
        <div
          ref={topScrollRef}
          data-testid={`branch-rail-top-scroll-${messageId}`}
          className="w-full max-w-full overflow-x-scroll overflow-y-hidden pb-1.5"
          onScroll={() => syncScroll('top')}
        >
          <div style={{ width: topScrollbarWidth, height: 1 }} />
        </div>
      ) : null}

      <div
        ref={bottomScrollRef}
        data-testid={`branch-rail-${messageId}`}
        data-reading-layout={resolveBranchRailLayout(branches)}
        className={cn(branches.length <= 2 ? 'w-full max-w-full overflow-x-hidden' : 'w-full max-w-full overflow-x-auto')}
        onScroll={() => syncScroll('bottom')}
      >
        <div
          ref={contentRef}
          data-testid={`branch-rail-content-${messageId}`}
          className="grid min-w-full w-full divide-x divide-border/70"
          style={buildBranchRailStyle(branches.length)}
        >
          {branches.map((branch) => (
            <section
              key={branch.id}
              ref={(element) => {
                if (branchRefs.current) {
                  branchRefs.current[branch.id] = element;
                }
              }}
              data-testid={`branch-${branch.id}`}
              className={cn(
                'group/branch relative w-full shrink-0 px-2 py-1.5 pr-10',
                selectedBranchId === branch.id && 'border-t-2 border-t-primary',
              )}
              onMouseEnter={() => onHoverBranch({ messageId, branchId: branch.id })}
              onMouseLeave={(event) => {
                const relatedTarget = event.relatedTarget;
                if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) {
                  return;
                }
                onHoverBranch(null);
              }}
              onFocus={() => onHoverBranch({ messageId, branchId: branch.id })}
              onBlur={(event) => {
                const relatedTarget = event.relatedTarget;
                if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) {
                  return;
                }
                onHoverBranch(null);
              }}
            >
              <div className="min-w-0">
                <FloatingActionBar
                  testId={`branch-actions-${branch.id}`}
                  visible={activeBranchId === branch.id}
                  actionCount={ASSISTANT_BRANCH_ACTION_COUNT}
                  buttonSizePx={ASSISTANT_BRANCH_ACTION_BUTTON_SIZE_PX}
                  verticalWrapperClassName="inset-y-0 right-px"
                  horizontalWrapperClassName="top-1 right-px"
                  verticalPositionMode="visible-center"
                  scrollViewportRef={scrollViewportRef}
                >
                    <PopoverPrimitive.Root
                      open={expandBranchPopoverTarget?.messageId === messageId && expandBranchPopoverTarget?.branchId === branch.id}
                      onOpenChange={(open) => onExpandBranchPopoverTarget(open ? { messageId, branchId: branch.id } : null)}
                    >
                      <Tooltip content={t('workspace.expandBranches')}>
                        <PopoverPrimitive.Trigger asChild>
                          <Button type="button" variant="ghost" size="icon-xs" aria-label={t('workspace.expandBranches')}>
                            <GitBranchPlusIcon />
                          </Button>
                        </PopoverPrimitive.Trigger>
                      </Tooltip>
                      <PopoverPrimitive.Portal>
                        <PopoverPrimitive.Content
                          side="left"
                          sideOffset={8}
                          align="center"
                          className="z-50 w-56 border border-border/80 bg-popover p-2 ring-1 ring-foreground/8"
                        >
                          <div className="mb-2 text-xs font-medium text-muted-foreground">{t('workspace.selectBranchModel')}</div>
                          {availableBranchModels.length === 0 ? (
                            <p className="text-xs text-muted-foreground">{t('workspace.noAvailableBranchModels')}</p>
                          ) : (
                            <div className="grid gap-1">
                              {availableBranchModels.map((model) => (
                                <Button
                                  key={model.id}
                                  type="button"
                                  variant="ghost"
                                  className="justify-start"
                                  onClick={() => {
                                    onExpandBranchPopoverTarget(null);
                                    void onExpandBranches(messageId, model.id);
                                  }}
                                >
                                  {model.name}
                                </Button>
                              ))}
                            </div>
                          )}
                        </PopoverPrimitive.Content>
                      </PopoverPrimitive.Portal>
                    </PopoverPrimitive.Root>
                    {branch.status === 'loading' ? (
                      <Tooltip content={t(branch.isPrimary ? 'workspace.stop' : 'workspace.stopBranch')}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={t(branch.isPrimary ? 'workspace.stop' : 'workspace.stopBranch')}
                          onClick={() => void (branch.isPrimary ? onStop() : onStopBranch(messageId, branch.id))}
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
                          onClick={() => void onRetryAssistantMessage(messageId, branch.id)}
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
                        disabled={!canSelectAssistantBranch || selectedBranchId === branch.id || branch.status === 'loading'}
                        onClick={() => void onSelectAssistantBranch(messageId, branch.id)}
                      >
                        <CheckIcon />
                      </Button>
                    </Tooltip>
                    <Tooltip content={t('workspace.scrollToMessageTop')}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t('workspace.scrollToMessageTop')}
                        onClick={() => onScrollToBranch(branch.id, 'start')}
                      >
                        <ChevronsUpIcon />
                      </Button>
                    </Tooltip>
                    <Tooltip content={t('workspace.scrollToMessageBottom')}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t('workspace.scrollToMessageBottom')}
                        onClick={() => onScrollToBranch(branch.id, 'end')}
                      >
                        <ChevronsDownIcon />
                      </Button>
                    </Tooltip>
                    <Tooltip content={t('workspace.copyPlainText')}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t('workspace.copyPlainText')}
                        onClick={() => void onCopyMessage({ content: branch.content, mode: 'plain' })}
                      >
                        <CopyIcon />
                      </Button>
                    </Tooltip>
                    <Tooltip content={t('workspace.copyMarkdown')}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t('workspace.copyMarkdown')}
                        onClick={() => void onCopyMessage({ content: branch.content, mode: 'markdown' })}
                      >
                        <FileCode2Icon />
                      </Button>
                    </Tooltip>
                    <MiniConfirm
                      message={t('workspace.deleteBranch')}
                      cancelLabel={t('common.cancel')}
                      confirmLabel={t('workspace.deleteBranch')}
                      contentTestId={`delete-branch-confirm-${branch.id}`}
                      onConfirm={() => onDeleteBranch(messageId, branch.id)}
                    >
                      <Tooltip content={t('workspace.deleteBranch')}>
                        <Button type="button" variant="ghost" size="icon-xs" aria-label={t('workspace.deleteBranch')}>
                          <Trash2Icon />
                        </Button>
                      </Tooltip>
                    </MiniConfirm>
                </FloatingActionBar>

                <div
                  data-testid={`branch-header-${branch.id}`}
                  className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground"
                >
                  <span className="min-w-0 truncate">{branch.modelLabel}</span>
                  <Tooltip content={t('workspace.openBranchPreview')}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t('workspace.openBranchPreview')}
                      onClick={() => onOpenBranchPreview(messageId, branch.id)}
                    >
                      <EyeIcon />
                    </Button>
                  </Tooltip>
                </div>
                {branch.status === 'loading' ? (
                  <div className="mt-1 flex items-center">
                    <WorkspaceStatusGlyph label={t('workspace.status.loading')} status="loading" className="size-3.5" />
                  </div>
                ) : null}
                <div className="mt-1">
                  <ChatMarkdown content={branch.content} assistantDisplayConfig={assistantMarkdownDisplayConfig} />
                </div>
              </div>
              {branch.status === 'error' ? <p className="mt-1 text-xs text-destructive">{branch.errorMessage ?? t('workspace.status.error')}</p> : null}
              {branch.status === 'cancelled' ? (
                <p className="mt-1 text-xs text-muted-foreground">{branch.errorMessage ?? t('workspace.status.cancelled')}</p>
              ) : null}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};

/** 统一根据角色和运行态生成消息气泡样式。 */
const resolveMessageBubbleClass = (role: 'user' | 'assistant' | 'system', status: 'loading' | 'done' | 'error' | 'cancelled') =>
  cn(
    'relative min-w-0 grid gap-1 transition-colors',
    role === 'assistant' && 'w-full bg-background px-0 pr-0 text-foreground',
    role === 'user' && 'w-full bg-muted/55 px-2 py-1.5 pr-10 text-foreground',
    role === 'system' && 'pr-0 text-amber-900',
    status === 'error' && 'text-destructive',
    status === 'cancelled' && 'text-muted-foreground',
  );

/** 统一助手消息展示分支，兼容旧消息只保留主回答的情况。 */
const resolveDisplayBranches = (message: ChatThreadMessage, primaryBranchLabel: string): ChatThreadBranch[] => {
  if (message.role !== 'assistant') {
    return [];
  }
  if (message.branches.length > 0) {
    return message.branches;
  }
  return [
    {
      id: `${message.id}:primary`,
      modelId: '',
      modelLabel: primaryBranchLabel,
      isPrimary: true,
      content: message.content,
      status: message.status,
      errorMessage: message.errorMessage,
    },
  ];
};

/** 根据分支数量选择阅读布局模式。 */
const resolveBranchRailLayout = (branches: ChatThreadBranch[]) => {
  if (branches.length <= 1) {
    return 'single';
  }
  if (branches.length <= 2) {
    return 'responsive-two-columns';
  }
  return 'fixed-multi-columns';
};

/** 生成分支阅读区栅格样式。 */
const buildBranchRailStyle = (branchCount: number) => {
  if (branchCount <= 1) {
    return {
      gridTemplateColumns: 'minmax(0, 1fr)',
    };
  }
  if (branchCount <= 2) {
    return {
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    };
  }
  return {
    gridTemplateColumns: `repeat(${branchCount}, minmax(${MIN_ASSISTANT_BRANCH_COLUMN_WIDTH}px, 1fr))`,
  };
};
