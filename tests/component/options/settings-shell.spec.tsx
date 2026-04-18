import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultConfig } from '../../../src/domain/config/config-schema';
import { SettingsShell } from '../../../src/features/settings/settings-shell';

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  getRecentError: vi.fn(),
  saveConfig: vi.fn(),
  resetConfig: vi.fn(),
  getLocalCacheStats: vi.fn(),
  clearLocalCache: vi.fn(),
  exportConfig: vi.fn(),
  importConfig: vi.fn(),
  testSyncConnection: vi.fn(),
  testModel: vi.fn(),
  syncNow: vi.fn(),
}));

vi.mock('../../../src/features/settings/settings-api', () => ({
  settingsApi: {
    getConfig: mocks.getConfig,
    getRecentError: mocks.getRecentError,
    saveConfig: mocks.saveConfig,
    resetConfig: mocks.resetConfig,
    getLocalCacheStats: mocks.getLocalCacheStats,
    clearLocalCache: mocks.clearLocalCache,
    exportConfig: mocks.exportConfig,
    importConfig: mocks.importConfig,
    testSyncConnection: mocks.testSyncConnection,
    testModel: mocks.testModel,
    syncNow: mocks.syncNow,
  },
}));

mocks.getRecentError.mockResolvedValue(null);

describe('SettingsShell', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mocks.getConfig.mockReset();
    mocks.getRecentError.mockReset();
    mocks.saveConfig.mockReset();
    mocks.resetConfig.mockReset();
    mocks.getLocalCacheStats.mockReset();
    mocks.clearLocalCache.mockReset();
    mocks.exportConfig.mockReset();
    mocks.importConfig.mockReset();
    mocks.testSyncConnection.mockReset();
    mocks.testModel.mockReset();
    mocks.syncNow.mockReset();
    mocks.getRecentError.mockResolvedValue(null);
  });

  /** 打开 shadcn Select 并选择目标选项。 */
  const selectOption = async (label: string, optionText: string) => {
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: label }));
    const listbox = await screen.findByRole('listbox');
    await user.click(within(listbox).getByText(optionText));
  };

  it('加载配置并展示缓存统计', async () => {
    mocks.getConfig.mockResolvedValueOnce(createDefaultConfig());
    mocks.getRecentError.mockResolvedValueOnce(null);
    mocks.getLocalCacheStats.mockResolvedValueOnce({ pageCount: 3, entryCount: 3, bytes: 128 });

    render(<SettingsShell />);

    expect(await screen.findByRole('heading', { name: '设置' })).toBeInTheDocument();
    expect(screen.getByTestId('cache-page-count')).toHaveTextContent('3 个页面');
    expect(screen.getByTestId('cache-bytes')).toHaveTextContent('128 B');
    expect(mocks.getConfig).toHaveBeenCalledTimes(1);
    expect(mocks.getLocalCacheStats).toHaveBeenCalledTimes(1);
  });

  it('读取最近一次错误但不在主内容区展示最近一次错误卡片', async () => {
    mocks.getConfig.mockResolvedValueOnce(createDefaultConfig());
    mocks.getRecentError.mockResolvedValueOnce({
      source: 'sync',
      operation: 'SYNC_NOW',
      message: '同步失败',
      capturedAt: new Date('2026-04-05T00:00:00.000Z').getTime(),
    });
    mocks.getLocalCacheStats.mockResolvedValueOnce({ pageCount: 0, entryCount: 0, bytes: 0 });

    render(<SettingsShell />);

    expect(await screen.findByRole('heading', { name: '设置' })).toBeInTheDocument();
    expect(screen.queryByText('最近一次错误')).not.toBeInTheDocument();
    expect(screen.queryByText('同步失败')).not.toBeInTheDocument();
  });

  it('加载配置后渲染设置页顶部动作区与导航 chips', async () => {
    mocks.getConfig.mockResolvedValueOnce(createDefaultConfig());
    mocks.getRecentError.mockResolvedValueOnce(null);
    mocks.getLocalCacheStats.mockResolvedValueOnce({ pageCount: 3, entryCount: 3, bytes: 128 });

    render(<SettingsShell />);

    expect(await screen.findByRole('heading', { name: '设置' })).toBeInTheDocument();
    expect(screen.getByTestId('settings-shell-actions')).toBeInTheDocument();
    expect(screen.getByTestId('settings-shell-nav')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存并同步' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导入配置' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导出配置' })).toBeInTheDocument();
  });

  it('展示配置分栏支持切换并保留未保存草稿', async () => {
    mocks.getConfig.mockResolvedValueOnce(createDefaultConfig());
    mocks.getRecentError.mockResolvedValueOnce(null);
    mocks.getLocalCacheStats.mockResolvedValueOnce({ pageCount: 0, entryCount: 0, bytes: 0 });

    render(<SettingsShell />);

    await screen.findByRole('heading', { name: '设置' });
    fireEvent.click(screen.getByRole('tab', { name: '展示配置' }));
    fireEvent.change(screen.getByLabelText('一级标题字号'), {
      target: {
        value: '30',
      },
    });

    fireEvent.click(screen.getByRole('tab', { name: '基础设置' }));
    fireEvent.click(screen.getByRole('tab', { name: '展示配置' }));

    expect(screen.getByLabelText('一级标题字号')).toHaveValue(30);
  });

  it('展示配置预设会写入助手消息 Markdown 样式', async () => {
    const config = createDefaultConfig();
    mocks.getConfig.mockResolvedValueOnce(config);
    mocks.getRecentError.mockResolvedValueOnce(null);
    mocks.getLocalCacheStats.mockResolvedValueOnce({ pageCount: 0, entryCount: 0, bytes: 0 });
    mocks.saveConfig.mockResolvedValueOnce({
      ...config,
      display: {
        assistantMarkdown: {
          h1: { fontSizePx: 18, color: '#1d4ed8', underline: false },
          h2: { fontSizePx: 18, color: '#2563eb', underline: false },
          h3: { fontSizePx: 16, color: '#3b82f6', underline: false },
          h4: { fontSizePx: 14, color: '#60a5fa', underline: false },
          body: { fontSizePx: 14, color: '#111827', underline: false },
        },
      },
    });

    render(<SettingsShell />);

    await screen.findByRole('heading', { name: '设置' });
    fireEvent.click(screen.getByRole('tab', { name: '展示配置' }));
    fireEvent.click(screen.getByRole('button', { name: '默认配置 1' }));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(mocks.saveConfig).toHaveBeenCalledTimes(1);
    });
    expect(mocks.saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        display: expect.objectContaining({
          assistantMarkdown: expect.objectContaining({
            h1: expect.objectContaining({
              fontSizePx: 18,
              color: '#1d4ed8',
            }),
            body: expect.objectContaining({
              fontSizePx: 14,
              color: '#111827',
            }),
          }),
        }),
      }),
    );
  });

  it('设置页使用完整 tab 页面布局而不是弹窗式卡片壳层', async () => {
    mocks.getConfig.mockResolvedValueOnce(createDefaultConfig());
    mocks.getRecentError.mockResolvedValueOnce(null);
    mocks.getLocalCacheStats.mockResolvedValueOnce({ pageCount: 3, entryCount: 3, bytes: 128 });

    render(<SettingsShell />);

    const shell = await screen.findByTestId('settings-shell');
    expect(shell).toHaveAttribute('data-layout', 'tab-page');
    expect(screen.queryByTestId('settings-shell-frame')).not.toBeInTheDocument();
  });

  it('切换语言后即时预览标题变化', async () => {
    mocks.getConfig.mockResolvedValueOnce(createDefaultConfig());
    mocks.getRecentError.mockResolvedValueOnce(null);
    mocks.getLocalCacheStats.mockResolvedValueOnce({ pageCount: 0, entryCount: 0, bytes: 0 });

    render(<SettingsShell />);

    await screen.findByRole('combobox', { name: '语言' });
    await selectOption('语言', 'English');

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  });

  it('切换主题后立即更新设置页预览并保留当前选择', async () => {
    mocks.getConfig.mockResolvedValueOnce(createDefaultConfig());
    mocks.getRecentError.mockResolvedValueOnce(null);
    mocks.getLocalCacheStats.mockResolvedValueOnce({ pageCount: 0, entryCount: 0, bytes: 0 });

    render(<SettingsShell />);

    await screen.findByRole('heading', { name: '设置' });
    await selectOption('主题', 'Dark');

    const shell = screen.getByTestId('settings-shell');
    expect(shell).toHaveAttribute('data-theme', 'dark');
    expect(screen.getByRole('combobox', { name: '主题' })).toHaveTextContent('Dark');
  });

  it('主题切换后保留 data-theme 并更新根节点主题 class', async () => {
    mocks.getConfig.mockResolvedValueOnce(createDefaultConfig());
    mocks.getRecentError.mockResolvedValueOnce(null);
    mocks.getLocalCacheStats.mockResolvedValueOnce({ pageCount: 0, entryCount: 0, bytes: 0 });

    render(<SettingsShell />);

    await screen.findByRole('heading', { name: '设置' });
    await selectOption('主题', 'Dark');

    const shell = screen.getByTestId('settings-shell');
    expect(shell).toHaveAttribute('data-theme', 'dark');
    expect(shell).toHaveClass('dark');
  });

  it('触发保存时提交当前配置', async () => {
    const config = createDefaultConfig();
    mocks.getConfig.mockResolvedValueOnce(config);
    mocks.getRecentError.mockResolvedValueOnce(null);
    mocks.getLocalCacheStats.mockResolvedValueOnce({ pageCount: 1, entryCount: 1, bytes: 16 });
    mocks.saveConfig.mockResolvedValueOnce(config);

    render(<SettingsShell />);

    await screen.findByRole('heading', { name: '设置' });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(mocks.saveConfig).toHaveBeenCalledTimes(1);
    });
    expect(mocks.saveConfig).toHaveBeenCalledWith(config);
  });

  it('保存前会清理失效并行模型引用', async () => {
    const config = createDefaultConfig({
      basic: {
        ...createDefaultConfig().basic,
        parallelModelIds: ['model-1', 'missing-branch-model'],
      },
      models: [
        {
          id: 'model-1',
          name: '主模型',
          provider: 'openai-compatible',
          enabled: true,
          model: 'gpt-4o-mini',
          baseUrl: 'https://api.example.com',
          apiKey: 'secret',
          deployment: '',
          temperature: 0.2,
          tools: [],
          thinkingBudget: null,
          maxOutputTokens: null,
          supportsImages: false,
          order: 0,
          deletedAt: null,
        },
      ],
      quickInputs: [
        {
          id: 'quick-1',
          name: '总结',
          prompt: '请总结当前页面',
          autoTrigger: false,
          modelId: null,
          parallelModelIds: ['missing-branch-model', 'model-1'],
          order: 0,
          deletedAt: null,
        },
      ],
    });
    mocks.getConfig.mockResolvedValueOnce(config);
    mocks.getRecentError.mockResolvedValueOnce(null);
    mocks.getLocalCacheStats.mockResolvedValueOnce({ pageCount: 1, entryCount: 1, bytes: 16 });
    mocks.saveConfig.mockResolvedValueOnce(
      createDefaultConfig({
        ...config,
        basic: {
          ...config.basic,
          parallelModelIds: ['model-1'],
        },
        quickInputs: [
          {
            ...config.quickInputs[0],
            parallelModelIds: ['model-1'],
          },
        ],
      }),
    );

    render(<SettingsShell />);

    await screen.findByRole('heading', { name: '设置' });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(mocks.saveConfig).toHaveBeenCalledTimes(1);
    });
    expect(mocks.saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        basic: expect.objectContaining({
          parallelModelIds: ['model-1'],
        }),
        quickInputs: [
          expect.objectContaining({
            id: 'quick-1',
            parallelModelIds: ['model-1'],
          }),
        ],
      }),
    );
  });

  it('保存期间禁用基础设置可见控件和顶部动作', async () => {
    const config = createDefaultConfig({
      models: [
        {
          id: 'model-1',
          name: '主模型',
          provider: 'openai-compatible',
          enabled: true,
          model: 'gpt-4o-mini',
          baseUrl: 'https://api.example.com',
          apiKey: 'secret',
          deployment: '',
          temperature: 0.2,
          tools: [],
          thinkingBudget: null,
          maxOutputTokens: null,
          supportsImages: false,
          order: 0,
          deletedAt: null,
        },
        {
          id: 'model-2',
          name: '备用模型',
          provider: 'openai-compatible',
          enabled: true,
          model: 'gpt-4o-mini',
          baseUrl: 'https://api.example.com',
          apiKey: 'secret',
          deployment: '',
          temperature: 0.2,
          tools: [],
          thinkingBudget: null,
          maxOutputTokens: null,
          supportsImages: false,
          order: 1,
          deletedAt: null,
        },
      ],
      basic: {
        ...createDefaultConfig().basic,
        defaultModelId: 'model-1',
      },
    });
    mocks.getConfig.mockResolvedValueOnce(config);
    mocks.getLocalCacheStats.mockResolvedValueOnce({ entryCount: 1, bytes: 16 });
    mocks.saveConfig.mockReturnValueOnce(new Promise(() => {}));

    render(<SettingsShell />);

    await screen.findByRole('heading', { name: '设置' });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '保存并同步' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: '语言' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: '主题' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: '默认模型' })).toBeDisabled();
    expect(screen.getByLabelText('System Prompt')).toBeDisabled();
    expect(screen.getByRole('button', { name: '导入配置' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '导出配置' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '清理本地缓存' })).toBeDisabled();
  });

  it('保存失败后在主视图中显示错误提示', async () => {
    const config = createDefaultConfig();
    mocks.getConfig.mockResolvedValueOnce(config);
    mocks.getLocalCacheStats.mockResolvedValueOnce({ entryCount: 1, bytes: 16 });
    mocks.saveConfig.mockRejectedValueOnce(new Error('保存失败'));

    render(<SettingsShell />);

    await screen.findByRole('heading', { name: '设置' });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('保存失败');
    expect(screen.getByRole('heading', { name: '设置' })).toBeInTheDocument();
    expect(screen.queryByText('最近一次错误')).not.toBeInTheDocument();
  });

  it('快捷输入预览会过滤软删除项并按顺序展示', async () => {
    const config = createDefaultConfig({
      quickInputs: [
        {
          id: 'quick-1',
          name: '总结',
          prompt: '请总结当前页面',
          autoTrigger: false,
          modelId: null,
          order: 2,
          deletedAt: null,
        },
        {
          id: 'quick-2',
          name: '删除项',
          prompt: '不应显示',
          autoTrigger: false,
          modelId: null,
          order: 1,
          deletedAt: Date.now(),
        },
        {
          id: 'quick-3',
          name: '翻译',
          prompt: '请翻译当前页面',
          autoTrigger: false,
          modelId: null,
          order: 1,
          deletedAt: null,
        },
      ],
    });
    mocks.getConfig.mockResolvedValueOnce(config);
    mocks.getLocalCacheStats.mockResolvedValueOnce({ entryCount: 1, bytes: 16 });

    render(<SettingsShell />);

    await screen.findByRole('heading', { name: '设置' });
    fireEvent.click(screen.getByRole('tab', { name: '快捷输入' }));

    expect(screen.queryByText('删除项')).not.toBeInTheDocument();
    expect(screen.getByText('翻译')).toBeInTheDocument();
    expect(screen.getByText('总结')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('翻译');
    expect(screen.getAllByRole('listitem')[1]).toHaveTextContent('总结');
  });

  it('默认模型不完整时阻止保存', async () => {
    const config = createDefaultConfig({
      basic: {
        ...createDefaultConfig().basic,
        defaultModelId: 'model-1',
      },
      models: [
        {
          id: 'model-1',
          name: '不完整模型',
          provider: 'openai-compatible',
          enabled: false,
          model: 'gpt-4o-mini',
          baseUrl: 'https://api.example.com',
          apiKey: 'secret',
          deployment: '',
          temperature: 0.2,
          tools: [],
          thinkingBudget: null,
          maxOutputTokens: null,
          supportsImages: false,
          order: 0,
          deletedAt: null,
        },
      ],
    });
    mocks.getConfig.mockResolvedValueOnce(config);
    mocks.getLocalCacheStats.mockResolvedValueOnce({ entryCount: 1, bytes: 16 });

    render(<SettingsShell />);

    await screen.findByRole('heading', { name: '设置' });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('默认模型配置不完整');
    expect(mocks.saveConfig).not.toHaveBeenCalled();
  });

  it('导出按钮会把配置下载到本地文件', async () => {
    const config = createDefaultConfig();
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(document.body, 'removeChild');
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const createObjectURL = vi.fn(() => 'blob:settings-export');
    const revokeObjectURL = vi.fn();

    Object.defineProperty(window.URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(window.URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });

    mocks.getConfig.mockResolvedValueOnce(config);
    mocks.getLocalCacheStats.mockResolvedValueOnce({ entryCount: 1, bytes: 16 });
    mocks.exportConfig.mockResolvedValueOnce('{"version":1}');

    render(<SettingsShell />);

    await screen.findByRole('heading', { name: '设置' });
    fireEvent.click(screen.getByRole('button', { name: '导出配置' }));

    await waitFor(() => {
      expect(mocks.exportConfig).toHaveBeenCalledTimes(1);
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    const downloadLink = appendSpy.mock.calls
      .map(([node]) => node)
      .find((node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement);

    expect(downloadLink).toBeDefined();
    expect(downloadLink?.download).toMatch(/^think-bot-sp-config-\d{4}-\d{2}-\d{2}\.json$/);
    expect(downloadLink?.href).toBe('blob:settings-export');
    expect(removeSpy).toHaveBeenCalledWith(downloadLink);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:settings-export');
  });

  it('导出失败后显示导出错误文案', async () => {
    const config = createDefaultConfig();
    mocks.getConfig.mockResolvedValueOnce(config);
    mocks.getLocalCacheStats.mockResolvedValueOnce({ entryCount: 1, bytes: 16 });
    mocks.exportConfig.mockRejectedValueOnce(new Error('导出失败'));

    render(<SettingsShell />);

    await screen.findByRole('heading', { name: '设置' });
    fireEvent.click(screen.getByRole('button', { name: '导出配置' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('导出失败');
  });

  it('导入失败后显示导入错误文案并保留当前页面状态', async () => {
    const config = createDefaultConfig({
      basic: {
        ...createDefaultConfig().basic,
        systemPrompt: '保留当前草稿',
      },
    });
    mocks.getConfig.mockResolvedValueOnce(config);
    mocks.getLocalCacheStats.mockResolvedValueOnce({ entryCount: 1, bytes: 16 });
    mocks.importConfig.mockRejectedValueOnce(new Error('导入失败'));

    render(<SettingsShell />);

    await screen.findByRole('heading', { name: '设置' });
    const file = new File(['{"version":"0.0.0"}'], 'config.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('导入配置'), {
      target: {
        files: [file],
      },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('导入失败');
    expect(screen.getByLabelText('System Prompt')).toHaveValue('保留当前草稿');
  });

  it('导入文件成功后刷新设置页状态', async () => {
    const importedConfig = createDefaultConfig({
      basic: {
        ...createDefaultConfig().basic,
        systemPrompt: '导入后的 system prompt',
      },
    });
    mocks.getConfig.mockResolvedValueOnce(createDefaultConfig());
    mocks.getLocalCacheStats.mockResolvedValue({ entryCount: 1, bytes: 16 });
    mocks.importConfig.mockResolvedValueOnce(importedConfig);

    render(<SettingsShell />);

    await screen.findByRole('heading', { name: '设置' });
    const file = new File([JSON.stringify(importedConfig)], 'config.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('导入配置'), {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(mocks.importConfig).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByLabelText('System Prompt')).toHaveValue('导入后的 system prompt');
  });

  it('切换模型后 API Key 立即恢复掩码', async () => {
    const config = createDefaultConfig({
      basic: {
        ...createDefaultConfig().basic,
        defaultModelId: 'model-1',
      },
      models: [
        {
          id: 'model-1',
          name: '模型一',
          provider: 'openai-compatible',
          enabled: true,
          model: 'gpt-4o-mini',
          baseUrl: 'https://api.example.com',
          apiKey: 'secret-1',
          deployment: '',
          temperature: 0.2,
          tools: [],
          thinkingBudget: null,
          maxOutputTokens: null,
          supportsImages: false,
          order: 0,
          deletedAt: null,
        },
        {
          id: 'model-2',
          name: '模型二',
          provider: 'openai-compatible',
          enabled: true,
          model: 'gpt-4o-mini',
          baseUrl: 'https://api.example.com',
          apiKey: 'secret-2',
          deployment: '',
          temperature: 0.2,
          tools: [],
          thinkingBudget: null,
          maxOutputTokens: null,
          supportsImages: false,
          order: 1,
          deletedAt: null,
        },
      ],
    });
    mocks.getConfig.mockResolvedValueOnce(config);
    mocks.getLocalCacheStats.mockResolvedValueOnce({ entryCount: 1, bytes: 16 });

    render(<SettingsShell />);

    await screen.findByRole('heading', { name: '设置' });
    fireEvent.click(screen.getByRole('tab', { name: '语言模型' }));
    fireEvent.click(screen.getByTestId('language-model-summary-model-1'));
    fireEvent.click(screen.getByRole('button', { name: '显示' }));
    expect(screen.getByLabelText('API Key')).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByText('模型二').closest('button') as HTMLButtonElement);

    expect(screen.getByLabelText('API Key')).toHaveAttribute('type', 'password');
  });

  it('测试模型成功后通过 toast 展示返回文本', async () => {
    const config = createDefaultConfig({
      models: [
        {
          id: 'model-1',
          name: '模型一',
          provider: 'openai-compatible',
          enabled: true,
          model: 'gpt-4.1-mini',
          baseUrl: 'https://api.example.com',
          apiKey: 'secret',
          deployment: '',
          temperature: 1,
          tools: [],
          reasoningEffort: 'high',
          thinkingBudget: null,
          maxOutputTokens: null,
          supportsImages: false,
          order: 0,
          deletedAt: null,
        },
      ],
    });
    mocks.getConfig.mockResolvedValueOnce(config);
    mocks.getLocalCacheStats.mockResolvedValueOnce({ entryCount: 1, bytes: 16 });
    mocks.testModel.mockResolvedValueOnce({ provider: 'openai-compatible', text: 'hello' });

    render(<SettingsShell />);

    await screen.findByRole('heading', { name: '设置' });
    fireEvent.click(screen.getByRole('tab', { name: '语言模型' }));
    fireEvent.click(screen.getByTestId('language-model-summary-model-1'));
    fireEvent.click(screen.getByRole('button', { name: '测试模型' }));

    await waitFor(() => {
      expect(mocks.testModel).toHaveBeenCalledWith(expect.objectContaining({ id: 'model-1' }));
    });
    expect(await screen.findByText('模型测试成功')).toBeInTheDocument();
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('清理缓存后会刷新缓存统计', async () => {
    const config = createDefaultConfig();
    mocks.getConfig.mockResolvedValueOnce(config);
    mocks.getLocalCacheStats
      .mockResolvedValueOnce({ pageCount: 3, entryCount: 3, bytes: 128 })
      .mockResolvedValueOnce({ pageCount: 0, entryCount: 0, bytes: 0 });
    mocks.clearLocalCache.mockResolvedValueOnce({ removedKeys: 3 });

    render(<SettingsShell />);

    await screen.findByRole('heading', { name: '设置' });
    fireEvent.click(screen.getByRole('button', { name: '清理本地缓存' }));

    await waitFor(() => {
      expect(mocks.clearLocalCache).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByTestId('cache-page-count')).toHaveTextContent('0 个页面');
    expect(screen.getByTestId('cache-bytes')).toHaveTextContent('0 B');
  });

  it('清理缓存失败后显示错误并保留当前缓存统计', async () => {
    const config = createDefaultConfig();
    mocks.getConfig.mockResolvedValueOnce(config);
    mocks.getLocalCacheStats.mockResolvedValueOnce({ pageCount: 3, entryCount: 3, bytes: 128 });
    mocks.clearLocalCache.mockRejectedValueOnce(new Error('缓存清理失败'));

    render(<SettingsShell />);

    await screen.findByRole('heading', { name: '设置' });
    fireEvent.click(screen.getByRole('button', { name: '清理本地缓存' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('缓存清理失败');
    expect(screen.getByTestId('cache-page-count')).toHaveTextContent('3 个页面');
    expect(screen.getByTestId('cache-bytes')).toHaveTextContent('128 B');
  });

  it('快速重复点击保存时只触发一次保存请求', async () => {
    const config = createDefaultConfig();
    let resolveSave: (() => void) | null = null;
    mocks.getConfig.mockResolvedValueOnce(config);
    mocks.getLocalCacheStats.mockResolvedValueOnce({ entryCount: 1, bytes: 16 });
    mocks.saveConfig.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = () => resolve(config);
        }),
    );

    render(<SettingsShell />);

    await screen.findByRole('heading', { name: '设置' });
    const user = userEvent.setup();
    const saveButton = screen.getByRole('button', { name: '保存' });
    await user.click(saveButton);
    await user.click(saveButton);

    expect(mocks.saveConfig).toHaveBeenCalledTimes(1);

    resolveSave?.();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '保存' })).not.toBeDisabled();
    });
  });

  it('点击恢复默认后用后台默认配置刷新页面', async () => {
    const current = createDefaultConfig({
      basic: {
        ...createDefaultConfig().basic,
        language: 'en',
        theme: 'dark',
      },
    });
    const reset = createDefaultConfig();
    mocks.getConfig.mockResolvedValueOnce(current);
    mocks.getLocalCacheStats.mockResolvedValue({ entryCount: 1, bytes: 16 });
    mocks.resetConfig.mockResolvedValueOnce(reset);

    render(<SettingsShell />);

    await screen.findByRole('heading', { name: 'Settings' });
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    await waitFor(() => {
      expect(mocks.resetConfig).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByRole('heading', { name: '设置' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '语言' })).toHaveTextContent('中文');
  });

  it('保存并同步会先保存再同步，并回写反馈', async () => {
    const current = createDefaultConfig({
      basic: {
        ...createDefaultConfig().basic,
        systemPrompt: '保存并同步前的草稿',
      },
    });
    const saved = createDefaultConfig({
      ...current,
      updatedAt: 200,
    });
    const synced = createDefaultConfig({
      ...saved,
      sync: {
        ...saved.sync,
        enabled: true,
        provider: 'gist',
        gistToken: 'token',
        gistId: 'gist-id',
        lastSyncAt: 300,
      },
    });
    mocks.getConfig.mockResolvedValueOnce(current);
    mocks.getLocalCacheStats.mockResolvedValueOnce({ entryCount: 1, bytes: 16 });
    mocks.saveConfig.mockResolvedValueOnce(saved);
    mocks.syncNow.mockResolvedValueOnce({
      config: synced,
      result: {
        provider: 'gist',
        lastSyncAt: 300,
        snapshotBytes: 512,
      },
    });

    render(<SettingsShell />);

    await screen.findByRole('heading', { name: '设置' });
    fireEvent.click(screen.getByRole('button', { name: '保存并同步' }));

    await waitFor(() => {
      expect(mocks.saveConfig).toHaveBeenCalledTimes(1);
      expect(mocks.syncNow).toHaveBeenCalledTimes(1);
    });
    expect(mocks.syncNow).toHaveBeenCalledWith(saved);
    fireEvent.click(screen.getByRole('tab', { name: '云同步' }));
    expect(screen.getByText('已同步 512 B')).toBeInTheDocument();
  });
});
