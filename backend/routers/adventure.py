"""
Adventure router — serves adventure module content for the viewer panel.

Wraps the existing 5etools adventure fetching logic so the frontend can
display table-of-contents and section content without going through the LLM.
"""

from fastapi import APIRouter, Query
from tools.fivetools_tools import ADVENTURE_MAP, _fetch_file, _clean_entry

router = APIRouter()


@router.get("/adventure/{code}/toc")
async def adventure_toc(code: str):
    """Return the table of contents for an adventure module."""
    code_lower = code.lower()
    if code_lower not in ADVENTURE_MAP:
        available = {k: v[0] for k, v in ADVENTURE_MAP.items()}
        return {"error": f"Unknown adventure code '{code}'", "available": available}

    adv_name, adv_path = ADVENTURE_MAP[code_lower]
    entities = await _fetch_file(adv_path, "data")

    if not entities:
        return {"error": f"Could not load adventure data for '{adv_name}'."}

    sections = []
    for i, s in enumerate(entities):
        sections.append({
            "index": i,
            "name": s.get("name", f"Section {i + 1}"),
            "page": s.get("page", None),
        })

    return {"name": adv_name, "code": code_lower, "sections": sections}


@router.get("/adventure/{code}/section")
async def adventure_section(code: str, name: str = Query(...)):
    """Return the content of a specific adventure section."""
    code_lower = code.lower()
    if code_lower not in ADVENTURE_MAP:
        return {"error": f"Unknown adventure code '{code}'"}

    adv_name, adv_path = ADVENTURE_MAP[code_lower]
    entities = await _fetch_file(adv_path, "data")

    if not entities:
        return {"error": f"Could not load adventure data for '{adv_name}'."}

    name_lower = name.lower()
    match = None
    for s in entities:
        if name_lower in s.get("name", "").lower():
            match = s
            break

    if not match:
        names = [s.get("name", "?") for s in entities]
        return {"error": f"No section matching '{name}'", "available": names}

    content = _clean_entry(match)

    return {
        "title": match.get("name", "?"),
        "adventure": adv_name,
        "content": content,
    }
