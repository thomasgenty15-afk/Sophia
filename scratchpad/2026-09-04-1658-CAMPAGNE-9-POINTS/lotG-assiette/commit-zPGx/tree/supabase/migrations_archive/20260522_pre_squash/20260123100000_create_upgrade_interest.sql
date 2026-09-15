-- Migration: Create upgrade_interest table for tracking users interested in premium tier
-- This table stores responses from the daily message soft cap prompt

CREATE TABLE IF NOT EXISTS public.upgrade_interest (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    interested BOOLEAN NOT NULL DEFAULT false,
    source TEXT NOT NULL DEFAULT 'soft_cap_prompt',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.upgrade_interest ENABLE ROW LEVEL SECURITY;

-- Users can read their own interest
CREATE POLICY "Users can view own upgrade_interest"
    ON public.upgrade_interest FOR SELECT
    USING (auth.uid() = user_id);

-- Service role can manage all (for edge functions)
CREATE POLICY "Service role can manage upgrade_interest"
    ON public.upgrade_interest FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- Index for analytics queries
CREATE INDEX IF NOT EXISTS idx_upgrade_interest_interested 
    ON public.upgrade_interest(interested) 
    WHERE interested = true;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_upgrade_interest_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_upgrade_interest_updated_at
    BEFORE UPDATE ON public.upgrade_interest
    FOR EACH ROW
    EXECUTE FUNCTION update_upgrade_interest_updated_at();

-- Comment for documentation
COMMENT ON TABLE public.upgrade_interest IS 'Tracks users who expressed interest in premium/unlimited tier from soft cap prompts';
COMMENT ON COLUMN public.upgrade_interest.interested IS 'true if user said yes to unlimited access, false if declined';
COMMENT ON COLUMN public.upgrade_interest.source IS 'Where the prompt came from (soft_cap_prompt, etc.)';

