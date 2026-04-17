import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
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
import removeMarkdown from 'remove-markdown';
import { Popover as PopoverPrimitive } from 'radix-ui';

import { Button } from '../../components/ui/button';
import { MiniConfirm } from '../../components/ui/mini-confirm';
import { Textarea } from '../../components/ui/textarea';
import { Tooltip } from '../../components/ui/tooltip';
import { MIN_ASSISTANT_BRANCH_COLUMN_WIDTH } from '../../domain/config/config-schema';
import { cn } from '../../lib/utils';
import { ChatMarkdown } from '../workspace/chat-markdown';
import type { WorkspaceTranslator } from '../workspace/workspace-copy';
import { WorkspaceStatusGlyph } from '../workspace/workspace-status';

type ChatThreadMessage = ChatThreadProps['messages'][number];
type ChatThreadBranch = ChatThreadMessage['branches'][number];
type FloatingActionOrientation = 'vertical' | 'horizontal';

const FLOATING_ACTION_GAP_PX = 2;
const FLOATING_ACTION_BAR_PADDING_PX = 4;
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
  onCopyMessage: (...input: [{ content: string; mode: 'plain' | 'markdown' }]) => Promise<void>;
  /** 删除分支。 */
  onDeleteBranch: ChatThreadProps['onDeleteBranch'];
};

type FloatingActionBarProps = {
  /** 浮层测试标识。 */
  testId: string;
  /** 当前是否展示。 */
  visible: boolean;
  /** 垂直布局时的按钮数量。 */
  actionCount: number;
  /** 单个按钮视觉尺寸。 */
  buttonSizePx: number;
  /** 垂直布局容器定位。 */
  verticalWrapperClassName: string;
  /** 横向布局容器定位。 */
  horizontalWrapperClassName: string;
  /** 纵向布局定位模式。 */
  verticalPositionMode?: 'owner-center' | 'visible-center';
  /** 纵向滚动视口引用。 */
  scrollViewportRef?: RefObject<HTMLElement | null>;
  /** 按钮内容。 */
  children: ReactNode;
};

/** 统一计算纵向按钮条高度，供定位逻辑复用。 */
const resolveFloatingActionBarHeight = (actionCount: number, buttonSizePx: number) =>
  actionCount * buttonSizePx + Math.max(actionCount - 1, 0) * FLOATING_ACTION_GAP_PX + FLOATING_ACTION_BAR_PADDING_PX * 2;

/** 根据容器高度选择悬浮按钮方向，避免短消息被竖排按钮撑高。 */
const resolveFloatingActionOrientation = (
  containerHeight: number,
  actionCount: number,
  buttonSizePx: number,
): FloatingActionOrientation => {
  if (containerHeight <= 0) {
    return 'vertical';
  }
  const requiredVerticalHeight =
    actionCount * buttonSizePx +
    Math.max(actionCount - 1, 0) * FLOATING_ACTION_GAP_PX +
    FLOATING_ACTION_BAR_PADDING_PX * 2;
  return containerHeight < requiredVerticalHeight ? 'horizontal' : 'vertical';
};

