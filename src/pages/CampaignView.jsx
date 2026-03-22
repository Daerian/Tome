import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Sessions from './Sessions'
import Chat from './Chat'

export default function CampaignView({ session }) {
  const { id } = useParams()
  const [campaign, setCampaign] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState('sessions')

  useEffect(() => {
    async function fetchCampaign() {
      const { data: membership } = await supabase
        .from('campaign_members')
        .select('role, campaigns(*)')
        .eq('campaign_id', id)
        .eq('user_id', session.user.id)
        .single()

      if (membership) {
        setCampaign(membership.campaigns)
        setRole(membership.role)
      }
      setLoading(false)
    }
    fetchCampaign()
  }, [id, session])

  function copyId() {
    navigator.clipboard.writeText(campaign.id)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <p style={{ textAlign: 'center', marginTop: '2rem', color: '#64748b' }}>
        Loading...
      </p>
    )
  }

  if (!campaign) {
    return (
      <div style={{ textAlign: 'center', marginTop: '3rem' }}>
        <p style={{ color: '#334155' }}>
          Campaign not found or you don't have access.
        </p>
        <Link to="/" style={{ color: '#2563eb' }}>Back to campaigns</Link>
      </div>
    )
  }

  return (
    <div style={styles.wrapper}>
      {/* Campaign header */}
      <div style={styles.campaignHeader}>
        <div>
          <h2 style={styles.name}>{campaign.name}</h2>
          {campaign.description && (
            <p style={styles.desc}>{campaign.description}</p>
          )}
        </div>
        <div style={styles.meta}>
          <span style={styles.badge}>{role.toUpperCase()}</span>
          <span style={styles.system}>{campaign.system}</span>
          {role === 'dm' && (
            <button
              style={styles.copyBtn}
              onClick={copyId}
              title="Share this ID with players so they can join"
            >
              {copied ? 'Copied!' : 'Copy ID'}
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div style={styles.tabBar}>
        <button
          style={tab === 'sessions' ? styles.tabActive : styles.tab}
          onClick={() => setTab('sessions')}
        >
          Sessions
        </button>
        <button
          style={tab === 'chat' ? styles.tabActive : styles.tab}
          onClick={() => setTab('chat')}
        >
          Chat
        </button>
      </div>

      {/* Tab content */}
      <div style={styles.content}>
        {tab === 'sessions' && (
          <Sessions campaignId={id} session={session} role={role} />
        )}
        {tab === 'chat' && <Chat campaignId={id} />}
      </div>
    </div>
  )
}

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: 'calc(100vh - 53px)',
  },
  campaignHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: '0.75rem',
    padding: '1rem 1.5rem',
    borderBottom: '1px solid #e2e8f0',
    backgroundColor: '#f8fafc',
  },
  name: {
    margin: 0,
    fontSize: '1.25rem',
    color: '#1e293b',
  },
  desc: {
    margin: '0.25rem 0 0 0',
    fontSize: '0.875rem',
    color: '#64748b',
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
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
  copyBtn: {
    padding: '0.3rem 0.6rem',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    border: '1px solid #cbd5e1',
    color: '#475569',
    fontSize: '0.75rem',
    cursor: 'pointer',
  },
  tabBar: {
    display: 'flex',
    gap: '0',
    borderBottom: '1px solid #e2e8f0',
    backgroundColor: '#fff',
  },
  tab: {
    padding: '0.65rem 1.25rem',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    fontSize: '0.875rem',
    color: '#64748b',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  tabActive: {
    padding: '0.65rem 1.25rem',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid #2563eb',
    fontSize: '0.875rem',
    color: '#2563eb',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
}
