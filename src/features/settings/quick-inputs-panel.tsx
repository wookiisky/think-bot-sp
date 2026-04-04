/* eslint-disable no-unused-vars */
import { useEffect, useState } from 'react';

import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import { getEnabledCompleteModels } from '../../domain/config/config-schema';
import type { ExtensionConfig } from '../../domain/config/config-schema';

type QuickInputsPanelProps = {
  /** 当前草稿配置。 */
  config: ExtensionConfig;
  /** 是否禁用交互。 */
  disabled: boolean;
  /** 配置变更回调。 */
  onChange(nextConfig: ExtensionConfig): void;
  /** 文案翻译函数。 */
  t(key: string): string;
};

/** 快捷输入配置面板。 */
export const QuickInputsPanel = ({ config, disabled, onChange, t }: QuickInputsPanelProps) => {
  const [selectedQuickInputId, setSelectedQuickInputId] = useState<string | null>(null);

  const visibleQuickInputs = [...config.quickInputs]
    .filter((item) => item.deletedAt === null)
    .sort((left, right) => left.order - right.order);
  const availableModels = getEnabledCompleteModels(config);
  const activeQuickInput = visibleQuickInputs.find((item) => item.id === selectedQuickInputId) ?? visibleQuickInputs[0] ?? null;
  const hasMissingModelReference =
    !!activeQuickInput?.modelId && !availableModels.some((model) => model.id === activeQuickInput.modelId);
  const modelSelectValue = hasMissingModelReference
    ? `__missing__:${activeQuickInput?.modelId ?? ''}`
    : activeQuickInput?.modelId ?? '__none__';

  useEffect(() => {
    if (visibleQuickInputs.length === 0) {
      setSelectedQuickInputId(null);
      return;
    }

    if (!selectedQuickInputId || !visibleQuickInputs.some((item) => item.id === selectedQuickInputId)) {
      setSelectedQuickInputId(visibleQuickInputs[0].id);
    }
  }, [selectedQuickInputId, visibleQuickInputs]);

  const syncOrders = (quickInputs: ExtensionConfig['quickInputs']) =>
    quickInputs.map((item, index) => ({
      ...item,
      order: index,
    }));

  const updateQuickInputs = (quickInputs: ExtensionConfig['quickInputs']) => {
    onChange({
      ...config,
      quickInputs: syncOrders(quickInputs),
    });
  };

  const updateActiveQuickInput = (patch: Partial<ExtensionConfig['quickInputs'][number]>) => {
    if (!activeQuickInput) {
      return;
    }

    updateQuickInputs(
      config.quickInputs.map((item) =>
        item.id === activeQuickInput.id
          ? {
              ...item,
              ...patch,
            }
          : item,
      ),
    );
  };

  const createQuickInput = (): ExtensionConfig['quickInputs'][number] => ({
    id: `quick-${config.quickInputs.length + 1}-${Date.now()}`,
    name: '新快捷输入',
    prompt: '',
    autoTrigger: false,
    modelId: null,
    order: config.quickInputs.length,
    deletedAt: null,
  });

  const handleAddQuickInput = () => {
    const nextQuickInput = createQuickInput();
    updateQuickInputs([...config.quickInputs, nextQuickInput]);
    setSelectedQuickInputId(nextQuickInput.id);
  };

  const handleDeleteQuickInput = () => {
    if (!activeQuickInput) {
      return;
    }

    const nextQuickInputs = config.quickInputs.map((item) =>
      item.id === activeQuickInput.id
        ? {
            ...item,
            deletedAt: Date.now(),
          }
        : item,
    );
    const nextVisibleQuickInputs = nextQuickInputs
      .filter((item) => item.deletedAt === null)
      .sort((left, right) => left.order - right.order);

    updateQuickInputs(nextQuickInputs);
    setSelectedQuickInputId(nextVisibleQuickInputs[0]?.id ?? null);
  };

  const moveActiveQuickInput = (direction: -1 | 1) => {
    if (!activeQuickInput) {
      return;
    }

    const currentIndex = visibleQuickInputs.findIndex((item) => item.id === activeQuickInput.id);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= visibleQuickInputs.length) {
      return;
    }

    const reorderedVisibleQuickInputs = [...visibleQuickInputs];
    const [movedItem] = reorderedVisibleQuickInputs.splice(currentIndex, 1);
    reorderedVisibleQuickInputs.splice(targetIndex, 0, movedItem);
    const deletedQuickInputs = config.quickInputs.filter((item) => item.deletedAt !== null);

    updateQuickInputs([...reorderedVisibleQuickInputs, ...deletedQuickInputs]);
  };

  return (
    <Card aria-label={t('settings.promptTabs')} className="rounded-3xl bg-card/90 py-0 shadow-xl ring-1 ring-foreground/8">
      <CardHeader className="gap-2 border-b border-border/70 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle className="text-base">{t('settings.promptTabs')}</CardTitle>
            <CardDescription>{t('settings.quickInputsDescription')}</CardDescription>
          </div>

          <Button type="button" variant="outline" onClick={handleAddQuickInput} disabled={disabled}>
            {t('settings.addQuickInput')}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="grid gap-4 px-5 py-5">
        {visibleQuickInputs.length > 0 ? (
          <ul className="grid gap-3">
            {visibleQuickInputs.map((item) => {
              const selected = item.id === activeQuickInput?.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={[
                      'grid w-full gap-1 rounded-2xl border px-4 py-3 text-left transition-colors',
                      selected ? 'border-primary bg-primary/8' : 'border-border/70 bg-muted/30 hover:bg-muted/60',
                    ].join(' ')}
                    onClick={() => setSelectedQuickInputId(item.id)}
                  >
                    <span className="text-sm font-semibold">{item.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.autoTrigger ? t('settings.enabled') : t('settings.disabled')}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="m-0 text-sm text-muted-foreground">{t('settings.noQuickInputs')}</p>
        )}

        {activeQuickInput ? (
          <section className="grid gap-4 rounded-2xl border border-border/70 bg-muted/20 px-4 py-4">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => moveActiveQuickInput(-1)} disabled={disabled}>
                {t('settings.moveUp')}
              </Button>
              <Button type="button" variant="outline" onClick={() => moveActiveQuickInput(1)} disabled={disabled}>
                {t('settings.moveDown')}
              </Button>
              <Button type="button" variant="outline" onClick={handleDeleteQuickInput} disabled={disabled}>
                {t('settings.deleteQuickInput')}
              </Button>
            </div>

            <label className="grid gap-2">
              <span className="text-sm font-medium">{t('settings.quickInputName')}</span>
              <Input
                aria-label={t('settings.quickInputName')}
                value={activeQuickInput.name}
                disabled={disabled}
                onChange={(event) => updateActiveQuickInput({ name: event.target.value })}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">{t('settings.quickInputPrompt')}</span>
              <Textarea
                aria-label={t('settings.quickInputPrompt')}
                value={activeQuickInput.prompt}
                disabled={disabled}
                onChange={(event) => updateActiveQuickInput({ prompt: event.target.value })}
              />
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                aria-label={t('settings.quickInputAutoTrigger')}
                type="checkbox"
                checked={activeQuickInput.autoTrigger}
                disabled={disabled}
                onChange={(event) => updateActiveQuickInput({ autoTrigger: event.target.checked })}
              />
              <span className="font-medium">{t('settings.quickInputAutoTrigger')}</span>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">{t('settings.quickInputModel')}</span>
              <Select
                value={modelSelectValue}
                disabled={disabled}
                onValueChange={(value) => updateActiveQuickInput({ modelId: value === '__none__' ? null : value })}
              >
                <SelectTrigger aria-label={t('settings.quickInputModel')} className="w-full">
                  <SelectValue placeholder={t('settings.quickInputModel')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t('settings.quickInputNoModel')}</SelectItem>
                  {hasMissingModelReference ? (
                    <SelectItem value={modelSelectValue}>{activeQuickInput.modelId}</SelectItem>
                  ) : null}
                  {availableModels.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            {hasMissingModelReference ? (
              <p className="m-0 text-sm text-amber-700 dark:text-amber-300">{t('settings.quickInputModelMissing')}</p>
            ) : null}
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
};
