import { useEffect, useState } from 'react';

import type { AssistantMarkdownDisplayConfig } from '../../domain/config/assistant-markdown-display-config';
import { cn } from '../../lib/utils';
import { COMPACT_PROMPT_TAB_CLASS, getCompactPromptTabStateClass } from '../../ui/compact-layout';
import { ChatInput } from '../sidebar/chat-input';
import { ChatThread } from '../sidebar/chat-thread';
import { BranchPreviewOverlay } from './branch-preview-overlay';
import type { WorkspaceController } from './use-workspace-controller';
import { getPromptTabStatusLabelKey, type WorkspaceTranslator } from './workspace-copy';
import {
  findBranchPreviewDetail,
  getPromptTabStatusKind,
  promptTabHasContent,
  shouldTriggerPromptTab,
  type ChatMessageState,
  type ComposerState,
  type PromptTabDefinition,
} from './workspace-state';
import type { WorkspaceToastPayload } from './workspace-toast';

type BranchPreviewTarget = {
  /** 所属 promptTab id。 */
  promptTabId: string;
  /** 所属助手消息 id。 */
  messageId: string;
  /** 目标分支 id。 */
  branchId: string;
};

type WorkspaceWorkbenchProps = {
  /** DOM id 前缀，用于 tab 与 tabpanel 的 aria 关联。 */
  idPrefix: string;
  /** tablist 的无障碍名称。 */
  tablistLabel: string;
  /** 共享会话控制器。 */
  workspace: WorkspaceController;
  /** 当前应渲染的标签；恢复前的占位标签由外层决定。 */
  visiblePromptTabs: PromptTabDefinition[];
  /** 工作台翻译函数。 */
  t: WorkspaceTranslator;
  /** 是否禁用标签点击。 */
  tabsDisabled?: boolean;
  /** 点击快捷标签时是否允许直接触发请求。 */
  canTriggerPromptTab: boolean;
  /** 是否禁用输入区。 */
  composerDisabled: boolean;
  /** 助手消息 Markdown 展示配置。 */
  assistantMarkdownDisplayConfig: AssistantMarkdownDisplayConfig;
  /** 助手分支列最小宽度。 */
  assistantBranchColumnWidth: number;
  /** 直接发送快捷标签提示词。 */
  onTriggerPromptTab: (promptTab: PromptTabDefinition) => Promise<void>;
  /** 推送页面级 toast。 */
  onToast: (toast: WorkspaceToastPayload) => void;
};

const EMPTY_MESSAGES: ChatMessageState[] = [];
const EMPTY_COMPOSER: ComposerState = { text: '', images: [], selectedModelId: '' };

