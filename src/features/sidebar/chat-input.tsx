import { useEffect, useState } from 'react';

type ChatInputProps = {
  /** 当前是否禁用输入。 */
  disabled: boolean;
  /** 当前是否正在发送。 */
  sending: boolean;
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
  /** 页面内容默认勾选值。 */
  defaultIncludePageContent: boolean;
  /** 选择模型。 */
  onSelectModel: (modelId: string) => void;
  /** 发送输入。 */
  onSend: (input: { text: string; images: string[]; modelId: string; includePageContent: boolean }) => Promise<void>;
  /** 停止当前会话。 */
  onStop: () => Promise<void>;
  /** 导出当前会话。 */
  onExport: () => Promise<void>;
};

/** 侧边栏聊天输入区。 */
export const ChatInput = ({
  disabled,
  sending,
  selectedModelId,
  models,
  defaultIncludePageContent,
  onSelectModel,
  onSend,
  onStop,
  onExport,
}: ChatInputProps) => {
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [includePageContent, setIncludePageContent] = useState(defaultIncludePageContent);
  const [errorMessage, setErrorMessage] = useState('');
  const selectedModel = models.find((model) => model.id === selectedModelId) ?? null;
  const supportsImages = selectedModel?.supportsImages ?? false;
  const isSendDisabled = disabled || sending || !selectedModelId;

  useEffect(() => {
    setIncludePageContent(defaultIncludePageContent);
  }, [defaultIncludePageContent]);

  return (
    <section className="border-t border-border px-4 py-3">
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
            onChange={(event) => setIncludePageContent(event.target.checked)}
          />
          <span>包含页面内容</span>
        </label>
      </div>

      <textarea
        aria-label="聊天输入"
        className="min-h-24 w-full rounded-md border border-border bg-background p-3"
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
      />

      <div className="mt-3 flex items-center gap-2">
        <label className="text-sm">
          <span className="sr-only">添加图片</span>
          <input
            aria-label="添加图片"
            type="file"
            accept="image/*"
            disabled={disabled || !supportsImages}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }
              void fileToDataUrl(file).then((dataUrl) => {
                setImages((current) => [...current, dataUrl]);
              });
            }}
          />
        </label>
        <button
          type="button"
          disabled={isSendDisabled}
          onClick={() => {
            if (text.trim().length === 0 && images.length === 0) {
              setErrorMessage('请输入文本或添加图片');
              return;
            }
            if (!selectedModelId) {
              setErrorMessage('请先选择模型');
              return;
            }

            setErrorMessage('');
            void onSend({
              text,
              images,
              modelId: selectedModelId,
              includePageContent,
            }).then(() => {
              setText('');
              setImages([]);
            });
          }}
        >
          发送
        </button>
        <button type="button" disabled={!sending} onClick={() => void onStop()}>
          停止
        </button>
        <button type="button" onClick={() => void onExport()}>
          导出
        </button>
      </div>

      {images.length > 0 ? <p className="mt-2 text-xs text-muted-foreground">已添加 {images.length} 张图片</p> : null}
      {!supportsImages && selectedModelId ? <p className="mt-2 text-xs text-muted-foreground">当前模型不支持图片输入</p> : null}
      {errorMessage ? <p className="mt-2 text-sm text-destructive">{errorMessage}</p> : null}
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
