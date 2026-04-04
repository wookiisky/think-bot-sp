import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultConfig } from '../../../src/domain/config/config-schema';
import { SettingsShell } from '../../../src/features/settings/settings-shell';

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  saveConfig: vi.fn(),
  resetConfig: vi.fn(),
  getLocalCacheStats: vi.fn(),
  clearLocalCache: vi.fn(),
  exportConfig: vi.fn(),
  importConfig: vi.fn(),
}));

vi.mock('../../../src/features/settings/settings-api', () => ({
  settingsApi: {
    getConfig: mocks.getConfig,
    saveConfig: mocks.saveConfig,
    resetConfig: mocks.resetConfig,
    getLocalCacheStats: mocks.getLocalCacheStats,
    clearLocalCache: mocks.clearLocalCache,
    exportConfig: mocks.exportConfig,
    importConfig: mocks.importConfig,
  },
}));

describe('SettingsShell', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mocks.getConfig.mockReset();
    mocks.saveConfig.mockReset();
    mocks.resetConfig.mockReset();
    mocks.getLocalCacheStats.mockReset();
    mocks.clearLocalCache.mockReset();
    mocks.exportConfig.mockReset();
    mocks.importConfig.mockReset();
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
    mocks.getLocalCacheStats.mockResolvedValueOnce({ entryCount: 3, bytes: 128 });

    render(<SettingsShell />);

    expect(await screen.findByRole('heading', { name: '设置' })).toBeInTheDocument();
    expect(screen.getByText('3 项')).toBeInTheDocument();
    expect(screen.getByText('128 B')).toBeInTheDocument();
    expect(mocks.getConfig).toHaveBeenCalledTimes(1);
    expect(mocks.getLocalCacheStats).toHaveBeenCalledTimes(1);
  });

  it('加载配置后渲染设置页顶部动作区与导航 chips', async () => {
    mocks.getConfig.mockResolvedValueOnce(createDefaultConfig());
    mocks.getLocalCacheStats.mockResolvedValueOnce({ entryCount: 3, bytes: 128 });

    render(<SettingsShell />);

    expect(await screen.findByRole('heading', { name: '设置' })).toBeInTheDocument();
    expect(screen.getByTestId('settings-shell-actions')).toBeInTheDocument();
    expect(screen.getByTestId('settings-shell-nav')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导入配置' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导出配置' })).toBeInTheDocument();
  });

  it('设置页使用完整 tab 页面布局而不是弹窗式卡片壳层', async () => {
    mocks.getConfig.mockResolvedValueOnce(createDefaultConfig());
    mocks.getLocalCacheStats.mockResolvedValueOnce({ entryCount: 3, bytes: 128 });

    render(<SettingsShell />);

    const shell = await screen.findByTestId('settings-shell');
    expect(shell).toHaveAttribute('data-layout', 'tab-page');
    expect(screen.queryByTestId('settings-shell-frame')).not.toBeInTheDocument();
  });

  it('切换语言后即时预览标题变化', async () => {
    mocks.getConfig.mockResolvedValueOnce(createDefaultConfig());
    mocks.getLocalCacheStats.mockResolvedValueOnce({ entryCount: 0, bytes: 0 });

    render(<SettingsShell />);

    await screen.findByRole('combobox', { name: '语言' });
    await selectOption('语言', 'English');

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  });

  it('切换主题后立即更新设置页预览并保留当前选择', async () => {
    mocks.getConfig.mockResolvedValueOnce(createDefaultConfig());
    mocks.getLocalCacheStats.mockResolvedValueOnce({ entryCount: 0, bytes: 0 });

    render(<SettingsShell />);

    await screen.findByRole('heading', { name: '设置' });
    await selectOption('主题', 'Dark');

    const shell = screen.getByTestId('settings-shell');
    expect(shell).toHaveAttribute('data-theme', 'dark');
    expect(screen.getByRole('combobox', { name: '主题' })).toHaveTextContent('Dark');
  });

  it('主题切换后保留 data-theme 并更新根节点主题 class', async () => {
    mocks.getConfig.mockResolvedValueOnce(createDefaultConfig());
    mocks.getLocalCacheStats.mockResolvedValueOnce({ entryCount: 0, bytes: 0 });

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
    mocks.getLocalCacheStats.mockResolvedValueOnce({ entryCount: 1, bytes: 16 });
    mocks.saveConfig.mockResolvedValueOnce(config);

    render(<SettingsShell />);

    await screen.findByRole('heading', { name: '设置' });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(mocks.saveConfig).toHaveBeenCalledTimes(1);
    });
    expect(mocks.saveConfig).toHaveBeenCalledWith(config);
  });

  it('保存前会清理失效分支模型引用', async () => {
    const config = createDefaultConfig({
      basic: {
        ...createDefaultConfig().basic,
        branchModelIds: ['model-1', 'missing-branch-model'],
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
          branchModelIds: ['missing-branch-model', 'model-1'],
          order: 0,
          deletedAt: null,
        },
      ],
    });
    mocks.getConfig.mockResolvedValueOnce(config);
    mocks.getLocalCacheStats.mockResolvedValueOnce({ entryCount: 1, bytes: 16 });
    mocks.saveConfig.mockResolvedValueOnce(
      createDefaultConfig({
        ...config,
        basic: {
          ...config.basic,
          branchModelIds: ['model-1'],
        },
        quickInputs: [
          {
            ...config.quickInputs[0],
            branchModelIds: ['model-1'],
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
          branchModelIds: ['model-1'],
        }),
        quickInputs: [
          expect.objectContaining({
            id: 'quick-1',
            branchModelIds: ['model-1'],
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
    fireEvent.click(screen.getByRole('tab', { name: '标签页' }));

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
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('{"version":"0.0.0"}');
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
    fireEvent.click(screen.getByRole('button', { name: '导入配置' }));

    expect(promptSpy).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('alert')).toHaveTextContent('导入失败');
    expect(screen.getByLabelText('System Prompt')).toHaveValue('保留当前草稿');
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
    fireEvent.click(screen.getByRole('button', { name: '显示' }));
    expect(screen.getByLabelText('API Key')).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: /模型二/ }));

    expect(screen.getByLabelText('API Key')).toHaveAttribute('type', 'password');
  });

  it('清理缓存后会刷新缓存统计', async () => {
    const config = createDefaultConfig();
    mocks.getConfig.mockResolvedValueOnce(config);
    mocks.getLocalCacheStats.mockResolvedValueOnce({ entryCount: 3, bytes: 128 }).mockResolvedValueOnce({ entryCount: 0, bytes: 0 });
    mocks.clearLocalCache.mockResolvedValueOnce({ removedKeys: 3 });

    render(<SettingsShell />);

    await screen.findByRole('heading', { name: '设置' });
    fireEvent.click(screen.getByRole('button', { name: '清理本地缓存' }));

    await waitFor(() => {
      expect(mocks.clearLocalCache).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('0 项')).toBeInTheDocument();
    expect(screen.getByText('0 B')).toBeInTheDocument();
  });

  it('清理缓存失败后显示错误并保留当前缓存统计', async () => {
    const config = createDefaultConfig();
    mocks.getConfig.mockResolvedValueOnce(config);
    mocks.getLocalCacheStats.mockResolvedValueOnce({ entryCount: 3, bytes: 128 });
    mocks.clearLocalCache.mockRejectedValueOnce(new Error('缓存清理失败'));

    render(<SettingsShell />);

    await screen.findByRole('heading', { name: '设置' });
    fireEvent.click(screen.getByRole('button', { name: '清理本地缓存' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('缓存清理失败');
    expect(screen.getByText('3 项')).toBeInTheDocument();
    expect(screen.getByText('128 B')).toBeInTheDocument();
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
});
