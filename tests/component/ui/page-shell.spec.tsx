import { render, screen } from '@testing-library/react';

import { PageShell } from '../../../src/ui/page-shell';

describe('PageShell', () => {
  it('renders page name, route, and stage label', () => {
    const sidePanelRoute = '/side-panel.html';

    render(
      <PageShell
        title="Side Panel"
        route={sidePanelRoute}
        description="Stage 1 shell only"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Side Panel' })).toBeInTheDocument();
    expect(screen.getByText(sidePanelRoute)).toBeInTheDocument();
    expect(screen.getByText('Stage 1 shell only')).toBeInTheDocument();
    expect(screen.getByText(/environment/i)).toBeInTheDocument();
  });
});
