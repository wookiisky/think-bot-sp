import { describe, expect, it, vi } from 'vitest';

import { createBrowserEntryService } from '../../../src/services/browser-entry/browser-entry';
import { createBrowserEntryPanelState } from '../../../src/services/browser-entry/browser-panel-state';

type Deferred<T> = {
  /** 待外部控制的 promise。 */
  promise: Promise<T>;
  /** 兑现 promise。 */
  resolve: (value: T) => void;
  /** 拒绝 promise。 */
  reject: (reason?: unknown) => void;
};

type BrowserEntryTestHarnessInput = {
  /** 初始已启用 side panel 的 browserTab。 */
  enabledTabIds?: number[];
  /** 启动时查询到的活动标签页。 */
  activeTab?: Pick<chrome.tabs.Tab, 'id' | 'url' | 'active'>;
  /** tabs.get 返回的标签页。 */
  getTab?: Pick<chrome.tabs.Tab, 'id' | 'url' | 'active'>;
  /** 自定义 setOptions mock。 */
  setOptions?: ReturnType<typeof vi.fn>;
  /** 自定义 sidePanel.open mock。 */
  open?: ReturnType<typeof vi.fn>;
  /** 自定义 setPanelBehavior mock。 */
  setPanelBehavior?: ReturnType<typeof vi.fn> | null;
  /** 是否提供 tabs.query 能力。 */
  hasTabsQuery?: boolean;
};

const createDeferred = <T>(): Deferred<T> => {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    resolve,
    reject,
  };
};

