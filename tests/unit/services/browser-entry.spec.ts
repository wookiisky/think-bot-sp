import { describe, expect, it, vi } from 'vitest';

import { createBrowserEntryService } from '../../../src/services/browser-entry/browser-entry';
import { createBrowserEntryPanelState } from '../../../src/services/browser-entry/browser-panel-state';

describe('browser-entry service', () => {
  it('会配置扩展按钮点击后由浏览器原生打开 side panel', async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };
    const runtime = {
      getURL: vi.fn((route: string) => `chrome-extension://ext-id/${route}`),
    } as unknown as typeof chrome.runtime;
    const tabs = {
      create: vi.fn(),
    } as unknown as typeof chrome.tabs;
    const sidePanel = {
      setOptions: vi.fn(),
      open: vi.fn(),
      setPanelBehavior: vi.fn().mockResolvedValue(undefined),
    } as unknown as typeof chrome.sidePanel;
    const contextMenus = {
      removeAll: vi.fn(),
      create: vi.fn(),
    } as unknown as typeof chrome.contextMenus;
    const panelState = {
      getEnabledTabIds: vi.fn().mockResolvedValue([]),
      addEnabledTabId: vi.fn().mockResolvedValue(undefined),
      removeEnabledTabId: vi.fn().mockResolvedValue(undefined),
    };
    const service = createBrowserEntryService({
      logger,
      runtime,
      tabs,
      sidePanel,
      contextMenus,
      panelState,
      getUiLocale: () => 'zh-CN',
    });

    await service.configureActionClickBehavior();

    expect(sidePanel.setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: true,
    });
    expect(sidePanel.open).not.toHaveBeenCalled();
  });

  it('普通网页点击扩展图标时只配置当前 tab 的 side panel', async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };
    const runtime = {
      getURL: vi.fn((route: string) => `chrome-extension://ext-id/${route}`),
    } as unknown as typeof chrome.runtime;
    const tabs = {
      create: vi.fn(),
    } as unknown as typeof chrome.tabs;
    const sidePanel = {
      setOptions: vi.fn().mockResolvedValue(undefined),
      open: vi.fn(),
      setPanelBehavior: vi.fn(),
    } as unknown as typeof chrome.sidePanel;
    const contextMenus = {
      removeAll: vi.fn(),
      create: vi.fn(),
    } as unknown as typeof chrome.contextMenus;
    const panelState = {
      getEnabledTabIds: vi.fn().mockResolvedValue([]),
      addEnabledTabId: vi.fn().mockResolvedValue(undefined),
      removeEnabledTabId: vi.fn().mockResolvedValue(undefined),
    };
    const service = createBrowserEntryService({
      logger,
      runtime,
      tabs,
      sidePanel,
      contextMenus,
      panelState,
      getUiLocale: () => 'zh-CN',
    });

    await expect(
      service.handleActionClick({
        id: 7,
        url: 'https://example.com/article',
      }),
    ).resolves.toEqual({
      kind: 'sidepanel-opened',
      tabId: 7,
    });

    expect(sidePanel.setOptions).toHaveBeenCalledWith({
      tabId: 7,
      path: 'sidebar.html',
      enabled: true,
    });
    expect(sidePanel.open).not.toHaveBeenCalled();
  });

  it('浏览器内部页点击扩展图标时退化到 conversations 页面', async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };
    const runtime = {
      getURL: vi.fn((route: string) => `chrome-extension://ext-id/${route}`),
    } as unknown as typeof chrome.runtime;
    const tabs = {
      create: vi.fn().mockResolvedValue(undefined),
    } as unknown as typeof chrome.tabs;
    const sidePanel = {
      setOptions: vi.fn(),
      open: vi.fn(),
      setPanelBehavior: vi.fn(),
    } as unknown as typeof chrome.sidePanel;
    const contextMenus = {
      removeAll: vi.fn(),
      create: vi.fn(),
    } as unknown as typeof chrome.contextMenus;
    const panelState = {
      getEnabledTabIds: vi.fn().mockResolvedValue([]),
      addEnabledTabId: vi.fn().mockResolvedValue(undefined),
      removeEnabledTabId: vi.fn().mockResolvedValue(undefined),
    };
    const service = createBrowserEntryService({
      logger,
      runtime,
      tabs,
      sidePanel,
      contextMenus,
      panelState,
      getUiLocale: () => 'zh-CN',
    });

    await expect(
      service.handleActionClick({
        id: 9,
        url: 'chrome://extensions',
      }),
    ).resolves.toEqual({
      kind: 'conversations-opened',
      url: 'chrome-extension://ext-id/conversations.html',
    });

    expect(sidePanel.setOptions).not.toHaveBeenCalled();
    expect(sidePanel.open).not.toHaveBeenCalled();
    expect(tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://ext-id/conversations.html',
    });
  });

  it('conversations 页面点击扩展图标时会打开设置页', async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };
    const runtime = {
      getURL: vi.fn((route: string) => `chrome-extension://ext-id/${route}`),
    } as unknown as typeof chrome.runtime;
    const tabs = {
      create: vi.fn().mockResolvedValue(undefined),
    } as unknown as typeof chrome.tabs;
    const sidePanel = {
      setOptions: vi.fn(),
      open: vi.fn(),
      setPanelBehavior: vi.fn(),
    } as unknown as typeof chrome.sidePanel;
    const contextMenus = {
      removeAll: vi.fn(),
      create: vi.fn(),
    } as unknown as typeof chrome.contextMenus;
    const panelState = {
      getEnabledTabIds: vi.fn().mockResolvedValue([]),
      addEnabledTabId: vi.fn().mockResolvedValue(undefined),
      removeEnabledTabId: vi.fn().mockResolvedValue(undefined),
    };
    const service = createBrowserEntryService({
      logger,
      runtime,
      tabs,
      sidePanel,
      contextMenus,
      panelState,
      getUiLocale: () => 'zh-CN',
    });

    await expect(
      service.handleActionClick({
        id: 10,
        url: 'chrome-extension://ext-id/conversations.html',
      }),
    ).resolves.toEqual({
      kind: 'options-opened',
      url: 'chrome-extension://ext-id/options.html',
    });

    expect(sidePanel.setOptions).not.toHaveBeenCalled();
    expect(sidePanel.open).not.toHaveBeenCalled();
    expect(tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://ext-id/options.html',
    });
  });

  it('切换到其他 browserTab 时会禁用旧 tab，并为当前 tab 预配置 side panel', async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };
    const runtime = {
      getURL: vi.fn((route: string) => `chrome-extension://ext-id/${route}`),
    } as unknown as typeof chrome.runtime;
    const tabs = {
      create: vi.fn(),
      get: vi.fn().mockResolvedValue({
        id: 9,
        url: 'https://example.org/article',
      }),
    } as unknown as typeof chrome.tabs;
    const setOptions = vi.fn().mockResolvedValue(undefined);
    const sidePanel = {
      setOptions,
      open: vi.fn(),
      setPanelBehavior: vi.fn(),
    } as unknown as typeof chrome.sidePanel;
    const contextMenus = {
      removeAll: vi.fn(),
      create: vi.fn(),
    } as unknown as typeof chrome.contextMenus;
    let enabledTabIds = [7];
    const panelState = createBrowserEntryPanelState({
      get: vi.fn().mockImplementation(async () => ({ enabledTabIds })),
      set: vi.fn().mockImplementation(async (items: { enabledTabIds: number[] }) => {
        enabledTabIds = items.enabledTabIds;
      }),
      remove: vi.fn().mockResolvedValue(undefined),
    });
    const service = createBrowserEntryService({
      logger,
      runtime,
      tabs,
      sidePanel,
      contextMenus,
      panelState,
      getUiLocale: () => 'zh-CN',
    });

    await service.handleTabActivated({ tabId: 9 });

    expect(setOptions).toHaveBeenNthCalledWith(1, {
      tabId: 7,
      enabled: false,
    });
    expect(setOptions).toHaveBeenNthCalledWith(2, {
      tabId: 9,
      path: 'sidebar.html',
      enabled: true,
    });
    await expect(panelState.getEnabledTabIds()).resolves.toEqual([9]);
  });

  it('service worker 重建后仍能清理旧 tab 的 side panel 启用态', async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };
    const runtime = {
      getURL: vi.fn((route: string) => `chrome-extension://ext-id/${route}`),
    } as unknown as typeof chrome.runtime;
    const tabs = {
      create: vi.fn(),
      get: vi.fn().mockResolvedValue({
        id: 9,
        url: 'https://example.com/article',
      }),
    } as unknown as typeof chrome.tabs;
    const sidePanel = {
      setOptions: vi.fn().mockResolvedValue(undefined),
      open: vi.fn(),
      setPanelBehavior: vi.fn(),
    } as unknown as typeof chrome.sidePanel;
    const contextMenus = {
      removeAll: vi.fn(),
      create: vi.fn(),
    } as unknown as typeof chrome.contextMenus;
    let enabledTabIds = [7];
    const storage = {
      get: vi.fn().mockImplementation(async () => ({ enabledTabIds })),
      set: vi.fn().mockImplementation(async (items: { enabledTabIds: number[] }) => {
        enabledTabIds = items.enabledTabIds;
      }),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    const firstPanelState = createBrowserEntryPanelState(storage);
    const firstService = createBrowserEntryService({
      logger,
      runtime,
      tabs,
      sidePanel,
      contextMenus,
      panelState: firstPanelState,
      getUiLocale: () => 'zh-CN',
    });

    await firstService.handleActionClick({
      id: 9,
      url: 'https://example.com/article',
    });

    const secondPanelState = createBrowserEntryPanelState(storage);
    const secondService = createBrowserEntryService({
      logger,
      runtime,
      tabs,
      sidePanel,
      contextMenus,
      panelState: secondPanelState,
      getUiLocale: () => 'zh-CN',
    });

    await secondService.handleTabActivated({ tabId: 9 });

    expect(sidePanel.setOptions).toHaveBeenNthCalledWith(1, {
      tabId: 9,
      path: 'sidebar.html',
      enabled: true,
    });
    expect(sidePanel.setOptions).toHaveBeenNthCalledWith(2, {
      tabId: 7,
      enabled: false,
    });
    expect(sidePanel.setOptions).toHaveBeenNthCalledWith(3, {
      tabId: 9,
      path: 'sidebar.html',
      enabled: true,
    });
    expect(await secondPanelState.getEnabledTabIds()).toEqual([9]);
  });

  it('并发更新 side panel 运行态时不会丢失 tabId', async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };
    const runtime = {
      getURL: vi.fn((route: string) => `chrome-extension://ext-id/${route}`),
    } as unknown as typeof chrome.runtime;
    const tabs = {
      create: vi.fn(),
    } as unknown as typeof chrome.tabs;
    const sidePanel = {
      setOptions: vi.fn().mockResolvedValue(undefined),
      open: vi.fn(),
      setPanelBehavior: vi.fn(),
    } as unknown as typeof chrome.sidePanel;
    const contextMenus = {
      removeAll: vi.fn(),
      create: vi.fn(),
    } as unknown as typeof chrome.contextMenus;
    let enabledTabIds: number[] = [];
    const panelState = createBrowserEntryPanelState({
      get: vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return { enabledTabIds };
      }),
      set: vi.fn().mockImplementation(async (items: { enabledTabIds: number[] }) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        enabledTabIds = items.enabledTabIds;
      }),
      remove: vi.fn().mockResolvedValue(undefined),
    });
    const service = createBrowserEntryService({
      logger,
      runtime,
      tabs,
      sidePanel,
      contextMenus,
      panelState,
      getUiLocale: () => 'zh-CN',
    });

    await Promise.all([
      service.handleActionClick({
        id: 7,
        url: 'https://example.com/one',
      }),
      service.handleActionClick({
        id: 9,
        url: 'https://example.com/two',
      }),
    ]);

    expect(enabledTabIds).toEqual(expect.arrayContaining([7, 9]));
    expect(enabledTabIds).toHaveLength(2);
  });

  it('禁用旧 tab 失败时会保留 panelState 并记录警告', async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };
    const runtime = {
      getURL: vi.fn((route: string) => `chrome-extension://ext-id/${route}`),
    } as unknown as typeof chrome.runtime;
    const tabs = {
      create: vi.fn(),
    } as unknown as typeof chrome.tabs;
    const sidePanel = {
      setOptions: vi.fn().mockImplementation(async ({ enabled }: { enabled: boolean }) => {
        if (enabled === false) {
          throw new Error('disable failed');
        }
        return undefined;
      }),
      open: vi.fn(),
      setPanelBehavior: vi.fn(),
    } as unknown as typeof chrome.sidePanel;
    let enabledTabIds = [7];
    const panelState = createBrowserEntryPanelState({
      get: vi.fn().mockImplementation(async () => ({ enabledTabIds })),
      set: vi.fn().mockImplementation(async (items: { enabledTabIds: number[] }) => {
        enabledTabIds = items.enabledTabIds;
      }),
      remove: vi.fn().mockResolvedValue(undefined),
    });
    const contextMenus = {
      removeAll: vi.fn(),
      create: vi.fn(),
    } as unknown as typeof chrome.contextMenus;
    const service = createBrowserEntryService({
      logger,
      runtime,
      tabs,
      sidePanel,
      contextMenus,
      panelState,
      getUiLocale: () => 'zh-CN',
    });

    await expect(service.handleTabActivated({ tabId: 9 })).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith('panel.auto_hide_failed', {
      browserTabId: 7,
      reason: 'disable failed',
    });
    await expect(panelState.getEnabledTabIds()).resolves.toEqual([7]);
  });
});
