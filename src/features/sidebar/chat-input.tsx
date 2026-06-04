import { useEffect, useState } from 'react';
import { ArrowUpIcon, DownloadIcon, EraserIcon, FileTextIcon, ImagePlusIcon, LoaderCircleIcon, Trash2Icon } from 'lucide-react';

import { Button, buttonVariants } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { MiniConfirm } from '../../components/ui/mini-confirm';
import { Tooltip } from '../../components/ui/tooltip';
import { cn } from '../../lib/utils';
import { COMPACT_COMPOSER_CONTROL_CLASS, COMPACT_COMPOSER_SELECT_CLASS } from '../../ui/compact-layout';
import type { WorkspaceTranslator } from '../workspace/workspace-copy';
import { WORKSPACE_HORIZONTAL_RESIZE_HANDLE_CLASS } from '../workspace/workspace-resize-handle-style';

/** Textarea 单行高度。 */
const SINGLE_LINE_HEIGHT = 32;
/** 输入区最大高度。 */
const MAX_COMPOSER_HEIGHT = 220;
/** 限制输入区高度范围。 */
const clampTextareaHeight = (height: number) => Math.min(MAX_COMPOSER_HEIGHT, Math.max(SINGLE_LINE_HEIGHT, height));

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
  const [textareaHeight, setTextareaHeight] = useState<number>(SINGLE_LINE_HEIGHT);
  const [isComposing, setIsComposing] = useState(false);
  const [resizeSession, setResizeSession] = useState<{
    /** 拖拽开始时的鼠标纵坐标。 */
    startY: number;
    /** 拖拽开始时的 textarea 高度。 */
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
      setTextareaHeight(clampTextareaHeight(resizeSession.startHeight - (event.clientY - resizeSession.startY)));
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
    <section data-testid="chat-input-section" className="shrink-0 border-t border-border px-2 py-1">
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={t('workspace.resizeComposer')}
        data-testid="chat-input-resize-handle"
        className={cn(WORKSPACE_HORIZONTAL_RESIZE_HANDLE_CLASS, 'mb-1')}
        onPointerDown={(event) => {
          setResizeSession({
            startY: event.clientY,
            startHeight: textareaHeight,
          });
        }}
      />

      <div data-testid="chat-input-panel" className="flex flex-col gap-1">
        {images.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {images.map((image, index) => (
              <figure
                key={`${image.slice(0, 32)}:${index}`}
                className="group relative overflow-hidden rounded-none border border-border"
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
                      className="absolute right-0.5 top-0.5 rounded-none opacity-90"
                    >
                      <Trash2Icon />
                    </Button>
                  </Tooltip>
                </MiniConfirm>
              </figure>
            ))}
          </div>
        ) : null}

        <div className="overflow-x-auto pb-0">
          <div data-testid="chat-input-control-row" className="flex w-full min-w-max flex-nowrap items-center gap-1">
            <Textarea
              aria-label={t('workspace.chatInput')}
              className="min-h-0 min-w-[240px] flex-1 shrink-0 resize-none rounded-none px-2 py-1 leading-snug"
              style={{ height: `${textareaHeight}px` }}
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
                data-testid="chat-input-add-image-control"
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'icon-sm' }),
                  'relative cursor-pointer',
                  COMPACT_COMPOSER_CONTROL_CLASS,
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

            <select
              aria-label={t('workspace.selectModel')}
              className={COMPACT_COMPOSER_SELECT_CLASS}
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

            <Tooltip content={t('workspace.includePageContent')}>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={t('workspace.includePageContent')}
                aria-pressed={includePageContent}
                className={cn(
                  COMPACT_COMPOSER_CONTROL_CLASS,
                  includePageContent
                    ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15'
                    : 'border-button-ink text-button-ink hover:border-primary hover:bg-transparent hover:text-primary',
                )}
                onClick={() => onIncludePageContentChange(!includePageContent)}
              >
                <FileTextIcon />
              </Button>
            </Tooltip>

            <MiniConfirm
              message={t('workspace.notice.clearTabConfirm')}
              cancelLabel={t('common.cancel')}
              confirmLabel={t('workspace.clearCurrentTab')}
              contentTestId="clear-tab-confirm"
              onConfirm={onClear}
            >
              <Tooltip content={t('workspace.clearCurrentTab')}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('workspace.clearCurrentTab')}
                  className={COMPACT_COMPOSER_CONTROL_CLASS}
                >
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
                className={COMPACT_COMPOSER_CONTROL_CLASS}
                onClick={() => void onExport()}
              >
                <DownloadIcon />
              </Button>
            </Tooltip>

            <Tooltip content={t('workspace.send')}>
              <Button
                type="button"
                size="icon-sm"
                aria-label={t('workspace.send')}
                className={COMPACT_COMPOSER_CONTROL_CLASS}
                disabled={isSendDisabled}
                onClick={submitCurrentInput}
              >
                {sending ? <LoaderCircleIcon className="animate-spin" /> : <ArrowUpIcon />}
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
