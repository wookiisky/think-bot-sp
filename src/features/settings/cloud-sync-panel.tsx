import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import type { ExtensionConfig } from '../../domain/config/config-schema';
import { COMPACT_CARD_CONTENT_CLASS, COMPACT_CARD_HEADER_CLASS, COMPACT_SECTION_CLASS } from '../../ui/compact-layout';

type SyncFeedback = {
  /** 反馈语气。 */
  tone: 'success' | 'error';
  /** 展示文案。 */
  message: string;
};

type CloudSyncPanelProps = {
  /** 当前草稿配置。 */
  config: ExtensionConfig;
  /** 是否禁用编辑。 */
  disabled: boolean;
  /** 是否正在测试连接。 */
  testing: boolean;
  /** 是否正在执行同步。 */
  syncing: boolean;
  /** 最近反馈。 */
  feedback: SyncFeedback | null;
  /** 配置变更回调。 */
  onChange(nextConfig: ExtensionConfig): void;
  /** 测试连接动作。 */
  onTestConnection(): Promise<void>;
  /** 执行同步动作。 */
  onSyncNow(): Promise<void>;
  /** 文案翻译函数。 */
  t(key: string): string;
};

/** 云同步面板。 */
export const CloudSyncPanel = ({
  config,
  disabled,
  testing,
  syncing,
  feedback,
  onChange,
  onTestConnection,
  onSyncNow,
  t,
}: CloudSyncPanelProps) => {
  const updateSync = (patch: Partial<ExtensionConfig['sync']>) => {
    onChange({
      ...config,
      sync: {
        ...config.sync,
        ...patch,
      },
    });
  };

  const showGistFields = config.sync.provider === 'gist';
  const showWebdavFields = config.sync.provider === 'webdav';

  return (
    <section id="settings-panel-sync" role="tabpanel" aria-labelledby="settings-tab-sync" className={COMPACT_SECTION_CLASS}>
      <Card size="sm">
        <CardHeader className={COMPACT_CARD_HEADER_CLASS}>
          <CardTitle className="text-base">{t('settings.syncPanel')}</CardTitle>
          <CardDescription>{t('settings.syncDescription')}</CardDescription>
        </CardHeader>
        <CardContent className={COMPACT_CARD_CONTENT_CLASS}>
          <label className="flex items-center gap-2 text-sm">
            <input
              aria-label={t('settings.syncEnabled')}
              type="checkbox"
              checked={config.sync.enabled}
              disabled={disabled}
              onChange={(event) => updateSync({ enabled: event.target.checked })}
            />
            <span className="font-medium">{t('settings.syncEnabled')}</span>
          </label>

          <label className="grid gap-1.5">
            <span className="text-sm font-medium">{t('settings.syncProvider')}</span>
            <Select
              value={config.sync.provider}
              disabled={disabled}
              onValueChange={(value) => updateSync({ provider: value as ExtensionConfig['sync']['provider'] })}
            >
              <SelectTrigger aria-label={t('settings.syncProvider')} size="sm" className="w-full">
                <SelectValue placeholder={t('settings.syncProvider')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('settings.syncProviderNone')}</SelectItem>
                <SelectItem value="gist">{t('settings.syncProviderGist')}</SelectItem>
                <SelectItem value="webdav">{t('settings.syncProviderWebdav')}</SelectItem>
              </SelectContent>
            </Select>
          </label>

          {showGistFields ? (
            <>
              <label className="grid gap-1.5">
                <span className="text-sm font-medium">{t('settings.gistToken')}</span>
                <Input
                  aria-label={t('settings.gistToken')}
                  value={config.sync.gistToken}
                  disabled={disabled}
                  onChange={(event) => updateSync({ gistToken: event.target.value })}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-sm font-medium">{t('settings.gistId')}</span>
                <Input
                  aria-label={t('settings.gistId')}
                  value={config.sync.gistId}
                  disabled={disabled}
                  onChange={(event) => updateSync({ gistId: event.target.value })}
                />
              </label>
            </>
          ) : null}

          {showWebdavFields ? (
            <>
              <label className="grid gap-1.5">
                <span className="text-sm font-medium">{t('settings.webdavUrl')}</span>
                <Input
                  aria-label={t('settings.webdavUrl')}
                  value={config.sync.webdavUrl}
                  disabled={disabled}
                  onChange={(event) => updateSync({ webdavUrl: event.target.value })}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-sm font-medium">{t('settings.webdavUsername')}</span>
                <Input
                  aria-label={t('settings.webdavUsername')}
                  value={config.sync.webdavUsername}
                  disabled={disabled}
                  onChange={(event) => updateSync({ webdavUsername: event.target.value })}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-sm font-medium">{t('settings.webdavPassword')}</span>
                <Input
                  aria-label={t('settings.webdavPassword')}
                  type="password"
                  value={config.sync.webdavPassword}
                  disabled={disabled}
                  onChange={(event) => updateSync({ webdavPassword: event.target.value })}
                />
              </label>
            </>
          ) : null}

          <div className="flex flex-wrap gap-1">
            <Button size="sm" type="button" variant="outline" onClick={() => void onTestConnection()} disabled={disabled || testing}>
              {testing ? `${t('settings.syncTest')}...` : t('settings.syncTest')}
            </Button>
            <Button size="sm" type="button" onClick={() => void onSyncNow()} disabled={disabled || syncing}>
              {syncing ? `${t('settings.syncNow')}...` : t('settings.syncNow')}
            </Button>
          </div>

          <p className="m-0 text-sm text-muted-foreground">
            {t('settings.syncLastSyncedAt')}：{config.sync.lastSyncAt ?? t('settings.syncNever')}
          </p>

          {feedback ? (
            <section
              role="status"
              className={[
                'border px-2 py-1.5 text-sm',
                feedback.tone === 'success'
                  ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border border-destructive/20 bg-destructive/10 text-destructive',
              ].join(' ')}
            >
              {feedback.message}
            </section>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
};
