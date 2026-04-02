import { useEffect, useState } from 'react';

import type { ExtensionConfig } from '../../domain/config/config-schema';
import { isModelConfigComplete } from '../../domain/config/config-schema';
import { createLogger } from '../../services/logger/logger';
import { createLocaleService } from '../../services/i18n/locale-service';
import { Icon } from '../../ui/icon';
import { settingsApi } from './settings-api';
import { ModelForm } from './model-form';
import { QuickInputsPanel } from './quick-inputs-panel';

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
  { key: 'settings.models', label: '模型', icon: 'settings' as const },
  { key: 'settings.promptTabs', label: '标签页', icon: 'menu' as const },
  { key: 'settings.blacklist', label: '黑名单', icon: 'menu' as const },
  { key: 'settings.sync', label: '同步', icon: 'cache' as const },
  { key: 'settings.cache', label: '本地缓存', icon: 'cache' as const },
];

const themePalette = {
  system: {
    pageBackground: 'radial-gradient(circle at top, #ffffff 0%, #f5f7ff 48%, #eef2f7 100%)',
    panelBackground: 'rgba(255, 255, 255, 0.86)',
    text: '#111827',
  },
  light: {
    pageBackground: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)',
    panelBackground: 'rgba(255, 255, 255, 0.94)',
    text: '#111827',
  },
  dark: {
    pageBackground: 'linear-gradient(180deg, #0f172a 0%, #111827 100%)',
    panelBackground: 'rgba(15, 23, 42, 0.92)',
    text: '#e5eefc',
  },
} as const;

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
      <main
        style={{
          minHeight: '100vh',
          padding: '2rem',
          background: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)',
          color: '#111827',
          fontFamily: '"Segoe UI", system-ui, sans-serif',
        }}
      >
        <p style={{ margin: 0 }}>{error ? `${error.title}：${error.message}` : '正在加载设置页…'}</p>
      </main>
    );
  }

  const language = config.basic.language;
  const t = (key: string) => localeResources.t(key, language);
  const activeModel = resolveActiveModel(config, selectedModelId);
  const previewTheme = themePalette[config.basic.theme];

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
      style={{
        minHeight: '100vh',
        padding: '1.5rem',
        background: previewTheme.pageBackground,
        color: previewTheme.text,
        fontFamily: '"Segoe UI", system-ui, sans-serif',
      }}
    >
      <section
        style={{
          width: 'min(1120px, 100%)',
          margin: '0 auto',
          borderRadius: '24px',
          background: previewTheme.panelBackground,
          border: '1px solid rgba(148, 163, 184, 0.18)',
          boxShadow: '0 24px 60px rgba(15, 23, 42, 0.08)',
          padding: '1.5rem',
          backdropFilter: 'blur(14px)',
        }}
      >
        <header style={{ display: 'grid', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span
                style={{
                  width: '2.5rem',
                  height: '2.5rem',
                  borderRadius: '0.9rem',
                  background: 'linear-gradient(135deg, #111827, #4f46e5)',
                  color: '#fff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="settings" size={18} />
              </span>
              <div>
                <p style={{ margin: 0, fontSize: '0.75rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#64748b' }}>
                  Stage 2 settings
                </p>
                <h1 style={{ margin: '0.2rem 0 0', fontSize: '1.9rem', lineHeight: 1.1 }}>{t('settings.title')}</h1>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" onClick={handleSave} disabled={saving} style={{ border: 'none', background: '#111827', color: '#fff', borderRadius: '999px', padding: '0.65rem 1rem', cursor: 'pointer' }}>
                <Icon name="save" size={14} />
                <span style={{ marginLeft: '0.4rem' }}>{t('settings.save')}</span>
              </button>
              <button type="button" onClick={handleReset} disabled={saving} style={{ border: '1px solid #d1d5db', background: '#fff', color: '#374151', borderRadius: '999px', padding: '0.65rem 1rem' }}>
                {t('settings.reset')}
              </button>
              <button type="button" onClick={handleImport} disabled={saving} style={{ border: '1px solid #d1d5db', background: '#fff', color: '#374151', borderRadius: '999px', padding: '0.65rem 1rem' }}>
                {t('settings.import')}
              </button>
              <button type="button" onClick={handleExport} disabled={saving} style={{ border: '1px solid #d1d5db', background: '#fff', color: '#374151', borderRadius: '999px', padding: '0.65rem 1rem' }}>
                {t('settings.export')}
              </button>
            </div>
          </div>

          <nav aria-label="设置导航" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {navigationItems.map((item) => (
              <span
                key={item.key}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  borderRadius: '999px',
                  border: '1px solid #dbe2ea',
                  background: '#f8fafc',
                  padding: '0.55rem 0.8rem',
                  fontSize: '0.92rem',
                }}
              >
                <Icon name={item.icon} size={14} />
                {t(item.key)}
              </span>
            ))}
          </nav>
        </header>

        <div style={{ marginTop: '1.5rem', display: 'grid', gap: '1rem' }}>
          {error ? (
            <section
              role="alert"
              style={{
                padding: '0.85rem 1rem',
                borderRadius: '14px',
                border: '1px solid #fecaca',
                background: '#fef2f2',
                color: '#991b1b',
              }}
            >
              {error.title}：{error.message}
            </section>
          ) : null}

          <section
            style={{
              display: 'grid',
              gap: '1rem',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              alignItems: 'start',
            }}
          >
            <section style={{ padding: '1rem', borderRadius: '18px', border: '1px solid #e2e8f0', background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.8rem' }}>
                <Icon name="settings" size={14} />
                <h2 style={{ margin: 0, fontSize: '1rem' }}>{t('settings.models')}</h2>
              </div>

              {activeModel ? (
                <div style={{ display: 'grid', gap: '0.9rem' }}>
                  {config.models.length > 1 ? (
                    <label style={{ display: 'grid', gap: '0.4rem' }}>
                      <span style={{ fontWeight: 600 }}>模型</span>
                      <select
                        aria-label="模型"
                        value={activeModel.id}
                        disabled={saving}
                        onChange={(event) => setSelectedModelId(event.target.value)}
                        style={{ borderRadius: '12px', border: '1px solid #d1d5db', padding: '0.65rem 0.8rem', background: '#fff' }}
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
                </div>
              ) : (
                <p style={{ margin: 0, color: '#64748b' }}>暂无模型配置</p>
              )}
            </section>

            <label style={{ display: 'grid', gap: '0.45rem', padding: '1rem', borderRadius: '18px', border: '1px solid #e2e8f0', background: '#fff' }}>
              <span style={{ fontWeight: 600 }}>{t('settings.language')}</span>
              <select
                value={language}
                onChange={(event) => handleLanguageChange(event.target.value as ExtensionConfig['basic']['language'])}
                aria-label={t('settings.language')}
                disabled={saving}
                style={{
                  borderRadius: '12px',
                  border: '1px solid #d1d5db',
                  padding: '0.7rem 0.85rem',
                  background: '#fff',
                }}
              >
                <option value="zh-CN">中文</option>
                <option value="en">English</option>
              </select>
              <p style={{ margin: 0, color: '#64748b', lineHeight: 1.5 }}>切换后会立即预览标题文案。</p>
            </label>

            <label style={{ display: 'grid', gap: '0.45rem', padding: '1rem', borderRadius: '18px', border: '1px solid #e2e8f0', background: '#fff' }}>
              <span style={{ fontWeight: 600 }}>{t('settings.theme')}</span>
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
                style={{
                  borderRadius: '12px',
                  border: '1px solid #d1d5db',
                  padding: '0.7rem 0.85rem',
                  background: '#fff',
                }}
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
              <p style={{ margin: 0, color: '#64748b', lineHeight: 1.5 }}>切换后会立即预览设置页主题。</p>
            </label>

            <section style={{ padding: '1rem', borderRadius: '18px', border: '1px solid #e2e8f0', background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.8rem' }}>
                <Icon name="cache" size={14} />
                <h2 style={{ margin: 0, fontSize: '1rem' }}>{t('settings.cache')}</h2>
              </div>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', color: '#334155' }}>
                <span data-testid="cache-entry-count">{cacheStats.entryCount} 项</span>
                <span data-testid="cache-bytes">{formatBytes(cacheStats.bytes)}</span>
                <button type="button" onClick={handleClearCache} disabled={saving} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: '999px', padding: '0.45rem 0.8rem', cursor: 'pointer' }}>
                  清理本地缓存
                </button>
              </div>
            </section>
          </section>

          <QuickInputsPanel quickInputs={normalizeQuickInputs(config.quickInputs)} />
        </div>
      </section>
    </main>
  );
};

const formatBytes = (bytes: number) => `${bytes} B`;
