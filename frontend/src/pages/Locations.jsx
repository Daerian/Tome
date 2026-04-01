/**
 * Locations — Hierarchical world building with locations and sub-locations
 *
 * Create and manage locations in a hierarchy (continent → region → city → building → room).
 * Each location has name, type, description, DM-only notes, public/private/secret visibility,
 * parent location link, image, tags, and relationships. Players see locations based on
 * visibility. DM can create/edit/delete and assign children to parents.
 */

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function Locations({ campaignId, session, role }) {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [form, setForm] = useState({
    name: '',
    type: 'city',
    description: '',
    notes: '',
    tags: '',
    image_url: '',
    parent_location_id: '',
  });
  const [relationships, setRelationships] = useState([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchLocations();
  }, [campaignId]);

  async function fetchLocations() {
    const { data } = await supabase
      .from('locations')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('name');
    if (data) setLocations(data);
    setLoading(false);
  }

  async function createLocation() {
    if (!form.name.trim()) return;
    setCreating(true);

    const tags = form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const rels = relationships.filter(
      (r) => r.name.trim() && r.relation.trim(),
    );

    const insertData = {
      campaign_id: campaignId,
      name: form.name.trim(),
      type: form.type,
      description: form.description.trim() || null,
      notes: form.notes.trim() || null,
      image_url: form.image_url.trim() || null,
      tags,
      relationships: rels,
      visibility: 'public',
    };
    if (form.parent_location_id) {
      insertData.parent_location_id = form.parent_location_id;
    }

    const { data, error } = await supabase
      .from('locations')
      .insert(insertData)
      .select()
      .single();

    if (!error && data) {
      setLocations(
        [...locations, data].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setForm({
        name: '',
        type: 'city',
        description: '',
        notes: '',
        tags: '',
        image_url: '',
        parent_location_id: '',
      });
      setRelationships([]);
      setShowCreate(false);
      setSelectedId(data.id);
    }
    setCreating(false);
  }

  async function updateLocation(id, updates) {
    const { error } = await supabase
      .from('locations')
      .update(updates)
      .eq('id', id);
    if (!error) {
      setLocations((prev) =>
        prev.map((l) => (l.id === id ? { ...l, ...updates } : l)),
      );
    }
    return !error;
  }

  async function deleteLocation(id) {
    if (!window.confirm('Delete this location? This cannot be undone.')) return;
    const { error } = await supabase.from('locations').delete().eq('id', id);
    if (!error) {
      setLocations((prev) => prev.filter((l) => l.id !== id));
      setSelectedId(null);
    }
  }

  // Build parent name map
  const locMap = Object.fromEntries(locations.map((l) => [l.id, l.name]));

  const filtered = locations.filter((l) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      l.name.toLowerCase().includes(q) ||
      (l.description || '').toLowerCase().includes(q) ||
      (l.tags || []).some((t) => t.toLowerCase().includes(q)) ||
      l.type.toLowerCase().includes(q)
    );
  });

  // Detail view
  if (selectedId) {
    const loc = locations.find((l) => l.id === selectedId);
    if (!loc) {
      setSelectedId(null);
      return null;
    }
    return (
      <LocationDetail
        location={loc}
        locMap={locMap}
        allLocations={locations}
        role={role}
        onBack={() => {
          setSelectedId(null);
          fetchLocations();
        }}
        onUpdate={updateLocation}
        onDelete={deleteLocation}
      />
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Locations</h2>
        {role === 'dm' && (
          <button
            style={styles.button}
            onClick={() => setShowCreate(!showCreate)}
          >
            {showCreate ? 'Cancel' : 'Add Location'}
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
              placeholder="Location name *"
              autoFocus
            />
            <select
              style={styles.select}
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              {LOCATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </div>
          {locations.length > 0 && (
            <select
              style={styles.select}
              value={form.parent_location_id}
              onChange={(e) =>
                setForm({ ...form, parent_location_id: e.target.value })
              }
            >
              <option value="">No parent location</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.type})
                </option>
              ))}
            </select>
          )}
          <textarea
            style={styles.textarea}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Description — what this place looks like, who lives here..."
            rows={3}
          />
          {role === 'dm' && (
            <textarea
              style={styles.textarea}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="DM notes (private)"
              rows={2}
            />
          )}
          <input
            style={styles.input}
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
            placeholder="Tags (comma-separated, e.g. safe haven, shop, dungeon)"
          />
          <input
            style={styles.input}
            value={form.image_url}
            onChange={(e) => setForm({ ...form, image_url: e.target.value })}
            placeholder="Image URL (optional)"
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
                  placeholder="Relation (e.g. trade route, border)"
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
            onClick={createLocation}
            disabled={creating || !form.name.trim()}
          >
            {creating ? 'Creating...' : 'Create Location'}
          </button>
        </div>
      )}

      <input
        style={styles.searchInput}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name, description, tag, or type..."
      />

      {loading ? (
        <p style={styles.muted}>Loading locations...</p>
      ) : filtered.length === 0 ? (
        <div style={styles.empty}>
          <p style={styles.emptyText}>
            {search ? 'No locations match your search.' : 'No locations yet.'}
          </p>
          {!search && role === 'dm' && (
            <p style={styles.muted}>
              Add your first location to start building the world.
            </p>
          )}
        </div>
      ) : (
        <div style={styles.list}>
          {filtered.map((loc) => (
            <button
              key={loc.id}
              style={styles.card}
              onClick={() => setSelectedId(loc.id)}
            >
              <div style={styles.cardRow}>
                {loc.image_url && (
                  <img src={loc.image_url} alt="" style={styles.thumbnail} />
                )}
                <div style={styles.cardInfo}>
                  <div style={styles.cardTop}>
                    <span style={styles.cardName}>{loc.name}</span>
                    <span style={styles.typeBadge}>
                      {loc.type.toUpperCase()}
                    </span>
                  </div>
                  {loc.parent_location_id && locMap[loc.parent_location_id] && (
                    <span style={styles.parentMeta}>
                      in {locMap[loc.parent_location_id]}
                    </span>
                  )}
                  {loc.description && (
                    <p style={styles.preview}>
                      {loc.description.length > 100
                        ? loc.description.substring(0, 100) + '...'
                        : loc.description}
                    </p>
                  )}
                  {loc.tags && loc.tags.length > 0 && (
                    <div style={styles.tagRow}>
                      {loc.tags.map((t, i) => (
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
// Location Detail View
// ---------------------------------------------------------------------------

function LocationDetail({
  location,
  locMap,
  allLocations,
  role,
  onBack,
  onUpdate,
  onDelete,
}) {
  const loc = location;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [relForm, setRelForm] = useState([]);
  const [saving, setSaving] = useState(false);

  // Child locations
  const children = allLocations.filter((l) => l.parent_location_id === loc.id);

  function startEdit() {
    setForm({
      description: loc.description || '',
      notes: loc.notes || '',
      tags: (loc.tags || []).join(', '),
      image_url: loc.image_url || '',
      type: loc.type,
      parent_location_id: loc.parent_location_id || '',
    });
    setRelForm(
      loc.relationships && loc.relationships.length > 0
        ? loc.relationships.map((r) => ({ ...r }))
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
    const success = await onUpdate(loc.id, {
      description: form.description.trim() || null,
      notes: form.notes.trim() || null,
      tags,
      relationships: rels,
      image_url: form.image_url.trim() || null,
      type: form.type,
      parent_location_id: form.parent_location_id || null,
    });
    if (success) setEditing(false);
    setSaving(false);
  }

  return (
    <div style={styles.detailContainer}>
      <button style={styles.backBtn} onClick={onBack}>
        &larr; Back to Locations
      </button>

      {loc.image_url && (
        <img src={loc.image_url} alt={loc.name} style={styles.heroImage} />
      )}

      <div style={styles.detailHeader}>
        <div>
          <h2 style={styles.detailName}>{loc.name}</h2>
          <div style={styles.detailMeta}>
            <span style={styles.typeBadge}>{loc.type.toUpperCase()}</span>
            {loc.parent_location_id && locMap[loc.parent_location_id] && (
              <span style={styles.metaItem}>
                in {locMap[loc.parent_location_id]}
              </span>
            )}
          </div>
        </div>
      </div>

      {editing ? (
        <div style={styles.editForm}>
          <div style={styles.row}>
            <select
              style={styles.select}
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              {LOCATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
            <select
              style={{ ...styles.select, flex: 1 }}
              value={form.parent_location_id}
              onChange={(e) =>
                setForm({ ...form, parent_location_id: e.target.value })
              }
            >
              <option value="">No parent location</option>
              {allLocations
                .filter((l) => l.id !== loc.id)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.type})
                  </option>
                ))}
            </select>
          </div>
          <textarea
            style={styles.textarea}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Description"
            rows={4}
          />
          {role === 'dm' && (
            <textarea
              style={styles.textarea}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="DM notes (private)"
              rows={3}
            />
          )}
          <input
            style={styles.input}
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
            placeholder="Tags (comma-separated)"
          />
          <input
            style={styles.input}
            value={form.image_url}
            onChange={(e) => setForm({ ...form, image_url: e.target.value })}
            placeholder="Image URL"
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
          {loc.description && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Description</h3>
              <p style={styles.sectionText}>{loc.description}</p>
            </div>
          )}

          {role === 'dm' && loc.notes && (
            <div style={{ ...styles.section, ...styles.dmNotesBox }}>
              <h3 style={styles.sectionTitle}>DM Notes</h3>
              <p style={styles.sectionText}>{loc.notes}</p>
            </div>
          )}

          {loc.tags && loc.tags.length > 0 && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Tags</h3>
              <div style={styles.tagRow}>
                {loc.tags.map((t, i) => (
                  <span key={i} style={styles.tag}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {loc.relationships && loc.relationships.length > 0 && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Relationships</h3>
              <div style={styles.relList}>
                {loc.relationships.map((r, i) => (
                  <div key={i} style={styles.relItem}>
                    <span style={styles.relName}>{r.name}</span>
                    <span style={styles.relType}>{r.relation}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {children.length > 0 && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Contains</h3>
              <div style={styles.childList}>
                {children.map((c) => (
                  <span key={c.id} style={styles.childChip}>
                    {c.name} ({c.type})
                  </span>
                ))}
              </div>
            </div>
          )}

          {role === 'dm' && (
            <div style={styles.detailActions}>
              <button style={styles.button} onClick={startEdit}>
                Edit
              </button>
              <button style={styles.deleteBtn} onClick={() => onDelete(loc.id)}>
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

const LOCATION_TYPES = [
  'continent',
  'region',
  'city',
  'town',
  'village',
  'dungeon',
  'building',
  'room',
  'wilderness',
  'plane',
];

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
    color: '#1e293b',
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
  cancelBtn: {
    padding: '0.5rem 1rem',
    borderRadius: '8px',
    backgroundColor: 'transparent',
    color: '#64748b',
    border: '1px solid #cbd5e1',
    fontSize: '0.875rem',
    cursor: 'pointer',
  },
  deleteBtn: {
    padding: '0.5rem 1rem',
    borderRadius: '8px',
    backgroundColor: 'transparent',
    border: '1px solid #fca5a5',
    color: '#dc2626',
    fontSize: '0.875rem',
    cursor: 'pointer',
  },
  searchInput: {
    width: '100%',
    padding: '0.6rem 0.75rem',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
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
    borderRadius: '10px',
    border: '1px solid #e2e8f0',
    backgroundColor: '#f8fafc',
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
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '0.85rem',
    outline: 'none',
  },
  select: {
    padding: '0.5rem 0.75rem',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '0.85rem',
    outline: 'none',
    backgroundColor: '#fff',
  },
  textarea: {
    padding: '0.5rem 0.75rem',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '0.85rem',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
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
    color: '#475569',
  },
  addRelBtn: {
    padding: '0.3rem 0.6rem',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    border: '1px dashed #94a3b8',
    color: '#64748b',
    fontSize: '0.75rem',
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  removeBtn: {
    padding: '0.3rem 0.5rem',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    border: '1px solid #fca5a5',
    color: '#dc2626',
    fontSize: '0.75rem',
    cursor: 'pointer',
    lineHeight: 1,
  },
  muted: {
    color: '#94a3b8',
    fontSize: '0.9rem',
  },
  empty: {
    textAlign: 'center',
    padding: '3rem 1rem',
    backgroundColor: '#f8fafc',
    borderRadius: '12px',
    border: '1px dashed #cbd5e1',
  },
  emptyText: {
    margin: '0 0 0.25rem 0',
    color: '#334155',
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
    borderRadius: '10px',
    border: '1px solid #e2e8f0',
    backgroundColor: '#fff',
    textAlign: 'left',
    cursor: 'pointer',
    width: '100%',
    fontFamily: 'inherit',
  },
  cardRow: {
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'flex-start',
  },
  thumbnail: {
    width: '48px',
    height: '48px',
    borderRadius: '8px',
    objectFit: 'cover',
    flexShrink: 0,
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
    color: '#1e293b',
  },
  typeBadge: {
    fontSize: '0.65rem',
    fontWeight: 600,
    padding: '0.15rem 0.4rem',
    borderRadius: '4px',
    backgroundColor: '#e0f2fe',
    color: '#0369a1',
    flexShrink: 0,
  },
  parentMeta: {
    fontSize: '0.75rem',
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  meta: {
    fontSize: '0.8rem',
    color: '#64748b',
  },
  metaItem: {
    fontSize: '0.8rem',
    color: '#64748b',
  },
  preview: {
    margin: '0.25rem 0 0 0',
    fontSize: '0.8rem',
    color: '#64748b',
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
    borderRadius: '4px',
    backgroundColor: '#f1f5f9',
    color: '#475569',
    border: '1px solid #e2e8f0',
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
    color: '#2563eb',
    fontSize: '0.85rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginBottom: '1rem',
  },
  heroImage: {
    width: '100%',
    maxHeight: '200px',
    objectFit: 'cover',
    borderRadius: '10px',
    marginBottom: '1rem',
  },
  detailHeader: {
    marginBottom: '1.5rem',
    paddingBottom: '1rem',
    borderBottom: '1px solid #e2e8f0',
  },
  detailName: {
    margin: '0 0 0.35rem 0',
    fontSize: '1.35rem',
    color: '#1e293b',
  },
  detailMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.4rem',
    alignItems: 'center',
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
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  },
  sectionText: {
    margin: 0,
    fontSize: '0.9rem',
    color: '#334155',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
  },
  dmNotesBox: {
    padding: '0.75rem',
    borderRadius: '8px',
    backgroundColor: '#fefce8',
    border: '1px solid #fef08a',
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
    borderRadius: '6px',
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
  },
  relName: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#1e293b',
  },
  relType: {
    fontSize: '0.8rem',
    color: '#64748b',
    fontStyle: 'italic',
  },
  childList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.35rem',
  },
  childChip: {
    fontSize: '0.8rem',
    padding: '0.25rem 0.5rem',
    borderRadius: '6px',
    backgroundColor: '#e0f2fe',
    color: '#0369a1',
    border: '1px solid #bae6fd',
  },
  detailActions: {
    display: 'flex',
    gap: '0.5rem',
    paddingTop: '1rem',
    borderTop: '1px solid #e2e8f0',
  },
};
