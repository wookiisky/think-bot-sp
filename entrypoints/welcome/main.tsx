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
    <section
      style={{
        margin: '1.25rem auto',
        maxWidth: '960px',
        textAlign: 'center',
        fontSize: '0.9rem',
        color: '#4b5563',
      }}
    >
      <p style={{ margin: '0.25rem 0' }}>Locale seed: {localeParam}</p>
      <p style={{ margin: '0.25rem 0' }}>Environment: development</p>
    </section>
  </div>,
);
