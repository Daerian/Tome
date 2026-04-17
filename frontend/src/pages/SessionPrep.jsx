/**
 * The Scriptorium — DM session planning and encounter drafting
 *
 * A library of possible encounters for the DM to compile their session from:
 *   I.   Chronicle       — AI-generated story summary (from prep_brief)
 *   II.  Threads         — Select missions / story beats for this session
 *   III. Register        — Set tone and encounter mix counts
 *   IV.  The Stacks      — Browse 5 drafted candidates per encounter type,
 *                          select the ones to use, rewrite any individually
 *   V.   Appendices      — NPC highlights and loot suggestions
 *
 * Persists configuration and selections to sessions.prep_config.
 */

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const API_URL = import.meta.env.VITE_API_URL;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TYPE_META = {
  rp:     { label: 'Roleplay',          color: 'var(--accent)',  mixKey: 'rp' },
  combat: { label: 'Combat',            color: '#c0392b',        mixKey: 'combat' },
  puzzle: { label: 'Puzzle',            color: 'var(--sepia)',   mixKey: 'puzzles' },
};

const DIFFICULTY_OPTIONS = ['easy', 'medium', 'hard', 'deadly'];
const LOOT_CATEGORIES    = ['gold', 'item', 'gem', 'art', 'magic_item', 'other'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SessionPrep({
  sessionId,
  campaignId,
  session,
  role,
  onBack,
  onViewSession,
}) {
  // Session + campaign data
  const [sessionData, setSessionData] = useState(null);
  const [sessionTitle, setSessionTitle] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [loading, setLoading] = useState(true);
  const [missions, setMissions] = useState([]);
  const [storyBeats, setStoryBeats] = useState([]);

  // Session direction (Section II)
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null); // null | number | 'custom'
  const [customDirection, setCustomDirection] = useState('');
  const [fetchingRoutes, setFetchingRoutes] = useState(false);

  // Planning inputs (Section IV)
  const [encounterTone, setEncounterTone] = useState({ rp: 'moderate', combat: 'moderate', puzzle: 'moderate' });
  const [encounterMix, setEncounterMix] = useState({ rp: 2, combat: 2, puzzles: 1 });
  const [selectedObjectives, setSelectedObjectives] = useState([]);

  // The Stacks — candidates + selections
  const [candidates, setCandidates] = useState(null);
  // selections: { rp: Set<number>, combat: Set<number>, puzzle: Set<number> }
  const [selections, setSelections] = useState({ rp: new Set(), combat: new Set(), puzzle: new Set() });

  // Per-card edit / rewrite state (keyed by "type-index")
  const [editOpen,    setEditOpen]    = useState({});
  const [rewriteOpen, setRewriteOpen] = useState({});
  const [rewriteHint, setRewriteHint] = useState({});
  const [rewriting,   setRewriting]   = useState({});

  // NPC + loot appendices
  const [npcHighlights,   setNpcHighlights]   = useState([]);
  const [lootSuggestions, setLootSuggestions] = useState([]);

  // Loot editing
  const [lootEditOpen, setLootEditOpen] = useState({});

  // Generation + save state
  const [drafting,     setDrafting]     = useState(false);
  const [draftError,   setDraftError]   = useState('');
  const [saving,       setSaving]       = useState(false);
  const [loadingBrief, setLoadingBrief] = useState(false);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function fetchData() {
    const [sessionRes, missionsRes, beatsRes] = await Promise.all([
      supabase.from('sessions').select('*').eq('id', sessionId).single(),
      supabase
        .from('missions')
        .select('id, title, description, type, status, priority')
        .eq('campaign_id', campaignId)
        .in('status', ['available', 'active'])
        .order('priority'),
      supabase
        .from('story_beats')
        .select('id, title, description, type, status')
        .eq('campaign_id', campaignId)
        .in('status', ['planted', 'active'])
        .order('sort_order'),
    ]);

    if (sessionRes.data) {
      setSessionData(sessionRes.data);
      setSessionTitle(sessionRes.data.title || '');
      const saved = sessionRes.data.prep_config;
      if (saved) {
        if (saved.encounter_tone) {
          setEncounterTone(saved.encounter_tone);
        } else if (saved.tone) {
          // Backwards-compat: single global tone → apply to all types
          setEncounterTone({ rp: saved.tone, combat: saved.tone, puzzle: saved.tone });
        }
        if (saved.encounter_mix)       setEncounterMix(saved.encounter_mix);
        if (saved.selected_objectives) setSelectedObjectives(saved.selected_objectives);
        if (saved.candidates) {
          setCandidates(saved.candidates);
          setSelections({
            rp:     new Set(saved.rp_selected     || []),
            combat: new Set(saved.combat_selected || []),
            puzzle: new Set(saved.puzzle_selected || []),
          });
        }
        if (saved.npc_highlights)   setNpcHighlights(saved.npc_highlights);
        if (saved.loot_suggestions) setLootSuggestions(saved.loot_suggestions);
        if (saved.routes)           setRoutes(saved.routes);
        if (saved.selected_route !== undefined && saved.selected_route !== null)
          setSelectedRoute(saved.selected_route);
        if (saved.custom_direction) setCustomDirection(saved.custom_direction);
      }
      // Auto-suggest routes for fresh sessions (none saved yet)
      if (!saved?.routes?.length) {
        fetchRoutes();
      }
    }
    if (missionsRes.data) setMissions(missionsRes.data);
    if (beatsRes.data)    setStoryBeats(beatsRes.data);
    setLoading(false);
  }

  // ---------------------------------------------------------------------------
  // Session title editing
  // ---------------------------------------------------------------------------

  async function saveSessionTitle() {
    const trimmed = sessionTitle.trim();
    if (!trimmed || trimmed === sessionData?.title) {
      setEditingTitle(false);
      return;
    }
    await supabase.from('sessions').update({ title: trimmed }).eq('id', sessionId);
    setSessionData((prev) => ({ ...prev, title: trimmed }));
    setEditingTitle(false);
  }

  // ---------------------------------------------------------------------------
  // Route suggestions
  // ---------------------------------------------------------------------------

  async function fetchRoutes() {
    setFetchingRoutes(true);
    try {
      const res = await fetch(`${API_URL}/api/session-routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, campaign_id: campaignId }),
      });
      const data = await res.json();
      if (data.routes?.length) {
        setRoutes(data.routes);
        setSelectedRoute(null);
      }
    } catch { /* silently fail */ }
    setFetchingRoutes(false);
  }

  function getSessionDirection() {
    if (selectedRoute === 'custom') return customDirection.trim() || null;
    if (typeof selectedRoute === 'number' && routes[selectedRoute])
      return routes[selectedRoute].description;
    return null;
  }

  // ---------------------------------------------------------------------------
  // Chronicle (story so far)
  // ---------------------------------------------------------------------------

  async function generateBrief() {
    if (!sessionData) return;
    setLoadingBrief(true);
    try {
      const res = await fetch(`${API_URL}/api/session-prep`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          campaign_id: campaignId,
          dm_prep_notes: sessionData.dm_notes || null,
        }),
      });
      const data = await res.json();
      if (data.prep) setSessionData((prev) => ({ ...prev, prep_brief: data.prep }));
    } catch { /* silently fail */ }
    setLoadingBrief(false);
  }

  // ---------------------------------------------------------------------------
  // Objective selection
  // ---------------------------------------------------------------------------

  function toggleObjective(id, type, title) {
    setSelectedObjectives((prev) => {
      const exists = prev.find((o) => o.id === id);
      return exists ? prev.filter((o) => o.id !== id) : [...prev, { id, type, title }];
    });
  }

  function isObjSelected(id) {
    return selectedObjectives.some((o) => o.id === id);
  }

  // ---------------------------------------------------------------------------
  // Draft all candidates
  // ---------------------------------------------------------------------------

  async function draftEncounters() {
    setDrafting(true);
    setDraftError('');
    try {
      const res = await fetch(`${API_URL}/api/session-prep-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          campaign_id: campaignId,
          encounter_tone: encounterTone,
          encounter_mix: encounterMix,
          selected_objectives: selectedObjectives,
          session_direction: getSessionDirection(),
        }),
      });
      const data = await res.json();
      if (data.plan) {
        setCandidates(data.plan.candidates);
        setNpcHighlights(data.plan.npc_highlights || []);
        setLootSuggestions(data.plan.loot_suggestions || []);
        // Reset all selections for the new batch
        setSelections({ rp: new Set(), combat: new Set(), puzzle: new Set() });
        setEditOpen({});
        setRewriteOpen({});
        setRewriteHint({});
      } else {
        setDraftError('Drafting failed. Please try again.');
      }
    } catch {
      setDraftError('Could not reach the server. Please try again.');
    }
    setDrafting(false);
  }

  // ---------------------------------------------------------------------------
  // Card selection
  // ---------------------------------------------------------------------------

  function toggleSelection(type, index) {
    setSelections((prev) => {
      const next = new Set(prev[type]);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return { ...prev, [type]: next };
    });
  }

  // ---------------------------------------------------------------------------
  // In-place candidate editing
  // ---------------------------------------------------------------------------

  function updateCandidate(type, index, field, value) {
    setCandidates((prev) => {
      const list = [...prev[type]];
      list[index] = { ...list[index], [field]: value };
      return { ...prev, [type]: list };
    });
  }

  // ---------------------------------------------------------------------------
  // Single-card rewrite
  // ---------------------------------------------------------------------------

  async function rewriteCard(type, index) {
    const key = `${type}-${index}`;
    setRewriting((prev) => ({ ...prev, [key]: true }));

    const existingTitles = (candidates?.[type] || [])
      .filter((_, i) => i !== index)
      .map((e) => e.title);

    try {
      const res = await fetch(`${API_URL}/api/session-prep-encounter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          campaign_id: campaignId,
          type,
          encounter_tone: encounterTone,
          selected_objectives: selectedObjectives,
          hint: rewriteHint[key] || null,
          existing_titles: existingTitles,
          session_direction: getSessionDirection(),
        }),
      });
      const data = await res.json();
      if (data.encounter) {
        setCandidates((prev) => {
          const list = [...prev[type]];
          list[index] = data.encounter;
          return { ...prev, [type]: list };
        });
        // Clear the rewrite panel after success
        setRewriteOpen((prev) => ({ ...prev, [key]: false }));
        setRewriteHint((prev) => ({ ...prev, [key]: '' }));
      }
    } catch { /* silently fail */ }

    setRewriting((prev) => ({ ...prev, [key]: false }));
  }

  // ---------------------------------------------------------------------------
  // Loot editing
  // ---------------------------------------------------------------------------

  function updateLoot(index, field, value) {
    setLootSuggestions((prev) => {
      const list = [...prev];
      list[index] = { ...list[index], [field]: value };
      return list;
    });
  }

  function removeLoot(index) {
    setLootSuggestions((prev) => prev.filter((_, i) => i !== index));
  }

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  async function savePlan() {
    setSaving(true);

    const prep_config = {
      encounter_tone: encounterTone,
      encounter_mix: encounterMix,
      selected_objectives: selectedObjectives,
      routes,
      selected_route: selectedRoute,
      custom_direction: customDirection,
      candidates: candidates || { rp: [], combat: [], puzzle: [] },
      rp_selected:     [...selections.rp],
      combat_selected: [...selections.combat],
      puzzle_selected: [...selections.puzzle],
      npc_highlights:   npcHighlights,
      loot_suggestions: lootSuggestions,
    };

    await supabase
      .from('sessions')
      .update({ prep_config })
      .eq('id', sessionId);

    // Replace any previous Scriptorium loot for this session with the current list
    await Promise.all([
      supabase
        .from('session_loot')
        .delete()
        .eq('session_id', sessionId)
        .eq('scriptorium_loot', true),
      supabase
        .from('treasury_items')
        .delete()
        .eq('source_session_id', sessionId)
        .eq('scriptorium_loot', true),
    ]);

    if (lootSuggestions.length > 0) {
      const categoryToItemType = {
        magic_item: 'wondrous', gold: 'other', gem: 'other',
        art: 'other', item: 'other', other: 'other',
      };
      await Promise.all([
        supabase.from('session_loot').insert(
          lootSuggestions.map((l) => ({
            campaign_id: campaignId,
            session_id: sessionId,
            name: l.name,
            quantity: 1,
            category: l.category,
            description: l.description || null,
            logged_by: session.user.id,
            player_visible: false,
            scriptorium_loot: true,
          })),
        ),
        supabase.from('treasury_items').insert(
          lootSuggestions.map((l) => ({
            campaign_id: campaignId,
            name: l.name,
            description: l.description || null,
            rarity: l.category === 'magic_item' ? 'uncommon' : 'common',
            item_type: categoryToItemType[l.category] || 'other',
            requires_attunement: false,
            is_cursed: false,
            added_by: session.user.id,
            source_session_id: sessionId,
            notes: l.source ? `From: ${l.source}` : null,
            player_visible: false,
            scriptorium_loot: true,
          })),
        ),
      ]);
    }

    // Build prep items from selected encounters + NPC highlights
    const scriptoriumItems = [];

    // NPC highlights → character items
    const seenNames = new Set();
    for (const npc of npcHighlights) {
      if (!seenNames.has(npc.name)) {
        seenNames.add(npc.name);
        scriptoriumItems.push({ type: 'character', name: npc.name, description: npc.role || null, stats: null, from_scriptorium: true });
      }
    }

    // Selected encounters → location + monster items; selected rp/puzzle → extra npcs
    for (const encType of ['rp', 'combat', 'puzzle']) {
      for (const idx of selections[encType]) {
        const enc = candidates?.[encType]?.[idx];
        if (!enc) continue;

        // Location
        if (enc.location) {
          const locKey = enc.location.toLowerCase();
          if (!seenNames.has(locKey)) {
            seenNames.add(locKey);
            scriptoriumItems.push({ type: 'location', name: enc.location, description: enc.title, stats: null, from_scriptorium: true });
          }
        }

        // Monsters (combat only)
        if (encType === 'combat' && enc.enemies) {
          const monsterKey = `monster:${enc.enemies}`;
          if (!seenNames.has(monsterKey)) {
            seenNames.add(monsterKey);
            const statsStr = enc.difficulty ? `Difficulty: ${enc.difficulty}` : null;
            scriptoriumItems.push({ type: 'monster', name: enc.enemies, description: enc.title, stats: statsStr, from_scriptorium: true });
          }
        }

        // NPCs from rp/puzzle encounters not already in highlights
        if ((encType === 'rp' || encType === 'puzzle') && Array.isArray(enc.npcs_involved)) {
          for (const npcName of enc.npcs_involved) {
            if (!seenNames.has(npcName)) {
              seenNames.add(npcName);
              scriptoriumItems.push({ type: 'character', name: npcName, description: enc.title, stats: null, from_scriptorium: true });
            }
          }
        }
      }
    }

    // Merge: keep manually-added items, replace scriptorium items
    const existingManual = (sessionData?.prep_items || []).filter((it) => !it.from_scriptorium);
    const mergedItems = [...scriptoriumItems, ...existingManual];

    await supabase
      .from('sessions')
      .update({ prep_items: mergedItems })
      .eq('id', sessionId);

    setSaving(false);
    onViewSession?.();
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function renderCandidateGroup(type) {
    const list = candidates?.[type] || [];
    if (list.length === 0) return null;

    const meta        = TYPE_META[type];
    const need        = encounterMix[meta.mixKey] ?? 0;
    const chosen      = selections[type]?.size ?? 0;
    const overLimit   = chosen > need;
    const countColor  = overLimit ? '#c0392b' : chosen === need ? 'var(--success)' : 'var(--ink-faint)';

    return (
      <div key={type} style={styles.candidateGroup}>
        {/* Group header */}
        <div style={styles.groupHeader}>
          <span style={{ ...styles.groupTitle, color: meta.color }}>
            {meta.label}
          </span>
          <span style={{ ...styles.groupCount, color: countColor }}>
            {chosen} / {need} selected
          </span>
        </div>

        <div style={styles.candidateList}>
          {list.map((enc, index) => renderCandidateCard(type, enc, index))}
        </div>
      </div>
    );
  }

  function renderCandidateCard(type, enc, index) {
    const key       = `${type}-${index}`;
    const isChosen  = selections[type]?.has(index);
    const meta      = TYPE_META[type];
    const isRewrit  = rewriting[key];
    const editShown = editOpen[key];
    const rwShown   = rewriteOpen[key];

    const npcsStr = Array.isArray(enc.npcs_involved)
      ? enc.npcs_involved.join(', ')
      : enc.npcs_involved || '';

    return (
      <div
        key={index}
        style={{
          ...styles.candidateCard,
          ...(isChosen ? styles.candidateCardSelected : {}),
          opacity: isRewrit ? 0.6 : 1,
        }}
      >
        {/* Selection toggle area — click anywhere in card header to pick */}
        <div
          style={styles.cardSelectArea}
          onClick={() => !isRewrit && toggleSelection(type, index)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && toggleSelection(type, index)}
        >
          <div style={styles.cardSelectHeader}>
            <div style={styles.cardSelectLeft}>
              <span
                style={{
                  ...styles.checkMark,
                  opacity: isChosen ? 1 : 0,
                  color: meta.color,
                }}
              >
                ✓
              </span>
              <span style={{ ...styles.typeBadge, backgroundColor: meta.color }}>
                {meta.label}
              </span>
            </div>
            <div style={styles.cardActions} onClick={(e) => e.stopPropagation()}>
              <button
                style={styles.cardActionBtn}
                onClick={() => setEditOpen((p) => ({ ...p, [key]: !editShown }))}
                title="Edit"
              >
                {editShown ? 'Done' : 'Edit'}
              </button>
              <button
                style={styles.cardActionBtn}
                onClick={() => setRewriteOpen((p) => ({ ...p, [key]: !rwShown }))}
                title="Rewrite this entry"
              >
                Rewrite
              </button>
            </div>
          </div>

          {/* Title */}
          {editShown ? (
            <input
              style={styles.cardInput}
              value={enc.title}
              onChange={(e) => updateCandidate(type, index, 'title', e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <p style={styles.cardTitle}>{enc.title}</p>
          )}

          {/* Description */}
          {editShown ? (
            <textarea
              style={styles.cardTextarea}
              value={enc.description}
              rows={3}
              onChange={(e) => updateCandidate(type, index, 'description', e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <p style={styles.cardDescription}>{enc.description}</p>
          )}
        </div>

        {/* Type-specific detail (edit mode only) */}
        {editShown && (
          <div style={styles.cardDetails} onClick={(e) => e.stopPropagation()}>
            {type === 'combat' && (
              <div style={styles.cardRow}>
                <div style={styles.cardField}>
                  <label style={styles.fieldLabel}>Enemies</label>
                  <input
                    style={styles.cardInput}
                    value={enc.enemies || ''}
                    onChange={(e) => updateCandidate(type, index, 'enemies', e.target.value)}
                    placeholder="e.g. 3 Bandits, 1 Captain"
                  />
                </div>
                <div style={{ ...styles.cardField, maxWidth: '130px' }}>
                  <label style={styles.fieldLabel}>Difficulty</label>
                  <select
                    style={styles.cardSelect}
                    value={enc.difficulty || 'medium'}
                    onChange={(e) => updateCandidate(type, index, 'difficulty', e.target.value)}
                  >
                    {DIFFICULTY_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        {d.charAt(0).toUpperCase() + d.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {(type === 'rp' || type === 'puzzle') && (
              <div style={styles.cardField}>
                <label style={styles.fieldLabel}>NPCs Involved</label>
                <input
                  style={styles.cardInput}
                  value={npcsStr}
                  onChange={(e) =>
                    updateCandidate(type, index, 'npcs_involved', e.target.value)
                  }
                  placeholder="Comma-separated NPC names..."
                />
              </div>
            )}

            <div style={styles.cardRow}>
              <div style={styles.cardField}>
                <label style={styles.fieldLabel}>Location</label>
                <input
                  style={styles.cardInput}
                  value={enc.location || ''}
                  onChange={(e) => updateCandidate(type, index, 'location', e.target.value)}
                  placeholder="e.g. The Rusty Anchor tavern"
                />
              </div>
              <div style={styles.cardField}>
                <label style={styles.fieldLabel}>Loot Hint</label>
                <input
                  style={styles.cardInput}
                  value={enc.loot_hint || ''}
                  onChange={(e) => updateCandidate(type, index, 'loot_hint', e.target.value)}
                  placeholder="Optional loot note..."
                />
              </div>
            </div>
          </div>
        )}

        {/* Non-edit meta summary */}
        {!editShown && (
          <div style={styles.cardMeta}>
            {type === 'combat' && enc.enemies && (
              <span style={styles.metaPill}>{enc.enemies}</span>
            )}
            {type === 'combat' && enc.difficulty && (
              <span style={{ ...styles.metaPill, color: difficultyColor(enc.difficulty) }}>
                {enc.difficulty}
              </span>
            )}
            {type === 'rp' && npcsStr && (
              <span style={styles.metaPill}>{npcsStr}</span>
            )}
            {enc.location && (
              <span style={{ ...styles.metaPill, fontStyle: 'normal' }}>📍 {enc.location}</span>
            )}
          </div>
        )}

        {/* Rewrite panel */}
        {rwShown && (
          <div style={styles.rewritePanel} onClick={(e) => e.stopPropagation()}>
            <textarea
              style={styles.rewriteInput}
              value={rewriteHint[key] || ''}
              onChange={(e) =>
                setRewriteHint((p) => ({ ...p, [key]: e.target.value }))
              }
              placeholder="Optional direction — e.g. 'set it in the sewers' or 'tie it to the merchant guild'..."
              rows={2}
            />
            <button
              style={styles.rewriteBtn}
              onClick={() => rewriteCard(type, index)}
              disabled={isRewrit}
            >
              {isRewrit ? 'Drafting...' : 'Draft Replacement'}
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderNPCHighlights() {
    if (!npcHighlights.length) return null;
    return (
      <div style={styles.appendixSection}>
        <p style={styles.appendixLabel}>Personae — NPCs Needed</p>
        <div style={styles.npcGrid}>
          {npcHighlights.map((npc, i) => (
            <div key={i} style={styles.npcCard}>
              <span style={styles.npcName}>{npc.name}</span>
              <span style={styles.npcRole}>{npc.role}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderLootSuggestions() {
    if (!lootSuggestions.length) return null;
    return (
      <div style={styles.appendixSection}>
        <p style={styles.appendixLabel}>Treasury — Loot Suggestions</p>
        <div style={styles.lootList}>
          {lootSuggestions.map((loot, i) => (
            <div key={i} style={styles.lootCard}>
              <div style={styles.lootCardHeader}>
                <span style={styles.lootName}>{loot.name}</span>
                <div style={styles.lootCardActions}>
                  {lootEditOpen[i] ? (
                    <select
                      style={styles.cardSelect}
                      value={loot.category}
                      onChange={(e) => updateLoot(i, 'category', e.target.value)}
                    >
                      {LOOT_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  ) : (
                    <span style={styles.lootCategory}>{loot.category}</span>
                  )}
                  <button
                    style={styles.cardActionBtn}
                    onClick={() => setLootEditOpen((p) => ({ ...p, [i]: !lootEditOpen[i] }))}
                  >
                    {lootEditOpen[i] ? 'Done' : 'Edit'}
                  </button>
                  <button
                    style={styles.removeLootBtn}
                    onClick={() => removeLoot(i)}
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              </div>
              {lootEditOpen[i] ? (
                <textarea
                  style={styles.cardTextarea}
                  value={loot.description}
                  rows={2}
                  onChange={(e) => updateLoot(i, 'description', e.target.value)}
                />
              ) : (
                <p style={styles.lootDescription}>{loot.description}</p>
              )}
              <span style={styles.lootSource}>From: {loot.source}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Loading / guard
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div style={styles.container}>
        <p style={styles.muted}>Opening the Scriptorium...</p>
      </div>
    );
  }

  if (!sessionData) {
    return (
      <div style={styles.container}>
        <p style={styles.muted}>Session not found.</p>
        <button style={styles.backBtn} onClick={onBack}>&larr; Back</button>
      </div>
    );
  }

  const s = sessionData;
  const hasCandidates = candidates &&
    (candidates.rp?.length || candidates.combat?.length || candidates.puzzle?.length);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div style={styles.container}>
      {/* Navigation */}
      <div style={styles.nav}>
        <button style={styles.backBtn} onClick={onBack}>
          &larr; Back to Sessions
        </button>
        {onViewSession && (
          <button style={styles.viewSessionBtn} onClick={onViewSession}>
            View Session &rarr;
          </button>
        )}
      </div>

      {/* Page header */}
      <div style={styles.pageHeader}>
        <div>
          <h2 style={styles.pageTitle}>The Scriptorium</h2>
          {editingTitle ? (
            <input
              style={styles.titleInput}
              value={sessionTitle}
              onChange={(e) => setSessionTitle(e.target.value)}
              onBlur={saveSessionTitle}
              onKeyDown={(e) => { if (e.key === 'Enter') saveSessionTitle(); }}
              autoFocus
              placeholder="Session title..."
            />
          ) : (
            <p
              style={{ ...styles.pageSubtitle, cursor: 'pointer' }}
              onClick={() => setEditingTitle(true)}
              title="Click to edit session title"
            >
              Session {s.session_number}:{' '}
              {s.title || 'Untitled — click to name'}
            </p>
          )}
        </div>
        {hasCandidates && (
          <button style={styles.saveBtn} onClick={savePlan} disabled={saving}>
            {saving ? 'Saving...' : 'Save to Folio'}
          </button>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* I. Chronicle — Story So Far                                        */}
      {/* ------------------------------------------------------------------ */}
      <section style={styles.section}>
        <h3 style={styles.sectionLabel}>I. Chronicle</h3>
        {s.prep_brief ? (
          <>
            <div style={styles.prepBriefBox}>
              {s.prep_brief.split('\n').map((line, i) =>
                line.startsWith('## ') ? (
                  <p key={i} style={styles.briefHeading}>{line.replace('## ', '')}</p>
                ) : line.trim() ? (
                  <p key={i} style={styles.briefPara}>{line}</p>
                ) : (
                  <br key={i} />
                ),
              )}
            </div>
            <button style={styles.ghostBtn} onClick={generateBrief} disabled={loadingBrief}>
              {loadingBrief ? 'Rewriting...' : 'Rewrite Chronicle'}
            </button>
          </>
        ) : (
          <div style={styles.emptyBrief}>
            <p style={styles.muted}>No chronicle yet.</p>
            <button style={styles.accentBtn} onClick={generateBrief} disabled={loadingBrief}>
              {loadingBrief ? 'Writing...' : 'Write Chronicle'}
            </button>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* II. Direction — Session route selection                            */}
      {/* ------------------------------------------------------------------ */}
      <section style={styles.section}>
        <h3 style={styles.sectionLabel}>II. Direction</h3>
        <p style={styles.hint}>
          Choose a suggested route or write your own direction for this session.
          The chosen direction shapes every encounter draft.
        </p>

        {fetchingRoutes ? (
          <p style={styles.muted}>Drafting route suggestions...</p>
        ) : routes.length > 0 ? (
          <>
            <div style={styles.routeGrid}>
              {routes.map((route, i) => (
                <div
                  key={i}
                  style={{
                    ...styles.routeCard,
                    ...(selectedRoute === i ? styles.routeCardSelected : {}),
                  }}
                  onClick={() => setSelectedRoute(selectedRoute === i ? null : i)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) =>
                    e.key === 'Enter' &&
                    setSelectedRoute(selectedRoute === i ? null : i)
                  }
                >
                  {selectedRoute === i && (
                    <span style={styles.routeCheck}>✓</span>
                  )}
                  <p style={styles.routeTitle}>{route.title}</p>
                  <p style={styles.routeDesc}>{route.description}</p>
                </div>
              ))}
            </div>
            <button
              style={{ ...styles.ghostBtn, marginTop: '0.75rem' }}
              onClick={fetchRoutes}
              disabled={fetchingRoutes}
            >
              Suggest new routes
            </button>
          </>
        ) : (
          <div style={styles.emptyBrief}>
            <p style={styles.muted}>No route suggestions yet.</p>
            <button style={styles.accentBtn} onClick={fetchRoutes} disabled={fetchingRoutes}>
              Suggest Routes
            </button>
          </div>
        )}

        <div style={{ marginTop: '1rem' }}>
          <p style={styles.subsectionLabel}>
            {selectedRoute === 'custom' ? 'Custom Direction' : 'Or write your own:'}
          </p>
          <textarea
            style={styles.cardTextarea}
            value={customDirection}
            onChange={(e) => {
              setCustomDirection(e.target.value);
              if (e.target.value.trim()) setSelectedRoute('custom');
              else if (selectedRoute === 'custom') setSelectedRoute(null);
            }}
            placeholder="Describe the session premise in your own words..."
            rows={3}
          />
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* III. Threads — Objectives                                          */}
      {/* ------------------------------------------------------------------ */}
      <section style={styles.section}>
        <h3 style={styles.sectionLabel}>III. Threads</h3>
        <p style={styles.hint}>
          Mark the missions and story beats you plan to advance this session.
          Selected threads steer the encounter drafts.
        </p>

        {missions.length > 0 && (
          <div style={styles.objectiveGroup}>
            <p style={styles.objectiveGroupLabel}>Missions</p>
            {missions.map((m) => (
              <label key={m.id} style={styles.objectiveRow}>
                <input
                  type="checkbox"
                  checked={isObjSelected(m.id)}
                  onChange={() => toggleObjective(m.id, 'mission', m.title)}
                  style={styles.checkbox}
                />
                <div style={styles.objectiveInfo}>
                  <span style={styles.objectiveTitle}>{m.title}</span>
                  <span style={{ ...styles.priorityBadge, color: priorityColor(m.priority) }}>
                    {m.priority}
                  </span>
                  {m.description && <span style={styles.objectiveDesc}>{m.description}</span>}
                </div>
              </label>
            ))}
          </div>
        )}

        {storyBeats.length > 0 && (
          <div style={styles.objectiveGroup}>
            <p style={styles.objectiveGroupLabel}>Story Beats</p>
            {storyBeats.map((b) => (
              <label key={b.id} style={styles.objectiveRow}>
                <input
                  type="checkbox"
                  checked={isObjSelected(b.id)}
                  onChange={() => toggleObjective(b.id, 'story_beat', b.title)}
                  style={styles.checkbox}
                />
                <div style={styles.objectiveInfo}>
                  <span style={styles.objectiveTitle}>{b.title}</span>
                  <span style={styles.beatType}>{b.type}</span>
                  {b.description && <span style={styles.objectiveDesc}>{b.description}</span>}
                </div>
              </label>
            ))}
          </div>
        )}

        {missions.length === 0 && storyBeats.length === 0 && (
          <p style={styles.muted}>
            No active missions or story beats yet — add them in the campaign to use them here.
          </p>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* IV. Register — Encounter Mix + Per-type Tone + Draft button        */}
      {/* ------------------------------------------------------------------ */}
      <section style={styles.section}>
        <h3 style={styles.sectionLabel}>IV. Register</h3>

        <p style={styles.hint}>
          Set how many encounters of each type to include and the intensity for each.
          The Scriptorium drafts 5 candidates per type — pick the ones that fit.
        </p>
        <div style={styles.mixToneTable}>
          {[
            { mixKey: 'rp',      toneKey: 'rp',     label: 'Roleplay', color: TYPE_META.rp.color },
            { mixKey: 'combat',  toneKey: 'combat',  label: 'Combat',   color: TYPE_META.combat.color },
            { mixKey: 'puzzles', toneKey: 'puzzle',  label: 'Puzzle',   color: TYPE_META.puzzle.color },
          ].map(({ mixKey, toneKey, label, color }) => (
            <div key={mixKey} style={styles.mixToneRow}>
              <span style={{ ...styles.mixToneLabel, color }}>{label}</span>
              <div style={styles.mixCounter}>
                <button
                  style={styles.counterBtn}
                  onClick={() =>
                    setEncounterMix((prev) => ({
                      ...prev,
                      [mixKey]: Math.max(0, (prev[mixKey] || 0) - 1),
                    }))
                  }
                >−</button>
                <span style={styles.counterValue}>{encounterMix[mixKey] ?? 0}</span>
                <button
                  style={styles.counterBtn}
                  onClick={() =>
                    setEncounterMix((prev) => ({ ...prev, [mixKey]: (prev[mixKey] || 0) + 1 }))
                  }
                >+</button>
              </div>
              <div style={styles.toneSmGroup}>
                {['light', 'moderate', 'intense'].map((t) => (
                  <button
                    key={t}
                    style={{
                      ...styles.toneSmBtn,
                      ...(encounterTone[toneKey] === t ? styles.toneSmBtnActive : {}),
                    }}
                    onClick={() =>
                      setEncounterTone((prev) => ({ ...prev, [toneKey]: t }))
                    }
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button style={styles.accentBtn} onClick={draftEncounters} disabled={drafting}>
          {drafting
            ? 'Drafting entries...'
            : hasCandidates
            ? 'Redraft All Encounters'
            : 'Draft Encounters'}
        </button>
        {draftError && <p style={styles.error}>{draftError}</p>}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* V. The Stacks — Candidate cards                                    */}
      {/* ------------------------------------------------------------------ */}
      {hasCandidates && (
        <section style={styles.section}>
          <h3 style={styles.sectionLabel}>V. The Stacks</h3>
          <p style={styles.hint}>
            Click a card to select it for this session. Use <strong>Edit</strong> to tweak
            details, or <strong>Rewrite</strong> to draft a replacement — you can add a note to
            steer the new draft.
          </p>

          {['rp', 'combat', 'puzzle'].map((type) =>
            (encounterMix[TYPE_META[type].mixKey] ?? 0) > 0
              ? renderCandidateGroup(type)
              : null,
          )}
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* VI. Appendices — NPCs + Loot                                       */}
      {/* ------------------------------------------------------------------ */}
      {(npcHighlights.length > 0 || lootSuggestions.length > 0) && (
        <section style={styles.section}>
          <h3 style={styles.sectionLabel}>VI. Appendices</h3>
          {renderNPCHighlights()}
          {renderLootSuggestions()}
        </section>
      )}

      {/* Bottom save */}
      {hasCandidates && (
        <div style={styles.bottomSave}>
          <button style={styles.saveBtn} onClick={savePlan} disabled={saving}>
            {saving ? 'Saving...' : 'Save to Folio'}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function priorityColor(priority) {
  return (
    { critical: '#c0392b', high: 'var(--accent)', medium: 'var(--sepia)', low: 'var(--ink-faint)' }[
      priority
    ] || 'var(--ink-faint)'
  );
}

function difficultyColor(difficulty) {
  return (
    { easy: 'var(--success)', medium: 'var(--sepia)', hard: 'var(--accent)', deadly: '#c0392b' }[
      difficulty
    ] || 'var(--ink-faint)'
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  container: {
    maxWidth: '780px',
    margin: '0 auto',
    padding: '1.5rem',
  },
  nav: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.25rem',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--accent)',
    cursor: 'pointer',
    fontSize: '0.875rem',
    padding: 0,
    fontFamily: 'var(--font-body)',
  },
  viewSessionBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--accent)',
    cursor: 'pointer',
    fontSize: '0.875rem',
    padding: 0,
    fontFamily: 'var(--font-body)',
  },
  pageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1.5rem',
  },
  pageTitle: {
    margin: '0 0 0.2rem 0',
    fontSize: '1.5rem',
    color: 'var(--ink-dark)',
    fontFamily: 'var(--font-heading)',
    fontStyle: 'italic',
  },
  pageSubtitle: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--sepia)',
    fontFamily: 'var(--font-body)',
    fontStyle: 'italic',
  },
  section: {
    marginBottom: '2rem',
    padding: '1.25rem',
    backgroundColor: 'var(--card-bg)',
    borderRadius: '3px',
    border: '1px solid var(--border-light)',
  },
  sectionLabel: {
    margin: '0 0 0.9rem 0',
    fontSize: '0.78rem',
    fontWeight: 700,
    fontVariant: 'small-caps',
    letterSpacing: '0.1em',
    color: 'var(--sepia)',
    fontFamily: 'var(--font-heading)',
    textTransform: 'uppercase',
    borderBottom: '1px solid var(--border-light)',
    paddingBottom: '0.5rem',
  },
  subsectionLabel: {
    margin: '0 0 0.5rem 0',
    fontSize: '0.75rem',
    fontWeight: 600,
    fontVariant: 'small-caps',
    letterSpacing: '0.06em',
    color: 'var(--ink-medium)',
    fontFamily: 'var(--font-heading)',
  },
  hint: {
    margin: '0 0 1rem 0',
    fontSize: '0.84rem',
    color: 'var(--ink-light)',
    fontFamily: 'var(--font-body)',
    lineHeight: 1.55,
  },
  muted: {
    color: 'var(--ink-faint)',
    fontSize: '0.875rem',
    fontFamily: 'var(--font-body)',
  },
  error: {
    color: '#c0392b',
    fontSize: '0.84rem',
    marginTop: '0.5rem',
    fontFamily: 'var(--font-body)',
  },

  // Buttons
  accentBtn: {
    padding: '0.55rem 1.25rem',
    backgroundColor: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: '2px',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontFamily: 'var(--font-body)',
  },
  ghostBtn: {
    background: 'none',
    border: '1px solid var(--border-medium)',
    color: 'var(--ink-light)',
    cursor: 'pointer',
    fontSize: '0.75rem',
    padding: '0.3rem 0.65rem',
    borderRadius: '2px',
    fontFamily: 'var(--font-body)',
  },
  saveBtn: {
    padding: '0.5rem 1.1rem',
    backgroundColor: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: '2px',
    cursor: 'pointer',
    fontSize: '0.83rem',
    fontFamily: 'var(--font-body)',
  },
  bottomSave: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginBottom: '2rem',
  },

  // Chronicle
  prepBriefBox: {
    padding: '0.9rem 1rem 0.9rem 1.1rem',
    backgroundColor: 'var(--card-bg)',
    borderRadius: '2px',
    border: '1px solid var(--border-medium)',
    borderLeftWidth: '3px',
    borderLeftColor: 'var(--sepia)',
    marginBottom: '0.75rem',
  },
  briefHeading: {
    margin: '0.85rem 0 0.2rem 0',
    fontSize: '0.78rem',
    fontWeight: 700,
    fontVariant: 'small-caps',
    letterSpacing: '0.07em',
    color: 'var(--sepia)',
    fontFamily: 'var(--font-heading)',
  },
  briefPara: {
    margin: '0 0 0.45rem 0',
    fontSize: '0.875rem',
    color: 'var(--ink-dark)',
    lineHeight: 1.65,
    fontFamily: 'var(--font-body)',
  },
  emptyBrief: {
    textAlign: 'center',
    padding: '1.5rem',
    border: '1px dashed var(--border-medium)',
    borderRadius: '2px',
    marginBottom: '0.5rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
  },

  // Objectives
  objectiveGroup: { marginBottom: '1rem' },
  objectiveGroupLabel: {
    margin: '0 0 0.4rem 0',
    fontSize: '0.72rem',
    fontWeight: 600,
    fontVariant: 'small-caps',
    letterSpacing: '0.06em',
    color: 'var(--ink-medium)',
    fontFamily: 'var(--font-heading)',
  },
  objectiveRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.6rem',
    padding: '0.45rem 0',
    borderBottom: '1px solid var(--border-light)',
    cursor: 'pointer',
  },
  checkbox: { marginTop: '2px', flexShrink: 0, accentColor: 'var(--accent)' },
  objectiveInfo: { display: 'flex', flexDirection: 'column', gap: '0.15rem' },
  objectiveTitle: {
    fontSize: '0.875rem',
    color: 'var(--ink-dark)',
    fontFamily: 'var(--font-body)',
    fontWeight: 500,
  },
  objectiveDesc: {
    fontSize: '0.78rem',
    color: 'var(--ink-faint)',
    fontFamily: 'var(--font-body)',
  },
  priorityBadge: {
    fontSize: '0.68rem',
    fontVariant: 'small-caps',
    fontWeight: 600,
    letterSpacing: '0.04em',
    fontFamily: 'var(--font-heading)',
  },
  beatType: {
    fontSize: '0.68rem',
    color: 'var(--sepia)',
    fontVariant: 'small-caps',
    fontFamily: 'var(--font-heading)',
  },

  // Editable title
  titleInput: {
    fontSize: '0.875rem',
    fontFamily: 'var(--font-body)',
    fontStyle: 'italic',
    color: 'var(--sepia)',
    border: 'none',
    borderBottom: '1px solid var(--accent)',
    outline: 'none',
    background: 'transparent',
    padding: '0.1rem 0',
    width: '100%',
    maxWidth: '340px',
  },

  // Route cards (Direction section)
  routeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '0.6rem',
    marginBottom: '0.25rem',
  },
  routeCard: {
    position: 'relative',
    padding: '0.75rem 0.85rem',
    backgroundColor: 'var(--card-bg)',
    border: '1px solid var(--border-medium)',
    borderRadius: '3px',
    cursor: 'pointer',
    transition: 'border-color 0.1s',
  },
  routeCardSelected: {
    borderColor: 'var(--accent)',
    borderWidth: '2px',
  },
  routeCheck: {
    position: 'absolute',
    top: '0.45rem',
    right: '0.55rem',
    fontSize: '0.75rem',
    color: 'var(--accent)',
    fontWeight: 700,
  },
  routeTitle: {
    margin: '0 0 0.3rem 0',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: 'var(--ink-dark)',
    fontFamily: 'var(--font-body)',
  },
  routeDesc: {
    margin: 0,
    fontSize: '0.8rem',
    color: 'var(--ink-medium)',
    lineHeight: 1.5,
    fontFamily: 'var(--font-body)',
  },

  // Mix + per-type tone table (Register section)
  mixToneTable: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
    marginBottom: '1.25rem',
  },
  mixToneRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    flexWrap: 'wrap',
  },
  mixToneLabel: {
    fontSize: '0.78rem',
    fontWeight: 600,
    fontVariant: 'small-caps',
    letterSpacing: '0.06em',
    fontFamily: 'var(--font-heading)',
    width: '58px',
    flexShrink: 0,
  },
  toneSmGroup: { display: 'flex', gap: '0.3rem', flexWrap: 'wrap' },
  toneSmBtn: {
    padding: '0.2rem 0.55rem',
    borderRadius: '2px',
    border: '1px solid var(--border-medium)',
    backgroundColor: 'var(--card-bg)',
    color: 'var(--ink-light)',
    cursor: 'pointer',
    fontSize: '0.72rem',
    fontFamily: 'var(--font-body)',
    fontVariant: 'small-caps',
    letterSpacing: '0.04em',
  },
  toneSmBtnActive: {
    borderColor: 'var(--accent)',
    backgroundColor: 'var(--accent)',
    color: '#fff',
  },

  // Mix counters (reused in mixToneRow)
  mixCounter: { display: 'flex', alignItems: 'center', gap: '0.45rem' },
  counterBtn: {
    width: '26px',
    height: '26px',
    borderRadius: '2px',
    border: '1px solid var(--border-medium)',
    backgroundColor: 'var(--card-bg)',
    color: 'var(--ink-dark)',
    fontSize: '1rem',
    lineHeight: 1,
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterValue: {
    width: '24px',
    textAlign: 'center',
    fontSize: '1rem',
    fontWeight: 600,
    color: 'var(--ink-dark)',
    fontFamily: 'var(--font-body)',
  },

  // Candidate groups
  candidateGroup: { marginBottom: '1.5rem' },
  groupHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: '0.6rem',
  },
  groupTitle: {
    fontSize: '0.78rem',
    fontWeight: 700,
    fontVariant: 'small-caps',
    letterSpacing: '0.07em',
    fontFamily: 'var(--font-heading)',
  },
  groupCount: {
    fontSize: '0.75rem',
    fontFamily: 'var(--font-body)',
  },
  candidateList: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },

  // Candidate card
  candidateCard: {
    backgroundColor: 'var(--card-bg)',
    border: '1px solid var(--border-medium)',
    borderRadius: '3px',
    overflow: 'hidden',
    transition: 'border-color 0.12s, background-color 0.12s',
  },
  candidateCardSelected: {
    borderColor: 'var(--accent)',
    borderWidth: '2px',
  },
  cardSelectArea: {
    padding: '0.75rem 0.9rem',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  },
  cardSelectHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardSelectLeft: { display: 'flex', alignItems: 'center', gap: '0.4rem' },
  checkMark: {
    fontSize: '0.9rem',
    fontWeight: 700,
    transition: 'opacity 0.1s',
    width: '14px',
  },
  typeBadge: {
    fontSize: '0.65rem',
    fontWeight: 600,
    fontVariant: 'small-caps',
    letterSpacing: '0.06em',
    color: '#fff',
    padding: '0.12rem 0.35rem',
    borderRadius: '2px',
    fontFamily: 'var(--font-heading)',
  },
  cardActions: { display: 'flex', gap: '0.35rem' },
  cardActionBtn: {
    background: 'none',
    border: '1px solid var(--border-medium)',
    color: 'var(--ink-light)',
    cursor: 'pointer',
    fontSize: '0.7rem',
    padding: '0.18rem 0.45rem',
    borderRadius: '2px',
    fontFamily: 'var(--font-body)',
  },
  cardTitle: {
    margin: 0,
    fontSize: '0.9rem',
    fontWeight: 600,
    color: 'var(--ink-dark)',
    fontFamily: 'var(--font-body)',
  },
  cardDescription: {
    margin: 0,
    fontSize: '0.83rem',
    color: 'var(--ink-medium)',
    lineHeight: 1.5,
    fontFamily: 'var(--font-body)',
  },
  cardMeta: {
    display: 'flex',
    gap: '0.4rem',
    flexWrap: 'wrap',
    padding: '0 0.9rem 0.6rem',
  },
  metaPill: {
    fontSize: '0.72rem',
    color: 'var(--ink-faint)',
    fontFamily: 'var(--font-body)',
    fontStyle: 'italic',
  },
  cardDetails: {
    padding: '0 0.9rem 0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.45rem',
  },
  cardRow: { display: 'flex', gap: '0.6rem', flexWrap: 'wrap' },
  cardField: { display: 'flex', flexDirection: 'column', gap: '0.18rem', flex: 1 },
  fieldLabel: {
    fontSize: '0.68rem',
    fontWeight: 600,
    color: 'var(--ink-faint)',
    fontVariant: 'small-caps',
    letterSpacing: '0.04em',
    fontFamily: 'var(--font-heading)',
  },
  cardInput: {
    padding: '0.35rem 0.55rem',
    borderRadius: '2px',
    border: '1px solid var(--border-medium)',
    backgroundColor: 'var(--card-bg)',
    fontSize: '0.85rem',
    outline: 'none',
    fontFamily: 'var(--font-body)',
    color: 'var(--ink-medium)',
    width: '100%',
    boxSizing: 'border-box',
  },
  cardTextarea: {
    padding: '0.35rem 0.55rem',
    borderRadius: '2px',
    border: '1px solid var(--border-medium)',
    backgroundColor: 'var(--card-bg)',
    fontSize: '0.83rem',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'var(--font-body)',
    color: 'var(--ink-medium)',
    lineHeight: 1.5,
    width: '100%',
    boxSizing: 'border-box',
  },
  cardSelect: {
    padding: '0.35rem 0.55rem',
    borderRadius: '2px',
    border: '1px solid var(--border-medium)',
    backgroundColor: 'var(--card-bg)',
    fontSize: '0.83rem',
    fontFamily: 'var(--font-body)',
    color: 'var(--ink-medium)',
    outline: 'none',
  },

  // Rewrite panel
  rewritePanel: {
    padding: '0.65rem 0.9rem 0.75rem',
    borderTop: '1px solid var(--border-medium)',
    backgroundColor: 'var(--sidebar-bg)',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.45rem',
  },
  rewriteInput: {
    padding: '0.35rem 0.55rem',
    borderRadius: '2px',
    border: '1px solid var(--border-medium)',
    backgroundColor: 'var(--card-bg)',
    fontSize: '0.83rem',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'var(--font-body)',
    color: 'var(--ink-medium)',
    lineHeight: 1.5,
    width: '100%',
    boxSizing: 'border-box',
  },
  rewriteBtn: {
    alignSelf: 'flex-start',
    padding: '0.35rem 0.8rem',
    backgroundColor: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: '2px',
    cursor: 'pointer',
    fontSize: '0.78rem',
    fontFamily: 'var(--font-body)',
  },

  // Appendices
  appendixSection: { marginBottom: '1.25rem' },
  appendixLabel: {
    margin: '0 0 0.6rem 0',
    fontSize: '0.72rem',
    fontWeight: 600,
    fontVariant: 'small-caps',
    letterSpacing: '0.07em',
    color: 'var(--ink-medium)',
    fontFamily: 'var(--font-heading)',
  },
  npcGrid: { display: 'flex', flexWrap: 'wrap', gap: '0.45rem' },
  npcCard: {
    display: 'flex',
    flexDirection: 'column',
    padding: '0.55rem 0.75rem',
    backgroundColor: 'var(--card-bg)',
    border: '1px solid var(--border-medium)',
    borderRadius: '3px',
    minWidth: '150px',
    maxWidth: '210px',
    gap: '0.12rem',
  },
  npcName: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--ink-dark)',
    fontFamily: 'var(--font-body)',
  },
  npcRole: {
    fontSize: '0.76rem',
    color: 'var(--ink-faint)',
    fontFamily: 'var(--font-body)',
    fontStyle: 'italic',
  },
  lootList: { display: 'flex', flexDirection: 'column', gap: '0.45rem' },
  lootCard: {
    padding: '0.65rem 0.75rem',
    backgroundColor: 'var(--card-bg)',
    border: '1px solid var(--border-medium)',
    borderRadius: '3px',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
  },
  lootCardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  lootName: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--ink-dark)',
    fontFamily: 'var(--font-body)',
  },
  lootCardActions: { display: 'flex', alignItems: 'center', gap: '0.35rem' },
  lootCategory: {
    fontSize: '0.68rem',
    fontVariant: 'small-caps',
    letterSpacing: '0.04em',
    color: 'var(--sepia)',
    fontFamily: 'var(--font-heading)',
  },
  removeLootBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--ink-faint)',
    cursor: 'pointer',
    fontSize: '1rem',
    lineHeight: 1,
    padding: '0 0.15rem',
    fontFamily: 'var(--font-body)',
  },
  lootDescription: {
    margin: 0,
    fontSize: '0.82rem',
    color: 'var(--ink-medium)',
    fontFamily: 'var(--font-body)',
    lineHeight: 1.5,
  },
  lootSource: {
    fontSize: '0.74rem',
    color: 'var(--ink-faint)',
    fontFamily: 'var(--font-body)',
    fontStyle: 'italic',
  },
};
