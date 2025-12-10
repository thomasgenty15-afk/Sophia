-- Add deep_why column to user_plans table
ALTER TABLE public.user_plans 
ADD COLUMN IF NOT EXISTS deep_why TEXT;

-- Add comment to explain usage
COMMENT ON COLUMN public.user_plans.deep_why IS 'Résumé de la motivation profonde de l''utilisateur pour ce plan';
