"""
Integration tests for the full session-prep-plan flow.

Unlike the unit tests in tests/routers/, these tests use a *stateful* mock DB
that records every write operation (update / insert / delete) so we can assert
on the exact payloads persisted to the database across a complete planning flow.

Key design decision: write operations (update/insert/delete) do NOT advance the
read-data counter, so calling an endpoint multiple times on the same mock does
not exhaust the read-data sequence.

Test scenarios:
- Full planning flow: routes → plan → encounter rewrite in sequence
- Prep-config DB write: shape, required keys, location in candidates
- Read-only endpoints: routes and encounter-rewrite never write to the DB
- Config is replaced (not accumulated) on a second plan call
- Response body matches what was written to DB
"""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from main import app
from routers.session_prep_plan import (
    EncounterSuggestion,
    LootSuggestion,
    NPCHighlight,
    SessionRoute,
)

# ---------------------------------------------------------------------------
# Stateful capturing mock — records every DB write, read-counter safe
# ---------------------------------------------------------------------------


class _TableChain:
    """
    Chainable proxy for one table access.

    - Read methods (select/eq/…) are no-ops that return self.
    - Write methods (update/insert/delete) stage the payload.
    - execute() either commits the staged write OR returns the next read value.
      Writes do NOT advance the read counter, so the same CapturingSB can be
      used across multiple endpoint calls without exhausting the read sequence.
    """

    def __init__(self, sb: "CapturingSB", name: str):
        self._sb = sb
        self._name = name
        self._pending: dict | None = None

    # Fluent read / filter methods
    def select(self, *a, **kw):
        return self

    def eq(self, *a, **kw):
        return self

    def neq(self, *a, **kw):
        return self

    def order(self, *a, **kw):
        return self

    def limit(self, *a, **kw):
        return self

    def single(self):
        return self

    def in_(self, *a, **kw):
        return self

    # Write methods
    def update(self, payload):
        self._pending = {"op": "update", "data": payload}
        return self

    def insert(self, payload):
        self._pending = {"op": "insert", "data": payload}
        return self

    def delete(self):
        self._pending = {"op": "delete", "data": None}
        return self

    def execute(self):
        if self._pending:
            # Write path — record, don't touch the read counter
            self._sb.written.setdefault(self._name, []).append(self._pending)
            self._pending = None
            return SimpleNamespace(data=None)

        # Read path — advance the sequential counter for this table
        values = self._sb._data.get(self._name)
        if isinstance(values, tuple):
            idx = self._sb._call_counts.get(self._name, 0)
            data = values[idx] if idx < len(values) else values[-1]
            self._sb._call_counts[self._name] = idx + 1
        else:
            data = values
        return SimpleNamespace(data=data)


class CapturingSB:
    """
    Supabase mock with two responsibilities:
      1. Return configured read data for each table (supports sequential tuple values).
      2. Record every write (update / insert / delete) in .written.
    """

    def __init__(self, table_data: dict):
        self._data = table_data
        self._call_counts: dict[str, int] = {}
        self.written: dict[str, list[dict]] = {}

    def table(self, name: str) -> _TableChain:
        return _TableChain(self, name)

    # Convenience helpers
    def updates_for(self, table: str) -> list[dict]:
        return [e["data"] for e in self.written.get(table, []) if e["op"] == "update"]

    def inserts_for(self, table: str) -> list:
        return [e["data"] for e in self.written.get(table, []) if e["op"] == "insert"]

    def deletes_for(self, table: str) -> list:
        return [e for e in self.written.get(table, []) if e["op"] == "delete"]


# ---------------------------------------------------------------------------
# Shared fixture data
# ---------------------------------------------------------------------------

