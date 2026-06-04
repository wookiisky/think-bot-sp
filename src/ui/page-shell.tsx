import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { cn } from '../lib/utils';
import { COMPACT_CARD_CONTENT_CLASS, COMPACT_CARD_HEADER_CLASS, COMPACT_PAGE_SHELL_CLASS } from './compact-layout';
import { type ThemePreference, useDocumentTheme } from './theme-mode';

type PageShellProps = {
  title: string;
  route: string;
  description: string;
  className?: string;
  theme?: ThemePreference;
};

/** 通用入口页壳层，统一占位页的布局和主题基线。 */
export const PageShell = ({ title, route, description, className, theme = 'system' }: PageShellProps) => {
  const themeRootAttributes = useDocumentTheme(theme);

  return (
    <main
      data-testid="page-shell"
      data-theme={themeRootAttributes.dataTheme}
      data-resolved-theme={themeRootAttributes.dataResolvedTheme}
      className={cn(
        COMPACT_PAGE_SHELL_CLASS,
        className,
      )}
    >
      <section className="mx-auto flex w-full max-w-5xl justify-center">
        <Card className="w-full">
          <CardHeader className={COMPACT_CARD_HEADER_CLASS}>
            <div className="flex items-center justify-between gap-2">
              <Badge variant="secondary" className="px-2 py-0.5 uppercase tracking-[0.16em]">
                Stage 2.5 shell
              </Badge>
              <span className="text-xs text-muted-foreground">Environment: development</span>
            </div>
            <div className="flex flex-col gap-1">
              <h1 className="font-heading text-lg font-medium">{title}</h1>
              <p className="max-w-3xl text-xs leading-5 text-muted-foreground">{description}</p>
            </div>
          </CardHeader>
          <CardContent className={COMPACT_CARD_CONTENT_CLASS}>
            <div
              data-testid="page-shell-route"
              className="border border-border/70 px-2 py-1.5 font-mono text-xs text-foreground"
            >
              {route}
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
};
