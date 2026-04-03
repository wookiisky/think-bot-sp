import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { PageShell } from '../../../src/ui/page-shell';

describe('PageShell', () => {
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
  });
});
