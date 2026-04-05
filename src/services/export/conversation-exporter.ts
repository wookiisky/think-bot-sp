import type { SidebarConversationRecord, SidebarPageRecord } from '../runtime-messaging/sidebar-contract';

type ConversationExporterDeps = {
  /** 页面仓储。 */
  pageRepository: {
    /** 读取页面记录。 */
    getPage: (_normalizedUrl: string) => Promise<SidebarPageRecord | null>;
  };
  /** 会话仓储。 */
  conversationRepository: {
    /** 读取单个会话。 */
    getConversation: (_normalizedUrl: string, _promptTabId: string) => Promise<SidebarConversationRecord | null>;
  };
  /** 配置仓储。 */
  configRepository: {
    /** 读取完整配置。 */
    getConfig: () => Promise<{
      basic: {
        /** 当前 system prompt。 */
        systemPrompt: string;
      };
    }>;
  };
  /** 当前时间。 */
  now?: () => Date;
};

/** 规范化文件名片段。 */
const sanitizeFilenamePart = (value: string): string =>
  value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

/** 渲染分支 Markdown。 */
const renderBranches = (branches: SidebarConversationRecord['messages'][number]['branches']): string =>
  branches
    .map((branch, index) => {
      const header = `### 分支 ${index + 1} | ${branch.modelLabel} | ${branch.status}`;
      const errorBlock = branch.errorMessage ? `\n错误：${branch.errorMessage}` : '';
      const contentBlock = branch.content.trim() ? `\n\n${branch.content}` : '';
      return `${header}${errorBlock}${contentBlock}`.trim();
    })
    .join('\n\n');

/** 渲染消息 Markdown。 */
const renderMessages = (messages: SidebarConversationRecord['messages']): string =>
  messages
    .map((message, index) => {
      const title = `## ${index + 1}. ${message.role === 'user' ? '用户' : message.role === 'assistant' ? '助手' : '系统'} | ${message.status}`;
      const modelLine = message.modelId ? `\n模型：${message.modelId}` : '';
      const errorLine = message.errorMessage ? `\n错误：${message.errorMessage}` : '';
      const imagesLine = message.images.length > 0 ? `\n图片：${message.images.length} 张` : '';
      const contentBlock = message.content.trim() ? `\n\n${message.content}` : '';
      const branchBlock = message.branches.length > 0 ? `\n\n${renderBranches(message.branches)}` : '';
      return `${title}${modelLine}${errorLine}${imagesLine}${contentBlock}${branchBlock}`.trim();
    })
    .join('\n\n');

/** 渲染 system prompt 段落。 */
const renderSystemPrompt = (systemPrompt: string) => ['## System Prompt', '', systemPrompt.trim() || '（空）', ''].join('\n');

/** 创建会话导出器。 */
export const createConversationExporter = (deps: ConversationExporterDeps) => {
  const now = deps.now ?? (() => new Date());

  return {
    /** 导出单个 promptTab 会话为 Markdown。 */
    async exportConversation(input: { normalizedUrl: string; promptTabId: string }) {
      const [page, conversation, config] = await Promise.all([
        deps.pageRepository.getPage(input.normalizedUrl),
        deps.conversationRepository.getConversation(input.normalizedUrl, input.promptTabId),
        deps.configRepository.getConfig(),
      ]);
      if (!conversation) {
        throw new Error('conversation not found');
      }

      const hasExportableMessage = conversation.messages.some(
        (message) =>
          message.content.trim().length > 0 ||
          message.images.length > 0 ||
          message.branches.some((branch) => branch.content.trim().length > 0 || branch.errorMessage),
      );
      if (!hasExportableMessage) {
        throw new Error('conversation is empty');
      }

      const exportedAt = now();
      const exportedDate = exportedAt.toISOString().slice(0, 10);
      const pageTitle = page?.title.trim() || page?.normalizedUrl || input.normalizedUrl;
      const promptTabLabel = input.promptTabId === 'chat' ? 'chat' : input.promptTabId;
      const filename = `think-bot-sp-${sanitizeFilenamePart(pageTitle) || 'conversation'}-${sanitizeFilenamePart(promptTabLabel) || 'tab'}-${exportedDate}.md`;
      const header = [
        '# Think Bot Conversation Export',
        '',
        `- 页面标题：${pageTitle}`,
        `- 页面 URL：${page?.url ?? input.normalizedUrl}`,
        `- Prompt Tab：${input.promptTabId}`,
        `- 导出时间：${exportedAt.toISOString()}`,
        '',
      ].join('\n');

      return {
        type: 'EXPORT_CONVERSATION_SUCCESS' as const,
        payload: {
          filename,
          content: `${header}${renderSystemPrompt(config.basic.systemPrompt)}${renderMessages(conversation.messages)}`.trim(),
          mimeType: 'text/markdown;charset=utf-8' as const,
        },
      };
    },
  };
};
