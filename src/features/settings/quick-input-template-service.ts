import { z } from 'zod';

import { getEnabledCompleteModels, sanitizeBranchModelIds } from '../../domain/config/config-schema';
import type { ExtensionConfig } from '../../domain/config/config-schema';

/** 默认远端快捷输入模板地址。 */
export const DEFAULT_QUICK_INPUT_TEMPLATE_URL =
  'https://raw.githubusercontent.com/wookiisky/think-bot-sp/main/quick_input_tabs.json';

const quickInputTemplateItemSchema = z.object({
  name: z.string().min(1),
  prompt: z.string().min(1),
  autoTrigger: z.boolean().default(false),
  modelId: z.string().min(1).nullable().default(null),
  branchModelIds: z.array(z.string().min(1)).default([]),
});

const quickInputTemplateDocumentSchema = z.union([
  z.array(quickInputTemplateItemSchema),
  z.object({
    quickInputs: z.array(quickInputTemplateItemSchema),
  }),
  z.object({
    items: z.array(quickInputTemplateItemSchema),
  }),
]);

type QuickInputTemplateItem = z.infer<typeof quickInputTemplateItemSchema>;

/** 解析远端模板文档。 */
export const parseQuickInputTemplateDocument = (payload: string): QuickInputTemplateItem[] => {
  const parsed = quickInputTemplateDocumentSchema.parse(JSON.parse(payload));
  if (Array.isArray(parsed)) {
    return parsed;
  }

  return 'quickInputs' in parsed ? parsed.quickInputs : parsed.items;
};

/** 拉取远端快捷输入模板。 */
export const fetchQuickInputTemplates = async ({
  fetcher = fetch,
  url = DEFAULT_QUICK_INPUT_TEMPLATE_URL,
}: {
  /** 可注入 fetch，便于测试。 */
  fetcher?: typeof fetch;
  /** 远端模板地址。 */
  url?: string;
} = {}): Promise<QuickInputTemplateItem[]> => {
  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(`quick input template request failed: ${response.status}`);
  }

  return parseQuickInputTemplateDocument(await response.text());
};

/** 追加导入远端模板，并过滤无效模型引用与重复项。 */
export const appendQuickInputTemplates = ({
  config,
  templates,
  now = () => Date.now(),
}: {
  /** 当前草稿配置。 */
  config: ExtensionConfig;
  /** 待导入模板。 */
  templates: QuickInputTemplateItem[];
  /** 当前时间。 */
  now?: () => number;
}) => {
  const enabledModelIds = new Set(getEnabledCompleteModels(config).map((model) => model.id));
  const existingTemplateKeys = new Set(
    config.quickInputs
      .filter((item) => item.deletedAt === null)
      .map((item) => `${item.name}\n${item.prompt}`),
  );
  const batchId = now();
  let nextOrder = config.quickInputs.reduce((max, item) => Math.max(max, item.order), -1) + 1;

  const importedQuickInputs = templates.flatMap((template, index) => {
    const templateKey = `${template.name}\n${template.prompt}`;
    if (existingTemplateKeys.has(templateKey)) {
      return [];
    }

    existingTemplateKeys.add(templateKey);
    return [
      {
        id: `quick-import-${batchId}-${index}`,
        name: template.name,
        prompt: template.prompt,
        autoTrigger: template.autoTrigger,
        modelId: template.modelId && enabledModelIds.has(template.modelId) ? template.modelId : null,
        branchModelIds: sanitizeBranchModelIds(config, template.branchModelIds),
        order: nextOrder++,
        deletedAt: null,
      },
    ];
  });

  return {
    config: {
      ...config,
      quickInputs: [...config.quickInputs, ...importedQuickInputs],
    },
    importedCount: importedQuickInputs.length,
  };
};
