import { useEffect, useState } from 'react';

/** 输入区最小高度。 */
const MIN_COMPOSER_HEIGHT = 120;
/** 输入区默认高度。 */
const DEFAULT_COMPOSER_HEIGHT = 144;
/** 输入区最大高度。 */
const MAX_COMPOSER_HEIGHT = 360;

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
  /** 停止当前会话。 */
  onStop: () => Promise<void>;
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
  onSelectModel,
  onTextChange,
  onImagesChange,
  onIncludePageContentChange,
  onSend,
  onStop,
  onExport,
  onClear,
}: ChatInputProps) => {
  const [composerHeight, setComposerHeight] = useState(DEFAULT_COMPOSER_HEIGHT);
  const [resizeSession, setResizeSession] = useState<{
    /** 拖拽开始时的鼠标纵坐标。 */
    startY: number;
    /** 拖拽开始时的输入区高度。 */
    startHeight: number;
  } | null>(null);
  const selectedModel = models.find((model) => model.id === selectedModelId) ?? null;
  const supportsImages = selectedModel?.supportsImages ?? false;
  const isSendDisabled = disabled || sending || !selectedModelId;

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
    <section className="border-t border-border px-4 py-3">
      <div className="mb-3 flex justify-center">
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="调整输入区高度"
          data-testid="chat-input-resize-handle"
          className="h-2 w-16 cursor-row-resize rounded-full bg-border"
          onPointerDown={(event) => {
            setResizeSession({
              startY: event.clientY,
              startHeight: composerHeight,
            });
          }}
        />
      </div>
      <div className="mb-3 flex items-center gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          <span>模型</span>
          <select
            aria-label="选择模型"
            className="rounded-md border border-border bg-background px-3 py-2"
            disabled={disabled || models.length === 0}
            value={selectedModelId}
            onChange={(event) => onSelectModel(event.target.value)}
          >
            {models.length === 0 ? <option value="">暂无可用模型</option> : null}
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pt-6 text-sm">
          <input
            aria-label="包含页面内容"
            type="checkbox"
            checked={includePageContent}
            onChange={(event) => onIncludePageContentChange(event.target.checked)}
          />
          <span>包含页面内容</span>
        </label>
      </div>

      <textarea
        aria-label="聊天输入"
        className="w-full rounded-md border border-border bg-background p-3"
        value={text}
        disabled={disabled}
        style={{ height: `${composerHeight}px` }}
        onChange={(event) => onTextChange(event.target.value)}
      />

      {images.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-3">
          {images.map((image, index) => (
            <figure key={`${image.slice(0, 32)}:${index}`} className="space-y-2">
              <img
                src={image}
                alt={`已选图片 ${index + 1}`}
                className="h-20 w-20 rounded-md border border-border object-cover"
              />
              <button
                type="button"
                aria-label={`移除图片 ${index + 1}`}
                onClick={() => onImagesChange(images.filter((_, imageIndex) => imageIndex !== index))}
              >
                移除
              </button>
            </figure>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="text-sm">
          <span className="sr-only">添加图片</span>
          <input
            aria-label="添加图片"
            type="file"
            accept="image/*"
            multiple
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
        <button
          type="button"
          disabled={isSendDisabled}
          onClick={() => {
            if (text.trim().length === 0 && images.length === 0) {
              return;
            }
            if (!selectedModelId) {
              return;
            }

            void onSend({
              text,
              images,
              modelId: selectedModelId,
              includePageContent,
            });
          }}
        >
          发送
        </button>
        <button type="button" disabled={!sending} onClick={() => void onStop()}>
          停止
        </button>
        <button type="button" onClick={() => void onClear()}>
          清空当前标签
        </button>
        <button type="button" onClick={() => void onExport()}>
          导出
        </button>
      </div>

      {!supportsImages && selectedModelId ? <p className="mt-2 text-xs text-muted-foreground">当前模型不支持图片输入</p> : null}
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
