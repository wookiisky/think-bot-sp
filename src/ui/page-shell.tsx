type PageShellProps = {
  title: string;
  route: string;
  description: string;
};

export const PageShell = ({ title, route, description }: PageShellProps) => {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at top, #ffffff, #f4f4f7 55%)',
        padding: '2rem 1.5rem',
        fontFamily: '"Segoe UI", system-ui, -apple-system, sans-serif',
        color: '#111',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <section
        style={{
          width: 'min(960px, 100%)',
          background: '#fff',
          borderRadius: '18px',
          padding: '2rem',
          boxShadow: '0 20px 40px rgba(15, 15, 15, 0.08)',
        }}
      >
        <header>
          <p
            style={{
              textTransform: 'uppercase',
              letterSpacing: '0.2em',
              color: '#4b5563',
              fontSize: '0.75rem',
              margin: 0,
            }}
          >
            Stage 1 shell
          </p>
          <h1 style={{ margin: '0.8rem 0', fontSize: '2rem' }}>{title}</h1>
        </header>

        <p style={{ color: '#374151', fontSize: '1rem', marginTop: 0 }}>{description}</p>

        <div
          style={{
            marginTop: '1.5rem',
            padding: '1rem',
            background: '#f9fafb',
            borderRadius: '12px',
            fontSize: '0.95rem',
            lineHeight: 1.5,
          }}
        >
          <p style={{ margin: '0.25rem 0', fontWeight: 600 }}>Route</p>
          <code style={{ fontSize: '0.9rem', whiteSpace: 'nowrap' }}>{route}</code>
        </div>

        <p
          style={{
            marginTop: '1rem',
            fontSize: '0.95rem',
            color: '#6b7280',
          }}
        >
          Environment: development
        </p>
      </section>
    </main>
  );
};
