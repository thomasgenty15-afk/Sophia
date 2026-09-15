-- ============================================================================
-- FF-027 · LA FAIM DÉCLARÉE EN CONVERSATION — un fait ÉPHÉMÈRE et DATÉ
--
-- POURQUOI UNE TABLE, ET PAS `student_daily_checkins`
-- ---------------------------------------------------
-- La tentation était forte: `student_daily_checkins.source` porte déjà la
-- valeur `'chat'`, que personne n'écrit. Trois raisons l'ont écartée, et elles
-- sont toutes des effets de bord sur du code qui n'a rien demandé:
--
--   1. `unique (user_id, local_date)` — une déclaration de faim à 14 h écrirait
--      la ligne du jour, et le tap du soir la remplacerait à 20 h (ou pire:
--      « All good » impose `axis is null` par CHECK, donc le signal
--      DISPARAÎTRAIT). Un fait qu'un autre chemin efface n'est pas un fait.
--   2. `reengagement_io` lit `overall = 'hard'` comme un signal de risque, et
--      `coach_synthesis_io` agrège ces lignes pour le coach. Écrire un tap
--      synthétique gonflerait une bande de risque et ferait remonter au coach
--      une journée que l'élève n'a jamais qualifiée. T8 du domaine dit que le
--      coach ne lit pas le contenu des conversations; une ligne de tap fabriquée
--      à partir d'une phrase est exactement ça, en agrégé.
--   3. Le tap est une RÉPONSE de l'élève à une question fermée. Une phrase en
--      passant n'est pas une réponse à cette question, et les ranger dans la
--      même colonne rendrait les deux illisibles à qui relit.
--
-- CE QUE CETTE TABLE N'EST PAS
-- ----------------------------
-- Ce n'est PAS une mémoire. Il n'y a ni compteur, ni score, ni trait « gros
-- mangeur » — R4 de la fiche l'interdit nommément, parce qu'un trait permanent
-- serait faux le mois suivant. Ce sont des JOURS, et le décompte est recalculé
-- à la lecture sur une fenêtre glissante (`countHungerDays`, 7 jours). Une
-- ligne hors fenêtre est inerte, et le chemin d'écriture purge au-delà de
-- 60 jours pour que l'éphémère le soit vraiment sur le disque aussi.
--
-- LE COACH N'A AUCUNE POLICY ICI, comme sur `student_daily_checkins`, et pour
-- la même raison.
-- ============================================================================

create table if not exists public.student_hunger_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- La journée de l'ÉLÈVE, résolue dans SON fuseau par le runtime. Jamais
  -- `current_date`: un fait dont la date dépend du serveur qui l'a écrit est
  -- la famille de bugs nocturnes que ce dépôt a déjà payée.
  local_date date not null,

  -- Fermée à `chat` aujourd'hui. Le tap du soir vit dans
  -- `student_daily_checkins` et n'a rien à faire ici: deux écritures pour le
  -- même fait divergeraient, et c'est celle qu'on regarde le moins qui
  -- garderait l'ancien état.
  source text not null default 'chat'
    check (source in ('chat')),

  -- Le fragment qui a ouvert la porte du plancher déterministe, et les mots de
  -- l'élève. Ils existent pour qu'un jour de faim soit AUDITABLE: un fait qu'on
  -- ne peut pas relire est un fait qu'on ne peut pas débugger, et celui-ci fait
  -- grossir un plan.
  matched text,
  student_note text,

  -- La langue de la prose stockée, comme partout ailleurs: une prose sans
  -- locale ment sur elle-même dès qu'on la relit.
  content_locale text,

  created_at timestamptz not null default now(),

  -- UN JOUR = UN FAIT. Trois phrases sur la faim le même soir ne sont pas trois
  -- jours de faim; les compter trois fois ferait franchir le seuil de
  -- récurrence à une occurrence unique, ce que le seuil existe pour empêcher.
  unique (user_id, local_date)
);

create index if not exists student_hunger_reports_user_date_idx
  on public.student_hunger_reports (user_id, local_date desc);

comment on table public.student_hunger_reports is
  'FF-027: la faim déclarée spontanément en conversation, reconnue par un '
  'plancher déterministe. Fait ÉPHÉMÈRE et daté, lu sur une fenêtre glissante '
  'de 7 jours. Aucun compteur n''est stocké: le décompte est recalculé à la '
  'lecture (R4 — le signal décrit une fenêtre, pas une personne).';

-- ---------------------------------------------------------------------------
-- RLS — le propriétaire, et personne d'autre
-- ---------------------------------------------------------------------------
alter table public.student_hunger_reports enable row level security;

drop policy if exists student_hunger_reports_owner_all on public.student_hunger_reports;
create policy student_hunger_reports_owner_all on public.student_hunger_reports
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- LES GRANTS — `anon` n'a rien, et c'est un GESTE, pas un réflexe
--
-- « revoke from public » ne retire PAS les privilèges par défaut d'`anon`, qui
-- les tient de son propre grant (cicatrice `revoke-from-public-leaves-anon`).
-- Et Supabase accorde TOUT à `authenticated` sur toute table neuve, y compris
-- TRUNCATE, qui échappe à RLS. Les deux sont retirés nommément.
-- ---------------------------------------------------------------------------
revoke all on table public.student_hunger_reports from anon;
revoke truncate on table public.student_hunger_reports from authenticated;
