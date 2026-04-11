/**
 * Login — Authentication entry point
 *
 * Shows branded landing page with Google Sign-In button.
 * Routes to ProfileSetup after successful authentication.
 */

export default function Login({ onGoogleSignIn }) {
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Tome</h1>
      <p style={styles.subtitle}>Your D&D Companion</p>
      <div style={styles.ornament}>── ✦ ──</div>
      <button style={styles.button} onClick={onGoogleSignIn}>
        Sign in with Google
      </button>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    gap: '0.75rem',
    backgroundColor: 'var(--page-bg)',
  },
  title: {
    fontSize: '3.5rem',
    margin: 0,
    fontFamily: 'var(--font-heading)',
    color: 'var(--accent-deep)',
  },
  subtitle: {
    fontSize: '1.2rem',
    fontFamily: 'var(--font-body)',
    fontStyle: 'italic',
    color: 'var(--ink-light)',
    margin: 0,
  },
  ornament: {
    color: 'var(--ink-faint)',
    fontFamily: 'var(--font-body)',
    fontSize: '1rem',
    margin: '0.5rem 0',
  },
  button: {
    marginTop: '0.5rem',
    padding: '0.75rem 1.5rem',
    borderRadius: '2px',
    backgroundColor: 'var(--accent)',
    color: '#fff',
    border: 'none',
    fontFamily: 'var(--font-body)',
    fontSize: '1.05rem',
    cursor: 'pointer',
  },
};
