/**
 * Timeline — Campaign chronology and story beat tracker
 *
 * Displays timeline events and story beats in chronological order.
 * Timeline events: factual events (battles, treaties, births).
 * Story beats: narrative threads (plot hooks, reveals, character arcs) with visibility control.
 * Shows events grouped by date with search/filter. DM can create/edit/delete.
 */

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const API_URL = import.meta.env.VITE_API_URL

const EVENT_TYPES = [
  'world_history', 'campaign_event', 'character_event',
  'political', 'divine', 'combat', 'discovery',
]

const BEAT_TYPES = [
  'plot_hook', 'reveal', 'cliffhanger',
  'character_moment', 'twist', 'resolution', 'foreshadowing',
]

export default function Timeline({ campaignId, role }) {
  const [events, setEvents] = useState([])
  const [beats, setBeats] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('events')

  // Add event form (DM only)
  const [showAddEvent, setShowAddEvent] = useState(false)
  const [newEvent, setNewEvent] = useState({
    title: '', description: '', in_world_date: '',
    event_type: 'campaign_event', importance: 'major',
  })
  const [addingEvent, setAddingEvent] = useState(false)

  // Extract beats
  const [extracting, setExtracting] = useState(false)
  const [extractedBeats, setExtractedBeats] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchData() }, [campaignId])

  async function fetchData() {
    const [eventsRes, beatsRes] = await Promise.all([
      supabase
        .from('timeline_events')
        .select('id, title, description, event_type, importance, in_world_date, sort_order, location_id')
        .eq('campaign_id', campaignId)
        .order('sort_order', { ascending: true }),
      supabase
        .from('story_beats')
        .select('id, title, description, type, status, notes, sort_order')
        .eq('campaign_id', campaignId)
        .order('sort_order', { ascending: true }),
    ])
    if (eventsRes.data) setEvents(eventsRes.data)
    if (beatsRes.data) setBeats(beatsRes.data)
    setLoading(false)
  }

  async function addEvent(e) {
    e.preventDefault()
    if (!newEvent.title.trim()) return
    setAddingEvent(true)

    const maxOrder = events.length > 0
      ? Math.max(...events.map(ev => ev.sort_order || 0))
      : 0

    const { data, error } = await supabase
      .from('timeline_events')
      .insert({
        campaign_id: campaignId,
        title: newEvent.title.trim(),
        description: newEvent.description.trim() || null,
        in_world_date: newEvent.in_world_date.trim() || 'Unknown',
        event_type: newEvent.event_type,
        importance: newEvent.importance,
        sort_order: maxOrder + 1,
      })
      .select()
      .single()

    if (!error && data) {
      setEvents(prev => [...prev, data])
      setNewEvent({
        title: '', description: '', in_world_date: '',
        event_type: 'campaign_event', importance: 'major',
      })
      setShowAddEvent(false)
    }
    setAddingEvent(false)
  }

  async function deleteEvent(id) {
    if (!window.confirm('Delete this timeline event?')) return
    const { error } = await supabase
      .from('timeline_events')
      .delete()
      .eq('id', id)
    if (!error) {
      setEvents(prev => prev.filter(ev => ev.id !== id))
    }
  }

  async function extractBeats() {
    setExtracting(true)
    setExtractedBeats([])
    try {
      const res = await fetch(`${API_URL}/api/extract-beats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaignId }),
      })
      const data = await res.json()
      setExtractedBeats(data.beats || [])
    } catch {
      setExtractedBeats([])
    } finally {
      setExtracting(false)
    }
  }

  async function saveExtractedBeats() {
    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/save-beats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaignId, beats: extractedBeats }),
      })
      const data = await res.json()
      if (data.saved > 0) {
        setExtractedBeats([])
        fetchData()
      }
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  function removeExtractedBeat(index) {
    setExtractedBeats(prev => prev.filter((_, i) => i !== index))
  }

  async function updateBeatStatus(id, newStatus) {
    const { error } = await supabase
      .from('story_beats')
      .update({ status: newStatus })
      .eq('id', id)
    if (!error) {
      setBeats(prev => prev.map(b => b.id === id ? { ...b, status: newStatus } : b))
    }
  }

  if (loading) {
    return <p style={{ textAlign: 'center', marginTop: '2rem', color: '#64748b' }}>Loading...</p>
  }

  return (
    <div style={styles.container}>
      {/* Sub-tabs */}
      <div style={styles.subTabs}>
        <button
          style={tab === 'events' ? styles.subTabActive : styles.subTab}
          onClick={() => setTab('events')}
        >
          Events ({events.length})
        </button>
        <button
          style={tab === 'beats' ? styles.subTabActive : styles.subTab}
          onClick={() => setTab('beats')}
        >
          Story Beats ({beats.length})
        </button>
      </div>

      {/* Timeline Events */}
      {tab === 'events' && (
        <div>
          {role === 'dm' && (
            <div style={styles.actions}>
              <button
                style={styles.addBtn}
                onClick={() => setShowAddEvent(!showAddEvent)}
              >
                {showAddEvent ? 'Cancel' : '+ Add Event'}
              </button>
            </div>
          )}

          {showAddEvent && role === 'dm' && (
            <form onSubmit={addEvent} style={styles.form}>
              <input
                style={styles.input}
                value={newEvent.title}
                onChange={e => setNewEvent(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Event title"
                required
              />
              <textarea
                style={styles.textarea}
                value={newEvent.description}
                onChange={e => setNewEvent(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Description (optional)"
                rows={2}
              />
              <input
                style={styles.input}
                value={newEvent.in_world_date}
                onChange={e => setNewEvent(prev => ({ ...prev, in_world_date: e.target.value }))}
                placeholder="In-world date (e.g. 3rd of Mirtul, 1492 DR)"
              />
              <div style={styles.row}>
                <select
                  style={styles.select}
                  value={newEvent.event_type}
                  onChange={e => setNewEvent(prev => ({ ...prev, event_type: e.target.value }))}
                >
                  {EVENT_TYPES.map(t => (
                    <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                  ))}
                </select>
                <select
                  style={styles.select}
                  value={newEvent.importance}
                  onChange={e => setNewEvent(prev => ({ ...prev, importance: e.target.value }))}
                >
                  <option value="major">Major</option>
                  <option value="minor">Minor</option>
                  <option value="background">Background</option>
                </select>
              </div>
              <button style={styles.submitBtn} type="submit" disabled={addingEvent}>
                {addingEvent ? 'Adding...' : 'Add Event'}
              </button>
            </form>
          )}

          {events.length === 0 ? (
            <p style={styles.empty}>No timeline events yet.</p>
          ) : (
            <div style={styles.timeline}>
              {events.map(ev => (
                <div key={ev.id} style={styles.eventCard}>
                  <div style={styles.eventHeader}>
                    <span style={{
                      ...styles.importanceDot,
                      backgroundColor: ev.importance === 'major' ? '#ef4444'
                        : ev.importance === 'minor' ? '#f59e0b' : '#94a3b8',
                    }} />
                    <span style={styles.eventDate}>{ev.in_world_date}</span>
                    <span style={styles.eventType}>{ev.event_type.replace(/_/g, ' ')}</span>
                    {role === 'dm' && (
                      <button
                        style={styles.deleteBtn}
                        onClick={() => deleteEvent(ev.id)}
                        title="Delete event"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                  <h4 style={styles.eventTitle}>{ev.title}</h4>
                  {ev.description && (
                    <p style={styles.eventDesc}>{ev.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Story Beats */}
      {tab === 'beats' && (
        <div>
          {role === 'dm' && (
            <div style={styles.actions}>
              <button
                style={styles.extractBtn}
                onClick={extractBeats}
                disabled={extracting}
              >
                {extracting ? 'Analyzing campaign...' : 'Extract Story Beats'}
              </button>
            </div>
          )}

          {/* Extracted beats preview */}
          {extractedBeats.length > 0 && (
            <div style={styles.extractedSection}>
              <h4 style={styles.extractedTitle}>
                Extracted Beats ({extractedBeats.length})
              </h4>
              <p style={styles.extractedHint}>
                Review and remove any you don't want, then save.
              </p>
              {extractedBeats.map((beat, i) => (
                <div key={i} style={styles.extractedCard}>
                  <div style={styles.extractedHeader}>
                    <span style={styles.beatType}>{beat.type?.replace(/_/g, ' ')}</span>
                    <span style={styles.beatStatus}>{beat.status}</span>
                    <button
                      style={styles.removeBtn}
                      onClick={() => removeExtractedBeat(i)}
                    >
                      Remove
                    </button>
                  </div>
                  <h5 style={styles.extractedName}>{beat.title}</h5>
                  <p style={styles.extractedDesc}>{beat.description}</p>
                </div>
              ))}
              <div style={styles.extractedActions}>
                <button
                  style={styles.saveBtn}
                  onClick={saveExtractedBeats}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : `Save ${extractedBeats.length} Beats`}
                </button>
                <button
                  style={styles.discardBtn}
                  onClick={() => setExtractedBeats([])}
                >
                  Discard All
                </button>
              </div>
            </div>
          )}

          {beats.length === 0 && extractedBeats.length === 0 ? (
            <p style={styles.empty}>
              No story beats tracked yet.
              {role === 'dm' && ' Use "Extract Story Beats" to analyze your sessions.'}
            </p>
          ) : (
            <div style={styles.beatsList}>
              {beats.map(b => (
                <div key={b.id} style={styles.beatCard}>
                  <div style={styles.beatHeader}>
                    <span style={styles.beatType}>{b.type.replace(/_/g, ' ')}</span>
                    {role === 'dm' ? (
                      <select
                        style={styles.beatStatusSelect}
                        value={b.status}
                        onChange={e => updateBeatStatus(b.id, e.target.value)}
                      >
                        <option value="planted">Planted</option>
                        <option value="active">Active</option>
                        <option value="revealed">Revealed</option>
                        <option value="resolved">Resolved</option>
                        <option value="abandoned">Abandoned</option>
                      </select>
                    ) : (
                      <span style={styles.beatStatus}>{b.status}</span>
                    )}
                  </div>
                  <h4 style={styles.beatTitle}>{b.title}</h4>
                  {b.description && (
                    <p style={styles.beatDesc}>{b.description}</p>
                  )}
                  {b.notes && role === 'dm' && (
                    <p style={styles.beatNotes}>DM Notes: {b.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const styles = {
  container: {
    maxWidth: '720px',
    margin: '0 auto',
    padding: '1rem',
  },
  subTabs: {
    display: 'flex',
    gap: 0,
    borderBottom: '1px solid #e2e8f0',
    marginBottom: '1rem',
  },
  subTab: {
    padding: '0.5rem 1rem',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    fontSize: '0.8rem',
    color: '#64748b',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  subTabActive: {
    padding: '0.5rem 1rem',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid #2563eb',
    fontSize: '0.8rem',
    color: '#2563eb',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  actions: {
    marginBottom: '1rem',
  },
  addBtn: {
    padding: '0.4rem 0.8rem',
    borderRadius: '6px',
    backgroundColor: '#2563eb',
    color: '#fff',
    border: 'none',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '1rem',
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    marginBottom: '1rem',
  },
  input: {
    padding: '0.5rem 0.75rem',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '0.875rem',
    outline: 'none',
    fontFamily: 'inherit',
  },
  textarea: {
    padding: '0.5rem 0.75rem',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '0.875rem',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  row: {
    display: 'flex',
    gap: '0.5rem',
  },
  select: {
    flex: 1,
    padding: '0.5rem',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '0.8rem',
    outline: 'none',
    fontFamily: 'inherit',
  },
  submitBtn: {
    alignSelf: 'flex-start',
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    backgroundColor: '#2563eb',
    color: '#fff',
    border: 'none',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  empty: {
    textAlign: 'center',
    color: '#94a3b8',
    marginTop: '2rem',
    fontSize: '0.875rem',
  },
  timeline: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  eventCard: {
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
  },
  eventHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.25rem',
  },
  importanceDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  eventDate: {
    fontSize: '0.75rem',
    color: '#6d28d9',
    fontWeight: 600,
  },
  eventType: {
    fontSize: '0.7rem',
    color: '#94a3b8',
    textTransform: 'capitalize',
  },
  deleteBtn: {
    marginLeft: 'auto',
    background: 'none',
    border: 'none',
    color: '#dc2626',
    fontSize: '1rem',
    cursor: 'pointer',
    lineHeight: 1,
    padding: '0 0.25rem',
  },
  eventTitle: {
    margin: 0,
    fontSize: '0.9rem',
    color: '#1e293b',
  },
  eventDesc: {
    margin: '0.25rem 0 0 0',
    fontSize: '0.8rem',
    color: '#475569',
    lineHeight: 1.4,
  },
  // Story beats
  extractBtn: {
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    backgroundColor: '#7c3aed',
    color: '#fff',
    border: 'none',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  extractedSection: {
    padding: '1rem',
    backgroundColor: '#f5f3ff',
    border: '1px solid #ddd6fe',
    borderRadius: '8px',
    marginBottom: '1rem',
  },
  extractedTitle: {
    margin: '0 0 0.25rem 0',
    fontSize: '0.9rem',
    color: '#6d28d9',
  },
  extractedHint: {
    margin: '0 0 0.75rem 0',
    fontSize: '0.75rem',
    color: '#8b5cf6',
  },
  extractedCard: {
    padding: '0.6rem 0.75rem',
    backgroundColor: '#fff',
    borderRadius: '6px',
    border: '1px solid #e9e5f5',
    marginBottom: '0.5rem',
  },
  extractedHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.25rem',
  },
  extractedName: {
    margin: 0,
    fontSize: '0.85rem',
    color: '#1e293b',
  },
  extractedDesc: {
    margin: '0.2rem 0 0 0',
    fontSize: '0.8rem',
    color: '#475569',
    lineHeight: 1.4,
  },
  removeBtn: {
    marginLeft: 'auto',
    padding: '0.15rem 0.4rem',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    color: '#dc2626',
    border: '1px solid #fca5a5',
    fontSize: '0.7rem',
    cursor: 'pointer',
  },
  extractedActions: {
    display: 'flex',
    gap: '0.5rem',
    marginTop: '0.5rem',
  },
  saveBtn: {
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    backgroundColor: '#059669',
    color: '#fff',
    border: 'none',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  discardBtn: {
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: '#64748b',
    border: '1px solid #cbd5e1',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  beatsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  beatCard: {
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
  },
  beatHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.25rem',
  },
  beatType: {
    fontSize: '0.7rem',
    fontWeight: 600,
    padding: '0.15rem 0.4rem',
    borderRadius: '4px',
    backgroundColor: '#ede9fe',
    color: '#6d28d9',
    textTransform: 'capitalize',
  },
  beatStatus: {
    fontSize: '0.7rem',
    padding: '0.15rem 0.4rem',
    borderRadius: '4px',
    backgroundColor: '#e2e8f0',
    color: '#475569',
    textTransform: 'capitalize',
  },
  beatStatusSelect: {
    padding: '0.15rem 0.3rem',
    borderRadius: '4px',
    border: '1px solid #cbd5e1',
    fontSize: '0.7rem',
    outline: 'none',
    fontFamily: 'inherit',
  },
  beatTitle: {
    margin: 0,
    fontSize: '0.9rem',
    color: '#1e293b',
  },
  beatDesc: {
    margin: '0.25rem 0 0 0',
    fontSize: '0.8rem',
    color: '#475569',
    lineHeight: 1.4,
  },
  beatNotes: {
    margin: '0.25rem 0 0 0',
    fontSize: '0.75rem',
    color: '#7c3aed',
    fontStyle: 'italic',
  },
}
