import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_LLM_REQUEST_TIMEOUT_SECONDS } from '../../domain/config/config-schema';
import type { SidebarConversationRecord, SidebarLoadingStateRecord } from '../../services/runtime-messaging/sidebar-contract';
import { sidebarPortEventSchema } from '../../services/runtime-messaging/sidebar-contract';
import { createLogger } from '../../services/logger/logger';
import { downloadTextFile } from '../../shared/download-file';
import {
  CHAT_PROMPT_TAB_ID, appendAssistantBranches, buildActiveSessionIdMap, buildComposerStateMap,
  buildMessageStateMap, buildRestoreMessageIdMap, syncAssistantMessageState, toOptimisticUserContent,
  upsertAssistantMessage, type ChatMessageState, type ComposerState, type EditingState,
  type ModelOption, type PromptTabDefinition,
} from './workspace-state';
import { usePageScope } from './use-page-scope';
import { subscribeStreamPort } from './stream-port-subscription';
import { reduceWorkspaceEvent } from './workspace-stream-state';
import { mergeWorkspaceCommandResult } from './workspace-command-state';
import { getWorkspaceSessionUpdate } from './workspace-session-state';
import type { WorkspaceTranslator } from './workspace-copy';
import type { WorkspaceTransport } from './workspace-transport';
import type { WorkspaceToastPayload } from './workspace-toast';

/** 一次完整恢复所需的数据；页面身份与快照一起提交，避免旧页面覆盖当前页面。 */
export type WorkspaceSnapshot = {
  /** 页面或浏览器标签页与页面的组合身份。 */
  pageKey: string;
  /** 已按当前配置构建的标签。 */
  promptTabs: PromptTabDefinition[];
  /** 可选择的完整模型。 */
  models: ModelOption[];
  /** 当前页面会话记录。 */
  conversations: SidebarConversationRecord[];
  /** 待恢复的活动会话。 */
  loadingStates: SidebarLoadingStateRecord[];
  /** 恢复时激活的标签。 */
  activePromptTabId: string;
  /** 页面正文开关。 */
  includePageContent: boolean;
  /** 后台恢复超时阈值。 */
  llmRequestTimeoutSeconds: number;
};

/** 控制器只依赖绑定页面的传输接口与展示反馈。 */
type WorkspaceControllerOptions = {
  /** 页面生命周期身份；切换后必须重新恢复。 */
  pageKey: string | null;
  /** 尚未解析页面详情时没有传输目标。 */
  transport: WorkspaceTransport | null;
  /** 当前语言。 */
  t: WorkspaceTranslator;
  /** 一次性操作反馈。 */
  onToast: (_toast: WorkspaceToastPayload) => void;
  /** 侧边栏在初始化完成前保留聊天标签。 */
  initialPromptTabs?: PromptTabDefinition[];
};

const portLogger = createLogger('workspace').child('port');
const EMPTY_MESSAGES: ChatMessageState[] = [];

/** 发送能力由传输契约定义，目标标签单独传入。 */
type WorkspaceSendInput = Omit<Parameters<WorkspaceTransport['sendChat']>[0], 'promptTabId'>;

/** 保留服务端错误详情，没有详情时使用本地化兜底。 */
const getReplyErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message.trim() ? error.message : fallback;

