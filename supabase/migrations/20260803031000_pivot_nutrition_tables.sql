-- PIVOT NUTRITION — P0.2: les tables MANQUANTES, et elles seules.
--
-- Autorité: docs/nutrition-pivot/PLAN-NUIT.md §3.6 (mapping cible ↔ existant),
-- §3.7 (coach_doctrines), §3.4 (mémoire alimentaire), et docs/keel/CONTRACT.md
-- (R1-R7 + non-inputs) qui prime sur toute intuition.
--
-- CE QUI EXISTE DÉJÀ ET N'EST PAS RECRÉÉ (vérifié en base locale, 128 tables,
-- 48 migrations appliquées — l'ANNEXE B décrivait la migration P0 comme "non
-- appliquée", c'est périmé):
--   coaches, coach_clients, coach_invitations, plan_templates, plan_documents,
--   plan_versions, plan_commitments, protocol_events (+ portion_band),
--   commitment_evaluations, weekly_reviews, planned_deviations,
--   upcoming_contexts, contract_change_requests, student_safety_constraints,
--   substance_limits, card_templates/student_cards/card_wins,
--   coach_billing_periods, slot_vocabulary, food_groups, meal_ideas,
--   meal_plan_entries, et les vues coach_student_directory/_events.
--
-- CE QUE CETTE MIGRATION CRÉE (les 5 trous du §3.6, rien d'autre):
--   1. cohorts                 + coach_clients.cohort_id
--   2. coach_doctrines         (§3.7, versionnée, avec INTERDITS)
--   3. coach_syntheses         (§1.4 la synthèse poussée du lundi)
--   4. recurring_meals         (§3.4 MAGASIN 2, côté ÉLÈVE)
--   5. student_facts           (§3.4 MAGASIN 3, couche SOUPLE uniquement)
--
-- ---------------------------------------------------------------------------
-- LA DÉCISION LA PLUS IMPORTANTE DE CE FICHIER — pourquoi `student_facts`
-- N'A PAS de `kind='allergy'`, contrairement au §3.4.1 du plan.
--
-- Le plan propose `student_facts.kind IN ('allergy','intolerance',
-- 'diet_constraint','preference','aversion','context','goal_note')` avec un
-- booléen `is_hard_constraint`. Or `student_safety_constraints` EXISTE, porte
-- déjà allergy/intolerance/medical/religious/dislike en identifiants
-- STRUCTURÉS (allergen_ref/substance_ref/medication_class, jamais de prose),
-- est chargée à CHAQUE TOUR hors du chemin mémoire, et son validateur
-- déterministe post-génération est écrit ET testé
-- (_shared/keel/safety_constraints.ts, 322 l.).
--
-- Créer une seconde table capable de porter une allergie, c'est fabriquer
-- exactement le pattern adversarial §7.3-(6) — "deux sources de vérité qui
-- peuvent diverger sur le même état" — sur la donnée où diverger est
-- DANGEREUX. Une allergie déclarée dans la mauvaise table est une allergie
-- invisible au validateur.
--
-- Donc, par construction et par CHECK:
--   * DUR   (allergie, intolérance, médical, religieux, éviction stricte)
--           -> `student_safety_constraints`. Inchangée. Un seul chemin.
--   * SOUPLE (préférence, aversion, contexte de vie, note d'objectif)
--           -> `student_facts`. Ne peut PAS porter de contrainte dure.
-- Le CHECK `student_facts_no_hard_constraint_check` rend l'erreur impossible
-- à commettre en silence: une insertion 'allergy' échoue, bruyamment (R7).
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. COHORTS — la promo, l'unité de vente du coach 1:N (§1.7 cible ①)
-- ===========================================================================
--
-- `coach_clients` est plat aujourd'hui. Le produit se vend par COHORTE
-- ("challenge 8 semaines", 50-500 élèves): le rapport de complétion de fin de
-- cohorte (§1.4) est l'argument marketing de la cohorte suivante, et il n'est
-- calculable que si le regroupement existe en base.

create table if not exists public.cohorts (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete cascade,

  -- Prose lue par un humain -> content_locale obligatoire (R2).
  label text not null,
  content_locale text not null,

  -- Le template de protocole servi à cette cohorte. Nullable: un coach peut
  -- créer la cohorte avant d'avoir fini son protocole (ordre réel du terrain).
  plan_template_id uuid references public.plan_templates(id) on delete set null,

  -- Fenêtre calendaire. `starts_on` porte le "jour 1" commun qui rend
  -- comparables les élèves d'une même promo.
  starts_on date,
  duration_weeks int check (duration_weeks is null or duration_weeks between 1 and 104),

  -- R1: tokens ASCII snake_case. R6: chaque valeur a une branche nommée —
  -- 'draft' (invisible), 'running' (les relances tournent),
  -- 'completed' (le rapport de complétion est calculable et figé).
  status text not null default 'draft'
    check (status in ('draft', 'running', 'completed', 'archived')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cohorts_coach_idx on public.cohorts (coach_id, status);

comment on table public.cohorts is
  'PIVOT §1.7: la promo d''un coach 1:N. Unité du rapport de complétion.';

-- Le rattachement. Nullable: un élève 1:1 (cible ②) n''a pas de cohorte, et
-- forcer une cohorte fantôme pour lui serait une donnée inventée.
alter table public.coach_clients
  add column if not exists cohort_id uuid references public.cohorts(id) on delete set null;

create index if not exists coach_clients_cohort_idx
  on public.coach_clients (cohort_id)
  where cohort_id is not null;

comment on column public.coach_clients.cohort_id is
  'PIVOT §1.7: promo de l''élève. NULL = suivi 1:1 hors cohorte.';

-- ===========================================================================
-- 2. COACH_DOCTRINES — la voix et les INTERDITS du coach (§3.7)
-- ===========================================================================
--
-- Versionnée par construction: §3.7 brique 6 exige "retour en un clic" et
-- "diff visible". Une doctrine écrasée en place ne se rollback pas.
--
-- `forbidden` est la moitié DURE de cette table: le §3.3 "double verrou" veut
-- ces interdits (a) injectés dans le prompt ET (b) vérifiés par un filtre
-- déterministe post-génération — la même mécanique que
-- `assertNoMedicalConstraintViolation`, seconde source. D'où le format
-- structuré: R1 impose des tokens ASCII pour tout ce sur quoi le code branche.

create table if not exists public.coach_doctrines (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete cascade,
  version int not null check (version >= 1),

  -- [{ "claim": "...", "rationale": "..." }] — prose, lue par le LLM.
  beliefs jsonb not null default '[]'::jsonb,

  -- LES INTERDITS. Forme: [{ "token": "six_small_meals", "surface_forms":
  -- ["6 petits repas","six small meals"], "reason": "..." }]
  -- `token` est ASCII snake_case (R1) parce que le filtre déterministe branche
  -- dessus; `surface_forms` sont les formulations à matcher dans la sortie.
  forbidden jsonb not null default '[]'::jsonb,

  -- [{ "term": "...", "meaning": "..." }] — le vocabulaire du coach.
  vocabulary jsonb not null default '[]'::jsonb,

  -- Les cas durs de l'interview (§1.4): [{ "situation": "...",
  -- "coach_answer": "...", "source": "interview|weekly_suggestion|test_mode" }]
  -- C'est le few-shot qui fait "MON agent".
  arbitrations jsonb not null default '[]'::jsonb,

  -- { "address": "tu|vous", "length": "short|medium", "emojis": "none|light",
  --   "language": "fr-FR" } — R3: la langue de la VOIX, distincte de ui_locale.
  voice jsonb not null default '{}'::jsonb,

  -- Le bloc assemblé et mis en cache (§3.3). NULL tant que non compilé.
  compiled_prompt text,
  -- Empreinte du compiled_prompt: la clé d'invalidation du cache fournisseur.
  compiled_prompt_hash text,

  -- R2: la doctrine EST de la prose destinée à être lue.
  content_locale text not null,

  -- NULL = brouillon. Une seule version publiée à la fois (index plus bas).
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,

  -- Traçabilité §3.7 brique 6: d'où vient cette version.
  created_from_version int,
  change_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (coach_id, version)
);

-- UNE seule doctrine publiée par coach — même invariant que
-- `plan_versions` (1 published par élève). Sans ça, "quelle doctrine
-- s'applique au prochain message ?" n'a pas de réponse déterministe.
create unique index if not exists coach_doctrines_one_published_idx
  on public.coach_doctrines (coach_id)
  where published_at is not null;

create index if not exists coach_doctrines_coach_version_idx
  on public.coach_doctrines (coach_id, version desc);

comment on table public.coach_doctrines is
  'PIVOT §3.7: croyances/INTERDITS/vocabulaire/arbitrages/voix, versionnés. '
  'Une seule version publiée par coach. forbidden alimente le double verrou §3.3.';

-- ===========================================================================
-- 3. COACH_SYNTHESES — la valeur POUSSÉE au coach (§1.4)
-- ===========================================================================
--
-- "Un coach qui n'ouvre jamais le dashboard mais lit sa synthèse est un client
-- retenu." Cette table est donc un ARTEFACT PERSISTÉ, pas un calcul à la
-- volée: il faut pouvoir prouver ce qui a été envoyé, le renvoyer, et le
-- comparer d'une semaine sur l'autre.
--
-- Doctrine "execution truth" (CONTRACT): `delivered_at` n'est posé qu'après
-- livraison effective. Une synthèse générée mais non envoyée reste visible
-- comme telle — jamais annoncée comme reçue.

create table if not exists public.coach_syntheses (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete cascade,
  cohort_id uuid references public.cohorts(id) on delete set null,

  -- R6: deux branches nommées, deux objets produit distincts.
  --   'weekly'          -> la synthèse du lundi (§1.4)
  --   'cohort_completion' -> le rapport de fin de cohorte (§1.4)
  kind text not null check (kind in ('weekly', 'cohort_completion')),

  -- Fenêtre couverte. Bornes explicites: sans elles, deux synthèses
  -- chevauchantes double-comptent un élève.
  period_start date not null,
  period_end date not null,
  check (period_end >= period_start),

  -- Les CHIFFRES, calculés en SQL déterministe (jamais par le LLM — leçon
  -- "récap confabulé"): { "active_students": n, "sliding": n, "silent": n,
  --   "coverage": {...}, "adherence": {...}, "portion_bands": {...} }
  metrics jsonb not null default '{}'::jsonb,

  -- Les 3 élèves à rattraper: [{ "student_user_id": uuid, "reason_code":
  --   "silent_72h|coverage_drop|restriction_flag|...", "evidence": {...} }]
  -- reason_code est un token ASCII (R1): le tri du coach branche dessus.
  flagged_students jsonb not null default '[]'::jsonb,

  -- Le texte réellement envoyé. R2 sur la prose.
  narrative text,
  content_locale text not null,

  -- Execution truth: généré ≠ livré.
  generated_at timestamptz not null default now(),
  delivered_at timestamptz,
  delivery_channel text check (delivery_channel in ('whatsapp', 'email', 'in_app')),

  created_at timestamptz not null default now(),

  -- Idempotence: un cron qui repasse ne crée pas une 2e synthèse de la même
  -- semaine (classe de bug "doublon = race check-then-send", déjà payée sur
  -- subscription_notifications).
  unique (coach_id, kind, period_start, period_end)
);

create index if not exists coach_syntheses_coach_idx
  on public.coach_syntheses (coach_id, period_start desc);

comment on table public.coach_syntheses is
  'PIVOT §1.4: synthèse hebdo + rapport de complétion. metrics vient du SQL, '
  'jamais du LLM. delivered_at posé après livraison réelle (execution truth).';

-- ===========================================================================
-- 4. RECURRING_MEALS — MAGASIN 2 de la mémoire alimentaire (§3.4), côté ÉLÈVE
-- ===========================================================================
--
-- À ne pas confondre avec `meal_ideas` qui existe déjà et est côté COACH
-- (bibliothèque de suggestions). Ici: la connaissance DISTILLÉE d'un élève,
-- produite par consolidation nocturne (§3.4.4) depuis ses protocol_events.
--
-- Son rôle opérationnel: être consultée AVANT l'analyse complète d'une photo
-- ("ton petit-déj habituel ?"), ce qui évite une ré-analyse et rend la
-- reconnaissance instantanée.
--
-- ⚠️ `portion_bias` respecte NON-INPUT #4 et la décision P0.0(b) de cette
-- nuit: c'est une calibration ORDINALE sur des bandes de portion, pas un
-- facteur appliqué à des grammes ou à des kcal. Aucun nombre nutritionnel
-- n'entre ni ne sort de cette table.

create table if not exists public.recurring_meals (
  id uuid primary key default gen_random_uuid(),
  -- P0.0(a): l'élève est un auth.users (fantôme provisionné par numéro).
  user_id uuid not null references auth.users(id) on delete cascade,

  -- "petit-déj habituel : skyr + granola + myrtilles" — prose (R2).
  label text not null,
  content_locale text not null,

  -- Les items CONFIRMÉS par l'élève: [{ "name": "...",
  --   "food_group_ref": "berries" }]. food_group_ref est un slug du
  -- référentiel existant (R1/R7: un slug inconnu doit échouer à l'écriture,
  -- assuré côté applicatif par parseFoodGroupRef).
  canonical_items jsonb not null default '[]'::jsonb,

  -- Créneau nominal, vocabulaire GLOBAL existant (slot_vocabulary).
  slot_key text references public.slot_vocabulary(key),

  -- Compteur de FAITS observés, pas d'état dérivé: le contrat interdit les
  -- compteurs incrémentaux d'état ("zero incremental counters"), pas de
  -- compter des occurrences constatées. Recalculable depuis protocol_events.
  occurrences int not null default 1 check (occurrences >= 1),
  last_seen_at timestamptz,

  -- Calibration ordinale: { "observed_band": "large", "corrected_band":
  --   "moderate", "sample": 3 }. Jamais de pourcentage, jamais de grammes.
  portion_bias jsonb not null default '{}'::jsonb,

  -- R6, branches nommées:
  --   'candidate' -> détecté par la consolidation, JAMAIS proposé tel quel
  --   'active'    -> confirmé par l'élève en conversation, proposable
  --   'stale'     -> non vu depuis 30 j, ne plus proposer
  -- La règle §3.4.4 "candidate -> active à la première confirmation
  -- conversationnelle" est la seule transition montante autorisée: le système
  -- ne se confirme jamais lui-même.
  status text not null default 'candidate'
    check (status in ('candidate', 'active', 'stale')),
  confirmed_at timestamptz,

  -- Anti-incohérence: 'active' EXIGE une confirmation datée. Sans ce CHECK,
  -- un bug de consolidation pourrait promouvoir tout seul et l'agent dirait
  -- "ton petit-déj habituel ?" sur un repas que l'élève n'a jamais validé.
  check (status <> 'active' or confirmed_at is not null),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recurring_meals_user_status_idx
  on public.recurring_meals (user_id, status, slot_key);

comment on table public.recurring_meals is
  'PIVOT §3.4 MAGASIN 2 (élève). Consulté AVANT analyse photo. '
  'candidate->active seulement sur confirmation de l''élève. '
  'portion_bias est ORDINAL (bandes), jamais des grammes ni des kcal.';

-- ===========================================================================
-- 5. STUDENT_FACTS — MAGASIN 3 (§3.4), couche SOUPLE UNIQUEMENT
-- ===========================================================================
-- Voir l'encadré en tête de fichier: les contraintes DURES vivent et
-- continuent de vivre dans `student_safety_constraints`.

create table if not exists public.student_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- R6: quatre branches nommées, toutes SOUPLES.
  --   'preference' -> "aime le poisson blanc"
  --   'aversion'   -> "déteste le brocoli"        (goût, PAS médical)
  --   'context'    -> "mange à la cantine le midi", "travaille de nuit"
  --   'goal_note'  -> "veut tenir jusqu'au marathon d'octobre"
  kind text not null check (kind in ('preference', 'aversion', 'context', 'goal_note')),

  -- LE GARDE-FOU CENTRAL DE CE FICHIER (voir encadré en tête).
  -- Toute tentative d'écrire une contrainte dure ici échoue bruyamment
  -- plutôt que de créer une allergie invisible au validateur déterministe.
  constraint student_facts_no_hard_constraint_check
    check (kind not in ('allergy', 'intolerance', 'medical', 'religious', 'diet_constraint')),

  -- { "label": "brocoli", "food_group_ref": "cruciferous_veg" } — le slug est
  -- optionnel: une préférence n'a pas toujours de groupe alimentaire.
  value jsonb not null,

  -- Prose libre de l'élève, citable. R2.
  note text,
  content_locale text not null,

  -- Gouvernance §3.4: une correction INVALIDE l'ancienne valeur, elle ne
  -- l'écrase pas (protection contre la contamination mémoire + traçabilité).
  status text not null default 'active' check (status in ('active', 'invalidated')),
  invalidated_at timestamptz,
  superseded_by_fact_id uuid references public.student_facts(id) on delete set null,
  check (status <> 'invalidated' or invalidated_at is not null),

  -- Traçabilité: d'où vient ce fait. Le §3.4 l'exige pour pouvoir répondre
  -- "pourquoi tu crois ça ?" (§3.7 brique 3, observabilité).
  source_message_id uuid,
  declared_by text not null default 'student' check (declared_by in ('student', 'coach', 'system')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists student_facts_user_active_idx
  on public.student_facts (user_id, kind)
  where status = 'active';

comment on table public.student_facts is
  'PIVOT §3.4 MAGASIN 3 — couche SOUPLE. Les contraintes DURES (allergie, '
  'intolérance, médical, religieux) restent dans student_safety_constraints: '
  'une seule source de vérité pour ce qui peut blesser (§7.3-6). '
  'Correction = invalidation + nouvelle ligne, jamais un UPDATE en place.';

-- ===========================================================================
-- 6. RLS — doctrine KEEL appliquée telle quelle
-- ===========================================================================
-- Rappel (docs/keel/SCHEMA.md §TENANCY, 20260727090000 l.706-740):
--   * élève = SELECT only; toutes les écritures passent par service_role;
--   * le coach lit ses élèves via `coached_student_ids()` (InitPlan), et n'a
--     AUCUNE policy d'écriture sur les données d'un élève;
--   * sur SES PROPRES tables (plan_templates), le coach a bien un ALL —
--     c'est le motif repris ici pour cohorts et coach_doctrines.

alter table public.cohorts          enable row level security;
alter table public.coach_doctrines  enable row level security;
alter table public.coach_syntheses  enable row level security;
alter table public.recurring_meals  enable row level security;
alter table public.student_facts    enable row level security;

-- --- Tables du COACH: il en est propriétaire (motif plan_templates_coach_all)

drop policy if exists cohorts_coach_all on public.cohorts;
create policy cohorts_coach_all on public.cohorts
  for all to authenticated
  using (
    coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  )
  with check (
    coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  );

drop policy if exists coach_doctrines_coach_all on public.coach_doctrines;
create policy coach_doctrines_coach_all on public.coach_doctrines
  for all to authenticated
  using (
    coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  )
  with check (
    coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  );

-- La synthèse est PRODUITE par le serveur et LUE par le coach. Un coach qui
-- pourrait écrire sa propre synthèse pourrait maquiller un rapport de
-- complétion — donc SELECT seulement, écriture service_role.
drop policy if exists coach_syntheses_coach_select on public.coach_syntheses;
create policy coach_syntheses_coach_select on public.coach_syntheses
  for select to authenticated
  using (
    coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  );

-- --- Tables de l'ÉLÈVE: SELECT propriétaire uniquement.
--
-- ⚠️ AUCUNE policy coach ici, et c'est délibéré (§1.5 "l'adhérence, jamais le
-- journal intime"). Les repas récurrents et les préférences d'un élève sont
-- de l'intime; ce que le coach reçoit, c'est l'AGRÉGAT via `coach_syntheses`,
-- produit par le serveur. Si un besoin d'exposition ligne-à-ligne apparaît, il
-- passera par une VUE Tier B à allowlist de colonnes — jamais par une policy
-- directe (PostgREST applique les droits par RÔLE: coach et élève sont tous
-- deux `authenticated`, donc restreindre des colonnes par policy est
-- impossible — c'est le motif déjà en production sur coach_student_events).

drop policy if exists recurring_meals_student_select on public.recurring_meals;
create policy recurring_meals_student_select on public.recurring_meals
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists student_facts_student_select on public.student_facts;
create policy student_facts_student_select on public.student_facts
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ===========================================================================
-- 7. updated_at — réutilisation du trigger générique existant
-- ===========================================================================

-- Nom vérifié en base locale avant écriture (il y en a deux, et ce n'est PAS
-- `set_updated_at`):
--   select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and proname ilike '%updated_at%';
--   -> tg_set_updated_at, tg_memory_items_set_updated_at
do $$
declare
  target text;
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'tg_set_updated_at'
  ) then
    -- Fail-loud plutôt que silence (R7): un updated_at figé se découvre des
    -- mois plus tard, sur une donnée qu'on ne peut plus dater.
    raise exception 'pivot: public.tg_set_updated_at() introuvable — '
      'les triggers updated_at ne peuvent pas être créés';
  end if;

  foreach target in array array[
    'cohorts', 'coach_doctrines', 'recurring_meals', 'student_facts'
  ] loop
    execute format(
      'drop trigger if exists %I on public.%I', target || '_set_updated_at', target
    );
    execute format(
      'create trigger %I before update on public.%I '
      'for each row execute function public.tg_set_updated_at()',
      target || '_set_updated_at', target
    );
  end loop;
end $$;
