# Sophia DB & Edge Functions

Initial Supabase database schema, Zod/TypeScript types, seeds, and Edge Function skeletons for the Sophia (Coachy) MVP.

## Déploiement Vercel (site `sophia-coach.ai`)

Ce repo contient:
- `frontend/`: l’app web (React + Vite)
- `supabase/`: migrations + edge functions

### 1) Supabase Cloud (production)

Dans Supabase Dashboard du projet (`https://ybyqxwnwjvuxckolsddn.supabase.co`) :
- **Auth → Settings**:
  - **Disable signups** (inscriptions OFF) → personne ne peut créer de compte
  - **Site URL**: `https://sophia-coach.ai`
  - **Additional Redirect URLs**: ajoute aussi `https://sophia-coach.ai/auth` (et `https://www.sophia-coach.ai/auth` si tu utilises le www)
- **Auth → Users**:
  - crée/invite l’utilisateur `thomasgenty15@gmail.com`
- **DB**:
  - tes migrations incluent un verrou “master_admin” via `public.internal_admins` (email `thomasgenty15@gmail.com`)

### 2) Vercel (frontend)

Dans Vercel:
- **New Project → Import Git Repository**
- **Root Directory**: `frontend`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables** (Production):
  - `VITE_SUPABASE_URL` = `https://ybyqxwnwjvuxckolsddn.supabase.co`
  - `VITE_SUPABASE_ANON_KEY` = (clé anon du projet Supabase cloud)
  - `VITE_PRELAUNCH_LOCKDOWN` = `true` (pré-lancement: app accessible uniquement aux `internal_admins`)

> Le fichier `frontend/vercel.json` ajoute le rewrite SPA nécessaire pour React Router.

### 3) Domaine `sophia-coach.ai`

Dans Vercel → **Project → Settings → Domains**:
- ajoute `sophia-coach.ai` (et `www.sophia-coach.ai` si souhaité)

Puis dans ton DNS (registrar):
- **A record (apex)**: `@` → `76.76.21.21`
- **CNAME (www)**: `www` → `cname.vercel-dns.com`

## Environnements (local vs production)

### Local (Supabase CLI + Vite)

- Supabase local:
  - copie `supabase/env.example` vers `supabase/.env` (non commité) et remplis
  - **mets `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` uniquement dans `supabase/.env` (ou `supabase/.env.local`)**  
    Ne les mets pas dans le `.env` à la racine: ça finit souvent par “fuiter” des clés cloud/prod dans le runtime local et provoquer des mismatches `ES256/HS256`.
  - démarre: `./scripts/supabase_local.sh start`
  - restart (si besoin): `./scripts/supabase_local.sh restart`
  - récupère les clés: `supabase status`
- Frontend local:
  - copie `frontend/env.example` vers `frontend/.env.local` (non commité)
  - démarre: `npm run dev`

### Production (Vercel + Supabase Cloud)

- Les variables `VITE_*` sont fournies par Vercel.
- Les inscriptions sont **bloquées côté Supabase** (Auth), donc sécurité OK même si quelqu’un appelle l’API directement.

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
- Scripts UI “bilan eval” (`frontend/scripts/run_ui_bilan_eval*.mjs`) : ils se connectent en **master admin**. Par défaut, ils **ne réinitialisent plus le mot de passe**. Configure une fois `SOPHIA_MASTER_ADMIN_PASSWORD` (et optionnellement `SOPHIA_MASTER_ADMIN_EMAIL`). Pour forcer un reset (local seulement), exporte `SOPHIA_MASTER_ADMIN_RESET_PASSWORD=1`.

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

## Fixtures (profils types reproductibles)

Pour tester des morceaux de flux **en isolation** (onboarding + opt-in WhatsApp, bilan/investigator, détresse, décrochage…), on peut provisionner des **users fixtures** en base à partir d’“archetypes” versionnés.

- Les archetypes sont dans `frontend/eval/archetypes/*.json`
- Le script de provisioning: `frontend/scripts/provision_fixture_user.mjs`

### Provisionner un profil type

Pré-requis: exporter les variables (local ou cloud):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Puis:

```bash
npm run fixtures:provision -- --key onboarding_whatsapp_optin_yes
```

Options:

- `--no-reset`: ne supprime pas/recrée pas le user (réutilise si existe)
- `--grant-admin`: ajoute le user dans `public.internal_admins` (utile si le pré-lancement bloque l’accès)

Le script affiche l’email/mot de passe du user fixture pour te connecter dans l’app et reproduire une conversation.

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
