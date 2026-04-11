/**
 * SessionDetail — Full session view with prep, summary, loot, and notes
 *
 * Shows all aspects of a single session:
 * - Session Prep Brief: AI-generated brief to prepare for the session (DM only)
 * - Prep Items: Monsters, NPCs, encounters to bring to the table (DM only)
 * - Summary: Session recap (auto-generate with AI or manually write)
 * - Loot: Items/treasure looted during the session (all members can log)
 * - Notes: Shared session notes (all members can add)
 */

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const API_URL = import.meta.env.VITE_API_URL;

export default function SessionDetail({
  sessionId,
  campaignId,
  session,
  role,
  onBack,
}) {
  const [sessionData, setSessionData] = useState(null);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Collapsible sections state
  const [expandedSections, setExpandedSections] = useState({
    prep: true,
    items: true,
    summary: true,
    loot: true,
    notes: true,
  });

  // Summary editing (DM only)
  const [editingSummary, setEditingSummary] = useState(false);
  const [summary, setSummary] = useState('');

  // Auto-recap (DM only)
  const [recapPreview, setRecapPreview] = useState('');
  const [generating, setGenerating] = useState(false);

  // Session prep brief (DM only)
  const [prepBrief, setPrepBrief] = useState('');
  const [generatingPrep, setGeneratingPrep] = useState(false);

  // Prep items (DM only)
  const [prepItems, setPrepItems] = useState([]);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({
    type: 'monster',
    name: '',
    description: '',
    stats: '',
  });
  const [addingItem, setAddingItem] = useState(false);

  // Loot tracking (all members)
  const [loot, setLoot] = useState([]);
  const [showAddLoot, setShowAddLoot] = useState(false);
  const [lootForm, setLootForm] = useState({
    name: '',
    quantity: 1,
    category: 'item',
    value_gp: '',
    description: '',
  });
  const [addingLoot, setAddingLoot] = useState(false);

  // Add note form (all members)
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  function toggleSection(key) {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function fetchData() {
    const [sessionRes, notesRes, lootRes] = await Promise.all([
      supabase.from('sessions').select('*').eq('id', sessionId).single(),
      supabase
        .from('notes')
        .select(
          'id, title, content, created_at, author_id, profiles(display_name)',
        )
        .eq('campaign_id', campaignId)
        .eq('related_entity_type', 'session')
        .eq('related_entity_id', sessionId)
        .order('created_at', { ascending: true }),
      supabase
        .from('session_loot')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true }),
    ]);

    if (sessionRes.data) {
      setSessionData(sessionRes.data);
      setSummary(sessionRes.data.summary || '');
      setPrepBrief(sessionRes.data.prep_brief || '');
      setPrepItems(sessionRes.data.prep_items || []);
    }
    if (notesRes.data) setNotes(notesRes.data);
    if (lootRes.data) setLoot(lootRes.data);
    setLoading(false);
  }

  async function saveSummary() {
    const { error } = await supabase
      .from('sessions')
      .update({ summary: summary.trim() || null })
      .eq('id', sessionId);

    if (!error) {
      setSessionData((prev) => ({ ...prev, summary: summary.trim() || null }));
      setEditingSummary(false);
    }
  }

  async function updateStatus(newStatus) {
    const updates = { status: newStatus };
    // Auto-fill played_date when marking completed
    if (newStatus === 'completed' && !sessionData.played_date) {
      updates.played_date = new Date().toISOString().slice(0, 10);
    }

    const { error } = await supabase
      .from('sessions')
      .update(updates)
      .eq('id', sessionId);

    if (!error) {
      setSessionData((prev) => ({ ...prev, ...updates }));
    }
  }

  async function generateRecap() {
    setGenerating(true);
    setRecapPreview('');
    try {
      const res = await fetch(`${API_URL}/api/recap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          campaign_id: campaignId,
        }),
      });
      const data = await res.json();
      setRecapPreview(data.recap);
    } catch {
      setRecapPreview('Error: could not generate recap.');
    } finally {
      setGenerating(false);
    }
  }

  async function useRecap() {
    const { error } = await supabase
      .from('sessions')
      .update({ summary: recapPreview })
      .eq('id', sessionId);

    if (!error) {
      setSessionData((prev) => ({ ...prev, summary: recapPreview }));
      setSummary(recapPreview);
      setRecapPreview('');
    }
  }

  async function generatePrep() {
    setGeneratingPrep(true);
    setPrepBrief('');
    try {
      const res = await fetch(`${API_URL}/api/session-prep`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          campaign_id: campaignId,
        }),
      });
      const data = await res.json();
      setPrepBrief(data.prep);
      setSessionData((prev) => ({ ...prev, prep_brief: data.prep }));
    } catch {
      setPrepBrief('Error: could not generate session prep.');
    } finally {
      setGeneratingPrep(false);
    }
  }

  async function addPrepItem(e) {
    e.preventDefault();
    if (!newItem.name.trim()) return;
    setAddingItem(true);

    const item = {
      type: newItem.type,
      name: newItem.name.trim(),
      description: newItem.description.trim() || null,
      stats: newItem.stats.trim() || null,
    };
    const updated = [...prepItems, item];

    const { error } = await supabase
      .from('sessions')
      .update({ prep_items: updated })
      .eq('id', sessionId);

    if (!error) {
      setPrepItems(updated);
      setSessionData((prev) => ({ ...prev, prep_items: updated }));
      setNewItem({ type: 'monster', name: '', description: '', stats: '' });
      setShowAddItem(false);
    }
    setAddingItem(false);
  }

  async function removePrepItem(index) {
    const updated = prepItems.filter((_, i) => i !== index);
    const { error } = await supabase
      .from('sessions')
      .update({ prep_items: updated })
      .eq('id', sessionId);

    if (!error) {
      setPrepItems(updated);
      setSessionData((prev) => ({ ...prev, prep_items: updated }));
    }
  }

  async function addLootItem() {
    if (!lootForm.name.trim()) return;
    setAddingLoot(true);
    const insert = {
      campaign_id: campaignId,
      session_id: sessionId,
      name: lootForm.name.trim(),
      quantity: parseInt(lootForm.quantity) || 1,
      category: lootForm.category,
      value_gp: lootForm.value_gp ? parseFloat(lootForm.value_gp) : null,
      description: lootForm.description.trim() || null,
      logged_by: session.user.id,
    };
    const { data, error } = await supabase
      .from('session_loot')
      .insert(insert)
      .select()
      .single();
    if (!error && data) {
      setLoot((prev) => [...prev, data]);
      setLootForm({
        name: '',
        quantity: 1,
        category: 'item',
        value_gp: '',
        description: '',
      });

      // Sync to treasury
      const categoryToItemType = {
        magic_item: 'wondrous',
        gold: 'other',
        gem: 'other',
        art: 'other',
        item: 'other',
        other: 'other',
      };
      const treasuryInsert = {
        campaign_id: campaignId,
        name: data.name,
        description: data.description || null,
        rarity: data.category === 'magic_item' ? 'uncommon' : 'common',
        item_type: categoryToItemType[data.category] || 'other',
        requires_attunement: false,
        is_cursed: false,
        added_by: session.user.id,
        source_session_id: sessionId,
        notes: data.value_gp != null
          ? `Value: ${(data.value_gp * data.quantity).toLocaleString()} GP${data.quantity > 1 ? ` (${data.quantity}x ${data.value_gp} GP each)` : ''}`
          : null,
      };
      await supabase.from('treasury_items').insert(treasuryInsert);
    }
    setAddingLoot(false);
  }

  async function deleteLootItem(id) {
    if (!window.confirm('Remove this loot entry?')) return;
    const lootItem = loot.find((l) => l.id === id);
    const { error } = await supabase.from('session_loot').delete().eq('id', id);
    if (!error) {
      setLoot((prev) => prev.filter((l) => l.id !== id));
      // Remove the corresponding treasury entry
      if (lootItem) {
        await supabase
          .from('treasury_items')
          .delete()
          .eq('campaign_id', campaignId)
          .eq('source_session_id', sessionId)
          .eq('name', lootItem.name);
      }
    }
  }

  async function addNote() {
    if (!newNote.trim()) return;
    setAddingNote(true);

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
      .select(
        'id, title, content, created_at, author_id, profiles(display_name)',
      )
      .single();

    if (!error && data) {
      setNotes((prev) => [...prev, data]);
      setNewNote('');
    }
    setAddingNote(false);
  }

  if (loading) {
    return (
      <p style={{ textAlign: 'center', marginTop: '2rem', color: 'var(--ink-light)' }}>
        Loading session...
      </p>
    );
  }

  if (!sessionData) {
    return (
      <div style={{ textAlign: 'center', marginTop: '2rem' }}>
        <p>Session not found.</p>
        <button style={styles.backBtn} onClick={onBack}>
          Back to Sessions
        </button>
      </div>
    );
  }

  const s = sessionData;

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
          {s.played_date && <p style={styles.date}>Played: {s.played_date}</p>}
        </div>
        <div style={styles.statusArea}>
          {role === 'dm' ? (
            <select
              style={styles.statusSelect}
              value={s.status}
              onChange={(e) => updateStatus(e.target.value)}
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
          <button
            style={styles.sectionHeaderBtn}
            onClick={() => toggleSection('prep')}
          >
            <span style={styles.chevron}>
              {expandedSections.prep ? '▼' : '▶'}
            </span>
            Session Prep Brief
          </button>
          {expandedSections.prep && (
            <>
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
            </>
          )}
        </section>
      )}

      {/* Prep Items — DM only */}
      {role === 'dm' && (
        <section style={styles.section}>
          <button
            style={styles.sectionHeaderBtn}
            onClick={() => toggleSection('items')}
          >
            <span style={styles.chevron}>
              {expandedSections.items ? '▼' : '▶'}
            </span>
            Prep Items ({prepItems.length})
          </button>

          {expandedSections.items && (
            <>
              {prepItems.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.4rem',
                    marginBottom: '0.75rem',
                  }}
                >
                  {prepItems.map((item, i) => (
                    <div key={i} style={styles.prepItemCard}>
                      <div style={styles.prepItemHeader}>
                        <span style={styles.prepItemType}>{item.type}</span>
                        <span style={styles.prepItemName}>{item.name}</span>
                        <button
                          style={styles.prepItemRemove}
                          onClick={() => removePrepItem(i)}
                          title="Remove"
                        >
                          &times;
                        </button>
                      </div>
                      {item.description && (
                        <p style={styles.prepItemDesc}>{item.description}</p>
                      )}
                      {item.stats && (
                        <p style={styles.prepItemStats}>{item.stats}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {showAddItem ? (
                <form onSubmit={addPrepItem} style={styles.prepItemForm}>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <select
                      style={styles.prepItemSelect}
                      value={newItem.type}
                      onChange={(e) =>
                        setNewItem((prev) => ({
                          ...prev,
                          type: e.target.value,
                        }))
                      }
                    >
                      <option value="monster">Monster</option>
                      <option value="character">Character / NPC</option>
                    </select>
                    <input
                      style={{ ...styles.noteInput, flex: 1 }}
                      value={newItem.name}
                      onChange={(e) =>
                        setNewItem((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                      placeholder="Name"
                      required
                    />
                  </div>
                  <textarea
                    style={styles.noteInput}
                    value={newItem.description}
                    onChange={(e) =>
                      setNewItem((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    placeholder="Description / role in session (optional)"
                    rows={2}
                  />
                  <textarea
                    style={styles.noteInput}
                    value={newItem.stats}
                    onChange={(e) =>
                      setNewItem((prev) => ({ ...prev, stats: e.target.value }))
                    }
                    placeholder="Key stats or notes (e.g. CR 5, AC 15, HP 60) (optional)"
                    rows={2}
                  />
                  <div style={styles.editActions}>
                    <button
                      style={styles.button}
                      type="submit"
                      disabled={addingItem}
                    >
                      {addingItem ? 'Adding...' : 'Add Item'}
                    </button>
                    <button
                      style={styles.buttonOutline}
                      type="button"
                      onClick={() => setShowAddItem(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  style={styles.buttonSmall}
                  onClick={() => setShowAddItem(true)}
                >
                  + Add Prep Item
                </button>
              )}
            </>
          )}
        </section>
      )}

      {/* Summary section */}
      <section style={styles.section}>
        <button
          style={styles.sectionHeaderBtn}
          onClick={() => toggleSection('summary')}
        >
          <span style={styles.chevron}>
            {expandedSections.summary ? '▼' : '▶'}
          </span>
          Summary
        </button>
        {expandedSections.summary && (
          <>
            {editingSummary ? (
              <div style={styles.editArea}>
                <textarea
                  style={styles.textarea}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
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
                      setEditingSummary(false);
                      setSummary(s.summary || '');
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
          </>
        )}
      </section>

      {/* Loot section */}
      <section style={styles.section}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.75rem',
          }}
        >
          <button
            style={styles.sectionHeaderBtn}
            onClick={() => toggleSection('loot')}
          >
            <span style={styles.chevron}>
              {expandedSections.loot ? '▼' : '▶'}
            </span>
            Loot ({loot.length})
            {loot.length > 0 && (
              <span
                style={{
                  fontWeight: 400,
                  fontSize: '0.8rem',
                  color: 'var(--sepia)',
                  marginLeft: '0.5rem',
                }}
              >
                {loot
                  .reduce(
                    (sum, l) =>
                      sum + (l.value_gp ? l.value_gp * l.quantity : 0),
                    0,
                  )
                  .toLocaleString()}{' '}
                GP
              </span>
            )}
          </button>
          <button
            style={styles.buttonSmall}
            onClick={() => setShowAddLoot(!showAddLoot)}
          >
            {showAddLoot ? 'Cancel' : '+ Log Loot'}
          </button>
        </div>

        {expandedSections.loot && (
          <>
            {showAddLoot && (
              <div style={styles.lootForm}>
                <input
                  style={styles.noteInput}
                  value={lootForm.name}
                  onChange={(e) =>
                    setLootForm({ ...lootForm, name: e.target.value })
                  }
                  placeholder="Item name *"
                />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    style={{ ...styles.noteInput, width: '70px' }}
                    type="number"
                    min="1"
                    value={lootForm.quantity}
                    onChange={(e) =>
                      setLootForm({ ...lootForm, quantity: e.target.value })
                    }
                    placeholder="Qty"
                  />
                  <select
                    style={styles.lootSelect}
                    value={lootForm.category}
                    onChange={(e) =>
                      setLootForm({ ...lootForm, category: e.target.value })
                    }
                  >
                    <option value="gold">Gold/Currency</option>
                    <option value="item">Item</option>
                    <option value="gem">Gem</option>
                    <option value="art">Art Object</option>
                    <option value="magic_item">Magic Item</option>
                    <option value="other">Other</option>
                  </select>
                  <input
                    style={{ ...styles.noteInput, width: '100px' }}
                    type="number"
                    value={lootForm.value_gp}
                    onChange={(e) =>
                      setLootForm({ ...lootForm, value_gp: e.target.value })
                    }
                    placeholder="Value (GP)"
                  />
                </div>
                <input
                  style={styles.noteInput}
                  value={lootForm.description}
                  onChange={(e) =>
                    setLootForm({ ...lootForm, description: e.target.value })
                  }
                  placeholder="Description (optional)"
                />
                <button
                  style={styles.button}
                  onClick={addLootItem}
                  disabled={addingLoot || !lootForm.name.trim()}
                >
                  {addingLoot ? 'Adding...' : 'Log Loot'}
                </button>
              </div>
            )}

            {loot.length === 0 && !showAddLoot && (
              <p style={styles.muted}>No loot logged for this session.</p>
            )}

            {loot.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.3rem',
                }}
              >
                {loot.map((l) => (
                  <div key={l.id} style={styles.lootCard}>
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
                            ...styles.lootCatBadge,
                            backgroundColor:
                              lootCatColors[l.category]?.bg || 'var(--sidebar-bg)',
                            color: lootCatColors[l.category]?.text || 'var(--ink-medium)',
                          }}
                        >
                          {l.category.replace('_', ' ')}
                        </span>
                        <span
                          style={{
                            fontWeight: 500,
                            color: 'var(--ink-dark)',
                            fontSize: '0.875rem',
                          }}
                        >
                          {l.quantity > 1 ? `${l.quantity}x ` : ''}
                          {l.name}
                        </span>
                        {l.value_gp != null && (
                          <span
                            style={{ fontSize: '0.75rem', color: 'var(--sepia)' }}
                          >
                            {(l.value_gp * l.quantity).toLocaleString()} GP
                          </span>
                        )}
                      </div>
                      {(role === 'dm' || l.logged_by === session.user.id) && (
                        <button
                          style={styles.lootRemoveBtn}
                          onClick={() => deleteLootItem(l.id)}
                          title="Remove"
                        >
                          &times;
                        </button>
                      )}
                    </div>
                    {l.description && (
                      <p
                        style={{
                          margin: '0.15rem 0 0 0',
                          fontSize: '0.75rem',
                          color: 'var(--ink-light)',
                        }}
                      >
                        {l.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* Notes section */}
      <section style={styles.section}>
        <button
          style={styles.sectionHeaderBtn}
          onClick={() => toggleSection('notes')}
        >
          <span style={styles.chevron}>
            {expandedSections.notes ? '▼' : '▶'}
          </span>
          Notes ({notes.length})
        </button>

        {expandedSections.notes && (
          <>
            {notes.length === 0 && (
              <p style={styles.muted}>No notes yet. Be the first to add one!</p>
            )}

            {notes.map((n) => (
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
                onChange={(e) => setNewNote(e.target.value)}
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
          </>
        )}
      </section>
    </div>
  );
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
    color: 'var(--accent)',
    fontSize: '0.875rem',
    cursor: 'pointer',
    padding: 0,
    marginBottom: '1rem',
    fontFamily: 'var(--font-body)',
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
    color: 'var(--ink-dark)',
    fontFamily: 'var(--font-heading)',
  },
  date: {
    margin: '0.25rem 0 0 0',
    fontSize: '0.85rem',
    color: 'var(--ink-light)',
  },
  statusArea: {
    display: 'flex',
    alignItems: 'center',
  },
  statusSelect: {
    padding: '0.35rem 0.5rem',
    borderRadius: '2px',
    border: '1px solid var(--border-medium)',
    fontSize: '0.8rem',
    outline: 'none',
    fontFamily: 'var(--font-body)',
  },
  badge: {
    fontSize: '0.75rem',
    fontWeight: 500,
    padding: '0.2rem 0.5rem',
    borderRadius: '1px',
    backgroundColor: 'var(--border-light)',
    color: 'var(--ink-dark)',
  },
  section: {
    marginBottom: '1.5rem',
  },
  sectionTitle: {
    fontSize: '1rem',
    color: 'var(--ink-dark)',
    margin: '0 0 0.75rem 0',
    paddingBottom: '0.4rem',
    borderBottom: '1px solid var(--border-light)',
    fontVariant: 'small-caps',
    letterSpacing: '0.08em',
  },
  sectionHeaderBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '1rem',
    color: 'var(--ink-dark)',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '0 0 0.4rem 0',
    marginBottom: '0.75rem',
    paddingBottom: '0.4rem',
    borderBottom: '1px solid var(--border-light)',
    fontWeight: 500,
    width: '100%',
    textAlign: 'left',
    fontVariant: 'small-caps',
    letterSpacing: '0.08em',
    fontFamily: 'var(--font-body)',
  },
  chevron: {
    display: 'inline-block',
    fontSize: '0.75rem',
    minWidth: '1rem',
    color: 'var(--ink-light)',
  },
  summaryText: {
    margin: 0,
    fontSize: '0.95rem',
    color: 'var(--ink-dark)',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
  },
  muted: {
    color: 'var(--ink-faint)',
    fontSize: '0.875rem',
  },
  editArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  textarea: {
    padding: '0.75rem',
    borderRadius: '2px',
    border: '1px solid var(--border-medium)',
    fontSize: '0.9rem',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'var(--font-body)',
    lineHeight: 1.5,
  },
  editActions: {
    display: 'flex',
    gap: '0.5rem',
  },
  button: {
    padding: '0.5rem 1rem',
    borderRadius: '2px',
    backgroundColor: 'var(--accent)',
    color: 'var(--card-bg)',
    border: 'none',
    fontSize: '0.875rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
  },
  buttonOutline: {
    padding: '0.5rem 1rem',
    borderRadius: '2px',
    backgroundColor: 'transparent',
    color: 'var(--ink-light)',
    border: '1px solid var(--border-medium)',
    fontSize: '0.875rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
  },
  summaryActions: {
    display: 'flex',
    gap: '0.5rem',
    marginTop: '0.5rem',
  },
  buttonSmall: {
    padding: '0.35rem 0.75rem',
    borderRadius: '2px',
    backgroundColor: 'transparent',
    color: 'var(--accent)',
    border: '1px solid var(--accent)',
    fontSize: '0.8rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
  },
  recapBtn: {
    padding: '0.35rem 0.75rem',
    borderRadius: '2px',
    backgroundColor: 'var(--accent)',
    color: 'var(--card-bg)',
    border: 'none',
    fontSize: '0.8rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
  },
  prepBtn: {
    padding: '0.5rem 1rem',
    borderRadius: '2px',
    backgroundColor: 'var(--success)',
    color: 'var(--card-bg)',
    border: 'none',
    fontSize: '0.875rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
  },
  prepPreview: {
    padding: '1rem',
    borderRadius: '3px',
    backgroundColor: 'var(--success-bg)',
    border: '1px solid var(--border-light)',
  },
  prepContent: {
    fontSize: '0.9rem',
    color: 'var(--ink-dark)',
    lineHeight: 1.7,
    whiteSpace: 'pre-wrap',
  },
  recapPreview: {
    marginTop: '1rem',
    padding: '1rem',
    borderRadius: '3px',
    backgroundColor: 'var(--card-bg)',
    border: '1px solid var(--border-light)',
  },
  recapLabel: {
    margin: '0 0 0.5rem 0',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: 'var(--accent)',
    fontFamily: 'var(--font-heading)',
  },
  noteCard: {
    padding: '0.75rem 1rem',
    borderRadius: '3px',
    backgroundColor: 'var(--sidebar-bg)',
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
    color: 'var(--ink-medium)',
  },
  noteDate: {
    fontSize: '0.75rem',
    color: 'var(--ink-faint)',
  },
  noteContent: {
    margin: 0,
    fontSize: '0.9rem',
    color: 'var(--ink-dark)',
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
    borderRadius: '2px',
    border: '1px solid var(--border-medium)',
    fontSize: '0.9rem',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'var(--font-body)',
    lineHeight: 1.5,
  },
  prepItemCard: {
    padding: '0.6rem 0.75rem',
    borderRadius: '2px',
    backgroundColor: 'var(--success-bg)',
    border: '1px solid var(--border-light)',
  },
  prepItemHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  prepItemType: {
    fontSize: '0.65rem',
    fontWeight: 600,
    padding: '0.1rem 0.35rem',
    borderRadius: '1px',
    backgroundColor: 'var(--success-bg)',
    color: 'var(--success)',
    fontVariant: 'small-caps',
    letterSpacing: '0.05em',
  },
  prepItemName: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--ink-dark)',
  },
  prepItemRemove: {
    marginLeft: 'auto',
    background: 'none',
    border: 'none',
    color: 'var(--danger)',
    fontSize: '1rem',
    cursor: 'pointer',
    lineHeight: 1,
    padding: '0 0.25rem',
  },
  prepItemDesc: {
    margin: '0.2rem 0 0 0',
    fontSize: '0.8rem',
    color: 'var(--ink-medium)',
    lineHeight: 1.4,
  },
  prepItemStats: {
    margin: '0.15rem 0 0 0',
    fontSize: '0.75rem',
    color: 'var(--success)',
    fontFamily: 'monospace',
  },
  prepItemForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '0.75rem',
    backgroundColor: 'var(--sidebar-bg)',
    borderRadius: '2px',
    border: '1px solid var(--border-light)',
  },
  prepItemSelect: {
    padding: '0.5rem',
    borderRadius: '2px',
    border: '1px solid var(--border-medium)',
    fontSize: '0.8rem',
    outline: 'none',
    fontFamily: 'var(--font-body)',
  },
  lootForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '0.75rem',
    backgroundColor: 'var(--sidebar-bg)',
    borderRadius: '2px',
    border: '1px solid var(--border-light)',
    marginBottom: '0.75rem',
  },
  lootSelect: {
    padding: '0.5rem',
    borderRadius: '2px',
    border: '1px solid var(--border-medium)',
    fontSize: '0.8rem',
    outline: 'none',
    fontFamily: 'var(--font-body)',
    backgroundColor: 'var(--card-bg)',
    flex: 1,
  },
  lootCard: {
    padding: '0.5rem 0.75rem',
    borderRadius: '2px',
    backgroundColor: 'var(--sidebar-bg)',
    border: '1px solid var(--border-light)',
  },
  lootCatBadge: {
    fontSize: '0.6rem',
    fontWeight: 600,
    padding: '0.1rem 0.35rem',
    borderRadius: '1px',
    fontVariant: 'small-caps',
    letterSpacing: '0.05em',
  },
  lootRemoveBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--ink-faint)',
    cursor: 'pointer',
    fontSize: '1rem',
    padding: '0 0.3rem',
    fontFamily: 'inherit',
    lineHeight: 1,
  },
};

const lootCatColors = {
  gold: { bg: 'var(--card-bg)', text: 'var(--sepia)' },
  item: { bg: 'var(--sidebar-bg)', text: 'var(--ink-medium)' },
  gem: { bg: 'var(--card-bg)', text: 'var(--accent)' },
  art: { bg: 'var(--card-bg)', text: 'var(--sepia)' },
  magic_item: { bg: 'var(--card-bg)', text: 'var(--accent)' },
  other: { bg: 'var(--sidebar-bg)', text: 'var(--ink-light)' },
};
