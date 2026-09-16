import { useEffect, useState } from 'react';

import { cn } from '../../lib/utils';
import type { ExtensionConfig } from '../../domain/config/config-schema';
import { resolveModelReasoningEffort } from '../../domain/config/config-schema';
import {
  getEnabledCompleteModels,
  isModelConfigComplete,
  normalizeParallelModelSelections,
} from '../../domain/config/config-schema';
import { createLocaleService } from '../../services/i18n/locale-service';
import { createLogger, describeError } from '../../services/logger/logger';
import { downloadTextFile } from '../../shared/download-file';
import { ToastStack } from '../../components/ui/toast-stack';
import { Icon } from '../../ui/icon';
import { COMPACT_PAGE_SHELL_CLASS, COMPACT_SECTION_CLASS } from '../../ui/compact-layout';
import { useDocumentTheme } from '../../ui/theme-mode';
import { BlacklistSettingsPanel } from './blacklist-settings-panel';
import { BasicSettingsPanel } from './basic-settings-panel';
import { CloudSyncPanel } from './cloud-sync-panel';
import { DisplaySettingsPanel } from './display-settings-panel';
import { LanguageModelsPanel } from './language-models-panel';
import { DEFAULT_QUICK_INPUT_TEMPLATE_URL, appendQuickInputTemplates, fetchQuickInputTemplates } from './quick-input-template-service';
import { QuickInputsPanel } from './quick-inputs-panel';
import { settingsApi } from './settings-api';
import { SettingsActions } from './settings-actions';
import { SettingsNav } from './settings-nav';
import { hasUnsavedChanges, type SettingsSection, type SettingsViewError } from './settings-shell-state';

type CacheStats = {
  /** 本地缓存页面数。 */
  pageCount: number;
  /** 本地缓存条目数。 */
  entryCount: number;
  /** 本地缓存字节数。 */
  bytes: number;
};

type FeedbackMessage = {
  /** 反馈语气。 */
  tone: 'success' | 'error';
  /** 展示给用户的反馈内容。 */
  message: string;
};

type SettingsToast = {
  /** toast 稳定 id。 */
  id: number;
  /** 反馈语气。 */
  tone: 'success' | 'error';
  /** toast 标题。 */
  title: string;
  /** toast 正文。 */
  message: string;
};

const logger = createLogger('options');
const localeResources = createLocaleService().loadResources();

