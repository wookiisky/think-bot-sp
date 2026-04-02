import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultConfig } from '../../../src/domain/config/config-schema';
import { SettingsShell } from '../../../src/features/settings/settings-shell';

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  saveConfig: vi.fn(),
  getLocalCacheStats: vi.fn(),
  clearLocalCache: vi.fn(),
  exportConfig: vi.fn(),
  importConfig: vi.fn(),
}));

vi.mock('../../../src/features/settings/settings-api', () => ({
  settingsApi: {
    getConfig: mocks.getConfig,
    saveConfig: mocks.saveConfig,
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
    mocks.getLocalCacheStats.mockReset();
    mocks.clearLocalCache.mockReset();
    mocks.exportConfig.mockReset();
    mocks.importConfig.mockReset();
  });

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

  it('切换语言后即时预览标题变化', async () => {
    mocks.getConfig.mockResolvedValueOnce(createDefaultConfig());
    mocks.getLocalCacheStats.mockResolvedValueOnce({ entryCount: 0, bytes: 0 });

    render(<SettingsShell />);

    const languageSelect = await screen.findByRole('combobox', { name: '语言' });
    fireEvent.change(languageSelect, { target: { value: 'en' } });

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
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

  it('保存期间禁用保存按钮和语言选择器', async () => {
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
    expect(screen.getByRole('combobox', { name: '模型' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Provider' })).toBeDisabled();
    expect(screen.getByLabelText('API Key')).toBeDisabled();
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
          order: 1,
          deletedAt: null,
        },
      ],
    });
    mocks.getConfig.mockResolvedValueOnce(config);
    mocks.getLocalCacheStats.mockResolvedValueOnce({ entryCount: 1, bytes: 16 });

    render(<SettingsShell />);

    await screen.findByRole('heading', { name: '设置' });
    fireEvent.click(screen.getByRole('button', { name: '显示' }));
    expect(screen.getByLabelText('API Key')).toHaveAttribute('type', 'text');

    fireEvent.change(screen.getByRole('combobox', { name: '模型' }), { target: { value: 'model-2' } });

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
});
