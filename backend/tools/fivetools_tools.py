"""
5etools compendium tools — D&D 5e lookups via the 5etools GitHub repository.

These tools fetch JSON data files from the 5etools-mirror-3 GitHub repo,
cache them in memory, and search/format the results. Covers ALL official
sourcebooks (not just SRD). Defined as async functions (HTTP calls via httpx).
"""

import json
import re
import time

import httpx

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

FIVETOOLS_RAW = (
    "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data"
)
TIMEOUT = 15.0

SCHOOL_MAP = {
    "A": "Abjuration",
    "C": "Conjuration",
    "D": "Divination",
    "E": "Enchantment",
    "I": "Illusion",
    "N": "Necromancy",
    "T": "Transmutation",
    "V": "Evocation",
}

SOURCE_MAP = {
    "PHB": "Player's Handbook",
    "MM": "Monster Manual",
    "DMG": "Dungeon Master's Guide",
    "XGE": "Xanathar's Guide to Everything",
    "TCE": "Tasha's Cauldron of Everything",
    "VGM": "Volo's Guide to Monsters",
    "MTF": "Mordenkainen's Tome of Foes",
    "MPMM": "Mordenkainen Presents: Monsters of the Multiverse",
    "FTD": "Fizban's Treasury of Dragons",
    "XPHB": "2024 Player's Handbook",
    "XMM": "2024 Monster Manual",
    "XDMG": "2024 Dungeon Master's Guide",
    "EGW": "Explorer's Guide to Wildemount",
    "GGR": "Guildmasters' Guide to Ravnica",
    "AI": "Acquisitions Incorporated",
    "SCC": "Strixhaven: A Curriculum of Chaos",
    "BAM": "Boo's Astral Menagerie",
    "BGG": "Bigby Presents: Glory of the Giants",
    "BMT": "The Book of Many Things",
    "ERLW": "Eberron: Rising from the Last War",
}

# File maps: source code (lowercase) -> relative path under data/
BESTIARY_FILE_MAP = {
    "mm": "bestiary/bestiary-mm.json",
    "xmm": "bestiary/bestiary-xmm.json",
    "vgm": "bestiary/bestiary-vgm.json",
    "mtf": "bestiary/bestiary-mtf.json",
    "mpmm": "bestiary/bestiary-mpmm.json",
    "ftd": "bestiary/bestiary-ftd.json",
    "bam": "bestiary/bestiary-bam.json",
    "bgg": "bestiary/bestiary-bgg.json",
    "cos": "bestiary/bestiary-cos.json",
    "bgdia": "bestiary/bestiary-bgdia.json",
    "skt": "bestiary/bestiary-skt.json",
    "toa": "bestiary/bestiary-toa.json",
    "egw": "bestiary/bestiary-egw.json",
    "ggr": "bestiary/bestiary-ggr.json",
    "erlw": "bestiary/bestiary-erlw.json",
    "idrotf": "bestiary/bestiary-idrotf.json",
    "wdmm": "bestiary/bestiary-wdmm.json",
    "oota": "bestiary/bestiary-oota.json",
}

SPELL_FILE_MAP = {
    "phb": "spells/spells-phb.json",
    "xphb": "spells/spells-xphb.json",
    "xge": "spells/spells-xge.json",
    "tce": "spells/spells-tce.json",
    "egw": "spells/spells-egw.json",
    "ggr": "spells/spells-ggr.json",
    "ftd": "spells/spells-ftd.json",
    "scc": "spells/spells-scc.json",
    "ai": "spells/spells-ai.json",
}

# Priority order for searching when no source is specified
BESTIARY_SEARCH_ORDER = ["mm", "xmm", "mpmm", "vgm", "mtf", "ftd", "bam", "bgg"]
SPELL_SEARCH_ORDER = ["phb", "xphb", "xge", "tce"]

# Edition-specific search orders
# 2024 sources use "X" prefix: XPHB, XMM, XDMG
# 2014 sources are the originals: PHB, MM, plus supplements
BESTIARY_2014_ORDER = ["mm", "mpmm", "vgm", "mtf", "ftd", "bam", "bgg"]
BESTIARY_2024_ORDER = ["xmm"]
SPELL_2014_ORDER = ["phb", "xge", "tce"]
SPELL_2024_ORDER = ["xphb"]

