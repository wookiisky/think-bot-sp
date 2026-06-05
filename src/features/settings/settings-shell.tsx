import { useEffect, useState } from 'react';

import { cn } from '../../lib/utils';
import type { ExtensionConfig } from '../../domain/config/config-schema';
import {
  getEnabledCompleteModels,
  isModelConfigComplete,
  normalizeParallelModelSelections,
} from '../../domain/config/config-schema';
import { createLocaleService } from '../../services/i18n/locale-service';
import { createLogger } from '../../services/logger/logger';
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
import { appendQuickInputTemplates, fetchQuickInputTemplates } from './quick-input-template-service';
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
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [loadError, setLoadError] = useState<SettingsViewError | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<FeedbackMessage | null>(null);
  const [toast, setToast] = useState<SettingsToast | null>(null);
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

        setSavedConfig(nextConfig);
        setDraftConfig(nextConfig);
        setCacheStats(nextCacheStats);
        setLocaleResources(nextLocaleResources);
        setSelectedModelId(nextConfig.basic.defaultModelId ?? nextConfig.models[0]?.id ?? null);
        logger.info('设置页加载完成', {
          pageCount: nextCacheStats.pageCount,
          entryCount: nextCacheStats.entryCount,
          bytes: nextCacheStats.bytes,
        });
      } catch (error) {
        if (!active) {
          return;
        }

        const message = error instanceof Error ? error.message : 'unknown error';
        logger.error('设置页加载失败', { message });
        setLoadError({ title: '加载失败', message });
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  if (!savedConfig || !draftConfig || !localeResources || !cacheStats) {
    return (
      <main
        data-theme={themeRootAttributes.dataTheme}
        data-resolved-theme={themeRootAttributes.dataResolvedTheme}
        className={COMPACT_PAGE_SHELL_CLASS}
      >
        <p className="m-0 text-sm text-foreground">{loadError ? `${loadError.title}：${loadError.message}` : '正在加载设置页…'}</p>
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
      showToast('error', '默认模型校验失败', '默认模型配置不完整，无法保存');
      logger.warn('默认模型不存在，阻止保存', { defaultModelId: nextDraftConfig.basic.defaultModelId });
      return null;
    }

    if (defaultModel && !isModelConfigComplete(defaultModel)) {
      showToast('error', '默认模型校验失败', '默认模型配置不完整，无法保存');
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
      setToast(null);
      return nextConfig;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      logger.error('保存设置失败', { message });
      showToast('error', '保存失败', message);
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
      setToast(null);
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      setSyncFeedback({
        tone: 'error',
        message,
      });
      showToast('error', '同步失败', message);
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
      setToast(null);
      setSyncFeedback(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      logger.error('导入配置失败', { message });
      showToast('error', '导入失败', message);
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
      setToast(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      logger.error('导出配置失败', { message });
      showToast('error', '导出失败', message);
    }
  };

  const handleClearCache = async () => {
    try {
      await settingsApi.clearLocalCache();
      await refreshCacheStats();
      logger.info('清理本地缓存成功');
      setToast(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      logger.error('清理本地缓存失败', { message });
      showToast('error', '清理缓存失败', message);
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
      setToast(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      logger.error('导入远端快捷输入模板失败', { message });
      showToast('error', '导入快捷输入模板失败', message);
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
      setToast(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      logger.error('恢复默认配置失败', { message });
      showToast('error', '恢复默认失败', message);
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
      setToast(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      setSyncFeedback({
        tone: 'error',
        message,
      });
      showToast('error', '同步连接测试失败', message);
    } finally {
      setTestingSync(false);
    }
  };

  const handleTestModel = async (modelId: string) => {
    const model = draftConfig.models.find((item) => item.id === modelId && item.deletedAt === null);
    if (!model) {
      showToast('error', '模型测试失败', '未找到要测试的模型');
      return;
    }

    setTestingModelId(modelId);
    try {
      const result = await settingsApi.testModel(model, draftConfig.basic.llmRequestTimeoutSeconds);
      showToast('success', '模型测试成功', result.text || `${result.provider} 已返回空文本`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      logger.error('模型测试失败', { modelId, message });
      showToast('error', '模型测试失败', message);
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
        <header className="grid gap-2 border border-border/70 px-3 py-2 ring-1 ring-foreground/8">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex size-7 items-center justify-center border border-border/70 text-primary">
                <Icon name="settings" size={16} />
              </span>
              <div>
                <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Think Bot SP</p>
                <h1 className="mt-0.5 text-lg font-semibold">{t('settings.title')}</h1>
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

        <section className="grid gap-2 lg:grid-cols-[196px_minmax(0,1fr)] lg:items-start">
          <SettingsNav activeSection={activeSection} onSectionChange={setActiveSection} t={t} />

          <section className={cn(COMPACT_SECTION_CLASS, 'lg:col-start-2')}>
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
                className={COMPACT_SECTION_CLASS}
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
                onTestModel={(model) => void handleTestModel(model.id)}
                testingModelId={testingModelId}
                t={t}
              />
            ) : null}

            {activeSection === 'display' ? (
              <DisplaySettingsPanel
                config={draftConfig}
                disabled={saving}
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
