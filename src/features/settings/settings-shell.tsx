import { useEffect, useState } from 'react';

import { cn } from '../../lib/utils';
import type { ExtensionConfig } from '../../domain/config/config-schema';
import { buildRecentErrorSummary, type RecentErrorSummary } from '../../domain/error/recent-error-schema';
import {
  getEnabledCompleteModels,
  isModelConfigComplete,
  normalizeBranchModelSelections,
} from '../../domain/config/config-schema';
import { createLocaleService } from '../../services/i18n/locale-service';
import { createLogger } from '../../services/logger/logger';
import { downloadTextFile } from '../../shared/download-file';
import { Icon } from '../../ui/icon';
import { BlacklistSettingsPanel } from './blacklist-settings-panel';
import { BasicSettingsPanel } from './basic-settings-panel';
import { CloudSyncPanel } from './cloud-sync-panel';
import { LanguageModelsPanel } from './language-models-panel';
import { appendQuickInputTemplates, fetchQuickInputTemplates } from './quick-input-template-service';
import { QuickInputsPanel } from './quick-inputs-panel';
import { settingsApi } from './settings-api';
import { SettingsActions } from './settings-actions';
import { SettingsNav } from './settings-nav';
import { hasUnsavedChanges, type SettingsSection, type SettingsViewError } from './settings-shell-state';

type CacheStats = {
  /** 本地缓存条目数。 */
  entryCount: number;
  /** 本地缓存字节数。 */
  bytes: number;
};

type SyncFeedback = {
  /** 反馈语气。 */
  tone: 'success' | 'error';
  /** 展示给用户的反馈内容。 */
  message: string;
};

const logger = createLogger('settings-shell');
const localeService = createLocaleService();

