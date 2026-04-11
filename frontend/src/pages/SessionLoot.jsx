/**
 * SessionLoot — [DEPRECATED] Moved to SessionDetail
 *
 * This component was originally a standalone wiki page for tracking loot across
 * all sessions. It's now integrated into SessionDetail.jsx where players log loot
 * directly within each session. Kept here for reference/potential future use.
 */

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function SessionLoot({ campaignId, session, role }) {
  const [loot, setLoot] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const [form, setForm] = useState({
    session_id: '',
    name: '',
    quantity: 1,
    category: 'item',
    value_gp: '',
    description: '',
  });
  const [adding, setAdding] = useState(false);

  async function fetchAll() {
    const [lRes, sRes] = await Promise.all([
      supabase
        .from('session_loot')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false }),
      supabase
        .from('sessions')
        .select('id, session_number, title, date')
        .eq('campaign_id', campaignId)
        .order('session_number', { ascending: false }),
    ]);
    if (lRes.data) setLoot(lRes.data);
    if (sRes.data) setSessions(sRes.data);
    setLoading(false);
  }

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  async function addLoot() {
    if (!form.name.trim() || !form.session_id) return;
    setAdding(true);
    const insert = {
      campaign_id: campaignId,
      session_id: form.session_id,
      name: form.name.trim(),
      quantity: parseInt(form.quantity) || 1,
      category: form.category,
      value_gp: form.value_gp ? parseFloat(form.value_gp) : null,
      description: form.description.trim() || null,
      logged_by: session.user.id,
    };
    const { data, error } = await supabase
      .from('session_loot')
      .insert(insert)
      .select()
      .single();
    if (!error && data) {
      setLoot([data, ...loot]);
      setForm({
        ...form,
        name: '',
        quantity: 1,
        value_gp: '',
        description: '',
      });
    }
    setAdding(false);
  }

  async function deleteLoot(id) {
    if (!window.confirm('Remove this loot entry?')) return;
    const { error } = await supabase.from('session_loot').delete().eq('id', id);
    if (!error) setLoot((prev) => prev.filter((l) => l.id !== id));
  }

  // Group loot by session
  const sessionMap = {};
  sessions.forEach((s) => {
    sessionMap[s.id] = s;
  });
  const grouped = {};
  loot.forEach((l) => {
    if (!grouped[l.session_id]) grouped[l.session_id] = [];
    grouped[l.session_id].push(l);
  });

  // Order session IDs by session_number descending
  const orderedSessionIds = sessions
    .map((s) => s.id)
    .filter((id) => grouped[id]);

  // Calculate totals per session
  function sessionTotal(sessionId) {
    const items = grouped[sessionId] || [];
    return items.reduce(
      (sum, l) => sum + (l.value_gp ? l.value_gp * l.quantity : 0),
      0,
    );
  }

  if (loading)
    return (
      <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--ink-light)' }}>
        Loading loot...
      </p>
    );

  return (
    <div style={{ padding: '1rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}
      >
        <h3 style={{ margin: 0, color: 'var(--ink-dark)', fontFamily: 'var(--font-heading)' }}>Session Loot</h3>
        <button style={s.addBtn} onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : '+ Log Loot'}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={s.createForm}>
          <select
            style={s.select}
            value={form.session_id}
            onChange={(e) => setForm({ ...form, session_id: e.target.value })}
          >
            <option value="">Select session *</option>
            {sessions.map((ss) => (
              <option key={ss.id} value={ss.id}>
                Session {ss.session_number}
                {ss.title ? `: ${ss.title}` : ''}
              </option>
            ))}
          </select>
          <input
            style={s.input}
            placeholder="Item name *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              style={{ ...s.input, width: '80px' }}
              placeholder="Qty"
              type="number"
              min="1"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            />
            <select
              style={s.select}
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              <option value="gold">Gold/Currency</option>
              <option value="item">Item</option>
              <option value="gem">Gem</option>
              <option value="art">Art Object</option>
              <option value="magic_item">Magic Item</option>
              <option value="other">Other</option>
            </select>
            <input
              style={{ ...s.input, width: '100px' }}
              placeholder="Value (GP)"
              type="number"
              value={form.value_gp}
              onChange={(e) => setForm({ ...form, value_gp: e.target.value })}
            />
          </div>
          <input
            style={s.input}
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <button style={s.saveBtn} onClick={addLoot} disabled={adding}>
            {adding ? 'Adding...' : 'Log Loot'}
          </button>
        </div>
      )}

      {/* Loot grouped by session */}
      {orderedSessionIds.length === 0 ? (
        <p style={{ color: 'var(--ink-faint)', textAlign: 'center', padding: '2rem' }}>
          No loot logged yet.
        </p>
      ) : (
        orderedSessionIds.map((sessionId) => {
          const sess = sessionMap[sessionId];
          const items = grouped[sessionId];
          const total = sessionTotal(sessionId);
          const isExpanded = selectedSessionId === sessionId;

          return (
            <div key={sessionId} style={{ marginBottom: '0.5rem' }}>
              <div
                style={s.sessionHeader}
                onClick={() =>
                  setSelectedSessionId(isExpanded ? null : sessionId)
                }
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <span style={{ fontSize: '0.7rem', color: 'var(--ink-faint)' }}>
                    {isExpanded ? '\u25BC' : '\u25B6'}
                  </span>
                  <span
                    style={{
                      fontWeight: 600,
                      color: 'var(--ink-dark)',
                      fontSize: '0.85rem',
                    }}
                  >
                    Session {sess.session_number}
                    {sess.title ? `: ${sess.title}` : ''}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--ink-faint)' }}>
                    ({items.length} item{items.length !== 1 ? 's' : ''})
                  </span>
                </div>
                {total > 0 && (
                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--gold)',
                      fontWeight: 600,
                    }}
                  >
                    {total.toLocaleString()} GP
                  </span>
                )}
              </div>

              {isExpanded && (
                <div style={{ padding: '0 0 0 1.25rem' }}>
                  {items.map((item) => (
                    <div key={item.id} style={s.lootItem}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                          }}
                        >
                          <span
                            style={{
                              ...s.catBadge,
                              backgroundColor:
                                catColors[item.category]?.bg || 'var(--sidebar-bg)',
                              color:
                                catColors[item.category]?.text || 'var(--ink-medium)',
                            }}
                          >
                            {item.category.replace('_', ' ')}
                          </span>
                          <span
                            style={{
                              fontWeight: 500,
                              color: 'var(--ink-dark)',
                              fontSize: '0.85rem',
                            }}
                          >
                            {item.quantity > 1 ? `${item.quantity}x ` : ''}
                            {item.name}
                          </span>
                          {item.value_gp && (
                            <span
                              style={{ fontSize: '0.75rem', color: 'var(--gold)' }}
                            >
                              {item.quantity > 1
                                ? `${(item.value_gp * item.quantity).toLocaleString()} GP`
                                : `${item.value_gp.toLocaleString()} GP`}
                            </span>
                          )}
                        </div>
                        {(role === 'dm' ||
                          item.logged_by === session.user.id) && (
                          <button
                            style={s.delSmBtn}
                            onClick={() => deleteLoot(item.id)}
                            title="Remove"
                          >
                            &times;
                          </button>
                        )}
                      </div>
                      {item.description && (
                        <p
                          style={{
                            margin: '0.15rem 0 0 0',
                            fontSize: '0.75rem',
                            color: 'var(--ink-light)',
                          }}
                        >
                          {item.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Grand total */}
      {orderedSessionIds.length > 0 && (
        <div
          style={{
            marginTop: '1rem',
            padding: '0.75rem',
            backgroundColor: 'var(--card-bg)',
            borderRadius: '2px',
            border: '1px solid var(--gold)',
            textAlign: 'right',
          }}
        >
          <span
            style={{ fontSize: '0.85rem', color: 'var(--sepia)', fontWeight: 600 }}
          >
            Total Value:{' '}
            {orderedSessionIds
              .reduce((sum, id) => sum + sessionTotal(id), 0)
              .toLocaleString()}{' '}
            GP
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const catColors = {
  gold: { bg: 'var(--card-bg)', text: 'var(--gold)' },
  item: { bg: 'var(--sidebar-bg)', text: 'var(--ink-medium)' },
  gem: { bg: 'var(--card-bg)', text: 'var(--accent)' },
  art: { bg: 'var(--card-bg)', text: 'var(--sepia)' },
  magic_item: { bg: 'var(--card-bg)', text: 'var(--accent-deep)' },
  other: { bg: 'var(--sidebar-bg)', text: 'var(--ink-light)' },
};

const s = {
  addBtn: {
    padding: '0.35rem 0.75rem',
    borderRadius: '2px',
    backgroundColor: 'var(--accent)',
    color: 'var(--card-bg)',
    border: 'none',
    fontSize: '0.8rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
  },
  createForm: {
    padding: '1rem',
    border: '1px solid var(--border-light)',
    borderRadius: '2px',
    marginBottom: '1rem',
    backgroundColor: 'var(--sidebar-bg)',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  input: {
    padding: '0.5rem',
    border: '1px solid var(--border-medium)',
    borderRadius: '2px',
    fontSize: '0.85rem',
    fontFamily: 'var(--font-body)',
    width: '100%',
    boxSizing: 'border-box',
  },
  select: {
    padding: '0.5rem',
    border: '1px solid var(--border-medium)',
    borderRadius: '2px',
    fontSize: '0.85rem',
    fontFamily: 'var(--font-body)',
    backgroundColor: 'var(--card-bg)',
  },
  saveBtn: {
    padding: '0.4rem 0.8rem',
    borderRadius: '2px',
    backgroundColor: 'var(--accent)',
    color: 'var(--card-bg)',
    border: 'none',
    fontSize: '0.8rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
  },
  sessionHeader: {
    padding: '0.6rem 0.75rem',
    backgroundColor: 'var(--card-bg)',
    border: '1px solid var(--border-light)',
    borderRadius: '2px',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lootItem: { padding: '0.4rem 0.5rem', borderBottom: '1px solid var(--sidebar-bg)' },
  catBadge: {
    fontSize: '0.6rem',
    fontWeight: 600,
    padding: '0.1rem 0.35rem',
    borderRadius: '1px',
    textTransform: 'uppercase',
  },
  delSmBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--ink-faint)',
    cursor: 'pointer',
    fontSize: '1rem',
    padding: '0 0.3rem',
    fontFamily: 'var(--font-body)',
  },
  textarea: {
    padding: '0.5rem',
    border: '1px solid var(--border-medium)',
    borderRadius: '2px',
    fontSize: '0.85rem',
    fontFamily: 'var(--font-body)',
    width: '100%',
    boxSizing: 'border-box',
    resize: 'vertical',
  },
};
