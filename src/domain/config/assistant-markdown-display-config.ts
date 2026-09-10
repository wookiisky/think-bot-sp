import { z } from 'zod';

/** 助手 Markdown 字号最小值。 */
export const MIN_ASSISTANT_MARKDOWN_FONT_SIZE = 12;
/** 助手 Markdown 字号最大值。 */
export const MAX_ASSISTANT_MARKDOWN_FONT_SIZE = 48;

/** 助手分支阅读列最小宽度的下限。 */
export const MIN_ASSISTANT_BRANCH_COLUMN_WIDTH = 160;
/** 助手分支阅读列最小宽度默认值。 */
export const DEFAULT_ASSISTANT_BRANCH_COLUMN_WIDTH = 300;
/** 助手分支阅读列最小宽度的上限。 */
export const MAX_ASSISTANT_BRANCH_COLUMN_WIDTH = 800;

/** 单个 Markdown 文本层级样式。 */
export const assistantMarkdownTextStyleSchema = z.object({
  /** 字号，单位 px。 */
  fontSizePx: z.number().int().min(MIN_ASSISTANT_MARKDOWN_FONT_SIZE).max(MAX_ASSISTANT_MARKDOWN_FONT_SIZE),
  /** 文字颜色，仅允许十六进制颜色。 */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  /** 是否显示下划线。 */
  underline: z.boolean(),
});

