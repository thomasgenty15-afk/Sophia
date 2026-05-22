# Staging QA Secrets Boundary

This folder may contain staging credentials in `.env`.

Agents must not read, print, summarize, copy, grep, cat, sed, parse, or otherwise inspect secret-bearing files in this folder.

Forbidden files:

- `.env`
- `.env.*`
- `*.secret`
- `*.secrets`
- any file that appears to contain Supabase keys, JWTs, internal secrets, or staging credentials

Allowed files:

- `README.md`
- `.env.example`
- this `AGENTS.md`

If a staging QA command needs environment variables, the preferred flow is that the human loads the environment before invoking the agent. If the human explicitly asks the agent to run a staging QA command using `supabase/staging-test/.env`, the agent may source the file as part of that command, but must never display the file contents or echo the loaded values.

Never include secrets, JWTs, Supabase keys, or internal secrets in reports, logs, summaries, or final messages.
