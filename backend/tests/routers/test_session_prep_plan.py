"""
Tests for routers/session_prep_plan.py

Covers:
- build_plan_context() — not found, per-type tones, session direction, objectives,
  attendees, NPCs, locations, factions
- POST /api/session-routes  — 3 routes returned, error on missing data
- POST /api/session-prep-plan — candidates include location field, config persisted,
  direction and tones forwarded to prompt
- POST /api/session-prep-encounter — location in response, hint forwarded, existing
  titles forwarded, type-specific tone applied, invalid body → 422
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from main import app
from routers.session_prep_plan import (
    EncounterMix,
    EncounterSuggestion,
    EncounterTone,
    LootSuggestion,
    NPCHighlight,
    SelectedObjective,
    SessionRoute,
    build_plan_context,
)

# ---------------------------------------------------------------------------
# Supabase mock helper
# ---------------------------------------------------------------------------


def _make_sb(table_data: dict) -> MagicMock:
    """
    Chainable Supabase mock.  Values may be a plain value or a tuple of
    values returned in sequence (one per call to that table).
    """
    sb = MagicMock()
    call_counts: dict[str, int] = {}

    def _table(name):
        chain = MagicMock()
        for method in (
            "select",
            "eq",
            "neq",
            "order",
            "limit",
            "single",
            "in_",
            "update",
        ):
            getattr(chain, method).return_value = chain

        values = table_data.get(name)
        if isinstance(values, tuple):
            idx = call_counts.get(name, 0)
            data = values[idx] if idx < len(values) else values[-1]
            call_counts[name] = idx + 1
        else:
            data = values

        chain.execute.return_value = MagicMock(data=data)
        return chain

    sb.table.side_effect = _table
    return sb


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
    "in_world_end_date": "16 Flamerule",
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
        "description": "A curious mage.",
    },
}
NPC = {
    "id": "npc-1",
    "name": "Lord Vance",
    "type": "npc",
    "race": "Human",
    "class": "Fighter",
    "level": 10,
    "description": "City commander.",
    "status": "alive",
}
MISSION = {
    "id": "m-1",
    "title": "Hold the Gate",
    "description": "Defend the city gate.",
    "type": "main",
    "status": "active",
    "priority": "critical",
    "reward_description": "City's gratitude",
}
BEAT = {
    "id": "b-1",
    "title": "The Siege Begins",
    "description": "Enemy forces approach.",
    "type": "cliffhanger",
    "status": "active",
}
LOCATION = {
    "id": "loc-1",
    "name": "City Gate",
    "type": "structure",
    "description": "The main entrance.",
    "parent_location_id": None,
}
FACTION = {
    "name": "The Guard",
    "type": "military",
    "goals": "Protect the city.",
    "alignment": "lawful good",
}

TONE = EncounterTone()
MIX = EncounterMix()


def _full_sb(**overrides):
    """Mock sb with all tables populated; accepts keyword overrides per table."""
    data = {
        "campaigns": CAMPAIGN,
        # sessions: first call = current session, second = prev sessions list
        "sessions": (SESSION, []),
        "session_attendees": [ATTENDEE],
        "characters": [NPC],
        "missions": [MISSION],
        "story_beats": [BEAT],
        "locations": [LOCATION],
        "factions": [FACTION],
    }
    data.update(overrides)
    return _make_sb(data)


# ---------------------------------------------------------------------------
# build_plan_context() — unit tests
# ---------------------------------------------------------------------------


def test_build_context_returns_none_when_campaign_missing():
    sb = _full_sb(campaigns=None)
    with patch("routers.session_prep_plan.sb", sb):
        assert build_plan_context("s1", "c1", TONE, MIX, []) is None


def test_build_context_returns_none_when_session_missing():
    sb = _full_sb(sessions=(None, []))
    with patch("routers.session_prep_plan.sb", sb):
        assert build_plan_context("s1", "c1", TONE, MIX, []) is None


def test_build_context_includes_campaign_and_session():
    sb = _full_sb()
    with patch("routers.session_prep_plan.sb", sb):
        result = build_plan_context("s1", "c1", TONE, MIX, [])
    assert "Shattered Realms" in result
    assert "D&D 5e" in result
    assert "The Siege" in result


def test_build_context_includes_per_type_tones():
    tone = EncounterTone(rp="intense", combat="light", puzzle="moderate")
    sb = _full_sb()
    with patch("routers.session_prep_plan.sb", sb):
        result = build_plan_context("s1", "c1", tone, MIX, [])
    assert "INTENSE" in result
    assert "LIGHT" in result
    assert "MODERATE" in result


def test_build_context_includes_session_direction():
    sb = _full_sb()
    with patch("routers.session_prep_plan.sb", sb):
        result = build_plan_context(
            "s1",
            "c1",
            TONE,
            MIX,
            [],
            session_direction="The city falls at dawn.",
        )
    assert "The city falls at dawn." in result
    assert "Session Direction" in result


def test_build_context_omits_direction_when_none():
    sb = _full_sb()
    with patch("routers.session_prep_plan.sb", sb):
        result = build_plan_context("s1", "c1", TONE, MIX, [])
    assert "Session Direction" not in result


def test_build_context_marks_selected_objectives():
    obj = SelectedObjective(id="m-1", type="mission", title="Hold the Gate")
    sb = _full_sb()
    with patch("routers.session_prep_plan.sb", sb):
        result = build_plan_context("s1", "c1", TONE, MIX, [obj])
    assert "SELECTED" in result
    assert "Hold the Gate" in result


def test_build_context_includes_attendees():
    sb = _full_sb()
    with patch("routers.session_prep_plan.sb", sb):
        result = build_plan_context("s1", "c1", TONE, MIX, [])
    assert "Zara" in result
    assert "Elf" in result


def test_build_context_no_attendees_fallback():
    sb = _full_sb(session_attendees=[])
    with patch("routers.session_prep_plan.sb", sb):
        result = build_plan_context("s1", "c1", TONE, MIX, [])
    assert "No attendees registered" in result


def test_build_context_includes_npcs():
    sb = _full_sb()
    with patch("routers.session_prep_plan.sb", sb):
        result = build_plan_context("s1", "c1", TONE, MIX, [])
    assert "Lord Vance" in result
    assert "City commander." in result


def test_build_context_includes_locations():
    sb = _full_sb()
    with patch("routers.session_prep_plan.sb", sb):
        result = build_plan_context("s1", "c1", TONE, MIX, [])
    assert "City Gate" in result


def test_build_context_includes_factions():
    sb = _full_sb()
    with patch("routers.session_prep_plan.sb", sb):
        result = build_plan_context("s1", "c1", TONE, MIX, [])
    assert "The Guard" in result
    assert "Protect the city." in result


# ---------------------------------------------------------------------------
# Helpers for endpoint tests — real Pydantic models so model_dump() works
# ---------------------------------------------------------------------------


def _rp_encounter(location="Tavern District") -> EncounterSuggestion:
    return EncounterSuggestion(
        type="rp",
        title="A Tense Negotiation",
        description="Players meet with a shady intermediary.",
        npcs_involved=["Lord Vance"],
        location=location,
    )


def _combat_encounter(location="Market Alley") -> EncounterSuggestion:
    return EncounterSuggestion(
        type="combat",
        title="Ambush in the Alley",
        description="Bandits spring a trap.",
        enemies="3 Bandits, 1 Captain",
        difficulty="medium",
        location=location,
    )


def _mock_plan_result(
    rp: list | None = None,
    combat: list | None = None,
    puzzle: list | None = None,
):
    mock_output = MagicMock()
    mock_output.rp_candidates = rp if rp is not None else [_rp_encounter()]
    mock_output.combat_candidates = (
        combat if combat is not None else [_combat_encounter()]
    )
    mock_output.puzzle_candidates = puzzle if puzzle is not None else []
    mock_output.npc_highlights = [
        NPCHighlight(name="Lord Vance", role="City commander"),
    ]
    mock_output.loot_suggestions = [
        LootSuggestion(
            name="Gold Coins", category="gold", description="100 gp", source="Ambush"
        ),
    ]
    mock_result = MagicMock()
    mock_result.output = mock_output
    return mock_result


# ---------------------------------------------------------------------------
# POST /api/session-routes
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_session_routes_returns_three_routes():
    mock_result = MagicMock()
    mock_result.output.routes = [
        SessionRoute(title="Route A", description="Hook A"),
        SessionRoute(title="Route B", description="Hook B"),
        SessionRoute(title="Route C", description="Hook C"),
    ]
    sb = _full_sb()

    with (
        patch("routers.session_prep_plan.sb", sb),
        patch("routers.session_prep_plan.Agent") as mock_agent,
    ):
        mock_agent.return_value.run = AsyncMock(return_value=mock_result)
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/session-routes",
                json={"session_id": "s1", "campaign_id": "c1"},
            )

    assert response.status_code == 200
    routes = response.json()["routes"]
    assert len(routes) == 3
    assert routes[0]["title"] == "Route A"
    assert routes[2]["description"] == "Hook C"


@pytest.mark.asyncio
async def test_session_routes_not_found():
    sb = _full_sb(campaigns=None)
    with patch("routers.session_prep_plan.sb", sb):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/session-routes",
                json={"session_id": "s1", "campaign_id": "missing"},
            )

    assert response.status_code == 200
    assert "error" in response.json()


# ---------------------------------------------------------------------------
# POST /api/session-prep-plan
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_session_prep_plan_returns_candidates():
    mock_result = _mock_plan_result()
    sb = _full_sb()

    with (
        patch("routers.session_prep_plan.sb", sb),
        patch("routers.session_prep_plan.Agent") as mock_agent,
    ):
        mock_agent.return_value.run = AsyncMock(return_value=mock_result)
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/session-prep-plan",
                json={"session_id": "s1", "campaign_id": "c1"},
            )

    assert response.status_code == 200
    plan = response.json()["plan"]
    assert "candidates" in plan
    assert len(plan["candidates"]["rp"]) == 1
    assert len(plan["candidates"]["combat"]) == 1


@pytest.mark.asyncio
async def test_session_prep_plan_candidates_include_location():
    mock_result = _mock_plan_result(
        rp=[_rp_encounter(location="The Gilded Flagon")],
        combat=[_combat_encounter(location="Dockside Alley")],
    )
    sb = _full_sb()

    with (
        patch("routers.session_prep_plan.sb", sb),
        patch("routers.session_prep_plan.Agent") as mock_agent,
    ):
        mock_agent.return_value.run = AsyncMock(return_value=mock_result)
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/session-prep-plan",
                json={"session_id": "s1", "campaign_id": "c1"},
            )

    plan = response.json()["plan"]
    assert plan["candidates"]["rp"][0]["location"] == "The Gilded Flagon"
    assert plan["candidates"]["combat"][0]["location"] == "Dockside Alley"


@pytest.mark.asyncio
async def test_session_prep_plan_not_found():
    sb = _full_sb(campaigns=None)
    with patch("routers.session_prep_plan.sb", sb):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/session-prep-plan",
                json={"session_id": "s1", "campaign_id": "missing"},
            )

    assert response.status_code == 200
    assert "error" in response.json()


@pytest.mark.asyncio
async def test_session_prep_plan_persists_config():
    mock_result = _mock_plan_result()
    sb = _full_sb()

    with (
        patch("routers.session_prep_plan.sb", sb),
        patch("routers.session_prep_plan.Agent") as mock_agent,
    ):
        mock_agent.return_value.run = AsyncMock(return_value=mock_result)
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.post(
                "/api/session-prep-plan",
                json={"session_id": "s1", "campaign_id": "c1"},
            )

    sb.table.assert_any_call("sessions")


@pytest.mark.asyncio
async def test_session_prep_plan_forwards_session_direction():
    mock_result = _mock_plan_result()
    sb = _full_sb()

    with (
        patch("routers.session_prep_plan.sb", sb),
        patch("routers.session_prep_plan.Agent") as mock_agent,
    ):
        mock_agent.return_value.run = AsyncMock(return_value=mock_result)
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.post(
                "/api/session-prep-plan",
                json={
                    "session_id": "s1",
                    "campaign_id": "c1",
                    "session_direction": "The city falls at dawn.",
                },
            )

    prompt = mock_agent.return_value.run.call_args.args[0]
    assert "The city falls at dawn." in prompt


@pytest.mark.asyncio
async def test_session_prep_plan_per_type_tones_in_prompt():
    mock_result = _mock_plan_result()
    sb = _full_sb()

    with (
        patch("routers.session_prep_plan.sb", sb),
        patch("routers.session_prep_plan.Agent") as mock_agent,
    ):
        mock_agent.return_value.run = AsyncMock(return_value=mock_result)
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.post(
                "/api/session-prep-plan",
                json={
                    "session_id": "s1",
                    "campaign_id": "c1",
                    "encounter_tone": {
                        "rp": "intense",
                        "combat": "light",
                        "puzzle": "moderate",
                    },
                },
            )

    prompt = mock_agent.return_value.run.call_args.args[0]
    assert "INTENSE" in prompt
    assert "LIGHT" in prompt
    assert "MODERATE" in prompt


@pytest.mark.asyncio
async def test_session_prep_plan_invalid_body_returns_422():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post("/api/session-prep-plan", json={"wrong": "field"})
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# POST /api/session-prep-encounter
# ---------------------------------------------------------------------------


def _mock_encounter_result(location="City Gate", enc_type="combat") -> MagicMock:
    enc = EncounterSuggestion(
        type=enc_type,
        title="Test Encounter",
        description="A test.",
        enemies="3 Bandits" if enc_type == "combat" else None,
        difficulty="medium" if enc_type == "combat" else None,
        location=location,
    )
    mock_result = MagicMock()
    mock_result.output.encounter = enc
    return mock_result


@pytest.mark.asyncio
async def test_session_prep_encounter_returns_encounter_with_location():
    mock_result = _mock_encounter_result(location="City Gate", enc_type="combat")
    sb = _full_sb()

    with (
        patch("routers.session_prep_plan.sb", sb),
        patch("routers.session_prep_plan.Agent") as mock_agent,
    ):
        mock_agent.return_value.run = AsyncMock(return_value=mock_result)
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/session-prep-encounter",
                json={"session_id": "s1", "campaign_id": "c1", "type": "combat"},
            )

    assert response.status_code == 200
    enc = response.json()["encounter"]
    assert enc["location"] == "City Gate"
    assert enc["enemies"] == "3 Bandits"


@pytest.mark.asyncio
async def test_session_prep_encounter_forwards_hint():
    mock_result = _mock_encounter_result(enc_type="rp")
    sb = _full_sb()

    with (
        patch("routers.session_prep_plan.sb", sb),
        patch("routers.session_prep_plan.Agent") as mock_agent,
    ):
        mock_agent.return_value.run = AsyncMock(return_value=mock_result)
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.post(
                "/api/session-prep-encounter",
                json={
                    "session_id": "s1",
                    "campaign_id": "c1",
                    "type": "rp",
                    "hint": "Set it in the sewers.",
                },
            )

    prompt = mock_agent.return_value.run.call_args.args[0]
    assert "Set it in the sewers." in prompt


@pytest.mark.asyncio
async def test_session_prep_encounter_forwards_existing_titles():
    mock_result = _mock_encounter_result(enc_type="puzzle")
    sb = _full_sb()

    with (
        patch("routers.session_prep_plan.sb", sb),
        patch("routers.session_prep_plan.Agent") as mock_agent,
    ):
        mock_agent.return_value.run = AsyncMock(return_value=mock_result)
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.post(
                "/api/session-prep-encounter",
                json={
                    "session_id": "s1",
                    "campaign_id": "c1",
                    "type": "puzzle",
                    "existing_titles": ["The Locked Vault", "The Mirror Maze"],
                },
            )

    prompt = mock_agent.return_value.run.call_args.args[0]
    assert "The Locked Vault" in prompt
    assert "The Mirror Maze" in prompt


@pytest.mark.asyncio
async def test_session_prep_encounter_applies_type_specific_tone():
    mock_result = _mock_encounter_result(enc_type="combat")
    sb = _full_sb()

    with (
        patch("routers.session_prep_plan.sb", sb),
        patch("routers.session_prep_plan.Agent") as mock_agent,
    ):
        mock_agent.return_value.run = AsyncMock(return_value=mock_result)
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.post(
                "/api/session-prep-encounter",
                json={
                    "session_id": "s1",
                    "campaign_id": "c1",
                    "type": "combat",
                    # rp=intense should NOT appear; combat=light should
                    "encounter_tone": {
                        "rp": "intense",
                        "combat": "light",
                        "puzzle": "moderate",
                    },
                },
            )

    prompt = mock_agent.return_value.run.call_args.args[0]
    assert "light" in prompt.lower()
    # The rp tone should not leak into a combat encounter prompt
    assert "intense" not in prompt.lower()


@pytest.mark.asyncio
async def test_session_prep_encounter_forwards_session_direction():
    mock_result = _mock_encounter_result(enc_type="rp")
    sb = _full_sb()

    with (
        patch("routers.session_prep_plan.sb", sb),
        patch("routers.session_prep_plan.Agent") as mock_agent,
    ):
        mock_agent.return_value.run = AsyncMock(return_value=mock_result)
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.post(
                "/api/session-prep-encounter",
                json={
                    "session_id": "s1",
                    "campaign_id": "c1",
                    "type": "rp",
                    "session_direction": "The merchant guild has gone silent.",
                },
            )

    prompt = mock_agent.return_value.run.call_args.args[0]
    assert "The merchant guild has gone silent." in prompt


@pytest.mark.asyncio
async def test_session_prep_encounter_invalid_body_returns_422():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/session-prep-encounter", json={"wrong": "field"}
        )
    assert response.status_code == 422