/** 侧边栏与历史页共用的工作台：标签栏、每个标签的消息线程、分支预览层和输入区。 */
export const WorkspaceWorkbench = ({
  idPrefix,
  tablistLabel,
  workspace,
  visiblePromptTabs,
  t,
  tabsDisabled = false,
  canTriggerPromptTab,
  composerDisabled,
  assistantMarkdownDisplayConfig,
  assistantBranchColumnWidth,
  onTriggerPromptTab,
  onToast,
}: WorkspaceWorkbenchProps) => {
  const [branchPreviewTarget, setBranchPreviewTarget] = useState<BranchPreviewTarget | null>(null);
  const { ready, promptTabs, activePromptTabId, messageMap, restoreMessageIds, activeSessionIds, composerMap, models, includePageContent, editingMap } =
    workspace.view;
  const {
    selectPromptTab, updateComposer, updateEditing, setIncludePageContent, send, editUserMessage, retryUserMessage,
    retryAssistantMessage, selectAssistantBranch, expandBranches, stop, stopBranch, deleteBranch, clearTab, exportConversation,
  } = workspace.actions;

  const activePromptTab = ready ? promptTabs.find((promptTab) => promptTab.id === activePromptTabId) ?? promptTabs[0] ?? null : null;
  const activeComposer = (activePromptTab ? composerMap[activePromptTab.id] : null) ?? EMPTY_COMPOSER;
  const activeSessionId = activePromptTab ? activeSessionIds[activePromptTab.id] ?? null : null;
  const branchPreview =
    ready && branchPreviewTarget
      ? findBranchPreviewDetail(messageMap[branchPreviewTarget.promptTabId] ?? [], branchPreviewTarget.messageId, branchPreviewTarget.branchId)
      : null;

  // 切页或重新生成使目标失效后清除打开意图，避免消息恢复时自行重新打开预览。
  useEffect(() => {
    if (branchPreviewTarget && !branchPreview) {
      setBranchPreviewTarget(null);
    }
  }, [branchPreview, branchPreviewTarget]);

  return (
    <>
      <section role="tablist" aria-label={tablistLabel} className="shrink-0 border-b border-border px-2 py-[3px]">
        <div className="flex flex-wrap gap-1">
          {visiblePromptTabs.map((promptTab) => {
            const sessionId = ready ? activeSessionIds[promptTab.id] ?? null : null;
            const messages = ready ? messageMap[promptTab.id] ?? EMPTY_MESSAGES : EMPTY_MESSAGES;
            const status = getPromptTabStatusKind(promptTab, sessionId);
            const statusKey = getPromptTabStatusLabelKey(status);
            const statusLabel = statusKey ? t(statusKey) : promptTab.name;
            const isActive = !ready || promptTab.id === activePromptTabId;
            const hasPromptTabText = ready && promptTabHasContent(messages);
            const showLoadingRing = status === 'loading' || status === 'auto-running';

            return (
              <button
                key={promptTab.id}
                id={`${idPrefix}-tab-${promptTab.id}`}
                role="tab"
                aria-selected={isActive}
                aria-controls={`${idPrefix}-tabpanel-${promptTab.id}`}
                type="button"
                disabled={tabsDisabled}
                title={statusKey ? `${promptTab.name} · ${statusLabel}` : promptTab.name}
                className={cn(COMPACT_PROMPT_TAB_CLASS, getCompactPromptTabStateClass({ isActive, showLoadingRing }))}
                onClick={() => {
                  selectPromptTab(promptTab.id);
                  if (!ready || !canTriggerPromptTab) {
                    return;
                  }
                  if (!shouldTriggerPromptTab(promptTab, messages, sessionId)) {
                    return;
                  }
                  void onTriggerPromptTab(promptTab);
                }}
              >
                {showLoadingRing ? (
                  <span data-testid={`prompt-tab-loading-${promptTab.id}`} className="sr-only">
                    {statusLabel}
                  </span>
                ) : null}

                <span className="relative z-10 truncate">{promptTab.name}</span>

                {hasPromptTabText && !showLoadingRing ? (
                  <span
                    data-testid={`prompt-tab-line-${promptTab.id}`}
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-primary"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <section className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {visiblePromptTabs.map((promptTab) => (
          <div
            key={promptTab.id}
            id={`${idPrefix}-tabpanel-${promptTab.id}`}
            role="tabpanel"
            aria-labelledby={`${idPrefix}-tab-${promptTab.id}`}
            hidden={ready && promptTab.id !== activePromptTabId}
            className={!ready || promptTab.id === activePromptTabId ? 'flex h-full min-h-0 min-w-0 flex-col' : 'hidden'}
          >
            <ChatThread
              messages={ready ? messageMap[promptTab.id] ?? EMPTY_MESSAGES : EMPTY_MESSAGES}
              restoreMessageId={ready ? restoreMessageIds[promptTab.id] ?? null : null}
              editingMessageId={ready ? editingMap[promptTab.id]?.messageId ?? null : null}
              editingText={ready ? editingMap[promptTab.id]?.text ?? '' : ''}
              availableBranchModels={models}
              t={t}
              assistantMarkdownDisplayConfig={assistantMarkdownDisplayConfig}
              assistantBranchColumnWidth={assistantBranchColumnWidth}
              onStartEdit={(messageId, content) => updateEditing(promptTab.id, { messageId, text: content })}
              onEditingTextChange={(text) => {
                const currentEditing = editingMap[promptTab.id];
                if (!currentEditing) {
                  return;
                }
                updateEditing(promptTab.id, { ...currentEditing, text });
              }}
              onCancelEdit={() => updateEditing(promptTab.id, null)}
              onSubmitEdit={(messageId) => editUserMessage(promptTab.id, messageId, editingMap[promptTab.id]?.text ?? '')}
              onRetryUserMessage={(messageId) => retryUserMessage(promptTab.id, messageId)}
              onRetryAssistantMessage={(messageId, branchId) => retryAssistantMessage(promptTab.id, messageId, branchId)}
              onSelectAssistantBranch={(messageId, branchId) => selectAssistantBranch(promptTab.id, messageId, branchId)}
              onExpandBranches={(messageId, modelId) => expandBranches(promptTab.id, messageId, modelId)}
              onStop={() => stop(promptTab.id, activeSessionIds[promptTab.id] ?? null)}
              onStopBranch={(_messageId, branchId) => stopBranch(promptTab.id, branchId)}
              onDeleteBranch={(messageId, branchId) => deleteBranch(promptTab.id, messageId, branchId)}
              onOpenBranchPreview={(messageId, branchId) => setBranchPreviewTarget({ promptTabId: promptTab.id, messageId, branchId })}
              onToast={onToast}
            />
          </div>
        ))}
      </section>

      <BranchPreviewOverlay
        open={branchPreview !== null}
        preview={branchPreview}
        t={t}
        assistantMarkdownDisplayConfig={assistantMarkdownDisplayConfig}
        onClose={() => setBranchPreviewTarget(null)}
        onToast={onToast}
      />

      <ChatInput
        disabled={composerDisabled || !activePromptTab}
        sending={Boolean(activeSessionId)}
        text={activeComposer.text}
        images={activeComposer.images}
        includePageContent={includePageContent}
        selectedModelId={activeComposer.selectedModelId}
        models={models}
        t={t}
        onSelectModel={(modelId) => {
          if (activePromptTab) {
            updateComposer(activePromptTab.id, { selectedModelId: modelId });
          }
        }}
        onTextChange={(text) => {
          if (activePromptTab) {
            updateComposer(activePromptTab.id, { text });
          }
        }}
        onImagesChange={(images) => {
          if (activePromptTab) {
            updateComposer(activePromptTab.id, { images });
          }
        }}
        onIncludePageContentChange={setIncludePageContent}
        onSend={(input) => (activePromptTab ? send(activePromptTab.id, input) : Promise.resolve())}
        onExport={() => (activePromptTab ? exportConversation(activePromptTab.id) : Promise.resolve())}
        onClear={() => (activePromptTab ? clearTab(activePromptTab.id) : Promise.resolve())}
      />
    </>
  );
};
