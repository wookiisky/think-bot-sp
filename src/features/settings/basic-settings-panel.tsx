import { MultiSelectPopover } from '../../components/ui/multi-select-popover';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import type { ExtensionConfig } from '../../domain/config/config-schema';
import type { ModelConfig } from '../../domain/config/config-schema';
import {
  MAX_EXTRACTION_PANEL_HEIGHT,
  MAX_EXTRACTION_TEXT_FONT_SIZE,
  MIN_EXTRACTION_PANEL_HEIGHT,
  MIN_EXTRACTION_TEXT_FONT_SIZE,
  sanitizeParallelModelIds,
} from '../../domain/config/config-schema';
import { getExtractionTextClassName } from '../../lib/extraction-text-font-size';
import { cn } from '../../lib/utils';

type CacheStats = {
  /** 本地缓存页面数。 */
  pageCount: number;
  /** 本地缓存条目数。 */
  entryCount: number;
  /** 本地缓存字节数。 */
  bytes: number;
};

type BasicSettingsPanelProps = {
  /** 当前草稿配置。 */
  config: ExtensionConfig;
  /** 默认模型候选。 */
  defaultModels: ModelConfig[];
  /** 本地缓存统计。 */
  cacheStats: CacheStats;
  /** 是否禁用交互。 */
  disabled: boolean;
  /** 配置变更回调。 */
  onChange(nextConfig: ExtensionConfig): void;
  /** 清理缓存动作。 */
  onClearCache(): void;
  /** 文案翻译函数。 */
  t(key: string): string;
};

/** 将缓存体积格式化成更易读的 B / KB / MB。 */
const formatCacheBytes = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    const value = bytes / 1024;
    return `${Number(value.toFixed(value >= 10 ? 0 : 1))} KB`;
  }

  const value = bytes / (1024 * 1024);
  return `${Number(value.toFixed(value >= 10 ? 0 : 1))} MB`;
};

