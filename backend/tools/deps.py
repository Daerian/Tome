from dataclasses import dataclass


@dataclass
class CampaignDeps:
    """Dependencies injected into campaign tools via RunContext."""

    supabase: object  # supabase.Client
    campaign_id: str
    user_id: str  # Supabase auth user ID (for note authorship)
    role: str  # "dm", "player", or "spectator"
