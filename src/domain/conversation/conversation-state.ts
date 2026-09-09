import { z } from 'zod';

import { buildConversationKey, conversationRecordSchema } from './conversation-schema';

export type ConversationRecord = z.infer<typeof conversationRecordSchema>;
type ConversationMessageRecord = ConversationRecord['messages'][number];
type AssistantMessageRecord = ConversationMessageRecord & { role: 'assistant' };
type UserMessageRecord = ConversationMessageRecord & { role: 'user' };
type BranchRecord = AssistantMessageRecord['branches'][number];
export type InitialBranchSeed = {
  /** 分支稳定 id。 */
  id: string;
  /** 分支模型 id。 */
  modelId: string;
  /** 分支模型展示名。 */
  modelLabel: string;
  /** 是否为主分支。 */
  isPrimary: boolean;
};

/** 判断消息是否为 assistant 消息。 */
const isAssistantMessageRecord = (message: ConversationMessageRecord | undefined): message is AssistantMessageRecord =>
  message?.role === 'assistant';

/** 判断消息是否为 user 消息。 */
const isUserMessageRecord = (message: ConversationMessageRecord | undefined): message is UserMessageRecord =>
  message?.role === 'user';

/** 创建空 conversation，供增量编辑首次落库使用。 */
export const createEmptyConversation = (
  normalizedUrl: string,
  promptTabId: string,
  now: number,
): ConversationRecord =>
  conversationRecordSchema.parse({
    id: buildConversationKey(normalizedUrl, promptTabId),
    normalizedUrl,
    promptTabId,
    messages: [],
    lastAssistantState: null,
    updatedAt: now,
  });

const createLoadingBranch = (seed: InitialBranchSeed, now: number): BranchRecord => ({
  ...seed,
  content: '',
  status: 'loading',
  errorMessage: null,
  durationMs: null,
  createdAt: now,
  updatedAt: now,
});

/** 创建 loading 中的助手消息占位。 */
export const createLoadingAssistantMessage = ({
  messageId,
  branches,
  selectedBranchId,
  retryFromMessageId,
  now,
}: {
  /** 新助手消息 id。 */
  messageId: string;
  /** 初始分支列表。 */
  branches: InitialBranchSeed[];
  /** 当前选中的分支 id。 */
  selectedBranchId: string;
  /** 被替换的旧助手消息 id。 */
  retryFromMessageId: string | null;
  /** 当前时间。 */
  now: number;
}): AssistantMessageRecord => {
  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId) ?? branches[0];
  if (!selectedBranch) {
    throw new Error(`selected branch is required: ${messageId}`);
  }

  return {
    id: messageId,
    role: 'assistant',
    content: '',
    images: [],
    status: 'loading',
    modelId: selectedBranch.modelId,
    branches: branches.map((branch) => createLoadingBranch(branch, now)),
    selectedBranchId: selectedBranch.id,
    retryFromMessageId,
    editedAt: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  };
};

/** 解析 assistant 当前选中的主分支。 */
const getSelectedBranch = (assistantMessage: AssistantMessageRecord): BranchRecord | null => {
  const selectedBranchId = assistantMessage.selectedBranchId ?? assistantMessage.branches[0]?.id ?? null;
  if (!selectedBranchId) {
    return null;
  }

  return assistantMessage.branches.find((branch) => branch.id === selectedBranchId) ?? assistantMessage.branches[0] ?? null;
};

/** 用选中的主分支镜像 assistant 容器，统一后续会话与导出语义。 */
const syncAssistantMessageFromSelectedBranch = (
  assistantMessage: AssistantMessageRecord,
  now: number,
): AssistantMessageRecord => {
  const selectedBranch = getSelectedBranch(assistantMessage);
  if (!selectedBranch) {
    return {
      ...assistantMessage,
      content: '',
      status: 'done',
      errorMessage: null,
      modelId: null,
      selectedBranchId: null,
      updatedAt: now,
    };
  }

  return {
    ...assistantMessage,
    content: selectedBranch.content,
    status: selectedBranch.status,
    errorMessage: selectedBranch.errorMessage,
    modelId: selectedBranch.modelId,
    selectedBranchId: selectedBranch.id,
    updatedAt: now,
  };
};

/** 从消息列表推导最新助手摘要。 */
const buildLastAssistantState = (messages: ConversationRecord['messages']): ConversationRecord['lastAssistantState'] => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'assistant') {
      return { messageId: message.id, status: message.status, summary: message.content };
    }
  }
  return null;
};

