import { useEffect, useState } from 'react';
import { ArrowUpIcon, DownloadIcon, EraserIcon, ImagePlusIcon, LoaderCircleIcon, Trash2Icon } from 'lucide-react';

import { Button, buttonVariants } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { MiniConfirm } from '../../components/ui/mini-confirm';
import { Tooltip } from '../../components/ui/tooltip';
import { cn } from '../../lib/utils';
import type { WorkspaceTranslator } from '../workspace/workspace-copy';

/** 输入区最小高度。 */
const MIN_COMPOSER_HEIGHT = 82;
/** 输入区默认高度。 */
const DEFAULT_COMPOSER_HEIGHT = 96;
/** 输入区最大高度。 */
const MAX_COMPOSER_HEIGHT = 220;

/** 限制输入区高度范围。 */
const clampComposerHeight = (height: number) => Math.min(MAX_COMPOSER_HEIGHT, Math.max(MIN_COMPOSER_HEIGHT, height));

type ChatInputProps = {
  /** 当前是否禁用输入。 */
  disabled: boolean;
  /** 当前是否正在发送。 */
  sending: boolean;
  /** 当前输入文本。 */
  text: string;
  /** 当前已添加图片。 */
  images: string[];
  /** 当前页面级正文开关。 */
  includePageContent: boolean;
  /** 当前选中的模型 id。 */
  selectedModelId: string;
  /** 可选模型列表。 */
  models: Array<{
    /** 模型稳定 id。 */
    id: string;
    /** 模型展示名。 */
    name: string;
    /** 是否支持图片输入。 */
    supportsImages: boolean;
  }>;
  /** 文案翻译函数。 */
  t: WorkspaceTranslator;
  /** 选择模型。 */
  onSelectModel(modelId: string): void;
  /** 更新文本。 */
  onTextChange(text: string): void;
  /** 更新图片。 */
  onImagesChange(images: string[]): void;
  /** 更新页面正文开关。 */
  onIncludePageContentChange(includePageContent: boolean): void;
  /** 发送输入。 */
  onSend(input: { text: string; images: string[]; modelId: string; includePageContent: boolean }): Promise<void>;
  /** 导出当前会话。 */
  onExport: () => Promise<void>;
  /** 清空当前 promptTab。 */
  onClear: () => Promise<void>;
};

