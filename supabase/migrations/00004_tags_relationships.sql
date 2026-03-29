-- ============================================================================
-- TOME — Phase 4: Tags, Relationships, and Location Images
-- ============================================================================
-- Adds searchable tags (text[]) and relationships (jsonb) to characters and
-- locations. Adds a general image_url to locations (separate from maps).
-- ============================================================================

-- Characters: tags and relationships
ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS relationships jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.characters.tags IS
  'Searchable tags, e.g. {"tavern keeper", "quest giver", "ally"}.';
COMMENT ON COLUMN public.characters.relationships IS
  'Array of {name, relation} objects, e.g. [{"name":"Strahd","relation":"enemy"}].';

-- Locations: tags, relationships, and image_url
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS relationships jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS image_url text;

COMMENT ON COLUMN public.locations.tags IS
  'Searchable tags, e.g. {"safe haven", "dungeon", "shop"}.';
COMMENT ON COLUMN public.locations.relationships IS
  'Array of {name, relation} objects, e.g. [{"name":"Waterdeep","relation":"trade route"}].';
COMMENT ON COLUMN public.locations.image_url IS
  'General display image for this location.';

-- GIN index for fast tag searches
CREATE INDEX IF NOT EXISTS idx_characters_tags ON public.characters USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_locations_tags ON public.locations USING gin(tags);
