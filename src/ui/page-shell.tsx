import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { cn } from '../lib/utils';

type PageShellProps = {
  title: string;
  route: string;
  description: string;
  className?: string;
};

/** 通用入口页壳层，统一占位页的布局和主题基线。 */
export const PageShell = ({ title, route, description, className }: PageShellProps) => {
  return (
    <main
      data-testid="page-shell"
      className={cn(
        'min-h-screen bg-[radial-gradient(circle_at_top,_var(--color-background)_0%,_var(--color-muted)_56%,_var(--color-background)_100%)] px-6 py-8',
        className,
      )}
    >
      <section className="mx-auto flex w-full max-w-5xl justify-center">
        <Card className="w-full gap-0 rounded-3xl bg-card/90 py-0 shadow-2xl ring-1 ring-foreground/8 backdrop-blur">
          <CardHeader className="gap-4 border-b border-border/70 px-6 py-6">
            <div className="flex items-center justify-between gap-3">
              <Badge variant="secondary" className="rounded-full px-3 py-1 uppercase tracking-[0.22em]">
                Stage 2.5 shell
              </Badge>
              <span className="text-xs text-muted-foreground">Environment: development</span>
            </div>
            <div className="flex flex-col gap-2">
              <h1 className="font-heading text-3xl font-medium tracking-tight">{title}</h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground">{description}</p>
            </div>
          </CardHeader>
          <CardContent className="px-6 py-6">
            <div
              data-testid="page-shell-route"
              className="rounded-2xl border border-border/70 bg-muted/60 px-4 py-3 font-mono text-sm text-foreground"
            >
              {route}
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
};
