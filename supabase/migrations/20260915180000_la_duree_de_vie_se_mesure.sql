-- LOT 0 — LA DURÉE DE VIE D'UN WORKER EDGE SE MESURE, ELLE NE SE DÉDUIT PAS.
--
-- Le 2026-09-15 à 16:35 UTC, la première composition jamais tentée sur le projet
-- hébergé est morte sans rien écrire : ligne `student_meal_drafts` créée, plus
-- jamais touchée, verrou laissé en place. Supabase coupe toute fonction qui n'a
-- pas RÉPONDU en 150 s ; le travail ne continue au-delà que s'il est enregistré
-- par `EdgeRuntime.waitUntil()` après la réponse, jusqu'à 400 s (plan payant) ou
-- 150 s (plan gratuit). Le dépôt n'appelle `waitUntil` nulle part, et tout a été
-- mesuré en local sur une passerelle patchée à 600 s.
--
-- Doctrine (`docs/keel/AUDIT-AVANT-30-TIRS-2026-09-14.md`, R5) : « La durée de vie
-- réelle de cet environnement doit être vérifiée, pas déduite uniquement d'un
-- commentaire "400 s" ». Cette table est cette vérification. La fonction
-- `keel-runtime-probe-v1` insère une ligne AVANT de répondre, puis bat toutes
-- les dix secondes en arrière-plan : `max(last_beat_at) - started_at` est le
-- plafond réel, et une ligne sans `finished_at` est la preuve d'un worker mort.
--
-- Aucune donnée personnelle : pas de `user_id`, rien à exporter ni à purger.
--
-- Comment tirer, puis lire (la seule façon d'appeler la sonde — pas de cron) :
--   curl -X POST "$SUPABASE_URL/functions/v1/keel-runtime-probe-v1" \
--     -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
--     -H "x-internal-secret: $INTERNAL_FUNCTION_SECRET" -d '{"n": 390}'
--   select n_seconds, wait_until, finished_at is not null as finie,
--          extract(epoch from coalesce(finished_at, last_beat_at) - started_at) as vecu_s
--     from public.keel_runtime_probes order by started_at desc;

create table if not exists public.keel_runtime_probes (
  id uuid primary key default gen_random_uuid(),
  n_seconds integer not null check (n_seconds between 10 and 3600),
  -- `true` si le runtime a accepté la promesse (`EdgeRuntime.waitUntil` existe).
  wait_until boolean not null default false,
  started_at timestamptz not null default now(),
  last_beat_at timestamptz,
  finished_at timestamptz,
  hostname text,
  region text,
  execution_id text
);

comment on table public.keel_runtime_probes is
  'Lot 0 (2026-09-15) : mesure de la durée de vie réelle d''un worker edge. '
  'Une ligne par tir de keel-runtime-probe-v1 ; battement toutes les 10 s ; '
  'max(last_beat_at) - started_at = plafond réel ; finished_at null = worker mort.';

alter table public.keel_runtime_probes enable row level security;

-- Les privilèges par défaut donnent TOUT à `authenticated` sur une table neuve, et
-- `revoke from public` ne retire rien à `anon` : les deux sont nommés.
revoke all on table public.keel_runtime_probes from public, anon, authenticated;
grant all on table public.keel_runtime_probes to service_role;
