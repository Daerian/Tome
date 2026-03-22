import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const API_URL = import.meta.env.VITE_API_URL

export default function SessionDetail({
  sessionId,
  campaignId,
  session,
  role,
  onBack,
}) {
  const [sessionData, setSessionData] = useState(null)
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)

  // Summary editing (DM only)
  const [editingSummary, setEditingSummary] = useState(false)
  const [summary, setSummary] = useState('')

  // Auto-recap (DM only)
  const [recapPreview, setRecapPreview] = useState('')
  const [generating, setGenerating] = useState(false)

  // Session prep brief (DM only)
  const [prepBrief, setPrepBrief] = useState('')
  const [generatingPrep, setGeneratingPrep] = useState(false)

  // Add note form (all members)
  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)

  useEffect(() => { fetchData() }, [sessionId])

  async function fetchData() {
    const [sessionRes, notesRes] = await Promise.all([
      supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .single(),
      supabase
        .from('notes')
        .select('id, title, content, created_at, author_id, profiles(display_name)')
        .eq('campaign_id', campaignId)
        .eq('related_entity_type', 'session')
        .eq('related_entity_id', sessionId)
        .order('created_at', { ascending: true }),
    ])

    if (sessionRes.data) {
      setSessionData(sessionRes.data)
      setSummary(sessionRes.data.summary || '')
      setPrepBrief(sessionRes.data.prep_brief || '')
    }
    if (notesRes.data) setNotes(notesRes.data)
    setLoading(false)
  }

  async function saveSummary() {
    const { error } = await supabase
      .from('sessions')
      .update({ summary: summary.trim() || null })
      .eq('id', sessionId)

    if (!error) {
      setSessionData(prev => ({ ...prev, summary: summary.trim() || null }))
      setEditingSummary(false)
    }
  }

  async function updateStatus(newStatus) {
    const updates = { status: newStatus }
    // Auto-fill played_date when marking completed
    if (newStatus === 'completed' && !sessionData.played_date) {
      updates.played_date = new Date().toISOString().slice(0, 10)
    }

    const { error } = await supabase
      .from('sessions')
      .update(updates)
      .eq('id', sessionId)

    if (!error) {
      setSessionData(prev => ({ ...prev, ...updates }))
    }
  }

  async function generateRecap() {
    setGenerating(true)
    setRecapPreview('')
    try {
      const res = await fetch(`${API_URL}/api/recap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, campaign_id: campaignId }),
      })
      const data = await res.json()
      setRecapPreview(data.recap)
    } catch {
      setRecapPreview('Error: could not generate recap.')
    } finally {
      setGenerating(false)
    }
  }

  async function useRecap() {
    const { error } = await supabase
      .from('sessions')
      .update({ summary: recapPreview })
      .eq('id', sessionId)

    if (!error) {
      setSessionData(prev => ({ ...prev, summary: recapPreview }))
      setSummary(recapPreview)
      setRecapPreview('')
    }
  }

  async function generatePrep() {
    setGeneratingPrep(true)
    setPrepBrief('')
    try {
      const res = await fetch(`${API_URL}/api/session-prep`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, campaign_id: campaignId }),
      })
      const data = await res.json()
      setPrepBrief(data.prep)
      setSessionData(prev => ({ ...prev, prep_brief: data.prep }))
    } catch {
      setPrepBrief('Error: could not generate session prep.')
    } finally {
      setGeneratingPrep(false)
    }
  }

  async function addNote() {
    if (!newNote.trim()) return
    setAddingNote(true)

    const { data, error } = await supabase
      .from('notes')
      .insert({
        campaign_id: campaignId,
        author_id: session.user.id,
        title: `Session ${sessionData.session_number} note`,
        content: newNote.trim(),
        type: 'session_note',
        visibility: 'public',
        related_entity_type: 'session',
        related_entity_id: sessionId,
      })
      .select('id, title, content, created_at, author_id, profiles(display_name)')
      .single()

    if (!error && data) {
      setNotes(prev => [...prev, data])
      setNewNote('')
    }
    setAddingNote(false)
  }

  if (loading) {
    return (
      <p style={{ textAlign: 'center', marginTop: '2rem', color: '#64748b' }}>
        Loading session...
      </p>
    )
  }

  if (!sessionData) {
    return (
      <div style={{ textAlign: 'center', marginTop: '2rem' }}>
        <p>Session not found.</p>
        <button style={styles.backBtn} onClick={onBack}>Back to Sessions</button>
      </div>
    )
  }

  const s = sessionData

  return (
    <div style={styles.container}>
      <button style={styles.backBtn} onClick={onBack}>
        &larr; Back to Sessions
      </button>

      {/* Session header */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>
            Session {s.session_number}: {s.title || 'Untitled'}
          </h2>
          {s.played_date && (
            <p style={styles.date}>Played: {s.played_date}</p>
          )}
        </div>
        <div style={styles.statusArea}>
          {role === 'dm' ? (
            <select
              style={styles.statusSelect}
              value={s.status}
              onChange={e => updateStatus(e.target.value)}
            >
              <option value="planned">Planned</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          ) : (
            <span style={styles.badge}>{s.status}</span>
          )}
        </div>
      </div>

      {/* Session Prep Brief — DM only */}
      {role === 'dm' && (
        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>Session Prep Brief</h3>
          {prepBrief ? (
            <div style={styles.prepPreview}>
              <div style={styles.prepContent}>{prepBrief}</div>
              <div style={{ ...styles.editActions, marginTop: '0.75rem' }}>
                <button
                  style={styles.prepBtn}
                  onClick={generatePrep}
                  disabled={generatingPrep}
                >
                  {generatingPrep ? 'Regenerating...' : 'Regenerate'}
                </button>
                <button
                  style={styles.buttonOutline}
                  onClick={() => setPrepBrief('')}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p style={styles.muted}>
                {generatingPrep
                  ? 'Generating session prep brief...'
                  : 'Generate an AI-powered brief to prepare for this session.'}
              </p>
              {!generatingPrep && (
                <button
                  style={{ ...styles.prepBtn, marginTop: '0.5rem' }}
                  onClick={generatePrep}
                >
                  Generate Session Prep
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {/* Summary section */}
      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Summary</h3>
        {editingSummary ? (
          <div style={styles.editArea}>
            <textarea
              style={styles.textarea}
              value={summary}
              onChange={e => setSummary(e.target.value)}
              placeholder="Write a summary of what happened..."
              rows={4}
            />
            <div style={styles.editActions}>
              <button style={styles.button} onClick={saveSummary}>
                Save
              </button>
              <button
                style={styles.buttonOutline}
                onClick={() => {
                  setEditingSummary(false)
                  setSummary(s.summary || '')
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            {s.summary ? (
              <p style={styles.summaryText}>{s.summary}</p>
            ) : (
              <p style={styles.muted}>No summary yet.</p>
            )}
            {role === 'dm' && (
              <div style={styles.summaryActions}>
                <button
                  style={styles.buttonSmall}
                  onClick={() => setEditingSummary(true)}
                >
                  {s.summary ? 'Edit Summary' : 'Add Summary'}
                </button>
                <button
                  style={styles.recapBtn}
                  onClick={generateRecap}
                  disabled={generating}
                >
                  {generating ? 'Generating...' : 'Generate Recap'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Recap preview — shown after the LLM generates one */}
        {recapPreview && !editingSummary && (
          <div style={styles.recapPreview}>
            <h4 style={styles.recapLabel}>Generated Recap</h4>
            <p style={styles.summaryText}>{recapPreview}</p>
            {role === 'dm' && (
              <div style={styles.editActions}>
                <button style={styles.button} onClick={useRecap}>
                  Use as Summary
                </button>
                <button
                  style={styles.buttonOutline}
                  onClick={() => setRecapPreview('')}
                >
                  Discard
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Notes section */}
      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Notes ({notes.length})</h3>

        {notes.length === 0 && (
          <p style={styles.muted}>
            No notes yet. Be the first to add one!
          </p>
        )}

        {notes.map(n => (
          <div key={n.id} style={styles.noteCard}>
            <div style={styles.noteMeta}>
              <span style={styles.noteAuthor}>
                {n.profiles?.display_name || 'Unknown'}
              </span>
              <span style={styles.noteDate}>
                {new Date(n.created_at).toLocaleDateString()}
              </span>
            </div>
            <p style={styles.noteContent}>{n.content}</p>
          </div>
        ))}

        {/* Add-note form */}
        <div style={styles.addNoteForm}>
          <textarea
            style={styles.noteInput}
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            placeholder="Add your notes about this session..."
            rows={3}
          />
          <button
            style={styles.button}
            onClick={addNote}
            disabled={addingNote || !newNote.trim()}
          >
            {addingNote ? 'Adding...' : 'Add Note'}
          </button>
        </div>
      </section>
    </div>
  )
}

const styles = {
  container: {
    maxWidth: '720px',
    margin: '0 auto',
    padding: '1.5rem',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#2563eb',
    fontSize: '0.875rem',
    cursor: 'pointer',
    padding: 0,
    marginBottom: '1rem',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: '0.5rem',
    marginBottom: '1.5rem',
  },
  title: {
    margin: 0,
    fontSize: '1.25rem',
    color: '#1e293b',
  },
  date: {
    margin: '0.25rem 0 0 0',
    fontSize: '0.85rem',
    color: '#64748b',
  },
  statusArea: {
    display: 'flex',
    alignItems: 'center',
  },
  statusSelect: {
    padding: '0.35rem 0.5rem',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '0.8rem',
    outline: 'none',
  },
  badge: {
    fontSize: '0.75rem',
    fontWeight: 500,
    padding: '0.2rem 0.5rem',
    borderRadius: '4px',
    backgroundColor: '#e2e8f0',
    color: '#334155',
  },
  section: {
    marginBottom: '1.5rem',
  },
  sectionTitle: {
    fontSize: '1rem',
    color: '#334155',
    margin: '0 0 0.75rem 0',
    paddingBottom: '0.4rem',
    borderBottom: '1px solid #e2e8f0',
  },
  summaryText: {
    margin: 0,
    fontSize: '0.95rem',
    color: '#334155',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
  },
  muted: {
    color: '#94a3b8',
    fontSize: '0.875rem',
  },
  editArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  textarea: {
    padding: '0.75rem',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '0.9rem',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
    lineHeight: 1.5,
  },
  editActions: {
    display: 'flex',
    gap: '0.5rem',
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
  buttonOutline: {
    padding: '0.5rem 1rem',
    borderRadius: '8px',
    backgroundColor: 'transparent',
    color: '#64748b',
    border: '1px solid #cbd5e1',
    fontSize: '0.875rem',
    cursor: 'pointer',
  },
  summaryActions: {
    display: 'flex',
    gap: '0.5rem',
    marginTop: '0.5rem',
  },
  buttonSmall: {
    padding: '0.35rem 0.75rem',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: '#2563eb',
    border: '1px solid #2563eb',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  recapBtn: {
    padding: '0.35rem 0.75rem',
    borderRadius: '6px',
    backgroundColor: '#7c3aed',
    color: '#fff',
    border: 'none',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  prepBtn: {
    padding: '0.5rem 1rem',
    borderRadius: '8px',
    backgroundColor: '#059669',
    color: '#fff',
    border: 'none',
    fontSize: '0.875rem',
    cursor: 'pointer',
  },
  prepPreview: {
    padding: '1rem',
    borderRadius: '8px',
    backgroundColor: '#ecfdf5',
    border: '1px solid #a7f3d0',
  },
  prepContent: {
    fontSize: '0.9rem',
    color: '#334155',
    lineHeight: 1.7,
    whiteSpace: 'pre-wrap',
  },
  recapPreview: {
    marginTop: '1rem',
    padding: '1rem',
    borderRadius: '8px',
    backgroundColor: '#f5f3ff',
    border: '1px solid #ddd6fe',
  },
  recapLabel: {
    margin: '0 0 0.5rem 0',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#6d28d9',
  },
  noteCard: {
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    backgroundColor: '#f8fafc',
    marginBottom: '0.5rem',
  },
  noteMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '0.25rem',
  },
  noteAuthor: {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#475569',
  },
  noteDate: {
    fontSize: '0.75rem',
    color: '#94a3b8',
  },
  noteContent: {
    margin: 0,
    fontSize: '0.9rem',
    color: '#334155',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
  },
  addNoteForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    marginTop: '0.75rem',
  },
  noteInput: {
    padding: '0.65rem 0.75rem',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '0.9rem',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
    lineHeight: 1.5,
  },
}
