-- Add tracking_type to user_actions
ALTER TABLE "public"."user_actions"
ADD COLUMN "tracking_type" text DEFAULT 'boolean' NOT NULL,
ADD CONSTRAINT "user_actions_tracking_type_check" CHECK (tracking_type IN ('boolean', 'counter'));

-- Add tracking_type to user_vital_signs (The definition table)
ALTER TABLE "public"."user_vital_signs"
ADD COLUMN "tracking_type" text DEFAULT 'counter' NOT NULL, -- Vital signs are often numbers (counter/gauge)
ADD CONSTRAINT "user_vital_signs_tracking_type_check" CHECK (tracking_type IN ('boolean', 'counter'));

-- Add tracking_type to user_framework_tracking (The tracking table for frameworks)
ALTER TABLE "public"."user_framework_tracking"
ADD COLUMN "tracking_type" text DEFAULT 'boolean' NOT NULL,
ADD CONSTRAINT "user_framework_tracking_tracking_type_check" CHECK (tracking_type IN ('boolean', 'counter'));