/** 共享消息、草稿、流生命周期和聊天操作；页面提取与历史列表由外层负责。 */
export const useWorkspaceController = ({ pageKey, transport, t, onToast, initialPromptTabs = [] }: WorkspaceControllerOptions) => {
  const isCurrentScope = usePageScope(pageKey);
  const scope = useMemo(() => ({
    /** 恢复完成前禁止命令，切换页面时重新创建。 */
    ready: false,
    /** 已收敛的会话不被晚到的命令响应重新打开。 */
    terminalSessionIds: new Set<string>(),
    /** 助手重试等待响应期间已收到流事件的会话。 */
    streamedSessionIds: new Set<string>(),
    /** 各分支尚未完成的助手重试数量。 */
    pendingAssistantRetries: new Map<string, number>(),
  }), [pageKey]);
  const [restoredScope, setRestoredScope] = useState<typeof scope | null>(null);
  const ready = restoredScope === scope;
  const { terminalSessionIds, streamedSessionIds, pendingAssistantRetries } = scope;
  const [promptTabs, setPromptTabs] = useState(initialPromptTabs);
  const [activePromptTabId, setActivePromptTabId] = useState(CHAT_PROMPT_TAB_ID);
  const [messageMap, setMessageMap] = useState<Record<string, ChatMessageState[]>>({});
  const [restoreMessageIds, setRestoreMessageIds] = useState<Record<string, string | null>>({});
  const [activeSessionIds, setActiveSessionIds] = useState<Record<string, string | null>>({});
  const [composerMap, setComposerMap] = useState<Record<string, ComposerState>>(() => buildComposerStateMap(initialPromptTabs));
  const [editingMap, setEditingMap] = useState<Record<string, EditingState | null>>({});
  const [models, setModels] = useState<ModelOption[]>([]);
  const [includePageContent, setIncludePageContent] = useState(true);
  const llmRequestTimeoutSecondsRef = useRef(DEFAULT_LLM_REQUEST_TIMEOUT_SECONDS);
  const feedbackRef = useRef({ t, onToast });
  useLayoutEffect(() => { feedbackRef.current = { t, onToast }; }, [t, onToast]);
  const isCurrentPage = () => isCurrentScope() && scope.ready && transport !== null;
  const promptTabSubscriptionKey = JSON.stringify(promptTabs.map((tab) => tab.id));

  /** 一次替换完整快照；同步打开 ready，允许初始化链路继续自动触发。 */
  const restore = (snapshot: WorkspaceSnapshot) => {
    if (!isCurrentScope() || snapshot.pageKey !== pageKey) return;
    const tabs = snapshot.promptTabs;
    setPromptTabs(tabs);
    setModels(snapshot.models);
    setMessageMap(buildMessageStateMap(tabs, snapshot.conversations, snapshot.loadingStates));
    setRestoreMessageIds(buildRestoreMessageIdMap({ promptTabs: tabs, conversations: snapshot.conversations, loadingStates: snapshot.loadingStates }));
    setActiveSessionIds(buildActiveSessionIdMap(tabs, snapshot.loadingStates));
    setComposerMap(buildComposerStateMap(tabs));
    setEditingMap(Object.fromEntries(tabs.map((tab) => [tab.id, null])));
    setActivePromptTabId(tabs.some((tab) => tab.id === snapshot.activePromptTabId) ? snapshot.activePromptTabId : tabs[0]?.id ?? CHAT_PROMPT_TAB_ID);
    setIncludePageContent(snapshot.includePageContent);
    llmRequestTimeoutSecondsRef.current = snapshot.llmRequestTimeoutSeconds;
    scope.ready = true;
    setRestoredScope(scope);
  };

  /** 清空页面消息与恢复状态，但保留尚未提交的草稿。 */
  const clearPageMessages = () => {
    if (!isCurrentScope()) return;
    setMessageMap({});
    setRestoreMessageIds({});
    setActiveSessionIds({});
    setEditingMap({});
    setPromptTabs((current) => current.map((tab) => ({ ...tab, promptTabState: null })));
  };

  /** 清除没有详情的页面视图，等待下一个完整快照。 */
  const reset = () => {
    if (!isCurrentScope()) return;
    scope.ready = false;
    setRestoredScope(null);
    setPromptTabs([]);
    setMessageMap({});
    setRestoreMessageIds({});
    setActiveSessionIds({});
    setComposerMap({});
    setEditingMap({});
  };

  /** 更新单个标签消息；未变化时保留引用。 */
  const setPromptTabMessages = (promptTabId: string, update: (_messages: ChatMessageState[]) => ChatMessageState[]) => {
    setMessageMap((current) => {
      const messages = current[promptTabId] ?? EMPTY_MESSAGES;
      const next = update(messages);
      return messages === next ? current : { ...current, [promptTabId]: next };
    });
  };

  /** 修改单个标签草稿，不影响其他标签。 */
  const setPromptTabComposer = (promptTabId: string, patch: Partial<ComposerState>) => {
    setComposerMap((current) => ({ ...current, [promptTabId]: {
      text: '', images: [], selectedModelId: models[0]?.id ?? '', ...current[promptTabId], ...patch,
    } }));
  };

  /** 更新当前标签的消息编辑态。 */
  const setPromptTabEditing = (promptTabId: string, editing: EditingState | null) => {
    setEditingMap((current) => ({ ...current, [promptTabId]: editing }));
  };

  /** 使用最新的反馈回调，避免流订阅依赖界面渲染。 */
  const pushToast = (tone: WorkspaceToastPayload['tone'], message: string) => feedbackRef.current.onToast({ tone, message });
  /** 终态会话不允许较晚的命令响应重新打开 loading。 */
  const hasTerminalSession = (sessionId: string) => terminalSessionIds.has(sessionId);

  useEffect(() => {
    if (!ready || !transport) return;
    const subscriptionIds = JSON.parse(promptTabSubscriptionKey) as string[];
    const handlePortMessage = (event: unknown) => {
      if (!isCurrentPage()) return;
      const parsed = sidebarPortEventSchema.safeParse(event);
      if (!parsed.success) return;
      const payload = parsed.data;
      if (!('promptTabId' in payload) || (transport.normalizedUrl && payload.normalizedUrl !== transport.normalizedUrl)) return;
      const promptTabId = payload.promptTabId;
      const retryEvent = 'branchId' in payload && 'sessionId' in payload && pendingAssistantRetries.has(payload.branchId) ? payload : null;
      const isFirstRetryEvent = retryEvent !== null && !streamedSessionIds.has(retryEvent.sessionId);
      if (retryEvent) streamedSessionIds.add(retryEvent.sessionId);
      const sessionUpdate = getWorkspaceSessionUpdate(payload);
      if (sessionUpdate?.terminalSessionId) terminalSessionIds.add(sessionUpdate.terminalSessionId);
      if (sessionUpdate?.startedSessionId) terminalSessionIds.delete(sessionUpdate.startedSessionId);
      if (sessionUpdate && 'activeSessionId' in sessionUpdate) {
        setActiveSessionIds((current) => current[promptTabId] === sessionUpdate.activeSessionId ? current : { ...current, [promptTabId]: sessionUpdate.activeSessionId ?? null });
      }
      if (sessionUpdate && 'restoreMessageId' in sessionUpdate) {
        setRestoreMessageIds((current) => current[promptTabId] === sessionUpdate.restoreMessageId ? current : { ...current, [promptTabId]: sessionUpdate.restoreMessageId ?? null });
      }
      const translate = feedbackRef.current.t;
      setPromptTabMessages(promptTabId, (current) => reduceWorkspaceEvent(
        isFirstRetryEvent && retryEvent ? mergeWorkspaceCommandResult(current, {
          kind: 'assistant', targetMessageId: retryEvent.messageId, response: retryEvent, hasStreamEvent: false,
        }) : current, payload, {
          primaryBranch: translate('workspace.status.primaryBranch'), branch: translate('workspace.status.branch'),
          error: translate('workspace.status.error'), cancelled: translate('workspace.status.cancelled'), timeout: translate('workspace.status.timeout'),
        }, { now: Date.now(), timeoutMs: llmRequestTimeoutSecondsRef.current * 1000 }));
    };
    // worker 回收后自动重连，由后台决定恢复已有流还是收敛中断状态。
    const subscriptions = subscriptionIds.map((promptTabId) => subscribeStreamPort({
      connect: () => transport.connectStream({ promptTabId }), onEvent: handlePortMessage,
      logger: portLogger.child('stream', { promptTab: promptTabId }),
    }));
    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  }, [transport, promptTabSubscriptionKey, ready, scope]);

  /** 发送用户消息，并在本地先补一条乐观消息。 */
  const handleSend = async (
    promptTabId: string,
    input: WorkspaceSendInput,
  ) => {
    if (!transport || !isCurrentPage()) return;
    const optimisticUserMessageId = `local-user:${promptTabId}:${Date.now()}`;
    const optimisticDisplayContent = input.displayText ?? toOptimisticUserContent(input.text, input.images);
    setPromptTabMessages(promptTabId, (current) => [
      ...current,
      {
        id: optimisticUserMessageId,
        role: 'user',
        content: input.text,
        ...(optimisticDisplayContent !== input.text ? { displayContent: optimisticDisplayContent } : {}),
        status: 'done',
        errorMessage: null,
        branches: [],
        selectedBranchId: null,
      },
    ]);

    try {
      const request = { promptTabId, ...input };
      const response = await transport.sendChat(request);
      if (!isCurrentPage()) return;
      const sessionAlreadyTerminal = hasTerminalSession(response.payload.sessionId);
      if (!sessionAlreadyTerminal) {
        setActiveSessionIds((current) => ({
          ...current,
          [promptTabId]: response.payload.sessionId,
        }));
        setRestoreMessageIds((current) => ({
          ...current,
          [promptTabId]: response.payload.messageId,
        }));
      }
      setIncludePageContent(input.includePageContent);
      setPromptTabMessages(promptTabId, (current) => {
        const persistedUserMessageId = response.payload.userMessageId;
        const messagesWithPersistedUserId =
          persistedUserMessageId === null
            ? current
            : current.map((message) =>
                message.id === optimisticUserMessageId
                  ? {
                      ...message,
                      id: persistedUserMessageId,
                    }
                  : message,
              );
        if (sessionAlreadyTerminal) {
          return messagesWithPersistedUserId;
        }
        return appendAssistantBranches(
          upsertAssistantMessage(messagesWithPersistedUserId, response.payload.messageId, (message) => ({
            id: response.payload.messageId,
            role: 'assistant',
            content: message?.content ?? '',
            status: 'loading',
            errorMessage: null,
            branches: message?.branches ?? [],
            selectedBranchId: response.payload.branchId,
          })),
          response.payload.messageId,
          (response.payload.branches ?? [
            {
              branchId: response.payload.branchId,
              modelId: response.payload.modelId,
              modelLabel: response.payload.modelLabel,
            },
          ]).map((branch) => ({
            id: branch.branchId,
            modelId: branch.modelId,
            modelLabel: branch.modelLabel,
            isPrimary: branch.branchId === response.payload.branchId,
          })),
        );
      });
    } catch (error) {
      if (!isCurrentPage()) return;
      const errorMessage = getReplyErrorMessage(error, t('workspace.notice.sendFailed'));
      const assistantMessageId = `local-assistant:${promptTabId}:${Date.now()}`;
      const branchId = `${assistantMessageId}:primary`;
      setActiveSessionIds((current) => ({
        ...current,
        [promptTabId]: null,
      }));
      setRestoreMessageIds((current) => ({
        ...current,
        [promptTabId]: null,
      }));
      setPromptTabMessages(promptTabId, (current) => [
        ...current,
        {
          id: assistantMessageId,
          role: 'assistant',
          content: errorMessage,
          status: 'error',
          errorMessage,
          branches: [
            {
              id: branchId,
              modelId: input.modelId,
              modelLabel: models.find((model) => model.id === input.modelId)?.name ?? t('workspace.status.primaryBranch'),
              isPrimary: true,
              content: errorMessage,
              status: 'error',
              errorMessage,
              durationMs: null,
              startedAt: null,
            },
          ],
          selectedBranchId: branchId,
        },
      ]);
    }
  };

  /** 编辑用户消息后，裁剪其后的结果并立刻重发。 */
  const handleEditUserMessage = async (promptTabId: string, messageId: string, text: string) => {
    if (!transport || !isCurrentPage()) return;
    try {
      const response = await transport.editUserMessage({
        promptTabId,
        messageId,
        text,
      });
      if (!isCurrentPage()) return;
      setPromptTabEditing(promptTabId, null);
      if (!hasTerminalSession(response.payload.sessionId)) {
        setActiveSessionIds((current) => ({
          ...current,
          [promptTabId]: response.payload.sessionId,
        }));
        setRestoreMessageIds((current) => ({
          ...current,
          [promptTabId]: response.payload.messageId,
        }));
      }
      setPromptTabMessages(promptTabId, (current) => mergeWorkspaceCommandResult(current, {
        kind: 'user', targetMessageId: messageId, response: response.payload, editedText: text,
      }));
    } catch {
      if (!isCurrentPage()) return;
      pushToast('error', t('workspace.notice.editFailed'));
    }
  };

  /** 重试用户消息，裁剪其后的结果并重新生成当前轮。 */
  const handleRetryUserMessage = async (promptTabId: string, messageId: string) => {
    if (!transport || !isCurrentPage()) return;
    try {
      const response = await transport.retryUserMessage({
        promptTabId,
        messageId,
      });
      if (!isCurrentPage()) return;
      if (!hasTerminalSession(response.payload.sessionId)) {
        setActiveSessionIds((current) => ({
          ...current,
          [promptTabId]: response.payload.sessionId,
        }));
        setRestoreMessageIds((current) => ({
          ...current,
          [promptTabId]: response.payload.messageId,
        }));
      }
      setPromptTabMessages(promptTabId, (current) => mergeWorkspaceCommandResult(current, {
        kind: 'user', targetMessageId: messageId, response: response.payload,
      }));
    } catch {
      if (!isCurrentPage()) return;
      pushToast('error', t('workspace.notice.retryFailed'));
    }
  };

  /** 重试目标助手分支。 */
  const handleRetryMessage = async (promptTabId: string, messageId: string, branchId: string) => {
    if (!transport || !isCurrentPage()) return;
    pendingAssistantRetries.set(branchId, (pendingAssistantRetries.get(branchId) ?? 0) + 1);
    try {
      const response = await transport.retryMessage({
        promptTabId,
        messageId,
        branchId,
      });
      if (!isCurrentPage()) return;
      if (!hasTerminalSession(response.payload.sessionId)) {
        setActiveSessionIds((current) => ({
          ...current,
          [promptTabId]: response.payload.sessionId,
        }));
        setRestoreMessageIds((current) => ({
          ...current,
          [promptTabId]: response.payload.messageId,
        }));
      }
      const hasStreamEvent = streamedSessionIds.has(response.payload.sessionId);
      setPromptTabMessages(promptTabId, (current) => mergeWorkspaceCommandResult(current, {
        kind: 'assistant', targetMessageId: messageId, response: response.payload, hasStreamEvent,
      }));
    } catch {
      if (!isCurrentPage()) return;
      pushToast('error', t('workspace.notice.retryFailed'));
    } finally {
      const remaining = (pendingAssistantRetries.get(branchId) ?? 1) - 1;
      if (remaining === 0) pendingAssistantRetries.delete(branchId);
      else pendingAssistantRetries.set(branchId, remaining);
      if (pendingAssistantRetries.size === 0) streamedSessionIds.clear();
    }
  };

  /** 切换当前轮继续对话使用的主分支。 */
  const handleSelectAssistantBranch = async (promptTabId: string, messageId: string, branchId: string) => {
    if (!transport || !isCurrentPage()) return;
    try {
      await transport.selectAssistantBranch({
        promptTabId,
        messageId,
        branchId,
      });
      if (!isCurrentPage()) return;
      setPromptTabMessages(promptTabId, (current) =>
        current.map((message) =>
          message.id === messageId && message.role === 'assistant'
            ? syncAssistantMessageState({
                ...message,
                selectedBranchId: branchId,
              })
            : message,
        ),
      );
    } catch {
      if (!isCurrentPage()) return;
      pushToast('error', t('workspace.notice.selectPrimaryBranchFailed'));
    }
  };

  /** 停止当前标签会话。 */
  const handleStop = async (promptTabId: string, sessionId: string | null) => {
    if (!transport || !isCurrentPage()) return;
    if (!sessionId) {
      return;
    }

    await transport.stopSession({
      promptTabId,
      sessionId,
    });
    if (!transport || !isCurrentPage()) return;
  };

  /** 清空当前标签会话，不影响页面提取内容与其他标签。 */
  const handleClearTabConversation = async (promptTabId: string) => {
    if (!transport || !isCurrentPage()) return;
    try {
      await transport.clearTabConversation({
        promptTabId,
      });
      if (!isCurrentPage()) return;
      setPromptTabMessages(promptTabId, () => []);
      setRestoreMessageIds((current) => ({
        ...current,
        [promptTabId]: null,
      }));
      setActiveSessionIds((current) => ({
        ...current,
        [promptTabId]: null,
      }));
      setPromptTabEditing(promptTabId, null);
      pushToast('success', t('workspace.notice.clearTabSuccess'));
      if (transport.clearTabResetsTrigger) setPromptTabs((current) =>
        current.map((promptTab) =>
          promptTab.id === promptTabId
            ? {
                ...promptTab,
                promptTabState: promptTab.promptTabState
                  ? {
                      ...promptTab.promptTabState,
                      initializedAt: null,
                      lastAutoTriggerAt: null,
                      autoTriggerStatus: 'idle',
                      lastClearedAt: Date.now(),
                    }
                  : null,
              }
            : promptTab,
        ),
      );
    } catch {
      if (!isCurrentPage()) return;
      pushToast('error', t('workspace.notice.clearTabFailed'));
    }
  };

  /** 导出当前标签会话，空会话时直接拦截。 */
  const handleExport = async (promptTabId: string) => {
    if (!transport || !isCurrentPage()) return;
    const messages = messageMap[promptTabId] ?? [];
    const hasExportableMessage = messages.some((message) => message.content.trim().length > 0);
    if (!hasExportableMessage) {
      pushToast('error', t('workspace.notice.emptyExport'));
      return;
    }

    try {
      const exported = await transport.exportConversation({
        promptTabId,
      });
      if (!isCurrentPage()) return;
      downloadTextFile({
        filename: exported.payload.filename,
        content: exported.payload.content,
        mimeType: exported.payload.mimeType,
      });
    } catch {
      if (!isCurrentPage()) return;
      pushToast('error', t('workspace.notice.exportFailed'));
    }
  };

  /** 针对既有助手消息继续新增分支。 */
  const handleExpandBranches = async (promptTabId: string, messageId: string, modelId: string) => {
    if (!transport || !isCurrentPage()) return;
    try {
      const response = await transport.expandMessageBranches({
        promptTabId,
        messageId,
        modelId,
      });
      if (!isCurrentPage()) return;
      setPromptTabMessages(promptTabId, (current) =>
        appendAssistantBranches(
          current,
          messageId,
          response.payload.branches.map((branch) => ({
            id: branch.branchId,
            modelId: branch.modelId,
            modelLabel: branch.modelLabel,
          })),
        ),
      );
    } catch {
      if (!isCurrentPage()) return;
      pushToast('error', t('workspace.notice.expandBranchFailed'));
    }
  };

  /** 停止单个分支流。 */
  const handleStopBranch = async (promptTabId: string, branchId: string) => {
    if (!transport || !isCurrentPage()) return;
    try {
      await transport.stopBranch({
        promptTabId,
        branchId,
      });
      if (!isCurrentPage()) return;
    } catch {
      if (!isCurrentPage()) return;
      pushToast('error', t('workspace.notice.stopBranchFailed'));
    }
  };

  /** 删除单个分支，并同时移除本地显示。 */
  const handleDeleteBranch = async (promptTabId: string, messageId: string, branchId: string) => {
    if (!transport || !isCurrentPage()) return;
    try {
      await transport.deleteBranch({
        promptTabId,
        messageId,
        branchId,
      });
      if (!isCurrentPage()) return;
      setPromptTabMessages(promptTabId, (current) =>
        current.flatMap((message) => {
          if (message.id !== messageId || message.role !== 'assistant') {
            return [message];
          }
          if (transport.deleteLastBranchRemovesMessage && message.branches.length <= 1) {
            return [];
          }
          return [
            syncAssistantMessageState({
              ...message,
              branches: message.branches.filter((branch) => branch.id !== branchId),
            }),
          ];
        }),
      );
    } catch {
      if (!isCurrentPage()) return;
      pushToast('error', t('workspace.notice.deleteBranchFailed'));
    }
  };

  /** 选择一个标签，不向外暴露底层 React setter。 */
  const selectPromptTab = (promptTabId: string) => setActivePromptTabId(promptTabId);
  /** 更新页面正文开关。 */
  const updateIncludePageContent = (value: boolean) => setIncludePageContent(value);

  return {
    view: { ready, promptTabs, activePromptTabId, models, messageMap, restoreMessageIds, activeSessionIds, composerMap, editingMap, includePageContent } as const,
    restore, reset, clearPageMessages,
    actions: {
      selectPromptTab, updateComposer: setPromptTabComposer, updateEditing: setPromptTabEditing,
      setIncludePageContent: updateIncludePageContent, send: handleSend, editUserMessage: handleEditUserMessage, retryUserMessage: handleRetryUserMessage,
      retryAssistantMessage: handleRetryMessage, selectAssistantBranch: handleSelectAssistantBranch,
      expandBranches: handleExpandBranches, stop: handleStop, stopBranch: handleStopBranch,
      deleteBranch: handleDeleteBranch, clearTab: handleClearTabConversation, exportConversation: handleExport,
    },
  };
};
