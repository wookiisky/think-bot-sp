import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import type { ExtensionConfig } from '../../domain/config/config-schema';
import type { ModelConfig } from '../../domain/config/config-schema';
import { ModelForm } from './model-form';

type LanguageModelsPanelProps = {
  /** 当前草稿配置。 */
  config: ExtensionConfig;
  /** 当前选中的模型 id。 */
  selectedModelId: string | null;
  /** 是否禁用交互。 */
  disabled: boolean;
  /** 更新选中模型。 */
  onSelectModel(modelId: string): void;
  /** 更新完整配置。 */
  onChange(nextConfig: ExtensionConfig): void;
  /** 文案翻译函数。 */
  t(key: string): string;
};

type SortableModelSummaryItemProps = {
  /** 当前模型。 */
  model: ModelConfig;
  /** 是否选中。 */
  selected: boolean;
  /** 是否禁用。 */
  disabled: boolean;
  /** 摘要文本。 */
  summary: string;
  /** 选中当前模型。 */
  onSelect(): void;
  /** 文案翻译函数。 */
  t(key: string): string;
};

/** 可拖拽模型摘要行。 */
const SortableModelSummaryItem = ({
  model,
  selected,
  disabled,
  summary,
  onSelect,
  t,
}: SortableModelSummaryItemProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: model.id,
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
      <div
        className={[
          'flex items-start gap-3 rounded-2xl border px-4 py-3 transition-colors',
          selected ? 'border-primary bg-primary/8' : 'border-border/70 bg-muted/30 hover:bg-muted/60',
        ].join(' ')}
      >
        <button
          type="button"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/70 text-sm text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={`${t('settings.dragModel')}:${model.name}`}
          disabled={disabled}
          {...attributes}
          {...listeners}
        >
          ::
        </button>
        <button type="button" className="grid flex-1 gap-1 text-left" onClick={onSelect}>
          <span className="text-sm font-semibold">{model.name}</span>
          <span className="text-xs text-muted-foreground">{summary}</span>
        </button>
      </div>
    </li>
  );
};

