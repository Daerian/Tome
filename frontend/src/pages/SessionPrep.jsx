/**
 * SessionPrep — DM session planning wizard
 *
 * Guides the DM through planning a session:
 *   1. Story So Far  — AI-generated narrative summary (from prep_brief)
 *   2. Objectives    — Select missions/story beats to tackle this session
 *   3. Tone          — Light-hearted → Balanced → Intense
 *   4. Encounter Mix — How many RP / Combat / Puzzle encounters to include
 *   5. Generate Plan — AI produces concrete encounter suggestions
 *   6. Review & Edit — DM tweaks encounters, sees NPC highlights and loot
 *
 * Persists the plan to sessions.prep_config via the backend.
 */

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const API_URL = import.meta.env.VITE_API_URL;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TONE_OPTIONS = [
  {
    value: 'light',
    label: 'Light-hearted',
    description: 'Comedy, exploration, low stakes',
  },
  {
    value: 'moderate',
    label: 'Balanced',
    description: 'Drama, action, lighter moments',
  },
  {
    value: 'intense',
    label: 'Intense',
    description: 'High tension, difficult choices, consequences',
  },
];

const ENCOUNTER_TYPE_COLORS = {
  rp: 'var(--accent)',
  combat: '#c0392b',
  puzzle: 'var(--sepia)',
};

const ENCOUNTER_TYPE_LABELS = {
  rp: 'Roleplay',
  combat: 'Combat',
  puzzle: 'Puzzle',
};

const DIFFICULTY_OPTIONS = ['easy', 'medium', 'hard', 'deadly'];

const LOOT_CATEGORIES = ['gold', 'item', 'gem', 'art', 'magic_item', 'other'];

