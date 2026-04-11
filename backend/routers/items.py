"""
Items router — 5e magic item search via 5etools GitHub mirror.

Provides a search endpoint for Treasury item lookup. Fetches and caches the
5etools items.json data file, then filters to magic items and supports
full-text name search and per-source filtering.

The source filter is designed to support a future feature where campaigns
can restrict which sourcebooks are allowed.
"""

import re
import time

import httpx
from fastapi import APIRouter, Query

router = APIRouter()

FIVETOOLS_RAW = (
    "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data"
)
TIMEOUT = 15.0

# ── Source display names ──────────────────────────────────────────────────────

SOURCE_MAP = {
    "PHB": "Player's Handbook (2014)",
    "DMG": "Dungeon Master's Guide (2014)",
    "XGE": "Xanathar's Guide to Everything",
    "TCE": "Tasha's Cauldron of Everything",
    "EGW": "Explorer's Guide to Wildemount",
    "GGR": "Guildmasters' Guide to Ravnica",
    "AI": "Acquisitions Incorporated",
    "ERLW": "Eberron: Rising from the Last War",
    "FTD": "Fizban's Treasury of Dragons",
    "SCC": "Strixhaven: A Curriculum of Chaos",
    "BGG": "Bigby Presents: Glory of the Giants",
    "BMT": "The Book of Many Things",
    "BAM": "Boo's Astral Menagerie",
    "XDMG": "Dungeon Master's Guide (2024)",
    "XPHB": "Player's Handbook (2024)",
    "IMR": "Infernal Machine Rebuild",
    "IDRotF": "Icewind Dale: Rime of the Frostmaiden",
    "CM": "Candlekeep Mysteries",
    "WBtW": "The Wild Beyond the Witchlight",
    "DSotDQ": "Dragonlance: Shadow of the Dragon Queen",
    "PaBTSO": "Phandelver and Below: The Shattered Obelisk",
    "CoS": "Curse of Strahd",
    "ToA": "Tomb of Annihilation",
    "SKT": "Storm King's Thunder",
    "OotA": "Out of the Abyss",
    "HotDQ": "Hoard of the Dragon Queen",
    "RoT": "Rise of Tiamat",
    "LMoP": "Lost Mine of Phandelver",
    "WDH": "Waterdeep: Dragon Heist",
    "WDMM": "Waterdeep: Dungeon of the Mad Mage",
}

# ── 5etools item type code → treasury item_type ───────────────────────────────

TYPE_MAP = {
    "W": "wondrous",
    "A": "armor",
    "LA": "armor",
    "MA": "armor",
    "HA": "armor",
    "M": "weapon",
    "R": "weapon",
    "S": "shield",
    "RD": "rod",
    "ST": "staff",
    "WD": "wand",
    "RG": "ring",
    "SC": "scroll",
    "P": "potion",
}

# ── Rarity normalisation (5etools uses spaces; treasury uses underscores) ─────

RARITY_MAP = {
    "common": "common",
    "uncommon": "uncommon",
    "rare": "rare",
    "very rare": "very_rare",
    "legendary": "legendary",
    "artifact": "artifact",
    "varies": "common",
    "none": "common",
    "unknown": "common",
    "unknown (magic)": "common",
}

# Rarities that indicate a magic item
_MAGIC_RARITIES = {
    "common",
    "uncommon",
    "rare",
    "very rare",
    "legendary",
    "artifact",
    "varies",
}

# ── Cache ─────────────────────────────────────────────────────────────────────

_cache: dict[str, tuple[float, list[dict]]] = {}
_CACHE_TTL = 3600  # 1 hour

# ── 5etools tag cleaner (shared with fivetools_tools.py pattern) ──────────────

_TAG_RE = re.compile(r"\{@\w+\s+([^}]*)}")


def _strip_tags(text: str) -> str:
    """Strip 5etools {@tag content|extra} markup, keeping the display text."""
    return _TAG_RE.sub(lambda m: m.group(1).split("|")[0], text)