CAMPAIGN = {
    "name": "Shattered Realms",
    "description": "A world torn apart.",
    "system": "D&D 5e",
}
SESSION = {
    "session_number": 5,
    "title": "The Siege",
    "status": "planned",
    "dm_notes": "Big battle incoming.",
    "in_world_start_date": "15 Flamerule",
    "in_world_end_date": None,
    "prep_brief": None,
    "prep_items": [],
}
ATTENDEE = {
    "character_id": "char-1",
    "characters": {
        "id": "char-1",
        "name": "Zara",
        "race": "Elf",
        "class": "Wizard",
        "level": 5,
        "description": "",
    },
}
NPC = {
    "id": "npc-1",
    "name": "Lord Vance",
    "type": "npc",
    "race": "Human",
    "class": "Fighter",
    "level": 10,
    "description": "Commander",
    "status": "alive",
}
MISSION = {
    "id": "m-1",
    "title": "Hold the Gate",
    "description": "Defend.",
    "type": "main",
    "status": "active",
    "priority": "critical",
    "reward_description": None,
}
BEAT = {
    "id": "b-1",
    "title": "Siege Begins",
    "description": "Enemy approaches.",
    "type": "cliffhanger",
    "status": "active",
}
LOCATION = {
    "id": "loc-1",
    "name": "City Gate",
    "type": "structure",
    "description": "Main gate.",
    "parent_location_id": None,
}
FACTION = {
    "name": "The Guard",
    "type": "military",
    "goals": "Protect.",
    "alignment": "lawful good",
}


def _full_sb(extra_session_reads: int = 0) -> CapturingSB:
    """
    Build a CapturingSB.

    build_plan_context() reads sessions twice: once for the current session
    (returns SESSION) and once for the prev-sessions list (returns []).
    Pass extra_session_reads to extend the sequence for tests that call
    build_plan_context more than once on the same sb instance.
    """
    # Base sequence: one current-session + one prev-sessions read
    session_seq: list = [SESSION, []]
    for _ in range(extra_session_reads):
        session_seq.extend([SESSION, []])

    return CapturingSB(
        {
            "campaigns": CAMPAIGN,
            "sessions": tuple(session_seq),
            "session_attendees": [ATTENDEE],
            "characters": [NPC],
            "missions": [MISSION],
            "story_beats": [BEAT],
            "locations": [LOCATION],
            "factions": [FACTION],
        }
    )


# ---------------------------------------------------------------------------
# AI output helpers — real Pydantic models so model_dump() is accurate
# ---------------------------------------------------------------------------


def _rp(location: str = "Tavern", npcs: list | None = None) -> EncounterSuggestion:
    return EncounterSuggestion(
        type="rp",
        title="A Tense Negotiation",
        description="Players parley.",
        npcs_involved=npcs or ["Lord Vance"],
        location=location,
    )


def _combat(
    location: str = "Market Alley",
    enemies: str = "3 Bandits",
    difficulty: str = "medium",
) -> EncounterSuggestion:
    return EncounterSuggestion(
        type="combat",
        title="Ambush",
        description="Bandits strike.",
        enemies=enemies,
        difficulty=difficulty,
        location=location,
    )


def _loot(name: str = "Gold Coins") -> LootSuggestion:
    return LootSuggestion(
        name=name, category="gold", description="Party reward.", source="Ambush"
    )


def _npc_highlight(name: str = "Lord Vance", role: str = "Commander") -> NPCHighlight:
    return NPCHighlight(name=name, role=role)


def _mock_plan_result(rp=None, combat=None, npcs=None, loot=None) -> MagicMock:
    out = MagicMock()
    out.rp_candidates = rp if rp is not None else [_rp()]
    out.combat_candidates = combat if combat is not None else [_combat()]
    out.puzzle_candidates = []
    out.npc_highlights = npcs if npcs is not None else [_npc_highlight()]
    out.loot_suggestions = loot if loot is not None else [_loot()]
    mock = MagicMock()
    mock.output = out
    return mock


def _mock_routes_result(n: int = 3) -> MagicMock:
    out = MagicMock()
    out.routes = [
        SessionRoute(title=f"Route {i}", description=f"Hook {i}") for i in range(n)
    ]
    mock = MagicMock()
    mock.output = out
    return mock


def _mock_encounter_result(location: str = "City Gate") -> MagicMock:
    enc = EncounterSuggestion(
        type="combat",
        title="Rewritten",
        description="New.",
        enemies="Goblins",
        difficulty="easy",
        location=location,
    )
    mock = MagicMock()
    mock.output.encounter = enc
    return mock


# ---------------------------------------------------------------------------
# Integration: full planning flow (routes → plan → encounter rewrite)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_routes_endpoint_is_read_only():
    """GET-like: /session-routes fetches context but never writes to the DB."""
    sb = _full_sb()
    with (
        patch("routers.session_prep_plan.sb", sb),
        patch("routers.session_prep_plan.Agent") as mock_agent,
    ):
        mock_agent.return_value.run = AsyncMock(return_value=_mock_routes_result())
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            r = await client.post(
                "/api/session-routes", json={"session_id": "s1", "campaign_id": "c1"}
            )

    assert r.status_code == 200
    assert sb.written == {}


