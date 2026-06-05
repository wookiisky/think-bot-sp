import { cleanup, render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_EXTRACTION_TEXT_FONT_SIZE,
  DEFAULT_LLM_REQUEST_TIMEOUT_SECONDS,
  MAX_EXTRACTION_PANEL_HEIGHT,
  MAX_EXTRACTION_TEXT_FONT_SIZE,
  MAX_LLM_REQUEST_TIMEOUT_SECONDS,
  MIN_EXTRACTION_PANEL_HEIGHT,
  MIN_EXTRACTION_TEXT_FONT_SIZE,
  MIN_LLM_REQUEST_TIMEOUT_SECONDS,
  createDefaultConfig,
} from '../../../src/domain/config/config-schema';
import { BasicSettingsPanel } from '../../../src/features/settings/basic-settings-panel';

const t = (key: string) =>
  ({
    'settings.basic': '基础设置',
    'settings.basicDescription': '说明',
    'settings.language': '语言',
    'settings.theme': '主题',
    'settings.defaultModel': '默认模型',
    'settings.noDefaultModel': '不设置默认模型',
    'settings.branchModels': '并行模型',
    'settings.multiSelectPlaceholder': '请选择',
    'settings.multiSelectSummary': '{count} 个已选',
    'settings.noBranchModels': '暂无可用并行模型',
    'settings.branchModelsDescription': '为全部快捷输入配置默认并行模型，触发时会与主模型一起执行。',
    'settings.branchModelsMissing': '部分并行模型引用已失效，保存时会自动清理。',
    'settings.savedPages': '总保存页面数',
    'settings.cacheSize': '总大小',
    'settings.extractionMethod': '默认提取方式',
    'settings.extractionPanelHeight': '默认提取区高度',
    'settings.llmRequestTimeoutSeconds': '大模型调用超时',
    'settings.extractionTextFontSize': '提取区文本字体大小',
    'settings.extractionTextFontSizePreview': '示例文本',
    'settings.extractionTextFontSizeMin': '最小',
    'settings.extractionTextFontSizeMax': '最大',
    'settings.jinaApiKey': 'Jina API Key',
    'settings.jinaResponseTemplate': 'Jina 响应模板',
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
      cacheStats={{ pageCount: 1, entryCount: 1, bytes: 16 }}
      disabled={false}
      onChange={setConfig}
      onClearCache={() => undefined}
      t={t}
    />
  );
};

describe('BasicSettingsPanel', () => {
  afterEach(() => cleanup());

  it('支持通过多选下拉选择并行模型', async () => {
    render(<ControlledBasicSettingsPanel />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '并行模型' }));
    await user.click(screen.getByRole('checkbox', { name: '并行模型:主模型' }));
    await user.click(screen.getByRole('checkbox', { name: '并行模型:备用模型' }));

    expect(screen.getByRole('checkbox', { name: '并行模型:主模型' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '并行模型:备用模型' })).toBeChecked();
    expect(screen.queryByText('为全部快捷输入配置默认并行模型，触发时会与主模型一起执行。')).not.toBeInTheDocument();
  });

  it('存在失效全局并行模型引用时显示降级提示', () => {
    render(
      <ControlledBasicSettingsPanel
        config={createDefaultConfig({
          basic: {
            ...createDefaultConfig().basic,
            parallelModelIds: ['missing-model'],
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

    expect(screen.getByText('部分并行模型引用已失效，保存时会自动清理。')).toBeInTheDocument();
  });

  it('支持编辑提取和调用超时默认参数并限制范围', async () => {
    render(<ControlledBasicSettingsPanel />);

    const user = userEvent.setup();
    const heightInput = screen.getByRole('spinbutton', { name: '默认提取区高度' });
    const timeoutInput = screen.getByRole('spinbutton', { name: '大模型调用超时' });
    const fontSizeSlider = screen.getByRole('slider', { name: '提取区文本字体大小' });
    const fontSizePreview = screen.getByText('示例文本');
    const jinaApiKeyInput = screen.getByLabelText('Jina API Key');
    const jinaTemplateInput = screen.getByLabelText('Jina 响应模板');

    expect(fontSizeSlider).toHaveValue(String(DEFAULT_EXTRACTION_TEXT_FONT_SIZE));
    expect(timeoutInput).toHaveValue(DEFAULT_LLM_REQUEST_TIMEOUT_SECONDS);
    expect(fontSizePreview).toHaveClass('text-base', 'leading-7');
    expect(screen.getByText('最小')).toBeInTheDocument();
    expect(screen.getByText('最大')).toBeInTheDocument();

    fireEvent.change(heightInput, { target: { value: '999' } });
    fireEvent.change(timeoutInput, { target: { value: '9999' } });
    fireEvent.change(fontSizeSlider, { target: { value: '999' } });
    await user.clear(jinaApiKeyInput);
    await user.type(jinaApiKeyInput, 'jina-secret');
    fireEvent.change(jinaTemplateInput, { target: { value: '包装{{content}}' } });

    expect(heightInput).toHaveValue(MAX_EXTRACTION_PANEL_HEIGHT);
    expect(timeoutInput).toHaveValue(MAX_LLM_REQUEST_TIMEOUT_SECONDS);
    expect(fontSizeSlider).toHaveValue(String(MAX_EXTRACTION_TEXT_FONT_SIZE));
    expect(fontSizePreview).toHaveClass('text-2xl', 'leading-10');
    expect(jinaApiKeyInput).toHaveValue('jina-secret');
    expect(jinaTemplateInput).toHaveValue('包装{{content}}');

    fireEvent.change(heightInput, { target: { value: '1' } });
    fireEvent.change(timeoutInput, { target: { value: '0' } });
    fireEvent.change(fontSizeSlider, { target: { value: '0' } });

    expect(heightInput).toHaveValue(MIN_EXTRACTION_PANEL_HEIGHT);
    expect(timeoutInput).toHaveValue(MIN_LLM_REQUEST_TIMEOUT_SECONDS);
    expect(fontSizeSlider).toHaveValue(String(MIN_EXTRACTION_TEXT_FONT_SIZE));
    expect(fontSizePreview).toHaveClass('text-xs', 'leading-5');
  });
});
