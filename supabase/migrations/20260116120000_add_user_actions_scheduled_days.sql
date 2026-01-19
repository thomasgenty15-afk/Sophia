-- Add optional scheduled days for habits (weekly cadence).
-- Values are day keys like: mon,tue,wed,thu,fri,sat,sun

ALTER TABLE public.user_actions
  ADD COLUMN IF NOT EXISTS scheduled_days text[] NULL;



