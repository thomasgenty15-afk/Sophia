-- Add note column to user_vital_sign_entries
ALTER TABLE "public"."user_vital_sign_entries"
ADD COLUMN "note" text;

