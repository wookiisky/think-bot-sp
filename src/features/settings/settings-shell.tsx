import { useEffect, useState } from 'react';

import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Separator } from '../../components/ui/separator';
import { cn } from '../../lib/utils';
import type { ExtensionConfig } from '../../domain/config/config-schema';
import { isModelConfigComplete } from '../../domain/config/config-schema';
import { createLocaleService } from '../../services/i18n/locale-service';
import { createLogger } from '../../services/logger/logger';
import { Icon } from '../../ui/icon';
import { ModelForm } from './model-form';
import { QuickInputsPanel } from './quick-inputs-panel';
import { settingsApi } from './settings-api';

type CacheStats = {
  /** 本地缓存条目数。 */
  entryCount: number;
  /** 本地缓存字节数。 */
  bytes: number;
};

type QuickInputItem = {
  /** 快捷输入 id。 */
  id: string;
  /** 快捷输入名称。 */
  name: string;
  /** 快捷输入提示词。 */
  prompt: string;
  /** 排序序号。 */
  order: number;
  /** 软删除时间。 */
  deletedAt: number | null;
};

const logger = createLogger('settings-shell');
const localeService = createLocaleService();

const navigationItems = [
  { key: 'settings.models', icon: 'settings' as const },
  { key: 'settings.promptTabs', icon: 'menu' as const },
  { key: 'settings.blacklist', icon: 'menu' as const },
  { key: 'settings.sync', icon: 'cache' as const },
  { key: 'settings.cache', icon: 'cache' as const },
];

const selectClassName =
  'w-full rounded-md border border-input bg-input/20 px-2 py-1.5 text-xs/relaxed outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50';

/** 只保留有效快捷输入，并按顺序展示。 */
const normalizeQuickInputs = (items: ExtensionConfig['quickInputs']): QuickInputItem[] =>
  [...items]
    .filter((item) => item.deletedAt === null)
    .sort((left, right) => left.order - right.order)
    .map((item) => ({
      id: item.id,
      name: item.name,
      prompt: item.prompt,
      order: item.order,
      deletedAt: item.deletedAt,
    }));

/** 取出当前默认可编辑的模型。 */
const resolveActiveModel = (config: ExtensionConfig, selectedModelId: string | null) =>
  config.models.find((item) => item.id === (selectedModelId ?? config.basic.defaultModelId)) ?? config.models[0] ?? null;

