-- Create user_vital_sign_entries table for historical tracking
CREATE TABLE IF NOT EXISTS public.user_vital_sign_entries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    vital_sign_id UUID NOT NULL REFERENCES public.user_vital_signs(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES public.user_plans(id) ON DELETE CASCADE,
    submission_id UUID, -- Optional link to specific submission cycle
    
    value TEXT NOT NULL, -- Stored as text to handle various types (time, numbers), casted when needed
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance on charts/analytics queries
CREATE INDEX IF NOT EXISTS idx_vital_entries_user_sign ON public.user_vital_sign_entries(user_id, vital_sign_id);
CREATE INDEX IF NOT EXISTS idx_vital_entries_recorded_at ON public.user_vital_sign_entries(recorded_at);

-- RLS Policies
ALTER TABLE public.user_vital_sign_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own vital sign entries"
    ON public.user_vital_sign_entries FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own vital sign entries"
    ON public.user_vital_sign_entries FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own vital sign entries"
    ON public.user_vital_sign_entries FOR DELETE
    USING (auth.uid() = user_id);

