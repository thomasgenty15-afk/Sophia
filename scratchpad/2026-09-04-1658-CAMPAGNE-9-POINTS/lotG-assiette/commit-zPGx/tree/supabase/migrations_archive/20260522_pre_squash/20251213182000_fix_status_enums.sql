-- Update status constraints to support consistent lifecycle states across all tables

-- 1. user_actions
ALTER TABLE "public"."user_actions" 
DROP CONSTRAINT IF EXISTS "user_actions_status_check";

ALTER TABLE "public"."user_actions" 
ADD CONSTRAINT "user_actions_status_check" 
CHECK (status IN ('active', 'completed', 'cancelled', 'abandoned', 'pending'));

-- 2. user_vital_signs
ALTER TABLE "public"."user_vital_signs" 
DROP CONSTRAINT IF EXISTS "user_vital_signs_status_check";

ALTER TABLE "public"."user_vital_signs" 
ADD CONSTRAINT "user_vital_signs_status_check" 
CHECK (status IN ('active', 'completed', 'archived', 'abandoned', 'monitoring', 'pending'));

-- 3. user_framework_tracking
-- Note: Assuming table exists, ensuring it has consistent status check
ALTER TABLE "public"."user_framework_tracking" 
DROP CONSTRAINT IF EXISTS "user_framework_tracking_status_check";

ALTER TABLE "public"."user_framework_tracking" 
ADD CONSTRAINT "user_framework_tracking_status_check" 
CHECK (status IN ('active', 'completed', 'cancelled', 'abandoned', 'pending'));

