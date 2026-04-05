import { useEffect, useState, type ReactNode } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import { getEnabledCompleteModels, sanitizeBranchModelIds } from '../../domain/config/config-schema';
import type { ExtensionConfig } from '../../domain/config/config-schema';

type QuickInputsPanelProps = {
  /** 当前草稿配置。 */
  config: ExtensionConfig;
  /** 是否禁用交互。 */
  disabled: boolean;
  /** 是否正在导入远端模板。 */
  importingTemplates: boolean;
  /** 配置变更回调。 */
  onChange(nextConfig: ExtensionConfig): void;
  /** 导入远端模板。 */
  onImportTemplates(): void;
  /** 文案翻译函数。 */
  t(key: string): string;
};

type SortableQuickInputCardProps = {
  /** 当前快捷输入。 */
  item: ExtensionConfig['quickInputs'][number];
  /** 是否展开。 */
  expanded: boolean;
  /** 是否禁用操作。 */
  disabled: boolean;
  /** 快捷输入摘要预览。 */
  preview: string;
  /** 快捷输入状态文案。 */
  statusLabel: string;
  /** 切换展开态。 */
  onToggle(): void;
  /** 展开区内容。 */
  children?: ReactNode;
  /** 文案翻译函数。 */
  t(key: string): string;
};

/** 生成快捷输入摘要预览。 */
const buildQuickInputPreview = (prompt: string, emptyLabel: string): string => {
  const normalizedPrompt = prompt.replace(/\s+/g, ' ').trim();
  if (!normalizedPrompt) {
    return emptyLabel;
  }

  return normalizedPrompt.length > 96 ? `${normalizedPrompt.slice(0, 96)}...` : normalizedPrompt;
};

/** 可拖拽的快捷输入卡片。 */
const SortableQuickInputCard = ({
  item,
  expanded,
  disabled,
  preview,
  statusLabel,
  onToggle,
  children,
  t,
}: SortableQuickInputCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled,
  });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={isDragging ? 'opacity-80' : undefined}
    >
      <section
        className={[
          'grid gap-4 rounded-2xl border px-4 py-4 transition-colors',
          expanded ? 'border-primary bg-primary/6' : 'border-border/70 bg-muted/20',
        ].join(' ')}
      >
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/70 text-sm text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`${t('settings.dragQuickInput')}:${item.name}`}
            disabled={disabled}
            {...attributes}
            {...listeners}
          >
            ::
          </button>
          <button type="button" className="grid flex-1 gap-1 text-left" onClick={onToggle}>
            <span className="text-sm font-semibold">{item.name}</span>
            <span className="text-xs text-muted-foreground">{preview}</span>
          </button>
          <span className="rounded-full border border-border/70 px-2 py-1 text-xs text-muted-foreground">{statusLabel}</span>
        </div>

        {expanded ? <div className="grid gap-4 border-t border-border/70 pt-4">{children}</div> : null}
      </section>
    </li>
  );
};

