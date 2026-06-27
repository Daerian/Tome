/**
 * Pure functions for building and merging Scriptorium prep items.
 *
 * Extracted from SessionPrep.savePlan() so the logic can be unit-tested
 * independently of Supabase calls and React state.
 */

/**
 * Build the list of prep items derived from Scriptorium output.
 *
 * Rules:
 * - NPC highlights → character items (deduped by name)
 * - Selected encounter locations → location items (deduped, case-insensitive)
 * - Selected combat encounters → monster items (deduped by enemy string)
 * - NPCs from selected rp/puzzle encounters not already added → character items
 *
 * @param {Array}  npcHighlights  - [{name, role}] from AI output
 * @param {Object} candidates     - {rp: [...], combat: [...], puzzle: [...]}
 * @param {Object} selections     - {rp: Set<number>, combat: Set<number>, puzzle: Set<number>}
 * @returns {Array} prep item objects with from_scriptorium: true
 */
export function buildScriptoriumPrepItems(
  npcHighlights,
  candidates,
  selections,
) {
  const items = [];
  const seen = new Set();

  // NPC highlights → character items
  for (const npc of npcHighlights ?? []) {
    if (!seen.has(npc.name)) {
      seen.add(npc.name);
      items.push({
        type: 'character',
        name: npc.name,
        description: npc.role || null,
        stats: null,
        from_scriptorium: true,
      });
    }
  }

  // Selected encounters → location, monster, and extra NPC items
  for (const encType of ['rp', 'combat', 'puzzle']) {
    for (const idx of selections?.[encType] ?? []) {
      const enc = candidates?.[encType]?.[idx];
      if (!enc) continue;

      // Location (all types, case-insensitive dedup)
      if (enc.location) {
        const key = `loc:${enc.location.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          items.push({
            type: 'location',
            name: enc.location,
            description: enc.title,
            stats: null,
            from_scriptorium: true,
          });
        }
      }

      // Enemies (combat only)
      if (encType === 'combat' && enc.enemies) {
        const key = `monster:${enc.enemies}`;
        if (!seen.has(key)) {
          seen.add(key);
          items.push({
            type: 'monster',
            name: enc.enemies,
            description: enc.title,
            stats: enc.difficulty ? `Difficulty: ${enc.difficulty}` : null,
            from_scriptorium: true,
          });
        }
      }

      // Extra NPCs from rp/puzzle encounters
      if (
        (encType === 'rp' || encType === 'puzzle') &&
        Array.isArray(enc.npcs_involved)
      ) {
        for (const npcName of enc.npcs_involved) {
          if (!seen.has(npcName)) {
            seen.add(npcName);
            items.push({
              type: 'character',
              name: npcName,
              description: enc.title,
              stats: null,
              from_scriptorium: true,
            });
          }
        }
      }
    }
  }

  return items;
}

/**
 * Merge Scriptorium-generated items with manually-added items.
 * Scriptorium items replace all previous Scriptorium items;
 * manual items (from_scriptorium falsy) are always preserved.
 *
 * @param {Array} scriptoriumItems - built by buildScriptoriumPrepItems()
 * @param {Array} existingItems    - current sessions.prep_items value
 * @returns {Array} merged list: scriptorium items first, then manual items
 */
export function mergePrepItems(scriptoriumItems, existingItems) {
  const manual = (existingItems ?? []).filter((it) => !it.from_scriptorium);
  return [...scriptoriumItems, ...manual];
}
