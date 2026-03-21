import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Account({ session, profile, updateProfile }) {
  const [campaigns, setCampaigns] = useState([])
  const [characters, setCharacters] = useState([])
  const [loading, setLoading] = useState(true)

  const [editing, setEditing] = useState(false)
  const [displayName, setDisplayName] = useState(profile?.display_name || '')
  const [username, setUsername] = useState(profile?.username || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchData() {
      const [memberRes, charRes] = await Promise.all([
        supabase
          .from('campaign_members')
          .select('role, campaigns(id, name, system)')
          .eq('user_id', session.user.id),
        supabase
          .from('characters')
          .select('id, name, race, class, level, campaign_id, campaigns(name)')
          .eq('owner_id', session.user.id),
      ])

      if (memberRes.data) {
        setCampaigns(memberRes.data.map(m => ({ ...m.campaigns, role: m.role })))
      }
      if (charRes.data) {
        setCharacters(charRes.data)
      }
      setLoading(false)
    }
    fetchData()
  }, [session])

  async function handleSave() {
    if (!displayName.trim()) {
      setError('Display name is required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await updateProfile({
        display_name: displayName.trim(),
        username: username.trim() || null,
      })
      setEditing(false)
    } catch (err) {
      if (err.message?.includes('duplicate') || err.code === '23505') {
        setError('That username is already taken.')
      } else {
        setError('Failed to save. Please try again.')
      }
    }
    setSaving(false)
  }

  // Group characters by campaign
  const charsByCampaign = characters.reduce((acc, char) => {
    const cName = char.campaigns?.name || 'Unknown Campaign'
    if (!acc[cName]) acc[cName] = []
    acc[cName].push(char)
    return acc
  }, {})

  return (
    <div style={styles.container}>
      {/* Profile */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Profile</h2>
        {editing ? (
          <div style={styles.editForm}>
            <label style={styles.label}>
              Display Name *
              <input
                style={styles.input}
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
              />
            </label>
            <label style={styles.label}>
              Username
              <input
                style={styles.input}
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Optional unique handle"
              />
            </label>
            {error && <p style={styles.error}>{error}</p>}
            <div style={styles.editActions}>
              <button style={styles.button} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                style={styles.buttonOutline}
                onClick={() => {
                  setEditing(false)
                  setDisplayName(profile.display_name)
                  setUsername(profile.username || '')
                  setError('')
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={styles.profileInfo}>
            <div style={styles.infoRow}><strong>Display Name:</strong> {profile.display_name}</div>
            {profile.username && <div style={styles.infoRow}><strong>Username:</strong> {profile.username}</div>}
            <div style={styles.infoRow}><strong>Email:</strong> {session.user.email}</div>
            <button style={styles.buttonOutline} onClick={() => setEditing(true)}>Edit Profile</button>
          </div>
        )}
      </section>

      {/* Campaigns */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Campaigns</h2>
        {loading ? (
          <p style={styles.muted}>Loading...</p>
        ) : campaigns.length === 0 ? (
          <p style={styles.muted}>You're not in any campaigns yet.</p>
        ) : (
          <div style={styles.list}>
            {campaigns.map(c => (
              <Link to={`/campaign/${c.id}`} key={c.id} style={styles.listItem}>
                <span style={styles.itemName}>{c.name}</span>
                <span style={styles.badge}>{c.role.toUpperCase()}</span>
                <span style={styles.system}>{c.system}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Characters */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Characters</h2>
        {loading ? (
          <p style={styles.muted}>Loading...</p>
        ) : characters.length === 0 ? (
          <p style={styles.muted}>You don't have any characters yet.</p>
        ) : (
          Object.entries(charsByCampaign).map(([campaignName, chars]) => (
            <div key={campaignName} style={styles.charGroup}>
              <h3 style={styles.charGroupTitle}>{campaignName}</h3>
              {chars.map(ch => (
                <div key={ch.id} style={styles.charCard}>
                  <span style={styles.charName}>{ch.name}</span>
                  <span style={styles.charDetails}>
                    {[ch.race, ch.class, ch.level ? `Lvl ${ch.level}` : null].filter(Boolean).join(' · ')}
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
      </section>
    </div>
  )
}

const styles = {
  container: {
    maxWidth: '720px',
    margin: '0 auto',
    padding: '2rem 1.5rem',
  },
  section: {
    marginBottom: '2rem',
  },
  sectionTitle: {
    fontSize: '1.25rem',
    color: '#1e293b',
    margin: '0 0 1rem 0',
    paddingBottom: '0.5rem',
    borderBottom: '1px solid #e2e8f0',
  },
  profileInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  infoRow: {
    fontSize: '0.95rem',
    color: '#334155',
  },
  editForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  editActions: {
    display: 'flex',
    gap: '0.5rem',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#334155',
  },
  input: {
    padding: '0.65rem 0.75rem',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '1rem',
    outline: 'none',
  },
  error: {
    color: '#dc2626',
    fontSize: '0.875rem',
    margin: 0,
  },
  button: {
    padding: '0.6rem 1.25rem',
    borderRadius: '8px',
    backgroundColor: '#2563eb',
    color: '#fff',
    border: 'none',
    fontSize: '0.875rem',
    cursor: 'pointer',
  },
  buttonOutline: {
    padding: '0.6rem 1.25rem',
    borderRadius: '8px',
    backgroundColor: 'transparent',
    color: '#2563eb',
    border: '1px solid #2563eb',
    fontSize: '0.875rem',
    cursor: 'pointer',
    marginTop: '0.5rem',
  },
  muted: {
    color: '#94a3b8',
    fontSize: '0.9rem',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    textDecoration: 'none',
    color: 'inherit',
  },
  itemName: {
    flex: 1,
    fontWeight: 500,
    color: '#1e293b',
  },
  badge: {
    fontSize: '0.7rem',
    fontWeight: 600,
    padding: '0.2rem 0.5rem',
    borderRadius: '4px',
    backgroundColor: '#ede9fe',
    color: '#6d28d9',
  },
  system: {
    fontSize: '0.75rem',
    color: '#94a3b8',
  },
  charGroup: {
    marginBottom: '1rem',
  },
  charGroupTitle: {
    fontSize: '0.95rem',
    color: '#475569',
    margin: '0 0 0.5rem 0',
  },
  charCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.6rem 1rem',
    borderRadius: '8px',
    backgroundColor: '#f8fafc',
    marginBottom: '0.4rem',
  },
  charName: {
    fontWeight: 500,
    color: '#1e293b',
  },
  charDetails: {
    fontSize: '0.8rem',
    color: '#64748b',
  },
}