/** 快捷输入配置面板。 */
export const QuickInputsPanel = ({
  config,
  disabled,
  importingTemplates,
  onChange,
  onImportTemplates,
  t,
}: QuickInputsPanelProps) => {
  const [expandedQuickInputId, setExpandedQuickInputId] = useState<string | null | undefined>(undefined);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const visibleQuickInputs = [...config.quickInputs]
    .filter((item) => item.deletedAt === null)
    .sort((left, right) => left.order - right.order);
  const availableModels = getEnabledCompleteModels(config);

  useEffect(() => {
    if (visibleQuickInputs.length === 0) {
      setExpandedQuickInputId(null);
      return;
    }

    if (expandedQuickInputId === undefined) {
      setExpandedQuickInputId(visibleQuickInputs[0].id);
      return;
    }

    if (expandedQuickInputId !== null && !visibleQuickInputs.some((item) => item.id === expandedQuickInputId)) {
      setExpandedQuickInputId(visibleQuickInputs[0].id);
    }
  }, [expandedQuickInputId, visibleQuickInputs]);

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

  /** 按当前可见顺序重排快捷输入。 */
  const reorderVisibleQuickInputs = (orderedVisibleQuickInputs: ExtensionConfig['quickInputs']) => {
    const deletedQuickInputs = config.quickInputs.filter((item) => item.deletedAt !== null);
    updateQuickInputs([...orderedVisibleQuickInputs, ...deletedQuickInputs]);
  };

  /** 更新单个快捷输入。 */
  const updateQuickInput = (quickInputId: string, patch: Partial<ExtensionConfig['quickInputs'][number]>) => {
    updateQuickInputs(
      config.quickInputs.map((item) =>
        item.id === quickInputId
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
    branchModelIds: [],
    order: config.quickInputs.length,
    deletedAt: null,
  });

  /** 新增快捷输入并自动展开。 */
  const handleAddQuickInput = () => {
    const nextQuickInput = createQuickInput();
    updateQuickInputs([...config.quickInputs, nextQuickInput]);
    setExpandedQuickInputId(nextQuickInput.id);
  };

  /** 软删除单个快捷输入。 */
  const handleDeleteQuickInput = (quickInputId: string) => {
    const nextQuickInputs = config.quickInputs.map((item) =>
      item.id === quickInputId
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
    setExpandedQuickInputId(nextVisibleQuickInputs[0]?.id ?? null);
  };

  /** 按相对方向调整单个快捷输入顺序。 */
  const moveQuickInput = (quickInputId: string, direction: -1 | 1) => {
    const currentIndex = visibleQuickInputs.findIndex((item) => item.id === quickInputId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= visibleQuickInputs.length) {
      return;
    }

    const reorderedVisibleQuickInputs = [...visibleQuickInputs];
    const [movedItem] = reorderedVisibleQuickInputs.splice(currentIndex, 1);
    reorderedVisibleQuickInputs.splice(targetIndex, 0, movedItem);
    reorderVisibleQuickInputs(reorderedVisibleQuickInputs);
  };

  /** 处理拖拽排序结束。 */
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const currentIndex = visibleQuickInputs.findIndex((item) => item.id === active.id);
    const targetIndex = visibleQuickInputs.findIndex((item) => item.id === over.id);
    if (currentIndex < 0 || targetIndex < 0) {
      return;
    }

    reorderVisibleQuickInputs(arrayMove(visibleQuickInputs, currentIndex, targetIndex));
  };

  return (
    <Card aria-label={t('settings.promptTabs')} className="rounded-3xl bg-card/90 py-0 shadow-xl ring-1 ring-foreground/8">
      <CardHeader className="gap-2 border-b border-border/70 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle className="text-base">{t('settings.promptTabs')}</CardTitle>
            <CardDescription>{t('settings.quickInputsDescription')}</CardDescription>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={onImportTemplates} disabled={disabled || importingTemplates}>
              {importingTemplates ? t('settings.importingQuickInputTemplates') : t('settings.importQuickInputTemplates')}
            </Button>
            <Button type="button" variant="outline" onClick={handleAddQuickInput} disabled={disabled}>
              {t('settings.addQuickInput')}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="grid gap-4 px-5 py-5">
        {visibleQuickInputs.length > 0 ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={visibleQuickInputs.map((item) => item.id)} strategy={verticalListSortingStrategy}>
              <ul className="grid gap-3">
                {visibleQuickInputs.map((item) => {
                  const expanded = item.id === expandedQuickInputId;
                  const hasMissingModelReference =
                    !!item.modelId && !availableModels.some((model) => model.id === item.modelId);
                  const branchModelIds = sanitizeBranchModelIds(config, item.branchModelIds);
                  const hasMissingBranchModels = branchModelIds.length !== item.branchModelIds.length;
                  const modelSelectValue = hasMissingModelReference ? `__missing__:${item.modelId ?? ''}` : item.modelId ?? '__none__';

                  return (
                    <SortableQuickInputCard
                      key={item.id}
                      item={item}
                      expanded={expanded}
                      disabled={disabled}
                      preview={buildQuickInputPreview(item.prompt, t('settings.quickInputPromptEmpty'))}
                      statusLabel={item.autoTrigger ? t('settings.enabled') : t('settings.disabled')}
                      onToggle={() => setExpandedQuickInputId(expanded ? null : item.id)}
                      t={t}
                    >
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" onClick={() => moveQuickInput(item.id, -1)} disabled={disabled}>
                          {t('settings.moveUp')}
                        </Button>
                        <Button type="button" variant="outline" onClick={() => moveQuickInput(item.id, 1)} disabled={disabled}>
                          {t('settings.moveDown')}
                        </Button>
                        <Button type="button" variant="outline" onClick={() => handleDeleteQuickInput(item.id)} disabled={disabled}>
                          {t('settings.deleteQuickInput')}
                        </Button>
                      </div>

                      <label className="grid gap-2">
                        <span className="text-sm font-medium">{t('settings.quickInputName')}</span>
                        <Input
                          aria-label={t('settings.quickInputName')}
                          value={item.name}
                          disabled={disabled}
                          onChange={(event) => updateQuickInput(item.id, { name: event.target.value })}
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm font-medium">{t('settings.quickInputPrompt')}</span>
                        <Textarea
                          aria-label={t('settings.quickInputPrompt')}
                          value={item.prompt}
                          disabled={disabled}
                          onChange={(event) => updateQuickInput(item.id, { prompt: event.target.value })}
                        />
                      </label>

                      <label className="flex items-center gap-2 text-sm">
                        <input
                          aria-label={t('settings.quickInputAutoTrigger')}
                          type="checkbox"
                          checked={item.autoTrigger}
                          disabled={disabled}
                          onChange={(event) => updateQuickInput(item.id, { autoTrigger: event.target.checked })}
                        />
                        <span className="font-medium">{t('settings.quickInputAutoTrigger')}</span>
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm font-medium">{t('settings.quickInputModel')}</span>
                        <Select
                          value={modelSelectValue}
                          disabled={disabled}
                          onValueChange={(value) =>
                            updateQuickInput(item.id, {
                              modelId:
                                value === '__none__'
                                  ? null
                                  : value.startsWith('__missing__:')
                                    ? item.modelId
                                    : value,
                            })
                          }
                        >
                          <SelectTrigger aria-label={t('settings.quickInputModel')} className="w-full">
                            <SelectValue placeholder={t('settings.quickInputModel')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">{t('settings.quickInputNoModel')}</SelectItem>
                            {hasMissingModelReference ? <SelectItem value={modelSelectValue}>{item.modelId}</SelectItem> : null}
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

                      <fieldset className="grid gap-3 rounded-2xl border border-border/70 px-4 py-3">
                        <legend className="px-1 text-sm font-medium">{t('settings.quickInputBranchModels')}</legend>
                        <p className="m-0 text-sm text-muted-foreground">{t('settings.quickInputBranchModelsDescription')}</p>
                        {availableModels.length > 0 ? (
                          <div className="grid gap-2">
                            {availableModels.map((model) => (
                              <label key={model.id} className="flex items-center gap-2 text-sm">
                                <input
                                  aria-label={`${t('settings.quickInputBranchModels')}:${model.name}`}
                                  type="checkbox"
                                  checked={branchModelIds.includes(model.id)}
                                  disabled={disabled}
                                  onChange={(event) =>
                                    updateQuickInput(item.id, {
                                      branchModelIds: event.target.checked
                                        ? [...branchModelIds, model.id]
                                        : branchModelIds.filter((id) => id !== model.id),
                                    })
                                  }
                                />
                                <span>{model.name}</span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <p className="m-0 text-sm text-muted-foreground">{t('settings.noBranchModels')}</p>
                        )}
                        {hasMissingBranchModels ? (
                          <p className="m-0 text-sm text-amber-700 dark:text-amber-300">{t('settings.quickInputBranchModelsMissing')}</p>
                        ) : null}
                      </fieldset>
                    </SortableQuickInputCard>
                  );
                })}
              </ul>
            </SortableContext>
          </DndContext>
        ) : (
          <p className="m-0 text-sm text-muted-foreground">{t('settings.noQuickInputs')}</p>
        )}
      </CardContent>
    </Card>
  );
};
