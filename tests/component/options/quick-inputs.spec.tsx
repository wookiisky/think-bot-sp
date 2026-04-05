import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultConfig } from '../../../src/domain/config/config-schema';
import { QuickInputsPanel } from '../../../src/features/settings/quick-inputs-panel';

const t = (key: string) =>
  ({
    'settings.promptTabs': '标签页',
    'settings.quickInputsDescription': '管理快捷输入模板。',
    'settings.noQuickInputs': '暂无快捷输入',
    'settings.addQuickInput': '新增快捷输入',
    'settings.importQuickInputTemplates': '导入远端模板',
    'settings.importingQuickInputTemplates': '正在导入模板',
    'settings.deleteQuickInput': '删除快捷输入',
    'settings.dragQuickInput': '拖拽快捷输入',
    'settings.moveUp': '上移',
    'settings.moveDown': '下移',
    'settings.quickInputName': '快捷输入名称',
    'settings.quickInputPrompt': '快捷输入提示词',
    'settings.quickInputPromptEmpty': '暂无提示词',
    'settings.quickInputAutoTrigger': '自动触发',
    'settings.quickInputModel': '专属模型',
    'settings.quickInputNoModel': '不指定模型',
    'settings.quickInputModelMissing': '引用的模型已失效，建议重新选择。',
    'settings.quickInputBranchModels': '专属分支模型',
    'settings.quickInputBranchModelsDescription': '当前快捷输入会在全局分支模型基础上叠加这些模型。',
    'settings.quickInputBranchModelsMissing': '部分专属分支模型引用已失效，保存时会自动清理。',
    'settings.noBranchModels': '暂无可用分支模型',
    'settings.enabled': '已启用',
    'settings.disabled': '已停用',
  })[key] ?? key;

/** 用受控壳层模拟设置页草稿配置。 */
const ControlledQuickInputsPanel = ({ config: initialConfig }: { config?: ReturnType<typeof createDefaultConfig> }) => {
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
        ],
      }),
  );

  return (
    <QuickInputsPanel
      config={config}
      disabled={false}
      importingTemplates={false}
      onChange={setConfig}
      onImportTemplates={() => undefined}
      t={t}
    />
  );
};

describe('QuickInputsPanel', () => {
  afterEach(() => cleanup());

  it('支持新增、编辑、排序和软删除快捷输入', async () => {
    render(
      <ControlledQuickInputsPanel
        config={createDefaultConfig({
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
          quickInputs: [
            {
              id: 'quick-1',
              name: '总结',
              prompt: '请总结当前页面',
              autoTrigger: false,
              modelId: null,
              branchModelIds: [],
              order: 0,
              deletedAt: null,
            },
            {
              id: 'quick-2',
              name: '翻译',
              prompt: '请翻译当前页面',
              autoTrigger: false,
              modelId: null,
              branchModelIds: [],
              order: 1,
              deletedAt: null,
            },
          ],
        })}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '新增快捷输入' }));
    await user.clear(screen.getByLabelText('快捷输入名称'));
    await user.type(screen.getByLabelText('快捷输入名称'), '问题拆解');
    await user.type(screen.getByLabelText('快捷输入提示词'), '请先拆解问题再回答');
    await user.click(screen.getByRole('checkbox', { name: '自动触发' }));

    await user.click(screen.getByRole('combobox', { name: '专属模型' }));
    await user.click(await screen.findByRole('option', { name: '主模型' }));
    await user.click(screen.getByRole('checkbox', { name: '专属分支模型:主模型' }));

    await user.click(screen.getByRole('button', { name: '上移' }));

    const items = screen.getAllByRole('listitem');
    expect(items[1]).toHaveTextContent('问题拆解');

    await user.click(screen.getByRole('button', { name: '删除快捷输入' }));

    expect(screen.queryByDisplayValue('问题拆解')).not.toBeInTheDocument();
    expect(screen.getByText('总结')).toBeInTheDocument();
    expect(screen.getByText('翻译')).toBeInTheDocument();
  });

  it('引用失效模型时提示降级并允许重新选择', async () => {
    render(
      <ControlledQuickInputsPanel
        config={createDefaultConfig({
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
          quickInputs: [
            {
              id: 'quick-1',
              name: '总结',
              prompt: '请总结当前页面',
              autoTrigger: false,
              modelId: 'missing-model',
              branchModelIds: ['missing-branch-model'],
              order: 0,
              deletedAt: null,
            },
          ],
        })}
      />,
    );

    const user = userEvent.setup();

    expect(screen.getByText('引用的模型已失效，建议重新选择。')).toBeInTheDocument();
    expect(screen.getByText('部分专属分支模型引用已失效，保存时会自动清理。')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: '专属模型' }));
    await user.click(await screen.findByRole('option', { name: '不指定模型' }));

    expect(screen.queryByText('引用的模型已失效，建议重新选择。')).not.toBeInTheDocument();
  });

  it('支持折叠展开，并暴露远端模板导入入口', async () => {
    const onImportTemplates = vi.fn();
    render(
      <QuickInputsPanel
        config={createDefaultConfig({
          quickInputs: [
            {
              id: 'quick-1',
              name: '总结',
              prompt: '请总结当前页面内容，保留重点结论。',
              autoTrigger: false,
              modelId: null,
              branchModelIds: [],
              order: 0,
              deletedAt: null,
            },
          ],
        })}
        disabled={false}
        importingTemplates={false}
        onChange={() => undefined}
        onImportTemplates={onImportTemplates}
        t={t}
      />,
    );

    const user = userEvent.setup();
    expect(screen.getByLabelText('快捷输入提示词')).toHaveValue('请总结当前页面内容，保留重点结论。');
    expect(screen.getByLabelText('快捷输入名称')).toBeInTheDocument();

    await user.click(screen.getByText('总结'));
    expect(screen.queryByLabelText('快捷输入名称')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '导入远端模板' }));
    expect(onImportTemplates).toHaveBeenCalledTimes(1);
  });
});
