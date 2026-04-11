/**
 * NPCs — Character registry for NPCs, PCs, companions, and deities
 *
 * Create and manage characters. Each character has name, type, race, class, alignment,
 * status (alive/dead/missing/retired), description, backstory, portrait, tags, and
 * relationships. DM can create/edit/delete. Search by name, description, tags, race, class.
 * Supports hierarchical relationships between characters.
 */

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function NPCs({ campaignId, role }) {
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [form, setForm] = useState({
    name: '',
    type: 'npc',
    race: '',
    class: '',
    description: '',
    backstory: '',
    tags: '',
    portrait_url: '',
  });
  const [relationships, setRelationships] = useState([]);
  const [creating, setCreating] = useState(false);

  async function fetchCharacters() {
    const { data } = await supabase
      .from('characters')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('name');
    if (data) setCharacters(data);
    setLoading(false);
  }

  useEffect(() => {
    fetchCharacters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  async function createCharacter() {
    if (!form.name.trim()) return;
    setCreating(true);

    const tags = form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const rels = relationships.filter(
      (r) => r.name.trim() && r.relation.trim(),
    );

    const { data, error } = await supabase
      .from('characters')
      .insert({
        campaign_id: campaignId,
        name: form.name.trim(),
        type: form.type,
        race: form.race.trim() || null,
        class: form.class.trim() || null,
        description: form.description.trim() || null,
        backstory: form.backstory.trim() || null,
        portrait_url: form.portrait_url.trim() || null,
        tags,
        relationships: rels,
        visibility: 'public',
      })
      .select()
      .single();

    if (!error && data) {
      setCharacters(
        [...characters, data].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setForm({
        name: '',
        type: 'npc',
        race: '',
        class: '',
        description: '',
        backstory: '',
        tags: '',
        portrait_url: '',
      });
      setRelationships([]);
      setShowCreate(false);
      setSelectedId(data.id);
    }
    setCreating(false);
  }

  async function updateCharacter(id, updates) {
    const { error } = await supabase
      .from('characters')
      .update(updates)
      .eq('id', id);
    if (!error) {
      setCharacters((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...updates } : c)),
      );
    }
    return !error;
  }

  async function deleteCharacter(id) {
    if (!window.confirm('Delete this character? This cannot be undone.'))
      return;
    const { error } = await supabase.from('characters').delete().eq('id', id);
    if (!error) {
      setCharacters((prev) => prev.filter((c) => c.id !== id));
      setSelectedId(null);
    }
  }

  const filtered = characters.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.description || '').toLowerCase().includes(q) ||
      (c.tags || []).some((t) => t.toLowerCase().includes(q)) ||
      (c.race || '').toLowerCase().includes(q) ||
      (c.class || '').toLowerCase().includes(q)
    );
  });

  // Detail view
  if (selectedId) {
    const ch = characters.find((c) => c.id === selectedId);
    if (!ch) {
      setSelectedId(null);
      return null;
    }
    return (
      <CharacterDetail
        character={ch}
        role={role}
        onBack={() => {
          setSelectedId(null);
          fetchCharacters();
        }}
        onUpdate={updateCharacter}
        onDelete={deleteCharacter}
      />
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>NPCs & Characters</h2>
        {role === 'dm' && (
          <button
            style={styles.button}
            onClick={() => setShowCreate(!showCreate)}
          >
            {showCreate ? 'Cancel' : 'Add Character'}
          </button>
        )}
      </div>

      {showCreate && (
        <div style={styles.createForm}>
          <div style={styles.row}>
            <input
              style={{ ...styles.input, flex: 1 }}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Name *"
              autoFocus
            />
            <select
              style={styles.select}
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              <option value="npc">NPC</option>
              <option value="pc">PC</option>
              <option value="companion">Companion</option>
              <option value="deity">Deity</option>
            </select>
          </div>
          <div style={styles.row}>
            <input
              style={{ ...styles.input, flex: 1 }}
              value={form.race}
              onChange={(e) => setForm({ ...form, race: e.target.value })}
              placeholder="Race (e.g. Human, Elf)"
            />
            <input
              style={{ ...styles.input, flex: 1 }}
              value={form.class}
              onChange={(e) => setForm({ ...form, class: e.target.value })}
              placeholder="Class (e.g. Rogue, Wizard)"
            />
          </div>
          <textarea
            style={styles.textarea}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Description — appearance, personality, role..."
            rows={3}
          />
          <textarea
            style={styles.textarea}
            value={form.backstory}
            onChange={(e) => setForm({ ...form, backstory: e.target.value })}
            placeholder="Backstory (optional)"
            rows={2}
          />
          <input
            style={styles.input}
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
            placeholder="Tags (comma-separated, e.g. tavern keeper, quest giver, ally)"
          />
          <input
            style={styles.input}
            value={form.portrait_url}
            onChange={(e) => setForm({ ...form, portrait_url: e.target.value })}
            placeholder="Portrait image URL (optional)"
          />

          <div style={styles.relSection}>
            <span style={styles.relLabel}>Relationships</span>
            {relationships.map((r, i) => (
              <div key={i} style={styles.row}>
                <input
                  style={{ ...styles.input, flex: 1 }}
                  value={r.name}
                  onChange={(e) => {
                    const copy = [...relationships];
                    copy[i] = { ...copy[i], name: e.target.value };
                    setRelationships(copy);
                  }}
                  placeholder="Name"
                />
                <input
                  style={{ ...styles.input, flex: 1 }}
                  value={r.relation}
                  onChange={(e) => {
                    const copy = [...relationships];
                    copy[i] = { ...copy[i], relation: e.target.value };
                    setRelationships(copy);
                  }}
                  placeholder="Relation (e.g. enemy, ally)"
                />
                <button
                  style={styles.removeBtn}
                  onClick={() =>
                    setRelationships(relationships.filter((_, j) => j !== i))
                  }
                >
                  x
                </button>
              </div>
            ))}
            <button
              style={styles.addRelBtn}
              onClick={() =>
                setRelationships([...relationships, { name: '', relation: '' }])
              }
            >
              + Add Relationship
            </button>
          </div>

          <button
            style={styles.button}
            onClick={createCharacter}
            disabled={creating || !form.name.trim()}
          >
            {creating ? 'Creating...' : 'Create Character'}
          </button>
        </div>
      )}

      <input
        style={styles.searchInput}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name, description, tag, race, or class..."
      />

      {loading ? (
        <p style={styles.muted}>Loading characters...</p>
      ) : filtered.length === 0 ? (
        <div style={styles.empty}>
          <p style={styles.emptyText}>
            {search ? 'No characters match your search.' : 'No characters yet.'}
          </p>
          {!search && role === 'dm' && (
            <p style={styles.muted}>Add your first NPC to get started.</p>
          )}
        </div>
      ) : (
        <div style={styles.list}>
          {filtered.map((ch) => (
            <button
              key={ch.id}
              style={styles.card}
              onClick={() => setSelectedId(ch.id)}
            >
              <div style={styles.cardRow}>
                {ch.portrait_url && (
                  <img src={ch.portrait_url} alt="" style={styles.thumbnail} />
                )}
                <div style={styles.cardInfo}>
                  <div style={styles.cardTop}>
                    <span style={styles.cardName}>{ch.name}</span>
                    <span
                      style={{
                        ...styles.typeBadge,
                        color: typeColors[ch.type] || 'var(--ink-medium)',
                      }}
                    >
                      {ch.type.toUpperCase()}
                    </span>
                  </div>
                  {(ch.race || ch.class) && (
                    <span style={styles.meta}>
                      {[ch.race, ch.class, ch.level ? `Lvl ${ch.level}` : '']
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  )}
                  {ch.description && (
                    <p style={styles.preview}>
                      {ch.description.length > 100
                        ? ch.description.substring(0, 100) + '...'
                        : ch.description}
                    </p>
                  )}
                  {ch.tags && ch.tags.length > 0 && (
                    <div style={styles.tagRow}>
                      {ch.tags.map((t, i) => (
                        <span key={i} style={styles.tag}>
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Character Detail View
// ---------------------------------------------------------------------------

function CharacterDetail({ character, role, onBack, onUpdate, onDelete }) {
  const ch = character;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [relForm, setRelForm] = useState([]);
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setForm({
      description: ch.description || '',
      backstory: ch.backstory || '',
      tags: (ch.tags || []).join(', '),
      portrait_url: ch.portrait_url || '',
      race: ch.race || '',
      class: ch.class || '',
      alignment: ch.alignment || '',
      status: ch.status || 'alive',
    });
    setRelForm(
      ch.relationships && ch.relationships.length > 0
        ? ch.relationships.map((r) => ({ ...r }))
        : [],
    );
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    const tags = form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const rels = relForm.filter((r) => r.name.trim() && r.relation.trim());
    const success = await onUpdate(ch.id, {
      description: form.description.trim() || null,
      backstory: form.backstory.trim() || null,
      tags,
      relationships: rels,
      portrait_url: form.portrait_url.trim() || null,
      race: form.race.trim() || null,
      class: form.class.trim() || null,
      alignment: form.alignment.trim() || null,
      status: form.status,
    });
    if (success) setEditing(false);
    setSaving(false);
  }

  return (
    <div style={styles.detailContainer}>
      <button style={styles.backBtn} onClick={onBack}>
        &larr; Back to Characters
      </button>

      <div style={styles.detailHeader}>
        {ch.portrait_url && (
          <img src={ch.portrait_url} alt={ch.name} style={styles.portrait} />
        )}
        <div>
          <h2 style={styles.detailName}>{ch.name}</h2>
          <div style={styles.detailMeta}>
            <span
              style={{
                ...styles.typeBadge,
                color: typeColors[ch.type] || 'var(--ink-medium)',
              }}
            >
              {ch.type.toUpperCase()}
            </span>
            {ch.race && <span style={styles.metaItem}>{ch.race}</span>}
            {ch.class && <span style={styles.metaItem}>{ch.class}</span>}
            {ch.level && <span style={styles.metaItem}>Level {ch.level}</span>}
            {ch.alignment && (
              <span style={styles.metaItem}>{ch.alignment}</span>
            )}
            <span
              style={{
                ...styles.statusBadge,
                color: statusColors[ch.status] || 'var(--ink-faint)',
              }}
            >
              {ch.status}
            </span>
          </div>
        </div>
      </div>

      {editing ? (
        <div style={styles.editForm}>
          <div style={styles.row}>
            <input
              style={{ ...styles.input, flex: 1 }}
              value={form.race}
              onChange={(e) => setForm({ ...form, race: e.target.value })}
              placeholder="Race"
            />
            <input
              style={{ ...styles.input, flex: 1 }}
              value={form.class}
              onChange={(e) => setForm({ ...form, class: e.target.value })}
              placeholder="Class"
            />
            <input
              style={{ ...styles.input, flex: 1 }}
              value={form.alignment}
              onChange={(e) => setForm({ ...form, alignment: e.target.value })}
              placeholder="Alignment"
            />
            <select
              style={styles.select}
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="alive">Alive</option>
              <option value="dead">Dead</option>
              <option value="missing">Missing</option>
              <option value="retired">Retired</option>
            </select>
          </div>
          <textarea
            style={styles.textarea}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Description"
            rows={4}
          />
          <textarea
            style={styles.textarea}
            value={form.backstory}
            onChange={(e) => setForm({ ...form, backstory: e.target.value })}
            placeholder="Backstory"
            rows={3}
          />
          <input
            style={styles.input}
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
            placeholder="Tags (comma-separated)"
          />
          <input
            style={styles.input}
            value={form.portrait_url}
            onChange={(e) => setForm({ ...form, portrait_url: e.target.value })}
            placeholder="Portrait image URL"
          />

          <div style={styles.relSection}>
            <span style={styles.relLabel}>Relationships</span>
            {relForm.map((r, i) => (
              <div key={i} style={styles.row}>
                <input
                  style={{ ...styles.input, flex: 1 }}
                  value={r.name}
                  onChange={(e) => {
                    const copy = [...relForm];
                    copy[i] = { ...copy[i], name: e.target.value };
                    setRelForm(copy);
                  }}
                  placeholder="Name"
                />
                <input
                  style={{ ...styles.input, flex: 1 }}
                  value={r.relation}
                  onChange={(e) => {
                    const copy = [...relForm];
                    copy[i] = { ...copy[i], relation: e.target.value };
                    setRelForm(copy);
                  }}
                  placeholder="Relation"
                />
                <button
                  style={styles.removeBtn}
                  onClick={() => setRelForm(relForm.filter((_, j) => j !== i))}
                >
                  x
                </button>
              </div>
            ))}
            <button
              style={styles.addRelBtn}
              onClick={() =>
                setRelForm([...relForm, { name: '', relation: '' }])
              }
            >
              + Add Relationship
            </button>
          </div>

          <div style={styles.row}>
            <button style={styles.button} onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button style={styles.cancelBtn} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div style={styles.detailBody}>
          {ch.description && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Description</h3>
              <p style={styles.sectionText}>{ch.description}</p>
            </div>
          )}

          {ch.backstory && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Backstory</h3>
              <p style={styles.sectionText}>{ch.backstory}</p>
            </div>
          )}

          {ch.tags && ch.tags.length > 0 && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Tags</h3>
              <div style={styles.tagRow}>
                {ch.tags.map((t, i) => (
                  <span key={i} style={styles.tag}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {ch.relationships && ch.relationships.length > 0 && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Relationships</h3>
              <div style={styles.relList}>
                {ch.relationships.map((r, i) => (
                  <div key={i} style={styles.relItem}>
                    <span style={styles.relName}>{r.name}</span>
                    <span style={styles.relType}>{r.relation}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {role === 'dm' && (
            <div style={styles.detailActions}>
              <button style={styles.button} onClick={startEdit}>
                Edit
              </button>
              <button style={styles.deleteBtn} onClick={() => onDelete(ch.id)}>
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Constants & Styles
// ---------------------------------------------------------------------------

const typeColors = {
  pc: 'var(--accent)',
  npc: 'var(--ink-medium)',
  companion: 'var(--success)',
  deity: 'var(--gold)',
};

const statusColors = {
  alive: 'var(--success)',
  dead: 'var(--danger)',
  missing: 'var(--sepia)',
  retired: 'var(--ink-faint)',
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
  cancelBtn: {
    padding: '0.5rem 1rem',
    borderRadius: '2px',
    backgroundColor: 'transparent',
    color: 'var(--ink-light)',
    border: '1px solid var(--border-medium)',
    fontSize: '0.875rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
  },
  deleteBtn: {
    padding: '0.5rem 1rem',
    borderRadius: '2px',
    backgroundColor: 'transparent',
    border: '1px solid var(--danger)',
    color: 'var(--danger)',
    fontSize: '0.875rem',
    cursor: 'pointer',
  },
  searchInput: {
    width: '100%',
    padding: '0.6rem 0.75rem',
    borderRadius: '2px',
    border: '1px solid var(--border-medium)',
    fontSize: '0.875rem',
    outline: 'none',
    marginBottom: '1rem',
    boxSizing: 'border-box',
  },
  createForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    marginBottom: '1rem',
    padding: '1rem',
    borderRadius: '3px',
    border: '1px solid var(--border-light)',
    backgroundColor: 'var(--sidebar-bg)',
  },
  editForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    marginTop: '1rem',
  },
  row: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
  },
  input: {
    padding: '0.5rem 0.75rem',
    borderRadius: '2px',
    border: '1px solid var(--border-medium)',
    fontSize: '0.85rem',
    outline: 'none',
    fontFamily: 'var(--font-body)',
  },
  select: {
    padding: '0.5rem 0.75rem',
    borderRadius: '2px',
    border: '1px solid var(--border-medium)',
    fontSize: '0.85rem',
    outline: 'none',
    backgroundColor: 'var(--card-bg)',
    fontFamily: 'var(--font-body)',
  },
  textarea: {
    padding: '0.5rem 0.75rem',
    borderRadius: '2px',
    border: '1px solid var(--border-medium)',
    fontSize: '0.85rem',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'var(--font-body)',
    lineHeight: 1.5,
  },
  relSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  },
  relLabel: {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: 'var(--ink-medium)',
  },
  addRelBtn: {
    padding: '0.3rem 0.6rem',
    borderRadius: '2px',
    backgroundColor: 'transparent',
    border: '1px dashed var(--ink-faint)',
    color: 'var(--ink-light)',
    fontSize: '0.75rem',
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  removeBtn: {
    padding: '0.3rem 0.5rem',
    borderRadius: '1px',
    backgroundColor: 'transparent',
    border: '1px solid var(--danger)',
    color: 'var(--danger)',
    fontSize: '0.75rem',
    cursor: 'pointer',
    lineHeight: 1,
  },
  muted: {
    color: 'var(--ink-faint)',
    fontSize: '0.9rem',
  },
  empty: {
    textAlign: 'center',
    padding: '3rem 1rem',
    backgroundColor: 'var(--sidebar-bg)',
    borderRadius: '3px',
    border: '1px dashed var(--border-medium)',
    fontStyle: 'italic',
  },
  emptyText: {
    margin: '0 0 0.25rem 0',
    color: 'var(--ink-dark)',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    padding: '0.75rem 1rem',
    borderRadius: '3px',
    border: '1px solid var(--border-light)',
    backgroundColor: 'var(--card-bg)',
    textAlign: 'left',
    cursor: 'pointer',
    width: '100%',
    fontFamily: 'var(--font-body)',
  },
  cardRow: {
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'flex-start',
  },
  thumbnail: {
    width: '48px',
    height: '48px',
    borderRadius: '3px',
    objectFit: 'cover',
    flexShrink: 0,
    border: '1px solid var(--border-medium)',
  },
  cardInfo: {
    flex: 1,
    minWidth: 0,
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.5rem',
  },
  cardName: {
    fontSize: '0.95rem',
    fontWeight: 600,
    color: 'var(--ink-dark)',
  },
  typeBadge: {
    fontSize: '0.65rem',
    fontWeight: 600,
    padding: '0.15rem 0.4rem',
    flexShrink: 0,
    fontVariant: 'small-caps',
    fontFamily: 'var(--font-body)',
  },
  meta: {
    fontSize: '0.8rem',
    color: 'var(--ink-light)',
  },
  metaItem: {
    fontSize: '0.8rem',
    color: 'var(--ink-light)',
  },
  preview: {
    margin: '0.25rem 0 0 0',
    fontSize: '0.8rem',
    color: 'var(--ink-light)',
    lineHeight: 1.4,
  },
  tagRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.3rem',
    marginTop: '0.35rem',
  },
  tag: {
    fontSize: '0.65rem',
    padding: '0.1rem 0.4rem',
    borderRadius: '1px',
    backgroundColor: 'var(--sidebar-bg)',
    color: 'var(--ink-medium)',
    border: '1px solid var(--border-light)',
  },
  // Detail styles
  detailContainer: {
    maxWidth: '720px',
    margin: '0 auto',
    padding: '1.5rem',
  },
  backBtn: {
    padding: '0.4rem 0',
    background: 'none',
    border: 'none',
    color: 'var(--accent)',
    fontSize: '0.85rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
    marginBottom: '1rem',
  },
  detailHeader: {
    display: 'flex',
    gap: '1rem',
    alignItems: 'flex-start',
    marginBottom: '1.5rem',
    paddingBottom: '1rem',
    borderBottom: '1px solid var(--border-light)',
  },
  portrait: {
    width: '80px',
    height: '80px',
    borderRadius: '3px',
    objectFit: 'cover',
    flexShrink: 0,
    border: '1px solid var(--border-medium)',
  },
  detailName: {
    margin: '0 0 0.35rem 0',
    fontSize: '1.35rem',
    color: 'var(--ink-dark)',
    fontFamily: 'var(--font-heading)',
  },
  detailMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.4rem',
    alignItems: 'center',
  },
  statusBadge: {
    fontSize: '0.65rem',
    fontWeight: 600,
    padding: '0.15rem 0.4rem',
    fontVariant: 'small-caps',
    fontStyle: 'italic',
    fontFamily: 'var(--font-body)',
  },
  detailBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  section: {},
  sectionTitle: {
    margin: '0 0 0.35rem 0',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: 'var(--ink-medium)',
    fontVariant: 'small-caps',
    letterSpacing: '0.08em',
    borderBottom: '1px solid var(--accent-rule)',
    paddingBottom: '0.25rem',
    fontFamily: 'var(--font-body)',
  },
  sectionText: {
    margin: 0,
    fontSize: '0.9rem',
    color: 'var(--ink-dark)',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
  },
  relList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  },
  relItem: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
    padding: '0.4rem 0.6rem',
    borderRadius: '2px',
    backgroundColor: 'var(--sidebar-bg)',
    border: '1px solid var(--border-light)',
  },
  relName: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: 'var(--ink-dark)',
  },
  relType: {
    fontSize: '0.8rem',
    color: 'var(--ink-light)',
    fontStyle: 'italic',
  },
  detailActions: {
    display: 'flex',
    gap: '0.5rem',
    paddingTop: '1rem',
    borderTop: '1px solid var(--border-light)',
  },
};
