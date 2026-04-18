import { z } from 'zod';

/** 助手 Markdown 字号最小值。 */
export const MIN_ASSISTANT_MARKDOWN_FONT_SIZE = 12;
/** 助手 Markdown 字号最大值。 */
export const MAX_ASSISTANT_MARKDOWN_FONT_SIZE = 48;

/** 单个 Markdown 文本层级样式。 */
export const assistantMarkdownTextStyleSchema = z.object({
  /** 字号，单位 px。 */
  fontSizePx: z.number().int().min(MIN_ASSISTANT_MARKDOWN_FONT_SIZE).max(MAX_ASSISTANT_MARKDOWN_FONT_SIZE),
  /** 文字颜色，仅允许十六进制颜色。 */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  /** 是否显示下划线。 */
  underline: z.boolean(),
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
});

export type AssistantMarkdownTextStyle = z.infer<typeof assistantMarkdownTextStyleSchema>;
export type AssistantMarkdownDisplayConfig = z.infer<typeof assistantMarkdownDisplayConfigSchema>;

/** 深蓝到浅蓝的默认展示方案。 */
const assistantMarkdownBluePreset = {
  h1: { fontSizePx: 18, color: '#1d4ed8', underline: false },
  h2: { fontSizePx: 18, color: '#2563eb', underline: false },
  h3: { fontSizePx: 16, color: '#3b82f6', underline: false },
  h4: { fontSizePx: 14, color: '#60a5fa', underline: false },
  body: { fontSizePx: 14, color: '#111827', underline: false },
} satisfies z.input<typeof assistantMarkdownDisplayConfigSchema>;

/** 深橙到浅橙的默认展示方案。 */
const assistantMarkdownOrangePreset = {
  h1: { fontSizePx: 18, color: '#c2410c', underline: false },
  h2: { fontSizePx: 18, color: '#ea580c', underline: false },
  h3: { fontSizePx: 16, color: '#f97316', underline: false },
  h4: { fontSizePx: 14, color: '#fb923c', underline: false },
  body: { fontSizePx: 14, color: '#111827', underline: false },
} satisfies z.input<typeof assistantMarkdownDisplayConfigSchema>;

/** 多彩分级的默认展示方案。 */
const assistantMarkdownRainbowPreset = {
  h1: { fontSizePx: 18, color: '#dc2626', underline: false },
  h2: { fontSizePx: 18, color: '#ea580c', underline: false },
  h3: { fontSizePx: 16, color: '#16a34a', underline: false },
  h4: { fontSizePx: 14, color: '#2563eb', underline: false },
  body: { fontSizePx: 14, color: '#111827', underline: false },
} satisfies z.input<typeof assistantMarkdownDisplayConfigSchema>;

/** 默认助手 Markdown 展示配置，直接复用预设 1。 */
export const DEFAULT_ASSISTANT_MARKDOWN_DISPLAY_CONFIG =
  assistantMarkdownDisplayConfigSchema.parse(assistantMarkdownBluePreset);

/** 展示配置面板可用的内置方案。 */
export const ASSISTANT_MARKDOWN_DISPLAY_PRESETS = [
  {
    id: 'preset-1',
    labelKey: 'settings.displayPreset1',
    config: assistantMarkdownDisplayConfigSchema.parse(assistantMarkdownBluePreset),
  },
  {
    id: 'preset-2',
    labelKey: 'settings.displayPreset2',
    config: assistantMarkdownDisplayConfigSchema.parse(assistantMarkdownOrangePreset),
  },
  {
    id: 'preset-3',
    labelKey: 'settings.displayPreset3',
    config: assistantMarkdownDisplayConfigSchema.parse(assistantMarkdownRainbowPreset),
  },
] as const;

/** 展示配置顶层 schema。 */
export const displayConfigSchema = z.object({
  /** 助手消息 Markdown 展示配置。 */
  assistantMarkdown: assistantMarkdownDisplayConfigSchema,
});

export type DisplayConfig = z.infer<typeof displayConfigSchema>;

/** 默认展示配置。 */
export const DEFAULT_DISPLAY_CONFIG = {
  assistantMarkdown: assistantMarkdownDisplayConfigSchema.parse(DEFAULT_ASSISTANT_MARKDOWN_DISPLAY_CONFIG),
} satisfies z.input<typeof displayConfigSchema>;

/** 用默认值补齐不完整的展示配置。 */
export const fillDisplayConfigDefaults = (input?: Partial<DisplayConfig> | null): DisplayConfig => {
  const assistantMarkdown = input?.assistantMarkdown;

  return displayConfigSchema.parse({
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
    },
  });
};
