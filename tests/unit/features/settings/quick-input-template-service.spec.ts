import { describe, expect, it, vi } from 'vitest';

import { createDefaultConfig } from '../../../../src/domain/config/config-schema';
import {
  DEFAULT_QUICK_INPUT_TEMPLATE_URL,
  appendQuickInputTemplates,
  fetchQuickInputTemplates,
  parseQuickInputTemplateDocument,
} from '../../../../src/features/settings/quick-input-template-service';

describe('quick-input-template-service', () => {
  it('支持解析数组和对象两种模板文档格式', () => {
    expect(
      parseQuickInputTemplateDocument(
        JSON.stringify([
          {
            name: '总结',
            prompt: '请总结当前页面',
          },
        ]),
      ),
    ).toHaveLength(1);

    expect(
      parseQuickInputTemplateDocument(
        JSON.stringify({
          quickInputs: [
            {
              name: '翻译',
              prompt: '请翻译当前页面',
            },
          ],
        }),
      ),
    ).toHaveLength(1);
  });

  it('支持解析远端默认模板格式', () => {
    expect(
      parseQuickInputTemplateDocument(
        JSON.stringify({
          quickInputs: [
            {
              id: 'default_summarize',
              displayText: '概括',
              sendText: '使用一句话概括Page Content内容',
              autoTrigger: false,
              branchModelIds: ['model-1'],
            },
          ],
        }),
      ),
    ).toEqual([
      {
        name: '概括',
        prompt: '使用一句话概括Page Content内容',
        autoTrigger: false,
        modelId: null,
        parallelModelIds: ['model-1'],
      },
    ]);
  });

  it('导入时会过滤重复项和失效模型引用', () => {
    const config = createDefaultConfig({
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
      ],
    });

    const result = appendQuickInputTemplates({
      config,
      templates: [
        {
          name: '总结',
          prompt: '请总结当前页面',
          autoTrigger: false,
          modelId: 'missing-model',
          parallelModelIds: ['missing-model'],
        },
        {
          name: '问题拆解',
          prompt: '请先拆解问题再回答',
          autoTrigger: true,
          modelId: 'missing-model',
          parallelModelIds: ['model-1', 'missing-model'],
        },
      ],
      now: () => 123,
    });

    expect(result.importedCount).toBe(1);
    expect(result.config.quickInputs.at(-1)).toEqual(
      expect.objectContaining({
        id: 'quick-import-123-1',
        name: '问题拆解',
        autoTrigger: true,
        modelId: null,
        parallelModelIds: ['model-1'],
      }),
    );
  });

  it('拉取远端模板失败时直接抛错', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    await expect(fetchQuickInputTemplates({ fetcher })).rejects.toThrow(/404/);
  });

  it('拉取模板时支持覆盖远端地址', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          quickInputs: [
            {
              displayText: '翻译',
              sendText: '请翻译当前页面',
            },
          ],
        }),
    });

    await expect(fetchQuickInputTemplates({ fetcher, url: 'https://example.com/custom-tabs.json' })).resolves.toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith('https://example.com/custom-tabs.json');
    expect(DEFAULT_QUICK_INPUT_TEMPLATE_URL).toBe(
      'https://raw.githubusercontent.com/wookiisky/think-bot/refs/heads/main/quick_input_tabs.json',
    );
  });
});
