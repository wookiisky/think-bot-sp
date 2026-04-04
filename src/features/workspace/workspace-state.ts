import type { SidebarConversationRecord, SidebarLoadingStateRecord, SidebarPageRecord } from '../../services/runtime-messaging/sidebar-contract';

/** 共享的聊天标签 id。 */
export const CHAT_PROMPT_TAB_ID = 'chat';

/** 分支消息运行态。 */
export type BranchMessageState = {
  /** 分支 id。 */
  id: string;
  /** 分支模型 id。 */
  modelId: string;
  /** 分支模型展示名。 */
  modelLabel: string;
  /** 分支正文。 */
  content: string;
  /** 分支状态。 */
  status: 'loading' | 'done' | 'error' | 'cancelled';
  /** 分支错误消息。 */
  errorMessage: string | null;
};

/** 聊天消息运行态。 */
export type ChatMessageState = {
  /** 消息 id。 */
  id: string;
  /** 角色。 */
  role: 'user' | 'assistant' | 'system';
  /** 内容。 */
  content: string;
  /** 状态。 */
  status: 'loading' | 'done' | 'error' | 'cancelled';
  /** 错误消息。 */
  errorMessage: string | null;
  /** 当前消息下的分支列表。 */
  branches: BranchMessageState[];
};

/** 模型选项。 */
export type ModelOption = {
  /** 模型稳定 id。 */
  id: string;
  /** 展示名。 */
  name: string;
  /** 是否支持图片输入。 */
  supportsImages: boolean;
};

/** 标签定义。 */
export type PromptTabDefinition = {
  /** promptTab 稳定 id。 */
  id: string;
  /** 标签展示名。 */
  name: string;
  /** 默认草稿文本。 */
  defaultText: string;
  /** 当前标签默认模型。 */
  preferredModelId: string;
  /** 是否为自动触发标签。 */
  autoTrigger: boolean;
  /** 当前页面下的 promptTab 运行态。 */
  promptTabState: SidebarPageRecord['promptTabStates'][number] | null;
};

/** 标签运行态摘要。 */
export type PromptTabStatusKind = 'idle' | 'loading' | 'auto-running' | 'auto-error' | 'auto-done' | 'ready';

/** 输入区运行态。 */
export type ComposerState = {
  /** 当前草稿文本。 */
  text: string;
  /** 当前图片列表。 */
  images: string[];
  /** 当前标签选中的模型 id。 */
  selectedModelId: string;
};

/** 消息编辑运行态。 */
export type EditingState = {
  /** 当前编辑中的用户消息 id。 */
  messageId: string;
  /** 当前编辑草稿。 */
  text: string;
};

/** 生成默认 chat 标签。 */
export const createChatPromptTab = (preferredModelId: string, name = 'Chat'): PromptTabDefinition => ({
  id: CHAT_PROMPT_TAB_ID,
  name,
  defaultText: '',
  preferredModelId,
  autoTrigger: false,
  promptTabState: null,
});

/** 以 assistant 消息 id 为键做增量合并。 */
export const upsertAssistantMessage = (
  messages: ChatMessageState[],
  messageId: string,
  buildNext: (_current: ChatMessageState | null) => ChatMessageState,
) => {
  let found = false;
  const next = messages.map((message) => {
    if (message.id !== messageId) {
      return message;
    }
    found = true;
    return buildNext(message);
  });

  return found ? next : [...next, buildNext(null)];
};

/** 以分支 id 为键做增量合并。 */
export const upsertAssistantBranch = (
  messages: ChatMessageState[],
  messageId: string,
  branchId: string,
  buildNext: (_current: BranchMessageState | null) => BranchMessageState,
) =>
  messages.map((message) => {
    if (message.id !== messageId || message.role !== 'assistant') {
      return message;
    }

    let found = false;
    return {
      ...message,
      branches: message.branches.map((branch) => {
        if (branch.id !== branchId) {
          return branch;
        }
        found = true;
        return buildNext(branch);
      }),
      ...(found ? {} : { branches: [...message.branches, buildNext(null)] }),
    };
  });

/** 生成本地乐观用户消息内容。 */
export const toOptimisticUserContent = (text: string, images: string[]) => (text.trim().length > 0 ? text : images.length > 0 ? '[图片]' : '');

/** 归一化模型列表。 */
export const toModelOptions = (
  models: Array<{
    id: string;
    name: string;
    supportsImages: boolean;
  }>,
): ModelOption[] =>
  models.map((model) => ({
    id: model.id,
    name: model.name,
    supportsImages: model.supportsImages,
  }));

/** 取一个可用模型 id。 */
export const resolveModelId = (preferredModelId: string | null, models: ModelOption[], fallbackModelId: string) => {
  if (preferredModelId && models.some((model) => model.id === preferredModelId)) {
    return preferredModelId;
  }
  return fallbackModelId;
};

/** 把会话记录转成工作台消息结构。 */
export const toChatMessageStates = (messages: SidebarConversationRecord['messages']): ChatMessageState[] =>
  messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    status: message.status,
    errorMessage: message.errorMessage,
    branches: message.branches.map((branch) => ({
      id: branch.id,
      modelId: branch.modelId,
      modelLabel: branch.modelLabel,
      content: branch.content,
      status: branch.status,
      errorMessage: branch.errorMessage,
    })),
  }));

