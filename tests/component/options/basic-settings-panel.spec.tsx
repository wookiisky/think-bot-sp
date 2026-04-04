import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { createDefaultConfig } from '../../../src/domain/config/config-schema';
import { BasicSettingsPanel } from '../../../src/features/settings/basic-settings-panel';

const t = (key: string) =>
  ({
    'settings.basic': '基础设置',
    'settings.basicDescription': '说明',
    'settings.language': '语言',
    'settings.theme': '主题',
    'settings.defaultModel': '默认模型',
    'settings.noDefaultModel': '不设置默认模型',
    'settings.branchModels': '全局分支模型',
    'settings.branchModelsDescription': '为 Chat 和未单独覆盖的快捷输入配置默认分支模型。',
    'settings.noBranchModels': '暂无可用分支模型',
    'settings.branchModelsMissing': '部分分支模型引用已失效，保存时会自动清理。',
    'settings.extractionMethod': '默认提取方式',
    'settings.previewHint': '即时预览',
    'settings.previewDescription': '切换语言和主题后立即预览。',
    'settings.filterCot': '过滤 COT 内容',
    'settings.includePageContentByDefault': '默认附带页面正文',
    'settings.cache': '本地缓存',
    'settings.cacheDescription': '说明',
    'settings.clearCache': '清理本地缓存',
  })[key] ?? key;

const ControlledBasicSettingsPanel = ({ config: initialConfig }: { config?: ReturnType<typeof createDefaultConfig> }) => {
  const [config, setConfig] = useState(
    initialConfig ??
      createDefaultConfig({
        models: [
          {
            id: 'model-1',
            name: '主模型',
            provider: 'openai-compatible',
            enabled: true,
            model: 'gpt-4.1-mini',
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
            provider: 'gemini',
            enabled: true,
            model: 'gemini-2.5-flash',
            baseUrl: '',
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
      }),
  );

  return (
    <BasicSettingsPanel
      config={config}
      defaultModels={config.models.filter((item) => item.enabled && item.deletedAt === null)}
      cacheStats={{ entryCount: 1, bytes: 16 }}
      disabled={false}
      onChange={setConfig}
      onClearCache={() => undefined}
      t={t}
    />
  );
};

describe('BasicSettingsPanel', () => {
  afterEach(() => cleanup());

  it('支持选择全局分支模型', async () => {
    render(<ControlledBasicSettingsPanel />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: '全局分支模型:主模型' }));
    await user.click(screen.getByRole('checkbox', { name: '全局分支模型:备用模型' }));

    expect(screen.getByRole('checkbox', { name: '全局分支模型:主模型' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '全局分支模型:备用模型' })).toBeChecked();
  });

  it('存在失效全局分支模型引用时显示降级提示', () => {
    render(
      <ControlledBasicSettingsPanel
        config={createDefaultConfig({
          basic: {
            ...createDefaultConfig().basic,
            branchModelIds: ['missing-model'],
          },
          models: [
            {
              id: 'model-1',
              name: '主模型',
              provider: 'openai-compatible',
              enabled: true,
              model: 'gpt-4.1-mini',
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
        })}
      />,
    );

    expect(screen.getByText('部分分支模型引用已失效，保存时会自动清理。')).toBeInTheDocument();
  });
});