ADVENTURE_MAP = {
    "cos": ("Curse of Strahd", "adventure/adventure-cos.json"),
    "bgdia": ("Baldur's Gate: Descent into Avernus", "adventure/adventure-bgdia.json"),
    "skt": ("Storm King's Thunder", "adventure/adventure-skt.json"),
    "toa": ("Tomb of Annihilation", "adventure/adventure-toa.json"),
    "oota": ("Out of the Abyss", "adventure/adventure-oota.json"),
    "hotdq": ("Hoard of the Dragon Queen", "adventure/adventure-hotdq.json"),
    "rot": ("Rise of Tiamat", "adventure/adventure-rot.json"),
    "pota": ("Princes of the Apocalypse", "adventure/adventure-pota.json"),
    "lmop": ("Lost Mine of Phandelver", "adventure/adventure-lmop.json"),
    "wdh": ("Waterdeep: Dragon Heist", "adventure/adventure-wdh.json"),
    "wdmm": ("Waterdeep: Dungeon of the Mad Mage", "adventure/adventure-wdmm.json"),
    "gos": ("Ghosts of Saltmarsh", "adventure/adventure-gos.json"),
    "idrotf": (
        "Icewind Dale: Rime of the Frostmaiden",
        "adventure/adventure-idrotf.json",
    ),
    "cm": ("Candlekeep Mysteries", "adventure/adventure-cm.json"),
    "wbtw": ("The Wild Beyond the Witchlight", "adventure/adventure-wbtw.json"),
    "dsotdq": (
        "Dragonlance: Shadow of the Dragon Queen",
        "adventure/adventure-dsotdq.json",
    ),
    "pabtso": (
        "Phandelver and Below: The Shattered Obelisk",
        "adventure/adventure-pabtso.json",
    ),
    "dip": ("Dragon of Icespire Peak", "adventure/adventure-dip.json"),
}


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

_cache: dict[str, tuple[float, list[dict]]] = {}
_CACHE_TTL = 3600  # 1 hour


async def _fetch_file(path: str, entity_key: str | None = None) -> list[dict]:
    """Fetch a 5etools JSON file from GitHub and cache the result.

    Parameters
    ----------
    path : str
        Relative path under the data/ folder (e.g. "bestiary/bestiary-mm.json").
    entity_key : str | None
        The top-level JSON key containing the entity array (e.g. "monster").
        If None, auto-detects the first list-of-dicts value.

    Returns an empty list on HTTP errors (404, timeout, etc.).
    """
    now = time.time()
    cache_key = path
    if cache_key in _cache and (now - _cache[cache_key][0]) < _CACHE_TTL:
        return _cache[cache_key][1]

    url = f"{FIVETOOLS_RAW}/{path}"
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            res = await client.get(url)
            res.raise_for_status()
            data = res.json()
    except (httpx.HTTPError, ValueError):
        return []

    entities: list[dict] = []
    if entity_key and entity_key in data:
        entities = data[entity_key]
    else:
        for value in data.values():
            if isinstance(value, list) and value and isinstance(value[0], dict):
                entities = value
                break

    _cache[cache_key] = (now, entities)
    return entities


# ---------------------------------------------------------------------------
# Markup cleaner
# ---------------------------------------------------------------------------

_TAG_RE = re.compile(r"\{@\w+\s+([^}]*)}")


def _strip_tags(text: str) -> str:
    """Strip 5etools {@tag content|extra} markup, keeping the display text."""

    def _replace(m: re.Match) -> str:
        return m.group(1).split("|")[0]

    return _TAG_RE.sub(_replace, text)


