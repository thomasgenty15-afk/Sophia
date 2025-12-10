ALTER TABLE public.user_plans ADD COLUMN IF NOT EXISTS inputs_pacing TEXT DEFAULT 'balanced';

