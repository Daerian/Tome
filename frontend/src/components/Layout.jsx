import { Link } from 'react-router-dom';

export default function Layout({ profile, onSignOut, children }) {
  return (
    <div style={styles.wrapper}>
      <header style={styles.header}>
        <Link to="/" style={styles.logo}>
          Tome
        </Link>
        <nav style={styles.nav}>
          <Link to="/" style={styles.link}>
            Campaigns
          </Link>
          <Link to="/account" style={styles.link}>
            {profile.display_name}
          </Link>
          <button style={styles.signOut} onClick={onSignOut}>
            Sign out
          </button>
        </nav>
      </header>
      <main style={styles.main}>{children}</main>
    </div>
  );
}

const styles = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem 1.5rem',
    borderBottom: '2px solid var(--border-medium)',
    backgroundColor: 'var(--sidebar-bg)',
  },
  logo: {
    fontSize: '1.35rem',
    fontWeight: 600,
    fontFamily: 'var(--font-heading)',
    color: 'var(--accent-deep)',
    textDecoration: 'none',
    letterSpacing: '0.15em',
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  link: {
    fontSize: '0.9rem',
    fontFamily: 'var(--font-body)',
    fontWeight: 500,
    color: 'var(--ink-medium)',
    textDecoration: 'none',
  },
  signOut: {
    padding: '0.4rem 0',
    borderRadius: 0,
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '1px solid currentColor',
    color: 'var(--ink-medium)',
    fontFamily: 'var(--font-body)',
    fontSize: '0.875rem',
    cursor: 'pointer',
  },
  main: {
    flex: 1,
  },
};
