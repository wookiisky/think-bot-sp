import { cn } from '../../lib/utils';

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

/** 页面顶部 toast 视口。 */
export const ToastStack = ({ toasts }: ToastStackProps) => {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((toast) => (
        <section
          key={toast.id}
          role="alert"
          className={cn(
            'pointer-events-auto w-full max-w-xl rounded-2xl border px-4 py-3 shadow-lg backdrop-blur',
            toast.tone === 'error'
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : 'border-primary/20 bg-primary/10 text-foreground',
          )}
        >
          <div className="grid gap-1">
            {toast.title ? <p className="m-0 text-sm font-semibold">{toast.title}</p> : null}
            <p className="m-0 text-sm">{toast.message}</p>
          </div>
        </section>
      ))}
    </div>
  );
};
