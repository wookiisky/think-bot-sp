import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import {
  ASSISTANT_MARKDOWN_DISPLAY_PRESETS,
  MAX_ASSISTANT_MARKDOWN_FONT_SIZE,
  MIN_ASSISTANT_MARKDOWN_FONT_SIZE,
  type AssistantMarkdownDisplayConfig,
} from '../../domain/config/assistant-markdown-display-config';
import type { ExtensionConfig } from '../../domain/config/config-schema';

type DisplayFieldKey = keyof AssistantMarkdownDisplayConfig;

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

const displayFields: Array<{ key: DisplayFieldKey; labelKey: string }> = [
  { key: 'h1', labelKey: 'settings.assistantMarkdownH1' },
  { key: 'h2', labelKey: 'settings.assistantMarkdownH2' },
  { key: 'h3', labelKey: 'settings.assistantMarkdownH3' },
  { key: 'h4', labelKey: 'settings.assistantMarkdownH4' },
  { key: 'body', labelKey: 'settings.assistantMarkdownBody' },
];

/** 把下划线布尔值映射为文本装饰。 */
const resolveTextDecoration = (underline: boolean) => (underline ? 'underline' : 'none');

/** 展示配置面板。 */
export const DisplaySettingsPanel = ({ config, disabled, onChange, t }: DisplaySettingsPanelProps) => {
  const assistantMarkdown = config.display.assistantMarkdown;

  const updateAssistantMarkdown = (
    key: DisplayFieldKey,
    patch: Partial<AssistantMarkdownDisplayConfig[DisplayFieldKey]>,
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

  const applyPreset = (preset: AssistantMarkdownDisplayConfig) => {
    onChange({
      ...config,
      display: {
        ...config.display,
        assistantMarkdown: preset,
      },
    });
  };

  return (
    <section
      id="settings-panel-display"
      role="tabpanel"
      aria-labelledby="settings-tab-display"
      className="grid gap-4"
    >
      <Card size="sm" className="rounded-[26px] bg-card py-0 ring-1 ring-foreground/8">
        <CardHeader className="gap-1.5 border-b border-border/70 px-4 py-3">
          <CardTitle className="text-base">{t('settings.display')}</CardTitle>
          <CardDescription>{t('settings.displayDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3.5 px-4 py-4">
          <div className="flex flex-wrap gap-2">
            {ASSISTANT_MARKDOWN_DISPLAY_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => applyPreset(preset.config)}
              >
                {t(preset.labelKey)}
              </Button>
            ))}
          </div>

          <div className="grid gap-3">
            {displayFields.map((field) => {
              const styleConfig = assistantMarkdown[field.key];
              const label = t(field.labelKey);

              return (
                <article key={field.key} className="grid gap-2.5 rounded-2xl border border-border/70 bg-muted/25 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="grid gap-1">
                      <h3 className="m-0 text-sm font-medium">{label}</h3>
                      <p className="m-0 text-xs text-muted-foreground">{t('settings.displayFieldDescription')}</p>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        aria-label={`${label}${t('settings.displayUnderline')}`}
                        type="checkbox"
                        checked={styleConfig.underline}
                        disabled={disabled}
                        onChange={(event) => updateAssistantMarkdown(field.key, { underline: event.target.checked })}
                      />
                      <span>{t('settings.displayUnderline')}</span>
                    </label>
                  </div>

                  <div className="grid gap-3 md:grid-cols-[140px_140px_minmax(0,1fr)]">
                    <label className="grid gap-1.5">
                      <span className="text-sm font-medium">{t('settings.displayFontSize')}</span>
                      <Input
                        aria-label={`${label}${t('settings.displayFontSize')}`}
                        type="number"
                        min={MIN_ASSISTANT_MARKDOWN_FONT_SIZE}
                        max={MAX_ASSISTANT_MARKDOWN_FONT_SIZE}
                        step={1}
                        value={styleConfig.fontSizePx}
                        disabled={disabled}
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
                    </label>

                    <label className="grid gap-1.5">
                      <span className="text-sm font-medium">{t('settings.displayColor')}</span>
                      <Input
                        aria-label={`${label}${t('settings.displayColor')}`}
                        type="color"
                        value={styleConfig.color}
                        disabled={disabled}
                        className="h-9"
                        onChange={(event) => updateAssistantMarkdown(field.key, { color: event.target.value })}
                      />
                    </label>

                    <div className="grid gap-1.5">
                      <span className="text-sm font-medium">{t('settings.displayPreview')}</span>
                      <div className="rounded-xl border border-border/70 bg-background px-3 py-2.5">
                        <span
                          style={{
                            fontSize: `${styleConfig.fontSizePx}px`,
                            color: styleConfig.color,
                            textDecoration: resolveTextDecoration(styleConfig.underline),
                            fontWeight: field.key === 'body' ? 400 : 600,
                          }}
                        >
                          {field.key === 'body' ? t('settings.displayPreviewBody') : label}
                        </span>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card size="sm" className="rounded-[26px] bg-card py-0 ring-1 ring-foreground/8">
        <CardHeader className="gap-1.5 border-b border-border/70 px-4 py-3">
          <CardTitle className="text-base">{t('settings.displaySampleTitle')}</CardTitle>
          <CardDescription>{t('settings.displaySampleDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 px-4 py-4">
          <h1
            className="m-0 font-semibold"
            style={{
              fontSize: `${assistantMarkdown.h1.fontSizePx}px`,
              color: assistantMarkdown.h1.color,
              textDecoration: resolveTextDecoration(assistantMarkdown.h1.underline),
            }}
          >
            {t('settings.assistantMarkdownH1')}
          </h1>
          <h2
            className="m-0 font-semibold"
            style={{
              fontSize: `${assistantMarkdown.h2.fontSizePx}px`,
              color: assistantMarkdown.h2.color,
              textDecoration: resolveTextDecoration(assistantMarkdown.h2.underline),
            }}
          >
            {t('settings.assistantMarkdownH2')}
          </h2>
          <h3
            className="m-0 font-semibold"
            style={{
              fontSize: `${assistantMarkdown.h3.fontSizePx}px`,
              color: assistantMarkdown.h3.color,
              textDecoration: resolveTextDecoration(assistantMarkdown.h3.underline),
            }}
          >
            {t('settings.assistantMarkdownH3')}
          </h3>
          <h4
            className="m-0 font-semibold"
            style={{
              fontSize: `${assistantMarkdown.h4.fontSizePx}px`,
              color: assistantMarkdown.h4.color,
              textDecoration: resolveTextDecoration(assistantMarkdown.h4.underline),
            }}
          >
            {t('settings.assistantMarkdownH4')}
          </h4>
          <p
            className="m-0"
            style={{
              fontSize: `${assistantMarkdown.body.fontSizePx}px`,
              color: assistantMarkdown.body.color,
              textDecoration: resolveTextDecoration(assistantMarkdown.body.underline),
            }}
          >
            {t('settings.displayPreviewBody')}
          </p>
        </CardContent>
      </Card>
    </section>
  );
};
