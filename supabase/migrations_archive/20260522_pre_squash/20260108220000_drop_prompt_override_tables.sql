-- Drop prompt override system (replaced by versioned prompts in code).
-- NOTE: historical migrations may have created/populated these tables; this migration ensures the final schema has no overrides tables.

drop table if exists public.prompt_override_suggestions cascade;
drop table if exists public.prompt_overrides cascade;




