export default function Login({ onGoogleSignIn }) {
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Tome</h1>
      <p style={styles.subtitle}>Your D&D Companion</p>
      <button style={styles.button} onClick={onGoogleSignIn}>
        Sign in with Google
      </button>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    gap: '1rem',
  },
  title: {
    fontSize: '3rem',
    margin: 0,
    color: '#1e293b',
  },
  subtitle: {
    fontSize: '1.2rem',
    color: '#64748b',
    margin: 0,
  },
  button: {
    marginTop: '1.5rem',
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    backgroundColor: '#2563eb',
    color: '#fff',
    border: 'none',
    fontSize: '1rem',
    cursor: 'pointer',
  },
}
