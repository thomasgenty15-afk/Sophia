-- Add title column to user_action_entries
ALTER TABLE "public"."user_action_entries"
ADD COLUMN "action_title" text;

-- Optional: Backfill titles for existing entries (if any)
UPDATE "public"."user_action_entries" uae
SET "action_title" = ua.title
FROM "public"."user_actions" ua
WHERE uae.action_id = ua.id
AND uae.action_title IS NULL;

