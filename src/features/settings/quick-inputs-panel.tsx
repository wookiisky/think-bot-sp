import { useEffect, useState, type ReactNode } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon, Trash2Icon } from 'lucide-react';

import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { MiniConfirm } from '../../components/ui/mini-confirm';
import { MultiSelectPopover } from '../../components/ui/multi-select-popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import { Tooltip } from '../../components/ui/tooltip';
import { getEnabledCompleteModels, sanitizeParallelModelIds } from '../../domain/config/config-schema';
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
  /** 切换展开态。 */
  onToggle(): void;
  /** 上移当前项。 */
  onMoveUp(): void;
  /** 下移当前项。 */
  onMoveDown(): void;
  /** 删除当前项。 */
  onDelete(): void;
  /** 切换自动触发。 */
  onToggleAutoTrigger(autoTrigger: boolean): void;
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
  onToggle,
  onMoveUp,
  onMoveDown,
  onDelete,
  onToggleAutoTrigger,
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
      data-testid={`quick-input-item-${item.id}`}
    >
      <section
        className={[
          'grid gap-2.5 rounded-2xl border px-3 py-2.5 transition-colors',
          expanded ? 'border-primary bg-primary/6' : 'border-border/70 bg-muted/20',
        ].join(' ')}
      >
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/70 text-sm text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`${t('settings.dragQuickInput')}:${item.name}`}
            disabled={disabled}
            {...attributes}
            {...listeners}
          >
            <GripVerticalIcon className="size-4" />
          </button>

          <button
            type="button"
            className="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden text-left"
            data-testid={`quick-input-summary-${item.id}`}
            onClick={onToggle}
          >
            <span className="truncate text-xs font-semibold">{item.name}</span>
            <span className="truncate text-xs text-muted-foreground">{preview}</span>
          </button>

          <div className="flex shrink-0 items-center gap-1.5">
            <Tooltip content={t('settings.moveUp')}>
              <Button type="button" variant="outline" size="icon-sm" aria-label={t('settings.moveUp')} onClick={onMoveUp} disabled={disabled}>
                <ArrowUpIcon />
              </Button>
            </Tooltip>
            <Tooltip content={t('settings.moveDown')}>
              <Button type="button" variant="outline" size="icon-sm" aria-label={t('settings.moveDown')} onClick={onMoveDown} disabled={disabled}>
                <ArrowDownIcon />
              </Button>
            </Tooltip>
            <MiniConfirm
              message={t('settings.deleteQuickInput')}
              cancelLabel={t('common.cancel')}
              confirmLabel={t('settings.deleteQuickInput')}
              contentTestId={`quick-input-delete-confirm-${item.id}`}
              onConfirm={onDelete}
            >
              <Button type="button" variant="outline" size="icon-sm" aria-label={t('settings.deleteQuickInput')} disabled={disabled}>
                <Trash2Icon />
              </Button>
            </MiniConfirm>
            <label className="flex items-center gap-1.5 text-xs/relaxed">
              <input
                aria-label={`${t('settings.quickInputAutoTrigger')}:${item.name}`}
                type="checkbox"
                checked={item.autoTrigger}
                disabled={disabled}
                onChange={(event) => onToggleAutoTrigger(event.target.checked)}
              />
              <span className="font-medium">{t('settings.quickInputAutoTrigger')}</span>
            </label>
          </div>
        </div>

        {expanded ? <div className="grid gap-3 border-t border-border/70 pt-3">{children}</div> : null}
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
  const [expandedQuickInputId, setExpandedQuickInputId] = useState<string | null>(null);
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

    if (expandedQuickInputId !== null && !visibleQuickInputs.some((item) => item.id === expandedQuickInputId)) {
      setExpandedQuickInputId(null);
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
    parallelModelIds: [],
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
    <Card size="sm" aria-label={t('settings.promptTabs')} className="rounded-[26px] bg-card/90 py-0 shadow-xl ring-1 ring-foreground/8">
      <CardHeader className="gap-1.5 border-b border-border/70 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="grid gap-1">
            <CardTitle className="text-base">{t('settings.promptTabs')}</CardTitle>
            <CardDescription>{t('settings.quickInputsDescription')}</CardDescription>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" type="button" variant="outline" onClick={onImportTemplates} disabled={disabled || importingTemplates}>
              {importingTemplates ? t('settings.importingQuickInputTemplates') : t('settings.importQuickInputTemplates')}
            </Button>
            <Button size="sm" type="button" variant="outline" onClick={handleAddQuickInput} disabled={disabled}>
              {t('settings.addQuickInput')}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="grid gap-3 px-4 py-4">
        {visibleQuickInputs.length > 0 ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={visibleQuickInputs.map((item) => item.id)} strategy={verticalListSortingStrategy}>
              <ul className="grid gap-2.5">
                {visibleQuickInputs.map((item) => {
                  const expanded = item.id === expandedQuickInputId;
                  const hasMissingModelReference =
                    !!item.modelId && !availableModels.some((model) => model.id === item.modelId);
                  const parallelModelIds = sanitizeParallelModelIds(config, item.parallelModelIds);
                  const hasMissingParallelModels = parallelModelIds.length !== item.parallelModelIds.length;
                  const modelSelectValue = hasMissingModelReference ? `__missing__:${item.modelId ?? ''}` : item.modelId ?? '__none__';

                  return (
                    <SortableQuickInputCard
                      key={item.id}
                      item={item}
                      expanded={expanded}
                      disabled={disabled}
                      preview={buildQuickInputPreview(item.prompt, t('settings.quickInputPromptEmpty'))}
                      onToggle={() => setExpandedQuickInputId(expanded ? null : item.id)}
                      onMoveUp={() => moveQuickInput(item.id, -1)}
                      onMoveDown={() => moveQuickInput(item.id, 1)}
                      onDelete={() => handleDeleteQuickInput(item.id)}
                      onToggleAutoTrigger={(autoTrigger) => updateQuickInput(item.id, { autoTrigger })}
                      t={t}
                    >
                      <label className="grid gap-1.5">
                        <span className="text-sm font-medium">{t('settings.quickInputName')}</span>
                        <Input
                          aria-label={t('settings.quickInputName')}
                          value={item.name}
                          disabled={disabled}
                          onChange={(event) => updateQuickInput(item.id, { name: event.target.value })}
                        />
                      </label>

                      <label className="grid gap-1.5">
                        <span className="text-sm font-medium">{t('settings.quickInputPrompt')}</span>
                        <Textarea
                          aria-label={t('settings.quickInputPrompt')}
                          value={item.prompt}
                          disabled={disabled}
                          className="min-h-20"
                          onChange={(event) => updateQuickInput(item.id, { prompt: event.target.value })}
                        />
                      </label>

                      <div className="grid gap-1.5">
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="grid gap-1.5">
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
                              <SelectTrigger aria-label={t('settings.quickInputModel')} size="sm" className="w-full">
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
                            {hasMissingModelReference ? (
                              <p className="m-0 text-sm text-amber-700 dark:text-amber-300">{t('settings.quickInputModelMissing')}</p>
                            ) : null}
                          </label>

                          <label className="grid gap-1.5">
                            <span className="text-sm font-medium">{t('settings.quickInputBranchModels')}</span>
                            <MultiSelectPopover
                              label={t('settings.quickInputBranchModels')}
                              placeholder={t('settings.multiSelectPlaceholder')}
                              summaryTemplate={t('settings.multiSelectSummary')}
                              options={availableModels.map((model) => ({
                                value: model.id,
                                label: model.name,
                              }))}
                              values={parallelModelIds}
                              emptyText={t('settings.noBranchModels')}
                              disabled={disabled}
                              onChange={(nextValues) => updateQuickInput(item.id, { parallelModelIds: nextValues })}
                            />
                            {hasMissingParallelModels ? (
                              <p className="m-0 text-sm text-amber-700 dark:text-amber-300">{t('settings.quickInputBranchModelsMissing')}</p>
                            ) : null}
                          </label>
                        </div>
                      </div>
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
