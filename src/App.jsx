import { useAuth } from './lib/useAuth'
import Chat from './pages/Chat'
import Login from './pages/Login'

export default function App() {
  const { session, loading, signInWithGoogle, signOut } = useAuth()

  if (loading) return null

  if (!session) return <Login onGoogleSignIn={signInWithGoogle} />

  return (
    <div>
      <header style={styles.header}>
        <span style={styles.user}>{session.user.email}</span>
        <button style={styles.signOut} onClick={signOut}>Sign out</button>
      </header>
      <Chat />
    </div>
  )
}

const styles = {
  header: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: '1rem',
    padding: '0.5rem 1rem',
    borderBottom: '1px solid #e2e8f0',
  },
  user: {
    fontSize: '0.875rem',
    color: '#64748b',
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
}
