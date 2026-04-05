import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultConfig } from '../../../src/domain/config/config-schema';
import { LanguageModelsPanel } from '../../../src/features/settings/language-models-panel';

const t = (key: string) =>
  ({
    'settings.languageModels': '语言模型',
    'settings.modelsDescription': '说明',
    'settings.noModels': '暂无模型配置',
    'settings.addModel': '新增模型',
    'settings.copyModel': '复制模型',
    'settings.deleteModel': '删除模型',
    'settings.dragModel': '拖拽模型',
    'settings.enableModel': '启用',
    'settings.moveUp': '上移',
    'settings.moveDown': '下移',
  })[key] ?? key;

const createConfig = () =>
  createDefaultConfig({
    basic: {
      ...createDefaultConfig().basic,
      defaultModelId: 'model-1',
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
      {
        id: 'model-2',
        name: '备用模型',
        provider: 'gemini',
        enabled: true,
        model: 'gemini-2.5-flash',
        baseUrl: '',
        apiKey: 'gemini-key',
        deployment: '',
        temperature: 0.4,
        tools: [],
        thinkingBudget: null,
        maxOutputTokens: null,
        supportsImages: true,
        order: 1,
        deletedAt: null,
      },
    ],
  });

/** 用受控壳层模拟设置页草稿配置。 */
const ControlledLanguageModelsPanel = ({ config: initialConfig = createConfig() }: { config?: ReturnType<typeof createConfig> }) => {
  const [config, setConfig] = useState(initialConfig);
  const [selectedModelId, setSelectedModelId] = useState<string | null>('model-1');

  return (
    <LanguageModelsPanel
      config={config}
      selectedModelId={selectedModelId}
      disabled={false}
      onSelectModel={setSelectedModelId}
      onChange={setConfig}
      t={t}
    />
  );
};

describe('LanguageModelsPanel', () => {
  afterEach(() => cleanup());

  it('展示模型标题摘要并支持新增与复制', async () => {
    const onChange = vi.fn();
    const onSelectModel = vi.fn();
    render(
      <LanguageModelsPanel
        config={createConfig()}
        selectedModelId="model-1"
        disabled={false}
        onSelectModel={onSelectModel}
        onChange={onChange}
        t={t}
      />,
    );

    const primaryItem = screen.getByTestId('language-model-item-model-1');
    const secondaryItem = screen.getByTestId('language-model-item-model-2');

    expect(primaryItem).toHaveTextContent('主模型');
    expect(primaryItem).toHaveTextContent('openai-compatible / gpt-4o-mini');
    expect(secondaryItem).toHaveTextContent('备用模型');
    expect(secondaryItem).toHaveTextContent('gemini / gemini-2.5-flash');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '新增模型' }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        models: expect.arrayContaining([expect.objectContaining({ name: '新模型' })]),
      }),
    );
    expect(onSelectModel).toHaveBeenLastCalledWith(expect.stringMatching(/^model-/));

    await user.click(screen.getByRole('button', { name: '复制模型' }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        models: expect.arrayContaining([expect.objectContaining({ name: '主模型 副本' })]),
      }),
    );

    expect(screen.getByRole('button', { name: '拖拽模型:主模型' })).toBeInTheDocument();
  });

  it('软删除当前默认模型后会清空默认模型引用', async () => {
    const onChange = vi.fn();
    render(
      <LanguageModelsPanel
        config={createConfig()}
        selectedModelId="model-1"
        disabled={false}
        onSelectModel={vi.fn()}
        onChange={onChange}
        t={t}
      />,
    );

    const user = userEvent.setup();
    await user.click(within(screen.getByTestId('language-model-item-model-1')).getByRole('button', { name: '删除模型' }));

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        basic: expect.objectContaining({
          defaultModelId: null,
        }),
        models: expect.arrayContaining([
          expect.objectContaining({
            id: 'model-1',
            deletedAt: expect.any(Number),
          }),
        ]),
      }),
    );
  });

  it('保留键盘可达的上下移动回退方案', async () => {
    const onChange = vi.fn();
    render(
      <LanguageModelsPanel
        config={createConfig()}
        selectedModelId="model-1"
        disabled={false}
        onSelectModel={vi.fn()}
        onChange={onChange}
        t={t}
      />,
    );

    const user = userEvent.setup();
    await user.click(within(screen.getByTestId('language-model-item-model-1')).getByRole('button', { name: '下移' }));

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        models: [
          expect.objectContaining({ id: 'model-2', order: 0 }),
          expect.objectContaining({ id: 'model-1', order: 1 }),
        ],
      }),
    );
  });

  it('支持单项展开并在标题栏切换启用状态', async () => {
    render(<ControlledLanguageModelsPanel />);

    const primaryItem = screen.getByTestId('language-model-item-model-1');
    const secondaryItem = screen.getByTestId('language-model-item-model-2');
    expect(within(primaryItem).getByLabelText('模型名称')).toHaveValue('主模型');
    expect(within(primaryItem).queryByRole('checkbox', { name: '启用模型' })).not.toBeInTheDocument();
    expect(within(secondaryItem).queryByLabelText('模型名称')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(within(secondaryItem).getByTestId('language-model-summary-model-2'));

    expect(within(primaryItem).queryByLabelText('模型名称')).not.toBeInTheDocument();
    expect(within(secondaryItem).getByLabelText('模型名称')).toHaveValue('备用模型');

    const enabledToggle = within(secondaryItem).getByRole('checkbox', { name: '启用:备用模型' });
    expect(enabledToggle).toBeChecked();
    await user.click(enabledToggle);
    expect(within(secondaryItem).getByRole('checkbox', { name: '启用:备用模型' })).not.toBeChecked();
  });
});
