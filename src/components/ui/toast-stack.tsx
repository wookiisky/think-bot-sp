import { CircleAlertIcon, CircleCheckIcon } from 'lucide-react';

type ToastItem = {
  /** toast 稳定 id。 */
  id: number;
  /** 反馈语气。 */
  tone: 'success' | 'error';
  /** 可选标题。 */
  title?: string;
  /** 反馈正文。 */
  message: string;
};

type ToastStackProps = {
  /** 当前待展示的 toast。 */
  toasts: ToastItem[];
};

/** 解析 toast 语义图标。 */
const getToastIcon = (tone: ToastItem['tone']) => {
  if (tone === 'error') {
    return CircleAlertIcon;
  }

  return CircleCheckIcon;
};

/** 页面顶部 toast 视口。 */
export const ToastStack = ({ toasts }: ToastStackProps) => {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-[70] flex flex-col items-center gap-1.5 px-2">
      {toasts.map((toast) => {
        const ToastIcon = getToastIcon(toast.tone);

        return (
          <section
            key={toast.id}
            role="alert"
            className="pointer-events-auto flex w-fit min-w-[14rem] max-w-[18rem] items-start gap-2 border border-[#633914] bg-[#7C4A1F] px-3 py-2 text-white ring-1 ring-[#4F2D12]/25"
          >
            <ToastIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-white/90" />
            <div className="grid min-w-0 gap-1">
              {toast.title ? <p className="m-0 text-sm font-semibold">{toast.title}</p> : null}
              <p className="m-0 break-words text-sm">{toast.message}</p>
            </div>
          </section>
        );
      })}
    </div>
  );
};
