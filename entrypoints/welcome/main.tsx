import '../../assets/styles/globals.css';

import { EXTENSION_PAGES } from '../../src/shared/extension-pages';
import { PageShell } from '../../src/ui/page-shell';
import { renderEntrypointApp } from '../../src/shared/react-entrypoint-root';

const localeParam = new URLSearchParams(window.location.search).get('locale') ?? 'en';
renderEntrypointApp(
  <div>
    <PageShell
      title="Welcome"
      route={EXTENSION_PAGES.welcome}
      description="Landing page for new installs and onboarding."
    />
    <section className="mx-auto mt-5 max-w-5xl text-center text-sm text-muted-foreground">
      <p style={{ margin: '0.25rem 0' }}>Locale seed: {localeParam}</p>
      <p style={{ margin: '0.25rem 0' }}>Environment: development</p>
    </section>
  </div>,
);
