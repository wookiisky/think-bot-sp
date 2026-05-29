import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ModelConfig } from '../../../src/domain/config/config-schema';
import { ModelForm } from '../../../src/features/settings/model-form';

const createModel = (overrides: Partial<ModelConfig> = {}): ModelConfig => ({
    id: 'model-1',
    name: '主模型',
    provider: 'openai-compatible',
    enabled: true,
    model: 'gpt-4o-mini',
    baseUrl: 'https://api.example.com',
    apiKey: 'secret-key',
    deployment: '',
    temperature: 0.2,
    tools: [],
    thinkingBudget: null,
    maxOutputTokens: null,
    order: 0,
    deletedAt: null,
    supportsImages: false,
    ...overrides,
  });

describe('ModelForm', () => {
  afterEach(() => cleanup());

  /** 打开 shadcn Select 并选择目标选项。 */
  const selectOption = async (label: string, optionText: string) => {
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: label }));
    const listbox = await screen.findByRole('listbox');
    await user.click(within(listbox).getByText(optionText));
  };

  it('默认展示表单头部，并可按需隐藏头部和启用控件', () => {
    const { rerender } = render(<ModelForm model={createModel()} onChange={vi.fn()} />);

    expect(screen.getByRole('heading', { name: '主模型' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '启用模型' })).toBeInTheDocument();

    rerender(<ModelForm model={createModel()} onChange={vi.fn()} showHeader={false} showEnabledField={false} />);

    expect(screen.queryByRole('heading', { name: '主模型' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: '启用模型' })).not.toBeInTheDocument();
  });

  it('切换 Provider 后展示差异字段', async () => {
    const onChange = vi.fn();

    const Harness = () => {
      const [model, setModel] = useState(createModel());
      return (
        <ModelForm
          model={model}
          onChange={(nextModel) => {
            onChange(nextModel);
            setModel(nextModel);
          }}
        />
      );
    };

    render(<Harness />);

    expect(screen.getByRole('combobox', { name: 'Provider' })).toHaveTextContent('OpenAI Compatible');
    expect(screen.getByLabelText('Base URL')).toBeInTheDocument();
    expect(screen.queryByLabelText('Deployment')).not.toBeInTheDocument();

    await selectOption('Provider', 'Azure OpenAI');

    expect(onChange).toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: 'Provider' })).toHaveTextContent('Azure OpenAI');
    expect(screen.getByLabelText('Base URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Deployment')).toBeInTheDocument();

    await selectOption('Provider', 'Gemini');
    expect(screen.getByLabelText('Reasoning Effort')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tools' })).toBeInTheDocument();

    await selectOption('Provider', 'Amazon Bedrock');
    expect(screen.getByLabelText('Region')).toBeInTheDocument();

    await selectOption('Provider', 'Google Vertex');
    expect(screen.getByLabelText('Project')).toBeInTheDocument();
    expect(screen.getByLabelText('Location')).toBeInTheDocument();
  });

  it('API Key 默认掩码并可切换显示', () => {
    render(<ModelForm model={createModel()} onChange={vi.fn()} />);

    const apiKeyInput = screen.getByLabelText('API Key');
    expect(apiKeyInput).toHaveAttribute('type', 'password');

    fireEvent.click(screen.getByRole('button', { name: '显示' }));

    expect(screen.getByLabelText('API Key')).toHaveAttribute('type', 'text');
  });

  it('可显式切换图片输入能力并回写到界面', async () => {
    const onChange = vi.fn();

    const Harness = () => {
      const [model, setModel] = useState(createModel());
      return (
        <ModelForm
          model={model}
          onChange={(nextModel) => {
            onChange(nextModel);
            setModel(nextModel);
          }}
        />
      );
    };

    render(<Harness />);

    const checkbox = screen.getByRole('checkbox', { name: '支持图片输入' });
    expect(checkbox).not.toBeChecked();

    const user = userEvent.setup();
    await user.click(checkbox);

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ supportsImages: true }));
    expect(screen.getByRole('checkbox', { name: '支持图片输入' })).toBeChecked();
  });

  it('支持编辑名称、模型标识、启用状态和采样参数', async () => {
    const onChange = vi.fn();

    const Harness = () => {
      const [model, setModel] = useState(createModel());
      return (
        <ModelForm
          model={model}
          onChange={(nextModel) => {
            onChange(nextModel);
            setModel(nextModel);
          }}
        />
      );
    };

    render(<Harness />);

    const user = userEvent.setup();
    await user.clear(screen.getByLabelText('模型名称'));
    await user.type(screen.getByLabelText('模型名称'), '研究模型');
    await user.clear(screen.getByLabelText('Model'));
    await user.type(screen.getByLabelText('Model'), 'gpt-5.4');
    await user.click(screen.getByRole('checkbox', { name: '启用模型' }));
    await user.clear(screen.getByLabelText('Temperature'));
    await user.type(screen.getByLabelText('Temperature'), '0.7');
    await user.clear(screen.getByLabelText('Max Output Tokens'));
    await user.type(screen.getByLabelText('Max Output Tokens'), '4096');

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: '研究模型',
        model: 'gpt-5.4',
        enabled: false,
        temperature: 0.7,
        maxOutputTokens: 4096,
      }),
    );

    expect(screen.queryByLabelText('Thinking Budget')).not.toBeInTheDocument();
  });
});
