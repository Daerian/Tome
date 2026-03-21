import { Link } from 'react-router-dom'

export default function Layout({ profile, onSignOut, children }) {
  return (
    <div style={styles.wrapper}>
      <header style={styles.header}>
        <Link to="/" style={styles.logo}>Tome</Link>
        <nav style={styles.nav}>
          <Link to="/" style={styles.link}>Campaigns</Link>
          <Link to="/account" style={styles.link}>{profile.display_name}</Link>
          <button style={styles.signOut} onClick={onSignOut}>Sign out</button>
        </nav>
      </header>
      <main style={styles.main}>
        {children}
      </main>
    </div>
  )
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
    borderBottom: '1px solid #e2e8f0',
    backgroundColor: '#fff',
  },
  logo: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#1e293b',
    textDecoration: 'none',
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  link: {
    fontSize: '0.875rem',
    color: '#475569',
    textDecoration: 'none',
  },
  signOut: {
    padding: '0.4rem 0.75rem',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    border: '1px solid #cbd5e1',
    color: '#475569',
    fontSize: '0.875rem',
    cursor: 'pointer',
  },
  main: {
    flex: 1,
  },
}
