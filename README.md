# Sophia DB & Edge Functions

Initial Supabase database schema, Zod/TypeScript types, seeds, and Edge Function skeletons for the Sophia (Coachy) MVP.

## Mega test (1 commande)

Lance un check “bout-en-bout” local: Supabase local + reset DB + tests Edge (Deno) + tests d’intégration (Vitest).

```bash
npm run test:mega
```

Options utiles:

- `npm run test:mega -- --no-reset`: ne reset pas la DB (plus rapide si tu veux juste rerun)
- `npm run test:mega -- --full`: en plus, sync le secret interne Vault↔Edge Runtime (nécessaire pour triggers/cron qui appellent des Edge Functions)
- `npm run test:mega -- --ai`: exécute l’IA réelle (Gemini) au lieu du stub (nécessite `GEMINI_API_KEY` configurée côté Edge Runtime)
- `npm run test:mega -- --skip-deno` / `--skip-frontend`: pour isoler une partie

Prérequis:

- Docker (Supabase local tourne via containers)
- Node + npm
- Deno (pour `supabase/functions/_shared/*_test.ts`)

Notes:

- Les tests d’intégration utilisent `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` (le runner les récupère via `supabase status`).
- La commande active aussi `MEGA_TEST_MODE=1` dans l’Edge Runtime pour **stubber Gemini/embeddings** (pas besoin de `GEMINI_API_KEY` pour exécuter la suite).
- Avec `--ai`, le runner met `MEGA_TEST_MODE=0` et tes tests utilisent Gemini/embeddings réels (plus lent, dépend du réseau, peut coûter).
- Si tu ajoutes/modifies des triggers qui appellent des Edge Functions via `pg_net`, pense à mettre `verify_jwt = false` dans `supabase/functions/<fn>/config.toml` si l’appel ne fournit pas de JWT.

## Installation

- Install the Supabase CLI and log in with a project that has the `service_role` key.
- Clone this repository and `cd` into it:\
  `supabase login`\
  `supabase init`
- Apply the schema:\
  `supabase db push --file supabase/schema.sql`

The schema installs required extensions, enums, tables, triggers, Row Level Security policies, and RPCs.

## Seeds

Seed the WhatsApp opt-in templates (service-role privileges required):

```bash
supabase db seed --file supabase/seeds/optin_templates.json
```

## RPC Examples

- Fetch the authenticated profile (token must belong to the current user):

```bash
supabase functions invoke profile-me \
  --headers 'Authorization: Bearer <jwt>' \
  --method GET
```

- Call `me_with_email` directly:

```bash
supabase db remote commit --since=HEAD
psql $SUPABASE_DB_URL -c "select * from public.me_with_email();"
```

- Retrieve recipients for the weekly bilan (service role only):

```bash
supabase db remote commit --since=HEAD
psql $SUPABASE_DB_URL -c "select * from public.list_recipients_for_bilan('2025-10-13');"
```

## Anti-Spam Index Verification

```bash
psql $SUPABASE_DB_URL <<'SQL'
insert into public.user_messages (user_id, direction, channel, body, is_proactive)
values ('<uuid>', 'outbound', 'whatsapp', 'Hello!', true);

insert into public.user_messages (user_id, direction, channel, body, is_proactive)
values ('<uuid>', 'outbound', 'whatsapp', 'Second message', true);
SQL
```

The second insert fails with `duplicate key` on `user_messages_one_proactive_per_day`.

## Edge Function Payloads

- `/functions/v1/onboarding/set-checkin`

```json
{
  "weekly_checkin_dow": 1,
  "weekly_checkin_time": "20:30:00"
}
```

- `/functions/v1/bilan/entries-upsert`

```json
{
  "entries": [
    {
      "user_objective_id": "00000000-0000-0000-0000-000000000000",
      "day": "2025-10-14",
      "status": "missed",
      "source": "manual",
      "note": "déplacement"
    }
  ]
}
```

- `/functions/v1/bilan/submit`

```json
{
  "week_start_date": "2025-10-13",
  "responses": {
    "objectives": [
      {
        "user_objective_id": "00000000-0000-0000-0000-000000000000",
        "answers": [
          { "q": "status_week", "a": "achieved" },
          { "q": "b1_benefit", "a": "oui_clairement" },
          { "q": "b1_adjust", "a": "keep" }
        ]
      }
    ],
    "bilan_feedback": "semaine dense mais j'ai appris"
  }
}
```

## RLS Notes

- Every `public.*` table has Row Level Security enabled.
- Use two distinct tokens to confirm user isolation:
  - Attempt to select another user’s `user_objectives` → should return zero rows.
  - Attempt to insert a `user_message` with a mismatched `user_id` → blocked by policy.
- Service role bypasses RLS; use carefully.

## Acceptance Test Checklist

- **Onboarding**: invoke `set-checkin`, `a1-suggestions`, and `objectives/activate`; confirm table mutations.
- **Opt-ins**: call `optin/webhook`; confirm `user_messages` and `user_objective_entries` (source `whatsapp_optin`).
- **Anti-spam**: second proactive outbound message on same day fails.
- **Weekly Bilan**: `entries-upsert` and `submit` populate `user_objective_entries` and `bilan_weekly.responses` (including optional WhatsApp feedback copy).
- **Objectives replacement**: `objectives/replace` updates statuses and respects active cap logic.
- **RLS**: non-owner read/write attempts fail; service-role succeeds.
- **RPC**: `me_with_email` and `list_recipients_for_bilan` behave per spec.

Run the checklist before merging and document outcomes in the PR description.