function sectionHeader(label) {
  return (
    <h3 style={styles.sectionLabel}>{label}</h3>
  );
}

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
  // Core session data
  const [sessionData, setSessionData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Campaign data for objective selection
  const [missions, setMissions] = useState([]);
  const [storyBeats, setStoryBeats] = useState([]);

  // Planning inputs
  const [tone, setTone] = useState('moderate');
  const [encounterMix, setEncounterMix] = useState({ rp: 2, combat: 2, puzzles: 1 });
  const [selectedObjectives, setSelectedObjectives] = useState([]); // [{id, type, title}]

  // Generated plan state
  const [plan, setPlan] = useState(null); // { encounters, npc_highlights, loot_suggestions }
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');

  // Save state
  const [saving, setSaving] = useState(false);

  // Prep brief (story so far) loading
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

      // Restore previously saved plan if it exists
      const saved = sessionRes.data.prep_config;
      if (saved) {
        if (saved.tone) setTone(saved.tone);
        if (saved.encounter_mix) setEncounterMix(saved.encounter_mix);
        if (saved.selected_objectives) setSelectedObjectives(saved.selected_objectives);
        if (saved.encounters || saved.npc_highlights || saved.loot_suggestions) {
          setPlan({
            encounters: saved.encounters || [],
            npc_highlights: saved.npc_highlights || [],
            loot_suggestions: saved.loot_suggestions || [],
          });
        }
      }
    }
    if (missionsRes.data) setMissions(missionsRes.data);
    if (beatsRes.data) setStoryBeats(beatsRes.data);
    setLoading(false);
  }

  // Generate the prep_brief (story so far) if not already present
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
      if (data.prep) {
        setSessionData((prev) => ({ ...prev, prep_brief: data.prep }));
      }
    } catch {
      // Silently fail — brief is optional
    }
    setLoadingBrief(false);
  }

  // ---------------------------------------------------------------------------
  // Objective selection
  // ---------------------------------------------------------------------------

  function toggleObjective(id, type, title) {
    setSelectedObjectives((prev) => {
      const exists = prev.find((o) => o.id === id);
      if (exists) return prev.filter((o) => o.id !== id);
      return [...prev, { id, type, title }];
    });
  }

  function isSelected(id) {
    return selectedObjectives.some((o) => o.id === id);
  }

  // ---------------------------------------------------------------------------
  // Plan generation
  // ---------------------------------------------------------------------------

  async function generatePlan() {
    setGenerating(true);
    setGenerateError('');
    try {
      const res = await fetch(`${API_URL}/api/session-prep-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          campaign_id: campaignId,
          tone,
          encounter_mix: encounterMix,
          selected_objectives: selectedObjectives,
        }),
      });
      const data = await res.json();
      if (data.plan) {
        setPlan({
          encounters: data.plan.encounters || [],
          npc_highlights: data.plan.npc_highlights || [],
          loot_suggestions: data.plan.loot_suggestions || [],
        });
      } else {
        setGenerateError('Generation failed. Please try again.');
      }
    } catch {
      setGenerateError('Could not reach the server. Please try again.');
    }
    setGenerating(false);
  }

  // ---------------------------------------------------------------------------
  // Encounter editing
  // ---------------------------------------------------------------------------

  function updateEncounter(index, field, value) {
    setPlan((prev) => {
      const encounters = [...prev.encounters];
      encounters[index] = { ...encounters[index], [field]: value };
      return { ...prev, encounters };
    });
  }

  function updateEncounterList(index, field, rawValue) {
    // For comma-separated list fields (npcs_involved)
    setPlan((prev) => {
      const encounters = [...prev.encounters];
      encounters[index] = { ...encounters[index], [field]: rawValue };
      return { ...prev, encounters };
    });
  }

  function removeEncounter(index) {
    setPlan((prev) => ({
      ...prev,
      encounters: prev.encounters.filter((_, i) => i !== index),
    }));
  }

  function addEncounter(type) {
    const blank = {
      type,
      title: '',
      description: '',
      npcs_involved: [],
      enemies: null,
      difficulty: type === 'combat' ? 'medium' : null,
      loot_hint: null,
    };
    setPlan((prev) => ({
      ...prev,
      encounters: [...(prev?.encounters || []), blank],
    }));
  }

  // ---------------------------------------------------------------------------
  // Loot editing
  // ---------------------------------------------------------------------------

  function updateLoot(index, field, value) {
    setPlan((prev) => {
      const loot_suggestions = [...prev.loot_suggestions];
      loot_suggestions[index] = { ...loot_suggestions[index], [field]: value };
      return { ...prev, loot_suggestions };
    });
  }

  function removeLoot(index) {
    setPlan((prev) => ({
      ...prev,
      loot_suggestions: prev.loot_suggestions.filter((_, i) => i !== index),
    }));
  }

  // ---------------------------------------------------------------------------
  // Save plan
  // ---------------------------------------------------------------------------

  async function savePlan() {
    if (!plan) return;
    setSaving(true);

    const prep_config = {
      tone,
      encounter_mix: encounterMix,
      selected_objectives: selectedObjectives,
      encounters: plan.encounters.map((e) => ({
        ...e,
        // Normalise npcs_involved — could be string (from textarea) or array
        npcs_involved:
          typeof e.npcs_involved === 'string'
            ? e.npcs_involved.split(',').map((s) => s.trim()).filter(Boolean)
            : e.npcs_involved || [],
      })),
      npc_highlights: plan.npc_highlights,
      loot_suggestions: plan.loot_suggestions,
    };

    await supabase
      .from('sessions')
      .update({ prep_config })
      .eq('id', sessionId);

    setSaving(false);
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function renderEncounterCard(enc, index) {
    const color = ENCOUNTER_TYPE_COLORS[enc.type] || 'var(--ink-faint)';
    const npcsStr =
      Array.isArray(enc.npcs_involved)
        ? enc.npcs_involved.join(', ')
        : enc.npcs_involved || '';

    return (
      <div key={index} style={styles.encounterCard}>
        {/* Type badge + remove */}
        <div style={styles.encounterCardHeader}>
          <span style={{ ...styles.typeBadge, backgroundColor: color }}>
            {ENCOUNTER_TYPE_LABELS[enc.type] || enc.type}
          </span>
          <button
            style={styles.removeBtn}
            onClick={() => removeEncounter(index)}
            title="Remove encounter"
          >
            ×
          </button>
        </div>

        {/* Title */}
        <input
          style={styles.cardInput}
          value={enc.title}
          onChange={(e) => updateEncounter(index, 'title', e.target.value)}
          placeholder="Encounter title..."
        />

        {/* Description */}
        <textarea
          style={styles.cardTextarea}
          value={enc.description}
          onChange={(e) => updateEncounter(index, 'description', e.target.value)}
          placeholder="Describe the encounter..."
          rows={3}
        />

        {/* Type-specific fields */}
        {enc.type === 'combat' && (
          <div style={styles.cardRow}>
            <div style={styles.cardField}>
              <label style={styles.fieldLabel}>Enemies</label>
              <input
                style={styles.cardInput}
                value={enc.enemies || ''}
                onChange={(e) => updateEncounter(index, 'enemies', e.target.value)}
                placeholder="e.g. 3 Bandits, 1 Bandit Captain"
              />
            </div>
            <div style={{ ...styles.cardField, maxWidth: '140px' }}>
              <label style={styles.fieldLabel}>Difficulty</label>
              <select
                style={styles.cardSelect}
                value={enc.difficulty || 'medium'}
                onChange={(e) => updateEncounter(index, 'difficulty', e.target.value)}
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

        {(enc.type === 'rp' || enc.type === 'puzzle') && (
          <div style={styles.cardField}>
            <label style={styles.fieldLabel}>NPCs Involved</label>
            <input
              style={styles.cardInput}
              value={npcsStr}
              onChange={(e) =>
                updateEncounterList(index, 'npcs_involved', e.target.value)
              }
              placeholder="Comma-separated NPC names..."
            />
          </div>
        )}

        {/* Loot hint */}
        <div style={styles.cardField}>
          <label style={styles.fieldLabel}>Loot Hint</label>
          <input
            style={styles.cardInput}
            value={enc.loot_hint || ''}
            onChange={(e) => updateEncounter(index, 'loot_hint', e.target.value)}
            placeholder="Optional loot note for this encounter..."
          />
        </div>
      </div>
    );
  }

  function renderNPCHighlights() {
    if (!plan?.npc_highlights?.length) return null;
    return (
      <div style={styles.subsection}>
        {sectionHeader('NPCs Needed This Session')}
        <div style={styles.npcGrid}>
          {plan.npc_highlights.map((npc, i) => (
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
    if (!plan?.loot_suggestions?.length) return null;
    return (
      <div style={styles.subsection}>
        {sectionHeader('Loot Suggestions')}
        <div style={styles.lootList}>
          {plan.loot_suggestions.map((loot, i) => (
            <div key={i} style={styles.lootCard}>
              <div style={styles.lootCardHeader}>
                <span style={styles.lootName}>{loot.name}</span>
                <div style={styles.lootActions}>
                  <span style={styles.lootCategory}>{loot.category}</span>
                  <button
                    style={styles.removeBtn}
                    onClick={() => removeLoot(i)}
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              </div>
              <p style={styles.lootDescription}>{loot.description}</p>
              <span style={styles.lootSource}>From: {loot.source}</span>
              {/* Category edit */}
              <select
                style={{ ...styles.cardSelect, marginTop: '0.4rem', width: '140px' }}
                value={loot.category}
                onChange={(e) => updateLoot(i, 'category', e.target.value)}
              >
                {LOOT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
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
        <p style={styles.muted}>Loading prep wizard...</p>
      </div>
    );
  }

  if (!sessionData) {
    return (
      <div style={styles.container}>
        <p style={styles.muted}>Session not found.</p>
        <button style={styles.backBtn} onClick={onBack}>
          &larr; Back
        </button>
      </div>
    );
  }

  const s = sessionData;

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
          <h2 style={styles.pageTitle}>Prep Wizard</h2>
          <p style={styles.pageSubtitle}>
            Session {s.session_number}: {s.title || 'Untitled'}
          </p>
        </div>
        {plan && (
          <button
            style={styles.saveBtn}
            onClick={savePlan}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Plan'}
          </button>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Section 1 — Story So Far                                           */}
      {/* ------------------------------------------------------------------ */}
      <section style={styles.section}>
        {sectionHeader('Story So Far')}
        {s.prep_brief ? (
          <div style={styles.prepBriefBox}>
            {s.prep_brief.split('\n').map((line, i) =>
              line.startsWith('## ') ? (
                <p key={i} style={styles.briefHeading}>
                  {line.replace('## ', '')}
                </p>
              ) : line.trim() ? (
                <p key={i} style={styles.briefPara}>{line}</p>
              ) : (
                <br key={i} />
              ),
            )}
          </div>
        ) : (
          <div style={styles.emptyBrief}>
            <p style={styles.muted}>No prep brief yet.</p>
            <button
              style={styles.generateBriefBtn}
              onClick={generateBrief}
              disabled={loadingBrief}
            >
              {loadingBrief ? 'Generating...' : 'Generate Story Summary'}
            </button>
          </div>
        )}
        {s.prep_brief && (
          <button
            style={styles.regenBriefBtn}
            onClick={generateBrief}
            disabled={loadingBrief}
          >
            {loadingBrief ? 'Regenerating...' : 'Regenerate'}
          </button>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Section 2 — Objectives                                             */}
      {/* ------------------------------------------------------------------ */}
      <section style={styles.section}>
        {sectionHeader('Session Objectives')}
        <p style={styles.hint}>
          Select the missions and story beats you plan to advance this session.
          The AI uses these as priorities when generating encounters.
        </p>

        {missions.length > 0 && (
          <div style={styles.objectiveGroup}>
            <p style={styles.objectiveGroupLabel}>Missions</p>
            {missions.map((m) => (
              <label key={m.id} style={styles.objectiveRow}>
                <input
                  type="checkbox"
                  checked={isSelected(m.id)}
                  onChange={() => toggleObjective(m.id, 'mission', m.title)}
                  style={styles.checkbox}
                />
                <div style={styles.objectiveInfo}>
                  <span style={styles.objectiveTitle}>{m.title}</span>
                  <span
                    style={{
                      ...styles.priorityBadge,
                      color: priorityColor(m.priority),
                    }}
                  >
                    {m.priority}
                  </span>
                  {m.description && (
                    <span style={styles.objectiveDesc}>{m.description}</span>
                  )}
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
                  checked={isSelected(b.id)}
                  onChange={() => toggleObjective(b.id, 'story_beat', b.title)}
                  style={styles.checkbox}
                />
                <div style={styles.objectiveInfo}>
                  <span style={styles.objectiveTitle}>{b.title}</span>
                  <span style={styles.beatType}>{b.type}</span>
                  {b.description && (
                    <span style={styles.objectiveDesc}>{b.description}</span>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}

        {missions.length === 0 && storyBeats.length === 0 && (
          <p style={styles.muted}>
            No active missions or story beats yet. Add them in the campaign to
            use them here.
          </p>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Section 3 — Tone                                                   */}
      {/* ------------------------------------------------------------------ */}
      <section style={styles.section}>
        {sectionHeader('Session Tone')}
        <div style={styles.toneGroup}>
          {TONE_OPTIONS.map((t) => (
            <button
              key={t.value}
              style={{
                ...styles.toneBtn,
                ...(tone === t.value ? styles.toneBtnActive : {}),
              }}
              onClick={() => setTone(t.value)}
            >
              <span style={styles.toneBtnLabel}>{t.label}</span>
              <span style={styles.toneBtnDesc}>{t.description}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Section 4 — Encounter Mix                                          */}
      {/* ------------------------------------------------------------------ */}
      <section style={styles.section}>
        {sectionHeader('Encounter Mix')}
        <p style={styles.hint}>
          How many of each encounter type should the session include?
        </p>
        <div style={styles.mixRow}>
          {[
            { key: 'rp', label: 'Roleplay', color: ENCOUNTER_TYPE_COLORS.rp },
            { key: 'combat', label: 'Combat', color: ENCOUNTER_TYPE_COLORS.combat },
            { key: 'puzzles', label: 'Puzzles', color: ENCOUNTER_TYPE_COLORS.puzzle },
          ].map(({ key, label, color }) => (
            <div key={key} style={styles.mixItem}>
              <span style={{ ...styles.mixLabel, color }}>{label}</span>
              <div style={styles.mixCounter}>
                <button
                  style={styles.counterBtn}
                  onClick={() =>
                    setEncounterMix((prev) => ({
                      ...prev,
                      [key]: Math.max(0, (prev[key] || 0) - 1),
                    }))
                  }
                >
                  −
                </button>
                <span style={styles.counterValue}>{encounterMix[key] ?? 0}</span>
                <button
                  style={styles.counterBtn}
                  onClick={() =>
                    setEncounterMix((prev) => ({
                      ...prev,
                      [key]: (prev[key] || 0) + 1,
                    }))
                  }
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          style={styles.generateBtn}
          onClick={generatePlan}
          disabled={generating}
        >
          {generating
            ? 'Generating plan...'
            : plan
            ? 'Regenerate Plan'
            : 'Generate Session Plan'}
        </button>
        {generateError && <p style={styles.error}>{generateError}</p>}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Section 5 — Generated Plan                                         */}
      {/* ------------------------------------------------------------------ */}
      {plan && (
        <section style={styles.section}>
          {sectionHeader('Session Plan')}

          {/* Encounters */}
          <div style={styles.subsection}>
            <div style={styles.encountersHeader}>
              <p style={styles.subsectionLabel}>Encounters</p>
              <div style={styles.addEncounterBtns}>
                {['rp', 'combat', 'puzzle'].map((type) => (
                  <button
                    key={type}
                    style={{
                      ...styles.addTypeBtn,
                      borderColor: ENCOUNTER_TYPE_COLORS[type],
                      color: ENCOUNTER_TYPE_COLORS[type],
                    }}
                    onClick={() => addEncounter(type)}
                  >
                    + {ENCOUNTER_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
            </div>

            {plan.encounters.length === 0 ? (
              <p style={styles.muted}>No encounters yet.</p>
            ) : (
              <div style={styles.encounterList}>
                {plan.encounters.map((enc, i) => renderEncounterCard(enc, i))}
              </div>
            )}
          </div>

          {/* NPCs */}
          {renderNPCHighlights()}

          {/* Loot */}
          {renderLootSuggestions()}

          {/* Save */}
          <button
            style={styles.saveBtn}
            onClick={savePlan}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Plan'}
          </button>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function priorityColor(priority) {
  const map = {
    critical: '#c0392b',
    high: 'var(--accent)',
    medium: 'var(--sepia)',
    low: 'var(--ink-faint)',
  };
  return map[priority] || 'var(--ink-faint)';
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  container: {
    maxWidth: '760px',
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
    fontSize: '1.35rem',
    color: 'var(--ink-dark)',
    fontFamily: 'var(--font-heading)',
  },
  pageSubtitle: {
    margin: 0,
    fontSize: '0.9rem',
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
    margin: '0 0 0.75rem 0',
    fontSize: '0.8rem',
    fontWeight: 600,
    fontVariant: 'small-caps',
    letterSpacing: '0.08em',
    color: 'var(--sepia)',
    textTransform: 'uppercase',
    fontFamily: 'var(--font-heading)',
  },
  subsection: {
    marginTop: '1.25rem',
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
    fontSize: '0.85rem',
    color: 'var(--ink-light)',
    fontFamily: 'var(--font-body)',
    lineHeight: 1.5,
  },
  muted: {
    color: 'var(--ink-faint)',
    fontSize: '0.875rem',
    fontFamily: 'var(--font-body)',
  },
  error: {
    color: '#c0392b',
    fontSize: '0.85rem',
    marginTop: '0.5rem',
    fontFamily: 'var(--font-body)',
  },

  // Story So Far
  prepBriefBox: {
    padding: '1rem',
    backgroundColor: 'var(--sidebar-bg)',
    borderRadius: '2px',
    border: '1px solid var(--border-light)',
    marginBottom: '0.75rem',
  },
  briefHeading: {
    margin: '0.75rem 0 0.25rem 0',
    fontSize: '0.8rem',
    fontWeight: 700,
    fontVariant: 'small-caps',
    letterSpacing: '0.06em',
    color: 'var(--sepia)',
    fontFamily: 'var(--font-heading)',
  },
  briefPara: {
    margin: '0 0 0.5rem 0',
    fontSize: '0.875rem',
    color: 'var(--ink-medium)',
    lineHeight: 1.6,
    fontFamily: 'var(--font-body)',
  },
  emptyBrief: {
    textAlign: 'center',
    padding: '1.5rem',
    border: '1px dashed var(--border-medium)',
    borderRadius: '2px',
    marginBottom: '0.5rem',
  },
  generateBriefBtn: {
    marginTop: '0.5rem',
    padding: '0.5rem 1rem',
    backgroundColor: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: '2px',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontFamily: 'var(--font-body)',
  },
  regenBriefBtn: {
    background: 'none',
    border: '1px solid var(--border-medium)',
    color: 'var(--ink-light)',
    cursor: 'pointer',
    fontSize: '0.75rem',
    padding: '0.3rem 0.6rem',
    borderRadius: '2px',
    fontFamily: 'var(--font-body)',
  },

  // Objectives
  objectiveGroup: {
    marginBottom: '1rem',
  },
  objectiveGroupLabel: {
    margin: '0 0 0.4rem 0',
    fontSize: '0.75rem',
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
    padding: '0.5rem 0',
    borderBottom: '1px solid var(--border-light)',
    cursor: 'pointer',
  },
  checkbox: {
    marginTop: '2px',
    flexShrink: 0,
    accentColor: 'var(--accent)',
  },
  objectiveInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.15rem',
  },
  objectiveTitle: {
    fontSize: '0.9rem',
    color: 'var(--ink-dark)',
    fontFamily: 'var(--font-body)',
    fontWeight: 500,
  },
  objectiveDesc: {
    fontSize: '0.8rem',
    color: 'var(--ink-faint)',
    fontFamily: 'var(--font-body)',
  },
  priorityBadge: {
    fontSize: '0.7rem',
    fontVariant: 'small-caps',
    fontWeight: 600,
    letterSpacing: '0.04em',
    fontFamily: 'var(--font-heading)',
  },
  beatType: {
    fontSize: '0.7rem',
    color: 'var(--sepia)',
    fontVariant: 'small-caps',
    fontFamily: 'var(--font-heading)',
  },

  // Tone
  toneGroup: {
    display: 'flex',
    gap: '0.75rem',
    flexWrap: 'wrap',
  },
  toneBtn: {
    flex: 1,
    minWidth: '140px',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
    padding: '0.75rem 1rem',
    backgroundColor: 'var(--sidebar-bg)',
    border: '1px solid var(--border-medium)',
    borderRadius: '3px',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'var(--font-body)',
    transition: 'border-color 0.15s',
  },
  toneBtnActive: {
    borderColor: 'var(--accent)',
    backgroundColor: 'var(--success-bg)',
  },
  toneBtnLabel: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: 'var(--ink-dark)',
  },
  toneBtnDesc: {
    fontSize: '0.78rem',
    color: 'var(--ink-faint)',
  },

  // Encounter mix
  mixRow: {
    display: 'flex',
    gap: '1.5rem',
    flexWrap: 'wrap',
    marginBottom: '1.25rem',
  },
  mixItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.4rem',
  },
  mixLabel: {
    fontSize: '0.8rem',
    fontWeight: 600,
    fontVariant: 'small-caps',
    letterSpacing: '0.06em',
    fontFamily: 'var(--font-heading)',
  },
  mixCounter: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  counterBtn: {
    width: '28px',
    height: '28px',
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
    width: '28px',
    textAlign: 'center',
    fontSize: '1rem',
    fontWeight: 600,
    color: 'var(--ink-dark)',
    fontFamily: 'var(--font-body)',
  },
  generateBtn: {
    padding: '0.6rem 1.4rem',
    backgroundColor: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: '2px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontFamily: 'var(--font-body)',
  },

  // Encounters
  encountersHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.75rem',
  },
  addEncounterBtns: {
    display: 'flex',
    gap: '0.4rem',
  },
  addTypeBtn: {
    background: 'none',
    border: '1px solid',
    borderRadius: '2px',
    padding: '0.25rem 0.5rem',
    fontSize: '0.72rem',
    fontVariant: 'small-caps',
    fontFamily: 'var(--font-heading)',
    cursor: 'pointer',
    letterSpacing: '0.04em',
  },
  encounterList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  encounterCard: {
    padding: '1rem',
    backgroundColor: 'var(--sidebar-bg)',
    borderRadius: '3px',
    border: '1px solid var(--border-light)',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  encounterCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  typeBadge: {
    fontSize: '0.68rem',
    fontWeight: 600,
    fontVariant: 'small-caps',
    letterSpacing: '0.06em',
    color: '#fff',
    padding: '0.15rem 0.4rem',
    borderRadius: '2px',
    fontFamily: 'var(--font-heading)',
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--ink-faint)',
    cursor: 'pointer',
    fontSize: '1.1rem',
    lineHeight: 1,
    padding: '0 0.2rem',
    fontFamily: 'var(--font-body)',
  },
  cardInput: {
    padding: '0.4rem 0.6rem',
    borderRadius: '2px',
    border: '1px solid var(--border-medium)',
    backgroundColor: 'var(--card-bg)',
    fontSize: '0.875rem',
    outline: 'none',
    fontFamily: 'var(--font-body)',
    color: 'var(--ink-medium)',
    width: '100%',
    boxSizing: 'border-box',
  },
  cardTextarea: {
    padding: '0.4rem 0.6rem',
    borderRadius: '2px',
    border: '1px solid var(--border-medium)',
    backgroundColor: 'var(--card-bg)',
    fontSize: '0.85rem',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'var(--font-body)',
    color: 'var(--ink-medium)',
    lineHeight: 1.5,
    width: '100%',
    boxSizing: 'border-box',
  },
  cardRow: {
    display: 'flex',
    gap: '0.75rem',
    flexWrap: 'wrap',
  },
  cardField: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
    flex: 1,
  },
  cardSelect: {
    padding: '0.4rem 0.6rem',
    borderRadius: '2px',
    border: '1px solid var(--border-medium)',
    backgroundColor: 'var(--card-bg)',
    fontSize: '0.875rem',
    fontFamily: 'var(--font-body)',
    color: 'var(--ink-medium)',
    outline: 'none',
  },
  fieldLabel: {
    fontSize: '0.72rem',
    fontWeight: 600,
    color: 'var(--ink-faint)',
    fontVariant: 'small-caps',
    letterSpacing: '0.04em',
    fontFamily: 'var(--font-heading)',
  },

  // NPCs
  npcGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  npcCard: {
    display: 'flex',
    flexDirection: 'column',
    padding: '0.6rem 0.8rem',
    backgroundColor: 'var(--sidebar-bg)',
    border: '1px solid var(--border-light)',
    borderRadius: '3px',
    minWidth: '160px',
    maxWidth: '220px',
    gap: '0.15rem',
  },
  npcName: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--ink-dark)',
    fontFamily: 'var(--font-body)',
  },
  npcRole: {
    fontSize: '0.78rem',
    color: 'var(--ink-faint)',
    fontFamily: 'var(--font-body)',
    fontStyle: 'italic',
  },

  // Loot
  lootList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  lootCard: {
    padding: '0.75rem',
    backgroundColor: 'var(--sidebar-bg)',
    border: '1px solid var(--border-light)',
    borderRadius: '3px',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
  },
  lootCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lootName: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: 'var(--ink-dark)',
    fontFamily: 'var(--font-body)',
  },
  lootActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
  },
  lootCategory: {
    fontSize: '0.68rem',
    fontVariant: 'small-caps',
    letterSpacing: '0.04em',
    color: 'var(--sepia)',
    fontFamily: 'var(--font-heading)',
  },
  lootDescription: {
    margin: 0,
    fontSize: '0.83rem',
    color: 'var(--ink-medium)',
    fontFamily: 'var(--font-body)',
    lineHeight: 1.5,
  },
  lootSource: {
    fontSize: '0.75rem',
    color: 'var(--ink-faint)',
    fontFamily: 'var(--font-body)',
    fontStyle: 'italic',
  },

  // Save button
  saveBtn: {
    marginTop: '1rem',
    padding: '0.6rem 1.4rem',
    backgroundColor: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: '2px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontFamily: 'var(--font-body)',
  },
};
