/**
 * Timeline — Campaign chronology and story beat tracker
 *
 * Displays timeline events and story beats in chronological order.
 * Timeline events: factual events (battles, treaties, births).
 * Story beats: narrative threads (plot hooks, reveals, character arcs) with visibility control.
 * Shows events grouped by date with search/filter. DM can create/edit/delete.
 */

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const API_URL = import.meta.env.VITE_API_URL;

const EVENT_TYPES = [
  'world_history',
  'campaign_event',
  'character_event',
  'political',
  'divine',
  'combat',
  'discovery',
];

const BEAT_TYPES = [
  'plot_hook',
  'reveal',
  'cliffhanger',
  'character_moment',
  'twist',
  'resolution',
  'foreshadowing',
];

export default function Timeline({ campaignId, role }) {
  const [events, setEvents] = useState([]);
  const [beats, setBeats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('events');

  // Add event form (DM only)
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({
    title: '',
    description: '',
    in_world_date: '',
    event_type: 'campaign_event',
    importance: 'major',
  });
  const [addingEvent, setAddingEvent] = useState(false);

  // Extract beats
  const [extracting, setExtracting] = useState(false);
  const [extractedBeats, setExtractedBeats] = useState([]);
  const [saving, setSaving] = useState(false);

  async function fetchData() {
    const [eventsRes, beatsRes] = await Promise.all([
      supabase
        .from('timeline_events')
        .select(
          'id, title, description, event_type, importance, in_world_date, sort_order, location_id',
        )
        .eq('campaign_id', campaignId)
        .order('sort_order', { ascending: true }),
      supabase
        .from('story_beats')
        .select('id, title, description, type, status, notes, sort_order')
        .eq('campaign_id', campaignId)
        .order('sort_order', { ascending: true }),
    ]);
    if (eventsRes.data) setEvents(eventsRes.data);
    if (beatsRes.data) setBeats(beatsRes.data);
    setLoading(false);
  }

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  async function addEvent(e) {
    e.preventDefault();
    if (!newEvent.title.trim()) return;
    setAddingEvent(true);

    const maxOrder =
      events.length > 0
        ? Math.max(...events.map((ev) => ev.sort_order || 0))
        : 0;

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
      .single();

    if (!error && data) {
      setEvents((prev) => [...prev, data]);
      setNewEvent({
        title: '',
        description: '',
        in_world_date: '',
        event_type: 'campaign_event',
        importance: 'major',
      });
      setShowAddEvent(false);
    }
    setAddingEvent(false);
  }

  async function deleteEvent(id) {
    if (!window.confirm('Delete this timeline event?')) return;
    const { error } = await supabase
      .from('timeline_events')
      .delete()
      .eq('id', id);
    if (!error) {
      setEvents((prev) => prev.filter((ev) => ev.id !== id));
    }
  }

  async function extractBeats() {
    setExtracting(true);
    setExtractedBeats([]);
    try {
      const res = await fetch(`${API_URL}/api/extract-beats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaignId }),
      });
      const data = await res.json();
      setExtractedBeats(data.beats || []);
    } catch {
      setExtractedBeats([]);
    } finally {
      setExtracting(false);
    }
  }

  async function saveExtractedBeats() {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/save-beats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: campaignId,
          beats: extractedBeats,
        }),
      });
      const data = await res.json();
      if (data.saved > 0) {
        setExtractedBeats([]);
        fetchData();
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  function removeExtractedBeat(index) {
    setExtractedBeats((prev) => prev.filter((_, i) => i !== index));
  }

  async function updateBeatStatus(id, newStatus) {
    const { error } = await supabase
      .from('story_beats')
      .update({ status: newStatus })
      .eq('id', id);
    if (!error) {
      setBeats((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: newStatus } : b)),
      );
    }
  }

  if (loading) {
    return (
      <p
        style={{
          textAlign: 'center',
          marginTop: '2rem',
          color: 'var(--ink-light)',
        }}
      >
        Loading...
      </p>
    );
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
                onChange={(e) =>
                  setNewEvent((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="Event title"
                required
              />
              <textarea
                style={styles.textarea}
                value={newEvent.description}
                onChange={(e) =>
                  setNewEvent((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="Description (optional)"
                rows={2}
              />
              <input
                style={styles.input}
                value={newEvent.in_world_date}
                onChange={(e) =>
                  setNewEvent((prev) => ({
                    ...prev,
                    in_world_date: e.target.value,
                  }))
                }
                placeholder="In-world date (e.g. 3rd of Mirtul, 1492 DR)"
              />
              <div style={styles.row}>
                <select
                  style={styles.select}
                  value={newEvent.event_type}
                  onChange={(e) =>
                    setNewEvent((prev) => ({
                      ...prev,
                      event_type: e.target.value,
                    }))
                  }
                >
                  {EVENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
                <select
                  style={styles.select}
                  value={newEvent.importance}
                  onChange={(e) =>
                    setNewEvent((prev) => ({
                      ...prev,
                      importance: e.target.value,
                    }))
                  }
                >
                  <option value="major">Major</option>
                  <option value="minor">Minor</option>
                  <option value="background">Background</option>
                </select>
              </div>
              <button
                style={styles.submitBtn}
                type="submit"
                disabled={addingEvent}
              >
                {addingEvent ? 'Adding...' : 'Add Event'}
              </button>
            </form>
          )}

          {events.length === 0 ? (
            <p style={styles.empty}>No timeline events yet.</p>
          ) : (
            <div style={styles.timeline}>
              {events.map((ev) => (
                <div key={ev.id} style={styles.eventCard}>
                  <div style={styles.eventHeader}>
                    <span
                      style={{
                        ...styles.importanceMark,
                        color:
                          ev.importance === 'major'
                            ? 'var(--accent-deep)'
                            : ev.importance === 'minor'
                              ? 'var(--ink-medium)'
                              : 'var(--ink-faint)',
                      }}
                    >
                      {ev.importance === 'major'
                        ? '◆'
                        : ev.importance === 'minor'
                          ? '◇'
                          : '·'}
                    </span>
                    <span style={styles.eventDate}>{ev.in_world_date}</span>
                    <span style={styles.eventType}>
                      {ev.event_type.replace(/_/g, ' ')}
                    </span>
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
                    <span style={styles.beatType}>
                      {beat.type?.replace(/_/g, ' ')}
                    </span>
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
              {role === 'dm' &&
                ' Use "Extract Story Beats" to analyze your sessions.'}
            </p>
          ) : (
            <div style={styles.beatsList}>
              {beats.map((b) => (
                <div key={b.id} style={styles.beatCard}>
                  <div style={styles.beatHeader}>
                    <span style={styles.beatType}>
                      {b.type.replace(/_/g, ' ')}
                    </span>
                    {role === 'dm' ? (
                      <select
                        style={styles.beatStatusSelect}
                        value={b.status}
                        onChange={(e) => updateBeatStatus(b.id, e.target.value)}
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
  );
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
    borderBottom: '1px solid var(--border-light)',
    marginBottom: '1rem',
  },
  subTab: {
    padding: '0.5rem 1rem',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    fontSize: '0.8rem',
    color: 'var(--ink-light)',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
    fontVariant: 'small-caps',
    letterSpacing: '0.08em',
  },
  subTabActive: {
    padding: '0.5rem 1rem',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid var(--accent)',
    fontSize: '0.8rem',
    color: 'var(--accent)',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
    fontVariant: 'small-caps',
    letterSpacing: '0.08em',
  },
  actions: {
    marginBottom: '1rem',
  },
  addBtn: {
    padding: '0.4rem 0.8rem',
    borderRadius: '2px',
    backgroundColor: 'var(--accent)',
    color: 'var(--card-bg)',
    border: 'none',
    fontSize: '0.8rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '1rem',
    backgroundColor: 'var(--sidebar-bg)',
    borderRadius: '2px',
    border: '1px solid var(--border-light)',
    marginBottom: '1rem',
  },
  input: {
    padding: '0.5rem 0.75rem',
    borderRadius: '2px',
    border: '1px solid var(--border-medium)',
    fontSize: '0.875rem',
    outline: 'none',
    fontFamily: 'var(--font-body)',
  },
  textarea: {
    padding: '0.5rem 0.75rem',
    borderRadius: '2px',
    border: '1px solid var(--border-medium)',
    fontSize: '0.875rem',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'var(--font-body)',
  },
  row: {
    display: 'flex',
    gap: '0.5rem',
  },
  select: {
    flex: 1,
    padding: '0.5rem',
    borderRadius: '2px',
    border: '1px solid var(--border-medium)',
    fontSize: '0.8rem',
    outline: 'none',
    fontFamily: 'var(--font-body)',
  },
  submitBtn: {
    alignSelf: 'flex-start',
    padding: '0.5rem 1rem',
    borderRadius: '2px',
    backgroundColor: 'var(--accent)',
    color: 'var(--card-bg)',
    border: 'none',
    fontSize: '0.8rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
  },
  empty: {
    textAlign: 'center',
    color: 'var(--ink-faint)',
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
    borderRadius: '2px',
    backgroundColor: 'var(--sidebar-bg)',
    border: '1px solid var(--border-light)',
  },
  eventHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.25rem',
  },
  importanceMark: {
    fontSize: '0.85rem',
    flexShrink: 0,
    lineHeight: 1,
  },
  eventDate: {
    fontSize: '0.75rem',
    color: 'var(--accent)',
    fontWeight: 600,
    fontFamily: 'var(--font-body)',
  },
  eventType: {
    fontSize: '0.7rem',
    color: 'var(--ink-faint)',
    textTransform: 'capitalize',
    fontVariant: 'small-caps',
    letterSpacing: '0.08em',
  },
  deleteBtn: {
    marginLeft: 'auto',
    background: 'none',
    border: 'none',
    color: 'var(--danger)',
    fontSize: '1rem',
    cursor: 'pointer',
    lineHeight: 1,
    padding: '0 0.25rem',
  },
  eventTitle: {
    margin: 0,
    fontSize: '0.9rem',
    color: 'var(--ink-dark)',
    fontFamily: 'var(--font-heading)',
  },
  eventDesc: {
    margin: '0.25rem 0 0 0',
    fontSize: '0.8rem',
    color: 'var(--ink-medium)',
    lineHeight: 1.4,
  },
  // Story beats
  extractBtn: {
    padding: '0.5rem 1rem',
    borderRadius: '2px',
    backgroundColor: 'var(--accent)',
    color: 'var(--card-bg)',
    border: 'none',
    fontSize: '0.8rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
  },
  extractedSection: {
    padding: '1rem',
    backgroundColor: 'var(--sidebar-bg)',
    border: '1px solid var(--border-light)',
    borderRadius: '2px',
    marginBottom: '1rem',
  },
  extractedTitle: {
    margin: '0 0 0.25rem 0',
    fontSize: '0.9rem',
    color: 'var(--accent)',
    fontFamily: 'var(--font-heading)',
    fontVariant: 'small-caps',
    letterSpacing: '0.08em',
  },
  extractedHint: {
    margin: '0 0 0.75rem 0',
    fontSize: '0.75rem',
    color: 'var(--ink-medium)',
    fontStyle: 'italic',
  },
  extractedCard: {
    padding: '0.6rem 0.75rem',
    backgroundColor: 'var(--card-bg)',
    borderRadius: '2px',
    border: '1px solid var(--border-light)',
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
    color: 'var(--ink-dark)',
    fontFamily: 'var(--font-heading)',
  },
  extractedDesc: {
    margin: '0.2rem 0 0 0',
    fontSize: '0.8rem',
    color: 'var(--ink-medium)',
    lineHeight: 1.4,
  },
  removeBtn: {
    marginLeft: 'auto',
    padding: '0.15rem 0.4rem',
    borderRadius: '1px',
    backgroundColor: 'transparent',
    color: 'var(--danger)',
    border: '1px solid var(--danger)',
    fontSize: '0.7rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
  },
  extractedActions: {
    display: 'flex',
    gap: '0.5rem',
    marginTop: '0.5rem',
  },
  saveBtn: {
    padding: '0.5rem 1rem',
    borderRadius: '2px',
    backgroundColor: 'var(--success)',
    color: 'var(--card-bg)',
    border: 'none',
    fontSize: '0.8rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
  },
  discardBtn: {
    padding: '0.5rem 1rem',
    borderRadius: '2px',
    backgroundColor: 'transparent',
    color: 'var(--ink-light)',
    border: '1px solid var(--border-medium)',
    fontSize: '0.8rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
  },
  beatsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  beatCard: {
    padding: '0.75rem 1rem',
    borderRadius: '2px',
    backgroundColor: 'var(--sidebar-bg)',
    border: '1px solid var(--border-light)',
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
    color: 'var(--accent)',
    textTransform: 'capitalize',
    fontVariant: 'small-caps',
    letterSpacing: '0.06em',
  },
  beatStatus: {
    fontSize: '0.7rem',
    color: 'var(--ink-medium)',
    textTransform: 'capitalize',
    fontVariant: 'small-caps',
  },
  beatStatusSelect: {
    padding: '0.15rem 0.3rem',
    borderRadius: '1px',
    border: '1px solid var(--border-medium)',
    fontSize: '0.7rem',
    outline: 'none',
    fontFamily: 'var(--font-body)',
  },
  beatTitle: {
    margin: 0,
    fontSize: '0.9rem',
    color: 'var(--ink-dark)',
    fontFamily: 'var(--font-heading)',
  },
  beatDesc: {
    margin: '0.25rem 0 0 0',
    fontSize: '0.8rem',
    color: 'var(--ink-medium)',
    lineHeight: 1.4,
  },
  beatNotes: {
    margin: '0.25rem 0 0 0',
    fontSize: '0.75rem',
    color: 'var(--sepia)',
    fontStyle: 'italic',
  },
};