/** 侧边栏聊天输入区。 */
export const ChatInput = ({
  disabled,
  sending,
  text,
  images,
  includePageContent,
  selectedModelId,
  models,
  t,
  onSelectModel,
  onTextChange,
  onImagesChange,
  onIncludePageContentChange,
  onSend,
  onExport,
  onClear,
}: ChatInputProps) => {
  const [composerHeight, setComposerHeight] = useState(DEFAULT_COMPOSER_HEIGHT);
  const [isComposing, setIsComposing] = useState(false);
  const [resizeSession, setResizeSession] = useState<{
    /** 拖拽开始时的鼠标纵坐标。 */
    startY: number;
    /** 拖拽开始时的输入区高度。 */
    startHeight: number;
  } | null>(null);
  const selectedModel = models.find((model) => model.id === selectedModelId) ?? null;
  const supportsImages = selectedModel?.supportsImages ?? false;
  const isSendDisabled = disabled || sending || !selectedModelId;

  /** 尝试提交当前输入。 */
  const submitCurrentInput = () => {
    if (text.trim().length === 0 && images.length === 0) {
      return;
    }
    if (!selectedModelId || isSendDisabled) {
      return;
    }

    void onSend({
      text,
      images,
      modelId: selectedModelId,
      includePageContent,
    });
  };

  useEffect(() => {
    if (!resizeSession) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      setComposerHeight(clampComposerHeight(resizeSession.startHeight - (event.clientY - resizeSession.startY)));
    };
    const handlePointerUp = () => {
      setResizeSession(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [resizeSession]);

  return (
    <section className="shrink-0 border-t border-border bg-card/75 px-3 py-2 backdrop-blur-sm">
      <div className="mb-0.5 flex justify-center">
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label={t('workspace.resizeComposer')}
          data-testid="chat-input-resize-handle"
          className="h-1 w-8 cursor-row-resize rounded-full bg-border transition-colors hover:bg-primary/40"
          onPointerDown={(event) => {
            setResizeSession({
              startY: event.clientY,
              startHeight: composerHeight,
            });
          }}
        />
      </div>

      <div data-testid="chat-input-panel" className="flex flex-col gap-1" style={{ minHeight: `${composerHeight}px` }}>
        <div className="flex items-center gap-1.5">
          <Input
            aria-label={t('workspace.chatInput')}
            className="h-8 bg-background/90 px-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
            value={text}
            disabled={disabled}
            onChange={(event) => onTextChange(event.target.value)}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
                return;
              }
              if (isComposing || event.nativeEvent.isComposing) {
                return;
              }

              event.preventDefault();
              submitCurrentInput();
            }}
          />

          <Tooltip content={t('workspace.addImage')}>
            <label
              aria-disabled={disabled || !supportsImages}
              className={cn(
                buttonVariants({ variant: 'outline', size: 'icon-sm' }),
                'relative size-[22px] cursor-pointer rounded-md',
                (disabled || !supportsImages) && 'pointer-events-none opacity-50',
              )}
            >
              <ImagePlusIcon />
              <span className="sr-only">{t('workspace.addImage')}</span>
              <input
                aria-label={t('workspace.addImage')}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                disabled={disabled || !supportsImages}
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  if (files.length === 0) {
                    return;
                  }
                  void Promise.all(files.map((file) => fileToDataUrl(file)))
                    .then((dataUrls) => {
                      onImagesChange([...images, ...dataUrls]);
                    })
                    .finally(() => {
                      event.currentTarget.value = '';
                    });
                }}
              />
            </label>
          </Tooltip>

          <Tooltip content={t('workspace.send')}>
            <Button
              type="button"
              size="icon-sm"
              aria-label={t('workspace.send')}
              className="size-[22px] rounded-md"
              disabled={isSendDisabled}
              onClick={submitCurrentInput}
            >
              {sending ? <LoaderCircleIcon className="animate-spin" /> : <ArrowUpIcon />}
            </Button>
          </Tooltip>
        </div>

        {images.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {images.map((image, index) => (
              <figure
                key={`${image.slice(0, 32)}:${index}`}
                className="group relative overflow-hidden rounded-md border border-border bg-background shadow-sm"
              >
                <img src={image} alt={`${t('workspace.selectedImage')} ${index + 1}`} className="size-14 object-cover" />
                <MiniConfirm
                  message={`${t('workspace.removeImage')} ${index + 1}`}
                  cancelLabel={t('common.cancel')}
                  confirmLabel={t('workspace.removeImage')}
                  contentTestId={`remove-image-confirm-${index + 1}`}
                  onConfirm={() => onImagesChange(images.filter((_, imageIndex) => imageIndex !== index))}
                >
                  <Tooltip content={`${t('workspace.removeImage')} ${index + 1}`}>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon-xs"
                      aria-label={`${t('workspace.removeImage')} ${index + 1}`}
                      className="absolute right-1 top-1 opacity-90 shadow-sm"
                    >
                      <Trash2Icon />
                    </Button>
                  </Tooltip>
                </MiniConfirm>
              </figure>
            ))}
          </div>
        ) : null}

        <div className="mt-auto overflow-x-auto pb-0.5">
          <div className="flex min-w-max items-center gap-1.5">
            <span className="shrink-0 text-[11px] text-muted-foreground">{t('workspace.model')}</span>
            <select
              aria-label={t('workspace.selectModel')}
              className="h-7 w-28 shrink-0 rounded-md border border-input/80 bg-background/80 px-2 text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              disabled={disabled || models.length === 0}
              value={selectedModelId}
              onChange={(event) => onSelectModel(event.target.value)}
            >
              {models.length === 0 ? <option value="">{t('workspace.noModels')}</option> : null}
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>

            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={includePageContent}
              className={cn(
                'h-7 shrink-0 rounded-md px-2.5',
                includePageContent
                  ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15'
                  : 'border-border bg-background/70 text-muted-foreground hover:text-foreground',
              )}
              onClick={() => onIncludePageContentChange(!includePageContent)}
            >
              {t('workspace.includePageContent')}
            </Button>

            <MiniConfirm
              message={t('workspace.notice.clearTabConfirm')}
              cancelLabel={t('common.cancel')}
              confirmLabel={t('workspace.clearCurrentTab')}
              contentTestId="clear-tab-confirm"
              onConfirm={onClear}
            >
              <Tooltip content={t('workspace.clearCurrentTab')}>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={t('workspace.clearCurrentTab')} className="size-[22px] rounded-md">
                  <EraserIcon />
                </Button>
              </Tooltip>
            </MiniConfirm>

            <Tooltip content={t('workspace.exportConversation')}>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('workspace.exportConversation')}
                className="size-[22px] rounded-md"
                onClick={() => void onExport()}
              >
                <DownloadIcon />
              </Button>
            </Tooltip>
          </div>
        </div>
      </div>
    </section>
  );
};

/** 读取图片文件并转成 data URL。 */
const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
