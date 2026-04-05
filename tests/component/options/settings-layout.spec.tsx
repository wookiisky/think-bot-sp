import { cleanup, render, screen } from '@testing-library/react';
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
    syncNow: mocks.syncNow,
  },
}));

mocks.getRecentError.mockResolvedValue(null);

describe('SettingsLayout', () => {
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
    mocks.syncNow.mockReset();
    mocks.getRecentError.mockResolvedValue(null);
  });

  it('左侧导航固定为五个栏目并展示顶部动作区', async () => {
    mocks.getConfig.mockResolvedValueOnce(createDefaultConfig());
    mocks.getLocalCacheStats.mockResolvedValueOnce({ pageCount: 0, entryCount: 0, bytes: 0 });

    render(<SettingsShell />);

    expect(await screen.findByRole('tab', { name: '基础设置' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(5);
    expect(screen.getByRole('tab', { name: '基础设置' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '快捷输入' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '语言模型' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '云同步' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '黑名单设置' })).toBeInTheDocument();
    expect(screen.getByTestId('settings-shell-actions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存并同步' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '恢复默认' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导入配置' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导出配置' })).toBeInTheDocument();
  });

  it('切换栏目后保留基础设置草稿并显示未保存提示', async () => {
    mocks.getConfig.mockResolvedValueOnce(
      createDefaultConfig({
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
            supportsImages: true,
            order: 0,
            deletedAt: null,
          },
        ],
      }),
    );
    mocks.getLocalCacheStats.mockResolvedValueOnce({ pageCount: 0, entryCount: 0, bytes: 0 });

    render(<SettingsShell />);

    const user = userEvent.setup();
    await screen.findByRole('tab', { name: '基础设置' });
    await user.clear(screen.getByLabelText('System Prompt'));
    await user.type(screen.getByLabelText('System Prompt'), '始终使用中文回答');

    expect(screen.getByText('有未保存更改')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '语言模型' }));
    await user.click(screen.getByRole('tab', { name: '基础设置' }));

    expect(screen.getByLabelText('System Prompt')).toHaveValue('始终使用中文回答');
  });
});
