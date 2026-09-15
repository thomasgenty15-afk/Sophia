-- Add time_of_day to user_actions
ALTER TABLE "public"."user_actions"
ADD COLUMN "time_of_day" text DEFAULT 'any_time' NOT NULL,
ADD CONSTRAINT "user_actions_time_of_day_check" CHECK (time_of_day IN ('morning', 'afternoon', 'evening', 'night', 'any_time'));

-- Create user_action_entries table for detailed logging
CREATE TABLE "public"."user_action_entries" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "user_id" uuid NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE,
    "action_id" uuid NOT NULL REFERENCES "public"."user_actions"("id") ON DELETE CASCADE,
    "status" text NOT NULL CHECK (status IN ('completed', 'missed', 'partial')),
    "value" numeric, -- For counter types (e.g. 5 pages read)
    "note" text, -- The "Why" / Context / Coaching input
    "performed_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- RLS Policies for user_action_entries
ALTER TABLE "public"."user_action_entries" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own entries"
ON "public"."user_action_entries"
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own entries"
ON "public"."user_action_entries"
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own entries"
ON "public"."user_action_entries"
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

