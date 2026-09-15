-- Chantier réengagement (2026-07-19) — épisodes de décrochage.
-- Un épisode = une période de décrochage d'un utilisateur opt-in WhatsApp :
-- ouvert à l'envoi de la première touche winback (daily_bilan_winback step 1),
-- touché à chaque escalade (steps 2/3), clos à la réponse de l'utilisateur,
-- à son retour plateforme, ou en silence terminal après le step 3.
-- Les champs « extraction » (raison du décrochage, résumé) et « outcome »
-- (réactivation J+7) sont remplis par des passes cron ultérieures (phase 3
-- du chantier) — ils naissent 'pending'. Additif, service-role uniquement.

create table if not exists public.reengagement_episodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,

  -- Faits écrits par le code (fiables, jamais issus d'un LLM).
  opened_at timestamptz not null default now(),
  days_inactive_at_open integer not null default 0,
  last_touch_step integer not null default 1
    check (last_touch_step between 1 and 3),
  touch1_sent_at timestamptz,
  touch2_sent_at timestamptz,
  touch3_sent_at timestamptz,
  first_reply_at timestamptz,
  replied_at_step integer
    check (replied_at_step between 1 and 3),
  entry_kind text
    check (entry_kind in (
      'replied_to_template',
      'spontaneous_return',
      'platform_return'
    )),
  solution_offered text,
  redirect_target text,
  exit_status text
    check (exit_status in (
      'reengaged',
      'paused',
      'stopped',
      'no_reply',
      'abandoned_mid_flow',
      'reactivated_via_platform',
      'safety'
    )),
  closed_at timestamptz,

  -- Remplis par l'extracteur post-clôture (phase 3). reason_category reste
  -- non contraint : la taxonomie vit dans le code et l'extraction est
  -- rejouable si elle évolue.
  extraction_status text not null default 'pending'
    check (extraction_status in ('pending', 'done', 'failed', 'nothing_to_extract')),
  reason_category text,
  reason_confidence text
    check (reason_confidence in ('low', 'medium', 'high')),
  reason_user_words text,
  episode_summary text,
  solution_accepted boolean,

  -- Rempli par le job outcome (phase 3).
  outcome_status text not null default 'pending'
    check (outcome_status in ('pending', 'done')),
  reactivated_within_7d boolean,
  reactivation_signal text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.reengagement_episodes is
  'Épisodes de décrochage (chantier réengagement 19/07) : une ligne par période d''inactivité relancée par le winback daily bilan, multi-touches. Écrit par process-checkins et whatsapp-webhook. Service-role uniquement.';

-- Au plus un épisode ouvert par utilisateur ; l'unicité est le filet du
-- fetch-then-insert applicatif (deux crons concurrents ne peuvent pas
-- ouvrir deux épisodes).
create unique index if not exists reengagement_episodes_one_open_per_user
  on public.reengagement_episodes (user_id)
  where closed_at is null;

create index if not exists reengagement_episodes_user_opened_idx
  on public.reengagement_episodes (user_id, opened_at desc);

create index if not exists reengagement_episodes_extraction_pending_idx
  on public.reengagement_episodes (closed_at)
  where extraction_status = 'pending' and closed_at is not null;

create index if not exists reengagement_episodes_outcome_pending_idx
  on public.reengagement_episodes (closed_at)
  where outcome_status = 'pending' and closed_at is not null;

alter table public.reengagement_episodes enable row level security;
-- Aucune policy : lisible/écrivable uniquement en service-role (RLS bypass).
