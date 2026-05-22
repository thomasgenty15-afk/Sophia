# Sophia Staging QA Runs

Use this note when asking an agent to run Sophia QA conversations against staging.

## Operator Boundary

The requester is responsible for deployments, database migrations, pushes, and resets.

The QA agent must not run:

- `git push`
- `supabase db reset`
- `supabase db push --linked`
- `supabase functions deploy`
- broad SQL cleanup such as `delete`, `truncate`, `drop`, or schema overwrite commands

The agent may only run narrowly scoped cleanup for records created by the current QA run, and only when the target can be identified by test-specific values such as `run_id`, temporary QA user id, test email, request id, or source metadata.

## Environment

Fill `supabase/staging-test/.env` with staging values:

```bash
SUPABASE_URL=https://<staging-project-ref>.supabase.co
SUPABASE_ANON_KEY=<staging-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<staging-service-role-key>
```

Load it before a staging QA run:

```bash
set -a
source supabase/staging-test/.env
set +a
```

Never print the service role key, anon key, internal secret, or user JWT in the report.

Agents must not open, print, grep, parse, or inspect `supabase/staging-test/.env`. The preferred flow is that the requester loads the env before the run. If the requester explicitly asks the agent to launch a command that sources this file, the agent may source it without displaying values.

## Required QA Frame

The run is explicitly staging, not local. The agent must still follow:

- `docs/agent-playbook/14-qa-test-guidelines.md`
- `docs/agent-playbook/01-qa-run-report-structure.md`

This staging exception overrides only the "local by default" rule. All other QA constraints still apply:

- the agent must talk to Sophia turn by turn;
- user messages must be chosen after reading Sophia's previous response and the useful short trace;
- no deterministic renderer may be used as QA output;
- no direct `processMessage` fallback may be used to manufacture success;
- no executor may be called directly to bypass conversation;
- `POST /functions/v1/test-send-message` must include `force_full_ai=true`;
- failed, empty, timed out, aborted, or HTTP-error turns must be documented.

## Staging Auth And Calls

Use the staging URL and keys from `supabase/staging-test/.env`.

For each QA run:

1. Create or discover a temporary staging QA user.
2. Prefer an email containing the run id, for example `qa-<scenario>-<run_id>@example.com`.
3. Log in through staging Auth to obtain a user access token.
4. Verify the token with `GET /auth/v1/user`.
5. Send turns to:

```text
POST ${SUPABASE_URL}/functions/v1/test-send-message
```

Headers:

```text
apikey: <SUPABASE_ANON_KEY>
authorization: Bearer <SUPABASE_ANON_KEY>
x-user-authorization: Bearer <user-access-token>
content-type: application/json
x-request-id: <unique-request-id>
```

Body requirements:

```json
{
  "force_full_ai": true,
  "disable_debounce": true,
  "channel": "web",
  "scope": "<unique-scope>",
  "content": "<user message>"
}
```

Use a unique `run_id`, `scope`, and `x-request-id` for every run and every retry.

## Remote Reads For Report

Do not dump or pull the full staging database.

Read only the data needed for the report, filtered by:

- `run_id`
- `user_id`
- test email
- `scope`
- `x-request-id`
- message ids created during the run

The report must include short traces, not raw full JSON unless necessary.

## Report Requirements

Write the final report using `docs/agent-playbook/01-qa-run-report-structure.md`.

The context section must explicitly say:

```text
Cadre IA reel: Supabase staging explicitement demande; Edge Functions staging deja preparees par le requester; vrai chemin IA Sophia; /functions/v1/test-send-message avec force_full_ai=true; aucun renderer deterministe; aucun fallback direct processMessage; aucun deploy, push ou reset effectue par l'agent QA.
```

Include:

- date;
- run id;
- persona or temporary QA user;
- staging execution frame;
- exact user messages;
- exact or sufficiently complete Sophia responses;
- short trace per turn;
- durable effects observed in staging;
- incidents and retries;
- human fluency verdict;
- system verdict;
- global verdict.

If staging code is outdated, migrations are missing, auth is misconfigured, or the function is unavailable, stop the run and report a `red` technical blockage. Do not deploy, push, reset, or apply migrations yourself.

## Prompt To Give An Agent

```text
Run this Sophia QA conversation against staging.

Use `supabase/staging-test/.env` for staging connection values. This is an explicit staging/remote QA exception to the local-by-default rule in `docs/agent-playbook/14-qa-test-guidelines.md`.

Follow `docs/agent-playbook/14-qa-test-guidelines.md` and write the final report using `docs/agent-playbook/01-qa-run-report-structure.md`.

Use the real Sophia AI path only:
- call `/functions/v1/test-send-message`;
- set `force_full_ai=true`;
- speak with Sophia turn by turn;
- choose each user reply after reading Sophia's prior response and short trace;
- do not use a deterministic renderer;
- do not call `processMessage` directly;
- do not call any executor directly to fabricate success.

Hard boundaries:
- do not run `git push`;
- do not run `supabase db reset`;
- do not run `supabase db push --linked`;
- do not run `supabase functions deploy`;
- do not run broad SQL deletes/truncates/drops/schema overwrites;
- do not print JWTs, service role keys, anon keys, or internal secrets.

The requester handles deploys, migrations, pushes, and resets. If staging is not ready, stop and report the blocker instead of fixing staging.

Use a unique `run_id`, temporary QA user/email, scope, and request ids. Read staging data remotely only for this run's artifacts; do not dump the full database. Document any failed, empty, timed out, aborted, or HTTP-error turns in the report.
```
