import { describe, it, expect } from 'vitest';
import { buildScriptoriumPrepItems, mergePrepItems } from '../prepItems';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NPC_HIGHLIGHTS = [
  { name: 'Lord Vance', role: 'City commander' },
  { name: 'Mira', role: 'Informant' },
];

const CANDIDATES = {
  rp: [
    {
      title: 'A Tense Negotiation',
      description: 'Players parley with the merchant guild.',
      npcs_involved: ['Lord Vance', 'Guild Master'],
      location: 'The Gilded Hall',
      enemies: null,
      difficulty: null,
    },
  ],
  combat: [
    {
      title: 'Ambush at the Gate',
      description: 'Bandits spring a trap.',
      npcs_involved: [],
      location: 'City Gate',
      enemies: '3 Bandits, 1 Captain',
      difficulty: 'medium',
    },
  ],
  puzzle: [
    {
      title: 'The Sealed Vault',
      description: 'A locked vault must be opened.',
      npcs_involved: ['Mira'],
      location: 'Old Treasury',
      enemies: null,
      difficulty: null,
    },
  ],
};

const ALL_SELECTED = {
  rp: new Set([0]),
  combat: new Set([0]),
  puzzle: new Set([0]),
};

const NONE_SELECTED = {
  rp: new Set(),
  combat: new Set(),
  puzzle: new Set(),
};

// ---------------------------------------------------------------------------
// buildScriptoriumPrepItems
// ---------------------------------------------------------------------------

describe('buildScriptoriumPrepItems', () => {
  it('returns an empty array when everything is empty', () => {
    const result = buildScriptoriumPrepItems([], {}, NONE_SELECTED);
    expect(result).toEqual([]);
  });

  it('converts NPC highlights to character prep items', () => {
    const result = buildScriptoriumPrepItems(NPC_HIGHLIGHTS, {}, NONE_SELECTED);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      type: 'character',
      name: 'Lord Vance',
      description: 'City commander',
      stats: null,
      from_scriptorium: true,
    });
    expect(result[1]).toMatchObject({
      type: 'character',
      name: 'Mira',
      description: 'Informant',
      from_scriptorium: true,
    });
  });

  it('converts selected combat encounter to monster prep item', () => {
    const result = buildScriptoriumPrepItems([], CANDIDATES, ALL_SELECTED);
    const monster = result.find((i) => i.type === 'monster');
    expect(monster).toMatchObject({
      type: 'monster',
      name: '3 Bandits, 1 Captain',
      description: 'Ambush at the Gate',
      stats: 'Difficulty: medium',
      from_scriptorium: true,
    });
  });

  it('sets stats to null on monster with no difficulty', () => {
    const candidates = {
      ...CANDIDATES,
      combat: [{ ...CANDIDATES.combat[0], difficulty: null }],
    };
    const result = buildScriptoriumPrepItems([], candidates, ALL_SELECTED);
    const monster = result.find((i) => i.type === 'monster');
    expect(monster.stats).toBeNull();
  });

  it('converts selected encounter location to location prep item', () => {
    const result = buildScriptoriumPrepItems([], CANDIDATES, ALL_SELECTED);
    const locations = result.filter((i) => i.type === 'location');
    const names = locations.map((l) => l.name);
    expect(names).toContain('City Gate');
    expect(names).toContain('The Gilded Hall');
    expect(names).toContain('Old Treasury');
  });

  it('sets location description to the encounter title', () => {
    const result = buildScriptoriumPrepItems([], CANDIDATES, ALL_SELECTED);
    const gate = result.find((i) => i.name === 'City Gate');
    expect(gate.description).toBe('Ambush at the Gate');
  });

  it('adds NPCs from selected rp encounters as character items', () => {
    const result = buildScriptoriumPrepItems([], CANDIDATES, ALL_SELECTED);
    const names = result
      .filter((i) => i.type === 'character')
      .map((i) => i.name);
    expect(names).toContain('Guild Master');
  });

  it('adds NPCs from selected puzzle encounters as character items', () => {
    const result = buildScriptoriumPrepItems([], CANDIDATES, ALL_SELECTED);
    const names = result
      .filter((i) => i.type === 'character')
      .map((i) => i.name);
    expect(names).toContain('Mira');
  });

  it('does not add NPCs from combat encounters', () => {
    const candidates = {
      rp: [],
      combat: [
        { ...CANDIDATES.combat[0], npcs_involved: ['Should Not Appear'] },
      ],
      puzzle: [],
    };
    const selections = {
      rp: new Set(),
      combat: new Set([0]),
      puzzle: new Set(),
    };
    const result = buildScriptoriumPrepItems([], candidates, selections);
    const names = result.map((i) => i.name);
    expect(names).not.toContain('Should Not Appear');
  });

  it('deduplicates NPCs that appear in both highlights and encounter lists', () => {
    // Lord Vance is in highlights AND in the rp encounter npcs_involved
    const result = buildScriptoriumPrepItems(
      NPC_HIGHLIGHTS,
      CANDIDATES,
      ALL_SELECTED,
    );
    const vanceItems = result.filter((i) => i.name === 'Lord Vance');
    expect(vanceItems).toHaveLength(1);
  });

  it('deduplicates the same NPC appearing in multiple encounters', () => {
    const candidates = {
      rp: [
        {
          title: 'Enc A',
          description: '',
          npcs_involved: ['Shared NPC'],
          location: null,
        },
        {
          title: 'Enc B',
          description: '',
          npcs_involved: ['Shared NPC'],
          location: null,
        },
      ],
      combat: [],
      puzzle: [],
    };
    const selections = {
      rp: new Set([0, 1]),
      combat: new Set(),
      puzzle: new Set(),
    };
    const result = buildScriptoriumPrepItems([], candidates, selections);
    const dupes = result.filter((i) => i.name === 'Shared NPC');
    expect(dupes).toHaveLength(1);
  });

  it('deduplicates the same location appearing in multiple encounters (case-insensitive)', () => {
    const candidates = {
      rp: [
        {
          title: 'Enc A',
          description: '',
          npcs_involved: [],
          location: 'City Gate',
        },
      ],
      combat: [
        {
          title: 'Enc B',
          description: '',
          npcs_involved: [],
          location: 'city gate',
          enemies: 'Goblins',
          difficulty: 'easy',
        },
      ],
      puzzle: [],
    };
    const selections = {
      rp: new Set([0]),
      combat: new Set([0]),
      puzzle: new Set(),
    };
    const result = buildScriptoriumPrepItems([], candidates, selections);
    const locations = result.filter((i) => i.type === 'location');
    expect(locations).toHaveLength(1);
  });

  it('deduplicates the same enemy group across multiple combat encounters', () => {
    const candidates = {
      rp: [],
      combat: [
        {
          title: 'A',
          description: '',
          npcs_involved: [],
          location: null,
          enemies: 'Goblin Pack',
          difficulty: 'easy',
        },
        {
          title: 'B',
          description: '',
          npcs_involved: [],
          location: null,
          enemies: 'Goblin Pack',
          difficulty: 'hard',
        },
      ],
      puzzle: [],
    };
    const selections = {
      rp: new Set(),
      combat: new Set([0, 1]),
      puzzle: new Set(),
    };
    const result = buildScriptoriumPrepItems([], candidates, selections);
    const monsters = result.filter((i) => i.type === 'monster');
    expect(monsters).toHaveLength(1);
  });

  it('skips unselected encounter indices', () => {
    const selections = { rp: new Set(), combat: new Set(), puzzle: new Set() };
    const result = buildScriptoriumPrepItems([], CANDIDATES, selections);
    // Only NPC highlights contribute — but here we pass no highlights
    expect(result).toHaveLength(0);
  });

  it('handles encounters with null location gracefully', () => {
    const candidates = {
      rp: [
        { title: 'Enc', description: '', npcs_involved: [], location: null },
      ],
      combat: [],
      puzzle: [],
    };
    const selections = {
      rp: new Set([0]),
      combat: new Set(),
      puzzle: new Set(),
    };
    expect(() =>
      buildScriptoriumPrepItems([], candidates, selections),
    ).not.toThrow();
    const result = buildScriptoriumPrepItems([], candidates, selections);
    expect(result.filter((i) => i.type === 'location')).toHaveLength(0);
  });

  it('handles null/undefined npcHighlights gracefully', () => {
    const result = buildScriptoriumPrepItems(null, {}, NONE_SELECTED);
    expect(result).toEqual([]);
  });

  it('marks every returned item with from_scriptorium: true', () => {
    const result = buildScriptoriumPrepItems(
      NPC_HIGHLIGHTS,
      CANDIDATES,
      ALL_SELECTED,
    );
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((i) => i.from_scriptorium === true)).toBe(true);
  });

  it('places NPC highlights before encounter-derived items', () => {
    const result = buildScriptoriumPrepItems(
      NPC_HIGHLIGHTS,
      CANDIDATES,
      ALL_SELECTED,
    );
    const firstTwo = result.slice(0, 2).map((i) => i.name);
    expect(firstTwo).toContain('Lord Vance');
    expect(firstTwo).toContain('Mira');
  });
});

