-- 1. Nettoyage : On enlève sophia_knowledge de user_plans (doublon avec user_goals)
ALTER TABLE public.user_plans DROP COLUMN IF EXISTS sophia_knowledge;

-- 2. Ajout de la date de fin (Succès ou Abandon) pour l'historique Grimoire
ALTER TABLE public.user_plans ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- 3. Ajout du Titre Épique pour le Grimoire (plus propre que dans le JSON)
ALTER TABLE public.user_plans ADD COLUMN IF NOT EXISTS title TEXT;

