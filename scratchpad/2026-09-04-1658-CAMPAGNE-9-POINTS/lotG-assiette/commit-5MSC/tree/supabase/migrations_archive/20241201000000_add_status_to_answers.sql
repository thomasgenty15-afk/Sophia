
-- Ajout du statut pour distinguer les brouillons des questionnaires validés
ALTER TABLE public.user_answers 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'in_progress';

-- Index pour les recherches de brouillons
CREATE INDEX IF NOT EXISTS idx_user_answers_status ON public.user_answers(status);