// ---------------------------------------------------------------------------
// mergePrepItems
// ---------------------------------------------------------------------------

describe('mergePrepItems', () => {
  const scriptoriumItems = [
    { type: 'monster', name: 'Goblin', from_scriptorium: true },
    { type: 'location', name: 'City Gate', from_scriptorium: true },
  ];

  it('returns only scriptorium items when existing list is empty', () => {
    expect(mergePrepItems(scriptoriumItems, [])).toEqual(scriptoriumItems);
  });

  it('returns only scriptorium items when existing list is null', () => {
    expect(mergePrepItems(scriptoriumItems, null)).toEqual(scriptoriumItems);
  });

  it('preserves manually-added items (from_scriptorium falsy)', () => {
    const manual = [
      { type: 'character', name: 'My NPC', from_scriptorium: false },
    ];
    const result = mergePrepItems(scriptoriumItems, manual);
    expect(result.map((i) => i.name)).toContain('My NPC');
  });

  it('removes stale scriptorium items from existing list', () => {
    const existing = [
      { type: 'monster', name: 'Old Dragon', from_scriptorium: true },
      { type: 'character', name: 'Manual NPC', from_scriptorium: false },
    ];
    const result = mergePrepItems(scriptoriumItems, existing);
    const names = result.map((i) => i.name);
    expect(names).not.toContain('Old Dragon');
    expect(names).toContain('Manual NPC');
  });

  it('places scriptorium items before manual items', () => {
    const manual = [
      { type: 'character', name: 'Manual', from_scriptorium: false },
    ];
    const result = mergePrepItems(scriptoriumItems, manual);
    expect(result[0].from_scriptorium).toBe(true);
    expect(result[result.length - 1].name).toBe('Manual');
  });

  it('returns empty array when both inputs are empty', () => {
    expect(mergePrepItems([], [])).toEqual([]);
  });

  it('handles items with undefined from_scriptorium as manual', () => {
    const existing = [{ type: 'character', name: 'Legacy Item' }];
    const result = mergePrepItems([], existing);
    expect(result.map((i) => i.name)).toContain('Legacy Item');
  });
});
