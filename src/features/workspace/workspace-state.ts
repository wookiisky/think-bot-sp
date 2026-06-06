import type { SidebarConversationRecord, SidebarLoadingStateRecord, SidebarPageRecord } from '../../services/runtime-messaging/sidebar-contract';

type ConversationMessageRecord = SidebarConversationRecord['messages'][number];
type AssistantConversationMessageRecord = ConversationMessageRecord & { role: 'assistant' };

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
  /** 是否为当前轮的首个主分支。 */
  isPrimary: boolean;
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
  /** 展示内容。 */
  displayContent?: string;
  /** 状态。 */
  status: 'loading' | 'done' | 'error' | 'cancelled';
  /** 错误消息。 */
  errorMessage: string | null;
  /** 当前消息下的分支列表。 */
  branches: BranchMessageState[];
  /** 当前选中的主分支。 */
  selectedBranchId: string | null;
};

/** 分支预览详情。 */
export type BranchPreviewDetail = BranchMessageState & {
  /** 所属助手消息 id。 */
  messageId: string;
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
  /** 标签触发时真正发送的提示词。 */
  triggerPrompt: string | null;
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

/** 删除消息上的 displayContent，回退为直接展示真实 content。 */
export const omitMessageDisplayContent = (message: ChatMessageState): ChatMessageState => {
  const { displayContent: _displayContent, ...rest } = message;
  return rest;
};

/** 生成默认 chat 标签。 */
export const createChatPromptTab = (preferredModelId: string, name = 'Chat'): PromptTabDefinition => ({
  id: CHAT_PROMPT_TAB_ID,
  name,
  defaultText: '',
  triggerPrompt: null,
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
    return syncAssistantMessageState(buildNext(message));
  });

  return found ? next : [...next, syncAssistantMessageState(buildNext(null))];
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
    const nextBranches = message.branches.map((branch) => {
      if (branch.id !== branchId) {
        return branch;
      }
      found = true;
      return buildNext(branch);
    });
    return syncAssistantMessageState({
      ...message,
      branches: found ? nextBranches : [...nextBranches, buildNext(null)],
    });
  });

/** 为目标助手消息追加或更新分支占位，优先用于本地乐观反馈。 */
export const appendAssistantBranches = (
  messages: ChatMessageState[],
  messageId: string,
  branches: Array<{
    /** 分支 id。 */
    id: string;
    /** 分支模型 id。 */
    modelId: string;
    /** 分支模型展示名。 */
    modelLabel: string;
    /** 是否为主分支。 */
    isPrimary?: boolean;
  }>,
) =>
  messages.map((message) => {
    if (message.id !== messageId || message.role !== 'assistant') {
      return message;
    }

    const nextBranches = [...message.branches];
    for (const branch of branches) {
      const currentIndex = nextBranches.findIndex((item) => item.id === branch.id);
      const nextBranch: BranchMessageState = {
        id: branch.id,
        modelId: branch.modelId,
        modelLabel: branch.modelLabel,
        isPrimary: currentIndex >= 0 ? nextBranches[currentIndex]?.isPrimary ?? false : branch.isPrimary ?? false,
        content: currentIndex >= 0 ? nextBranches[currentIndex]?.content ?? '' : '',
        status: 'loading',
        errorMessage: null,
      };
      if (currentIndex >= 0) {
        nextBranches[currentIndex] = nextBranch;
      } else {
        nextBranches.push(nextBranch);
      }
    }

    return syncAssistantMessageState({
      ...message,
      branches: nextBranches,
    });
  });

