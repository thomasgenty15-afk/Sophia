ALTER TABLE public.user_goals ADD COLUMN IF NOT EXISTS role TEXT; -- 'foundation', 'lever', 'optimization'
ALTER TABLE public.user_goals ADD COLUMN IF NOT EXISTS reasoning TEXT; -- L'explication de l'IA

