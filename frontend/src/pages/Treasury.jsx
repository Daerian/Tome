/**
 * Treasury — Campaign-wide magic item registry
 *
 * Tracks important magic items for the campaign. Both DM and players can add items.
 * Shows rarity (common to artifact), item type, requires attunement, cursed flag,
 * who currently holds it, who's attuned to it, and which session it was found in.
 * Search and filter by rarity. DM or item creator can edit/delete.
 */

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

const API_URL = import.meta.env.VITE_API_URL;

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

  // 5e item search
  const [itemSearch, setItemSearch] = useState('');
  const [itemSearchSource, setItemSearchSource] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [availableSources, setAvailableSources] = useState([]);
  const [searching, setSearching] = useState(false);
  const [importedName, setImportedName] = useState('');
  const searchDebounceRef = useRef(null);

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

  // Pre-load available sources when the create form opens
  useEffect(() => {
    if (showCreate && availableSources.length === 0) {
      fetch(`${API_URL}/api/items/search?q=a&limit=1`)
        .then((r) => r.json())
        .then((d) => setAvailableSources(d.available_sources || []))
        .catch(() => {});
    }
    if (!showCreate) {
      setItemSearch('');
      setItemSearchSource('');
      setSearchResults([]);
      setImportedName('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCreate]);

  // Debounced item search
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!itemSearch.trim()) {
      setSearchResults([]);
      return;
    }
    searchDebounceRef.current = setTimeout(() => {
      runItemSearch(itemSearch, itemSearchSource);
    }, 350);
    return () => clearTimeout(searchDebounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemSearch, itemSearchSource]);

  async function runItemSearch(q, source) {
    setSearching(true);
    try {
      const params = new URLSearchParams({ q, limit: 15 });
      if (source) params.set('source', source);
      const res = await fetch(`${API_URL}/api/items/search?${params}`);
      const data = await res.json();
      setSearchResults(data.results || []);
      if (data.available_sources?.length && availableSources.length === 0) {
        setAvailableSources(data.available_sources);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  function handleItemSearchInput(value) {
    // Detect a pasted 5etools URL: https://5e.tools/items.html#cape+of+the+mountebank_dmg
    const urlMatch = value.match(/5e\.tools\/items\.html#([^&\s]+)/i);
    if (urlMatch) {
      const hash = decodeURIComponent(urlMatch[1]).replace(/\+/g, ' ');
      const lastUnderscore = hash.lastIndexOf('_');
      if (lastUnderscore > 0) {
        const name = hash.slice(0, lastUnderscore);
        const source = hash.slice(lastUnderscore + 1).toUpperCase();
        setItemSearch(name);
        setItemSearchSource(source);
        return; // useEffect will fire the search
      }
    }
    setItemSearch(value);
  }

  function importSearchResult(result) {
    setForm({
      name: result.name,
      description: result.description || '',
      rarity: result.rarity,
      item_type: result.item_type,
      requires_attunement: result.requires_attunement,
      attuned_to_id: '',
      held_by_id: '',
      properties: '',
      is_cursed: false,
      notes: `Source: ${result.source_full}`,
      source_session_id: '',
    });
    setImportedName(result.name);
    setSearchResults([]);
    setItemSearch('');
  }

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
      <p
        style={{
          textAlign: 'center',
          padding: '2rem',
          color: 'var(--ink-light)',
        }}
      >
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
        <h3 style={{ margin: 0, color: 'var(--ink-dark)' }}>Treasury</h3>
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
          {/* ── 5e Database Search ─────────────────────────────────────── */}
          <div style={s.searchSection}>
            <p style={s.searchLabel}>
              Search 5e Database
              <span style={s.searchHint}>
                — type a name or paste a 5e.tools URL
              </span>
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                style={{ ...s.input, flex: 1 }}
                placeholder="e.g. Cape of the Mountebank or paste 5e.tools URL"
                value={itemSearch}
                onChange={(e) => handleItemSearchInput(e.target.value)}
              />
              <select
                style={s.select}
                value={itemSearchSource}
                onChange={(e) => setItemSearchSource(e.target.value)}
                title="Filter by sourcebook"
              >
                <option value="">All Sources</option>
                {availableSources.map((src) => (
                  <option key={src.code} value={src.code}>
                    {src.code} — {src.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Search status */}
            {searching && <p style={s.searchMuted}>Searching...</p>}

            {/* Results */}
            {searchResults.length > 0 && (
              <div style={s.searchResults}>
                {searchResults.map((r, i) => (
                  <div key={i} style={s.searchResultRow}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        flex: 1,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: '0.85rem',
                          color: 'var(--ink-dark)',
                        }}
                      >
                        {r.name}
                      </span>
                      <span
                        style={{
                          ...s.badge,
                          color:
                            rarityColors[r.rarity]?.text || 'var(--ink-light)',
                        }}
                      >
                        {r.rarity.replace('_', ' ')}
                      </span>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          color: 'var(--ink-faint)',
                        }}
                      >
                        {r.item_type}
                      </span>
                      {r.requires_attunement && (
                        <span
                          style={{
                            fontSize: '0.65rem',
                            color: 'var(--accent)',
                          }}
                        >
                          attunement
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: '0.7rem',
                          color: 'var(--ink-faint)',
                          marginLeft: 'auto',
                        }}
                      >
                        {r.source}
                      </span>
                    </div>
                    <button
                      style={s.importBtn}
                      onClick={() => importSearchResult(r)}
                    >
                      Import
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* No results */}
            {!searching && itemSearch.trim() && searchResults.length === 0 && (
              <p style={s.searchMuted}>
                No results — fill the form manually below.
              </p>
            )}

            {/* Import confirmation */}
            {importedName && !itemSearch && (
              <p style={{ ...s.searchMuted, color: 'var(--success)' }}>
                ✓ Imported &ldquo;{importedName}&rdquo; — review and save below.
              </p>
            )}
          </div>

          <div style={s.searchDivider} />

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
                color: 'var(--ink-medium)',
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
                color: 'var(--ink-medium)',
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
        <p
          style={{
            color: 'var(--ink-faint)',
            textAlign: 'center',
            padding: '2rem',
          }}
        >
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
                    <span style={{ fontWeight: 600, color: 'var(--ink-dark)' }}>
                      {item.name}
                    </span>
                    <span
                      style={{
                        ...s.badge,
                        color:
                          rarityColors[item.rarity]?.text ||
                          'var(--ink-medium)',
                        fontWeight: rarityColors[item.rarity]?.bold ? 700 : 600,
                      }}
                    >
                      {item.rarity.replace('_', ' ')}
                    </span>
                    <span
                      style={{ fontSize: '0.7rem', color: 'var(--ink-faint)' }}
                    >
                      {item.item_type}
                    </span>
                    {item.requires_attunement && (
                      <span
                        style={{ fontSize: '0.65rem', color: 'var(--accent)' }}
                      >
                        *
                      </span>
                    )}
                    {item.is_cursed && (
                      <span
                        style={{
                          fontSize: '0.65rem',
                          color: 'var(--danger)',
                          fontWeight: 600,
                        }}
                      >
                        †
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p
                      style={{
                        margin: '0.25rem 0 0',
                        fontSize: '0.8rem',
                        color: 'var(--ink-light)',
                      }}
                    >
                      {item.description.slice(0, 100)}
                      {item.description.length > 100 ? '...' : ''}
                    </p>
                  )}
                  {holder && (
                    <span
                      style={{ fontSize: '0.75rem', color: 'var(--ink-light)' }}
                    >
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
              <h3 style={{ margin: 0, color: 'var(--ink-dark)' }}>
                {item.name}
              </h3>
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
                    color: rarityColors[item.rarity]?.text,
                    fontWeight: rarityColors[item.rarity]?.bold ? 700 : 600,
                  }}
                >
                  {item.rarity.replace('_', ' ')}
                </span>
                <span
                  style={{
                    ...s.badge,
                    color: 'var(--ink-medium)',
                  }}
                >
                  {item.item_type}
                </span>
                {item.requires_attunement && (
                  <span
                    style={{
                      ...s.badge,
                      color: 'var(--accent)',
                    }}
                  >
                    requires attunement *
                  </span>
                )}
                {item.is_cursed && (
                  <span
                    style={{
                      ...s.badge,
                      color: 'var(--danger)',
                    }}
                  >
                    cursed †
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
                color: 'var(--ink-dark)',
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
                backgroundColor: 'var(--card-bg)',
                borderRadius: '3px',
                border: '1px solid var(--border-light)',
              }}
            >
              <strong
                style={{ fontSize: '0.8rem', color: 'var(--accent-deep)' }}
              >
                Properties
              </strong>
              <p
                style={{
                  margin: '0.25rem 0 0',
                  fontSize: '0.8rem',
                  color: 'var(--ink-dark)',
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
              color: 'var(--ink-light)',
            }}
          >
            {holder && (
              <span>
                Held by:{' '}
                <strong style={{ color: 'var(--ink-dark)' }}>
                  {holder.name}
                </strong>
              </span>
            )}
            {attunedTo && (
              <span>
                Attuned to:{' '}
                <strong style={{ color: 'var(--ink-dark)' }}>
                  {attunedTo.name}
                </strong>
              </span>
            )}
            {sourceSession && (
              <span>
                Found in:{' '}
                <strong style={{ color: 'var(--ink-dark)' }}>
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
                backgroundColor: 'var(--card-bg)',
                borderRadius: '3px',
                border: '1px solid var(--gold)',
              }}
            >
              <strong style={{ fontSize: '0.8rem', color: 'var(--sepia)' }}>
                Notes
              </strong>
              <p
                style={{
                  margin: '0.25rem 0 0',
                  fontSize: '0.8rem',
                  color: 'var(--sepia)',
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
                color: 'var(--ink-medium)',
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
                color: 'var(--ink-medium)',
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
  common: { text: 'var(--ink-light)' },
  uncommon: { text: 'var(--success)' },
  rare: { text: 'var(--accent)' },
  very_rare: { text: 'var(--accent-deep)' },
  legendary: { text: 'var(--gold)' },
  artifact: { text: 'var(--accent)', bold: true },
};

const s = {
  addBtn: {
    padding: '0.35rem 0.75rem',
    borderRadius: '2px',
    backgroundColor: 'var(--accent)',
    color: '#fff',
    border: 'none',
    fontSize: '0.8rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--accent)',
    cursor: 'pointer',
    fontSize: '0.85rem',
    padding: 0,
    fontFamily: 'var(--font-body)',
  },
  editBtn: {
    padding: '0.3rem 0.6rem',
    borderRadius: '2px',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-medium)',
    color: 'var(--ink-medium)',
    fontSize: '0.75rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
  },
  delBtn: {
    padding: '0.3rem 0.6rem',
    borderRadius: '2px',
    backgroundColor: 'transparent',
    border: '1px solid var(--danger)',
    color: 'var(--danger)',
    fontSize: '0.75rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
  },
  cancelBtn: {
    padding: '0.4rem 0.8rem',
    borderRadius: '2px',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-medium)',
    color: 'var(--ink-medium)',
    fontSize: '0.8rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
  },
  card: {
    padding: '0.75rem',
    borderBottom: '1px solid var(--border-light)',
    marginBottom: '0.5rem',
    cursor: 'pointer',
    backgroundColor: 'transparent',
  },
  createForm: {
    padding: '1rem',
    border: '1px solid var(--border-light)',
    borderRadius: '3px',
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
    color: 'var(--ink-medium)',
    width: '100%',
    boxSizing: 'border-box',
  },
  textarea: {
    padding: '0.5rem',
    border: '1px solid var(--border-medium)',
    borderRadius: '2px',
    fontSize: '0.85rem',
    fontFamily: 'var(--font-body)',
    color: 'var(--ink-medium)',
    width: '100%',
    boxSizing: 'border-box',
    resize: 'vertical',
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
    color: '#fff',
    border: 'none',
    fontSize: '0.8rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
  },
  badge: {
    fontSize: '0.65rem',
    fontWeight: 600,
    padding: '0.15rem 0.4rem',
    borderRadius: '1px',
  },
  searchSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  searchLabel: {
    margin: 0,
    fontSize: '0.8rem',
    fontWeight: 600,
    color: 'var(--ink-dark)',
    fontFamily: 'var(--font-body)',
  },
  searchHint: {
    fontWeight: 400,
    color: 'var(--ink-faint)',
    marginLeft: '0.25rem',
  },
  searchResults: {
    border: '1px solid var(--border-light)',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  searchResultRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.4rem 0.6rem',
    borderBottom: '1px solid var(--border-light)',
    backgroundColor: 'var(--card-bg)',
  },
  searchMuted: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--ink-faint)',
    fontFamily: 'var(--font-body)',
  },
  searchDivider: {
    borderTop: '1px solid var(--border-light)',
    margin: '0.25rem 0',
  },
  importBtn: {
    padding: '0.2rem 0.55rem',
    borderRadius: '2px',
    backgroundColor: 'var(--accent)',
    color: '#fff',
    border: 'none',
    fontSize: '0.72rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
    flexShrink: 0,
  },
};
