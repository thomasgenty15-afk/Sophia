
ALTER TABLE public.user_plans
ADD COLUMN IF NOT EXISTS submission_id UUID;

CREATE INDEX IF NOT EXISTS idx_user_plans_submission ON public.user_plans(submission_id);

