import type { SidebarConversationRecord, SidebarPageRecord } from '../runtime-messaging/sidebar-contract';

type ExportConfig = {
  /** 基础配置。 */
  basic: {
    /** 当前 system prompt。 */
    systemPrompt: string;
  };
  /** 模型配置列表。 */
  models: Array<{
    /** 模型稳定 id。 */
    id: string;
    /** 模型展示名。 */
    name: string;
  }>;
  /** 快捷输入配置列表。 */
  quickInputs: Array<{
    /** promptTab 稳定 id。 */
    id: string;
    /** promptTab 展示名。 */
    name: string;
  }>;
};

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
    getConfig: () => Promise<ExportConfig>;
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

/** 格式化本地时间戳。 */
const formatLocalTimestamp = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('_');
};

/** 解析 promptTab 展示名，历史数据未命中时回退 id。 */
const resolvePromptTabName = (config: ExportConfig, promptTabId: string): string => {
  if (promptTabId === 'chat') {
    return 'Chat';
  }

  return config.quickInputs.find((item) => item.id === promptTabId)?.name ?? promptTabId;
};

/** 解析模型展示名，历史数据未命中时回退 id。 */
const resolveModelName = (config: ExportConfig, modelId: string): string =>
  config.models.find((item) => item.id === modelId)?.name ?? modelId;

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
const renderMessages = (messages: SidebarConversationRecord['messages'], config: ExportConfig): string =>
  messages
    .map((message, index) => {
      const title = `## ${index + 1}. ${message.role === 'user' ? '用户' : message.role === 'assistant' ? '助手' : '系统'}`;
      const statusLine = message.status === 'done' ? '' : `\n状态：${message.status}`;
      const modelLine = message.modelId ? `\n模型：${resolveModelName(config, message.modelId)}` : '';
      const errorLine = message.errorMessage ? `\n错误：${message.errorMessage}` : '';
      const imagesLine = message.images.length > 0 ? `\n图片：${message.images.length} 张` : '';
      const contentBlock = message.content.trim() ? `\n\n${message.content}` : '';
      const branchBlock = message.branches.length > 0 ? `\n\n${renderBranches(message.branches)}` : '';
      return `${title}${statusLine}${modelLine}${errorLine}${imagesLine}${contentBlock}${branchBlock}`.trim();
    })
    .join('\n\n');

/** 渲染 system prompt 段落。 */
const renderSystemPrompt = (systemPrompt: string) => ['## System Prompt', '', systemPrompt.trim(), ''].join('\n');

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
      const pageTitle = page?.title.trim() || page?.normalizedUrl || input.normalizedUrl;
      const promptTabLabel = resolvePromptTabName(config, input.promptTabId);
      const filename = `${sanitizeFilenamePart(pageTitle) || 'conversation'}--${sanitizeFilenamePart(promptTabLabel) || 'tab'}--${formatLocalTimestamp(exportedAt)}.md`;
      const header = [
        '# Think Bot Conversation Export',
        '',
        `- 页面标题：${pageTitle}`,
        `- 页面 URL：${page?.url ?? input.normalizedUrl}`,
        `- Prompt Tab：${promptTabLabel}`,
        `- 导出时间：${exportedAt.toISOString()}`,
        '',
      ].join('\n');

      return {
        type: 'EXPORT_CONVERSATION_SUCCESS' as const,
        payload: {
          filename,
          content: `${header}${renderSystemPrompt(config.basic.systemPrompt)}${renderMessages(conversation.messages, config)}`.trim(),
          mimeType: 'text/markdown;charset=utf-8' as const,
        },
      };
    },
  };
};
