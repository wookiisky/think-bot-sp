import { createRoot } from 'react-dom/client';

import { EXTENSION_PAGES } from '../../src/shared/extension-pages';
import { PageShell } from '../../src/ui/page-shell';

const root = createRoot(document.getElementById('root')!);
root.render(
  <PageShell
    title="Options"
    route={EXTENSION_PAGES.options}
    description="Minimal shell for the Options surface."
  />,
);
