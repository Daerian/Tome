import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import SessionDetail from './SessionDetail'

const API_URL = import.meta.env.VITE_API_URL

export default function Sessions({ campaignId, session, role }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)

  // New-session form state (DM only)
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [prepNotes, setPrepNotes] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => { fetchSessions() }, [campaignId])

  async function fetchSessions() {
    const { data } = await supabase
      .from('sessions')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('session_number', { ascending: false })

    if (data) setSessions(data)
    setLoading(false)
  }

  async function createSession() {
    if (!newTitle.trim()) return
    setCreating(true)

    const nextNumber = sessions.length > 0
      ? Math.max(...sessions.map(s => s.session_number)) + 1
      : 1

    const insertData = {
      campaign_id: campaignId,
      title: newTitle.trim(),
      session_number: nextNumber,
      status: 'planned',
    }
    if (prepNotes.trim()) {
      insertData.dm_notes = prepNotes.trim()
    }

    const { data, error } = await supabase
      .from('sessions')
      .insert(insertData)
      .select()
      .single()

    if (!error && data) {
      setSessions([data, ...sessions])

      // Fire-and-forget: auto-generate the session prep brief
      fetch(`${API_URL}/api/session-prep`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: data.id,
          campaign_id: campaignId,
          dm_prep_notes: prepNotes.trim() || null,
        }),
      }).catch(() => {})

      setNewTitle('')
      setPrepNotes('')
      setShowCreate(false)

      // Navigate to the new session detail
      setSelectedId(data.id)
    }
    setCreating(false)
  }

  // Drill into a single session — re-fetch list on return
  if (selectedId) {
    return (
      <SessionDetail
        sessionId={selectedId}
        campaignId={campaignId}
        session={session}
        role={role}
        onBack={() => { setSelectedId(null); fetchSessions() }}
      />
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Sessions</h2>
        {role === 'dm' && (
          <button
            style={styles.button}
            onClick={() => setShowCreate(!showCreate)}
          >
            {showCreate ? 'Cancel' : 'New Session'}
          </button>
        )}
      </div>

      {showCreate && (
        <div style={styles.createForm}>
          <input
            style={styles.input}
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="Session title..."
            autoFocus
          />
          <textarea
            style={styles.prepNotesInput}
            value={prepNotes}
            onChange={e => setPrepNotes(e.target.value)}
            placeholder="Any plans for this session? e.g., moving to a new location, introducing an NPC..."
            rows={3}
          />
          <button
            style={styles.button}
            onClick={createSession}
            disabled={creating || !newTitle.trim()}
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      )}

      {loading ? (
        <p style={styles.muted}>Loading sessions...</p>
      ) : sessions.length === 0 ? (
        <div style={styles.empty}>
          <p style={styles.emptyText}>No sessions yet.</p>
          {role === 'dm' && (
            <p style={styles.muted}>
              Create your first session to get started.
            </p>
          )}
        </div>
      ) : (
        <div style={styles.list}>
          {sessions.map(s => (
            <button
              key={s.id}
              style={styles.sessionCard}
              onClick={() => setSelectedId(s.id)}
            >
              <div style={styles.cardTop}>
                <span style={styles.number}>
                  Session {s.session_number}
                </span>
                <span style={{
                  ...styles.statusBadge,
                  backgroundColor: statusColors[s.status] || '#e2e8f0',
                }}>
                  {s.status}
                </span>
              </div>
              <span style={styles.sessionTitle}>
                {s.title || 'Untitled'}
              </span>
              {s.played_date && (
                <span style={styles.date}>{s.played_date}</span>
              )}
              {s.summary && (
                <p style={styles.preview}>
                  {s.summary.length > 120
                    ? s.summary.substring(0, 120) + '...'
                    : s.summary}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const statusColors = {
  planned: '#dbeafe',
  in_progress: '#fef3c7',
  completed: '#d1fae5',
  cancelled: '#fee2e2',
}

const styles = {
  container: {
    maxWidth: '720px',
    margin: '0 auto',
    padding: '1.5rem',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  },
  title: {
    margin: 0,
    fontSize: '1.25rem',
    color: '#1e293b',
  },
  button: {
    padding: '0.5rem 1rem',
    borderRadius: '8px',
    backgroundColor: '#2563eb',
    color: '#fff',
    border: 'none',
    fontSize: '0.875rem',
    cursor: 'pointer',
  },
  createForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    marginBottom: '1rem',
  },
  input: {
    padding: '0.6rem 0.75rem',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '0.9rem',
    outline: 'none',
  },
  prepNotesInput: {
    padding: '0.6rem 0.75rem',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '0.85rem',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
    lineHeight: 1.5,
  },
  muted: {
    color: '#94a3b8',
    fontSize: '0.9rem',
  },
  empty: {
    textAlign: 'center',
    padding: '3rem 1rem',
    backgroundColor: '#f8fafc',
    borderRadius: '12px',
    border: '1px dashed #cbd5e1',
  },
  emptyText: {
    margin: '0 0 0.25rem 0',
    color: '#334155',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  sessionCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    padding: '1rem',
    borderRadius: '10px',
    border: '1px solid #e2e8f0',
    backgroundColor: '#fff',
    textAlign: 'left',
    cursor: 'pointer',
    width: '100%',
    fontFamily: 'inherit',
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  number: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.02em',
  },
  statusBadge: {
    fontSize: '0.7rem',
    fontWeight: 500,
    padding: '0.15rem 0.4rem',
    borderRadius: '4px',
    color: '#334155',
  },
  sessionTitle: {
    fontSize: '1rem',
    fontWeight: 500,
    color: '#1e293b',
  },
  date: {
    fontSize: '0.8rem',
    color: '#94a3b8',
  },
  preview: {
    margin: 0,
    fontSize: '0.85rem',
    color: '#64748b',
    lineHeight: 1.4,
  },
}
