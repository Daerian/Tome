/**
 * Treasury — Campaign-wide magic item registry
 *
 * Tracks important magic items for the campaign. Both DM and players can add items.
 * Shows rarity (common to artifact), item type, requires attunement, cursed flag,
 * who currently holds it, who's attuned to it, and which session it was found in.
 * Search and filter by rarity. DM or item creator can edit/delete.
 */

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function Treasury({ campaignId, session, role }) {
  const [items, setItems] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [filterRarity, setFilterRarity] = useState('all');

  const [form, setForm] = useState({
    name: '',
    description: '',
    rarity: 'common',
    item_type: 'wondrous',
    requires_attunement: false,
    attuned_to_id: '',
    held_by_id: '',
    properties: '',
    is_cursed: false,
    notes: '',
    source_session_id: '',
  });
  const [sessions, setSessions] = useState([]);
  const [creating, setCreating] = useState(false);

  async function fetchAll() {
    const [iRes, cRes, sRes] = await Promise.all([
      supabase
        .from('treasury_items')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false }),
      supabase
        .from('characters')
        .select('id, name, type')
        .eq('campaign_id', campaignId)
        .order('name'),
      supabase
        .from('sessions')
        .select('id, session_number, title')
        .eq('campaign_id', campaignId)
        .order('session_number'),
    ]);
    if (iRes.data) setItems(iRes.data);
    if (cRes.data) setCharacters(cRes.data);
    if (sRes.data) setSessions(sRes.data);
    setLoading(false);
  }

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  async function createItem() {
    if (!form.name.trim()) return;
    setCreating(true);
    const insert = {
      campaign_id: campaignId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      rarity: form.rarity,
      item_type: form.item_type,
      requires_attunement: form.requires_attunement,
      is_cursed: form.is_cursed,
      properties: form.properties.trim() || null,
      notes: form.notes.trim() || null,
      added_by: session.user.id,
    };
    if (form.attuned_to_id) insert.attuned_to_id = form.attuned_to_id;
    if (form.held_by_id) insert.held_by_id = form.held_by_id;
    if (form.source_session_id)
      insert.source_session_id = form.source_session_id;

    const { data, error } = await supabase
      .from('treasury_items')
      .insert(insert)
      .select()
      .single();
    if (!error && data) {
      setItems([data, ...items]);
      setForm({
        name: '',
        description: '',
        rarity: 'common',
        item_type: 'wondrous',
        requires_attunement: false,
        attuned_to_id: '',
        held_by_id: '',
        properties: '',
        is_cursed: false,
        notes: '',
        source_session_id: '',
      });
      setShowCreate(false);
      setSelectedId(data.id);
    }
    setCreating(false);
  }

  async function updateItem(id, updates) {
    const { error } = await supabase
      .from('treasury_items')
      .update(updates)
      .eq('id', id);
    if (!error)
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, ...updates } : i)),
      );
    return !error;
  }

  async function deleteItem(id) {
    if (!window.confirm('Remove this item from the treasury?')) return;
    const { error } = await supabase
      .from('treasury_items')
      .delete()
      .eq('id', id);
    if (!error) {
      setItems((prev) => prev.filter((i) => i.id !== id));
      setSelectedId(null);
    }
  }

  const filtered = items.filter((i) => {
    if (filterRarity !== 'all' && i.rarity !== filterRarity) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        i.name.toLowerCase().includes(q) ||
        (i.description || '').toLowerCase().includes(q) ||
        (i.properties || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const selected = items.find((i) => i.id === selectedId);

  if (loading)
    return (
      <p style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
        Loading treasury...
      </p>
    );

  if (selected)
    return (
      <ItemDetail
        item={selected}
        characters={characters}
        sessions={sessions}
        role={role}
        session={session}
        onBack={() => setSelectedId(null)}
        onUpdate={updateItem}
        onDelete={deleteItem}
      />
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
        <h3 style={{ margin: 0, color: '#1e293b' }}>Treasury</h3>
        <button style={s.addBtn} onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? 'Cancel' : '+ Add Item'}
        </button>
      </div>

      {/* Search & filter */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <input
          style={{ ...s.input, flex: 1, minWidth: '150px' }}
          placeholder="Search items..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          style={s.select}
          value={filterRarity}
          onChange={(e) => setFilterRarity(e.target.value)}
        >
          <option value="all">All Rarities</option>
          <option value="common">Common</option>
          <option value="uncommon">Uncommon</option>
          <option value="rare">Rare</option>
          <option value="very_rare">Very Rare</option>
          <option value="legendary">Legendary</option>
          <option value="artifact">Artifact</option>
        </select>
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={s.createForm}>
          <input
            style={s.input}
            placeholder="Item name *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <textarea
            style={s.textarea}
            placeholder="Description"
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <select
              style={s.select}
              value={form.rarity}
              onChange={(e) => setForm({ ...form, rarity: e.target.value })}
            >
              <option value="common">Common</option>
              <option value="uncommon">Uncommon</option>
              <option value="rare">Rare</option>
              <option value="very_rare">Very Rare</option>
              <option value="legendary">Legendary</option>
              <option value="artifact">Artifact</option>
            </select>
            <select
              style={s.select}
              value={form.item_type}
              onChange={(e) => setForm({ ...form, item_type: e.target.value })}
            >
              <option value="weapon">Weapon</option>
              <option value="armor">Armor</option>
              <option value="shield">Shield</option>
              <option value="ring">Ring</option>
              <option value="rod">Rod</option>
              <option value="staff">Staff</option>
              <option value="wand">Wand</option>
              <option value="potion">Potion</option>
              <option value="scroll">Scroll</option>
              <option value="wondrous">Wondrous</option>
              <option value="other">Other</option>
            </select>
          </div>
          <textarea
            style={s.textarea}
            placeholder="Properties / abilities"
            rows={2}
            value={form.properties}
            onChange={(e) => setForm({ ...form, properties: e.target.value })}
          />
          <div
            style={{
              display: 'flex',
              gap: '1rem',
              alignItems: 'center',
              fontSize: '0.85rem',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                color: '#475569',
              }}
            >
              <input
                type="checkbox"
                checked={form.requires_attunement}
                onChange={(e) =>
                  setForm({ ...form, requires_attunement: e.target.checked })
                }
              />{' '}
              Requires Attunement
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                color: '#475569',
              }}
            >
              <input
                type="checkbox"
                checked={form.is_cursed}
                onChange={(e) =>
                  setForm({ ...form, is_cursed: e.target.checked })
                }
              />{' '}
              Cursed
            </label>
          </div>
          <select
            style={s.select}
            value={form.held_by_id}
            onChange={(e) => setForm({ ...form, held_by_id: e.target.value })}
          >
            <option value="">Held by (optional)</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            style={s.select}
            value={form.source_session_id}
            onChange={(e) =>
              setForm({ ...form, source_session_id: e.target.value })
            }
          >
            <option value="">Found in session (optional)</option>
            {sessions.map((ss) => (
              <option key={ss.id} value={ss.id}>
                Session {ss.session_number}
                {ss.title ? `: ${ss.title}` : ''}
              </option>
            ))}
          </select>
          <textarea
            style={s.textarea}
            placeholder="Notes"
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <button style={s.saveBtn} onClick={createItem} disabled={creating}>
            {creating ? 'Adding...' : 'Add to Treasury'}
          </button>
        </div>
      )}

      {/* Item list */}
      {filtered.length === 0 ? (
        <p style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem' }}>
          {items.length === 0
            ? 'No items in the treasury yet.'
            : 'No matching items.'}
        </p>
      ) : (
        filtered.map((item) => {
          const holder = characters.find((c) => c.id === item.held_by_id);
          return (
            <div
              key={item.id}
              style={s.card}
              onClick={() => setSelectedId(item.id)}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ fontWeight: 600, color: '#1e293b' }}>
                      {item.name}
                    </span>
                    <span
                      style={{
                        ...s.badge,
                        backgroundColor:
                          rarityColors[item.rarity]?.bg || '#f1f5f9',
                        color: rarityColors[item.rarity]?.text || '#475569',
                      }}
                    >
                      {item.rarity.replace('_', ' ')}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                      {item.item_type}
                    </span>
                    {item.requires_attunement && (
                      <span style={{ fontSize: '0.65rem', color: '#7c3aed' }}>
                        attunement
                      </span>
                    )}
                    {item.is_cursed && (
                      <span
                        style={{
                          fontSize: '0.65rem',
                          color: '#dc2626',
                          fontWeight: 600,
                        }}
                      >
                        CURSED
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p
                      style={{
                        margin: '0.25rem 0 0',
                        fontSize: '0.8rem',
                        color: '#64748b',
                      }}
                    >
                      {item.description.slice(0, 100)}
                      {item.description.length > 100 ? '...' : ''}
                    </p>
                  )}
                  {holder && (
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      Held by: {holder.name}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ─── Item Detail View ───────────────────────────────────────────────────────

function ItemDetail({
  item,
  characters,
  sessions,
  role,
  session,
  onBack,
  onUpdate,
  onDelete,
}) {
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

  const holder = characters.find((c) => c.id === item.held_by_id);
  const attunedTo = characters.find((c) => c.id === item.attuned_to_id);
  const sourceSession = sessions.find((ss) => ss.id === item.source_session_id);
  const canEdit = role === 'dm' || item.added_by === session.user.id;

  function startEdit() {
    setEditForm({
      name: item.name,
      description: item.description || '',
      rarity: item.rarity,
      item_type: item.item_type,
      requires_attunement: item.requires_attunement,
      attuned_to_id: item.attuned_to_id || '',
      held_by_id: item.held_by_id || '',
      properties: item.properties || '',
      is_cursed: item.is_cursed,
      notes: item.notes || '',
      source_session_id: item.source_session_id || '',
    });
    setEditing(true);
  }

  async function saveEdit() {
    const updates = {
      name: editForm.name.trim(),
      description: editForm.description.trim() || null,
      rarity: editForm.rarity,
      item_type: editForm.item_type,
      requires_attunement: editForm.requires_attunement,
      attuned_to_id: editForm.attuned_to_id || null,
      held_by_id: editForm.held_by_id || null,
      properties: editForm.properties.trim() || null,
      is_cursed: editForm.is_cursed,
      notes: editForm.notes.trim() || null,
      source_session_id: editForm.source_session_id || null,
    };
    const ok = await onUpdate(item.id, updates);
    if (ok) setEditing(false);
  }

  return (
    <div style={{ padding: '1rem' }}>
      <button style={s.backBtn} onClick={onBack}>
        &larr; All Items
      </button>

      {!editing ? (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginTop: '0.75rem',
            }}
          >
            <div>
              <h3 style={{ margin: 0, color: '#1e293b' }}>{item.name}</h3>
              <div
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  marginTop: '0.5rem',
                  flexWrap: 'wrap',
                }}
              >
                <span
                  style={{
                    ...s.badge,
                    backgroundColor: rarityColors[item.rarity]?.bg,
                    color: rarityColors[item.rarity]?.text,
                  }}
                >
                  {item.rarity.replace('_', ' ')}
                </span>
                <span
                  style={{
                    ...s.badge,
                    backgroundColor: '#f1f5f9',
                    color: '#475569',
                  }}
                >
                  {item.item_type}
                </span>
                {item.requires_attunement && (
                  <span
                    style={{
                      ...s.badge,
                      backgroundColor: '#ede9fe',
                      color: '#7c3aed',
                    }}
                  >
                    requires attunement
                  </span>
                )}
                {item.is_cursed && (
                  <span
                    style={{
                      ...s.badge,
                      backgroundColor: '#fef2f2',
                      color: '#dc2626',
                    }}
                  >
                    cursed
                  </span>
                )}
              </div>
            </div>
            {canEdit && (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button style={s.editBtn} onClick={startEdit}>
                  Edit
                </button>
                <button style={s.delBtn} onClick={() => onDelete(item.id)}>
                  Delete
                </button>
              </div>
            )}
          </div>

          {item.description && (
            <p
              style={{
                color: '#334155',
                fontSize: '0.875rem',
                lineHeight: 1.6,
                marginTop: '1rem',
                whiteSpace: 'pre-wrap',
              }}
            >
              {item.description}
            </p>
          )}

          {item.properties && (
            <div
              style={{
                marginTop: '0.75rem',
                padding: '0.75rem',
                backgroundColor: '#f0f9ff',
                borderRadius: '8px',
                border: '1px solid #bae6fd',
              }}
            >
              <strong style={{ fontSize: '0.8rem', color: '#0369a1' }}>
                Properties
              </strong>
              <p
                style={{
                  margin: '0.25rem 0 0',
                  fontSize: '0.8rem',
                  color: '#0c4a6e',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {item.properties}
              </p>
            </div>
          )}

          <div
            style={{
              marginTop: '0.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.3rem',
              fontSize: '0.8rem',
              color: '#64748b',
            }}
          >
            {holder && (
              <span>
                Held by:{' '}
                <strong style={{ color: '#334155' }}>{holder.name}</strong>
              </span>
            )}
            {attunedTo && (
              <span>
                Attuned to:{' '}
                <strong style={{ color: '#334155' }}>{attunedTo.name}</strong>
              </span>
            )}
            {sourceSession && (
              <span>
                Found in:{' '}
                <strong style={{ color: '#334155' }}>
                  Session {sourceSession.session_number}
                  {sourceSession.title ? `: ${sourceSession.title}` : ''}
                </strong>
              </span>
            )}
          </div>

          {item.notes && (
            <div
              style={{
                marginTop: '0.75rem',
                padding: '0.75rem',
                backgroundColor: '#fefce8',
                borderRadius: '8px',
                border: '1px solid #fef08a',
              }}
            >
              <strong style={{ fontSize: '0.8rem', color: '#854d0e' }}>
                Notes
              </strong>
              <p
                style={{
                  margin: '0.25rem 0 0',
                  fontSize: '0.8rem',
                  color: '#713f12',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {item.notes}
              </p>
            </div>
          )}
        </>
      ) : (
        <div style={{ ...s.createForm, marginTop: '0.75rem' }}>
          <input
            style={s.input}
            value={editForm.name}
            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
          />
          <textarea
            style={s.textarea}
            rows={3}
            value={editForm.description}
            onChange={(e) =>
              setEditForm({ ...editForm, description: e.target.value })
            }
          />
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <select
              style={s.select}
              value={editForm.rarity}
              onChange={(e) =>
                setEditForm({ ...editForm, rarity: e.target.value })
              }
            >
              <option value="common">Common</option>
              <option value="uncommon">Uncommon</option>
              <option value="rare">Rare</option>
              <option value="very_rare">Very Rare</option>
              <option value="legendary">Legendary</option>
              <option value="artifact">Artifact</option>
            </select>
            <select
              style={s.select}
              value={editForm.item_type}
              onChange={(e) =>
                setEditForm({ ...editForm, item_type: e.target.value })
              }
            >
              <option value="weapon">Weapon</option>
              <option value="armor">Armor</option>
              <option value="shield">Shield</option>
              <option value="ring">Ring</option>
              <option value="rod">Rod</option>
              <option value="staff">Staff</option>
              <option value="wand">Wand</option>
              <option value="potion">Potion</option>
              <option value="scroll">Scroll</option>
              <option value="wondrous">Wondrous</option>
              <option value="other">Other</option>
            </select>
          </div>
          <textarea
            style={s.textarea}
            placeholder="Properties"
            rows={2}
            value={editForm.properties}
            onChange={(e) =>
              setEditForm({ ...editForm, properties: e.target.value })
            }
          />
          <div
            style={{
              display: 'flex',
              gap: '1rem',
              alignItems: 'center',
              fontSize: '0.85rem',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                color: '#475569',
              }}
            >
              <input
                type="checkbox"
                checked={editForm.requires_attunement}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    requires_attunement: e.target.checked,
                  })
                }
              />{' '}
              Attunement
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                color: '#475569',
              }}
            >
              <input
                type="checkbox"
                checked={editForm.is_cursed}
                onChange={(e) =>
                  setEditForm({ ...editForm, is_cursed: e.target.checked })
                }
              />{' '}
              Cursed
            </label>
          </div>
          <select
            style={s.select}
            value={editForm.held_by_id}
            onChange={(e) =>
              setEditForm({ ...editForm, held_by_id: e.target.value })
            }
          >
            <option value="">Held by...</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {editForm.requires_attunement && (
            <select
              style={s.select}
              value={editForm.attuned_to_id}
              onChange={(e) =>
                setEditForm({ ...editForm, attuned_to_id: e.target.value })
              }
            >
              <option value="">Attuned to...</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <select
            style={s.select}
            value={editForm.source_session_id}
            onChange={(e) =>
              setEditForm({ ...editForm, source_session_id: e.target.value })
            }
          >
            <option value="">Found in session...</option>
            {sessions.map((ss) => (
              <option key={ss.id} value={ss.id}>
                Session {ss.session_number}
                {ss.title ? `: ${ss.title}` : ''}
              </option>
            ))}
          </select>
          <textarea
            style={s.textarea}
            placeholder="Notes"
            rows={2}
            value={editForm.notes}
            onChange={(e) =>
              setEditForm({ ...editForm, notes: e.target.value })
            }
          />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button style={s.saveBtn} onClick={saveEdit}>
              Save
            </button>
            <button style={s.cancelBtn} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const rarityColors = {
  common: { bg: '#f1f5f9', text: '#475569' },
  uncommon: { bg: '#dcfce7', text: '#15803d' },
  rare: { bg: '#dbeafe', text: '#1d4ed8' },
  very_rare: { bg: '#ede9fe', text: '#6d28d9' },
  legendary: { bg: '#fef3c7', text: '#b45309' },
  artifact: { bg: '#fef2f2', text: '#dc2626' },
};

const s = {
  addBtn: {
    padding: '0.35rem 0.75rem',
    borderRadius: '6px',
    backgroundColor: '#2563eb',
    color: '#fff',
    border: 'none',
    fontSize: '0.8rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#2563eb',
    cursor: 'pointer',
    fontSize: '0.85rem',
    padding: 0,
    fontFamily: 'inherit',
  },
  editBtn: {
    padding: '0.3rem 0.6rem',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    border: '1px solid #cbd5e1',
    color: '#475569',
    fontSize: '0.75rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  delBtn: {
    padding: '0.3rem 0.6rem',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    border: '1px solid #fca5a5',
    color: '#dc2626',
    fontSize: '0.75rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  cancelBtn: {
    padding: '0.4rem 0.8rem',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    border: '1px solid #cbd5e1',
    color: '#475569',
    fontSize: '0.8rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  card: {
    padding: '0.75rem',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    marginBottom: '0.5rem',
    cursor: 'pointer',
    backgroundColor: '#fff',
  },
  createForm: {
    padding: '1rem',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    marginBottom: '1rem',
    backgroundColor: '#f8fafc',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  input: {
    padding: '0.5rem',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    fontSize: '0.85rem',
    fontFamily: 'inherit',
    width: '100%',
    boxSizing: 'border-box',
  },
  textarea: {
    padding: '0.5rem',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    fontSize: '0.85rem',
    fontFamily: 'inherit',
    width: '100%',
    boxSizing: 'border-box',
    resize: 'vertical',
  },
  select: {
    padding: '0.5rem',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    fontSize: '0.85rem',
    fontFamily: 'inherit',
    backgroundColor: '#fff',
  },
  saveBtn: {
    padding: '0.4rem 0.8rem',
    borderRadius: '6px',
    backgroundColor: '#2563eb',
    color: '#fff',
    border: 'none',
    fontSize: '0.8rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  badge: {
    fontSize: '0.65rem',
    fontWeight: 600,
    padding: '0.15rem 0.4rem',
    borderRadius: '4px',
  },
};
