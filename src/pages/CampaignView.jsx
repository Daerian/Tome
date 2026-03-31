/**
 * CampaignView — Main campaign dashboard
 *
 * Split-panel layout showing campaign details with left/right navigation.
 * Left panel: Sessions → Wiki (NPCs/Locations/Missions/Treasury) → Timeline → Adventure
 * Right panel: Chat (with DM/AI context) → D&D 5e Rules Reference
 *
 * Fetches campaign + user role on mount. Displays campaign info, allows DM to delete.
 * Acts as the central hub for all campaign management and play.
 */

import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Sessions from './Sessions'
import Wiki from './Wiki'
import Timeline from './Timeline'
import Chat from './Chat'
import Reference from './Reference'
import AdventureViewer from './AdventureViewer'

export default function CampaignView({ session }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [campaign, setCampaign] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [leftTab, setLeftTab] = useState('sessions')
  const [rightTab, setRightTab] = useState('chat')

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

  async function deleteCampaign() {
    if (!window.confirm(`Delete "${campaign.name}"? This will permanently remove all sessions, characters, and data. This cannot be undone.`)) return
    const { error } = await supabase.from('campaigns').delete().eq('id', campaign.id)
    if (error) {
      alert('Failed to delete campaign.')
    } else {
      navigate('/')
    }
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
            <>
              <button
                style={styles.copyBtn}
                onClick={copyId}
                title="Share this ID with players so they can join"
              >
                {copied ? 'Copied!' : 'Copy ID'}
              </button>
              <button
                style={styles.deleteBtn}
                onClick={deleteCampaign}
                title="Delete this campaign"
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {/* Split panel layout */}
      <div style={styles.splitContainer}>
        {/* Left panel — Sessions / Adventure */}
        <div style={styles.leftPanel}>
          <div style={styles.panelTabBar}>
            <button
              style={leftTab === 'sessions' ? styles.panelTabActive : styles.panelTab}
              onClick={() => setLeftTab('sessions')}
            >
              Sessions
            </button>
            <button
              style={leftTab === 'wiki' ? styles.panelTabActive : styles.panelTab}
              onClick={() => setLeftTab('wiki')}
            >
              Wiki
            </button>
            <button
              style={leftTab === 'timeline' ? styles.panelTabActive : styles.panelTab}
              onClick={() => setLeftTab('timeline')}
            >
              Timeline
            </button>
            {campaign.adventure_source && role === 'dm' && (
              <button
                style={leftTab === 'adventure' ? styles.panelTabActive : styles.panelTab}
                onClick={() => setLeftTab('adventure')}
              >
                Adventure
              </button>
            )}
          </div>
          <div style={styles.panelContent}>
            {leftTab === 'sessions' && (
              <Sessions campaignId={id} session={session} role={role} />
            )}
            {leftTab === 'wiki' && (
              <Wiki campaignId={id} session={session} role={role} />
            )}
            {leftTab === 'timeline' && (
              <Timeline campaignId={id} role={role} />
            )}
            {leftTab === 'adventure' && campaign.adventure_source && role === 'dm' && (
              <AdventureViewer code={campaign.adventure_source} />
            )}
          </div>
        </div>

        {/* Divider */}
        <div style={styles.divider} />

        {/* Right panel — Chat / D&D Ref */}
        <div style={styles.rightPanel}>
          <div style={styles.panelTabBar}>
            <button
              style={rightTab === 'chat' ? styles.panelTabActive : styles.panelTab}
              onClick={() => setRightTab('chat')}
            >
              Chat
            </button>
            <button
              style={rightTab === 'reference' ? styles.panelTabActive : styles.panelTab}
              onClick={() => setRightTab('reference')}
            >
              D&D Ref
            </button>
          </div>
          <div style={styles.panelContent}>
            {rightTab === 'chat' && <Chat campaignId={id} session={session} role={role} />}
            {rightTab === 'reference' && <Reference system={campaign.system} role={role} />}
          </div>
        </div>
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
  deleteBtn: {
    padding: '0.3rem 0.6rem',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    border: '1px solid #fca5a5',
    color: '#dc2626',
    fontSize: '0.75rem',
    cursor: 'pointer',
  },
  splitContainer: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  leftPanel: {
    width: '50%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  rightPanel: {
    width: '50%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  divider: {
    width: '1px',
    backgroundColor: '#e2e8f0',
    flexShrink: 0,
  },
  panelTabBar: {
    display: 'flex',
    gap: '0',
    borderBottom: '1px solid #e2e8f0',
    backgroundColor: '#fff',
    flexShrink: 0,
  },
  panelTab: {
    padding: '0.55rem 1rem',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    fontSize: '0.8rem',
    color: '#64748b',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  panelTabActive: {
    padding: '0.55rem 1rem',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid #2563eb',
    fontSize: '0.8rem',
    color: '#2563eb',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  panelContent: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
}
