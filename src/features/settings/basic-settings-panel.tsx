/* eslint-disable no-unused-vars */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import type { ExtensionConfig } from '../../domain/config/config-schema';
import type { ModelConfig } from '../../domain/config/config-schema';
import { sanitizeBranchModelIds } from '../../domain/config/config-schema';

type CacheStats = {
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
  const branchModelIds = sanitizeBranchModelIds(config, config.basic.branchModelIds);
  const hasMissingBranchModels = branchModelIds.length !== config.basic.branchModelIds.length;

  const updateBasic = (patch: Partial<ExtensionConfig['basic']>) => {
    onChange({
      ...config,
      basic: {
        ...config.basic,
        ...patch,
      },
    });
  };
  /** 切换全局分支模型。 */
  const toggleBranchModel = (modelId: string, checked: boolean) => {
    updateBasic({
      branchModelIds: checked ? [...branchModelIds, modelId] : branchModelIds.filter((id) => id !== modelId),
    });
  };

  return (
    <section
      id="settings-panel-basic"
      role="tabpanel"
      aria-labelledby="settings-tab-basic"
      className="grid gap-6"
    >
      <Card className="rounded-3xl bg-card py-0 ring-1 ring-foreground/8">
        <CardHeader className="gap-2 border-b border-border/70 px-5 py-4">
          <CardTitle className="text-base">{t('settings.basic')}</CardTitle>
          <CardDescription>{t('settings.basicDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 px-5 py-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium">{t('settings.language')}</span>
              <Select
                value={config.basic.language}
                disabled={disabled}
                onValueChange={(value) => updateBasic({ language: value as ExtensionConfig['basic']['language'] })}
              >
                <SelectTrigger aria-label={t('settings.language')} className="w-full">
                  <SelectValue placeholder={t('settings.language')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zh-CN">中文</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">{t('settings.theme')}</span>
              <Select
                value={config.basic.theme}
                disabled={disabled}
                onValueChange={(value) => updateBasic({ theme: value as ExtensionConfig['basic']['theme'] })}
              >
                <SelectTrigger aria-label={t('settings.theme')} className="w-full">
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

          <label className="grid gap-2">
            <span className="text-sm font-medium">{t('settings.defaultModel')}</span>
            <Select
              value={config.basic.defaultModelId ?? '__none__'}
              disabled={disabled}
              onValueChange={(value) => updateBasic({ defaultModelId: value === '__none__' ? null : value })}
            >
              <SelectTrigger aria-label={t('settings.defaultModel')} className="w-full">
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

          <fieldset className="grid gap-3 rounded-2xl border border-border/70 px-4 py-3">
            <legend className="px-1 text-sm font-medium">{t('settings.branchModels')}</legend>
            <p className="m-0 text-sm text-muted-foreground">{t('settings.branchModelsDescription')}</p>
            {defaultModels.length > 0 ? (
              <div className="grid gap-2">
                {defaultModels.map((model) => (
                  <label key={model.id} className="flex items-center gap-2 text-sm">
                    <input
                      aria-label={`${t('settings.branchModels')}:${model.name}`}
                      type="checkbox"
                      checked={branchModelIds.includes(model.id)}
                      disabled={disabled}
                      onChange={(event) => toggleBranchModel(model.id, event.target.checked)}
                    />
                    <span>{model.name}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="m-0 text-sm text-muted-foreground">{t('settings.noBranchModels')}</p>
            )}
            {hasMissingBranchModels ? <p className="m-0 text-sm text-amber-700 dark:text-amber-300">{t('settings.branchModelsMissing')}</p> : null}
          </fieldset>

          <label className="grid gap-2">
            <span className="text-sm font-medium">System Prompt</span>
            <Textarea
              aria-label="System Prompt"
              value={config.basic.systemPrompt}
              disabled={disabled}
              onChange={(event) => updateBasic({ systemPrompt: event.target.value })}
            />
          </label>

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium">{t('settings.extractionMethod')}</span>
              <Select
                value={config.basic.extractionMethod}
                disabled={disabled}
                onValueChange={(value) =>
                  updateBasic({ extractionMethod: value as ExtensionConfig['basic']['extractionMethod'] })
                }
              >
                <SelectTrigger aria-label={t('settings.extractionMethod')} className="w-full">
                  <SelectValue placeholder={t('settings.extractionMethod')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="readability">Readability</SelectItem>
                  <SelectItem value="jina">Jina</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">{t('settings.previewHint')}</span>
              <Input value={t('settings.previewDescription')} aria-label={t('settings.previewHint')} disabled />
            </label>
          </div>

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

      <Card className="rounded-3xl bg-card py-0 ring-1 ring-foreground/8">
        <CardHeader className="gap-2 border-b border-border/70 px-5 py-4">
          <CardTitle className="text-base">{t('settings.cache')}</CardTitle>
          <CardDescription>{t('settings.cacheDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 px-5 py-5">
          <div className="flex flex-wrap gap-3 text-sm text-foreground">
            <span data-testid="cache-entry-count">{cacheStats.entryCount} 项</span>
            <span data-testid="cache-bytes">{cacheStats.bytes} B</span>
          </div>
          <button
            type="button"
            className="inline-flex w-fit items-center rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
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
