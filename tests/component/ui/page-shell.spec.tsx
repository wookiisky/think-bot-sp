import { render, screen } from '@testing-library/react';

import { PageShell } from '../../../src/ui/page-shell';

describe('PageShell', () => {
  it('renders page name, route, and stage label', () => {
    render(
      <PageShell
        title="Side Panel"
        route="/sidepanel.html"
        description="Stage 1 shell only"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Side Panel' })).toBeInTheDocument();
    expect(screen.getByText('/sidepanel.html')).toBeInTheDocument();
    expect(screen.getByText('Stage 1 shell only')).toBeInTheDocument();
  });
});