/** 把导出的配置内容下载为本地 json 文件。 */
const downloadExportedConfig = (payload: string) => {
  const filename = `think-bot-sp-config-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);

  return filename;
};

/** 设置页壳层，负责配置加载、语言预览、缓存统计和快捷输入预览。 */
export const SettingsShell = () => {
  const [config, setConfig] = useState<ExtensionConfig | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [localeResources, setLocaleResources] = useState<Awaited<ReturnType<typeof localeService.loadResources>> | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      logger.info('开始加载设置页');

      try {
        const [nextConfig, nextCacheStats, nextLocaleResources] = await Promise.all([
          settingsApi.getConfig(),
          settingsApi.getLocalCacheStats(),
          localeService.loadResources(),
        ]);

        if (!active) {
          return;
        }

        setConfig(nextConfig);
        setCacheStats(nextCacheStats);
        setLocaleResources(nextLocaleResources);
        setSelectedModelId(nextConfig.basic.defaultModelId ?? nextConfig.models[0]?.id ?? null);
        logger.info('设置页加载完成', {
          entryCount: nextCacheStats.entryCount,
          bytes: nextCacheStats.bytes,
        });
      } catch (loadError) {
        if (!active) {
          return;
        }

        const message = loadError instanceof Error ? loadError.message : 'unknown error';
        logger.error('设置页加载失败', { message });
        setError({ title: '加载失败', message });
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  if (!config || !localeResources || !cacheStats) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_var(--color-background)_0%,_var(--color-muted)_56%,_var(--color-background)_100%)] px-6 py-8">
        <p className="m-0 text-sm text-foreground">{error ? `${error.title}：${error.message}` : '正在加载设置页…'}</p>
      </main>
    );
  }

  const language = config.basic.language;
  const t = (key: string) => localeResources.t(key, language);
  const activeModel = resolveActiveModel(config, selectedModelId);

  const updateConfig = (next: ExtensionConfig) => {
    setConfig(next);
  };

  const setOperationError = (title: string, message: string) => {
    setError({ title, message });
  };

  const handleLanguageChange = (nextLanguage: ExtensionConfig['basic']['language']) => {
    updateConfig({
      ...config,
      basic: {
        ...config.basic,
        language: nextLanguage,
      },
    });
  };

  const refreshCacheStats = async () => {
    const nextCacheStats = await settingsApi.getLocalCacheStats();
    setCacheStats(nextCacheStats);
    return nextCacheStats;
  };

  const handleImport = async () => {
    try {
      const payload = typeof window.prompt === 'function' ? window.prompt('粘贴配置内容') : null;
      if (!payload) {
        return;
      }

      const nextConfig = await settingsApi.importConfig(payload);
      updateConfig(nextConfig);
      setSelectedModelId(nextConfig.basic.defaultModelId ?? nextConfig.models[0]?.id ?? null);
      await refreshCacheStats();
      logger.info('导入配置成功');
      setError(null);
    } catch (importError) {
      const message = importError instanceof Error ? importError.message : 'unknown error';
      logger.error('导入配置失败', { message });
      setOperationError('导入失败', message);
    }
  };

  const handleExport = async () => {
    try {
      const payload = await settingsApi.exportConfig();
      const filename = downloadExportedConfig(payload);
      logger.info('导出配置成功', { filename });
      setError(null);
    } catch (exportError) {
      const message = exportError instanceof Error ? exportError.message : 'unknown error';
      logger.error('导出配置失败', { message });
      setOperationError('导出失败', message);
    }
  };

  const handleClearCache = async () => {
    try {
      await settingsApi.clearLocalCache();
      await refreshCacheStats();
      logger.info('清理本地缓存成功');
      setError(null);
    } catch (clearError) {
      const message = clearError instanceof Error ? clearError.message : 'unknown error';
      logger.error('清理本地缓存失败', { message });
      setOperationError('清理缓存失败', message);
    }
  };

  const handleSave = async () => {
    const defaultModel = config.basic.defaultModelId ? config.models.find((item) => item.id === config.basic.defaultModelId) : null;
    if (config.basic.defaultModelId && !defaultModel) {
      setOperationError('默认模型校验失败', '默认模型配置不完整，无法保存');
      logger.warn('默认模型不存在，阻止保存', { defaultModelId: config.basic.defaultModelId });
      return;
    }

    if (defaultModel && !isModelConfigComplete(defaultModel)) {
      setOperationError('默认模型校验失败', '默认模型配置不完整，无法保存');
      logger.warn('默认模型配置不完整，阻止保存', { defaultModelId: defaultModel.id });
      return;
    }

    setSaving(true);
    try {
      const nextConfig = await settingsApi.saveConfig(config);
      updateConfig(nextConfig);
      logger.info('保存设置成功', { language: nextConfig.basic.language });
      setError(null);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'unknown error';
      logger.error('保存设置失败', { message });
      setOperationError('保存失败', message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      const nextConfig = await settingsApi.resetConfig();
      updateConfig(nextConfig);
      setSelectedModelId(nextConfig.basic.defaultModelId ?? nextConfig.models[0]?.id ?? null);
      logger.info('恢复默认配置成功', {
        language: nextConfig.basic.language,
        theme: nextConfig.basic.theme,
      });
      setError(null);
    } catch (resetError) {
      const message = resetError instanceof Error ? resetError.message : 'unknown error';
      logger.error('恢复默认配置失败', { message });
      setOperationError('恢复默认失败', message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main
      data-testid="settings-shell"
      data-theme={config.basic.theme}
      className={cn(
        'min-h-screen px-6 py-8 text-foreground',
        'bg-[radial-gradient(circle_at_top,_var(--color-background)_0%,_var(--color-muted)_56%,_var(--color-background)_100%)]',
        config.basic.theme === 'dark' && 'dark',
      )}
    >
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <Card className="rounded-[28px] bg-card/90 py-0 shadow-2xl ring-1 ring-foreground/8 backdrop-blur">
          <CardHeader className="gap-6 border-b border-border/70 px-6 py-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                  <Icon name="settings" size={18} />
                </span>
                <div>
                  <p className="m-0 text-xs uppercase tracking-[0.18em] text-muted-foreground">Stage 2 settings</p>
                  <h1 className="mt-1 text-3xl font-semibold tracking-tight">{t('settings.title')}</h1>
                </div>
              </div>

              <div data-testid="settings-shell-actions" className="flex flex-wrap justify-end gap-2">
                <Button type="button" onClick={handleSave} disabled={saving}>
                  <Icon name="save" size={14} />
                  {t('settings.save')}
                </Button>
                <Button type="button" variant="outline" onClick={handleReset} disabled={saving}>
                  {t('settings.reset')}
                </Button>
                <Button type="button" variant="outline" onClick={handleImport} disabled={saving}>
                  {t('settings.import')}
                </Button>
                <Button type="button" variant="outline" onClick={handleExport} disabled={saving}>
                  {t('settings.export')}
                </Button>
              </div>
            </div>

            <nav aria-label="设置导航" data-testid="settings-shell-nav" className="flex flex-wrap gap-2">
              {navigationItems.map((item) => (
                <span key={item.key} className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/50 px-3 py-1.5 text-xs/relaxed">
                  <Icon name={item.icon} size={14} />
                  {t(item.key)}
                </span>
              ))}
            </nav>
          </CardHeader>

          <CardContent className="grid gap-6 px-6 py-6">
            {error ? (
              <section role="alert" className="rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error.title}：{error.message}
              </section>
            ) : null}

            <section className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <Card className="rounded-3xl bg-card py-0 ring-1 ring-foreground/8">
                <CardHeader className="gap-3 border-b border-border/70 px-5 py-4">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon name="settings" size={14} />
                    {t('settings.models')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 px-5 py-5">
                  {activeModel ? (
                    <>
                      {config.models.length > 1 ? (
                        <label className="grid gap-2">
                          <span className="text-sm font-medium">模型</span>
                          <select
                            aria-label="模型"
                            value={activeModel.id}
                            disabled={saving}
                            onChange={(event) => setSelectedModelId(event.target.value)}
                            className={selectClassName}
                          >
                            {config.models.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}

                      <ModelForm
                        key={activeModel.id}
                        model={activeModel}
                        disabled={saving}
                        onChange={(nextModel) => {
                          updateConfig({
                            ...config,
                            models: config.models.map((item) => (item.id === nextModel.id ? nextModel : item)),
                          });
                        }}
                      />
                    </>
                  ) : (
                    <p className="m-0 text-sm text-muted-foreground">暂无模型配置</p>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-3xl bg-card py-0 ring-1 ring-foreground/8">
                <CardHeader className="gap-3 border-b border-border/70 px-5 py-4">
                  <CardTitle className="text-base">{t('settings.language')}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 px-5 py-5">
                  <label className="grid gap-2">
                    <span className="text-sm font-medium">{t('settings.language')}</span>
                    <select
                      value={language}
                      onChange={(event) => handleLanguageChange(event.target.value as ExtensionConfig['basic']['language'])}
                      aria-label={t('settings.language')}
                      disabled={saving}
                      className={selectClassName}
                    >
                      <option value="zh-CN">中文</option>
                      <option value="en">English</option>
                    </select>
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm font-medium">{t('settings.theme')}</span>
                    <select
                      value={config.basic.theme}
                      onChange={(event) =>
                        updateConfig({
                          ...config,
                          basic: {
                            ...config.basic,
                            theme: event.target.value as ExtensionConfig['basic']['theme'],
                          },
                        })
                      }
                      aria-label={t('settings.theme')}
                      disabled={saving}
                      className={selectClassName}
                    >
                      <option value="system">System</option>
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                    </select>
                  </label>

                  <p className="m-0 text-sm leading-6 text-muted-foreground">切换后会立即预览标题文案和设置页主题。</p>
                </CardContent>
              </Card>

              <Card className="rounded-3xl bg-card py-0 ring-1 ring-foreground/8">
                <CardHeader className="gap-3 border-b border-border/70 px-5 py-4">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon name="cache" size={14} />
                    {t('settings.cache')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 px-5 py-5">
                  <div className="flex flex-wrap gap-3 text-sm text-foreground">
                    <span data-testid="cache-entry-count">{cacheStats.entryCount} 项</span>
                    <span data-testid="cache-bytes">{formatBytes(cacheStats.bytes)}</span>
                  </div>
                  <Button type="button" variant="outline" onClick={handleClearCache} disabled={saving}>
                    清理本地缓存
                  </Button>
                </CardContent>
              </Card>
            </section>

            <Separator />
            <QuickInputsPanel quickInputs={normalizeQuickInputs(config.quickInputs)} />
          </CardContent>
        </Card>
      </section>
    </main>
  );
};

const formatBytes = (bytes: number) => `${bytes} B`;
