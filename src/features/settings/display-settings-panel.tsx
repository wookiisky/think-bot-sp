import type { CSSProperties } from 'react';

import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import {
  ASSISTANT_MARKDOWN_DISPLAY_PRESETS,
  MAX_ASSISTANT_BRANCH_COLUMN_WIDTH,
  MAX_ASSISTANT_MARKDOWN_FONT_SIZE,
  MIN_ASSISTANT_BRANCH_COLUMN_WIDTH,
  MIN_ASSISTANT_MARKDOWN_FONT_SIZE,
  type AssistantMarkdownDisplayConfig,
  type AssistantMarkdownTextStyle,
} from '../../domain/config/assistant-markdown-display-config';
import type { ExtensionConfig } from '../../domain/config/config-schema';
import { COMPACT_CARD_CONTENT_CLASS, COMPACT_CARD_HEADER_CLASS, COMPACT_SECTION_CLASS } from '../../ui/compact-layout';

/** 拥有字号 / 颜色 / 下划线完整控制的层级。 */
type DisplayTextFieldKey = Exclude<keyof AssistantMarkdownDisplayConfig, 'strong'>;

type DisplaySettingsPanelProps = {
  /** 当前草稿配置。 */
  config: ExtensionConfig;
  /** 是否禁用交互。 */
  disabled: boolean;
  /** 配置变更回调。 */
  onChange(nextConfig: ExtensionConfig): void;
  /** 文案翻译函数。 */
  t(key: string): string;
};

/** 完整样式层级的展示顺序，同时决定预设色块和预览的顺序。 */
const displayTextFields: Array<{ key: DisplayTextFieldKey; labelKey: string }> = [
  { key: 'h1', labelKey: 'settings.assistantMarkdownH1' },
  { key: 'h2', labelKey: 'settings.assistantMarkdownH2' },
  { key: 'h3', labelKey: 'settings.assistantMarkdownH3' },
  { key: 'h4', labelKey: 'settings.assistantMarkdownH4' },
  { key: 'body', labelKey: 'settings.assistantMarkdownBody' },
  { key: 'list', labelKey: 'settings.assistantMarkdownList' },
];

/** 预设按钮前的色块只展示四级标题色。 */
const presetSwatchKeys = ['h1', 'h2', 'h3', 'h4'] as const;

/** 配置表格的列宽：层级名 / 字号 / 颜色 / 下划线。 */
const displayGridRowClass = 'grid grid-cols-[4.5rem_4rem_3rem_1fr] items-center gap-x-3 px-2 py-1';

/** 把下划线布尔值映射为文本装饰。 */
const resolveTextDecoration = (underline: boolean) => (underline ? 'underline' : 'none');

/** 生成预览元素的行内样式。 */
const createSampleStyle = (styleConfig: AssistantMarkdownTextStyle): CSSProperties => ({
  fontSize: `${styleConfig.fontSizePx}px`,
  color: styleConfig.color,
  textDecoration: resolveTextDecoration(styleConfig.underline),
});

