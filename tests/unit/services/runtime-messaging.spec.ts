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
import { assertSidebarPageSender, isSidebarPageSender } from '../../../src/services/runtime-messaging/sender';
import { createFakeStorageArea } from '../../helpers/fake-storage';

describe('runtime-messaging', () => {
  it('阶段 4 扩展 sidebar 命令与流式事件契约', () => {
    expect(sidebarCommandTypeValues).toEqual([
      'GET_SIDEBAR_BOOTSTRAP',
      'CONFIRM_BLACKLIST_CONTINUE',
      'SWITCH_EXTRACTION_METHOD',
      'RE_EXTRACT_CONTENT',
      'SEND_CHAT',
      'STOP_SESSION',
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
        type: 'SEND_CHAT',
        tabId: 7,
        pageUrl: 'https://example.com/article',
        promptTabId: 'chat',
        modelId: 'model-1',
        text: '你好',
        images: [],
        includePageContent: true,
      }),
    ).toEqual(
      expect.objectContaining({
        type: 'SEND_CHAT',
        promptTabId: 'chat',
        modelId: 'model-1',
      }),
    );
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
    expect(isSidebarCommandMessage({ type: 'GET_SIDEBAR_BOOTSTRAP' })).toBe(true);
    expect(isSidebarCommandMessage({ type: 'CLEAR_PAGE_CONTEXT' })).toBe(false);
    expect(sidebarCommandTypes.has('CLEAR_PAGE_CONTEXT' as never)).toBe(false);
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
    const handler = createSidebarCommandHandler({
      runtime: { id: 'ext-id' },
      pageRepository,
      conversationRepository,
      blacklistRepository,
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
    const handler = createSidebarCommandHandler({
      runtime: { id: 'ext-id' },
      pageRepository: {
        getPage: vi.fn(),
      },
      conversationRepository: {
        listPageConversations: vi.fn(),
        listPageLoadingStates: vi.fn(),
      },
      blacklistRepository: {
        isBlocked: vi.fn(),
        getMatchedRuleId: vi.fn(),
      },
      chatDispatchService: {
        dispatchChat: vi.fn().mockResolvedValue({
          sessionId: 'session-1',
          messageId: 'assistant-1',
          cancel,
          done: new Promise(() => undefined),
        }),
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
        messageId: 'assistant-1',
      },
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
  });

  it('port bus 会按 promptTab 路由事件，并保留注册与断连广播', () => {
    const events: Array<{ type: string; portName: string }> = [];
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