/** 粗体只控制颜色，字号和下划线跟随所在层级。 */
export const assistantMarkdownStrongStyleSchema = z.object({
  /** 粗体文字颜色，仅允许十六进制颜色。 */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

/** 助手 Markdown 展示配置。 */
export const assistantMarkdownDisplayConfigSchema = z.object({
  /** 一级标题样式。 */
  h1: assistantMarkdownTextStyleSchema,
  /** 二级标题样式。 */
  h2: assistantMarkdownTextStyleSchema,
  /** 三级标题样式。 */
  h3: assistantMarkdownTextStyleSchema,
  /** 四级标题样式。 */
  h4: assistantMarkdownTextStyleSchema,
  /** 正文样式。 */
  body: assistantMarkdownTextStyleSchema,
  /** 列表项样式，同时作用于有序和无序列表。 */
  list: assistantMarkdownTextStyleSchema,
  /** 正文粗体样式，只控制颜色；标题里的粗体跟随标题色。 */
  strong: assistantMarkdownStrongStyleSchema,
});

export type AssistantMarkdownTextStyle = z.infer<typeof assistantMarkdownTextStyleSchema>;
export type AssistantMarkdownStrongStyle = z.infer<typeof assistantMarkdownStrongStyleSchema>;
export type AssistantMarkdownDisplayConfig = z.infer<typeof assistantMarkdownDisplayConfigSchema>;

/** 助手 Markdown 正文默认样式，所有内置配色共用，列表项默认与正文一致。 */
const assistantMarkdownDefaultBody = { fontSizePx: 16, color: '#111827', underline: false };

/**
 * 按 h1 → h4 的四个标题色和一个正文粗体色生成一套展示方案。
 * 字号沿用统一的层级梯度，配色只负责颜色；粗体色取比标题更深的同系色，保证在正文里既醒目又不抢标题层级。
 */
const createAssistantMarkdownPreset = (
  headingColors: readonly [string, string, string, string],
  strongColor: string,
): z.input<typeof assistantMarkdownDisplayConfigSchema> => ({
  h1: { fontSizePx: 18, color: headingColors[0], underline: false },
  h2: { fontSizePx: 17, color: headingColors[1], underline: false },
  h3: { fontSizePx: 16, color: headingColors[2], underline: false },
  h4: { fontSizePx: 16, color: headingColors[3], underline: false },
  body: { ...assistantMarkdownDefaultBody },
  list: { ...assistantMarkdownDefaultBody },
  strong: { color: strongColor },
});

/** 深蓝到浅蓝的默认展示方案，粗体用纯黑保持正文克制。 */
const assistantMarkdownBluePreset = createAssistantMarkdownPreset(['#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa'], '#000000');

/** 深橙到浅橙的展示方案。 */
const assistantMarkdownOrangePreset = createAssistantMarkdownPreset(['#c2410c', '#ea580c', '#f97316', '#fb923c'], '#9a3412');

/** 深青到浅青的展示方案。 */
const assistantMarkdownTealPreset = createAssistantMarkdownPreset(['#0f766e', '#0d9488', '#14b8a6', '#2dd4bf'], '#115e59');

/** 石墨灰阶的展示方案，适合偏好低饱和标题的场景。 */
const assistantMarkdownGraphitePreset = createAssistantMarkdownPreset(['#1e293b', '#334155', '#475569', '#64748b'], '#0f172a');

/** 暖阳：红 → 橙 → 琥珀 → 黄，同为暖色但每级色相不同。 */
const assistantMarkdownSunsetPreset = createAssistantMarkdownPreset(['#b91c1c', '#ea580c', '#d97706', '#ca8a04'], '#991b1b');

/** 极光：靛 → 紫 → 青 → 翠，冷色系多色相。 */
const assistantMarkdownAuroraPreset = createAssistantMarkdownPreset(['#4338ca', '#7c3aed', '#0e7490', '#059669'], '#5b21b6');

/** 森林：棕 → 深绿 → 黄绿 → 青绿，大地色系多色相。 */
const assistantMarkdownForestPreset = createAssistantMarkdownPreset(['#713f12', '#166534', '#4d7c0f', '#0d9488'], '#14532d');

/** 莓果：玫红 → 品红 → 紫 → 靛，偏冷的莓果色多色相。 */
const assistantMarkdownBerryPreset = createAssistantMarkdownPreset(['#be123c', '#a21caf', '#7e22ce', '#4f46e5'], '#9f1239');

/** 默认助手 Markdown 展示配置，直接复用“蓝色”配色。 */
export const DEFAULT_ASSISTANT_MARKDOWN_DISPLAY_CONFIG =
  assistantMarkdownDisplayConfigSchema.parse(assistantMarkdownBluePreset);

/** 展示配置面板可用的内置配色，按钮顺序与此一致。 */
export const ASSISTANT_MARKDOWN_DISPLAY_PRESETS = [
  {
    id: 'blue',
    labelKey: 'settings.displayPresetBlue',
    config: assistantMarkdownDisplayConfigSchema.parse(assistantMarkdownBluePreset),
  },
  {
    id: 'orange',
    labelKey: 'settings.displayPresetOrange',
    config: assistantMarkdownDisplayConfigSchema.parse(assistantMarkdownOrangePreset),
  },
  {
    id: 'teal',
    labelKey: 'settings.displayPresetTeal',
    config: assistantMarkdownDisplayConfigSchema.parse(assistantMarkdownTealPreset),
  },
  {
    id: 'graphite',
    labelKey: 'settings.displayPresetGraphite',
    config: assistantMarkdownDisplayConfigSchema.parse(assistantMarkdownGraphitePreset),
  },
  {
    id: 'sunset',
    labelKey: 'settings.displayPresetSunset',
    config: assistantMarkdownDisplayConfigSchema.parse(assistantMarkdownSunsetPreset),
  },
  {
    id: 'aurora',
    labelKey: 'settings.displayPresetAurora',
    config: assistantMarkdownDisplayConfigSchema.parse(assistantMarkdownAuroraPreset),
  },
  {
    id: 'forest',
    labelKey: 'settings.displayPresetForest',
    config: assistantMarkdownDisplayConfigSchema.parse(assistantMarkdownForestPreset),
  },
  {
    id: 'berry',
    labelKey: 'settings.displayPresetBerry',
    config: assistantMarkdownDisplayConfigSchema.parse(assistantMarkdownBerryPreset),
  },
] as const;

/** 展示配置顶层 schema。 */
export const displayConfigSchema = z.object({
  /** 助手消息 Markdown 展示配置。 */
  assistantMarkdown: assistantMarkdownDisplayConfigSchema,
  /** 助手消息分支超过两个时，每列的最小宽度，单位 px。 */
  assistantBranchColumnWidth: z
    .number()
    .int()
    .min(MIN_ASSISTANT_BRANCH_COLUMN_WIDTH)
    .max(MAX_ASSISTANT_BRANCH_COLUMN_WIDTH)
    .default(DEFAULT_ASSISTANT_BRANCH_COLUMN_WIDTH),
});

export type DisplayConfig = z.infer<typeof displayConfigSchema>;

/** 默认展示配置。 */
export const DEFAULT_DISPLAY_CONFIG = {
  assistantMarkdown: assistantMarkdownDisplayConfigSchema.parse(DEFAULT_ASSISTANT_MARKDOWN_DISPLAY_CONFIG),
  assistantBranchColumnWidth: DEFAULT_ASSISTANT_BRANCH_COLUMN_WIDTH,
} satisfies z.input<typeof displayConfigSchema>;

/** 展示配置的宽松输入：整块、单个层级都可以缺省，缺省部分由默认值补齐。 */
export type PartialDisplayConfigInput = {
  /** 助手消息 Markdown 展示配置，可只提供部分层级。 */
  assistantMarkdown?: Partial<AssistantMarkdownDisplayConfig> | undefined;
  /** 助手消息分支阅读列的最小宽度，单位 px。 */
  assistantBranchColumnWidth?: number | undefined;
};

/** 用默认值补齐不完整的展示配置。 */
export const fillDisplayConfigDefaults = (input?: PartialDisplayConfigInput | null): DisplayConfig => {
  const assistantMarkdown = input?.assistantMarkdown;

  return displayConfigSchema.parse({
    assistantBranchColumnWidth: input?.assistantBranchColumnWidth ?? DEFAULT_ASSISTANT_BRANCH_COLUMN_WIDTH,
    assistantMarkdown: {
      h1: {
        ...DEFAULT_ASSISTANT_MARKDOWN_DISPLAY_CONFIG.h1,
        ...(assistantMarkdown?.h1 ?? {}),
      },
      h2: {
        ...DEFAULT_ASSISTANT_MARKDOWN_DISPLAY_CONFIG.h2,
        ...(assistantMarkdown?.h2 ?? {}),
      },
      h3: {
        ...DEFAULT_ASSISTANT_MARKDOWN_DISPLAY_CONFIG.h3,
        ...(assistantMarkdown?.h3 ?? {}),
      },
      h4: {
        ...DEFAULT_ASSISTANT_MARKDOWN_DISPLAY_CONFIG.h4,
        ...(assistantMarkdown?.h4 ?? {}),
      },
      body: {
        ...DEFAULT_ASSISTANT_MARKDOWN_DISPLAY_CONFIG.body,
        ...(assistantMarkdown?.body ?? {}),
      },
      list: {
        ...DEFAULT_ASSISTANT_MARKDOWN_DISPLAY_CONFIG.list,
        ...(assistantMarkdown?.list ?? {}),
      },
      strong: {
        ...DEFAULT_ASSISTANT_MARKDOWN_DISPLAY_CONFIG.strong,
        ...(assistantMarkdown?.strong ?? {}),
      },
    },
  });
};
