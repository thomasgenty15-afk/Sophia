
ALTER TABLE public.user_goals 
ADD COLUMN IF NOT EXISTS knowledge_generated_at TIMESTAMPTZ;
