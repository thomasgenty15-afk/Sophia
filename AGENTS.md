# Codex Safety Rules

Never run `supabase db reset`.

Never run destructive Supabase database commands unless the user explicitly asks for the exact command in the current conversation. This includes:
- `supabase db reset`
- `supabase db push --linked`
- direct SQL commands that delete, truncate, drop, or overwrite database data or schema

If a task appears to require one of these commands, stop and ask for explicit confirmation before running it.
