import { createRoot } from 'react-dom/client';

import { EXTENSION_PAGES } from '../../src/shared/extension-pages';
import { PageShell } from '../../src/ui/page-shell';

const root = createRoot(document.getElementById('root')!);
root.render(
  <PageShell
    title="Conversations"
    route={EXTENSION_PAGES.conversations}
    description="Placeholder for the Conversations experience."
  />,
);