/** 生成可见 promptTab 列表。 */
export const buildPromptTabs = ({
  page,
  quickInputs,
  models,
  fallbackModelId,
  chatLabel,
}: {
  /** 页面记录。 */
  page: SidebarPageRecord | null;
  /** 当前快捷输入。 */
  quickInputs: Array<{
    id: string;
    name: string;
    prompt: string;
    autoTrigger: boolean;
    modelId: string | null;
    order: number;
    deletedAt: number | null;
  }>;
  /** 当前可用模型。 */
  models: ModelOption[];
  /** 默认回退模型。 */
  fallbackModelId: string;
  /** 默认聊天标签名称。 */
  chatLabel: string;
}) => {
  const promptTabStateMap = new Map(page?.promptTabStates.map((item) => [item.promptTabId, item]) ?? []);
  const visibleQuickInputs = [...quickInputs]
    .filter((item) => item.deletedAt === null)
    .sort((left, right) => left.order - right.order);

  return [
    {
      ...createChatPromptTab(fallbackModelId, chatLabel),
      promptTabState: promptTabStateMap.get(CHAT_PROMPT_TAB_ID) ?? null,
    },
    ...visibleQuickInputs.map((item) => ({
      id: item.id,
      name: item.name,
      defaultText: item.prompt,
      preferredModelId: resolveModelId(item.modelId, models, fallbackModelId),
      autoTrigger: item.autoTrigger,
      promptTabState: promptTabStateMap.get(item.id) ?? null,
    })),
  ];
};

/** 为每个标签生成本地草稿。 */
export const buildComposerStateMap = (promptTabs: PromptTabDefinition[]): Record<string, ComposerState> =>
  Object.fromEntries(
    promptTabs.map((promptTab) => [
      promptTab.id,
      {
        text: promptTab.defaultText,
        images: [],
        selectedModelId: promptTab.preferredModelId,
      },
    ]),
  );

/** 为每个标签生成消息列表。 */
export const buildMessageStateMap = (
  promptTabs: PromptTabDefinition[],
  conversations: SidebarConversationRecord[],
): Record<string, ChatMessageState[]> =>
  Object.fromEntries(
    promptTabs.map((promptTab) => {
      const conversation = conversations.find((item) => item.promptTabId === promptTab.id) ?? null;
      return [promptTab.id, toChatMessageStates(conversation?.messages ?? [])];
    }),
  );

/** 为每个标签生成恢复中的助手消息 id。 */
export const buildRestoreMessageIdMap = ({
  promptTabs,
  conversations,
  loadingStates,
}: {
  /** 当前全部标签。 */
  promptTabs: PromptTabDefinition[];
  /** 当前页面全部会话。 */
  conversations: SidebarConversationRecord[];
  /** 当前页面全部 loading。 */
  loadingStates: SidebarLoadingStateRecord[];
}) =>
  Object.fromEntries(
    promptTabs.map((promptTab) => {
      const conversation = conversations.find((item) => item.promptTabId === promptTab.id) ?? null;
      const loadingState = loadingStates.find((item) => item.promptTabId === promptTab.id) ?? null;
      const loadingAssistantMessage = conversation?.messages.find((item) => item.role === 'assistant' && item.status === 'loading') ?? null;
      return [promptTab.id, loadingState?.resumeTarget?.messageId ?? loadingAssistantMessage?.id ?? null];
    }),
  );

/** 为每个标签生成当前活跃会话。 */
export const buildActiveSessionIdMap = (promptTabs: PromptTabDefinition[], loadingStates: SidebarLoadingStateRecord[]): Record<string, string | null> =>
  Object.fromEntries(
    promptTabs.map((promptTab) => {
      const loadingState = loadingStates.find((item) => item.promptTabId === promptTab.id) ?? null;
      return [promptTab.id, loadingState?.sessionId ?? null];
    }),
  );

/** 选择首次展示的标签。 */
export const pickInitialPromptTabId = (promptTabs: PromptTabDefinition[], loadingStates: SidebarLoadingStateRecord[]) => {
  const loadingPromptTab = promptTabs.find((promptTab) =>
    loadingStates.some((loadingState) => loadingState.promptTabId === promptTab.id && loadingState.promptTabStatus === 'loading'),
  );
  return loadingPromptTab?.id ?? CHAT_PROMPT_TAB_ID;
};

/** 取标签状态摘要。 */
export const getPromptTabStatusKind = (promptTab: PromptTabDefinition, activeSessionId: string | null): PromptTabStatusKind => {
  if (activeSessionId) {
    return 'loading';
  }

  const promptTabState = promptTab.promptTabState;
  if (!promptTabState) {
    return 'idle';
  }
  if (promptTabState.autoTriggerStatus === 'running') {
    return 'auto-running';
  }
  if (promptTabState.autoTriggerStatus === 'error') {
    return 'auto-error';
  }
  if (promptTabState.autoTriggerStatus === 'done') {
    return 'auto-done';
  }
  if (promptTabState.initializedAt !== null) {
    return 'ready';
  }
  return 'idle';
};