/** 展示配置面板。 */
export const DisplaySettingsPanel = ({ config, disabled, onChange, t }: DisplaySettingsPanelProps) => {
  const assistantMarkdown = config.display.assistantMarkdown;
  const strongLabel = t('settings.assistantMarkdownStrong');

  const updateAssistantMarkdown = <Key extends keyof AssistantMarkdownDisplayConfig>(
    key: Key,
    patch: Partial<AssistantMarkdownDisplayConfig[Key]>,
  ) => {
    onChange({
      ...config,
      display: {
        ...config.display,
        assistantMarkdown: {
          ...assistantMarkdown,
          [key]: {
            ...assistantMarkdown[key],
            ...patch,
          },
        },
      },
    });
  };

  /** 更新分支阅读列最小宽度，超出区间时按边界收敛。 */
  const updateAssistantBranchColumnWidth = (value: number) => {
    onChange({
      ...config,
      display: {
        ...config.display,
        assistantBranchColumnWidth: Math.min(
          MAX_ASSISTANT_BRANCH_COLUMN_WIDTH,
          Math.max(MIN_ASSISTANT_BRANCH_COLUMN_WIDTH, value),
        ),
      },
    });
  };

  /** 预设只覆盖各层级颜色（含粗体），保留用户调整过的字号和下划线。 */
  const applyPreset = (preset: AssistantMarkdownDisplayConfig) => {
    const nextAssistantMarkdown = displayTextFields.reduce(
      (acc, field) => {
        acc[field.key] = {
          ...assistantMarkdown[field.key],
          color: preset[field.key].color,
        };
        return acc;
      },
      { strong: { ...assistantMarkdown.strong, color: preset.strong.color } } as AssistantMarkdownDisplayConfig,
    );

    onChange({
      ...config,
      display: {
        ...config.display,
        assistantMarkdown: nextAssistantMarkdown,
      },
    });
  };

  const renderColorInput = (label: string, key: keyof AssistantMarkdownDisplayConfig, color: string) => (
    <Input
      aria-label={`${label}${t('settings.displayColor')}`}
      type="color"
      value={color}
      disabled={disabled}
      className="h-7 w-10 p-0.5"
      onChange={(event) => updateAssistantMarkdown(key, { color: event.target.value })}
    />
  );

  return (
    <section
      id="settings-panel-display"
      role="tabpanel"
      aria-labelledby="settings-tab-display"
      className={COMPACT_SECTION_CLASS}
    >
      <Card size="sm">
        <CardHeader className={COMPACT_CARD_HEADER_CLASS}>
          <CardTitle className="text-base">{t('settings.display')}</CardTitle>
          <CardDescription>{t('settings.displayDescription')}</CardDescription>
        </CardHeader>
        <CardContent className={COMPACT_CARD_CONTENT_CLASS}>
          <div className="flex flex-wrap gap-1">
            {ASSISTANT_MARKDOWN_DISPLAY_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                className="gap-1.5"
                onClick={() => applyPreset(preset.config)}
              >
                <span aria-hidden="true" className="flex gap-0.5">
                  {presetSwatchKeys.map((key) => (
                    <span
                      key={key}
                      className="inline-block size-2 rounded-sm"
                      style={{ backgroundColor: preset.config[key].color }}
                    />
                  ))}
                </span>
                {t(preset.labelKey)}
              </Button>
            ))}
          </div>

          <div className="divide-y divide-border/70 border border-border/70">
            <div className={`${displayGridRowClass} bg-muted/35 text-[11px] text-muted-foreground`}>
              <span />
              <span>{t('settings.displayFontSize')}</span>
              <span>{t('settings.displayColor')}</span>
              <span>{t('settings.displayUnderline')}</span>
            </div>

            {displayTextFields.map((field) => {
              const styleConfig = assistantMarkdown[field.key];
              const label = t(field.labelKey);

              return (
                <div key={field.key} className={displayGridRowClass}>
                  <span className="text-xs font-medium">{label}</span>

                  <Input
                    aria-label={`${label}${t('settings.displayFontSize')}`}
                    type="number"
                    min={MIN_ASSISTANT_MARKDOWN_FONT_SIZE}
                    max={MAX_ASSISTANT_MARKDOWN_FONT_SIZE}
                    step={1}
                    value={styleConfig.fontSizePx}
                    disabled={disabled}
                    className="h-7 w-14"
                    onChange={(event) => {
                      const value = Number.parseInt(event.target.value, 10);
                      if (Number.isNaN(value)) {
                        return;
                      }

                      updateAssistantMarkdown(field.key, {
                        fontSizePx: Math.min(MAX_ASSISTANT_MARKDOWN_FONT_SIZE, Math.max(MIN_ASSISTANT_MARKDOWN_FONT_SIZE, value)),
                      });
                    }}
                  />

                  {renderColorInput(label, field.key, styleConfig.color)}

                  <input
                    aria-label={`${label}${t('settings.displayUnderline')}`}
                    type="checkbox"
                    checked={styleConfig.underline}
                    disabled={disabled}
                    className="justify-self-start"
                    onChange={(event) => updateAssistantMarkdown(field.key, { underline: event.target.checked })}
                  />
                </div>
              );
            })}

            <div className={displayGridRowClass}>
              <span className="text-xs font-medium">{strongLabel}</span>
              <span />
              {renderColorInput(strongLabel, 'strong', assistantMarkdown.strong.color)}
              <span />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-medium">{t('settings.assistantBranchColumnWidth')}</span>
            <Input
              aria-label={t('settings.assistantBranchColumnWidth')}
              type="number"
              min={MIN_ASSISTANT_BRANCH_COLUMN_WIDTH}
              max={MAX_ASSISTANT_BRANCH_COLUMN_WIDTH}
              step={10}
              value={config.display.assistantBranchColumnWidth}
              disabled={disabled}
              className="h-7 w-20"
              onChange={(event) => {
                const value = Number.parseInt(event.target.value, 10);
                if (Number.isNaN(value)) {
                  return;
                }

                updateAssistantBranchColumnWidth(value);
              }}
            />
            <span className="text-[11px] text-muted-foreground">{t('settings.assistantBranchColumnWidthHint')}</span>
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader className={COMPACT_CARD_HEADER_CLASS}>
          <CardTitle className="text-base">{t('settings.displaySampleTitle')}</CardTitle>
          <CardDescription>{t('settings.displaySampleDescription')}</CardDescription>
        </CardHeader>
        <CardContent className={COMPACT_CARD_CONTENT_CLASS}>
          <h1 className="m-0 font-semibold" style={createSampleStyle(assistantMarkdown.h1)}>
            {t('settings.assistantMarkdownH1')}
          </h1>
          <h2 className="m-0 font-semibold" style={createSampleStyle(assistantMarkdown.h2)}>
            {t('settings.assistantMarkdownH2')}
          </h2>
          <h3 className="m-0 font-semibold" style={createSampleStyle(assistantMarkdown.h3)}>
            {t('settings.assistantMarkdownH3')}
          </h3>
          <h4 className="m-0 font-semibold" style={createSampleStyle(assistantMarkdown.h4)}>
            {t('settings.assistantMarkdownH4')}
          </h4>
          <p className="m-0" style={createSampleStyle(assistantMarkdown.body)}>
            {t('settings.displayPreviewBody')}
            <strong style={{ color: assistantMarkdown.strong.color }}>{t('settings.displayPreviewStrong')}</strong>
          </p>
          <ul className="m-0 list-disc pl-4.5" style={createSampleStyle(assistantMarkdown.list)}>
            <li>{t('settings.displayPreviewListFirst')}</li>
            <li>{t('settings.displayPreviewListSecond')}</li>
          </ul>
        </CardContent>
      </Card>
    </section>
  );
};
