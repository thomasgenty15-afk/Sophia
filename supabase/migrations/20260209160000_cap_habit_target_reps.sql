-- Safety net: enforce habit target_reps <= 7 at DB level.
-- Generation caps at 6, increase_week_target allows up to 7.

-- 1. Fix any existing bad data (habits with target_reps > 7)
UPDATE "public"."user_actions"
SET target_reps = 7
WHERE type = 'habit' AND target_reps > 7;

-- 2. Add CHECK constraint to prevent future violations
ALTER TABLE "public"."user_actions"
ADD CONSTRAINT "user_actions_habit_target_reps_max"
CHECK (type != 'habit' OR target_reps <= 7);


