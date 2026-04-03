import { describe, expect, it, vi } from 'vitest';

import { createChromeLocalAdapter } from '../../../src/repositories/chrome-local-adapter';
import { createConversationRepository } from '../../../src/repositories/conversation-repository';
import {
  sidebarPortEventSchema,
  sidebarPortNameSchema,
  sidebarBootstrapCommandSchema,
  sidebarBootstrapResponseSchema,
  sidebarCommandSchema,
  sidebarCommandTypeSchema,
  sidebarCommandTypeValues,
} from '../../../src/services/runtime-messaging/sidebar-contract';
import { createPortBus } from '../../../src/services/runtime-messaging/port-bus';
import { createSidebarCommandHandler, isSidebarCommandMessage, sidebarCommandTypes } from '../../../src/services/runtime-messaging/sidebar-commands';
import { assertSidebarPageSender, isSidebarPageSender } from '../../../src/services/runtime-messaging/sender';
import { createFakeStorageArea } from '../../helpers/fake-storage';

describe('runtime-messaging', () => {
  it('sidebar contract 集中定义命令、响应和 port 名称 schema', () => {
    expect(sidebarCommandTypeValues).toEqual([
      'GET_SIDEBAR_BOOTSTRAP',
      'CONFIRM_BLACKLIST_CONTINUE',
      'SWITCH_EXTRACTION_METHOD',
      'RE_EXTRACT_CONTENT',
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
        type: 'GET_SIDEBAR_BOOTSTRAP',
        tabId: 7,
        pageUrl: 'https://example.com/article',
      }),
    ).toEqual({
      type: 'GET_SIDEBAR_BOOTSTRAP',
      tabId: 7,
      pageUrl: 'https://example.com/article',
    });
    expect(
      sidebarPortEventSchema.parse({
        type: 'PORT_REGISTERED',
        portName: 'sidepanel',
      }),
    ).toEqual({
      type: 'PORT_REGISTERED',
      portName: 'sidepanel',
    });
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
            url: 'chrome-extension://ext-id/sidepanel.html',
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

  it('bootstrap 会拒绝非 sidepanel.html 的 sender', async () => {
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
    ).rejects.toThrow(/sidepanel\.html/i);
  });

  it('sender 只接受 runtime.id 且来源是 sidepanel.html', () => {
    expect(
      isSidebarPageSender(
        {
          id: 'ext-id',
          url: 'chrome-extension://ext-id/sidepanel.html',
        },
        'ext-id',
      ),
    ).toBe(true);
    expect(
      isSidebarPageSender(
        {
          id: 'ext-id',
          url: 'chrome-extension://ext-id/sidepanel.html?tabId=7&pageUrl=https%3A%2F%2Fexample.com',
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
          url: 'chrome-extension://ext-id/sidepanel.html',
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
    ).toThrow(/sidepanel\.html/i);
  });

  it('port bus 会广播注册、断连和恢复事件', () => {
    const events: Array<{ type: string; portName: string }> = [];
    const bus = createPortBus();
    bus.subscribe((event) => {
      events.push(event);
    });

    const port = {
      name: 'sidepanel',
      postMessage: vi.fn(),
      disconnect: vi.fn(),
      onDisconnect: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    };

    bus.register(port as never);
    expect(events).toContainEqual({ type: 'PORT_REGISTERED', portName: 'sidepanel' });

    bus.disconnect('sidepanel');
    expect(port.disconnect).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual({ type: 'PORT_DISCONNECTED', portName: 'sidepanel' });

    bus.recover(port as never);
    expect(events).toContainEqual({ type: 'PORT_RECOVERED', portName: 'sidepanel' });
  });
});
