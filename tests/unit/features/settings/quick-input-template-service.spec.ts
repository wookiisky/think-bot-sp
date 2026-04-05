import { describe, expect, it, vi } from 'vitest';

import { createDefaultConfig } from '../../../../src/domain/config/config-schema';
import {
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
          branchModelIds: [],
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
          branchModelIds: ['missing-model'],
        },
        {
          name: '问题拆解',
          prompt: '请先拆解问题再回答',
          autoTrigger: true,
          modelId: 'missing-model',
          branchModelIds: ['model-1', 'missing-model'],
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
        branchModelIds: ['model-1'],
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
});
