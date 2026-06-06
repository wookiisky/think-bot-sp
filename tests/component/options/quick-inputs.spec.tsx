import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultConfig } from '../../../src/domain/config/config-schema';
import { DEFAULT_QUICK_INPUT_TEMPLATE_URL } from '../../../src/features/settings/quick-input-template-service';
import { QuickInputsPanel } from '../../../src/features/settings/quick-inputs-panel';

const t = (key: string) =>
  ({
    'common.cancel': '取消',
    'settings.promptTabs': '快捷输入',
    'settings.quickInputsDescription': '管理快捷输入模板。',
    'settings.noQuickInputs': '暂无快捷输入',
    'settings.addQuickInput': '新增快捷输入',
    'settings.importQuickInputTemplates': '导入远端模板',
    'settings.importingQuickInputTemplates': '正在导入模板',
    'settings.quickInputTemplateUrl': '远端模板网址',
    'settings.confirmImportQuickInputTemplates': '导入',
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
    'settings.quickInputBranchModels': '并行模型',
    'settings.multiSelectPlaceholder': '请选择',
    'settings.multiSelectSummary': '{count} 个已选',
    'settings.quickInputBranchModelsDescription': '当前快捷输入会在全局并行模型基础上追加这些模型。',
    'settings.quickInputBranchModelsMissing': '部分快捷输入并行模型引用已失效，保存时会自动清理。',
    'settings.noBranchModels': '暂无可用并行模型',
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
      defaultImportTemplateUrl={DEFAULT_QUICK_INPUT_TEMPLATE_URL}
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
              parallelModelIds: [],
              order: 0,
              deletedAt: null,
            },
            {
              id: 'quick-2',
              name: '翻译',
              prompt: '请翻译当前页面',
              autoTrigger: false,
              modelId: null,
              parallelModelIds: [],
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

    await user.click(screen.getByRole('combobox', { name: '专属模型' }));
    await user.click(await screen.findByRole('option', { name: '主模型' }));
    await user.click(screen.getByRole('button', { name: '并行模型' }));
    await user.click(screen.getByRole('checkbox', { name: '并行模型:主模型' }));

    const newQuickInputItem = screen
      .getAllByTestId(/quick-input-item-quick-/)
      .find((element) => element.textContent?.includes('问题拆解'));

    expect(newQuickInputItem).toBeTruthy();
    if (!newQuickInputItem) {
      throw new Error('未找到新快捷输入卡片');
    }

    await user.click(within(newQuickInputItem).getByRole('checkbox', { name: '自动触发:问题拆解' }));
    await user.click(within(newQuickInputItem).getByRole('button', { name: '上移' }));

    const items = screen.getAllByRole('listitem');
    expect(items[1]).toHaveTextContent('问题拆解');

    await user.click(within(newQuickInputItem).getByRole('button', { name: '删除快捷输入' }));
    expect(screen.queryByDisplayValue('问题拆解')).toBeInTheDocument();
    await user.click(within(screen.getByTestId(/quick-input-delete-confirm-/)).getByRole('button', { name: '删除快捷输入' }));

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
              parallelModelIds: ['missing-branch-model'],
              order: 0,
              deletedAt: null,
            },
          ],
        })}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId('quick-input-summary-quick-1'));

    expect(screen.getByText('引用的模型已失效，建议重新选择。')).toBeInTheDocument();
    expect(screen.getByText('部分快捷输入并行模型引用已失效，保存时会自动清理。')).toBeInTheDocument();

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
              parallelModelIds: [],
              order: 0,
              deletedAt: null,
            },
          ],
        })}
        disabled={false}
        importingTemplates={false}
        defaultImportTemplateUrl={DEFAULT_QUICK_INPUT_TEMPLATE_URL}
        onChange={() => undefined}
        onImportTemplates={onImportTemplates}
        t={t}
      />,
    );

    const user = userEvent.setup();
    expect(screen.queryByLabelText('快捷输入提示词')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('快捷输入名称')).not.toBeInTheDocument();
    expect(screen.queryByText('当前快捷输入会在全局并行模型基础上追加这些模型。')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('quick-input-summary-quick-1'));
    expect(screen.getByLabelText('快捷输入提示词')).toHaveValue('请总结当前页面内容，保留重点结论。');
    expect(screen.getByLabelText('快捷输入名称')).toBeInTheDocument();

    await user.click(screen.getByTestId('quick-input-summary-quick-1'));
    expect(screen.queryByLabelText('快捷输入名称')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '导入远端模板' }));
    const templateUrlInput = await screen.findByRole('textbox', { name: '远端模板网址' });
    expect(templateUrlInput).toHaveValue(DEFAULT_QUICK_INPUT_TEMPLATE_URL);

    await user.clear(templateUrlInput);
    await user.type(templateUrlInput, 'https://example.com/custom-tabs.json');
    await user.click(screen.getByRole('button', { name: '导入' }));
    expect(onImportTemplates).toHaveBeenCalledWith('https://example.com/custom-tabs.json');
  });

  it('标题栏单行展示名称与提示词预览，并在右侧切换自动触发', async () => {
    render(
      <ControlledQuickInputsPanel
        config={createDefaultConfig({
          quickInputs: [
            {
              id: 'quick-1',
              name: '总结',
              prompt: '请总结当前页面内容，保留重点结论。',
              autoTrigger: false,
              modelId: null,
              parallelModelIds: [],
              order: 0,
              deletedAt: null,
            },
            {
              id: 'quick-2',
              name: '翻译',
              prompt: '请翻译当前页面内容。',
              autoTrigger: true,
              modelId: null,
              parallelModelIds: [],
              order: 1,
              deletedAt: null,
            },
          ],
        })}
      />,
    );

    const firstItem = screen.getByTestId('quick-input-item-quick-1');
    const secondItem = screen.getByTestId('quick-input-item-quick-2');

    expect(firstItem).toHaveTextContent('总结');
    expect(firstItem).toHaveTextContent('请总结当前页面内容，保留重点结论。');
    expect(within(firstItem).queryByRole('checkbox', { name: '自动触发' })).not.toBeInTheDocument();
    expect(within(secondItem).queryByLabelText('快捷输入名称')).not.toBeInTheDocument();

    const user = userEvent.setup();
    const autoTriggerToggle = within(secondItem).getByRole('checkbox', { name: '自动触发:翻译' });
    expect(autoTriggerToggle).toBeChecked();
    await user.click(autoTriggerToggle);
    expect(within(secondItem).getByRole('checkbox', { name: '自动触发:翻译' })).not.toBeChecked();

    await user.click(within(secondItem).getByTestId('quick-input-summary-quick-2'));
    expect(within(firstItem).queryByLabelText('快捷输入名称')).not.toBeInTheDocument();
    expect(within(secondItem).getByLabelText('快捷输入名称')).toHaveValue('翻译');
  });
});
