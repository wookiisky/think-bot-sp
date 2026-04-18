import { useEffect, useState, type ReactNode } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDownIcon, ArrowUpIcon, CopyIcon, GripVerticalIcon, Trash2Icon } from 'lucide-react';

import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { MiniConfirm } from '../../components/ui/mini-confirm';
import { Tooltip } from '../../components/ui/tooltip';
import {
  getDefaultModelBaseUrl,
  getDefaultModelTools,
  type ExtensionConfig,
  type ModelConfig,
} from '../../domain/config/config-schema';
import { ModelForm } from './model-form';

type LanguageModelsPanelProps = {
  /** 当前草稿配置。 */
  config: ExtensionConfig;
  /** 当前选中的模型 id。 */
  selectedModelId: string | null;
  /** 是否禁用交互。 */
  disabled: boolean;
  /** 更新选中模型。 */
  onSelectModel(modelId: string | null): void;
  /** 更新完整配置。 */
  onChange(nextConfig: ExtensionConfig): void;
  /** 测试单个模型。 */
  onTestModel(model: ModelConfig): void;
  /** 当前正在测试的模型 id。 */
  testingModelId: string | null;
  /** 文案翻译函数。 */
  t(key: string): string;
};

type SortableModelCardProps = {
  /** 当前模型。 */
  model: ModelConfig;
  /** 是否展开。 */
  expanded: boolean;
  /** 是否禁用。 */
  disabled: boolean;
  /** 摘要文本。 */
  summary: string;
  /** 切换当前模型。 */
  onSelect(): void;
  /** 复制当前模型。 */
  onCopy(): void;
  /** 上移当前模型。 */
  onMoveUp(): void;
  /** 下移当前模型。 */
  onMoveDown(): void;
  /** 删除当前模型。 */
  onDelete(): void;
  /** 切换启用态。 */
  onToggleEnabled(enabled: boolean): void;
  /** 展开区内容。 */
  children?: ReactNode;
  /** 文案翻译函数。 */
  t(key: string): string;
};

/** 生成模型标题栏摘要。 */
const buildModelSummary = (model: ModelConfig) => `${model.provider} / ${model.model || model.deployment || '-'}`;