/** 设置页壳层，负责配置加载、语言预览、缓存统计和快捷输入编辑。 */
export const SettingsShell = () => {
  const [savedConfig, setSavedConfig] = useState<ExtensionConfig | null>(null);
  const [draftConfig, setDraftConfig] = useState<ExtensionConfig | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [localeResources, setLocaleResources] = useState<Awaited<ReturnType<typeof localeService.loadResources>> | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsSection>('basic');
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [importingQuickInputTemplates, setImportingQuickInputTemplates] = useState(false);
  const [testingSync, setTestingSync] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<SettingsViewError | null>(null);
  const [recentError, setRecentError] = useState<RecentErrorSummary | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<SyncFeedback | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      logger.info('开始加载设置页');

      try {
        const [nextConfig, nextCacheStats, nextLocaleResources, nextRecentError] = await Promise.all([
          settingsApi.getConfig(),
          settingsApi.getLocalCacheStats(),
          localeService.loadResources(),
          settingsApi.getRecentError(),
        ]);

        if (!active) {
          return;
        }

        setSavedConfig(nextConfig);
        setDraftConfig(nextConfig);
        setCacheStats(nextCacheStats);
        setLocaleResources(nextLocaleResources);
        setRecentError(nextRecentError);
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

  if (!savedConfig || !draftConfig || !localeResources || !cacheStats) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_var(--color-background)_0%,_var(--color-muted)_56%,_var(--color-background)_100%)] px-6 py-8">
        <p className="m-0 text-sm text-foreground">{error ? `${error.title}：${error.message}` : '正在加载设置页…'}</p>
      </main>
    );
  }

  const language = draftConfig.basic.language;
  const t = (key: string) => localeResources.t(key, language);
  const dirty = hasUnsavedChanges(savedConfig, draftConfig);
  const enabledModels = getEnabledCompleteModels(draftConfig);

  const updateDraftConfig = (next: ExtensionConfig) => {
    setDraftConfig(next);
  };

  const setOperationError = (title: string, message: string) => {
    setError({ title, message });
  };

  /** 将当前页面可感知的失败同步成最近错误摘要。 */
  const captureRecentError = (source: RecentErrorSummary['source'], operation: string, message: string) => {
    setRecentError(
      buildRecentErrorSummary({
        source,
        operation,
        message,
      }),
    );
  };

  const refreshCacheStats = async () => {
    const nextCacheStats = await settingsApi.getLocalCacheStats();
    setCacheStats(nextCacheStats);
    return nextCacheStats;
  };

  const validateDraftConfig = () => {
    const nextDraftConfig = normalizeBranchModelSelections(draftConfig);
    const defaultModel = nextDraftConfig.basic.defaultModelId
      ? nextDraftConfig.models.find((item) => item.id === nextDraftConfig.basic.defaultModelId)
      : null;

    if (nextDraftConfig.basic.defaultModelId && !defaultModel) {
      setOperationError('默认模型校验失败', '默认模型配置不完整，无法保存');
      logger.warn('默认模型不存在，阻止保存', { defaultModelId: nextDraftConfig.basic.defaultModelId });
      return null;
    }

    if (defaultModel && !isModelConfigComplete(defaultModel)) {
      setOperationError('默认模型校验失败', '默认模型配置不完整，无法保存');
      logger.warn('默认模型配置不完整，阻止保存', { defaultModelId: defaultModel.id });
      return null;
    }

    return nextDraftConfig;
  };

  const persistDraftConfig = async () => {
    const nextDraftConfig = validateDraftConfig();
    if (!nextDraftConfig) {
      return null;
    }

    setSaving(true);
    try {
      const nextConfig = await settingsApi.saveConfig(nextDraftConfig);
      setSavedConfig(nextConfig);
      setDraftConfig(nextConfig);
      logger.info('保存设置成功', { language: nextConfig.basic.language });
      setError(null);
      return nextConfig;
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'unknown error';
      logger.error('保存设置失败', { message });
      captureRecentError('settings', 'SAVE_CONFIG', message);
      setOperationError('保存失败', message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const runSync = async (configToSync: ExtensionConfig) => {
    setSyncing(true);
    try {
      const response = await settingsApi.syncNow(configToSync);
      setSavedConfig(response.config);
      setDraftConfig(response.config);
      setSyncFeedback({
        tone: 'success',
        message: `已同步 ${response.result.snapshotBytes} B`,
      });
      setError(null);
      return response;
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : 'unknown error';
      captureRecentError('sync', 'SYNC_NOW', message);
      setSyncFeedback({
        tone: 'error',
        message,
      });
      setOperationError('同步失败', message);
      return null;
    } finally {
      setSyncing(false);
    }
  };

  const handleImport = async (file: File) => {
    try {
      const payload = await file.text();
      if (!payload.trim()) {
        return;
      }

      const nextConfig = await settingsApi.importConfig(payload);
      setSavedConfig(nextConfig);
      setDraftConfig(nextConfig);
      setSelectedModelId(nextConfig.basic.defaultModelId ?? nextConfig.models[0]?.id ?? null);
      await refreshCacheStats();
      logger.info('导入配置成功');
      setError(null);
      setSyncFeedback(null);
    } catch (importError) {
      const message = importError instanceof Error ? importError.message : 'unknown error';
      logger.error('导入配置失败', { message });
      captureRecentError('settings', 'IMPORT_CONFIG', message);
      setOperationError('导入失败', message);
    }
  };

  const handleExport = async () => {
    try {
      const payload = await settingsApi.exportConfig();
      const filename = downloadTextFile({
        filename: `think-bot-sp-config-${new Date().toISOString().slice(0, 10)}.json`,
        content: payload,
        mimeType: 'application/json;charset=utf-8',
      });
      logger.info('导出配置成功', { filename });
      setError(null);
    } catch (exportError) {
      const message = exportError instanceof Error ? exportError.message : 'unknown error';
      logger.error('导出配置失败', { message });
      captureRecentError('settings', 'EXPORT_CONFIG', message);
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
      captureRecentError('settings', 'CLEAR_LOCAL_CACHE', message);
      setOperationError('清理缓存失败', message);
    }
  };

  const handleSave = async () => {
    await persistDraftConfig();
  };

  const handleImportQuickInputTemplates = async () => {
    setImportingQuickInputTemplates(true);
    try {
      const templates = await fetchQuickInputTemplates();
      const result = appendQuickInputTemplates({
        config: draftConfig,
        templates,
      });
      setDraftConfig(result.config);
      setError(null);
    } catch (importError) {
      const message = importError instanceof Error ? importError.message : 'unknown error';
      logger.error('导入远端快捷输入模板失败', { message });
      captureRecentError('settings', 'IMPORT_QUICK_INPUT_TEMPLATES', message);
      setOperationError('导入快捷输入模板失败', message);
    } finally {
      setImportingQuickInputTemplates(false);
    }
  };

  const handleSaveAndSync = async () => {
    if (saving || syncing) {
      return;
    }

    const savedConfigAfterPersist = await persistDraftConfig();
    if (!savedConfigAfterPersist) {
      return;
    }

    await runSync(savedConfigAfterPersist);
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      const nextConfig = await settingsApi.resetConfig();
      setSavedConfig(nextConfig);
      setDraftConfig(nextConfig);
      setSelectedModelId(nextConfig.basic.defaultModelId ?? nextConfig.models[0]?.id ?? null);
      logger.info('恢复默认配置成功', {
        language: nextConfig.basic.language,
        theme: nextConfig.basic.theme,
      });
      setError(null);
    } catch (resetError) {
      const message = resetError instanceof Error ? resetError.message : 'unknown error';
      logger.error('恢复默认配置失败', { message });
      captureRecentError('settings', 'RESET_CONFIG', message);
      setOperationError('恢复默认失败', message);
    } finally {
      setSaving(false);
    }
  };

  const handleTestSyncConnection = async () => {
    setTestingSync(true);
    try {
      const result = await settingsApi.testSyncConnection(draftConfig.sync);
      setSyncFeedback({
        tone: 'success',
        message: result.message,
      });
      setError(null);
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : 'unknown error';
      captureRecentError('sync', 'TEST_SYNC_CONNECTION', message);
      setSyncFeedback({
        tone: 'error',
        message,
      });
      setOperationError('同步连接测试失败', message);
    } finally {
      setTestingSync(false);
    }
  };

  const handleSyncNow = async () => {
    await runSync(draftConfig);
  };

  return (
    <main
      data-testid="settings-shell"
      data-layout="tab-page"
      data-theme={draftConfig.basic.theme}
      className={cn(
        'min-h-screen px-6 py-8 text-foreground',
        'bg-[radial-gradient(circle_at_top,_var(--color-background)_0%,_var(--color-muted)_56%,_var(--color-background)_100%)]',
        draftConfig.basic.theme === 'dark' && 'dark',
      )}
    >
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="grid gap-6 border-b border-border/70 pb-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <Icon name="settings" size={18} />
              </span>
              <div>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight">{t('settings.title')}</h1>
              </div>
            </div>

            <SettingsActions
              hasUnsavedChanges={dirty}
              disabled={saving || syncing}
              onSave={handleSave}
              onSaveAndSync={handleSaveAndSync}
              onReset={handleReset}
              onImport={handleImport}
              onExport={handleExport}
              t={t}
            />
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
          <SettingsNav activeSection={activeSection} onSectionChange={setActiveSection} t={t} />

          {error ? (
            <section className="lg:col-start-2">
              <section role="alert" className="rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error.title}：{error.message}
              </section>
            </section>
          ) : null}

          <section className="lg:col-start-2">
            <section className="grid gap-2 rounded-2xl border border-border/70 bg-card/80 px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="m-0 text-sm font-semibold">{t('settings.recentError')}</h2>
                {recentError ? (
                  <span className="text-xs text-muted-foreground">
                    {t(`settings.recentErrorSource.${recentError.source}`)} / {recentError.operation}
                  </span>
                ) : null}
              </div>
              {recentError ? (
                <>
                  <p className="m-0 text-sm text-foreground">{recentError.message}</p>
                  <p className="m-0 text-xs text-muted-foreground">
                    {t('settings.recentErrorCapturedAt')}：{new Date(recentError.capturedAt).toLocaleString()}
                  </p>
                </>
              ) : (
                <p className="m-0 text-sm text-muted-foreground">{t('settings.recentErrorEmpty')}</p>
              )}
            </section>
          </section>

          <section className="grid gap-6 lg:col-start-2">
            {activeSection === 'basic' ? (
              <BasicSettingsPanel
                config={draftConfig}
                defaultModels={enabledModels}
                cacheStats={cacheStats}
                disabled={saving}
                onChange={updateDraftConfig}
                onClearCache={handleClearCache}
                t={t}
              />
            ) : null}

            {activeSection === 'promptTabs' ? (
              <section
                id="settings-panel-promptTabs"
                role="tabpanel"
                aria-labelledby="settings-tab-promptTabs"
                className="grid gap-6"
              >
                <QuickInputsPanel
                  config={draftConfig}
                  disabled={saving}
                  importingTemplates={importingQuickInputTemplates}
                  onChange={updateDraftConfig}
                  onImportTemplates={handleImportQuickInputTemplates}
                  t={t}
                />
              </section>
            ) : null}

            {activeSection === 'models' ? (
              <LanguageModelsPanel
                config={draftConfig}
                selectedModelId={selectedModelId}
                disabled={saving}
                onSelectModel={setSelectedModelId}
                onChange={updateDraftConfig}
                t={t}
              />
            ) : null}

            {activeSection === 'sync' ? (
              <CloudSyncPanel
                config={draftConfig}
                disabled={saving}
                testing={testingSync}
                syncing={syncing}
                feedback={syncFeedback}
                onChange={updateDraftConfig}
                onTestConnection={handleTestSyncConnection}
                onSyncNow={handleSyncNow}
                t={t}
              />
            ) : null}

            {activeSection === 'blacklist' ? (
              <BlacklistSettingsPanel config={draftConfig} disabled={saving || syncing} onChange={updateDraftConfig} t={t} />
            ) : null}
          </section>
        </section>
      </section>
    </main>
  );
};
