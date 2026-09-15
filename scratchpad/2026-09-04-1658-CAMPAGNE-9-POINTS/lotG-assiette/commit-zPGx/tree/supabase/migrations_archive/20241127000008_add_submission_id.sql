
-- Ajout de submission_id pour lier un lot de réponses à des objectifs
ALTER TABLE public.user_answers 
ADD COLUMN IF NOT EXISTS submission_id UUID DEFAULT gen_random_uuid();

ALTER TABLE public.user_goals 
ADD COLUMN IF NOT EXISTS submission_id UUID;

-- Index pour accélérer les nettoyages par lot
CREATE INDEX IF NOT EXISTS idx_user_goals_submission ON public.user_goals(submission_id);