/** 创建或更新本地助手错误回复。 */
export const upsertAssistantFailure = (
  messages: ChatMessageState[],
  input: {
    /** 助手消息 id。 */
    messageId: string;
    /** 失败分支 id。 */
    branchId: string;
    /** 错误展示正文。 */
    errorMessage: string;
    /** 分支模型 id。 */
    modelId: string;
    /** 分支模型展示名。 */
    modelLabel: string;
    /** 是否主分支。 */
    isPrimary: boolean;
  },
) =>
  upsertAssistantMessage(messages, input.messageId, (message) => {
    const currentBranch = message?.branches.find((branch) => branch.id === input.branchId) ?? null;
    const nextBranch: BranchMessageState = {
      id: input.branchId,
      modelId: currentBranch?.modelId ?? input.modelId,
      modelLabel: currentBranch?.modelLabel ?? input.modelLabel,
      isPrimary: currentBranch?.isPrimary ?? input.isPrimary,
      content: currentBranch?.content.trim() ? currentBranch.content : input.errorMessage,
      status: 'error',
      errorMessage: input.errorMessage,
    };
    const nextBranches = currentBranch
      ? (message?.branches ?? []).map((branch) => (branch.id === input.branchId ? nextBranch : branch))
      : [...(message?.branches ?? []), nextBranch];

    return {
      id: input.messageId,
      role: 'assistant',
      content: message?.content.trim() ? message.content : input.errorMessage,
      status: 'error',
      errorMessage: input.errorMessage,
      branches: nextBranches,
      selectedBranchId: message?.selectedBranchId ?? input.branchId,
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
  messages.map((message) => {
    const branches =
      message.role === 'assistant'
        ? normalizeAssistantBranches(message as AssistantConversationMessageRecord)
        : [];
    const selectedBranchId =
      message.role === 'assistant' ? resolveSelectedBranchId(branches, message.selectedBranchId ?? null) : null;
    const selectedBranch =
      message.role === 'assistant' ? branches.find((branch) => branch.id === selectedBranchId) ?? null : null;

    const nextMessage: ChatMessageState = {
      id: message.id,
      role: message.role,
      content: selectedBranch?.content ?? message.content,
      status: selectedBranch?.status ?? message.status,
      errorMessage: selectedBranch?.errorMessage ?? message.errorMessage,
      branches,
      selectedBranchId,
    };
    if (message.displayContent !== undefined) {
      nextMessage.displayContent = message.displayContent;
    }
    return nextMessage;
  });

/** 从消息列表中定位一个可预览的助手分支。 */
export const findBranchPreviewDetail = (
  messages: ChatMessageState[],
  messageId: string,
  branchId: string,
): BranchPreviewDetail | null => {
  const message = messages.find((item) => item.id === messageId && item.role === 'assistant');
  const branch = message?.branches.find((item) => item.id === branchId) ?? null;
  return branch
    ? {
        messageId,
        ...branch,
      }
    : null;
};

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
      defaultText: '',
      triggerPrompt: item.prompt,
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

/** 归一化助手分支，兼容旧消息把主回答折叠为首个分支。 */
const normalizeAssistantBranches = (
  message: AssistantConversationMessageRecord,
): BranchMessageState[] => {
  if (message.branches.length > 0) {
    return message.branches.map((branch, index) => ({
      id: branch.id,
      modelId: branch.modelId,
      modelLabel: branch.modelLabel,
      isPrimary: branch.isPrimary ?? index === 0,
      content: branch.content,
      status: branch.status,
      errorMessage: branch.errorMessage,
    }));
  }

  return [
    {
      id: `${message.id}:primary`,
      modelId: message.modelId ?? '',
      modelLabel: message.modelId ?? '主分支',
      isPrimary: true,
      content: message.content,
      status: message.status,
      errorMessage: message.errorMessage,
    },
  ];
};

/** 解析当前应使用的主分支 id。 */
const resolveSelectedBranchId = (branches: BranchMessageState[], selectedBranchId: string | null): string | null => {
  if (branches.length === 0) {
    return null;
  }
  if (selectedBranchId && branches.some((branch) => branch.id === selectedBranchId)) {
    return selectedBranchId;
  }
  return branches[0]?.id ?? null;
};

/** 让助手消息的顶层展示始终与当前选中的分支保持一致。 */
export const syncAssistantMessageState = (message: ChatMessageState): ChatMessageState => {
  if (message.role !== 'assistant' || message.branches.length === 0) {
    return message;
  }

  const selectedBranchId = resolveSelectedBranchId(message.branches, message.selectedBranchId);
  const selectedBranch = message.branches.find((branch) => branch.id === selectedBranchId) ?? null;
  if (!selectedBranch) {
    return {
      ...message,
      selectedBranchId,
    };
  }

  return {
    ...message,
    content: selectedBranch.content,
    status: selectedBranch.status,
    errorMessage: selectedBranch.errorMessage,
    selectedBranchId,
  };
};