/** 基础设置主面板。 */
export const BasicSettingsPanel = ({
  config,
  defaultModels,
  cacheStats,
  disabled,
  onChange,
  onClearCache,
  t,
}: BasicSettingsPanelProps) => {
  const parallelModelIds = sanitizeParallelModelIds(config, config.basic.parallelModelIds);
  const hasMissingParallelModels = parallelModelIds.length !== config.basic.parallelModelIds.length;
  const pageCount = cacheStats.pageCount ?? cacheStats.entryCount;
  const extractionTextClassName = getExtractionTextClassName(config.basic.extractionTextFontSize);

  const updateBasic = (patch: Partial<ExtensionConfig['basic']>) => {
    onChange({
      ...config,
      basic: {
        ...config.basic,
        ...patch,
      },
    });
  };

  return (
    <section
      id="settings-panel-basic"
      role="tabpanel"
      aria-labelledby="settings-tab-basic"
      className="grid gap-4"
    >
      <Card size="sm" className="rounded-[26px] bg-card py-0 ring-1 ring-foreground/8">
        <CardHeader className="gap-1.5 border-b border-border/70 px-4 py-3">
          <CardTitle className="text-base">{t('settings.basic')}</CardTitle>
          <CardDescription>{t('settings.basicDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3.5 px-4 py-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-sm font-medium">{t('settings.language')}</span>
              <Select
                value={config.basic.language}
                disabled={disabled}
                onValueChange={(value) => updateBasic({ language: value as ExtensionConfig['basic']['language'] })}
              >
                <SelectTrigger aria-label={t('settings.language')} size="sm" className="w-full">
                  <SelectValue placeholder={t('settings.language')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zh-CN">中文</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <label className="grid gap-1.5">
              <span className="text-sm font-medium">{t('settings.theme')}</span>
              <Select
                value={config.basic.theme}
                disabled={disabled}
                onValueChange={(value) => updateBasic({ theme: value as ExtensionConfig['basic']['theme'] })}
              >
                <SelectTrigger aria-label={t('settings.theme')} size="sm" className="w-full">
                  <SelectValue placeholder={t('settings.theme')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>

          <label className="grid gap-1.5">
            <span className="text-sm font-medium">{t('settings.defaultModel')}</span>
            <Select
              value={config.basic.defaultModelId ?? '__none__'}
              disabled={disabled}
              onValueChange={(value) => updateBasic({ defaultModelId: value === '__none__' ? null : value })}
            >
              <SelectTrigger aria-label={t('settings.defaultModel')} size="sm" className="w-full">
                <SelectValue placeholder={t('settings.defaultModel')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t('settings.noDefaultModel')}</SelectItem>
                {defaultModels.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="grid gap-1.5">
            <span className="text-sm font-medium">{t('settings.branchModels')}</span>
            <MultiSelectPopover
              label={t('settings.branchModels')}
              placeholder={t('settings.multiSelectPlaceholder')}
              summaryTemplate={t('settings.multiSelectSummary')}
              options={defaultModels.map((model) => ({
                value: model.id,
                label: model.name,
              }))}
              values={parallelModelIds}
              emptyText={t('settings.noBranchModels')}
              disabled={disabled}
              onChange={(nextValues) => updateBasic({ parallelModelIds: nextValues })}
            />
            {hasMissingParallelModels ? <p className="m-0 text-sm text-amber-700 dark:text-amber-300">{t('settings.branchModelsMissing')}</p> : null}
          </label>

          <label className="grid gap-1.5">
            <span className="text-sm font-medium">System Prompt</span>
            <Textarea
              aria-label="System Prompt"
              value={config.basic.systemPrompt}
              disabled={disabled}
              className="min-h-20"
              onChange={(event) => updateBasic({ systemPrompt: event.target.value })}
            />
          </label>

          <div className="grid gap-3 lg:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-sm font-medium">{t('settings.extractionMethod')}</span>
              <Select
                value={config.basic.extractionMethod}
                disabled={disabled}
                onValueChange={(value) =>
                  updateBasic({ extractionMethod: value as ExtensionConfig['basic']['extractionMethod'] })
                }
              >
                <SelectTrigger aria-label={t('settings.extractionMethod')} size="sm" className="w-full">
                  <SelectValue placeholder={t('settings.extractionMethod')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="readability">Readability</SelectItem>
                  <SelectItem value="jina">Jina</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <label className="grid gap-1.5">
              <span className="text-sm font-medium">{t('settings.extractionPanelHeight')}</span>
              <Input
                aria-label={t('settings.extractionPanelHeight')}
                type="number"
                min={MIN_EXTRACTION_PANEL_HEIGHT}
                max={MAX_EXTRACTION_PANEL_HEIGHT}
                step={1}
                value={config.basic.extractionPanelHeight}
                disabled={disabled}
                onChange={(event) => {
                  const value = Number.parseInt(event.target.value, 10);
                  if (Number.isNaN(value)) {
                    return;
                  }

                  updateBasic({
                    extractionPanelHeight: Math.min(
                      MAX_EXTRACTION_PANEL_HEIGHT,
                      Math.max(MIN_EXTRACTION_PANEL_HEIGHT, value),
                    ),
                  });
                }}
              />
            </label>
          </div>

          <label className="grid gap-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{t('settings.extractionTextFontSize')}</span>
              <span
                className={cn(
                  'whitespace-nowrap text-muted-foreground transition-[font-size,line-height] duration-150',
                  extractionTextClassName,
                )}
              >
                {t('settings.extractionTextFontSizePreview')}
              </span>
            </div>
            <input
              aria-label={t('settings.extractionTextFontSize')}
              type="range"
              min={MIN_EXTRACTION_TEXT_FONT_SIZE}
              max={MAX_EXTRACTION_TEXT_FONT_SIZE}
              step={1}
              value={config.basic.extractionTextFontSize}
              disabled={disabled}
              className="w-full"
              onChange={(event) => {
                const value = Number.parseInt(event.target.value, 10);
                if (Number.isNaN(value)) {
                  return;
                }

                updateBasic({
                  extractionTextFontSize: Math.min(
                    MAX_EXTRACTION_TEXT_FONT_SIZE,
                    Math.max(MIN_EXTRACTION_TEXT_FONT_SIZE, value),
                  ) as ExtensionConfig['basic']['extractionTextFontSize'],
                });
              }}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t('settings.extractionTextFontSizeMin')}</span>
              <span>{t('settings.extractionTextFontSizeMax')}</span>
            </div>
          </label>

          <label className="grid gap-1.5">
            <span className="text-sm font-medium">{t('settings.jinaApiKey')}</span>
            <Input
              aria-label={t('settings.jinaApiKey')}
              type="password"
              value={config.basic.jinaApiKey}
              disabled={disabled}
              onChange={(event) => updateBasic({ jinaApiKey: event.target.value })}
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-sm font-medium">{t('settings.jinaResponseTemplate')}</span>
            <Textarea
              aria-label={t('settings.jinaResponseTemplate')}
              value={config.basic.jinaResponseTemplate}
              disabled={disabled}
              className="min-h-20"
              onChange={(event) => updateBasic({ jinaResponseTemplate: event.target.value })}
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              aria-label={t('settings.filterCot')}
              type="checkbox"
              checked={config.basic.filterCot}
              disabled={disabled}
              onChange={(event) => updateBasic({ filterCot: event.target.checked })}
            />
            <span className="font-medium">{t('settings.filterCot')}</span>
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              aria-label={t('settings.includePageContentByDefault')}
              type="checkbox"
              checked={config.basic.includePageContentByDefault}
              disabled={disabled}
              onChange={(event) => updateBasic({ includePageContentByDefault: event.target.checked })}
            />
            <span className="font-medium">{t('settings.includePageContentByDefault')}</span>
          </label>
        </CardContent>
      </Card>

      <Card size="sm" className="rounded-[26px] bg-card py-0 ring-1 ring-foreground/8">
        <CardHeader className="gap-1.5 border-b border-border/70 px-4 py-3">
          <CardTitle className="text-base">{t('settings.cache')}</CardTitle>
          <CardDescription>{t('settings.cacheDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 px-4 py-4">
          <div className="grid gap-1.5 text-sm text-foreground">
            <span data-testid="cache-page-count">
              {t('settings.savedPages')}：{pageCount} 个页面
            </span>
            <span data-testid="cache-bytes">
              {t('settings.cacheSize')}：{formatCacheBytes(cacheStats.bytes)}
            </span>
          </div>
          <button
            type="button"
            className="inline-flex h-6 w-fit items-center rounded-md border border-border px-2.5 text-xs/relaxed hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled}
            onClick={onClearCache}
          >
            {t('settings.clearCache')}
          </button>
        </CardContent>
      </Card>
    </section>
  );
};
