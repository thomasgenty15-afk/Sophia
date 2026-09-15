-- D.2: Add unlocked_principles JSON to user_transformations
-- Tracks which Japanese philosophy principles have been unlocked.
-- Kaizen is always unlocked by default.
ALTER TABLE public.user_transformations
  ADD COLUMN IF NOT EXISTS unlocked_principles jsonb
    NOT NULL DEFAULT '{"kaizen": true}'::jsonb;
