import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import { PageShell } from '../../../src/ui/page-shell';

describe('PageShell', () => {
  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, 'matchMedia');
  });

  /** 模拟浏览器系统深浅色设置。 */
  const mockBrowserDarkMode = (matches: boolean) => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue({
        matches,
        media: '(prefers-color-scheme: dark)',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
  };

  it('renders page name, route, and shared shell structure', () => {
    const sidePanelRoute = '/side-panel.html';

    render(
      <PageShell
        title="Side Panel"
        route={sidePanelRoute}
        description="共享壳层基线"
      />,
    );

    const main = screen.getByTestId('page-shell');
    const routeCard = within(main).getByTestId('page-shell-route');

    expect(screen.getByRole('heading', { name: 'Side Panel' })).toBeInTheDocument();
    expect(screen.getByText('共享壳层基线')).toBeInTheDocument();
    expect(within(routeCard).getByText(sidePanelRoute)).toBeInTheDocument();
    expect(within(main).getByText(/environment/i)).toBeInTheDocument();
    expect(main).toHaveClass('min-h-screen');
    expect(main).toHaveClass('bg-background');
    expect(main.className).not.toContain('radial-gradient');
  });

  it('system 主题跟随浏览器深色设置并作用到 html', () => {
    mockBrowserDarkMode(true);

    render(
      <PageShell
        title="Welcome"
        route="/welcome.html"
        description="共享壳层基线"
      />,
    );

    const main = screen.getByTestId('page-shell');
    expect(main).toHaveAttribute('data-theme', 'system');
    expect(main).toHaveAttribute('data-resolved-theme', 'dark');
    expect(document.documentElement).toHaveAttribute('data-resolved-theme', 'dark');
    expect(document.documentElement).toHaveClass('dark');
  });
});
