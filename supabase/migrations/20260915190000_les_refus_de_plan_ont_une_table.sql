-- LES REFUS DE PLAN ONT UNE TABLE — le jeu de données de l'amélioration.
--
-- Mesuré le 2026-09-15 sur staging, première composition arrivée au bout en
-- hébergé : 209 s vécues, deux rattrapages, puis `plan_not_deliverable`. Et
-- personne ne pouvait dire PAR QUEL CONTRÔLE : le 422 portait la liste des
-- refus (`refusals`, cause par cause, jour, moment, bouche, terme), le journal
-- du worker aussi — mais rien de durable. `system_error_logs` ne garde que le
-- statut ; `meal_composition_verdicts` exige un `meal_id`, qu'un plan refusé
-- n'a pas. « Comment on fait pour s'améliorer ? » — avec ceci.
--
-- UNE LIGNE PAR PLAN REFUSÉ APRÈS APPEL MODÈLE, quel que soit le chemin
-- (aperçu accepté tôt ou composition synchrone) : le jeton, les motifs EXACTS
-- (le `detail` que `publicRefusals` masque à l'écran pour les causes
-- caloriques est gardé ici — service_role seulement, jamais rendu), les
-- contrôles non évalués et incomplets, le verdict de validation, LE CANDIDAT
-- REFUSÉ (plats, préparations, sessions) pour qu'on puisse regarder ce qui
-- clochait, le nombre de tours et d'appels, la durée, le modèle et la version
-- de prompt.
--
-- Donnée personnelle (le plan de quelqu'un) : réclamée par l'export RGPD dès
-- cette migration (`account-export-v1`, `mes_repas_generes.json`), effacée en
-- cascade avec le compte.

create table if not exists public.keel_plan_refusals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid,
  request_id text not null,
  draft_id uuid references public.student_meal_drafts(id) on delete set null,
  mode text not null check (mode in ('sync', 'async')),
  intent text,
  starts_on date,
  duration_days smallint,
  http_status smallint not null,
  token text not null,
  detail text,
  refusals jsonb not null default '[]'::jsonb,
  unevaluated jsonb not null default '[]'::jsonb,
  incomplete jsonb not null default '[]'::jsonb,
  validation jsonb,
  plan jsonb,
  rounds smallint,
  calls_made smallint,
  wall_ms integer,
  attempt smallint,
  prompt_version text,
  model text
);

comment on table public.keel_plan_refusals is
  'Lot R (2026-09-15) : chaque plan REFUSE apres appel modele, avec ses motifs '
  'exacts (detail non masque — service_role seulement), les controles non '
  'evalues/incomplets, le verdict de validation et le candidat refuse. C''est le '
  'jeu de donnees de l''amelioration. Reclame par l''export RGPD des cette '
  'migration ; efface en cascade avec le compte.';
comment on column public.keel_plan_refusals.token is
  'Le jeton du refus tel que rendu au client : plan_not_deliverable, '
  'plan_validation_unavailable, house_rule_violated, empty_meal, '
  'draft_not_composed, meal_unparseable, composition_unavailable…';
comment on column public.keel_plan_refusals.refusals is
  'La liste des controles bloquants : {cause, day, slot, member_id, term, detail}. '
  'Le detail des causes caloriques est present ici et masque a l''ecran.';
comment on column public.keel_plan_refusals.plan is
  'Le candidat refuse : {dishes, preparations, cooking_sessions}. Null quand le '
  'refus precede la composition (modele muet, illisible).';

create index if not exists keel_plan_refusals_user_idx
  on public.keel_plan_refusals (user_id, created_at desc);
create index if not exists keel_plan_refusals_token_idx
  on public.keel_plan_refusals (token, created_at desc);
create index if not exists keel_plan_refusals_request_idx
  on public.keel_plan_refusals (request_id);

alter table public.keel_plan_refusals enable row level security;
-- Les privileges par defaut donnent TOUT a `authenticated` sur une table neuve,
-- et `revoke from public` ne retire rien a `anon` : les deux sont nommes.
revoke all on table public.keel_plan_refusals from public, anon, authenticated;
grant all on table public.keel_plan_refusals to service_role;
