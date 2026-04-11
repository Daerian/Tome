/**
 * Sessions — List and manage campaign game sessions
 *
 * Shows a list of all sessions for a campaign. DM can create new sessions (which
 * auto-generates a prep brief via AI). Clicking a session opens SessionDetail.
 * Displays session number, status, title, and a preview of the summary.
 */

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import SessionDetail from './SessionDetail';

const API_URL = import.meta.env.VITE_API_URL;

export default function Sessions({ campaignId, session, role }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  // New-session form state (DM only)
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [prepNotes, setPrepNotes] = useState('');
  const [creating, setCreating] = useState(false);

  async function fetchSessions() {
    const { data } = await supabase
      .from('sessions')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('session_number', { ascending: false });

    if (data) setSessions(data);
    setLoading(false);
  }

  useEffect(() => {
    fetchSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  async function createSession() {
    if (!newTitle.trim()) return;
    setCreating(true);

    const nextNumber =
      sessions.length > 0
        ? Math.max(...sessions.map((s) => s.session_number)) + 1
        : 1;

    const insertData = {
      campaign_id: campaignId,
      title: newTitle.trim(),
      session_number: nextNumber,
      status: 'planned',
    };
    if (prepNotes.trim()) {
      insertData.dm_notes = prepNotes.trim();
    }

    const { data, error } = await supabase
      .from('sessions')
      .insert(insertData)
      .select()
      .single();

    if (!error && data) {
      setSessions([data, ...sessions]);

      // Fire-and-forget: auto-generate the session prep brief
      fetch(`${API_URL}/api/session-prep`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: data.id,
          campaign_id: campaignId,
          dm_prep_notes: prepNotes.trim() || null,
        }),
      }).catch(() => {});

      setNewTitle('');
      setPrepNotes('');
      setShowCreate(false);

      // Navigate to the new session detail
      setSelectedId(data.id);
    }
    setCreating(false);
  }

  // Drill into a single session — re-fetch list on return
  if (selectedId) {
    return (
      <SessionDetail
        sessionId={selectedId}
        campaignId={campaignId}
        session={session}
        role={role}
        onBack={() => {
          setSelectedId(null);
          fetchSessions();
        }}
      />
    );
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
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Session title..."
            autoFocus
          />
          <textarea
            style={styles.prepNotesInput}
            value={prepNotes}
            onChange={(e) => setPrepNotes(e.target.value)}
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
          {sessions.map((s) => (
            <button
              key={s.id}
              style={styles.sessionCard}
              onClick={() => setSelectedId(s.id)}
            >
              <div style={styles.cardTop}>
                <span style={styles.number}>Session {s.session_number}</span>
                <span
                  style={{
                    ...styles.statusBadge,
                    color: statusColors[s.status] || 'var(--ink-faint)',
                  }}
                >
                  {s.status}
                </span>
              </div>
              <span style={styles.sessionTitle}>{s.title || 'Untitled'}</span>
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
  );
}

const statusColors = {
  planned: 'var(--sepia)',
  in_progress: 'var(--accent)',
  completed: 'var(--success)',
  cancelled: 'var(--ink-faint)',
};

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
    color: 'var(--ink-dark)',
    fontFamily: 'var(--font-heading)',
  },
  button: {
    padding: '0.5rem 1rem',
    borderRadius: '2px',
    backgroundColor: 'var(--accent)',
    color: '#fff',
    border: 'none',
    fontSize: '0.875rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
  },
  createForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    marginBottom: '1rem',
  },
  input: {
    padding: '0.6rem 0.75rem',
    borderRadius: '2px',
    border: '1px solid var(--border-medium)',
    backgroundColor: 'var(--card-bg)',
    fontSize: '0.9rem',
    outline: 'none',
    fontFamily: 'var(--font-body)',
    color: 'var(--ink-medium)',
  },
  prepNotesInput: {
    padding: '0.6rem 0.75rem',
    borderRadius: '2px',
    border: '1px solid var(--border-medium)',
    backgroundColor: 'var(--card-bg)',
    fontSize: '0.85rem',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'var(--font-body)',
    color: 'var(--ink-medium)',
    lineHeight: 1.5,
  },
  muted: {
    color: 'var(--ink-faint)',
    fontSize: '0.9rem',
  },
  empty: {
    textAlign: 'center',
    padding: '3rem 1rem',
    backgroundColor: 'var(--card-bg)',
    borderRadius: '3px',
    border: '1px dashed var(--border-medium)',
  },
  emptyText: {
    margin: '0 0 0.25rem 0',
    color: 'var(--ink-medium)',
    fontStyle: 'italic',
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
    borderBottom: '1px solid var(--border-light)',
    backgroundColor: 'transparent',
    textAlign: 'left',
    cursor: 'pointer',
    width: '100%',
    fontFamily: 'var(--font-body)',
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  number: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--sepia)',
    fontVariant: 'small-caps',
    letterSpacing: '0.02em',
  },
  statusBadge: {
    fontSize: '0.7rem',
    fontWeight: 500,
    fontVariant: 'small-caps',
    fontStyle: 'italic',
  },
  sessionTitle: {
    fontSize: '1rem',
    fontWeight: 500,
    color: 'var(--ink-dark)',
    fontFamily: 'var(--font-body)',
  },
  date: {
    fontSize: '0.8rem',
    color: 'var(--sepia)',
  },
  preview: {
    margin: 0,
    fontSize: '0.85rem',
    color: 'var(--ink-light)',
    lineHeight: 1.4,
  },
};