def _clean_entry(entry) -> str:
    """Recursively clean a 5etools entry into readable text."""
    if isinstance(entry, str):
        return _strip_tags(entry)

    if isinstance(entry, list):
        parts = [_clean_entry(e) for e in entry]
        return "\n".join(p for p in parts if p)

    if isinstance(entry, dict):
        entry_type = entry.get("type", "")

        if entry_type in ("entries", "section", "inset", "insetReadaloud"):
            name = entry.get("name", "")
            inner = _clean_entry(entry.get("entries", []))
            if name:
                return f"**{name}**\n{inner}"
            return inner

        if entry_type == "list":
            items = entry.get("items", [])
            return "\n".join(f"- {_clean_entry(i)}" for i in items)

        if entry_type == "table":
            caption = entry.get("caption", "")
            cols = entry.get("colLabels", [])
            rows = entry.get("rows", [])
            lines = []
            if caption:
                lines.append(f"Table: {caption}")
            if cols:
                lines.append(" | ".join(str(c) for c in cols))
            for row in rows[:10]:
                lines.append(" | ".join(_strip_tags(str(cell)) for cell in row))
            if len(rows) > 10:
                lines.append(f"... ({len(rows)} rows total)")
            return "\n".join(lines)

        if entry_type == "quote":
            text = _clean_entry(entry.get("entries", []))
            by = entry.get("by", "")
            return f"> {text}\n> — {by}" if by else f"> {text}"

        # Fallback: try entries, then stringify
        if "entries" in entry:
            return _clean_entry(entry["entries"])
        return ""

    return str(entry)


# ---------------------------------------------------------------------------
# Formatters
# ---------------------------------------------------------------------------


def _format_monster(m: dict) -> str:
    """Format a 5etools monster entry into a readable stat block."""
    lines = [f"### {m['name']}"]
    lines.append(
        f"*Source: {SOURCE_MAP.get(m.get('source', ''), m.get('source', '?'))}*"
    )

    # Size / type / alignment
    size = ", ".join(m.get("size", []))
    mtype = m.get("type", "")
    if isinstance(mtype, dict):
        mtype = mtype.get("type", "?")
    alignment = ", ".join(m.get("alignment", []))
    lines.append(f"{size} {mtype}, {alignment}")

    # AC
    ac_raw = m.get("ac", [])
    ac_parts = []
    for a in ac_raw:
        if isinstance(a, int):
            ac_parts.append(str(a))
        elif isinstance(a, dict):
            ac_parts.append(
                f"{a.get('ac', '?')} ({_strip_tags(', '.join(a.get('from', [])))})"
                if a.get("from")
                else str(a.get("ac", "?"))
            )
    lines.append(f"AC: {', '.join(ac_parts) or '?'}")

    # HP
    hp = m.get("hp", {})
    if isinstance(hp, dict):
        lines.append(f"HP: {hp.get('average', '?')} ({hp.get('formula', '?')})")

    # Speed
    speed = m.get("speed", {})
    speed_parts = []
    if isinstance(speed, dict):
        speed_parts = [
            f"{k} {v} ft." if isinstance(v, int) else f"{k} {v}"
            for k, v in speed.items()
        ]
        lines.append(f"Speed: {', '.join(speed_parts)}")

    # Ability scores
    lines.append(
        f"STR {m.get('str', '?')} | DEX {m.get('dex', '?')} | "
        f"CON {m.get('con', '?')} | INT {m.get('int', '?')} | "
        f"WIS {m.get('wis', '?')} | CHA {m.get('cha', '?')}"
    )

    # CR
    cr = m.get("cr", "?")
    if isinstance(cr, dict):
        cr = cr.get("cr", "?")
    lines.append(f"CR: {cr}")

    # Senses / Languages
    if m.get("senses"):
        senses = m["senses"]
        if isinstance(senses, list):
            senses = ", ".join(senses)
        lines.append(f"Senses: {senses}")
    if m.get("passive"):
        lines.append(f"Passive Perception: {m['passive']}")
    if m.get("languages"):
        langs = m["languages"]
        if isinstance(langs, list):
            langs = ", ".join(langs)
        lines.append(f"Languages: {langs}")

    # Traits
    for trait in m.get("trait", []):
        lines.append(f"\n**{trait['name']}**: {_clean_entry(trait.get('entries', []))}")

    # Actions
    if m.get("action"):
        lines.append("\n**Actions:**")
        for action in m["action"]:
            lines.append(
                f"**{action['name']}**: {_clean_entry(action.get('entries', []))}"
            )

    # Reactions
    for reaction in m.get("reaction", []):
        lines.append(
            f"\n**Reaction — {reaction['name']}**: "
            f"{_clean_entry(reaction.get('entries', []))}"
        )

    # Legendary actions
    if m.get("legendary"):
        lines.append("\n**Legendary Actions:**")
        for la in m["legendary"]:
            lines.append(
                f"- **{la.get('name', 'Action')}**: "
                f"{_clean_entry(la.get('entries', []))}"
            )

    text = "\n".join(lines)

    # Append structured JSON for frontend interactive rendering
    senses = m.get("senses")
    if isinstance(senses, list):
        senses = ", ".join(senses)
    langs = m.get("languages")
    if isinstance(langs, list):
        langs = ", ".join(langs)

    statblock = {
        "name": m.get("name", "Unknown"),
        "source": SOURCE_MAP.get(m.get("source", ""), m.get("source", "?")),
        "size": size,
        "type": mtype,
        "alignment": alignment,
        "ac": ", ".join(ac_parts) if ac_parts else "?",
        "hp": m.get("hp", {}),
        "speed": ", ".join(speed_parts) if speed_parts else "?",
        "str": m.get("str", "?"),
        "dex": m.get("dex", "?"),
        "con": m.get("con", "?"),
        "int": m.get("int", "?"),
        "wis": m.get("wis", "?"),
        "cha": m.get("cha", "?"),
        "cr": cr,
        "passive": m.get("passive"),
        "senses": senses,
        "languages": langs,
        "traits": [
            {"name": t["name"], "text": _clean_entry(t.get("entries", []))}
            for t in m.get("trait", [])
        ],
        "actions": [
            {"name": a["name"], "text": _clean_entry(a.get("entries", []))}
            for a in m.get("action", [])
        ],
        "reactions": [
            {"name": r["name"], "text": _clean_entry(r.get("entries", []))}
            for r in m.get("reaction", [])
        ],
        "legendary": [
            {
                "name": la.get("name", "Action"),
                "text": _clean_entry(la.get("entries", [])),
            }
            for la in m.get("legendary", [])
        ],
    }
    text += f"\n[STATBLOCK]{json.dumps(statblock)}[/STATBLOCK]"

    return text


