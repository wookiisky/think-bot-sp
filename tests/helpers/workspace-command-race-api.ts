import { vi } from 'vitest';
import { createDefaultConfig } from '../../src/domain/config/config-schema';

/** 为两个工作台提供可延迟的命令响应与真实 port 事件入口。 */
export const createWorkspaceCommandRaceApi = () => {
  const pageUrl = 'https://example.com/article';
  const page = {
    id: pageUrl, url: pageUrl, normalizedUrl: pageUrl, title: '示例页面', faviconUrl: '', content: '正文',
    extractionMethod: 'readability', includePageContent: true, promptTabStates: [], createdAt: 1, updatedAt: 2, expiresAt: 3,
  };
  const messages = [
    { id: 'user-1', role: 'user', content: '旧问题', modelId: null, branches: [] },
    {
      id: 'assistant-1', role: 'assistant', content: '旧回答', modelId: 'model-1',
      branches: [{ id: 'branch-1', modelId: 'model-1', modelLabel: '模型一', isPrimary: true, content: '旧回答', status: 'done', errorMessage: null, durationMs: 10, createdAt: 1, updatedAt: 2 }],
    },
  ].map((message) => ({ ...message, images: [], status: 'done', errorMessage: null, retryFromMessageId: null, editedAt: null, createdAt: 1, updatedAt: 2 }));
  const conversations = [{ id: `${pageUrl}:chat`, normalizedUrl: pageUrl, promptTabId: 'chat', messages, lastAssistantState: null, updatedAt: 2 }];
  const listeners = new Map<string, (event: unknown) => void>();
  let resolveCommand: (value: unknown) => void = () => { throw new Error('command not started'); };
  const command = vi.fn(() => new Promise((resolve) => { resolveCommand = resolve; }));
  const api = {
    getConfig: vi.fn().mockResolvedValue({ type: 'GET_CONFIG_SUCCESS', config: createDefaultConfig() }),
    getSidebarBootstrap: vi.fn().mockResolvedValue({ type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS', browserTabId: 7, normalizedUrl: pageUrl, page, conversations, loadingStates: [], blockedByBlacklist: false, matchedRuleId: null, shouldExtract: false }),
    listPages: vi.fn().mockResolvedValue({ type: 'LIST_PAGES_SUCCESS', pages: [page] }),
    getPageDetail: vi.fn().mockResolvedValue({ type: 'GET_PAGE_DETAIL_SUCCESS', page, conversations, loadingStates: [], activePromptTabId: 'chat' }),
    connectStream: vi.fn(({ promptTabId }: { promptTabId: string }) => ({ disconnect: vi.fn(), onMessage: { addListener: (listener: (event: unknown) => void) => listeners.set(promptTabId, listener), removeListener: vi.fn() } })),
    editUserMessage: vi.fn().mockImplementation(command), retryUserMessage: vi.fn().mockImplementation(command), retryMessage: vi.fn().mockImplementation(command),
    confirmBlacklistContinue: vi.fn(), reExtractContent: vi.fn(), switchExtractionMethod: vi.fn(), clearPageContext: vi.fn(),
    clearTabConversation: vi.fn(), openHistoryPage: vi.fn(), openSettingsPage: vi.fn(), openGithubProject: vi.fn(),
    sendChat: vi.fn(), selectAssistantBranch: vi.fn(), expandMessageBranches: vi.fn(), stopSession: vi.fn(), stopBranch: vi.fn(), deleteBranch: vi.fn(), exportConversation: vi.fn(),
    searchPages: vi.fn(), updatePageTitle: vi.fn(), deletePage: vi.fn(), openSourcePage: vi.fn(),
  };
  return { api, pageUrl, command, resolve: (payload: unknown) => resolveCommand({ payload }), emit: (event: unknown) => listeners.get('chat')?.(event) };
};
