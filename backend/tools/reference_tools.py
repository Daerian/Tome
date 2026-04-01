"""
Reference tools — D&D 5e lookups via the Open5e API.

These tools query ``https://api.open5e.com`` for official SRD content.
Defined as async functions since they make HTTP calls via httpx.
No dependencies needed — these are plain tools (no RunContext).
"""

import json

import httpx

OPEN5E_BASE = "https://api.open5e.com/v1"
DEFAULT_PARAMS = {"document__slug": "5esrd"}
TIMEOUT = 10.0


async def _get(path: str, params: dict | None = None) -> dict:
    """Helper to GET from Open5e with default params and timeout."""
    merged = {**DEFAULT_PARAMS, **(params or {})}
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        res = await client.get(f"{OPEN5E_BASE}/{path}/", params=merged)
        res.raise_for_status()
        return res.json()


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------


async def lookup_spell(name: str) -> str:
    """Look up a D&D 5e spell by name. Returns level, school, casting time,
    range, components, duration, and full description."""

    data = await _get("spells", {"search": name, "limit": 3})
    results = data.get("results", [])
    if not results:
        return f"No spells found matching '{name}'."

    lines = []
    for spell in results:
        lines.append(f"### {spell['name']}")
        lines.append(
            f"Level {spell.get('level_int', '?')} {spell.get('school', '?')} spell"
        )
        lines.append(f"Casting Time: {spell.get('casting_time', '?')}")
        lines.append(f"Range: {spell.get('range', '?')}")
        lines.append(f"Components: {spell.get('components', '?')}")
        lines.append(f"Duration: {spell.get('duration', '?')}")
        if spell.get("concentration") and spell["concentration"] != "no":
            lines.append("Concentration: Yes")
        desc = spell.get("desc", "No description.")
        lines.append(f"\n{desc}")
        if spell.get("higher_level"):
            lines.append(f"\nAt Higher Levels: {spell['higher_level']}")
        lines.append("")
    return "\n".join(lines)


async def lookup_monster(name: str, cr: str = "") -> str:
    """Look up a D&D 5e monster by name. Optionally filter by challenge
    rating (e.g. '3', '1/4'). Returns full stat block."""

    params = {"search": name, "limit": 3}
    if cr:
        params["cr"] = cr
    data = await _get("monsters", params)
    results = data.get("results", [])
    if not results:
        filter_str = f" matching '{name}'"
        if cr:
            filter_str += f" with CR {cr}"
        return f"No monsters found{filter_str}."

    lines = []
    for m in results:
        lines.append(f"### {m['name']}")
        lines.append(
            f"{m.get('size', '?')} {m.get('type', '?')}, {m.get('alignment', '?')}"
        )
        lines.append(f"CR: {m.get('challenge_rating', '?')} (XP: {m.get('xp', '?')})")
        lines.append(
            f"AC: {m.get('armor_class', '?')} | "
            f"HP: {m.get('hit_points', '?')} ({m.get('hit_dice', '?')})"
        )
        lines.append(f"Speed: {m.get('speed', {}).get('walk', '?')}")
        lines.append(
            f"STR {m.get('strength', '?')} | DEX {m.get('dexterity', '?')} | "
            f"CON {m.get('constitution', '?')} | INT {m.get('intelligence', '?')} | "
            f"WIS {m.get('wisdom', '?')} | CHA {m.get('charisma', '?')}"
        )
        if m.get("senses"):
            lines.append(f"Senses: {m['senses']}")
        if m.get("languages"):
            lines.append(f"Languages: {m['languages']}")

        # Special abilities
        for ability in m.get("special_abilities") or []:
            lines.append(f"\n**{ability['name']}**: {ability.get('desc', '')}")

        # Actions
        for action in m.get("actions") or []:
            lines.append(f"\n**{action['name']}**: {action.get('desc', '')}")

        # Legendary actions
        if m.get("legendary_actions"):
            lines.append("\n**Legendary Actions:**")
            if m.get("legendary_desc"):
                lines.append(m["legendary_desc"])
            for la in m["legendary_actions"]:
                lines.append(f"- **{la['name']}**: {la.get('desc', '')}")

        # Structured JSON for frontend interactive rendering
        speed = m.get("speed") or {}
        speed_parts = (
            [f"{k} {v}" for k, v in speed.items()] if isinstance(speed, dict) else []
        )
        statblock = {
            "name": m.get("name", "Unknown"),
            "source": "SRD 5.1",
            "size": m.get("size", "?"),
            "type": m.get("type", "?"),
            "alignment": m.get("alignment", "?"),
            "ac": str(m.get("armor_class", "?")),
            "hp": {
                "average": m.get("hit_points", "?"),
                "formula": m.get("hit_dice", "?"),
            },
            "speed": ", ".join(speed_parts) if speed_parts else "?",
            "str": m.get("strength", "?"),
            "dex": m.get("dexterity", "?"),
            "con": m.get("constitution", "?"),
            "int": m.get("intelligence", "?"),
            "wis": m.get("wisdom", "?"),
            "cha": m.get("charisma", "?"),
            "cr": m.get("challenge_rating", "?"),
            "passive": None,
            "senses": m.get("senses"),
            "languages": m.get("languages"),
            "traits": [
                {"name": a["name"], "text": a.get("desc", "")}
                for a in (m.get("special_abilities") or [])
            ],
            "actions": [
                {"name": a["name"], "text": a.get("desc", "")}
                for a in (m.get("actions") or [])
            ],
            "reactions": [
                {"name": r["name"], "text": r.get("desc", "")}
                for r in (m.get("reactions") or [])
            ],
            "legendary": [
                {"name": la["name"], "text": la.get("desc", "")}
                for la in (m.get("legendary_actions") or [])
            ],
        }
        lines.append(f"\n[STATBLOCK]{json.dumps(statblock)}[/STATBLOCK]")

        lines.append("")
    return "\n".join(lines)


