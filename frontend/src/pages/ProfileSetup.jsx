/**
 * ProfileSetup — First-time user onboarding
 *
 * New users complete their profile with display name and favorite system.
 * Creates a profile record in the database. Required before accessing campaigns.
 */

import { useState } from 'react';

export default function ProfileSetup({ session, onComplete }) {
  const [displayName, setDisplayName] = useState(
    session.user.user_metadata?.full_name || '',
  );
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!displayName.trim()) {
      setError('Display name is required.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await onComplete({
        display_name: displayName.trim(),
        username: username.trim() || null,
        avatar_url: session.user.user_metadata?.avatar_url || null,
      });
    } catch (err) {
      if (err.message?.includes('duplicate') || err.code === '23505') {
        setError('That username is already taken. Try another.');
      } else {
        setError('Something went wrong. Please try again.');
      }
      setSaving(false);
    }
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Welcome to Tome</h1>
      <p style={styles.subtitle}>Set up your profile to get started</p>

      <form onSubmit={handleSubmit} style={styles.form}>
        <label style={styles.label}>
          Display Name *
          <input
            style={styles.input}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="How others will see you"
            autoFocus
          />
        </label>

        <label style={styles.label}>
          Username
          <input
            style={styles.input}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Optional unique handle"
          />
        </label>

        {error && <p style={styles.error}>{error}</p>}

        <button style={styles.button} type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Continue'}
        </button>
      </form>
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
    gap: '0.5rem',
    backgroundColor: 'var(--page-bg)',
  },
  title: {
    fontSize: '2.5rem',
    margin: 0,
    fontFamily: 'var(--font-heading)',
    color: 'var(--accent-deep)',
  },
  subtitle: {
    fontSize: '1.1rem',
    fontFamily: 'var(--font-body)',
    fontStyle: 'italic',
    color: 'var(--ink-light)',
    margin: '0 0 1rem 0',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    width: '100%',
    maxWidth: '360px',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    fontFamily: 'var(--font-body)',
    fontVariant: 'small-caps',
    letterSpacing: '0.05em',
    color: 'var(--ink-dark)',
  },
  input: {
    padding: '0.75rem 1rem',
    borderRadius: '2px',
    border: '1px solid var(--border-medium)',
    backgroundColor: 'var(--card-bg)',
    fontFamily: 'var(--font-body)',
    fontSize: '1rem',
    color: 'var(--ink-medium)',
    outline: 'none',
  },
  error: {
    color: 'var(--danger)',
    fontSize: '0.875rem',
    margin: 0,
  },
  button: {
    marginTop: '0.5rem',
    padding: '0.75rem 1.5rem',
    borderRadius: '2px',
    backgroundColor: 'var(--accent)',
    color: '#fff',
    border: 'none',
    fontFamily: 'var(--font-body)',
    fontSize: '1rem',
    cursor: 'pointer',
  },
};
