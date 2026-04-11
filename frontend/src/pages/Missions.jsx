/**
 * Missions — Quest/mission tracker with progress bars
 *
 * List and manage campaign missions. Shows completion % based on required objectives.
 * DM can create missions, add stages (ordered quest phases), and objectives (checklist items).
 * Supports mission hierarchy (sub-missions), quest givers, rewards, visibility control,
 * and detailed DM notes. Players see progress and mission descriptions.
 */

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function Missions({ campaignId, session, role }) {
  const [missions, setMissions] = useState([]);
  const [progress, setProgress] = useState({});
  const [characters, setCharacters] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState('all');

  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'side',
    priority: 'medium',
    quest_giver_id: '',
    parent_mission_id: '',
    reward_description: '',
    reward_xp: '',
    reward_gold: '',
    visibility: 'public',
    notes: '',
  });
  const [creating, setCreating] = useState(false);

  async function fetchAll() {
    const [mRes, pRes, cRes, sRes] = await Promise.all([
      supabase
        .from('missions')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false }),
      supabase
        .from('mission_progress')
        .select('*')
        .eq('campaign_id', campaignId),
      supabase
        .from('characters')
        .select('id, name')
        .eq('campaign_id', campaignId)
        .order('name'),
      supabase
        .from('sessions')
        .select('id, session_number, title')
        .eq('campaign_id', campaignId)
        .order('session_number'),
    ]);
    if (mRes.data) setMissions(mRes.data);
    if (pRes.data) {
      const map = {};
      pRes.data.forEach((p) => {
        map[p.mission_id] = p;
      });
      setProgress(map);
    }
    if (cRes.data) setCharacters(cRes.data);
    if (sRes.data) setSessions(sRes.data);
    setLoading(false);
  }

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  async function createMission() {
    if (!form.title.trim()) return;
    setCreating(true);
    const insert = {
      campaign_id: campaignId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      type: form.type,
      priority: form.priority,
      visibility: form.visibility,
      reward_description: form.reward_description.trim() || null,
      reward_xp: form.reward_xp ? parseInt(form.reward_xp) : null,
      reward_gold: form.reward_gold ? parseFloat(form.reward_gold) : null,
      notes: form.notes.trim() || null,
    };
    if (form.quest_giver_id) insert.quest_giver_id = form.quest_giver_id;
    if (form.parent_mission_id)
      insert.parent_mission_id = form.parent_mission_id;

    const { data, error } = await supabase
      .from('missions')
      .insert(insert)
      .select()
      .single();
    if (!error && data) {
      setMissions([data, ...missions]);
      setForm({
        title: '',
        description: '',
        type: 'side',
        priority: 'medium',
        quest_giver_id: '',
        parent_mission_id: '',
        reward_description: '',
        reward_xp: '',
        reward_gold: '',
        visibility: 'public',
        notes: '',
      });
      setShowCreate(false);
      setSelectedId(data.id);
    }
    setCreating(false);
  }

  async function updateMission(id, updates) {
    const { error } = await supabase
      .from('missions')
      .update(updates)
      .eq('id', id);
    if (!error) {
      setMissions((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...updates } : m)),
      );
    }
    return !error;
  }

  async function deleteMission(id) {
    if (!window.confirm('Delete this mission and all its stages/objectives?'))
      return;
    const { error } = await supabase.from('missions').delete().eq('id', id);
    if (!error) {
      setMissions((prev) => prev.filter((m) => m.id !== id));
      setSelectedId(null);
    }
  }

  const filtered = missions.filter((m) => {
    if (filter === 'all') return true;
    if (filter === 'active')
      return m.status === 'active' || m.status === 'available';
    return m.status === filter;
  });

  const selected = missions.find((m) => m.id === selectedId);

  if (loading)
    return (
      <p
        style={{
          textAlign: 'center',
          padding: '2rem',
          color: 'var(--ink-light)',
        }}
      >
        Loading missions...
      </p>
    );

  if (selected)
    return (
      <MissionDetail
        mission={selected}
        progress={progress[selected.id]}
        characters={characters}
        sessions={sessions}
        role={role}
        session={session}
        onBack={() => setSelectedId(null)}
        onUpdate={updateMission}
        onDelete={deleteMission}
        onRefresh={fetchAll}
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
        <h3
          style={{
            margin: 0,
            color: 'var(--ink-dark)',
            fontFamily: 'var(--font-heading)',
          }}
        >
          Missions
        </h3>
        {role === 'dm' && (
          <button style={s.addBtn} onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? 'Cancel' : '+ New Mission'}
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1rem',
          flexWrap: 'wrap',
        }}
      >
        {['all', 'active', 'completed', 'failed', 'abandoned'].map((f) => (
          <button
            key={f}
            style={filter === f ? s.filterActive : s.filter}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Create form */}
      {showCreate && role === 'dm' && (
        <div style={s.createForm}>
          <input
            style={s.input}
            placeholder="Mission title *"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
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
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              <option value="main">Main Quest</option>
              <option value="side">Side Quest</option>
              <option value="personal">Personal</option>
              <option value="faction">Faction</option>
              <option value="bounty">Bounty</option>
            </select>
            <select
              style={s.select}
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select
              style={s.select}
              value={form.visibility}
              onChange={(e) => setForm({ ...form, visibility: e.target.value })}
            >
              <option value="public">Public</option>
              <option value="private">Private (DM)</option>
              <option value="secret">Secret (DM)</option>
            </select>
          </div>
          <select
            style={s.select}
            value={form.quest_giver_id}
            onChange={(e) =>
              setForm({ ...form, quest_giver_id: e.target.value })
            }
          >
            <option value="">Quest Giver (optional)</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            style={s.select}
            value={form.parent_mission_id}
            onChange={(e) =>
              setForm({ ...form, parent_mission_id: e.target.value })
            }
          >
            <option value="">Parent Mission (optional)</option>
            {missions
              .filter((m) => !m.parent_mission_id)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
          </select>
          <input
            style={s.input}
            placeholder="Reward description"
            value={form.reward_description}
            onChange={(e) =>
              setForm({ ...form, reward_description: e.target.value })
            }
          />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              style={s.input}
              placeholder="XP reward"
              type="number"
              value={form.reward_xp}
              onChange={(e) => setForm({ ...form, reward_xp: e.target.value })}
            />
            <input
              style={s.input}
              placeholder="Gold reward"
              type="number"
              value={form.reward_gold}
              onChange={(e) =>
                setForm({ ...form, reward_gold: e.target.value })
              }
            />
          </div>
          {role === 'dm' && (
            <textarea
              style={s.textarea}
              placeholder="DM notes"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          )}
          <button style={s.saveBtn} onClick={createMission} disabled={creating}>
            {creating ? 'Creating...' : 'Create Mission'}
          </button>
        </div>
      )}

      {/* Mission list */}
      {filtered.length === 0 ? (
        <p
          style={{
            color: 'var(--ink-faint)',
            textAlign: 'center',
            padding: '2rem',
          }}
        >
          {filter === 'all' ? 'No missions yet.' : `No ${filter} missions.`}
        </p>
      ) : (
        filtered.map((m) => {
          const p = progress[m.id];
          const pct = p ? p.completion_pct : null;
          return (
            <div key={m.id} style={s.card} onClick={() => setSelectedId(m.id)}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ fontWeight: 600, color: 'var(--ink-dark)' }}>
                      {m.title}
                    </span>
                    <span
                      style={{
                        ...s.typeBadge,
                        color: typeColors[m.type]?.text || 'var(--ink-medium)',
                      }}
                    >
                      {m.type}
                    </span>
                    <span
                      style={{
                        ...s.statusBadge,
                        color:
                          statusColors[m.status]?.text || 'var(--ink-medium)',
                      }}
                    >
                      {m.status}
                    </span>
                    {m.priority === 'critical' && (
                      <span
                        style={{
                          ...s.typeBadge,
                          backgroundColor: 'var(--danger-bg)',
                          color: 'var(--danger)',
                        }}
                      >
                        CRITICAL
                      </span>
                    )}
                  </div>
                  {m.description && (
                    <p
                      style={{
                        margin: '0.25rem 0 0',
                        fontSize: '0.8rem',
                        color: 'var(--ink-light)',
                        lineHeight: 1.4,
                      }}
                    >
                      {m.description.slice(0, 120)}
                      {m.description.length > 120 ? '...' : ''}
                    </p>
                  )}
                </div>
              </div>
              {/* Progress bar */}
              {pct !== null &&
                (m.status === 'active' || m.status === 'available') && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.7rem',
                        color: 'var(--ink-light)',
                        marginBottom: '0.2rem',
                      }}
                    >
                      <span>
                        {p.completed_required}/{p.required_objectives}{' '}
                        objectives
                      </span>
                      <span>{pct}%</span>
                    </div>
                    <div style={s.progressBg}>
                      <div
                        style={{
                          ...s.progressFill,
                          width: `${pct}%`,
                          backgroundColor:
                            pct === 100 ? 'var(--success)' : 'var(--accent)',
                        }}
                      />
                    </div>
                  </div>
                )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ─── Mission Detail View ────────────────────────────────────────────────────

function MissionDetail({
  mission,
  progress: prog,
  characters,
  role,
  onBack,
  onUpdate,
  onDelete,
  onRefresh,
}) {
  const [stages, setStages] = useState([]);
  const [objectives, setObjectives] = useState({});
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [showAddStage, setShowAddStage] = useState(false);
  const [stageForm, setStageForm] = useState({ title: '', description: '' });

  async function fetchStages() {
    const { data } = await supabase
      .from('mission_stages')
      .select('*')
      .eq('mission_id', mission.id)
      .order('sort_order');
    if (data) {
      setStages(data);
      // Fetch objectives for all stages
      const ids = data.map((s) => s.id);
      if (ids.length > 0) {
        const { data: objs } = await supabase
          .from('mission_objectives')
          .select('*')
          .in('stage_id', ids)
          .order('sort_order');
        if (objs) {
          const map = {};
          objs.forEach((o) => {
            if (!map[o.stage_id]) map[o.stage_id] = [];
            map[o.stage_id].push(o);
          });
          setObjectives(map);
        }
      }
    }
  }

  useEffect(() => {
    fetchStages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mission.id]);

  async function addStage() {
    if (!stageForm.title.trim()) return;
    const { data, error } = await supabase
      .from('mission_stages')
      .insert({
        mission_id: mission.id,
        title: stageForm.title.trim(),
        description: stageForm.description.trim() || null,
        sort_order: stages.length + 1,
        status: stages.length === 0 ? 'active' : 'locked',
      })
      .select()
      .single();
    if (!error && data) {
      setStages([...stages, data]);
      setStageForm({ title: '', description: '' });
      setShowAddStage(false);
    }
  }

  async function updateStageStatus(stageId, status) {
    const { error } = await supabase
      .from('mission_stages')
      .update({ status })
      .eq('id', stageId);
    if (!error) {
      setStages((prev) =>
        prev.map((s) => (s.id === stageId ? { ...s, status } : s)),
      );
      onRefresh();
    }
  }

  async function addObjective(stageId) {
    const desc = window.prompt('Objective description:');
    if (!desc?.trim()) return;
    const existing = objectives[stageId] || [];
    const { data, error } = await supabase
      .from('mission_objectives')
      .insert({
        stage_id: stageId,
        description: desc.trim(),
        sort_order: existing.length + 1,
      })
      .select()
      .single();
    if (!error && data) {
      setObjectives((prev) => ({
        ...prev,
        [stageId]: [...(prev[stageId] || []), data],
      }));
    }
  }

  async function toggleObjective(obj) {
    const { error } = await supabase
      .from('mission_objectives')
      .update({ is_completed: !obj.is_completed })
      .eq('id', obj.id);
    if (!error) {
      setObjectives((prev) => ({
        ...prev,
        [obj.stage_id]: (prev[obj.stage_id] || []).map((o) =>
          o.id === obj.id ? { ...o, is_completed: !o.is_completed } : o,
        ),
      }));
      onRefresh();
    }
  }

  async function deleteStage(stageId) {
    if (!window.confirm('Delete this stage and its objectives?')) return;
    const { error } = await supabase
      .from('mission_stages')
      .delete()
      .eq('id', stageId);
    if (!error) {
      setStages((prev) => prev.filter((s) => s.id !== stageId));
      setObjectives((prev) => {
        const copy = { ...prev };
        delete copy[stageId];
        return copy;
      });
      onRefresh();
    }
  }

  function startEdit() {
    setEditForm({
      title: mission.title,
      description: mission.description || '',
      type: mission.type,
      status: mission.status,
      priority: mission.priority,
      visibility: mission.visibility,
      reward_description: mission.reward_description || '',
      reward_xp: mission.reward_xp || '',
      reward_gold: mission.reward_gold || '',
      notes: mission.notes || '',
    });
    setEditing(true);
  }

  async function saveEdit() {
    const updates = {
      title: editForm.title.trim(),
      description: editForm.description.trim() || null,
      type: editForm.type,
      status: editForm.status,
      priority: editForm.priority,
      visibility: editForm.visibility,
      reward_description: editForm.reward_description.trim() || null,
      reward_xp: editForm.reward_xp ? parseInt(editForm.reward_xp) : null,
      reward_gold: editForm.reward_gold
        ? parseFloat(editForm.reward_gold)
        : null,
      notes: editForm.notes.trim() || null,
    };
    const ok = await onUpdate(mission.id, updates);
    if (ok) {
      setEditing(false);
      onRefresh();
    }
  }

  const questGiver = characters.find((c) => c.id === mission.quest_giver_id);
  const pct = prog ? prog.completion_pct : null;

  return (
    <div style={{ padding: '1rem' }}>
      <button style={s.backBtn} onClick={onBack}>
        &larr; All Missions
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
              <h3
                style={{
                  margin: 0,
                  color: 'var(--ink-dark)',
                  fontFamily: 'var(--font-heading)',
                }}
              >
                {mission.title}
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
                    ...s.typeBadge,
                    color: typeColors[mission.type]?.text,
                  }}
                >
                  {mission.type}
                </span>
                <span
                  style={{
                    ...s.statusBadge,
                    color: statusColors[mission.status]?.text,
                  }}
                >
                  {mission.status}
                </span>
                <span
                  style={{
                    ...s.typeBadge,
                    backgroundColor: 'var(--sidebar-bg)',
                    color: 'var(--ink-light)',
                  }}
                >
                  {mission.priority} priority
                </span>
              </div>
            </div>
            {role === 'dm' && (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button style={s.editBtn} onClick={startEdit}>
                  Edit
                </button>
                <button style={s.delBtn} onClick={() => onDelete(mission.id)}>
                  Delete
                </button>
              </div>
            )}
          </div>

          {/* Progress bar */}
          {pct !== null && (
            <div style={{ marginTop: '1rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.75rem',
                  color: 'var(--ink-light)',
                  marginBottom: '0.25rem',
                }}
              >
                <span>Overall Progress</span>
                <span>{pct}%</span>
              </div>
              <div style={s.progressBg}>
                <div
                  style={{
                    ...s.progressFill,
                    width: `${pct}%`,
                    backgroundColor:
                      pct === 100 ? 'var(--success)' : 'var(--accent)',
                  }}
                />
              </div>
            </div>
          )}

          {mission.description && (
            <p
              style={{
                color: 'var(--ink-dark)',
                fontSize: '0.875rem',
                lineHeight: 1.6,
                marginTop: '1rem',
              }}
            >
              {mission.description}
            </p>
          )}

          {questGiver && (
            <p
              style={{
                fontSize: '0.8rem',
                color: 'var(--ink-light)',
                marginTop: '0.5rem',
              }}
            >
              Quest Giver:{' '}
              <strong style={{ color: 'var(--ink-dark)' }}>
                {questGiver.name}
              </strong>
            </p>
          )}

          {/* Rewards */}
          {(mission.reward_description ||
            mission.reward_xp ||
            mission.reward_gold) && (
            <div
              style={{
                marginTop: '0.75rem',
                padding: '0.75rem',
                backgroundColor: 'var(--card-bg)',
                borderRadius: '2px',
                border: '1px solid var(--gold)',
              }}
            >
              <strong style={{ fontSize: '0.8rem', color: 'var(--gold)' }}>
                Rewards
              </strong>
              {mission.reward_description && (
                <p
                  style={{
                    margin: '0.25rem 0 0',
                    fontSize: '0.8rem',
                    color: 'var(--gold)',
                  }}
                >
                  {mission.reward_description}
                </p>
              )}
              <div
                style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem' }}
              >
                {mission.reward_xp && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--gold)' }}>
                    {mission.reward_xp} XP
                  </span>
                )}
                {mission.reward_gold && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--gold)' }}>
                    {mission.reward_gold} GP
                  </span>
                )}
              </div>
            </div>
          )}

          {role === 'dm' && mission.notes && (
            <div
              style={{
                marginTop: '0.75rem',
                padding: '0.75rem',
                backgroundColor: 'var(--card-bg)',
                borderRadius: '3px',
                border: '1px solid var(--danger)',
              }}
            >
              <strong style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>
                DM Notes
              </strong>
              <p
                style={{
                  margin: '0.25rem 0 0',
                  fontSize: '0.8rem',
                  color: 'var(--danger)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {mission.notes}
              </p>
            </div>
          )}
        </>
      ) : (
        <div style={{ ...s.createForm, marginTop: '0.75rem' }}>
          <input
            style={s.input}
            value={editForm.title}
            onChange={(e) =>
              setEditForm({ ...editForm, title: e.target.value })
            }
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
              value={editForm.type}
              onChange={(e) =>
                setEditForm({ ...editForm, type: e.target.value })
              }
            >
              <option value="main">Main Quest</option>
              <option value="side">Side Quest</option>
              <option value="personal">Personal</option>
              <option value="faction">Faction</option>
              <option value="bounty">Bounty</option>
            </select>
            <select
              style={s.select}
              value={editForm.status}
              onChange={(e) =>
                setEditForm({ ...editForm, status: e.target.value })
              }
            >
              <option value="available">Available</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="abandoned">Abandoned</option>
            </select>
            <select
              style={s.select}
              value={editForm.priority}
              onChange={(e) =>
                setEditForm({ ...editForm, priority: e.target.value })
              }
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select
              style={s.select}
              value={editForm.visibility}
              onChange={(e) =>
                setEditForm({ ...editForm, visibility: e.target.value })
              }
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
              <option value="secret">Secret</option>
            </select>
          </div>
          <input
            style={s.input}
            placeholder="Reward description"
            value={editForm.reward_description}
            onChange={(e) =>
              setEditForm({ ...editForm, reward_description: e.target.value })
            }
          />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              style={s.input}
              placeholder="XP"
              type="number"
              value={editForm.reward_xp}
              onChange={(e) =>
                setEditForm({ ...editForm, reward_xp: e.target.value })
              }
            />
            <input
              style={s.input}
              placeholder="Gold"
              type="number"
              value={editForm.reward_gold}
              onChange={(e) =>
                setEditForm({ ...editForm, reward_gold: e.target.value })
              }
            />
          </div>
          <textarea
            style={s.textarea}
            placeholder="DM notes"
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

      {/* Stages */}
      <div style={{ marginTop: '1.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.75rem',
          }}
        >
          <h4 style={{ margin: 0, color: 'var(--ink-dark)' }}>Stages</h4>
          {role === 'dm' && (
            <button
              style={s.addBtn}
              onClick={() => setShowAddStage(!showAddStage)}
            >
              {showAddStage ? 'Cancel' : '+ Stage'}
            </button>
          )}
        </div>

        {showAddStage && role === 'dm' && (
          <div style={{ ...s.createForm, marginBottom: '0.75rem' }}>
            <input
              style={s.input}
              placeholder="Stage title *"
              value={stageForm.title}
              onChange={(e) =>
                setStageForm({ ...stageForm, title: e.target.value })
              }
            />
            <textarea
              style={s.textarea}
              placeholder="Description"
              rows={2}
              value={stageForm.description}
              onChange={(e) =>
                setStageForm({ ...stageForm, description: e.target.value })
              }
            />
            <button style={s.saveBtn} onClick={addStage}>
              Add Stage
            </button>
          </div>
        )}

        {stages.length === 0 ? (
          <p
            style={{
              color: 'var(--ink-faint)',
              fontSize: '0.85rem',
              fontStyle: 'italic',
            }}
          >
            No stages yet.
          </p>
        ) : (
          stages.map((stage, idx) => {
            const stageObjs = objectives[stage.id] || [];
            return (
              <div
                key={stage.id}
                style={{
                  ...s.stageCard,
                  borderLeft: `3px solid ${stageStatusColor(stage.status)}`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        color: 'var(--ink-dark)',
                      }}
                    >
                      Stage {idx + 1}: {stage.title}
                    </span>
                    <span
                      style={{
                        ...s.statusBadge,
                        marginLeft: '0.5rem',
                        color: statusColors[stage.status]?.text,
                        fontSize: '0.65rem',
                      }}
                    >
                      {stage.status}
                    </span>
                  </div>
                  {role === 'dm' && (
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <select
                        style={{
                          ...s.select,
                          fontSize: '0.7rem',
                          padding: '0.15rem 0.3rem',
                        }}
                        value={stage.status}
                        onChange={(e) =>
                          updateStageStatus(stage.id, e.target.value)
                        }
                      >
                        <option value="locked">Locked</option>
                        <option value="active">Active</option>
                        <option value="completed">Completed</option>
                        <option value="failed">Failed</option>
                        <option value="skipped">Skipped</option>
                      </select>
                      <button
                        style={{
                          ...s.delBtn,
                          fontSize: '0.65rem',
                          padding: '0.15rem 0.4rem',
                        }}
                        onClick={() => deleteStage(stage.id)}
                      >
                        x
                      </button>
                    </div>
                  )}
                </div>
                {stage.description && (
                  <p
                    style={{
                      margin: '0.25rem 0 0.5rem',
                      fontSize: '0.8rem',
                      color: 'var(--ink-light)',
                    }}
                  >
                    {stage.description}
                  </p>
                )}

                {/* Objectives */}
                {stageObjs.map((obj) => (
                  <div
                    key={obj.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.2rem 0',
                      fontSize: '0.8rem',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={obj.is_completed}
                      onChange={() => toggleObjective(obj)}
                      disabled={role !== 'dm'}
                      style={{ cursor: role === 'dm' ? 'pointer' : 'default' }}
                    />
                    <span
                      style={{
                        color: obj.is_completed
                          ? 'var(--ink-faint)'
                          : 'var(--ink-dark)',
                        textDecoration: obj.is_completed
                          ? 'line-through'
                          : 'none',
                      }}
                    >
                      {obj.description}
                      {obj.is_optional && (
                        <span
                          style={{
                            color: 'var(--ink-faint)',
                            fontSize: '0.7rem',
                          }}
                        >
                          {' '}
                          (optional)
                        </span>
                      )}
                    </span>
                  </div>
                ))}
                {role === 'dm' && (
                  <button
                    style={{
                      ...s.addBtn,
                      fontSize: '0.7rem',
                      marginTop: '0.3rem',
                    }}
                    onClick={() => addObjective(stage.id)}
                  >
                    + Objective
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const typeColors = {
  main: { text: 'var(--accent-deep)' },
  side: { text: 'var(--accent)' },
  personal: { text: 'var(--sepia)' },
  faction: { text: 'var(--success)' },
  bounty: { text: 'var(--gold)' },
};

const statusColors = {
  available: { text: 'var(--accent)' },
  active: { text: 'var(--success)' },
  completed: { text: 'var(--success)' },
  failed: { text: 'var(--danger)' },
  abandoned: { text: 'var(--ink-light)' },
  locked: { text: 'var(--ink-faint)' },
  skipped: { text: 'var(--sepia)' },
};

function stageStatusColor(status) {
  const map = {
    locked: 'var(--border-medium)',
    active: 'var(--accent)',
    completed: 'var(--success)',
    failed: 'var(--danger)',
    skipped: 'var(--sepia)',
  };
  return map[status] || 'var(--border-medium)';
}

// ─── Styles ─────────────────────────────────────────────────────────────────

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
    transition: 'border-color 0.15s',
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
  filter: {
    padding: '0.3rem 0.6rem',
    borderRadius: '2px',
    backgroundColor: 'var(--sidebar-bg)',
    border: '1px solid var(--border-light)',
    color: 'var(--ink-light)',
    fontSize: '0.75rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
    fontVariant: 'small-caps',
  },
  filterActive: {
    padding: '0.3rem 0.6rem',
    borderRadius: '2px',
    backgroundColor: 'var(--accent)',
    border: '1px solid var(--accent)',
    color: '#fff',
    fontSize: '0.75rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
    fontVariant: 'small-caps',
  },
  typeBadge: {
    fontSize: '0.65rem',
    fontWeight: 600,
    fontVariant: 'small-caps',
    fontFamily: 'var(--font-body)',
  },
  statusBadge: {
    fontSize: '0.65rem',
    fontWeight: 600,
    fontVariant: 'small-caps',
    fontStyle: 'italic',
    fontFamily: 'var(--font-body)',
  },
  progressBg: {
    height: '6px',
    backgroundColor: 'var(--border-light)',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: '3px',
    transition: 'width 0.3s ease',
  },
  stageCard: {
    padding: '0.75rem',
    backgroundColor: 'var(--card-bg)',
    border: '1px solid var(--border-light)',
    borderRadius: '3px',
    marginBottom: '0.5rem',
  },
};