const createHarness = (input: BrowserEntryTestHarnessInput = {}) => {
  let enabledTabIds = input.enabledTabIds ?? [];
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  };
  const runtime = {
    getURL: vi.fn((route: string) => `chrome-extension://ext-id/${route}`),
  } as unknown as typeof chrome.runtime;
  const activeTab = input.activeTab ?? {
    id: 7,
    url: 'https://example.com/article',
    active: true,
  };
  const getTab = input.getTab ?? activeTab;
  const tabsQuery = vi.fn().mockResolvedValue([activeTab]);
  const tabs = {
    create: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(getTab),
    ...(input.hasTabsQuery === false ? {} : { query: tabsQuery }),
  } as unknown as typeof chrome.tabs & {
    create: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    query?: ReturnType<typeof vi.fn>;
  };
  const setOptions = input.setOptions ?? vi.fn().mockResolvedValue(undefined);
  const open = input.open ?? vi.fn().mockResolvedValue(undefined);
  const sidePanelBase = {
    setOptions,
    open,
  } as {
    setOptions: ReturnType<typeof vi.fn>;
    open: ReturnType<typeof vi.fn>;
    setPanelBehavior?: ReturnType<typeof vi.fn>;
  };
  if (input.setPanelBehavior !== null) {
    sidePanelBase.setPanelBehavior = input.setPanelBehavior ?? vi.fn().mockResolvedValue(undefined);
  }
  const sidePanel = sidePanelBase as unknown as typeof chrome.sidePanel & {
    setOptions: ReturnType<typeof vi.fn>;
    open: ReturnType<typeof vi.fn>;
    setPanelBehavior?: ReturnType<typeof vi.fn>;
  };
  const contextMenus = {
    removeAll: vi.fn(),
    create: vi.fn(),
  } as unknown as typeof chrome.contextMenus;
  const panelState = createBrowserEntryPanelState({
    get: vi.fn().mockImplementation(async () => ({ enabledTabIds })),
    set: vi.fn().mockImplementation(async (items: { enabledTabIds: number[] }) => {
      enabledTabIds = items.enabledTabIds;
    }),
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

  return {
    contextMenus,
    getEnabledTabIds: () => enabledTabIds,
    logger,
    panelState,
    runtime,
    service,
    sidePanel,
    tabs,
  };
};

describe('browser-entry service', () => {
  it('启动时当前活动页是普通网页，会预配置 side panel 并允许按钮直开', async () => {
    const { panelState, service, sidePanel, tabs } = createHarness({
      activeTab: {
        id: 7,
        url: 'https://example.com/article',
        active: true,
      },
    });

    await service.configureActionClickBehavior();

    expect(tabs.query).toHaveBeenCalledWith({
      active: true,
      lastFocusedWindow: true,
    });
    expect(sidePanel.setOptions).toHaveBeenCalledWith({
      tabId: 7,
      path: 'sidebar.html',
      enabled: true,
    });
    expect(sidePanel.setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: true,
    });
    await expect(panelState.getEnabledTabIds()).resolves.toEqual([7]);
  });

  it('启动时当前活动页是浏览器内部页，会禁用 side panel 并关闭按钮直开', async () => {
    const { panelState, service, sidePanel } = createHarness({
      activeTab: {
        id: 9,
        url: 'chrome://extensions',
        active: true,
      },
      enabledTabIds: [9],
    });

    await service.configureActionClickBehavior();

    expect(sidePanel.setOptions).toHaveBeenCalledWith({
      tabId: 9,
      enabled: false,
    });
    expect(sidePanel.setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: false,
    });
    expect(sidePanel.setPanelBehavior?.mock.invocationCallOrder[0]).toBeLessThan(sidePanel.setOptions.mock.invocationCallOrder[0]);
    await expect(panelState.getEnabledTabIds()).resolves.toEqual([]);
  });

  it('启动时拿不到当前活动页 URL，会按受限页保守禁用 side panel', async () => {
    const { panelState, service, sidePanel } = createHarness({
      activeTab: {
        id: 9,
        url: undefined,
        active: true,
      },
      enabledTabIds: [9],
    });

    await service.configureActionClickBehavior();

    expect(sidePanel.setOptions).toHaveBeenCalledWith({
      tabId: 9,
      enabled: false,
    });
    expect(sidePanel.setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: false,
    });
    await expect(panelState.getEnabledTabIds()).resolves.toEqual([]);
  });

  it('受限页同步禁用 tab 失败时仍会先关闭按钮直开', async () => {
    const { logger, panelState, service, sidePanel } = createHarness({
      activeTab: {
        id: 9,
        url: 'chrome://extensions',
        active: true,
      },
      enabledTabIds: [9],
      setOptions: vi.fn().mockRejectedValue(new Error('disable failed')),
    });

    await service.configureActionClickBehavior();

    expect(sidePanel.setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: false,
    });
    expect(sidePanel.setPanelBehavior?.mock.invocationCallOrder[0]).toBeLessThan(sidePanel.setOptions.mock.invocationCallOrder[0]);
    expect(logger.warn).toHaveBeenCalledWith('当前标签页侧边栏禁用失败', {
      browserTabId: 9,
      reason: 'disable failed',
    });
    await expect(panelState.getEnabledTabIds()).resolves.toEqual([9]);
  });

  it('无法查询活动页时保守关闭按钮直开', async () => {
    const { logger, service, sidePanel } = createHarness({
      hasTabsQuery: false,
    });

    await service.configureActionClickBehavior();

    expect(sidePanel.setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: false,
    });
    expect(logger.warn).toHaveBeenCalledWith('活动标签页查询能力不可用', {});
  });

  it('普通网页通过消息驱动入口时只配置当前 tab，不手动调用 sidePanel.open', async () => {
    const { service, sidePanel } = createHarness();

    await expect(
      service.handleActionClick({
        id: 7,
        url: 'https://example.com/article',
      }),
    ).resolves.toEqual({
      kind: 'sidepanel-opened',
      tabId: 7,
    });

    expect(sidePanel.setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: true,
    });
    expect(sidePanel.setOptions).toHaveBeenCalledWith({
      tabId: 7,
      path: 'sidebar.html',
      enabled: true,
    });
    expect(sidePanel.open).not.toHaveBeenCalled();
  });

  it('普通网页通过真实扩展按钮入口时会用用户手势兜底打开 side panel', async () => {
    const { service, sidePanel } = createHarness();

    await expect(
      service.handleBrowserActionClick({
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
    expect(sidePanel.setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: true,
    });
    expect(sidePanel.open).toHaveBeenCalledWith({
      tabId: 7,
    });
    expect(sidePanel.setOptions.mock.invocationCallOrder[0]).toBeLessThan(sidePanel.open.mock.invocationCallOrder[0]);
    expect(sidePanel.setPanelBehavior?.mock.invocationCallOrder[0]).toBeLessThan(sidePanel.open.mock.invocationCallOrder[0]);
  });

  it('真实扩展按钮兜底打开失败时会向调用方暴露错误', async () => {
    const { service, sidePanel } = createHarness({
      open: vi.fn().mockRejectedValue(new Error('open failed')),
    });

    await expect(
      service.handleBrowserActionClick({
        id: 7,
        url: 'https://example.com/article',
      }),
    ).rejects.toThrow('open failed');

    expect(sidePanel.setOptions).toHaveBeenCalledWith({
      tabId: 7,
      path: 'sidebar.html',
      enabled: true,
    });
    expect(sidePanel.setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: true,
    });
  });

  it('E2E 浏览器按钮驱动消息不伪造 sidePanel.open 用户手势', async () => {
    const { service, sidePanel } = createHarness();

    await expect(
      service.handleE2EBrowserActionClick({
        type: '__E2E_BROWSER_ACTION_CLICK__',
        tabId: 7,
        pageUrl: 'https://example.com/article',
      }),
    ).resolves.toEqual({
      kind: 'sidepanel-opened',
      tabId: 7,
    });

    expect(sidePanel.open).not.toHaveBeenCalled();
  });

  it('浏览器内部页点击扩展图标时退化到 conversations 页面并关闭按钮直开', async () => {
    const { service, sidePanel, tabs } = createHarness({
      enabledTabIds: [9],
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

    expect(sidePanel.setOptions).toHaveBeenCalledWith({
      tabId: 9,
      enabled: false,
    });
    expect(sidePanel.setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: false,
    });
    expect(sidePanel.setPanelBehavior?.mock.invocationCallOrder[0]).toBeLessThan(sidePanel.setOptions.mock.invocationCallOrder[0]);
    expect(sidePanel.open).not.toHaveBeenCalled();
    expect(tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://ext-id/conversations.html',
    });
  });

  it('conversations 页面点击扩展图标时会打开设置页并关闭按钮直开', async () => {
    const { service, sidePanel, tabs } = createHarness({
      enabledTabIds: [10],
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

    expect(sidePanel.setOptions).toHaveBeenCalledWith({
      tabId: 10,
      enabled: false,
    });
    expect(sidePanel.setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: false,
    });
    expect(sidePanel.open).not.toHaveBeenCalled();
    expect(tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://ext-id/options.html',
    });
  });

  it('setPanelBehavior 缺失时不会阻断受限页退化入口', async () => {
    const { logger, service, sidePanel, tabs } = createHarness({
      setPanelBehavior: null,
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

    expect(sidePanel.setOptions).toHaveBeenCalledWith({
      tabId: 9,
      enabled: false,
    });
    expect(tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://ext-id/conversations.html',
    });
    expect(logger.warn).toHaveBeenCalledWith('侧边栏按钮行为能力不可用', {});
  });

  it('切换到其他 browserTab 时会禁用旧 tab，并为当前 tab 预配置 side panel', async () => {
    const { panelState, service, sidePanel } = createHarness({
      enabledTabIds: [7],
      getTab: {
        id: 9,
        url: 'https://example.org/article',
        active: true,
      },
    });

    await service.handleTabActivated({ tabId: 9 });

    expect(sidePanel.setOptions).toHaveBeenNthCalledWith(1, {
      tabId: 7,
      enabled: false,
    });
    expect(sidePanel.setOptions).toHaveBeenNthCalledWith(2, {
      tabId: 9,
      path: 'sidebar.html',
      enabled: true,
    });
    expect(sidePanel.setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: true,
    });
    await expect(panelState.getEnabledTabIds()).resolves.toEqual([9]);
  });

  it('旧活动页同步慢于新同步时，不会把旧 tab 留在启用态', async () => {
    const enableOldTab = createDeferred<void>();
    const setOptions = vi.fn().mockImplementation((options: { tabId?: number; enabled?: boolean }) => {
      if (options.tabId === 7 && options.enabled === true) {
        return enableOldTab.promise;
      }
      return Promise.resolve();
    });
    const { panelState, service, sidePanel } = createHarness({
      setOptions,
    });

    const oldSync = service.handleTabUpdated(7, { status: 'complete' }, {
      id: 7,
      url: 'https://example.com/article',
      active: true,
    } as chrome.tabs.Tab);
    expect(sidePanel.setOptions).toHaveBeenCalledWith({
      tabId: 7,
      path: 'sidebar.html',
      enabled: true,
    });

    await service.handleTabUpdated(9, { status: 'complete' }, {
      id: 9,
      url: 'chrome://extensions',
      active: true,
    } as chrome.tabs.Tab);
    enableOldTab.resolve(undefined);
    await oldSync;

    expect(sidePanel.setOptions).toHaveBeenCalledWith({
      tabId: 9,
      enabled: false,
    });
    expect(sidePanel.setOptions).toHaveBeenCalledWith({
      tabId: 7,
      enabled: false,
    });
    expect(sidePanel.setPanelBehavior).toHaveBeenCalledTimes(1);
    expect(sidePanel.setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: false,
    });
    await expect(panelState.getEnabledTabIds()).resolves.toEqual([]);
  });

  it('service worker 重建后仍能清理旧 tab 的 side panel 启用态', async () => {
    let enabledTabIds = [7];
    const storage = {
      get: vi.fn().mockImplementation(async () => ({ enabledTabIds })),
      set: vi.fn().mockImplementation(async (items: { enabledTabIds: number[] }) => {
        enabledTabIds = items.enabledTabIds;
      }),
    };
    const firstPanelState = createBrowserEntryPanelState(storage);
    const firstHarness = createHarness({
      getTab: {
        id: 9,
        url: 'https://example.com/article',
        active: true,
      },
    });
    const firstService = createBrowserEntryService({
      logger: firstHarness.logger,
      runtime: firstHarness.runtime,
      tabs: firstHarness.tabs,
      sidePanel: firstHarness.sidePanel,
      contextMenus: firstHarness.contextMenus,
      panelState: firstPanelState,
      getUiLocale: () => 'zh-CN',
    });

    await firstService.handleActionClick({
      id: 9,
      url: 'https://example.com/article',
    });

    const secondPanelState = createBrowserEntryPanelState(storage);
    const secondService = createBrowserEntryService({
      logger: firstHarness.logger,
      runtime: firstHarness.runtime,
      tabs: firstHarness.tabs,
      sidePanel: firstHarness.sidePanel,
      contextMenus: firstHarness.contextMenus,
      panelState: secondPanelState,
      getUiLocale: () => 'zh-CN',
    });

    await secondService.handleTabActivated({ tabId: 9 });

    expect(firstHarness.sidePanel.setOptions).toHaveBeenNthCalledWith(1, {
      tabId: 9,
      path: 'sidebar.html',
      enabled: true,
    });
    expect(firstHarness.sidePanel.setOptions).toHaveBeenNthCalledWith(2, {
      tabId: 7,
      enabled: false,
    });
    expect(firstHarness.sidePanel.setOptions).toHaveBeenNthCalledWith(3, {
      tabId: 9,
      path: 'sidebar.html',
      enabled: true,
    });
    expect(await secondPanelState.getEnabledTabIds()).toEqual([9]);
  });

  it('并发消息驱动更新 side panel 运行态时不会丢失 tabId', async () => {
    const { getEnabledTabIds, service } = createHarness({
      setOptions: vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }),
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

    expect(getEnabledTabIds()).toEqual(expect.arrayContaining([7, 9]));
    expect(getEnabledTabIds()).toHaveLength(2);
  });

  it('禁用旧 tab 失败时会保留 panelState 并记录警告', async () => {
    const { logger, panelState, service } = createHarness({
      enabledTabIds: [7],
      getTab: {
        id: 9,
        url: 'https://example.com/article',
        active: true,
      },
      setOptions: vi.fn().mockImplementation(async ({ enabled }: { enabled: boolean }) => {
        if (enabled === false) {
          throw new Error('disable failed');
        }
        return undefined;
      }),
    });

    await expect(service.handleTabActivated({ tabId: 9 })).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith('panel.auto_hide_failed', {
      browserTabId: 7,
      reason: 'disable failed',
    });
    await expect(panelState.getEnabledTabIds()).resolves.toEqual([7, 9]);
  });
});
