import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Home({ session }) {
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchCampaigns() {
      const { data, error } = await supabase
        .from('campaign_members')
        .select('role, campaigns(id, name, description, system)')
        .eq('user_id', session.user.id)

      if (!error && data) {
        setCampaigns(data.map(m => ({ ...m.campaigns, role: m.role })))
      }
      setLoading(false)
    }
    fetchCampaigns()
  }, [session])

  if (loading) {
    return <p style={styles.loading}>Loading campaigns...</p>
  }

  return (
    <div style={styles.container}>
      <div style={styles.titleRow}>
        <h1 style={styles.title}>Your Campaigns</h1>
        <div style={styles.actions}>
          <Link to="/campaign/new" style={styles.button}>Create Campaign</Link>
          <Link to="/campaign/join" style={styles.buttonOutline}>Join Campaign</Link>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <div style={styles.empty}>
          <p style={styles.emptyText}>You're not in any campaigns yet.</p>
          <p style={styles.emptyHint}>Create one or join an existing campaign to get started.</p>
        </div>
      ) : (
        <div style={styles.grid}>
          {campaigns.map(c => (
            <Link to={`/campaign/${c.id}`} key={c.id} style={styles.card}>
              <div style={styles.cardTop}>
                <h3 style={styles.cardTitle}>{c.name}</h3>
                <span style={styles.badge}>{c.role.toUpperCase()}</span>
              </div>
              {c.description && <p style={styles.cardDesc}>{c.description}</p>}
              <span style={styles.system}>{c.system}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

const styles = {
  container: {
    maxWidth: '900px',
    margin: '0 auto',
    padding: '2rem 1.5rem',
  },
  loading: {
    textAlign: 'center',
    marginTop: '3rem',
    color: '#64748b',
  },
  titleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '1rem',
    marginBottom: '1.5rem',
  },
  title: {
    fontSize: '1.75rem',
    margin: 0,
    color: '#1e293b',
  },
  actions: {
    display: 'flex',
    gap: '0.5rem',
  },
  button: {
    padding: '0.6rem 1.25rem',
    borderRadius: '8px',
    backgroundColor: '#2563eb',
    color: '#fff',
    border: 'none',
    fontSize: '0.875rem',
    textDecoration: 'none',
    cursor: 'pointer',
  },
  buttonOutline: {
    padding: '0.6rem 1.25rem',
    borderRadius: '8px',
    backgroundColor: 'transparent',
    color: '#2563eb',
    border: '1px solid #2563eb',
    fontSize: '0.875rem',
    textDecoration: 'none',
    cursor: 'pointer',
  },
  empty: {
    textAlign: 'center',
    padding: '3rem 1rem',
    backgroundColor: '#f8fafc',
    borderRadius: '12px',
    border: '1px dashed #cbd5e1',
  },
  emptyText: {
    fontSize: '1.1rem',
    color: '#334155',
    margin: '0 0 0.5rem 0',
  },
  emptyHint: {
    fontSize: '0.9rem',
    color: '#64748b',
    margin: 0,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '1rem',
  },
  card: {
    display: 'block',
    padding: '1.25rem',
    borderRadius: '12px',
    border: '1px solid #e2e8f0',
    backgroundColor: '#fff',
    textDecoration: 'none',
    color: 'inherit',
    transition: 'box-shadow 0.15s',
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '0.5rem',
    marginBottom: '0.5rem',
  },
  cardTitle: {
    margin: 0,
    fontSize: '1.1rem',
    color: '#1e293b',
  },
  badge: {
    fontSize: '0.7rem',
    fontWeight: 600,
    padding: '0.2rem 0.5rem',
    borderRadius: '4px',
    backgroundColor: '#ede9fe',
    color: '#6d28d9',
    whiteSpace: 'nowrap',
  },
  cardDesc: {
    fontSize: '0.875rem',
    color: '#64748b',
    margin: '0 0 0.75rem 0',
    lineHeight: 1.4,
  },
  system: {
    fontSize: '0.75rem',
    color: '#94a3b8',
  },
}