@pytest.mark.asyncio
async def test_encounter_rewrite_endpoint_is_read_only():
    """GET-like: /session-prep-encounter never writes to the DB."""
    sb = _full_sb()
    with (
        patch("routers.session_prep_plan.sb", sb),
        patch("routers.session_prep_plan.Agent") as mock_agent,
    ):
        mock_agent.return_value.run = AsyncMock(return_value=_mock_encounter_result())
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            r = await client.post(
                "/api/session-prep-encounter",
                json={"session_id": "s1", "campaign_id": "c1", "type": "combat"},
            )

    assert r.status_code == 200
    assert sb.written == {}


@pytest.mark.asyncio
async def test_full_planning_flow_only_plan_writes_to_db():
    """
    Routes → Plan → Encounter rewrite: only the plan endpoint writes to the DB.
    Uses per-endpoint CapturingSB instances so the read counter is fresh for each.
    """
    routes_sb = _full_sb()
    plan_sb = _full_sb()
    encounter_sb = _full_sb()

    with patch("routers.session_prep_plan.Agent") as mock_agent:
        mock_agent.return_value.run = AsyncMock(
            side_effect=[
                _mock_routes_result(),
                _mock_plan_result(),
                _mock_encounter_result(),
            ]
        )
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            with patch("routers.session_prep_plan.sb", routes_sb):
                r1 = await client.post(
                    "/api/session-routes",
                    json={"session_id": "s1", "campaign_id": "c1"},
                )
            with patch("routers.session_prep_plan.sb", plan_sb):
                r2 = await client.post(
                    "/api/session-prep-plan",
                    json={"session_id": "s1", "campaign_id": "c1"},
                )
            with patch("routers.session_prep_plan.sb", encounter_sb):
                r3 = await client.post(
                    "/api/session-prep-encounter",
                    json={"session_id": "s1", "campaign_id": "c1", "type": "combat"},
                )

    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r3.status_code == 200

    assert routes_sb.written == {}
    assert len(plan_sb.updates_for("sessions")) == 1
    assert encounter_sb.written == {}


# ---------------------------------------------------------------------------
# Integration: prep_config DB write — shape and content
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_plan_writes_prep_config_to_sessions():
    sb = _full_sb()
    with (
        patch("routers.session_prep_plan.sb", sb),
        patch("routers.session_prep_plan.Agent") as mock_agent,
    ):
        mock_agent.return_value.run = AsyncMock(return_value=_mock_plan_result())
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.post(
                "/api/session-prep-plan", json={"session_id": "s1", "campaign_id": "c1"}
            )

    updates = sb.updates_for("sessions")
    assert len(updates) == 1
    config = json.loads(updates[0]["prep_config"])
    assert "candidates" in config
    assert "npc_highlights" in config
    assert "loot_suggestions" in config
    assert "encounter_tone" in config
    assert "encounter_mix" in config


@pytest.mark.asyncio
async def test_plan_persists_all_required_config_keys():
    sb = _full_sb()
    with (
        patch("routers.session_prep_plan.sb", sb),
        patch("routers.session_prep_plan.Agent") as mock_agent,
    ):
        mock_agent.return_value.run = AsyncMock(return_value=_mock_plan_result())
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.post(
                "/api/session-prep-plan",
                json={
                    "session_id": "s1",
                    "campaign_id": "c1",
                    "session_direction": "The city falls at dawn.",
                    "encounter_tone": {
                        "rp": "intense",
                        "combat": "light",
                        "puzzle": "moderate",
                    },
                    "encounter_mix": {"rp": 2, "combat": 1, "puzzles": 0},
                    "selected_objectives": [
                        {"id": "m-1", "type": "mission", "title": "Hold the Gate"}
                    ],
                },
            )

    config = json.loads(sb.updates_for("sessions")[0]["prep_config"])
    assert config["session_direction"] == "The city falls at dawn."
    assert config["encounter_tone"] == {
        "rp": "intense",
        "combat": "light",
        "puzzle": "moderate",
    }
    assert config["encounter_mix"] == {"rp": 2, "combat": 1, "puzzles": 0}
    assert len(config["selected_objectives"]) == 1
    assert config["selected_objectives"][0]["title"] == "Hold the Gate"