/** 设置页壳层，负责配置加载、语言预览、缓存统计和快捷输入编辑。 */
export const SettingsShell = () => {
  const [savedConfig, setSavedConfig] = useState<ExtensionConfig | null>(null);
  const [draftConfig, setDraftConfig] = useState<ExtensionConfig | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsSection>('basic');
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [importingQuickInputTemplates, setImportingQuickInputTemplates] = useState(false);
  const [testingSync, setTestingSync] = useState(false);
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [loadError, setLoadError] = useState<SettingsViewError | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<FeedbackMessage | null>(null);
  const [toast, setToast] = useState<SettingsToast | null>(null);
  const language = draftConfig?.basic.language ?? 'zh-CN';
  const t = (key: string) => localeResources.t(key, language);
  const themePreference = draftConfig?.basic.theme ?? 'system';
  const themeRootAttributes = useDocumentTheme(themePreference);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, 4000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [toast]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const [nextConfig, nextCacheStats] = await Promise.all([
          settingsApi.getConfig(),
          settingsApi.getLocalCacheStats(),
        ]);

        if (!active) {
          return;
        }

        setSavedConfig(nextConfig);
        setDraftConfig(nextConfig);
        setCacheStats(nextCacheStats);
        setSelectedModelId(nextConfig.basic.defaultModelId ?? nextConfig.models[0]?.id ?? null);
        logger.info('settings.loaded', {
          modelCount: nextConfig.models.length,
          quickInputCount: nextConfig.quickInputs.length,
          language: nextConfig.basic.language,
          syncProvider: nextConfig.sync.provider,
          cachePageCount: nextCacheStats.pageCount,
          cacheBytes: nextCacheStats.bytes,
        });
      } catch (error) {
        if (!active) {
          return;
        }

        const message = describeError(error, localeResources.t('settings.feedback.unknownError', 'zh-CN'));
        logger.error('settings.load.failed', { reason: message });
        setLoadError({ title: localeResources.t('settings.feedback.loadFailed', 'zh-CN'), message });
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  if (!savedConfig || !draftConfig || !cacheStats) {
    return (
      <main
        data-theme={themeRootAttributes.dataTheme}
        data-resolved-theme={themeRootAttributes.dataResolvedTheme}
        className={COMPACT_PAGE_SHELL_CLASS}
      >
        <p className="m-0 text-sm text-foreground">
          {loadError
            ? t('settings.loadError').replace('{title}', loadError.title).replace('{message}', () => loadError.message)
            : t('settings.loading')}
        </p>
      </main>
    );
  }

  const dirty = hasUnsavedChanges(savedConfig, draftConfig);
  const enabledModels = getEnabledCompleteModels(draftConfig);

  const updateDraftConfig = (next: ExtensionConfig) => {
    setDraftConfig(next);
  };

  const showToast = (tone: SettingsToast['tone'], title: string, message: string) => {
    setToast({
      id: Date.now(),
      tone,
      title,
      message,
    });
  };

  const refreshCacheStats = async () => {
    const nextCacheStats = await settingsApi.getLocalCacheStats();
    setCacheStats(nextCacheStats);
    return nextCacheStats;
  };

  const validateDraftConfig = () => {
    const nextDraftConfig = normalizeParallelModelSelections(draftConfig);
    const defaultModel = nextDraftConfig.basic.defaultModelId
      ? nextDraftConfig.models.find((item) => item.id === nextDraftConfig.basic.defaultModelId)
      : null;

    if (nextDraftConfig.basic.defaultModelId && !defaultModel) {
      showToast('error', t('settings.feedback.defaultModelInvalid'), t('settings.feedback.defaultModelIncomplete'));
      logger.warn('settings.save.blocked', { reason: 'default_model_missing', defaultModelId: nextDraftConfig.basic.defaultModelId });
      return null;
    }

    if (defaultModel && !isModelConfigComplete(defaultModel)) {
      showToast('error', t('settings.feedback.defaultModelInvalid'), t('settings.feedback.defaultModelIncomplete'));
      logger.warn('settings.save.blocked', { reason: 'default_model_incomplete', defaultModelId: defaultModel.id });
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
      logger.info('settings.saved', {
        language: nextConfig.basic.language,
        theme: nextConfig.basic.theme,
        modelCount: nextConfig.models.length,
        defaultModelId: nextConfig.basic.defaultModelId,
        syncProvider: nextConfig.sync.provider,
      });
      setToast(null);
      return nextConfig;
    } catch (error) {
      const message = describeError(error, t('settings.feedback.unknownError'));
      logger.error('settings.save.failed', { reason: message });
      showToast('error', t('settings.feedback.saveFailed'), message);
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
        message: t('settings.feedback.synced').replace('{bytes}', String(response.result.snapshotBytes)),
      });
      setToast(null);
      return response;
    } catch (error) {
      const message = describeError(error, t('settings.feedback.unknownError'));
      setSyncFeedback({
        tone: 'error',
        message,
      });
      showToast('error', t('settings.feedback.syncFailed'), message);
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
      logger.info('settings.import.completed', { modelCount: nextConfig.models.length, quickInputCount: nextConfig.quickInputs.length });
      setToast(null);
      setSyncFeedback(null);
    } catch (error) {
      const message = describeError(error, t('settings.feedback.unknownError'));
      logger.error('settings.import.failed', { reason: message });
      showToast('error', t('settings.feedback.importFailed'), message);
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
      logger.info('settings.export.completed', { filename, bytes: payload.length });
      setToast(null);
    } catch (error) {
      const message = describeError(error, t('settings.feedback.unknownError'));
      logger.error('settings.export.failed', { reason: message });
      showToast('error', t('settings.feedback.exportFailed'), message);
    }
  };

  const handleClearCache = async () => {
    try {
      await settingsApi.clearLocalCache();
      await refreshCacheStats();
      logger.info('settings.cache.cleared');
      setToast(null);
    } catch (error) {
      const message = describeError(error, t('settings.feedback.unknownError'));
      logger.error('settings.cache.clear_failed', { reason: message });
      showToast('error', t('settings.feedback.clearCacheFailed'), message);
    }
  };

  const handleSave = async () => {
    await persistDraftConfig();
  };

  const handleImportQuickInputTemplates = async (templateUrl: string) => {
    const normalizedTemplateUrl = templateUrl.trim();
    if (!normalizedTemplateUrl) {
      return;
    }

    setImportingQuickInputTemplates(true);
    try {
      const templates = await fetchQuickInputTemplates({ url: normalizedTemplateUrl });
      const importedAt = Date.now();
      // 模板只追加到最新草稿，保留网络等待期间的编辑。
      setDraftConfig((current) => current ? appendQuickInputTemplates({
        config: current,
        templates,
        now: () => importedAt,
      }).config : current);
      setToast(null);
    } catch (error) {
      const message = describeError(error, t('settings.feedback.unknownError'));
      logger.error('settings.quick_input_templates.import_failed', { reason: message });
      showToast('error', t('settings.feedback.importTemplatesFailed'), message);
    } finally {
      setImportingQuickInputTemplates(false);
    }
  };

  const handleSaveAndSync = async () => {
    if (saving || syncing || importingQuickInputTemplates) {
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
      logger.info('settings.reset.completed', { language: nextConfig.basic.language, theme: nextConfig.basic.theme });
      setToast(null);
    } catch (error) {
      const message = describeError(error, t('settings.feedback.unknownError'));
      logger.error('settings.reset.failed', { reason: message });
      showToast('error', t('settings.feedback.resetFailed'), message);
    } finally {
      setSaving(false);
    }
  };

  const handleTestSyncConnection = async () => {
    setTestingSync(true);
    try {
      const result = await settingsApi.testSyncConnection(draftConfig.sync, language);
      setSyncFeedback({
        tone: 'success',
        message: result.message,
      });
      setToast(null);
    } catch (error) {
      const message = describeError(error, t('settings.feedback.unknownError'));
      setSyncFeedback({
        tone: 'error',
        message,
      });
      showToast('error', t('settings.feedback.syncConnectionFailed'), message);
    } finally {
      setTestingSync(false);
    }
  };

  const handleTestModel = async (modelId: string) => {
    const model = draftConfig.models.find((item) => item.id === modelId && item.deletedAt === null);
    if (!model) {
      showToast('error', t('settings.feedback.modelTestFailed'), t('settings.feedback.modelNotFound'));
      return;
    }

    setTestingModelId(modelId);
    try {
      const result = await settingsApi.testModel(
        model,
        draftConfig.basic.llmRequestTimeoutSeconds,
        resolveModelReasoningEffort(draftConfig.basic, model),
      );
      const message = result.text || t('settings.feedback.modelEmptyOutput').replace('{provider}', () => result.provider);
      showToast('success', t('settings.feedback.modelTestSuccess'), message);
    } catch (error) {
      const message = describeError(error, t('settings.feedback.unknownError'));
      logger.error('settings.model_test.failed', { modelId, provider: model.provider, reason: message });
      showToast('error', t('settings.feedback.modelTestFailed'), message);
    } finally {
      setTestingModelId((current) => (current === modelId ? null : current));
    }
  };

  const handleSyncNow = async () => {
    await runSync(draftConfig);
  };

  return (
    <main
      data-testid="settings-shell"
      data-layout="tab-page"
      data-theme={themeRootAttributes.dataTheme}
      data-resolved-theme={themeRootAttributes.dataResolvedTheme}
      className={COMPACT_PAGE_SHELL_CLASS}
    >
      <ToastStack toasts={toast ? [toast] : []} />

      <section className="relative mx-auto flex w-full max-w-7xl flex-col gap-2">
        <header
          data-testid="settings-shell-header"
          className="sticky top-2 z-40 grid gap-2 border border-border/70 bg-background/95 px-3 py-2 ring-1 ring-foreground/8"
        >
          <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center">
            <div
              data-testid="settings-shell-title"
              className="flex min-w-0 items-center justify-self-center gap-2 lg:col-start-1 lg:justify-self-start"
            >
              <span className="inline-flex size-7 items-center justify-center border border-border/70 text-primary">
                <Icon name="settings" size={16} />
              </span>
              <div className="min-w-0">
                <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Think Bot SP</p>
                <h1 className="mt-0.5 truncate text-lg font-semibold">{t('settings.title')}</h1>
              </div>
            </div>

            {dirty ? (
              <div className="flex items-center justify-center justify-self-center lg:col-start-2">
                <p
                  data-testid="settings-unsaved-banner"
                  role="status"
                  aria-live="polite"
                  className="m-0 whitespace-nowrap border border-amber-500/25 bg-amber-500/8 px-2 py-0.5 text-center text-xs/relaxed text-amber-700 dark:text-amber-300"
                >
                  {t('settings.unsavedChanges')}
                </p>
              </div>
            ) : null}

            <div className="min-w-0 justify-self-stretch lg:col-start-3 lg:justify-self-end">
              <SettingsActions
                disabled={saving || syncing || importingQuickInputTemplates}
                onSave={handleSave}
                onSaveAndSync={handleSaveAndSync}
                onReset={handleReset}
                onImport={handleImport}
                onExport={handleExport}
                t={t}
              />
            </div>
          </div>
        </header>

        <section className="grid gap-2 lg:grid-cols-[196px_minmax(0,1fr)] lg:items-start">
          <SettingsNav activeSection={activeSection} onSectionChange={setActiveSection} t={t} />

          <section className={cn(COMPACT_SECTION_CLASS, 'lg:col-start-2')}>
            {activeSection === 'basic' ? (
              <BasicSettingsPanel
                config={draftConfig}
                defaultModels={enabledModels}
                cacheStats={cacheStats}
                disabled={saving || syncing}
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
                className={COMPACT_SECTION_CLASS}
              >
                <QuickInputsPanel
                  config={draftConfig}
                  disabled={saving || syncing}
                  importingTemplates={importingQuickInputTemplates}
                  defaultImportTemplateUrl={DEFAULT_QUICK_INPUT_TEMPLATE_URL}
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
                disabled={saving || syncing}
                onSelectModel={setSelectedModelId}
                onChange={updateDraftConfig}
                onTestModel={(model) => void handleTestModel(model.id)}
                testingModelId={testingModelId}
                t={t}
              />
            ) : null}

            {activeSection === 'display' ? (
              <DisplaySettingsPanel
                config={draftConfig}
                disabled={saving || syncing}
                onChange={updateDraftConfig}
                t={t}
              />
            ) : null}

            {activeSection === 'sync' ? (
              <CloudSyncPanel
                config={draftConfig}
                disabled={saving || syncing || importingQuickInputTemplates}
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
