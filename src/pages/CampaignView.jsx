import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Chat from './Chat'

export default function CampaignView({ session }) {
  const { id } = useParams()
  const [campaign, setCampaign] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

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
    return <p style={{ textAlign: 'center', marginTop: '2rem', color: '#64748b' }}>Loading...</p>
  }

  if (!campaign) {
    return (
      <div style={{ textAlign: 'center', marginTop: '3rem' }}>
        <p style={{ color: '#334155' }}>Campaign not found or you don't have access.</p>
        <Link to="/" style={{ color: '#2563eb' }}>Back to campaigns</Link>
      </div>
    )
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.campaignHeader}>
        <div>
          <h2 style={styles.name}>{campaign.name}</h2>
          {campaign.description && <p style={styles.desc}>{campaign.description}</p>}
        </div>
        <div style={styles.meta}>
          <span style={styles.badge}>{role.toUpperCase()}</span>
          <span style={styles.system}>{campaign.system}</span>
          {role === 'dm' && (
            <button style={styles.copyBtn} onClick={copyId} title="Share this ID with players so they can join">
              {copied ? 'Copied!' : 'Copy ID'}
            </button>
          )}
        </div>
      </div>
      <Chat />
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
}