/** 统一悬浮按钮条，按宿主高度在横排和竖排之间切换。 */
const FloatingActionBar = ({
  testId,
  visible,
  actionCount,
  buttonSizePx,
  verticalWrapperClassName,
  horizontalWrapperClassName,
  verticalPositionMode = 'owner-center',
  scrollViewportRef,
  children,
}: FloatingActionBarProps) => {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [orientation, setOrientation] = useState<FloatingActionOrientation>('vertical');
  const [visibleCenterOffsetPx, setVisibleCenterOffsetPx] = useState<number | null>(null);

  useEffect(() => {
    const overlayElement = overlayRef.current;
    const ownerElement =
      overlayElement?.parentElement?.closest<HTMLElement>('[data-testid^="chat-message-bubble-"], [data-testid^="branch-"]') ??
      overlayElement?.parentElement;
    if (!ownerElement) {
      return;
    }

    const updateOrientation = () => {
      setOrientation(resolveFloatingActionOrientation(ownerElement.clientHeight, actionCount, buttonSizePx));
    };

    updateOrientation();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateOrientation);
      return () => {
        window.removeEventListener('resize', updateOrientation);
      };
    }

    const resizeObserver = new ResizeObserver(() => {
      updateOrientation();
    });
    resizeObserver.observe(ownerElement);
    return () => {
      resizeObserver.disconnect();
    };
  }, [actionCount, buttonSizePx]);

  useEffect(() => {
    const overlayElement = overlayRef.current;
    const ownerElement =
      overlayElement?.parentElement?.closest<HTMLElement>('[data-testid^="chat-message-bubble-"], [data-testid^="branch-"]') ??
      overlayElement?.parentElement;
    const viewportElement = scrollViewportRef?.current ?? null;
    if (!overlayElement || !ownerElement || !viewportElement || orientation !== 'vertical' || verticalPositionMode !== 'visible-center') {
      setVisibleCenterOffsetPx(null);
      return;
    }

    const halfActionBarHeight = resolveFloatingActionBarHeight(actionCount, buttonSizePx) / 2;
    const updateVerticalPosition = () => {
      const ownerRect = ownerElement.getBoundingClientRect();
      const viewportRect = viewportElement.getBoundingClientRect();
      const ownerHeight = ownerRect.height > 0 ? ownerRect.height : Math.max(ownerRect.bottom - ownerRect.top, 0);
      const visibleTop = Math.max(ownerRect.top, viewportRect.top);
      const visibleBottom = Math.min(ownerRect.bottom, viewportRect.bottom);
      const visibleCenterY = visibleBottom > visibleTop ? (visibleTop + visibleBottom) / 2 : ownerRect.top + ownerHeight / 2;
      const rawOffsetPx = visibleCenterY - ownerRect.top;
      const maxOffsetPx = Math.max(ownerHeight - halfActionBarHeight, halfActionBarHeight);
      const nextOffsetPx = Math.min(Math.max(rawOffsetPx, halfActionBarHeight), maxOffsetPx);
      setVisibleCenterOffsetPx(nextOffsetPx);
    };

    updateVerticalPosition();
    viewportElement.addEventListener('scroll', updateVerticalPosition, { passive: true });
    window.addEventListener('resize', updateVerticalPosition);

    if (typeof ResizeObserver === 'undefined') {
      return () => {
        viewportElement.removeEventListener('scroll', updateVerticalPosition);
        window.removeEventListener('resize', updateVerticalPosition);
      };
    }

    const resizeObserver = new ResizeObserver(() => {
      updateVerticalPosition();
    });
    resizeObserver.observe(ownerElement);
    resizeObserver.observe(viewportElement);
    return () => {
      viewportElement.removeEventListener('scroll', updateVerticalPosition);
      window.removeEventListener('resize', updateVerticalPosition);
      resizeObserver.disconnect();
    };
  }, [actionCount, buttonSizePx, orientation, scrollViewportRef, verticalPositionMode]);

  return (
    <div
      ref={overlayRef}
      className={cn(
        'pointer-events-none absolute z-20',
        orientation === 'vertical' ? verticalWrapperClassName : horizontalWrapperClassName,
      )}
    >
      <div
        data-testid={testId}
        data-action-orientation={orientation}
        className={cn(
          'rounded-md border border-border/80 bg-background/95 p-0.5 shadow-sm transition-opacity',
          orientation === 'vertical'
            ? verticalPositionMode === 'visible-center'
              ? 'absolute right-0 flex -translate-y-1/2 flex-col'
              : 'sticky top-1/2 flex -translate-y-1/2 flex-col'
            : 'ml-auto flex flex-row items-center',
          visible ? 'pointer-events-auto visible opacity-100' : 'pointer-events-none invisible opacity-0',
        )}
        style={
          orientation === 'vertical' && verticalPositionMode === 'visible-center' && visibleCenterOffsetPx !== null
            ? { top: `${visibleCenterOffsetPx}px`, right: 0 }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
};

/** 侧边栏聊天消息区。 */
export const ChatThread = ({
  messages,
  restoreMessageId: _restoreMessageId,
  availableBranchModels,
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
      className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-gradient-to-b from-background via-background to-muted/20 px-2 py-1"
    >
      <div className="min-w-0 space-y-0.5">
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
              className="group/message relative min-w-0 py-0.5"
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
                ) : hasAssistantBranches ? null : (
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

  const showTopScrollbar = branches.length > 1;
  const topScrollbarWidth = Math.max(contentWidth, viewportWidth, branches.length * MIN_ASSISTANT_BRANCH_COLUMN_WIDTH);

  return (
    <div className="mt-1 min-w-0 w-full">
      {showTopScrollbar ? (
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
        className={cn(branches.length <= 1 ? 'w-full max-w-full overflow-x-hidden pb-2' : 'w-full max-w-full overflow-x-scroll pb-2')}
        onScroll={() => syncScroll('bottom')}
      >
        <div ref={contentRef} className="grid min-w-full w-full gap-2" style={buildBranchRailStyle(branches.length)}>
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
                'group/branch relative w-full shrink-0 border border-border/80 bg-background/70 px-2.5 py-1.5 pr-4',
                selectedBranchId === branch.id && 'border-primary bg-primary/5',
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
                          className="z-50 w-56 rounded-xl border border-border/80 bg-background/95 p-2 shadow-md backdrop-blur"
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
                  <ChatMarkdown content={branch.content} />
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
    'relative min-w-0 grid gap-1 px-0.5 py-0.5 transition-colors',
    role === 'assistant' && 'pr-0 text-foreground',
    role === 'user' && 'pr-10 text-foreground',
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
      gridTemplateColumns: `repeat(2, minmax(${MIN_ASSISTANT_BRANCH_COLUMN_WIDTH}px, 1fr))`,
    };
  }
  return {
    gridTemplateColumns: `repeat(${branchCount}, ${MIN_ASSISTANT_BRANCH_COLUMN_WIDTH}px)`,
  };
};
