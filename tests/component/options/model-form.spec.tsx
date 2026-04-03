import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ModelForm } from '../../../src/features/settings/model-form';

const createModel = (overrides = {}) =>
  ({
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
    ...overrides,
  }) as const;

describe('ModelForm', () => {
  afterEach(() => cleanup());

  /** 打开 shadcn Select 并选择目标选项。 */
  const selectOption = async (label: string, optionText: string) => {
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: label }));
    const listbox = await screen.findByRole('listbox');
    await user.click(within(listbox).getByText(optionText));
  };

  it('切换 Provider 后展示差异字段', async () => {
    const onChange = vi.fn();

    const Harness = () => {
      const [model, setModel] = useState(createModel());
      return <ModelForm model={model} onChange={(nextModel) => {
        onChange(nextModel);
        setModel(nextModel);
      }} />;
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
  });

  it('API Key 默认掩码并可切换显示', () => {
    render(<ModelForm model={createModel()} onChange={vi.fn()} />);

    const apiKeyInput = screen.getByLabelText('API Key');
    expect(apiKeyInput).toHaveAttribute('type', 'password');

    fireEvent.click(screen.getByRole('button', { name: '显示' }));

    expect(screen.getByLabelText('API Key')).toHaveAttribute('type', 'text');
  });

  it('根据模型完整性显示状态提示', () => {
    render(<ModelForm model={createModel({ enabled: false })} onChange={vi.fn()} />);

    expect(screen.getByText('配置不完整')).toBeInTheDocument();
  });

  it('完整模型显示配置完整', () => {
    render(<ModelForm model={createModel()} onChange={vi.fn()} />);

    expect(screen.getByText('配置完整')).toBeInTheDocument();
  });
});