def _clean_entry(entry) -> str:
    """Recursively flatten a 5etools entry tree into plain text."""
    if isinstance(entry, str):
        return _strip_tags(entry)
    if isinstance(entry, list):
        parts = [_clean_entry(e) for e in entry]
        return "\n".join(p for p in parts if p)
    if isinstance(entry, dict):
        t = entry.get("type", "")
        if t in ("entries", "section", "inset"):
            name = entry.get("name", "")
            inner = _clean_entry(entry.get("entries", []))
            return f"{name}\n{inner}".strip() if name else inner
        if t == "list":
            return "\n".join(f"- {_clean_entry(i)}" for i in entry.get("items", []))
        if t == "table":
            cols = entry.get("colLabels", [])
            rows = entry.get("rows", [])
            lines = []
            if cols:
                lines.append(" | ".join(str(c) for c in cols))
            for row in rows[:8]:
                lines.append(" | ".join(_strip_tags(str(cell)) for cell in row))
            return "\n".join(lines)
        if "entries" in entry:
            return _clean_entry(entry["entries"])
        return ""
    return str(entry)


# ── Data fetching ─────────────────────────────────────────────────────────────


async def _fetch_items() -> list[dict]:
    """Fetch and cache 5etools items.json. Returns raw item dicts."""
    now = time.time()
    cache_key = "items"
    if cache_key in _cache and (now - _cache[cache_key][0]) < _CACHE_TTL:
        return _cache[cache_key][1]

    url = f"{FIVETOOLS_RAW}/items.json"
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            res = await client.get(url)
            res.raise_for_status()
            data = res.json()
    except (httpx.HTTPError, httpx.RequestError, ValueError):
        return []

    items: list[dict] = data.get("item", [])
    _cache[cache_key] = (now, items)
    return items


def _is_magic(item: dict) -> bool:
    """Return True if the item is a magic item (not a mundane weapon/tool)."""
    rarity = item.get("rarity", "none")
    if rarity in _MAGIC_RARITIES:
        return True
    if item.get("wondrous"):
        return True
    return bool(item.get("reqAttune"))


def _format_item(item: dict) -> dict:
    """Normalise a raw 5etools item dict into the shape the frontend expects."""
    source = item.get("source", "")

    # Item type
    if item.get("wondrous"):
        item_type = "wondrous"
    else:
        item_type = TYPE_MAP.get(item.get("type", ""), "other")

    # Rarity
    rarity_raw = item.get("rarity", "none")
    rarity = RARITY_MAP.get(rarity_raw, "common")

    # requires_attunement — can be bool or a condition string
    req = item.get("reqAttune", False)
    requires_attunement = bool(req)
    attunement_note = req if isinstance(req, str) else None

    # Description
    description = _clean_entry(item.get("entries", [])).strip()
    if attunement_note:
        description = f"Requires attunement {attunement_note}.\n\n{description}".strip()

    return {
        "name": item.get("name", ""),
        "source": source,
        "source_full": SOURCE_MAP.get(source, source),
        "rarity": rarity,
        "item_type": item_type,
        "requires_attunement": requires_attunement,
        "description": description,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/items/search")
async def search_items(
    q: str = Query("", description="Item name search query (substring match)"),
    source: str = Query(
        "", description="Filter by source book abbreviation, e.g. DMG or XGE"
    ),
    limit: int = Query(20, ge=0, le=50, description="Max results to return"),
):
    """
    Search 5e magic items from the 5etools compendium.

    Returns a list of matching items plus the full list of available source
    books so the frontend can populate a source filter dropdown.

    The ``source`` parameter is designed to support a future campaign-level
    setting that restricts which sourcebooks are permitted — the frontend
    can pass the campaign's allowed sources here.
    """
    all_items = await _fetch_items()
    magic_items = [i for i in all_items if _is_magic(i)]

    # Build the source list from all magic items (used by the filter UI)
    source_codes = sorted({i.get("source", "") for i in magic_items if i.get("source")})
    available_sources = [
        {"code": s, "name": SOURCE_MAP.get(s, s)} for s in source_codes
    ]

    # Apply filters
    filtered = magic_items
    if source:
        filtered = [
            i for i in filtered if i.get("source", "").upper() == source.upper()
        ]
    if q:
        q_lower = q.lower().strip()
        filtered = [i for i in filtered if q_lower in i.get("name", "").lower()]

    filtered = sorted(filtered, key=lambda i: i.get("name", ""))

    results = [_format_item(i) for i in filtered[:limit]] if limit else []

    return {
        "results": results,
        "total": len(filtered),
        "available_sources": available_sources,
    }
