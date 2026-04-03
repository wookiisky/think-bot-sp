import { describe, expect, it, vi } from 'vitest';

import { createBrowserEntryService } from '../../../src/services/browser-entry/browser-entry';

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
    const service = createBrowserEntryService({
      logger,
      runtime,
      tabs,
      sidePanel,
      contextMenus,
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
    const service = createBrowserEntryService({
      logger,
      runtime,
      tabs,
      sidePanel,
      contextMenus,
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
      path: 'sidepanel.html',
      enabled: true,
    });
    expect(sidePanel.open).not.toHaveBeenCalled();
  });

  it('受限页点击扩展图标时退化到 conversations 页面', async () => {
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
    const service = createBrowserEntryService({
      logger,
      runtime,
      tabs,
      sidePanel,
      contextMenus,
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
});
