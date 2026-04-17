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
import SessionPrep from './SessionPrep';

const API_URL = import.meta.env.VITE_API_URL;

export default function Sessions({ campaignId, session, role }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [prepSessionId, setPrepSessionId] = useState(null); // open Prep Wizard

  const [creating, setCreating] = useState(false);

  // Delete state (DM only)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

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
    if (role !== 'dm' || creating) return;
    setCreating(true);

    const nextNumber =
      sessions.length > 0
        ? Math.max(...sessions.map((s) => s.session_number)) + 1
        : 1;

    const { data, error } = await supabase
      .from('sessions')
      .insert({
        campaign_id: campaignId,
        session_number: nextNumber,
        status: 'planned',
      })
      .select()
      .single();

    if (!error && data) {
      setSessions([data, ...sessions]);
      // Fire-and-forget: auto-generate the session prep brief in the background
      fetch(`${API_URL}/api/session-prep`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: data.id, campaign_id: campaignId }),
      }).catch(() => {});
      setPrepSessionId(data.id);
    }
    setCreating(false);
  }

  async function deleteSession(id) {
    setDeleting(true);
    // Delete orphaned session notes (not a FK, won't cascade)
    await supabase
      .from('notes')
      .delete()
      .eq('related_entity_type', 'session')
      .eq('related_entity_id', id);
    // Delete the session itself (loot + attendees cascade)
    await supabase.from('sessions').delete().eq('id', id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    setConfirmDeleteId(null);
    setDeleting(false);
  }

  // Scriptorium — launched after session creation (DM only)
  if (prepSessionId) {
    return (
      <SessionPrep
        sessionId={prepSessionId}
        campaignId={campaignId}
        session={session}
        role={role}
        onBack={() => {
          setPrepSessionId(null);
          fetchSessions();
        }}
        onViewSession={() => {
          setSelectedId(prepSessionId);
          setPrepSessionId(null);
        }}
      />
    );
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
            onClick={createSession}
            disabled={creating}
          >
            {creating ? 'Creating...' : 'New Session'}
          </button>
        )}
      </div>

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
            <div key={s.id} style={styles.sessionCard}>
              {confirmDeleteId === s.id ? (
                /* Inline delete confirmation */
                <div style={styles.deleteConfirm}>
                  <span style={styles.deleteQuestion}>
                    Delete &ldquo;{s.title || `Session ${s.session_number}`}
                    &rdquo;? This cannot be undone.
                  </span>
                  <div style={styles.deleteActions}>
                    <button
                      style={styles.deleteConfirmBtn}
                      onClick={() => deleteSession(s.id)}
                      disabled={deleting}
                    >
                      {deleting ? 'Deleting...' : 'Delete'}
                    </button>
                    <button
                      style={styles.deleteCancelBtn}
                      onClick={() => setConfirmDeleteId(null)}
                      disabled={deleting}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* Normal card content */
                <>
                  <div
                    style={styles.cardClickArea}
                    onClick={() => setSelectedId(s.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedId(s.id)}
                  >
                    <div style={styles.cardTop}>
                      <span style={styles.number}>
                        Session {s.session_number}
                      </span>
                      <span
                        style={{
                          ...styles.statusBadge,
                          color: statusColors[s.status] || 'var(--ink-faint)',
                        }}
                      >
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
                  </div>
                  {role === 'dm' && (
                    <button
                      style={styles.deleteBtn}
                      onClick={() => setConfirmDeleteId(s.id)}
                      title="Delete session"
                    >
                      ×
                    </button>
                  )}
                </>
              )}
            </div>
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
    position: 'relative',
    borderBottom: '1px solid var(--border-light)',
    display: 'flex',
    alignItems: 'stretch',
  },
  cardClickArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    padding: '1rem',
    backgroundColor: 'transparent',
    textAlign: 'left',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
    border: 'none',
    outline: 'none',
  },
  deleteBtn: {
    flexShrink: 0,
    alignSelf: 'flex-start',
    marginTop: '0.9rem',
    marginRight: '0.75rem',
    background: 'none',
    border: 'none',
    color: 'var(--ink-faint)',
    cursor: 'pointer',
    fontSize: '1.1rem',
    lineHeight: 1,
    padding: '0.1rem 0.25rem',
    borderRadius: '2px',
    fontFamily: 'var(--font-body)',
  },
  deleteConfirm: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '0.9rem 1rem',
  },
  deleteQuestion: {
    fontSize: '0.875rem',
    color: 'var(--ink-medium)',
    fontFamily: 'var(--font-body)',
  },
  deleteActions: {
    display: 'flex',
    gap: '0.5rem',
  },
  deleteConfirmBtn: {
    padding: '0.3rem 0.75rem',
    backgroundColor: '#c0392b',
    color: '#fff',
    border: 'none',
    borderRadius: '2px',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontFamily: 'var(--font-body)',
  },
  deleteCancelBtn: {
    padding: '0.3rem 0.75rem',
    background: 'none',
    border: '1px solid var(--border-medium)',
    color: 'var(--ink-medium)',
    borderRadius: '2px',
    cursor: 'pointer',
    fontSize: '0.8rem',
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
