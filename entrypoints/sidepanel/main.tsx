import { createRoot } from 'react-dom/client';

import { EXTENSION_PAGES } from '../../src/shared/extension-pages';
import { PageShell } from '../../src/ui/page-shell';

const root = createRoot(document.getElementById('root')!);
root.render(
  <PageShell
    title="Side Panel"
    route={EXTENSION_PAGES.sidePanel}
    description="Stage 1 placeholder for the Side Panel surface."
  />,
);