def _format_spell(s: dict) -> str:
    """Format a 5etools spell entry into readable text."""
    level = s.get("level", 0)
    school = SCHOOL_MAP.get(s.get("school", ""), s.get("school", "?"))
    level_str = "Cantrip" if level == 0 else f"Level {level}"

    lines = [f"### {s['name']}"]
    lines.append(
        f"*{level_str} {school} — Source: "
        f"{SOURCE_MAP.get(s.get('source', ''), s.get('source', '?'))}*"
    )

    # Casting time
    times = s.get("time", [])
    if times:
        t = times[0]
        lines.append(f"Casting Time: {t.get('number', '?')} {t.get('unit', '?')}")

    # Range
    rng = s.get("range", {})
    rng_type = rng.get("type", "")
    dist = rng.get("distance", {})
    if rng_type in ("point", "radius", "sphere", "cone", "line", "cube"):
        lines.append(f"Range: {dist.get('amount', '?')} {dist.get('type', 'feet')}")
    elif rng_type == "self":
        lines.append("Range: Self")
    elif rng_type == "touch":
        lines.append("Range: Touch")
    else:
        lines.append(f"Range: {rng_type}")

    # Components
    comp = s.get("components", {})
    comp_parts = []
    if comp.get("v"):
        comp_parts.append("V")
    if comp.get("s"):
        comp_parts.append("S")
    if comp.get("m"):
        mat = comp["m"]
        if isinstance(mat, dict):
            mat = mat.get("text", str(mat))
        comp_parts.append(f"M ({mat})")
    lines.append(f"Components: {', '.join(comp_parts) or 'None'}")

    # Duration
    durations = s.get("duration", [])
    if durations:
        d = durations[0]
        dtype = d.get("type", "?")
        if dtype == "instant":
            lines.append("Duration: Instantaneous")
        elif dtype == "permanent":
            lines.append("Duration: Permanent")
        elif dtype == "timed":
            lines.append(
                f"Duration: {d.get('duration', {}).get('amount', '?')} "
                f"{d.get('duration', {}).get('type', '?')}"
                f"{' (concentration)' if d.get('concentration') else ''}"
            )
        else:
            lines.append(f"Duration: {dtype}")

    # Description
    entries = s.get("entries", [])
    if entries:
        lines.append("")
        lines.append(_clean_entry(entries))

    # At higher levels
    higher = s.get("entriesHigherLevel", [])
    if higher:
        lines.append(f"\nAt Higher Levels: {_clean_entry(higher)}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------


async def lookup_5etools_monster(name: str, source: str = "", edition: str = "") -> str:
    """Look up a D&D 5e monster from the 5etools compendium. Covers ALL official
    sourcebooks including non-SRD content (Volo's, Mordenkainen's, adventure
    modules, etc.). Use 'source' to filter by book code (e.g. 'MM', 'VGM',
    'XMM'). Use 'edition' ('2014' or '2024') to restrict to that edition's
    sourcebooks. Returns a full stat block."""

    name_lower = name.lower()
    source_lower = source.lower()

    if source_lower and source_lower in BESTIARY_FILE_MAP:
        files_to_search = [source_lower]
    elif edition == "2024":
        files_to_search = BESTIARY_2024_ORDER
    elif edition == "2014":
        files_to_search = BESTIARY_2014_ORDER
    else:
        files_to_search = BESTIARY_SEARCH_ORDER

    matches = []
    for src_key in files_to_search:
        path = BESTIARY_FILE_MAP.get(src_key)
        if not path:
            continue
        entities = await _fetch_file(path, "monster")
        for m in entities:
            if name_lower in m.get("name", "").lower():
                matches.append(m)
                if len(matches) >= 3:
                    break
        if matches:
            break

    if not matches:
        return f"No monsters found matching '{name}' in the 5etools compendium."

    return "\n\n".join(_format_monster(m) for m in matches)


async def lookup_5etools_spell(name: str, source: str = "", edition: str = "") -> str:
    """Look up a D&D 5e spell from the 5etools compendium. Covers ALL official
    sourcebooks including non-SRD content (Xanathar's, Tasha's, etc.). Use
    'source' to filter by book code (e.g. 'PHB', 'XGE', 'TCE'). Use 'edition'
    ('2014' or '2024') to restrict to that edition's sourcebooks."""

    name_lower = name.lower()
    source_lower = source.lower()

    if source_lower and source_lower in SPELL_FILE_MAP:
        files_to_search = [source_lower]
    elif edition == "2024":
        files_to_search = SPELL_2024_ORDER
    elif edition == "2014":
        files_to_search = SPELL_2014_ORDER
    else:
        files_to_search = SPELL_SEARCH_ORDER

    matches = []
    for src_key in files_to_search:
        path = SPELL_FILE_MAP.get(src_key)
        if not path:
            continue
        entities = await _fetch_file(path, "spell")
        for s in entities:
            if name_lower in s.get("name", "").lower():
                matches.append(s)
                if len(matches) >= 3:
                    break
        if matches:
            break

    if not matches:
        return f"No spells found matching '{name}' in the 5etools compendium."

    return "\n\n".join(_format_spell(s) for s in matches)


async def lookup_5etools_item(name: str) -> str:
    """Look up a D&D 5e item (mundane or magic) from the 5etools compendium.
    Covers equipment, weapons, armor, and magic items from all sourcebooks."""

    name_lower = name.lower()
    matches = []

    # Search base items first, then magic items
    for path, key in [
        ("items-base.json", "baseitem"),
        ("items.json", "item"),
    ]:
        entities = await _fetch_file(path, key)
        for item in entities:
            if name_lower in item.get("name", "").lower():
                matches.append(item)
                if len(matches) >= 3:
                    break
        if matches:
            break

    if not matches:
        return f"No items found matching '{name}' in the 5etools compendium."

    lines = []
    for item in matches:
        lines.append(f"### {item['name']}")
        lines.append(
            f"*Source: {SOURCE_MAP.get(item.get('source', ''), item.get('source', '?'))}*"
        )
        if item.get("type"):
            lines.append(f"Type: {item['type']}")
        if item.get("rarity") and item["rarity"] != "none":
            lines.append(f"Rarity: {item['rarity']}")
        if item.get("weight"):
            lines.append(f"Weight: {item['weight']} lb.")
        if item.get("value"):
            # Value is in copper pieces
            cp = item["value"]
            if cp >= 100:
                lines.append(f"Value: {cp // 100} gp")
            elif cp >= 10:
                lines.append(f"Value: {cp // 10} sp")
            else:
                lines.append(f"Value: {cp} cp")
        if item.get("dmg1"):
            lines.append(f"Damage: {item['dmg1']} {item.get('dmgType', '')}")
        if item.get("ac"):
            lines.append(f"AC: {item['ac']}")
        entries = item.get("entries", []) or item.get("additionalEntries", [])
        if entries:
            lines.append("")
            lines.append(_clean_entry(entries))
        lines.append("")

    return "\n".join(lines)


async def lookup_5etools_feat(name: str) -> str:
    """Look up a D&D 5e feat from the 5etools compendium. Returns prerequisites
    and full description. Covers feats from all official sourcebooks."""

    name_lower = name.lower()
    entities = await _fetch_file("feats.json", "feat")

    matches = [f for f in entities if name_lower in f.get("name", "").lower()][:3]

    if not matches:
        return f"No feats found matching '{name}' in the 5etools compendium."

    lines = []
    for feat in matches:
        lines.append(f"### {feat['name']}")
        lines.append(
            f"*Source: {SOURCE_MAP.get(feat.get('source', ''), feat.get('source', '?'))}*"
        )

        # Prerequisites
        prereqs = feat.get("prerequisite", [])
        if prereqs:
            prereq_parts = []
            for p in prereqs:
                if p.get("ability"):
                    for ability in p["ability"]:
                        for stat, val in ability.items():
                            prereq_parts.append(f"{stat.upper()} {val}+")
                if p.get("level"):
                    prereq_parts.append(f"Level {p['level']}")
                if p.get("race"):
                    for r in p["race"]:
                        prereq_parts.append(r.get("name", str(r)))
                if p.get("spellcasting"):
                    prereq_parts.append("Spellcasting ability")
            if prereq_parts:
                lines.append(f"Prerequisites: {', '.join(prereq_parts)}")

        entries = feat.get("entries", [])
        if entries:
            lines.append("")
            lines.append(_clean_entry(entries))
        lines.append("")

    return "\n".join(lines)


async def browse_5etools_adventure(adventure: str, section: str = "") -> str:
    """Browse a D&D adventure module from the 5etools compendium. Provide the
    adventure code (e.g. 'cos' for Curse of Strahd, 'bgdia' for Descent into
    Avernus, 'lmop' for Lost Mine of Phandelver). Without a section name,
    returns the list of chapters/sections. With a section name, returns that
    section's content.

    Available adventures: cos, bgdia, skt, toa, oota, hotdq, rot, pota, lmop,
    wdh, wdmm, gos, idrotf, cm, wbtw, dsotdq, pabtso, dip"""

    adv_lower = adventure.lower()
    if adv_lower not in ADVENTURE_MAP:
        available = ", ".join(f"{k} ({v[0]})" for k, v in ADVENTURE_MAP.items())
        return f"Unknown adventure code '{adventure}'. Available: {available}"

    adv_name, adv_path = ADVENTURE_MAP[adv_lower]
    entities = await _fetch_file(adv_path, "data")

    if not entities:
        return f"Could not load adventure data for '{adv_name}'."

    if not section:
        # List top-level sections
        lines = [f"### {adv_name} — Table of Contents\n"]
        for i, s in enumerate(entities):
            name = s.get("name", f"Section {i + 1}")
            page = s.get("page", "")
            page_str = f" (p. {page})" if page else ""
            lines.append(f"{i + 1}. {name}{page_str}")
        return "\n".join(lines)

    # Find matching section
    section_lower = section.lower()
    match = None
    for s in entities:
        if section_lower in s.get("name", "").lower():
            match = s
            break

    if not match:
        names = [s.get("name", "?") for s in entities]
        return (
            f"No section matching '{section}' in {adv_name}. "
            f"Available sections: {', '.join(names)}"
        )

    content = _clean_entry(match)
    # Cap output to prevent massive responses
    if len(content) > 4000:
        content = (
            content[:4000] + "\n\n... (section truncated — ask about a specific part)"
        )

    return f"### {adv_name} — {match.get('name', '?')}\n\n{content}"


async def browse_5etools_source(
    source: str,
    content_type: str = "monster",
) -> str:
    """Browse content from a specific D&D sourcebook. Lists entries from that
    book (names and brief info, not full stat blocks).

    source: Book code (e.g. 'MM', 'PHB', 'XGE', 'TCE', 'VGM', 'MTF').
    content_type: One of 'monster', 'spell', 'item', or 'feat'."""

    source_lower = source.lower()
    source_upper = source.upper()
    source_name = SOURCE_MAP.get(source_upper, source_upper)

    if content_type == "monster":
        path = BESTIARY_FILE_MAP.get(source_lower)
        if not path:
            available = ", ".join(k.upper() for k in BESTIARY_FILE_MAP)
            return (
                f"No bestiary file for source '{source_upper}'. Available: {available}"
            )
        entities = await _fetch_file(path, "monster")
        lines = [f"### Monsters from {source_name}\n"]
        for m in entities:
            cr = m.get("cr", "?")
            if isinstance(cr, dict):
                cr = cr.get("cr", "?")
            mtype = m.get("type", "")
            if isinstance(mtype, dict):
                mtype = mtype.get("type", "?")
            lines.append(f"- {m['name']} (CR {cr}, {mtype})")
        if len(lines) > 52:
            total = len(lines) - 1
            lines = lines[:52]
            lines.append(
                f"\n*Showing 50 of {total} — use lookup_5etools_monster for full details*"
            )
        return "\n".join(lines)

    elif content_type == "spell":
        path = SPELL_FILE_MAP.get(source_lower)
        if not path:
            available = ", ".join(k.upper() for k in SPELL_FILE_MAP)
            return f"No spell file for source '{source_upper}'. Available: {available}"
        entities = await _fetch_file(path, "spell")
        lines = [f"### Spells from {source_name}\n"]
        for s in entities:
            level = s.get("level", 0)
            school = SCHOOL_MAP.get(s.get("school", ""), "?")
            level_str = "Cantrip" if level == 0 else f"Lvl {level}"
            lines.append(f"- {s['name']} ({level_str}, {school})")
        if len(lines) > 52:
            total = len(lines) - 1
            lines = lines[:52]
            lines.append(
                f"\n*Showing 50 of {total} — use lookup_5etools_spell for full details*"
            )
        return "\n".join(lines)

    elif content_type == "feat":
        entities = await _fetch_file("feats.json", "feat")
        filtered = [f for f in entities if f.get("source", "").upper() == source_upper]
        if not filtered:
            return f"No feats found from source '{source_upper}'."
        lines = [f"### Feats from {source_name}\n"]
        for f in filtered:
            lines.append(f"- {f['name']}")
        return "\n".join(lines)

    elif content_type == "item":
        entities = await _fetch_file("items-base.json", "baseitem")
        filtered = [i for i in entities if i.get("source", "").upper() == source_upper]
        if not filtered:
            return f"No items found from source '{source_upper}'."
        lines = [f"### Items from {source_name}\n"]
        for item in filtered[:50]:
            lines.append(f"- {item['name']}")
        if len(filtered) > 50:
            lines.append(f"\n*Showing 50 of {len(filtered)}*")
        return "\n".join(lines)

    else:
        return (
            f"Unknown content_type '{content_type}'. "
            "Use 'monster', 'spell', 'item', or 'feat'."
        )


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

ALL_5ETOOLS_TOOLS = [
    lookup_5etools_monster,
    lookup_5etools_spell,
    lookup_5etools_item,
    lookup_5etools_feat,
    browse_5etools_adventure,
    browse_5etools_source,
]