/** 可拖拽模型卡片。 */
const SortableModelCard = ({
  model,
  expanded,
  disabled,
  summary,
  onSelect,
  onCopy,
  onMoveUp,
  onMoveDown,
  onDelete,
  onToggleEnabled,
  children,
  t,
}: SortableModelCardProps) => {
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
      data-testid={`language-model-item-${model.id}`}
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
            aria-label={`${t('settings.dragModel')}:${model.name}`}
            disabled={disabled}
            {...attributes}
            {...listeners}
          >
            <GripVerticalIcon className="size-4" />
          </button>

          <button
            type="button"
            className="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden text-left"
            data-testid={`language-model-summary-${model.id}`}
            onClick={onSelect}
          >
            <span className="truncate text-xs font-semibold">{model.name}</span>
            <span className="truncate text-xs text-muted-foreground">{summary}</span>
          </button>

          <div className="flex shrink-0 items-center gap-1.5">
            <Tooltip content={t('settings.copyModel')}>
              <Button type="button" variant="outline" size="icon-sm" aria-label={t('settings.copyModel')} onClick={onCopy} disabled={disabled}>
                <CopyIcon />
              </Button>
            </Tooltip>
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
              message={t('settings.deleteModel')}
              cancelLabel={t('common.cancel')}
              confirmLabel={t('settings.deleteModel')}
              contentTestId={`language-model-delete-confirm-${model.id}`}
              onConfirm={onDelete}
            >
              <Button type="button" variant="outline" size="icon-sm" aria-label={t('settings.deleteModel')} disabled={disabled}>
                <Trash2Icon />
              </Button>
            </MiniConfirm>
            <label className="flex items-center gap-1.5 text-xs/relaxed">
              <input
                aria-label={`${t('settings.enableModel')}:${model.name}`}
                type="checkbox"
                checked={model.enabled}
                disabled={disabled}
                onChange={(event) => onToggleEnabled(event.target.checked)}
              />
              <span className="font-medium">{t('settings.enableModel')}</span>
            </label>
          </div>
        </div>

        {expanded ? <div className="grid gap-3 border-t border-border/70 pt-3">{children}</div> : null}
      </section>
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
  onTestModel,
  testingModelId,
  t,
}: LanguageModelsPanelProps) => {
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
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
  const activeModel = visibleModels.find((model) => model.id === expandedModelId) ?? null;

  useEffect(() => {
    if (visibleModels.length === 0 && selectedModelId !== null) {
      onSelectModel(null);
      setExpandedModelId(null);
      return;
    }

    if (selectedModelId && !visibleModels.some((model) => model.id === selectedModelId)) {
      onSelectModel(visibleModels[0]?.id ?? null);
    }
    if (expandedModelId && !visibleModels.some((model) => model.id === expandedModelId)) {
      setExpandedModelId(null);
    }
  }, [expandedModelId, onSelectModel, selectedModelId, visibleModels]);

  const nextModelId = () => `model-${config.models.length + 1}-${Date.now()}`;

  const createModel = (order: number): ModelConfig => ({
    id: nextModelId(),
    name: '新模型',
    provider: 'openai-compatible',
    enabled: false,
    model: '',
    baseUrl: getDefaultModelBaseUrl('openai-compatible'),
    apiKey: '',
    deployment: '',
    region: '',
    project: '',
    location: '',
    temperature: 1.0,
    tools: getDefaultModelTools('openai-compatible'),
    reasoningEffort: 'high',
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
    const nextModel = createModel(config.models.length);
    updateModels([...config.models, nextModel]);
    onSelectModel(nextModel.id);
    setExpandedModelId(nextModel.id);
  };

  const handleCopyModel = (modelId: string) => {
    const sourceModel = config.models.find((model) => model.id === modelId);
    if (!sourceModel) {
      return;
    }

    const copiedModel = {
      ...sourceModel,
      id: nextModelId(),
      name: `${sourceModel.name} 副本`,
      enabled: false,
      order: config.models.length,
      deletedAt: null,
    };
    updateModels([...config.models, copiedModel]);
    onSelectModel(copiedModel.id);
    setExpandedModelId(copiedModel.id);
  };

  const handleDeleteModel = (modelId: string) => {
    const targetModel = config.models.find((model) => model.id === modelId);
    if (!targetModel) {
      return;
    }

    const deletedAt = Date.now();
    const nextModels = config.models.map((model) =>
      model.id === modelId
        ? {
            ...model,
            enabled: false,
            deletedAt,
          }
        : model,
    );
    const nextVisibleModels = nextModels
      .filter((model) => model.deletedAt === null)
      .sort((left, right) => left.order - right.order);
    const nextDefaultModelId = config.basic.defaultModelId === modelId ? null : config.basic.defaultModelId;

    updateModels(nextModels, nextDefaultModelId);
    onSelectModel(nextVisibleModels[0]?.id ?? null);
    setExpandedModelId(null);
  };

  const moveModel = (modelId: string, direction: -1 | 1) => {
    const currentIndex = visibleModels.findIndex((model) => model.id === modelId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= visibleModels.length) {
      return;
    }

    const reorderedVisibleModels = [...visibleModels];
    const [movedModel] = reorderedVisibleModels.splice(currentIndex, 1);
    reorderedVisibleModels.splice(targetIndex, 0, movedModel);
    reorderVisibleModels(reorderedVisibleModels);
    onSelectModel(modelId);
  };

  /** 切换单个模型启用态。 */
  const toggleModelEnabled = (modelId: string, enabled: boolean) => {
    onChange({
      ...config,
      models: config.models.map((model) =>
        model.id === modelId
          ? {
              ...model,
              enabled,
            }
          : model,
      ),
    });
  };

  /** 更新单个模型。 */
  const updateModel = (nextModel: ModelConfig) => {
    onChange({
      ...config,
      models: config.models.map((model) => (model.id === nextModel.id ? nextModel : model)),
    });
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
    onSelectModel(String(active.id));
  };

  return (
    <section
      id="settings-panel-models"
      role="tabpanel"
      aria-labelledby="settings-tab-models"
      className="grid gap-4"
    >
      <Card size="sm" className="rounded-[26px] bg-card py-0 ring-1 ring-foreground/8">
        <CardHeader className="gap-1.5 border-b border-border/70 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="grid gap-1">
              <CardTitle className="text-base">{t('settings.languageModels')}</CardTitle>
              <CardDescription>{t('settings.modelsDescription')}</CardDescription>
            </div>

            <Button size="sm" type="button" variant="outline" onClick={handleAddModel} disabled={disabled}>
              {t('settings.addModel')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 px-4 py-4">
          {visibleModels.length > 0 ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={visibleModels.map((model) => model.id)} strategy={verticalListSortingStrategy}>
                <ul className="grid gap-2.5">
                  {visibleModels.map((model) => (
                    <SortableModelCard
                      key={model.id}
                      model={model}
                      expanded={model.id === activeModel?.id}
                      disabled={disabled}
                      summary={buildModelSummary(model)}
                      onSelect={() => {
                        const nextExpandedId = model.id === activeModel?.id ? null : model.id;
                        onSelectModel(model.id);
                        setExpandedModelId(nextExpandedId);
                      }}
                      onCopy={() => handleCopyModel(model.id)}
                      onMoveUp={() => moveModel(model.id, -1)}
                      onMoveDown={() => moveModel(model.id, 1)}
                      onDelete={() => handleDeleteModel(model.id)}
                      onToggleEnabled={(enabled) => toggleModelEnabled(model.id, enabled)}
                      t={t}
                    >
                      <ModelForm
                        key={model.id}
                        model={model}
                        disabled={disabled}
                        testing={testingModelId === model.id}
                        showHeader={false}
                        showEnabledField={false}
                        onChange={updateModel}
                        onTest={() => onTestModel(model)}
                      />
                    </SortableModelCard>
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          ) : (
            <p className="m-0 text-sm text-muted-foreground">{t('settings.noModels')}</p>
          )}
        </CardContent>
      </Card>
    </section>
  );
};