/** 查找指定 assistant 消息。 */
export const requireAssistantMessage = (conversation: ConversationRecord, messageId: string): AssistantMessageRecord => {
  const message = conversation.messages.find((item) => item.id === messageId);
  if (!isAssistantMessageRecord(message)) {
    throw new Error(`assistant message not found: ${messageId}`);
  }

  return message;
};
/** 查找指定用户消息。 */
export const requireUserMessage = (conversation: ConversationRecord, messageId: string): UserMessageRecord => {
  const message = conversation.messages.find((item) => item.id === messageId);
  if (!isUserMessageRecord(message)) {
    throw new Error(`user message not found: ${messageId}`);
  }

  return message;
};
/** 查找指定分支。 */
const requireAssistantBranch = (assistantMessage: AssistantMessageRecord, branchId: string): BranchRecord => {
  const branch = assistantMessage.branches.find((item) => item.id === branchId);
  if (!branch) {
    throw new Error(`assistant branch not found: ${branchId}`);
  }

  return branch;
};

/** 消息变更后统一推导摘要，避免修改较早轮次时覆盖最新轮次。 */
export const withConversationMessages = (
  conversation: ConversationRecord,
  messages: ConversationRecord['messages'],
  now: number,
): ConversationRecord => conversationRecordSchema.parse({
  ...conversation,
  messages,
  lastAssistantState: buildLastAssistantState(messages),
  updatedAt: now,
});

const replaceAssistantMessage = (
  conversation: ConversationRecord,
  assistantMessage: AssistantMessageRecord,
  now: number,
): ConversationRecord => {
  const nextMessage = syncAssistantMessageFromSelectedBranch(assistantMessage, now);
  return withConversationMessages(
    conversation,
    conversation.messages.map((message) => message.id === assistantMessage.id ? nextMessage : message),
    now,
  );
};

type BranchTransition =
  | { type: 'chunk'; chunk: string }
  | { type: 'done'; durationMs: number | null }
  | { type: 'error' | 'cancelled'; errorMessage: string | null; durationMs: number | null }
  | { type: 'restart' };

/** 主流和补充分支共用状态迁移；省略 branchId 时操作选中分支。 */
export const transitionAssistantBranch = (
  conversation: ConversationRecord,
  messageId: string,
  branchId: string | undefined,
  transition: BranchTransition,
  now: number,
): ConversationRecord => {
  const message = requireAssistantMessage(conversation, messageId);
  if (branchId === undefined && message.status !== 'loading') {
    throw new Error(`assistant message is already terminal: ${messageId}`);
  }
  const branch = branchId === undefined ? getSelectedBranch(message) : requireAssistantBranch(message, branchId);
  if (!branch || (transition.type !== 'restart' && branch.status !== 'loading')) {
    throw new Error(branchId === undefined
      ? `assistant selected branch is already terminal: ${messageId}`
      : `assistant branch is already terminal: ${branchId}`);
  }

  let patch: Partial<BranchRecord>;
  switch (transition.type) {
    case 'chunk':
      patch = { content: branch.content + transition.chunk };
      break;
    case 'restart':
      patch = { content: '', status: 'loading', errorMessage: null, durationMs: null };
      break;
    case 'done':
      patch = { status: 'done', errorMessage: null, durationMs: transition.durationMs };
      break;
    case 'error':
    case 'cancelled':
      patch = { status: transition.type, errorMessage: transition.errorMessage, durationMs: transition.durationMs };
      break;
  }
  return replaceAssistantMessage(conversation, {
    ...message,
    branches: message.branches.map((item) => item.id === branch.id ? { ...item, ...patch, updatedAt: now } : item),
  }, now);
};

export const appendAssistantBranch = (
  conversation: ConversationRecord,
  messageId: string,
  seed: InitialBranchSeed,
  now: number,
): ConversationRecord => {
  const message = requireAssistantMessage(conversation, messageId);
  return replaceAssistantMessage(conversation, {
    ...message,
    branches: [...message.branches, createLoadingBranch(seed, now)],
  }, now);
};

export const selectAssistantBranch = (
  conversation: ConversationRecord,
  messageId: string,
  branchId: string,
  now: number,
): ConversationRecord => {
  const message = requireAssistantMessage(conversation, messageId);
  requireAssistantBranch(message, branchId);
  return replaceAssistantMessage(conversation, { ...message, selectedBranchId: branchId }, now);
};

/** 删除最后一个分支时一并删除助手消息，否则回落到首个剩余分支。 */
export const deleteAssistantBranch = (
  conversation: ConversationRecord,
  messageId: string,
  branchId: string,
  now: number,
): ConversationRecord => {
  const message = requireAssistantMessage(conversation, messageId);
  requireAssistantBranch(message, branchId);
  if (message.branches.length === 1) {
    return withConversationMessages(conversation, conversation.messages.filter((item) => item.id !== messageId), now);
  }
  return replaceAssistantMessage(conversation, {
    ...message,
    branches: message.branches.filter((branch) => branch.id !== branchId),
    selectedBranchId: message.selectedBranchId === branchId ? null : message.selectedBranchId,
  }, now);
};