async def lookup_item(name: str) -> str:
    """Look up a D&D 5e magic item by name. Returns rarity, type,
    attunement requirements, and description."""

    data = await _get("magicitems", {"search": name, "limit": 5})
    results = data.get("results", [])
    if not results:
        return f"No magic items found matching '{name}'."

    lines = []
    for item in results:
        lines.append(f"### {item['name']}")
        lines.append(
            f"Type: {item.get('type', '?')} | Rarity: {item.get('rarity', '?')}"
        )
        if item.get("requires_attunement") and item["requires_attunement"] != "":
            lines.append(f"Requires Attunement: {item['requires_attunement']}")
        desc = item.get("desc", "No description.")
        lines.append(f"\n{desc}")
        lines.append("")
    return "\n".join(lines)


async def lookup_condition(name: str) -> str:
    """Look up a D&D 5e condition by name (e.g. 'blinded', 'stunned').
    Returns the condition's effects."""

    data = await _get("conditions", {"search": name, "limit": 3})
    results = data.get("results", [])
    if not results:
        return f"No conditions found matching '{name}'."

    lines = []
    for cond in results:
        lines.append(f"### {cond['name']}")
        desc = cond.get("desc", "No description.")
        lines.append(desc)
        lines.append("")
    return "\n".join(lines)


async def lookup_class(name: str) -> str:
    """Look up a D&D 5e class by name (e.g. 'fighter', 'wizard'). Returns
    hit die, proficiencies, and class features overview."""

    data = await _get("classes", {"search": name, "limit": 2})
    results = data.get("results", [])
    if not results:
        return f"No classes found matching '{name}'."

    lines = []
    for cls in results:
        lines.append(f"### {cls['name']}")
        if cls.get("hit_dice"):
            lines.append(f"Hit Die: d{cls['hit_dice']}")
        if cls.get("prof_armor"):
            lines.append(f"Armor: {cls['prof_armor']}")
        if cls.get("prof_weapons"):
            lines.append(f"Weapons: {cls['prof_weapons']}")
        if cls.get("prof_saving_throws"):
            lines.append(f"Saving Throws: {cls['prof_saving_throws']}")
        if cls.get("prof_skills"):
            lines.append(f"Skills: {cls['prof_skills']}")
        if cls.get("desc"):
            desc = cls["desc"]
            if len(desc) > 500:
                desc = desc[:500] + "..."
            lines.append(f"\n{desc}")
        lines.append("")
    return "\n".join(lines)


async def lookup_race(name: str) -> str:
    """Look up a D&D 5e race by name (e.g. 'elf', 'dwarf'). Returns traits,
    ability score bonuses, and features."""

    data = await _get("races", {"search": name, "limit": 2})
    results = data.get("results", [])
    if not results:
        return f"No races found matching '{name}'."

    lines = []
    for race in results:
        lines.append(f"### {race['name']}")
        if race.get("speed"):
            speed = race["speed"]
            if isinstance(speed, dict):
                lines.append(f"Speed: {speed.get('walk', '?')} ft.")
            else:
                lines.append(f"Speed: {speed} ft.")
        if race.get("size"):
            lines.append(f"Size: {race['size']}")
        if race.get("asi_desc"):
            lines.append(f"Ability Score Increase: {race['asi_desc']}")
        if race.get("traits"):
            lines.append(f"\nTraits: {race['traits']}")
        if race.get("languages"):
            lines.append(f"Languages: {race['languages']}")
        lines.append("")
    return "\n".join(lines)


async def search_rules(query: str) -> str:
    """Search D&D 5e rules and rule sections by keyword. Use for general
    rules questions about combat, spellcasting, conditions, etc."""

    data = await _get("sections", {"search": query, "limit": 3})
    results = data.get("results", [])
    if not results:
        return f"No rules found matching '{query}'."

    lines = []
    for section in results:
        lines.append(f"### {section.get('name', 'Rule')}")
        if section.get("parent"):
            lines.append(f"Section: {section['parent']}")
        desc = section.get("desc", "No content.")
        if len(desc) > 800:
            desc = desc[:800] + "..."
        lines.append(desc)
        lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Export all reference tools as a list
# ---------------------------------------------------------------------------

ALL_REFERENCE_TOOLS = [
    lookup_spell,
    lookup_monster,
    lookup_item,
    lookup_condition,
    lookup_class,
    lookup_race,
    search_rules,
]