/** 语言模型面板，提供摘要列表、拖拽排序与单项编辑。 */
export const LanguageModelsPanel = ({
  config,
  selectedModelId,
  disabled,
  onSelectModel,
  onChange,
  t,
}: LanguageModelsPanelProps) => {
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
  const visibleModels = [...config.models]
    .filter((model) => model.deletedAt === null)
    .sort((left, right) => left.order - right.order);
  const activeModel =
    visibleModels.find((model) => model.id === (selectedModelId ?? config.basic.defaultModelId)) ??
    visibleModels[0] ??
    null;

  const nextModelId = () => `model-${config.models.length + 1}-${Date.now()}`;

  const createModel = (order: number): ModelConfig => ({
    id: nextModelId(),
    name: '新模型',
    provider: 'openai-compatible',
    enabled: false,
    model: '',
    baseUrl: '',
    apiKey: '',
    deployment: '',
    temperature: 0.2,
    tools: [],
    thinkingBudget: null,
    maxOutputTokens: null,
    supportsImages: false,
    order,
    deletedAt: null,
  });

  const syncModelOrders = (models: ModelConfig[]) =>
    models.map((model, index) => ({
      ...model,
      order: index,
    }));

  const updateModels = (models: ModelConfig[], nextDefaultModelId = config.basic.defaultModelId) => {
    onChange({
      ...config,
      basic: {
        ...config.basic,
        defaultModelId: nextDefaultModelId,
      },
      models: syncModelOrders(models),
    });
  };

  /** 按当前可见顺序重排模型。 */
  const reorderVisibleModels = (orderedVisibleModels: ModelConfig[]) => {
    const deletedModels = config.models.filter((model) => model.deletedAt !== null);
    updateModels([...orderedVisibleModels, ...deletedModels]);
  };

  const handleAddModel = () => {
    const nextModels = [...config.models, createModel(config.models.length)];
    updateModels(nextModels);
  };

  const handleCopyModel = () => {
    if (!activeModel) {
      return;
    }

    const nextModels = [
      ...config.models,
      {
        ...activeModel,
        id: nextModelId(),
        name: `${activeModel.name} 副本`,
        enabled: false,
        order: config.models.length,
        deletedAt: null,
      },
    ];
    updateModels(nextModels);
  };

  const handleDeleteModel = () => {
    if (!activeModel) {
      return;
    }

    const deletedAt = Date.now();
    const nextModels = config.models.map((model) =>
      model.id === activeModel.id
        ? {
            ...model,
            enabled: false,
            deletedAt,
          }
        : model,
    );
    const nextVisibleModels = nextModels.filter((model) => model.deletedAt === null);
    const nextDefaultModelId =
      config.basic.defaultModelId === activeModel.id ? null : config.basic.defaultModelId;

    onSelectModel(nextVisibleModels[0]?.id ?? '');
    updateModels(nextModels, nextDefaultModelId);
  };

  const moveActiveModel = (direction: -1 | 1) => {
    if (!activeModel) {
      return;
    }

    const currentIndex = visibleModels.findIndex((model) => model.id === activeModel.id);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= visibleModels.length) {
      return;
    }

    const reorderedVisible = [...visibleModels];
    const [moved] = reorderedVisible.splice(currentIndex, 1);
    reorderedVisible.splice(targetIndex, 0, moved);
    reorderVisibleModels(reorderedVisible);
  };

  /** 处理模型拖拽排序结束。 */
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const currentIndex = visibleModels.findIndex((model) => model.id === active.id);
    const targetIndex = visibleModels.findIndex((model) => model.id === over.id);
    if (currentIndex < 0 || targetIndex < 0) {
      return;
    }

    reorderVisibleModels(arrayMove(visibleModels, currentIndex, targetIndex));
  };

  return (
    <section
      id="settings-panel-models"
      role="tabpanel"
      aria-labelledby="settings-tab-models"
      className="grid gap-6"
    >
      <Card className="rounded-3xl bg-card py-0 ring-1 ring-foreground/8">
        <CardHeader className="gap-2 border-b border-border/70 px-5 py-4">
          <CardTitle className="text-base">{t('settings.languageModels')}</CardTitle>
          <CardDescription>{t('settings.modelsDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 px-5 py-5">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={handleAddModel} disabled={disabled}>
              {t('settings.addModel')}
            </Button>
            <Button type="button" variant="outline" onClick={handleCopyModel} disabled={disabled || !activeModel}>
              {t('settings.copyModel')}
            </Button>
            <Button type="button" variant="outline" onClick={() => moveActiveModel(-1)} disabled={disabled || !activeModel}>
              {t('settings.moveUp')}
            </Button>
            <Button type="button" variant="outline" onClick={() => moveActiveModel(1)} disabled={disabled || !activeModel}>
              {t('settings.moveDown')}
            </Button>
            <Button type="button" variant="outline" onClick={handleDeleteModel} disabled={disabled || !activeModel}>
              {t('settings.deleteModel')}
            </Button>
          </div>

          {visibleModels.length > 0 ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={visibleModels.map((model) => model.id)} strategy={verticalListSortingStrategy}>
                <ul className="grid gap-3">
                  {visibleModels.map((model) => (
                    <SortableModelSummaryItem
                      key={model.id}
                      model={model}
                      selected={model.id === activeModel?.id}
                      disabled={disabled}
                      summary={`${model.provider} / ${model.model || model.deployment || '-'} / ${model.enabled ? t('settings.enabled') : t('settings.disabled')}`}
                      onSelect={() => onSelectModel(model.id)}
                      t={t}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          ) : (
            <p className="m-0 text-sm text-muted-foreground">{t('settings.noModels')}</p>
          )}

          {activeModel ? (
            <ModelForm
              key={activeModel.id}
              model={activeModel}
              disabled={disabled}
              onChange={(nextModel) =>
                onChange({
                  ...config,
                  models: config.models.map((model) => (model.id === nextModel.id ? nextModel : model)),
                })
              }
            />
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
};
