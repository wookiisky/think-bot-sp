import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultConfig } from '../../../src/domain/config/config-schema';
import { SettingsShell } from '../../../src/features/settings/settings-shell';

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  saveConfig: vi.fn(),
  getLocalCacheStats: vi.fn(),
}));

vi.mock('../../../src/features/settings/settings-api', () => ({
  settingsApi: {
    getConfig: mocks.getConfig,
    saveConfig: mocks.saveConfig,
    getLocalCacheStats: mocks.getLocalCacheStats,
  },
}));

describe('SettingsShell', () => {
  afterEach(() => {
    cleanup();
    mocks.getConfig.mockReset();
    mocks.saveConfig.mockReset();
    mocks.getLocalCacheStats.mockReset();
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
    const config = createDefaultConfig();
    mocks.getConfig.mockResolvedValueOnce(config);
    mocks.getLocalCacheStats.mockResolvedValueOnce({ entryCount: 1, bytes: 16 });
    mocks.saveConfig.mockReturnValueOnce(new Promise(() => {}));

    render(<SettingsShell />);

    await screen.findByRole('heading', { name: '设置' });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: '语言' })).toBeDisabled();
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
});
