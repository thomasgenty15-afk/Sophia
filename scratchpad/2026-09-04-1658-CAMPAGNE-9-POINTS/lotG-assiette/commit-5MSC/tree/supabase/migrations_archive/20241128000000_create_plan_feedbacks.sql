CREATE TABLE public.plan_feedbacks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    plan_id UUID REFERENCES public.user_plans(id) ON DELETE CASCADE,
    feedback_text TEXT NOT NULL,
    previous_plan_content JSONB,
    new_plan_content JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.plan_feedbacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own feedbacks" ON public.plan_feedbacks FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_plan_feedbacks_plan_id ON public.plan_feedbacks(plan_id);
CREATE INDEX idx_plan_feedbacks_user_id ON public.plan_feedbacks(user_id);

