-- Ajout des compteurs pour limiter la consommation de l'IA

-- 1. Limite sur le tri des priorités (PlanPriorities)
ALTER TABLE public.user_answers 
ADD COLUMN IF NOT EXISTS sorting_attempts INTEGER DEFAULT 0;

-- 2. Limite sur le résumé contextuel (Sophia Knowledge - étape 1 du plan)
ALTER TABLE public.user_goals 
ADD COLUMN IF NOT EXISTS summary_attempts INTEGER DEFAULT 0;

-- 3. Limite sur la génération du plan final (ActionPlanGenerator)
ALTER TABLE public.user_plans 
ADD COLUMN IF NOT EXISTS generation_attempts INTEGER DEFAULT 1; -- Commence à 1 à la création

