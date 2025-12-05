-- Add context_problem column to user_plans table
ALTER TABLE public.user_plans 
ADD COLUMN IF NOT EXISTS context_problem TEXT;

COMMENT ON COLUMN public.user_plans.context_problem IS 'Résumé du problème initial et du contexte de l''utilisateur pour ce plan';

