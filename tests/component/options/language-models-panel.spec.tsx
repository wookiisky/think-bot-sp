import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultConfig } from '../../../src/domain/config/config-schema';
import { LanguageModelsPanel } from '../../../src/features/settings/language-models-panel';

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

describe('LanguageModelsPanel', () => {
  afterEach(() => cleanup());

  it('展示模型摘要并支持新增与复制', async () => {
    const onChange = vi.fn();
    const onSelectModel = vi.fn();
    render(
      <LanguageModelsPanel
        config={createConfig()}
        selectedModelId="model-1"
        disabled={false}
        onSelectModel={onSelectModel}
        onChange={onChange}
        t={(key) =>
          ({
            'settings.languageModels': '语言模型',
            'settings.modelsDescription': '说明',
            'settings.enabled': '已启用',
            'settings.disabled': '已停用',
            'settings.noModels': '暂无模型配置',
            'settings.addModel': '新增模型',
            'settings.copyModel': '复制模型',
            'settings.deleteModel': '删除模型',
            'settings.dragModel': '拖拽模型',
            'settings.moveUp': '上移',
            'settings.moveDown': '下移',
          })[key] ?? key
        }
      />,
    );

    expect(screen.getAllByText('主模型').length).toBeGreaterThan(0);
    expect(screen.getAllByText('备用模型').length).toBeGreaterThan(0);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '新增模型' }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        models: expect.arrayContaining([expect.objectContaining({ name: '新模型' })]),
      }),
    );

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
        t={(key) =>
          ({
            'settings.languageModels': '语言模型',
            'settings.modelsDescription': '说明',
            'settings.enabled': '已启用',
            'settings.disabled': '已停用',
            'settings.noModels': '暂无模型配置',
            'settings.addModel': '新增模型',
            'settings.copyModel': '复制模型',
            'settings.deleteModel': '删除模型',
            'settings.dragModel': '拖拽模型',
            'settings.moveUp': '上移',
            'settings.moveDown': '下移',
          })[key] ?? key
        }
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '删除模型' }));

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
        t={(key) =>
          ({
            'settings.languageModels': '语言模型',
            'settings.modelsDescription': '说明',
            'settings.enabled': '已启用',
            'settings.disabled': '已停用',
            'settings.noModels': '暂无模型配置',
            'settings.addModel': '新增模型',
            'settings.copyModel': '复制模型',
            'settings.deleteModel': '删除模型',
            'settings.dragModel': '拖拽模型',
            'settings.moveUp': '上移',
            'settings.moveDown': '下移',
          })[key] ?? key
        }
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '下移' }));

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        models: [
          expect.objectContaining({ id: 'model-2', order: 0 }),
          expect.objectContaining({ id: 'model-1', order: 1 }),
        ],
      }),
    );
  });
});