@pytest.mark.asyncio
async def test_plan_persists_location_in_candidates():
    sb = _full_sb()
    with (
        patch("routers.session_prep_plan.sb", sb),
        patch("routers.session_prep_plan.Agent") as mock_agent,
    ):
        mock_agent.return_value.run = AsyncMock(
            return_value=_mock_plan_result(
                rp=[_rp(location="The Gilded Flagon")],
                combat=[_combat(location="Dockside Alley")],
            )
        )
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.post(
                "/api/session-prep-plan", json={"session_id": "s1", "campaign_id": "c1"}
            )

    config = json.loads(sb.updates_for("sessions")[0]["prep_config"])
    assert config["candidates"]["rp"][0]["location"] == "The Gilded Flagon"
    assert config["candidates"]["combat"][0]["location"] == "Dockside Alley"


@pytest.mark.asyncio
async def test_plan_persists_npc_highlights_and_loot():
    sb = _full_sb()
    with (
        patch("routers.session_prep_plan.sb", sb),
        patch("routers.session_prep_plan.Agent") as mock_agent,
    ):
        mock_agent.return_value.run = AsyncMock(
            return_value=_mock_plan_result(
                npcs=[
                    _npc_highlight("Lord Vance", "Commander"),
                    _npc_highlight("Mira", "Informant"),
                ],
                loot=[_loot("Enchanted Sword"), _loot("Gold Pouch")],
            )
        )
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.post(
                "/api/session-prep-plan", json={"session_id": "s1", "campaign_id": "c1"}
            )

    config = json.loads(sb.updates_for("sessions")[0]["prep_config"])
    npc_names = [n["name"] for n in config["npc_highlights"]]
    loot_names = [lo["name"] for lo in config["loot_suggestions"]]
    assert "Lord Vance" in npc_names
    assert "Mira" in npc_names
    assert "Enchanted Sword" in loot_names
    assert "Gold Pouch" in loot_names


@pytest.mark.asyncio
async def test_plan_second_call_replaces_config_not_accumulates():
    """Calling plan twice should issue 2 separate update writes — no accumulation."""
    # Two plan calls → two pairs of session reads → extend by 1 extra pair
    sb = _full_sb(extra_session_reads=1)
    with (
        patch("routers.session_prep_plan.sb", sb),
        patch("routers.session_prep_plan.Agent") as mock_agent,
    ):
        mock_agent.return_value.run = AsyncMock(
            side_effect=[_mock_plan_result(), _mock_plan_result()]
        )
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.post(
                "/api/session-prep-plan", json={"session_id": "s1", "campaign_id": "c1"}
            )
            await client.post(
                "/api/session-prep-plan", json={"session_id": "s1", "campaign_id": "c1"}
            )

    updates = sb.updates_for("sessions")
    assert len(updates) == 2
    # Each write is a complete self-contained config
    for update in updates:
        config = json.loads(update["prep_config"])
        assert "candidates" in config
        assert "npc_highlights" in config


# ---------------------------------------------------------------------------
# Integration: response body matches DB write
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_plan_response_matches_written_config():
    """The HTTP response and the DB write must contain identical candidates."""
    sb = _full_sb()
    with (
        patch("routers.session_prep_plan.sb", sb),
        patch("routers.session_prep_plan.Agent") as mock_agent,
    ):
        mock_agent.return_value.run = AsyncMock(
            return_value=_mock_plan_result(rp=[_rp(location="Harbor Docks")])
        )
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/session-prep-plan", json={"session_id": "s1", "campaign_id": "c1"}
            )

    response_rp = response.json()["plan"]["candidates"]["rp"]
    db_config = json.loads(sb.updates_for("sessions")[0]["prep_config"])
    db_rp = db_config["candidates"]["rp"]

    assert response_rp == db_rp
    assert response_rp[0]["location"] == "Harbor Docks"


@pytest.mark.asyncio
async def test_encounter_response_includes_location():
    sb = _full_sb()
    with (
        patch("routers.session_prep_plan.sb", sb),
        patch("routers.session_prep_plan.Agent") as mock_agent,
    ):
        mock_agent.return_value.run = AsyncMock(
            return_value=_mock_encounter_result(location="The Old Sewers")
        )
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/session-prep-encounter",
                json={"session_id": "s1", "campaign_id": "c1", "type": "combat"},
            )

    enc = response.json()["encounter"]
    assert enc["location"] == "The Old Sewers"
    assert enc["enemies"] == "Goblins"
