-- Add whatsapp_deferred_onboarding column to profiles
-- This stores onboarding steps that were skipped due to urgency/context
-- and should be asked later when the moment is calm.

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS whatsapp_deferred_onboarding jsonb DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN profiles.whatsapp_deferred_onboarding IS 
  'Array of deferred onboarding steps (e.g., ["motivation", "personal_fact"]) to be asked later when user is in a calm moment';



