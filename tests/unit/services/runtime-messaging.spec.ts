import { describe, expect, it, vi } from 'vitest';

import { createChromeLocalAdapter } from '../../../src/repositories/chrome-local-adapter';
import { createConversationRepository } from '../../../src/repositories/conversation-repository';
import {
  sidebarPortEventSchema,
  sidebarPortNameSchema,
  sidebarBootstrapCommandSchema,
  sidebarBootstrapResponseSchema,
  sidebarCommandSchema,
  sidebarPortClientMessageSchema,
  sidebarCommandTypeSchema,
  sidebarCommandTypeValues,
} from '../../../src/services/runtime-messaging/sidebar-contract';
import { createPortBus } from '../../../src/services/runtime-messaging/port-bus';
import { createSidebarCommandHandler, isSidebarCommandMessage, sidebarCommandTypes } from '../../../src/services/runtime-messaging/sidebar-commands';
import { createSidebarSessionRegistry } from '../../../src/services/runtime-messaging/sidebar-session-registry';
import { assertSidebarPageSender, isSidebarPageSender } from '../../../src/services/runtime-messaging/sender';
import { createFakeStorageArea } from '../../helpers/fake-storage';

describe('runtime-messaging', () => {
  it('阶段 4 扩展 sidebar 命令与流式事件契约', () => {
    expect(sidebarCommandTypeValues).toEqual([
      'GET_SIDEBAR_BOOTSTRAP',
      'CONFIRM_BLACKLIST_CONTINUE',
      'SWITCH_EXTRACTION_METHOD',
      'RE_EXTRACT_CONTENT',
      'CLEAR_PAGE_CONTEXT',
      'CLEAR_TAB_CONVERSATION',
      'SEND_CHAT',
      'EDIT_USER_MESSAGE',
      'RETRY_USER_MESSAGE',
      'RETRY_MESSAGE',
      'SELECT_ASSISTANT_BRANCH',
      'EXPAND_MESSAGE_BRANCHES',
      'STOP_SESSION',
      'STOP_BRANCH',
      'DELETE_BRANCH',
      'EXPORT_CONVERSATION',
    ]);
    expect(sidebarCommandTypeSchema.parse('GET_SIDEBAR_BOOTSTRAP')).toBe('GET_SIDEBAR_BOOTSTRAP');
    expect(sidebarPortNameSchema.parse('sidepanel')).toBe('sidepanel');
    expect(
      sidebarBootstrapCommandSchema.parse({
        type: 'GET_SIDEBAR_BOOTSTRAP',
        tabId: 7,
        pageUrl: 'https://example.com/article?utm_source=newsletter#details',
      }),
    ).toEqual({
      type: 'GET_SIDEBAR_BOOTSTRAP',
      tabId: 7,
      pageUrl: 'https://example.com/article?utm_source=newsletter#details',
    });
    expect(
      sidebarBootstrapResponseSchema.parse({
        type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
        browserTabId: 7,
        normalizedUrl: 'https://example.com/article',
        page: null,
        conversations: [],
        loadingStates: [],
        blockedByBlacklist: false,
        matchedRuleId: null,
        shouldExtract: true,
      }),
    ).toEqual({
      type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
      browserTabId: 7,
      normalizedUrl: 'https://example.com/article',
      page: null,
      conversations: [],
      loadingStates: [],
      blockedByBlacklist: false,
      matchedRuleId: null,
      shouldExtract: true,
    });
    expect(
      sidebarCommandSchema.parse({
        type: 'RE_EXTRACT_CONTENT',
        tabId: 7,
        pageUrl: 'https://example.com/article',
        method: 'readability',
        source: 'panel_bootstrap',
      }),
    ).toEqual({
      type: 'RE_EXTRACT_CONTENT',
      tabId: 7,
      pageUrl: 'https://example.com/article',
      method: 'readability',
      source: 'panel_bootstrap',
    });
    expect(
      sidebarCommandSchema.parse({
        type: 'CLEAR_PAGE_CONTEXT',
        tabId: 7,
        pageUrl: 'https://example.com/article',
      }),
    ).toEqual({
      type: 'CLEAR_PAGE_CONTEXT',
      tabId: 7,
      pageUrl: 'https://example.com/article',
    });
    expect(
      sidebarCommandSchema.parse({
        type: 'CLEAR_TAB_CONVERSATION',
        tabId: 7,
        pageUrl: 'https://example.com/article',
        promptTabId: 'quick-summary',
      }),
    ).toEqual({
      type: 'CLEAR_TAB_CONVERSATION',
      tabId: 7,
      pageUrl: 'https://example.com/article',
      promptTabId: 'quick-summary',
    });
    expect(
      sidebarCommandSchema.parse({
        type: 'SEND_CHAT',
        tabId: 7,
        pageUrl: 'https://example.com/article',
        promptTabId: 'chat',
        modelId: 'model-1',
        text: '你好',
        displayText: '概括',
        images: [],
        includePageContent: true,
      }),
    ).toEqual(
      expect.objectContaining({
        type: 'SEND_CHAT',
        promptTabId: 'chat',
        modelId: 'model-1',
        displayText: '概括',
      }),
    );
    expect(
      sidebarCommandSchema.parse({
        type: 'EXPAND_MESSAGE_BRANCHES',
        tabId: 7,
        pageUrl: 'https://example.com/article',
        promptTabId: 'chat',
        messageId: 'assistant-1',
        modelId: 'model-2',
      }),
    ).toEqual({
      type: 'EXPAND_MESSAGE_BRANCHES',
      tabId: 7,
      pageUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'assistant-1',
      modelId: 'model-2',
    });
    expect(
      sidebarCommandSchema.parse({
        type: 'EDIT_USER_MESSAGE',
        tabId: 7,
        pageUrl: 'https://example.com/article',
        promptTabId: 'chat',
        messageId: 'user-1',
        text: '更新后的问题',
      }),
    ).toEqual({
      type: 'EDIT_USER_MESSAGE',
      tabId: 7,
      pageUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'user-1',
      text: '更新后的问题',
    });
    expect(
      sidebarCommandSchema.parse({
        type: 'RETRY_USER_MESSAGE',
        tabId: 7,
        pageUrl: 'https://example.com/article',
        promptTabId: 'chat',
        messageId: 'user-1',
      }),
    ).toEqual({
      type: 'RETRY_USER_MESSAGE',
      tabId: 7,
      pageUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'user-1',
    });
    expect(
      sidebarCommandSchema.parse({
        type: 'RETRY_MESSAGE',
        tabId: 7,
        pageUrl: 'https://example.com/article',
        promptTabId: 'chat',
        messageId: 'assistant-1',
        branchId: 'branch-1',
      }),
    ).toEqual({
      type: 'RETRY_MESSAGE',
      tabId: 7,
      pageUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'assistant-1',
      branchId: 'branch-1',
    });
    expect(
      sidebarPortClientMessageSchema.parse({
        type: 'SUBSCRIBE_SIDEBAR_STREAM',
        tabId: 7,
        pageUrl: 'https://example.com/article',
        promptTabId: 'chat',
      }),
    ).toEqual({
      type: 'SUBSCRIBE_SIDEBAR_STREAM',
      tabId: 7,
      pageUrl: 'https://example.com/article',
      promptTabId: 'chat',
    });
    expect(
      sidebarPortEventSchema.parse({
        type: 'RESTORE_LOADING',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-1',
        messageId: 'assistant-1',
        content: '部分回答',
      }),
    ).toEqual(
      expect.objectContaining({
        type: 'RESTORE_LOADING',
        sessionId: 'session-1',
      }),
    );
    expect(
      sidebarPortEventSchema.parse({
        type: 'BRANCH_STREAM_STARTED',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-branch',
        messageId: 'assistant-1',
        branchId: 'branch-1',
        modelId: 'model-2',
        modelLabel: '分支模型',
      }),
    ).toEqual(
      expect.objectContaining({
        type: 'BRANCH_STREAM_STARTED',
        branchId: 'branch-1',
      }),
    );
    expect(isSidebarCommandMessage({ type: 'GET_SIDEBAR_BOOTSTRAP' })).toBe(true);
    expect(isSidebarCommandMessage({ type: 'CLEAR_PAGE_CONTEXT' })).toBe(true);
    expect(isSidebarCommandMessage({ type: 'CLEAR_TAB_CONVERSATION' })).toBe(true);
    expect(sidebarCommandTypes.has('CLEAR_PAGE_CONTEXT' as never)).toBe(true);
    expect(sidebarCommandTypes.has('CLEAR_TAB_CONVERSATION' as never)).toBe(true);
  });

  it('bootstrap 只接受 tabId + pageUrl，并在 handler 内部完成 sender 校验和 URL 归一化', async () => {
    const storage = createFakeStorageArea();
    const conversationRepository = createConversationRepository(createChromeLocalAdapter(storage));

    await conversationRepository.saveConversation({
      id: 'https://example.com/article:chat',
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messages: [],
      lastAssistantState: null,
      updatedAt: 1,
    });
    await conversationRepository.saveLoadingState({
      id: 'loading:https://example.com/article:chat',
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      sessionId: 'session-1',
      promptTabStatus: 'loading',
      branchStates: [],
      resumeTarget: null,
      cancelRequested: false,
      updatedAt: 1,
    });

    const pageRepository = {
      getPage: vi.fn().mockResolvedValue({
        id: 'https://example.com/article',
        url: 'https://example.com/article',
        normalizedUrl: 'https://example.com/article',
        title: '示例页面',
        faviconUrl: '',
        content: '',
        extractionMethod: 'readability',
        includePageContent: true,
        promptTabStates: [],
        createdAt: 1,
        updatedAt: 1,
        expiresAt: 2,
      }),
    };
    const blacklistRepository = {
      isBlocked: vi.fn().mockReturnValue(false),
      getMatchedRuleId: vi.fn().mockReturnValue(null),
    };
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const handler = createSidebarCommandHandler({
      runtime: { id: 'ext-id' },
      pageRepository,
      conversationRepository,
      sessionRegistry: createSidebarSessionRegistry(),
      blacklistRepository,
      logger,
    });

    await expect(
      handler(
        {
          type: 'GET_SIDEBAR_BOOTSTRAP',
          tabId: 7,
          pageUrl: 'https://example.com/article?utm_source=newsletter#details',
        },
        {
          sender: {
            id: 'ext-id',
            url: 'chrome-extension://ext-id/sidebar.html',
          },
        },
      ),
    ).resolves.toEqual({
      type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
      browserTabId: 7,
      normalizedUrl: 'https://example.com/article',
      page: {
        id: 'https://example.com/article',
        url: 'https://example.com/article',
        normalizedUrl: 'https://example.com/article',
        title: '示例页面',
        faviconUrl: '',
        content: '',
        extractionMethod: 'readability',
        includePageContent: true,
        promptTabStates: [],
        createdAt: 1,
        updatedAt: 1,
        expiresAt: 2,
      },
      conversations: [
        {
          id: 'https://example.com/article:chat',
          normalizedUrl: 'https://example.com/article',
          promptTabId: 'chat',
          messages: [],
          lastAssistantState: null,
          updatedAt: 1,
        },
      ],
      loadingStates: [
        {
          id: 'loading:https://example.com/article:chat',
          normalizedUrl: 'https://example.com/article',
          promptTabId: 'chat',
          sessionId: 'session-1',
          promptTabStatus: 'loading',
          branchStates: [],
          resumeTarget: null,
          cancelRequested: false,
          updatedAt: 1,
        },
      ],
      blockedByBlacklist: false,
      matchedRuleId: null,
      shouldExtract: true,
    });
    expect(pageRepository.getPage).toHaveBeenCalledWith('https://example.com/article');
    expect(blacklistRepository.isBlocked).toHaveBeenCalledWith({
      browserTabId: 7,
      normalizedUrl: 'https://example.com/article',
    });
    expect(logger.info).toHaveBeenCalledWith('panel.init.started', {
      browserTabId: 7,
      normalizedUrl: 'https://example.com/article',
    });
    expect(logger.info).toHaveBeenCalledWith('page.info.loaded', {
      browserTabId: 7,
      normalizedUrl: 'https://example.com/article',
      hasPage: true,
      conversationCount: 1,
      loadingCount: 1,
    });
  });

  it('bootstrap 命中黑名单时会记录 blacklist.detected', async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const handler = createSidebarCommandHandler({
      runtime: { id: 'ext-id' },
      pageRepository: {
        getPage: vi.fn().mockResolvedValue({
          id: 'https://example.com/article',
          url: 'https://example.com/article',
          normalizedUrl: 'https://example.com/article',
          title: '示例页面',
          faviconUrl: '',
          content: '分支页面正文',
          extractionMethod: 'readability',
          includePageContent: true,
          promptTabStates: [],
          createdAt: 1,
          updatedAt: 1,
          expiresAt: 2,
        }),
      },
      conversationRepository: {
        listPageConversations: vi.fn().mockResolvedValue([]),
        listPageLoadingStates: vi.fn().mockResolvedValue([]),
      },
      sessionRegistry: createSidebarSessionRegistry(),
      blacklistRepository: {
        isBlocked: vi.fn().mockResolvedValue(true),
        getMatchedRuleId: vi.fn().mockResolvedValue('rule-1'),
      },
      logger,
    });

    await handler(
      {
        type: 'GET_SIDEBAR_BOOTSTRAP',
        tabId: 7,
        pageUrl: 'https://example.com/article',
      },
      {
        sender: {
          id: 'ext-id',
          url: 'chrome-extension://ext-id/sidebar.html',
        },
      },
    );

    expect(logger.info).toHaveBeenCalledWith('blacklist.detected', {
      browserTabId: 7,
      normalizedUrl: 'https://example.com/article',
      matchedRuleId: 'rule-1',
    });
  });

  it('bootstrap 会拒绝非 sidebar.html 的 sender', async () => {
    const handler = createSidebarCommandHandler({
      runtime: { id: 'ext-id' },
      pageRepository: {
        getPage: vi.fn(),
      },
      conversationRepository: {
        listPageConversations: vi.fn(),
        listPageLoadingStates: vi.fn(),
      },
      sessionRegistry: createSidebarSessionRegistry(),
      blacklistRepository: {
        isBlocked: vi.fn(),
        getMatchedRuleId: vi.fn(),
      },
    });

    await expect(
      handler(
        {
          type: 'GET_SIDEBAR_BOOTSTRAP',
          tabId: 7,
          pageUrl: 'https://example.com/article',
        },
        {
          sender: {
            id: 'ext-id',
            url: 'chrome-extension://ext-id/options.html',
          },
        },
      ),
    ).rejects.toThrow(/sidebar\.html/i);
  });

  it('sender 只接受 runtime.id 且来源是 sidebar.html', () => {
    expect(
      isSidebarPageSender(
        {
          id: 'ext-id',
          url: 'chrome-extension://ext-id/sidebar.html',
        },
        'ext-id',
      ),
    ).toBe(true);
    expect(
      isSidebarPageSender(
        {
          id: 'ext-id',
          url: 'chrome-extension://ext-id/sidebar.html?tabId=7&pageUrl=https%3A%2F%2Fexample.com',
        },
        'ext-id',
      ),
    ).toBe(true);
    expect(
      isSidebarPageSender(
        {
          id: 'ext-id',
          url: 'chrome-extension://ext-id/options.html',
        },
        'ext-id',
      ),
    ).toBe(false);
    expect(
      isSidebarPageSender(
        {
          id: 'other-id',
          url: 'chrome-extension://ext-id/sidebar.html',
        },
        'ext-id',
      ),
    ).toBe(false);
    expect(() =>
      assertSidebarPageSender(
        {
          id: 'ext-id',
          url: 'chrome-extension://ext-id/options.html',
        },
        'ext-id',
      ),
    ).toThrow(/sidebar\.html/i);
  });

  it('阶段 4 命令会路由发送与停止会话', async () => {
    const cancel = vi.fn();
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const dispatchChat = vi.fn().mockResolvedValue({
      sessionId: 'session-1',
      userMessageId: 'user-1',
      messageId: 'assistant-1',
      branchId: '',
      modelId: 'model-1',
      modelLabel: '',
      branches: [],
      cancel,
      done: new Promise(() => undefined),
    });
    const pageRepository = {
      getPage: vi.fn().mockResolvedValue({
        id: 'https://example.com/article',
        url: 'https://example.com/article',
        normalizedUrl: 'https://example.com/article',
        title: '示例页面',
        faviconUrl: '',
        content: '页面缓存正文',
        extractionMethod: 'readability',
        includePageContent: true,
        promptTabStates: [],
        createdAt: 1,
        updatedAt: 1,
        expiresAt: 2,
      }),
      setIncludePageContent: vi.fn().mockResolvedValue({
        id: 'https://example.com/article',
        url: 'https://example.com/article',
        normalizedUrl: 'https://example.com/article',
        title: '示例页面',
        faviconUrl: '',
        content: '页面缓存正文',
        extractionMethod: 'readability',
        includePageContent: true,
        promptTabStates: [],
        createdAt: 1,
        updatedAt: 2,
        expiresAt: 3,
      }),
    };
    const handler = createSidebarCommandHandler({
      runtime: { id: 'ext-id' },
      pageRepository,
      conversationRepository: {
        listPageConversations: vi.fn(),
        listPageLoadingStates: vi.fn(),
      },
      sessionRegistry: createSidebarSessionRegistry(),
      blacklistRepository: {
        isBlocked: vi.fn(),
        getMatchedRuleId: vi.fn(),
      },
      logger,
      chatDispatchService: {
        dispatchChat,
        editUserMessage: vi.fn(),
        retryUserMessage: vi.fn(),
        retryMessage: vi.fn(),
        expandBranches: vi.fn(),
      },
    });

    await expect(
      handler(
        {
          type: 'SEND_CHAT',
          tabId: 7,
          pageUrl: 'https://example.com/article',
          promptTabId: 'chat',
          modelId: 'model-1',
          text: '你好',
          displayText: '概括',
          images: [],
          includePageContent: true,
        },
        {
          sender: {
            id: 'ext-id',
            url: 'chrome-extension://ext-id/sidebar.html',
          },
        },
      ),
    ).resolves.toEqual({
      type: 'SEND_CHAT_SUCCESS',
      payload: {
        sessionId: 'session-1',
        userMessageId: 'user-1',
        messageId: 'assistant-1',
        branchId: '',
        modelId: 'model-1',
        modelLabel: '',
        branches: [],
      },
    });
    expect(pageRepository.setIncludePageContent).toHaveBeenCalledWith({
      normalizedUrl: 'https://example.com/article',
      url: 'https://example.com/article',
      includePageContent: true,
    });
    expect(dispatchChat).toHaveBeenCalledWith({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      modelId: 'model-1',
      content: '你好',
      displayText: '概括',
      images: [],
      pageContent: '页面缓存正文',
    });
    expect(logger.info).toHaveBeenCalledWith('chat.send.accepted', {
      browserTabId: 7,
      normalizedUrl: 'https://example.com/article',
      promptTab: 'chat',
      sessionId: 'session-1',
      messageId: 'assistant-1',
      modelId: 'model-1',
    });
    await expect(
      handler(
        {
          type: 'STOP_SESSION',
          tabId: 7,
          pageUrl: 'https://example.com/article',
          promptTabId: 'chat',
          sessionId: 'session-1',
        },
        {
          sender: {
            id: 'ext-id',
            url: 'chrome-extension://ext-id/sidebar.html',
          },
        },
      ),
    ).resolves.toEqual({
      type: 'STOP_SESSION_SUCCESS',
      payload: {
        sessionId: 'session-1',
        stopped: true,
      },
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith('chat.cancel.requested', {
      browserTabId: 7,
      normalizedUrl: 'https://example.com/article',
      promptTab: 'chat',
      sessionId: 'session-1',
      stopped: true,
    });
  });

  it('分支命令会路由新增、停止和删除分支', async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    let resolveBranchDone: (() => void) | null = null;
    const cancelBranch = vi.fn(() => {
      resolveBranchDone?.();
    });
    const branchDone = new Promise<void>((resolve) => {
      resolveBranchDone = resolve;
    });
    const expandBranches = vi.fn().mockResolvedValue([
      {
        sessionId: 'branch-session-1',
        messageId: 'assistant-1',
        branchId: 'branch-1',
        modelId: 'model-2',
        modelLabel: '分支模型',
        cancel: cancelBranch,
        done: branchDone,
      },
    ]);
    const deleteAssistantBranch = vi.fn().mockResolvedValue(undefined);
    const removeBranchLoadingState = vi.fn().mockResolvedValue(undefined);
    const handler = createSidebarCommandHandler({
      runtime: { id: 'ext-id' },
      pageRepository: {
        getPage: vi.fn().mockResolvedValue({
          id: 'https://example.com/article',
          url: 'https://example.com/article',
          normalizedUrl: 'https://example.com/article',
          title: '示例页面',
          faviconUrl: '',
          content: '分支页面正文',
          extractionMethod: 'readability',
          includePageContent: true,
          promptTabStates: [],
          createdAt: 1,
          updatedAt: 1,
          expiresAt: 2,
        }),
      },
      conversationRepository: {
        listPageConversations: vi.fn(),
        listPageLoadingStates: vi.fn(),
        deleteAssistantBranch,
        removeBranchLoadingState,
      },
      sessionRegistry: createSidebarSessionRegistry(),
      blacklistRepository: {
        isBlocked: vi.fn(),
        getMatchedRuleId: vi.fn(),
      },
      logger,
      chatDispatchService: {
        dispatchChat: vi.fn(),
        editUserMessage: vi.fn(),
        retryUserMessage: vi.fn(),
        retryMessage: vi.fn(),
        expandBranches,
      },
    });

    await expect(
      handler(
        {
          type: 'EXPAND_MESSAGE_BRANCHES',
          tabId: 7,
          pageUrl: 'https://example.com/article',
          promptTabId: 'chat',
          messageId: 'assistant-1',
          modelId: 'model-2',
        },
        {
          sender: {
            id: 'ext-id',
            url: 'chrome-extension://ext-id/sidebar.html',
          },
        },
      ),
    ).resolves.toEqual({
      type: 'EXPAND_MESSAGE_BRANCHES_SUCCESS',
      payload: {
        messageId: 'assistant-1',
        branches: [
          {
            branchId: 'branch-1',
            modelId: 'model-2',
            modelLabel: '分支模型',
          },
        ],
      },
    });

    await expect(
      handler(
        {
          type: 'STOP_BRANCH',
          tabId: 7,
          pageUrl: 'https://example.com/article',
          promptTabId: 'chat',
          branchId: 'branch-1',
        },
        {
          sender: {
            id: 'ext-id',
            url: 'chrome-extension://ext-id/sidebar.html',
          },
        },
      ),
    ).resolves.toEqual({
      type: 'STOP_BRANCH_SUCCESS',
      payload: {
        branchId: 'branch-1',
        stopped: true,
      },
    });

    await expect(
      handler(
        {
          type: 'DELETE_BRANCH',
          tabId: 7,
          pageUrl: 'https://example.com/article',
          promptTabId: 'chat',
          messageId: 'assistant-1',
          branchId: 'branch-1',
        },
        {
          sender: {
            id: 'ext-id',
            url: 'chrome-extension://ext-id/sidebar.html',
          },
        },
      ),
    ).resolves.toEqual({
      type: 'DELETE_BRANCH_SUCCESS',
      payload: {
        messageId: 'assistant-1',
        branchId: 'branch-1',
        deleted: true,
      },
    });

    expect(expandBranches).toHaveBeenCalledWith({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'assistant-1',
      modelId: 'model-2',
      pageContent: '分支页面正文',
    });
    expect(logger.info).toHaveBeenCalledWith('branch.expand.accepted', {
      browserTabId: 7,
      normalizedUrl: 'https://example.com/article',
      promptTab: 'chat',
      messageId: 'assistant-1',
      branchCount: 1,
    });
    expect(cancelBranch).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith('branch.cancel.requested', {
      browserTabId: 7,
      normalizedUrl: 'https://example.com/article',
      promptTab: 'chat',
      branchId: 'branch-1',
      stopped: true,
    });
    expect(deleteAssistantBranch).toHaveBeenCalledWith({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'assistant-1',
      branchId: 'branch-1',
      now: expect.any(Number),
    });
    expect(removeBranchLoadingState).toHaveBeenCalledWith('https://example.com/article', 'chat', 'branch-1');
    expect(logger.info).toHaveBeenCalledWith('branch.delete.completed', {
      browserTabId: 7,
      normalizedUrl: 'https://example.com/article',
      promptTab: 'chat',
      messageId: 'assistant-1',
      branchId: 'branch-1',
    });
  });

  it('编辑与重试命令会路由到调度服务并注册新会话', async () => {
    const editUserMessage = vi.fn().mockResolvedValue({
      sessionId: 'session-edit',
      messageId: 'assistant-edit',
      branchId: 'assistant-edit:primary',
      modelId: 'model-1',
      modelLabel: '主模型',
      branches: [
        {
          branchId: 'assistant-edit:primary',
          modelId: 'model-1',
          modelLabel: '主模型',
        },
      ],
      cancel: vi.fn(),
      done: Promise.resolve({
        sessionId: 'session-edit',
        messageId: 'assistant-edit',
        status: 'done',
        errorMessage: null,
      }),
    });
    const retryUserMessage = vi.fn().mockResolvedValue({
      sessionId: 'session-user-retry',
      messageId: 'assistant-1',
      branchId: 'branch-1',
      modelId: 'model-1',
      modelLabel: '主模型',
      branches: [
        {
          branchId: 'branch-1',
          modelId: 'model-1',
          modelLabel: '主模型',
        },
      ],
      cancel: vi.fn(),
      done: Promise.resolve({
        sessionId: 'session-user-retry',
        messageId: 'assistant-1',
        status: 'done',
        errorMessage: null,
      }),
    });
    const retryMessage = vi.fn().mockResolvedValue({
      sessionId: 'session-retry',
      messageId: 'assistant-retry',
      branchId: 'branch-retry',
      cancel: vi.fn(),
      done: Promise.resolve({
        sessionId: 'session-retry',
        messageId: 'assistant-retry',
        status: 'done',
        errorMessage: null,
      }),
    });
    const handler = createSidebarCommandHandler({
      runtime: { id: 'ext-id' },
      pageRepository: {
        getPage: vi.fn().mockResolvedValue({
          id: 'https://example.com/article',
          url: 'https://example.com/article',
          normalizedUrl: 'https://example.com/article',
          title: '示例页面',
          faviconUrl: '',
          content: '页面缓存正文',
          extractionMethod: 'readability',
          includePageContent: true,
          promptTabStates: [],
          createdAt: 1,
          updatedAt: 1,
          expiresAt: 2,
        }),
      },
      conversationRepository: {
        listPageConversations: vi.fn(),
        listPageLoadingStates: vi.fn(),
      },
      sessionRegistry: createSidebarSessionRegistry(),
      blacklistRepository: {
        isBlocked: vi.fn(),
        getMatchedRuleId: vi.fn(),
      },
      chatDispatchService: {
        dispatchChat: vi.fn(),
        editUserMessage,
        retryUserMessage,
        retryMessage,
        expandBranches: vi.fn(),
      },
    });

    await expect(
      handler(
        {
          type: 'EDIT_USER_MESSAGE',
          tabId: 7,
          pageUrl: 'https://example.com/article',
          promptTabId: 'chat',
          messageId: 'user-1',
          text: '编辑后的问题',
        },
        {
          sender: {
            id: 'ext-id',
            url: 'chrome-extension://ext-id/sidebar.html',
          },
        },
      ),
    ).resolves.toEqual({
      type: 'EDIT_USER_MESSAGE_SUCCESS',
      payload: {
        editedMessageId: 'user-1',
        messageId: 'assistant-edit',
        branchId: 'assistant-edit:primary',
        modelId: 'model-1',
        modelLabel: '主模型',
        sessionId: 'session-edit',
        branches: [
          {
            branchId: 'assistant-edit:primary',
            modelId: 'model-1',
            modelLabel: '主模型',
          },
        ],
      },
    });

    await expect(
      handler(
        {
          type: 'RETRY_USER_MESSAGE',
          tabId: 7,
          pageUrl: 'https://example.com/article',
          promptTabId: 'chat',
          messageId: 'user-1',
        },
        {
          sender: {
            id: 'ext-id',
            url: 'chrome-extension://ext-id/sidebar.html',
          },
        },
      ),
    ).resolves.toEqual({
      type: 'RETRY_USER_MESSAGE_SUCCESS',
      payload: {
        retriedMessageId: 'user-1',
        messageId: 'assistant-1',
        branchId: 'branch-1',
        modelId: 'model-1',
        modelLabel: '主模型',
        sessionId: 'session-user-retry',
        branches: [
          {
            branchId: 'branch-1',
            modelId: 'model-1',
            modelLabel: '主模型',
          },
        ],
      },
    });

    await expect(
      handler(
        {
          type: 'RETRY_MESSAGE',
          tabId: 7,
          pageUrl: 'https://example.com/article',
          promptTabId: 'chat',
          messageId: 'assistant-1',
          branchId: 'branch-retry',
        },
        {
          sender: {
            id: 'ext-id',
            url: 'chrome-extension://ext-id/sidebar.html',
          },
        },
      ),
    ).resolves.toEqual({
      type: 'RETRY_MESSAGE_SUCCESS',
      payload: {
        messageId: 'assistant-retry',
        branchId: 'branch-retry',
        sessionId: 'session-retry',
      },
    });

    expect(editUserMessage).toHaveBeenCalledWith({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'user-1',
      content: '编辑后的问题',
      pageContent: '页面缓存正文',
    });
    expect(retryUserMessage).toHaveBeenCalledWith({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'user-1',
      pageContent: '页面缓存正文',
    });
    expect(retryMessage).toHaveBeenCalledWith({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      messageId: 'assistant-1',
      branchId: 'branch-retry',
      pageContent: '页面缓存正文',
    });
  });

  it('页面级清空会先取消当前页面活跃会话，再清理页面数据', async () => {
    const events: string[] = [];
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const activeSessionDone = new Promise<void>((resolve) => {
      setTimeout(() => {
        events.push('done');
        resolve();
      }, 0);
    });
    const handler = createSidebarCommandHandler({
      runtime: { id: 'ext-id' },
      pageRepository: {
        getPage: vi.fn().mockResolvedValue(null),
        setIncludePageContent: vi.fn().mockResolvedValue(null),
        deletePage: vi.fn(async () => {
          events.push('delete');
        }),
      },
      conversationRepository: {
        listPageConversations: vi.fn(),
        listPageLoadingStates: vi.fn(),
      },
      sessionRegistry: createSidebarSessionRegistry(),
      blacklistRepository: {
        isBlocked: vi.fn(),
        getMatchedRuleId: vi.fn(),
      },
      logger,
      chatDispatchService: {
        dispatchChat: vi.fn().mockResolvedValue({
          sessionId: 'session-1',
          messageId: 'assistant-1',
          cancel: vi.fn(() => {
            events.push('cancel');
          }),
          done: activeSessionDone,
        }),
        editUserMessage: vi.fn(),
        retryUserMessage: vi.fn(),
        retryMessage: vi.fn(),
        expandBranches: vi.fn(),
      },
    });

    await handler(
      {
        type: 'SEND_CHAT',
        tabId: 7,
        pageUrl: 'https://example.com/article',
        promptTabId: 'chat',
        modelId: 'model-1',
        text: '你好',
        images: [],
        includePageContent: false,
      },
      {
        sender: {
          id: 'ext-id',
          url: 'chrome-extension://ext-id/sidebar.html',
        },
      },
    );

    await expect(
      handler(
        {
          type: 'CLEAR_PAGE_CONTEXT',
          tabId: 7,
          pageUrl: 'https://example.com/article',
        },
        {
          sender: {
            id: 'ext-id',
            url: 'chrome-extension://ext-id/sidebar.html',
          },
        },
      ),
    ).resolves.toEqual({
      type: 'CLEAR_PAGE_CONTEXT_SUCCESS',
      payload: {
        normalizedUrl: 'https://example.com/article',
        cleared: true,
      },
    });

    expect(events).toEqual(['cancel', 'done', 'delete']);
    expect(logger.info).toHaveBeenCalledWith('page.clear.completed', {
      browserTabId: 7,
      normalizedUrl: 'https://example.com/article',
    });
  });

  it('标签级清空只取消当前 promptTab 会话并重置该标签状态', async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const chatCancel = vi.fn();
    let resolveQuickDone: (() => void) | null = null;
    const quickCancel = vi.fn(() => {
      resolveQuickDone?.();
    });
    const chatDone = new Promise<void>(() => undefined);
    const quickDone = new Promise<void>((resolve) => {
      resolveQuickDone = resolve;
    });
    const clearPromptTabData = vi.fn().mockResolvedValue(undefined);
    const setPromptTabState = vi.fn().mockResolvedValue(undefined);
    const handler = createSidebarCommandHandler({
      runtime: { id: 'ext-id' },
      pageRepository: {
        getPage: vi.fn().mockResolvedValue(null),
        setPromptTabState,
      },
      conversationRepository: {
        listPageConversations: vi.fn(),
        listPageLoadingStates: vi.fn(),
        clearPromptTabData,
      },
      sessionRegistry: createSidebarSessionRegistry(),
      blacklistRepository: {
        isBlocked: vi.fn(),
        getMatchedRuleId: vi.fn(),
      },
      logger,
      chatDispatchService: {
        dispatchChat: vi
          .fn()
          .mockResolvedValueOnce({
            sessionId: 'session-chat',
            messageId: 'assistant-chat',
            cancel: chatCancel,
            done: chatDone,
          })
          .mockResolvedValueOnce({
            sessionId: 'session-quick',
            messageId: 'assistant-quick',
            cancel: quickCancel,
            done: quickDone,
          }),
        editUserMessage: vi.fn(),
        retryUserMessage: vi.fn(),
        retryMessage: vi.fn(),
        expandBranches: vi.fn(),
      },
    });

    await handler(
      {
        type: 'SEND_CHAT',
        tabId: 7,
        pageUrl: 'https://example.com/article',
        promptTabId: 'chat',
        modelId: 'model-1',
        text: 'chat',
        images: [],
        includePageContent: false,
      },
      {
        sender: {
          id: 'ext-id',
          url: 'chrome-extension://ext-id/sidebar.html',
        },
      },
    );
    await handler(
      {
        type: 'SEND_CHAT',
        tabId: 7,
        pageUrl: 'https://example.com/article',
        promptTabId: 'quick-summary',
        modelId: 'model-1',
        text: 'quick',
        images: [],
        includePageContent: false,
      },
      {
        sender: {
          id: 'ext-id',
          url: 'chrome-extension://ext-id/sidebar.html',
        },
      },
    );

    await expect(
      handler(
        {
          type: 'CLEAR_TAB_CONVERSATION',
          tabId: 7,
          pageUrl: 'https://example.com/article',
          promptTabId: 'quick-summary',
        },
        {
          sender: {
            id: 'ext-id',
            url: 'chrome-extension://ext-id/sidebar.html',
          },
        },
      ),
    ).resolves.toEqual({
      type: 'CLEAR_TAB_CONVERSATION_SUCCESS',
      payload: {
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'quick-summary',
        cleared: true,
      },
    });

    expect(quickCancel).toHaveBeenCalledTimes(1);
    expect(chatCancel).not.toHaveBeenCalled();
    expect(clearPromptTabData).toHaveBeenCalledWith('https://example.com/article', 'quick-summary');
    expect(setPromptTabState).toHaveBeenCalledWith({
      normalizedUrl: 'https://example.com/article',
      url: 'https://example.com/article',
      promptTabId: 'quick-summary',
      initializedAt: null,
      lastAutoTriggerAt: null,
      autoTriggerStatus: 'idle',
      lastClearedAt: expect.any(Number),
    });
    expect(logger.info).toHaveBeenCalledWith('prompt_tab.clear.completed', {
      browserTabId: 7,
      normalizedUrl: 'https://example.com/article',
      promptTab: 'quick-summary',
    });
  });

  it('导出命令会路由到 conversationExporter', async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const exportConversation = vi.fn().mockResolvedValue({
      type: 'EXPORT_CONVERSATION_SUCCESS',
      payload: {
        filename: 'chat-export.md',
        content: '# 导出',
        mimeType: 'text/markdown;charset=utf-8',
      },
    });
    const handler = createSidebarCommandHandler({
      runtime: { id: 'ext-id' },
      pageRepository: {
        getPage: vi.fn(),
      },
      conversationRepository: {
        listPageConversations: vi.fn(),
        listPageLoadingStates: vi.fn(),
      },
      sessionRegistry: createSidebarSessionRegistry(),
      blacklistRepository: {
        isBlocked: vi.fn(),
        getMatchedRuleId: vi.fn(),
      },
      logger,
      conversationExporter: {
        exportConversation,
      },
    });

    await expect(
      handler(
        {
          type: 'EXPORT_CONVERSATION',
          tabId: 7,
          pageUrl: 'https://example.com/article?utm_source=test',
          promptTabId: 'chat',
        },
        {
          sender: {
            id: 'ext-id',
            url: 'chrome-extension://ext-id/sidebar.html',
          },
        },
      ),
    ).resolves.toEqual({
      type: 'EXPORT_CONVERSATION_SUCCESS',
      payload: {
        filename: 'chat-export.md',
        content: '# 导出',
        mimeType: 'text/markdown;charset=utf-8',
      },
    });

    expect(exportConversation).toHaveBeenCalledWith({
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
    });
    expect(logger.info).toHaveBeenCalledWith('conversation.export.requested', {
      browserTabId: 7,
      normalizedUrl: 'https://example.com/article',
      promptTab: 'chat',
    });
    expect(logger.info).toHaveBeenCalledWith('conversation.export.completed', {
      browserTabId: 7,
      normalizedUrl: 'https://example.com/article',
      promptTab: 'chat',
    });
  });

  it('port bus 会按 promptTab 路由事件，并保留注册与断连广播', () => {
    const events: Array<{ type: string; portName?: string }> = [];
    const bus = createPortBus();
    bus.subscribe((event) => {
      events.push(event);
    });

    const firstDisconnectListeners: Array<() => void> = [];
    const secondDisconnectListeners: Array<() => void> = [];
    const port = {
      name: 'sidepanel',
      sender: {
        documentId: 'doc-1',
      },
      postMessage: vi.fn(),
      disconnect: vi.fn(),
      onDisconnect: {
        addListener: vi.fn((listener: () => void) => {
          firstDisconnectListeners.push(listener);
        }),
        removeListener: vi.fn(),
      },
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    };
    const secondPort = {
      name: 'sidepanel',
      sender: {
        documentId: 'doc-2',
      },
      postMessage: vi.fn(),
      disconnect: vi.fn(),
      onDisconnect: {
        addListener: vi.fn((listener: () => void) => {
          secondDisconnectListeners.push(listener);
        }),
        removeListener: vi.fn(),
      },
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    };

    const firstPortId = bus.register(port as never);
    const secondPortId = bus.register(secondPort as never);
    bus.bindPromptTab(firstPortId, {
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
    });
    bus.bindPromptTab(secondPortId, {
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'quick-1',
    });
    expect(events).toContainEqual({ type: 'PORT_REGISTERED', portName: 'sidepanel' });

    bus.publishToPromptTab(
      {
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
      },
      {
        type: 'RESTORE_LOADING',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-1',
        messageId: 'assistant-1',
        content: '部分回答',
      },
    );
    expect(port.postMessage).toHaveBeenCalledWith({
      type: 'RESTORE_LOADING',
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      sessionId: 'session-1',
      messageId: 'assistant-1',
      content: '部分回答',
    });
    expect(secondPort.postMessage).not.toHaveBeenCalled();

    bus.disconnect(firstPortId);
    expect(port.disconnect).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual({ type: 'PORT_DISCONNECTED', portName: 'sidepanel' });

    const recoveredPortId = bus.recover(port as never);
    expect(recoveredPortId).not.toBe(firstPortId);
    expect(events).toContainEqual({ type: 'PORT_RECOVERED', portName: 'sidepanel' });
    firstDisconnectListeners[0]?.();
    secondDisconnectListeners[0]?.();
  });
});
