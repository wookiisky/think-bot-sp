import { useEffect, useState } from 'react';

import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import type { ExtensionConfig } from '../../domain/config/config-schema';
import { isBuiltInBlacklistRuleId } from '../../domain/config/config-schema';
import { createBlacklistService } from '../../services/blacklist/blacklist-service';

type BlacklistSettingsPanelProps = {
  /** 当前草稿配置。 */
  config: ExtensionConfig;
  /** 是否禁用交互。 */
  disabled: boolean;
  /** 配置变更回调。 */
  onChange(nextConfig: ExtensionConfig): void;
  /** 文案翻译函数。 */
  t(key: string): string;
};

type RuleType = ExtensionConfig['blacklist'][number]['type'];

/** 黑名单设置面板。 */
export const BlacklistSettingsPanel = ({
  config,
  disabled,
  onChange,
  t,
}: BlacklistSettingsPanelProps) => {
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [testUrl, setTestUrl] = useState('');
  const [testResult, setTestResult] = useState<{
    /** 结果文案。 */
    message: string;
    /** 反馈语气。 */
    tone: 'success' | 'error' | 'muted';
  } | null>(null);

  const visibleRules = config.blacklist.filter((rule) => rule.deletedAt === null);
  const activeRule = visibleRules.find((rule) => rule.id === selectedRuleId) ?? visibleRules[0] ?? null;

  useEffect(() => {
    if (visibleRules.length === 0) {
      setSelectedRuleId(null);
      return;
    }

    if (!selectedRuleId || !visibleRules.some((rule) => rule.id === selectedRuleId)) {
      setSelectedRuleId(visibleRules[0].id);
    }
  }, [selectedRuleId, visibleRules]);

  useEffect(() => {
    setTestResult(null);
  }, [selectedRuleId]);

  const updateBlacklist = (blacklist: ExtensionConfig['blacklist']) => {
    onChange({
      ...config,
      blacklist,
    });
  };

  const updateActiveRule = (patch: Partial<ExtensionConfig['blacklist'][number]>) => {
    if (!activeRule) {
      return;
    }

    updateBlacklist(
      config.blacklist.map((rule) =>
        rule.id === activeRule.id
          ? {
              ...rule,
              ...patch,
            }
          : rule,
      ),
    );
  };

  const createRule = (): ExtensionConfig['blacklist'][number] => ({
    id: `blacklist-${config.blacklist.length + 1}-${Date.now()}`,
    type: 'domain',
    pattern: '',
    enabled: true,
    deletedAt: null,
  });

  const handleAddRule = () => {
    const nextRule = createRule();
    updateBlacklist([...config.blacklist, nextRule]);
    setSelectedRuleId(nextRule.id);
  };

  const handleDeleteRule = () => {
    if (!activeRule) {
      return;
    }

    const nextRules = config.blacklist.map((rule) =>
      rule.id === activeRule.id
        ? {
            ...rule,
            deletedAt: Date.now(),
          }
        : rule,
    );
    const nextVisibleRules = nextRules.filter((rule) => rule.deletedAt === null);
    updateBlacklist(nextRules);
    setSelectedRuleId(nextVisibleRules[0]?.id ?? null);
    setTestResult(null);
  };

  const handleResetDefaults = () => {
    const nextRules = createBlacklistService({
      rules: config.blacklist,
    }).resetDefaults();
    updateBlacklist(nextRules);
    setSelectedRuleId(nextRules[0]?.id ?? null);
    setTestResult(null);
  };

  const handleTestRule = () => {
    if (!activeRule) {
      return;
    }

    const result = createBlacklistService({
      rules: config.blacklist,
    }).testPattern(activeRule, testUrl);

    if (!result.valid) {
      setTestResult({
        message: result.errorMessage ?? t('settings.blacklistRuleTestInvalid'),
        tone: 'error',
      });
      return;
    }

    setTestResult({
      message: result.matched ? t('settings.blacklistRuleTestMatched') : t('settings.blacklistRuleTestNotMatched'),
      tone: result.matched ? 'success' : 'muted',
    });
  };

  return (
    <section
      id="settings-panel-blacklist"
      role="tabpanel"
      aria-labelledby="settings-tab-blacklist"
      className="grid gap-6"
    >
      <Card className="rounded-3xl bg-card py-0 ring-1 ring-foreground/8">
        <CardHeader className="gap-2 border-b border-border/70 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
              <CardTitle className="text-base">{t('settings.blacklistSettings')}</CardTitle>
              <CardDescription>{t('settings.blacklistDescription')}</CardDescription>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={handleResetDefaults} disabled={disabled}>
                {t('settings.blacklistResetDefaults')}
              </Button>
              <Button type="button" variant="outline" onClick={handleAddRule} disabled={disabled}>
                {t('settings.addBlacklistRule')}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="grid gap-4 px-5 py-5">
          {visibleRules.length > 0 ? (
            <ul className="grid gap-3">
              {visibleRules.map((rule) => {
                const selected = rule.id === activeRule?.id;
                return (
                  <li key={rule.id}>
                    <button
                      type="button"
                      className={[
                        'grid w-full gap-1 rounded-2xl border px-4 py-3 text-left transition-colors',
                        selected ? 'border-primary bg-primary/8' : 'border-border/70 bg-muted/30 hover:bg-muted/60',
                      ].join(' ')}
                      onClick={() => setSelectedRuleId(rule.id)}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">{rule.pattern || t('settings.blacklistRulePatternEmpty')}</span>
                        {isBuiltInBlacklistRuleId(rule.id) ? (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                            {t('settings.blacklistBuiltIn')}
                          </span>
                        ) : null}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {t(`settings.blacklistRuleType.${toRuleTypeKey(rule.type)}`)} / {rule.enabled ? t('settings.enabled') : t('settings.disabled')}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="m-0 text-sm text-muted-foreground">{t('settings.noBlacklistRules')}</p>
          )}

          {activeRule ? (
            <section className="grid gap-4 rounded-2xl border border-border/70 bg-muted/20 px-4 py-4">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={handleDeleteRule} disabled={disabled}>
                  {t('settings.deleteBlacklistRule')}
                </Button>
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-medium">{t('settings.blacklistRuleType')}</span>
                <Select
                  value={activeRule.type}
                  disabled={disabled}
                  onValueChange={(value) => updateActiveRule({ type: value as RuleType })}
                >
                  <SelectTrigger aria-label={t('settings.blacklistRuleType')} className="w-full">
                    <SelectValue placeholder={t('settings.blacklistRuleType')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="domain">{t('settings.blacklistRuleType.domain')}</SelectItem>
                    <SelectItem value="url-prefix">{t('settings.blacklistRuleType.urlPrefix')}</SelectItem>
                    <SelectItem value="regex">{t('settings.blacklistRuleType.regex')}</SelectItem>
                  </SelectContent>
                </Select>
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium">{t('settings.blacklistRulePattern')}</span>
                <Input
                  aria-label={t('settings.blacklistRulePattern')}
                  value={activeRule.pattern}
                  disabled={disabled}
                  onChange={(event) => updateActiveRule({ pattern: event.target.value })}
                />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  aria-label={t('settings.blacklistRuleEnabled')}
                  type="checkbox"
                  checked={activeRule.enabled}
                  disabled={disabled}
                  onChange={(event) => updateActiveRule({ enabled: event.target.checked })}
                />
                <span className="font-medium">{t('settings.blacklistRuleEnabled')}</span>
              </label>

              <fieldset className="grid gap-3 rounded-2xl border border-border/70 px-4 py-3">
                <legend className="px-1 text-sm font-medium">{t('settings.blacklistRuleTest')}</legend>
                <label className="grid gap-2">
                  <span className="text-sm font-medium">{t('settings.blacklistRuleTestUrl')}</span>
                  <Input
                    aria-label={t('settings.blacklistRuleTestUrl')}
                    value={testUrl}
                    disabled={disabled}
                    placeholder="https://example.com/search?q=ai"
                    onChange={(event) => setTestUrl(event.target.value)}
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled || testUrl.trim().length === 0}
                  onClick={handleTestRule}
                >
                  {t('settings.blacklistRuleTest')}
                </Button>
                {testResult ? (
                  <p
                    className={[
                      'm-0 text-sm',
                      testResult.tone === 'success'
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : testResult.tone === 'error'
                          ? 'text-destructive'
                          : 'text-muted-foreground',
                    ].join(' ')}
                  >
                    {testResult.message}
                  </p>
                ) : null}
              </fieldset>
            </section>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
};

/** 把规则类型转成国际化 key 片段。 */
const toRuleTypeKey = (type: RuleType) => {
  switch (type) {
    case 'url-prefix':
      return 'urlPrefix';
    default:
      return type;
  }
};
