import type { LanguageModel, ToolSet } from 'ai';
import { getSelectedBranch, type AssistantMessageRecord, type ConversationRecord } from '../../domain/conversation/conversation-state';
import type { ConversationHistoryMessage, ProviderOptions } from './dispatch-types';
import type { ResolvedProviderModel } from './provider-registry';

/** 当前请求使用的提示词上下文。 */
export type PromptContext = {
  /** 当前请求最终使用的系统提示词。 */
  systemPrompt: string;
  /** 当前请求附带的页面正文。 */
  pageContent: string;
};

/** 构造最终系统提示词，页面正文始终追加在末尾。 */
export const buildEffectiveSystemPrompt = (input: PromptContext): string => {
  const trimmedSystemPrompt = input.systemPrompt.trim();
  const trimmedPageContent = (input.pageContent ?? '').trim();
  if (!trimmedPageContent) {
    return trimmedSystemPrompt;
  }

  const pageContentSection = `# Page Content\n${trimmedPageContent}`;
  return trimmedSystemPrompt ? `${trimmedSystemPrompt}\n\n${pageContentSection}` : pageContentSection;
};

/** 统一把系统提示词拼到消息最前面，避免污染用户消息正文。 */
export const buildModelMessages = (input: {
  /** 历史消息和当前轮消息。 */
  conversationMessages: ConversationHistoryMessage[];
  /** 当前请求使用的提示词上下文。 */
  promptContext: PromptContext;
}): ConversationHistoryMessage[] => {
  const effectiveSystemPrompt = buildEffectiveSystemPrompt(input.promptContext);
  if (!effectiveSystemPrompt) {
    return input.conversationMessages;
  }

  return [
    {
      role: 'system',
      content: effectiveSystemPrompt,
      images: [],
    },
    ...input.conversationMessages,
  ];
};

/** 构造统一的 AI SDK 调用参数，避免各入口遗漏模型配置。 */
export const buildModelInvocation = (input: {
  /** 解析后的 provider 模型。 */
  resolvedModel: ResolvedProviderModel;
  /** 当前用户消息。 */
  messages: ConversationHistoryMessage[];
  /** 取消信号。 */
  abortSignal: AbortSignal;
}): {
  model: LanguageModel;
  messages: ConversationHistoryMessage[];
  abortSignal: AbortSignal;
  maxOutputTokens?: number;
  tools?: ToolSet;
  providerOptions?: ProviderOptions;
} => ({
  model: input.resolvedModel.sdkModel,
  messages: input.messages,
  abortSignal: input.abortSignal,
  ...(input.resolvedModel.maxOutputTokens !== null ? { maxOutputTokens: input.resolvedModel.maxOutputTokens } : {}),
  ...(input.resolvedModel.tools ? { tools: input.resolvedModel.tools } : {}),
  ...(input.resolvedModel.providerOptions ? { providerOptions: input.resolvedModel.providerOptions } : {}),
});

/** 判断历史消息里是否包含图片输入。 */
export const historyHasImages = (messages: ConversationHistoryMessage[]): boolean =>
  messages.some((message) => message.images.length > 0);

/** 把会话消息压成发给模型的完整对话历史；助手消息取当前选中分支的正文。 */
export const toConversationHistory = (messages: ConversationRecord['messages']): ConversationHistoryMessage[] => {
  const history: ConversationHistoryMessage[] = [];
  for (const message of messages) {
    if (message.role === 'user') {
      history.push({ role: 'user', content: message.content, images: message.images });
      continue;
    }

    if (message.role === 'system') {
      history.push({ role: 'system', content: message.content, images: [] });
      continue;
    }

    // 消息 schema 尚未按 role 拆成 discriminatedUnion，这里在 role 已排除 user/system 后显式收窄。
    const selectedContent = (getSelectedBranch(message as AssistantMessageRecord)?.content ?? message.content).trim();
    if (selectedContent) {
      history.push({ role: 'assistant', content: selectedContent, images: [] });
    }
  }

  return history;
};

/** 为目标助手消息重建完整对话历史，不包含当前助手轮。 */
export const buildConversationHistoryBeforeAssistant = (
  conversation: ConversationRecord,
  targetMessageId: string,
): ConversationHistoryMessage[] => {
  const targetIndex = conversation.messages.findIndex((message) => message.id === targetMessageId && message.role === 'assistant');
  if (targetIndex < 0) {
    throw new Error(`assistant message not found: ${targetMessageId}`);
  }

  return toConversationHistory(conversation.messages.slice(0, targetIndex));
};

/** 为目标用户消息重建完整对话历史，包含该用户消息本身；可用编辑后的文本替换该消息正文。 */
export const buildConversationHistoryThroughUser = (
  conversation: ConversationRecord,
  targetMessageId: string,
  replacementContent?: string,
): ConversationHistoryMessage[] => {
  const targetIndex = conversation.messages.findIndex((message) => message.id === targetMessageId && message.role === 'user');
  if (targetIndex < 0) {
    throw new Error(`user message not found: ${targetMessageId}`);
  }

  return toConversationHistory(
    conversation.messages
      .slice(0, targetIndex + 1)
      .map((message) =>
        message.id === targetMessageId && message.role === 'user' && replacementContent !== undefined
          ? { ...message, content: replacementContent }
          : message,
      ),
  );
};
