# Codex Safety Rules

Never run `supabase db reset`.

Never run destructive Supabase database commands unless the user explicitly asks for the exact command in the current conversation. This includes:
- `supabase db reset`
- `supabase db push --linked`
- direct SQL commands that delete, truncate, drop, or overwrite database data or schema

Exception: during QA/test runs, if the user explicitly asks to clean the database in a targeted way, Codex may remove only the records created by that test run and only inside the clearly identified test perimeter. The cleanup must be narrowly scoped by test-specific identifiers such as temporary QA user ids, run ids, request ids, or source metadata. This exception does not allow broad resets, schema changes, truncates, or deletion outside the artifacts produced by the current test.

If a task appears to require one of these commands, stop and ask for explicit confirmation before running it.
