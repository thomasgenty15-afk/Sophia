-- ============================================================================
-- FF-009 — LA RELATION AU PLAN D'UN REPAS DÉCLARÉ
--
-- LE DÉFAUT
-- ---------
-- Un élève saute le dîner prévu et commande une pizza. Il l'écrit. Trois choses
-- peuvent arriver aujourd'hui, toutes mauvaises :
--
--   1. le plancher ne mord pas et RIEN n'est enregistré — la soirée disparaît ;
--   2. le plancher mord sur un composant reconnu et écrit une ligne qui
--      ressemble en tout point à un repas cuisiné comme prévu ;
--   3. l'élève, sachant que ça ne compte pas, NE LE DIT PLUS.
--
-- Le troisième est le pire. Le coach lit alors une semaine où quatre dîners
-- sont cuisinés et trois soirs sont vides, et il en conclut que l'élève n'a
-- rien mangé ou n'a rien dit. Les deux sont faux.
--
-- Le produit avait déjà tranché la façon d'en PARLER : `doctrine_starter.ts`
-- porte le débat `off_plan_meals`, dont la position `no_cheat_meal` interdit
-- littéralement « cheat meal », « treat meal », « make up for it », « burn it
-- off », et le verrou déterministe mord dessus. On avait le vocabulaire, la
-- posture et l'interdit. IL MANQUAIT LE FAIT.
--
-- CE QUE CETTE MIGRATION AJOUTE, ET CE QU'ELLE REFUSE D'AJOUTER
-- -------------------------------------------------------------
-- UNE colonne, nullable, sur le modèle exact de `disqualified_reason`
-- (20260804160000). Rien d'autre. Pas de table, pas de compteur, pas de taux.
--
-- TROIS AXES QUI EXISTENT DÉJÀ ET QUI NE BOUGENT PAS — un lecteur pressé les
-- confondra, donc ils sont écrits ici côte à côte :
--
--   `source`              la PROVENANCE (chat | photo | quick_tap | …).
--                         Une photo peut parfaitement être un repas hors plan.
--   `evidence_weight`     la FIABILITÉ (photo 1.0 / texte 0.8 / pouce 0.4).
--                         Un hors-plan bien décrit est fiable.
--   `disqualified_reason` la RÉTRACTATION. ⚠️ Un repas hors plan est un repas
--                         MANGÉ ; un repas disqualifié est un repas NON mangé.
--                         Les deux colonnes vivent côte à côte et ne disent
--                         absolument pas la même chose.
--   `plan_relation`       ← NOUVEAU. La RELATION AU PLAN, et rien d'autre.
--
-- POURQUOI `NULL` N'EST PAS UN DÉFAUT À COMBLER
-- ----------------------------------------------
-- `null` est l'état des lignes existantes, et il veut dire « on ne sait pas ».
-- Les faire basculer d'office en `as_planned` fabriquerait une adhérence
-- rétroactive qui n'a jamais été mesurée. Il n'existe AUCUNE donnée permettant
-- de remplir cette colonne honnêtement sur l'existant, donc on ne la remplit
-- pas. FF-009 R5.
--
-- ⚠️ CE QUE PERSONNE NE DOIT FAIRE AVEC CETTE COLONNE
-- Sommer les comptes. « 71 % de repas comme prévu » est un score d'adhérence
-- déguisé, et `adherence_score` est déjà dans `SUPPRESSED_STUDENT_SURFACES`.
-- Les trois comptes — cuisiné comme prévu · hors plan · photographié — se
-- restituent SÉPARÉMENT. Fondus, ils donnent un chiffre que personne en aval ne
-- peut plus défaire, et que le coach lira comme un fait (FF-007 R8).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. LA COLONNE
-- ----------------------------------------------------------------------------

alter table public.protocol_events
  add column if not exists plan_relation text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.protocol_events'::regclass
       and conname = 'protocol_events_plan_relation_check'
  ) then
    alter table public.protocol_events
      add constraint protocol_events_plan_relation_check
      check (
        plan_relation is null
        or plan_relation in ('as_planned', 'off_plan')
      );
  end if;
end $$;

comment on column public.protocol_events.plan_relation is
  'La relation de ce fait au plan: as_planned | off_plan | NULL (inconnu). '
  'NULL EST UN ÉTAT, pas un défaut à combler: c''est ce que portent toutes les '
  'lignes antérieures à FF-009, et les basculer en as_planned fabriquerait une '
  'adhérence rétroactive jamais mesurée. À ne PAS confondre avec source (la '
  'provenance), evidence_weight (la fiabilité) ni disqualified_reason (la '
  'rétractation — un hors-plan est un repas MANGÉ, un disqualifié ne l''est '
  'pas). Les trois comptes qui en découlent ne se somment JAMAIS.';

-- L'index qui rend le comptage du hors-plan gratuit. Partiel: l'écrasante
-- majorité des lignes portent NULL, donc les indexer coûterait plus que ça ne
-- rapporte — même arbitrage que `protocol_events_disqualified_idx`.
create index if not exists protocol_events_plan_relation_idx
  on public.protocol_events (user_id, local_date)
  where plan_relation is not null;

-- ----------------------------------------------------------------------------
-- 2. LA VUE COACH
--
-- Sans la colonne dans la vue, le coach voit un repas de plus SANS SAVOIR
-- LEQUEL — et c'est exactement le défaut que `20260804182000` a corrigé pour
-- les photos refusées : deux lectures de la même donnée, deux règles.
--
-- ⚠️ `security_invoker = off` EST RÉAFFIRMÉ, et ce n'est pas de la ceinture et
-- bretelles. Mesuré (20260805092000, relecture à froid) : `create or replace
-- view` FAIT TOMBER `pg_class.reloptions` de `{security_invoker=off}` à NULL.
-- Le comportement ne change pas — `off` est le défaut du moteur — donc AUCUN
-- test ne peut le voir. Ces vues sont marquées `off` DÉLIBÉRÉMENT : elles
-- lisent avec les droits du propriétaire parce que le coach n'a aucune policy
-- sur les tables sous-jacentes, et c'est la vue elle-même qui porte la tenancy
-- via `coached_student_ids()`. Le contrôle final vérifie l'option, pas le texte.
-- ----------------------------------------------------------------------------

create or replace view public.coach_student_events as
  select
    id, user_id, occurred_at, local_date, slot_key, source,
    recognized, recognition_confidence, quantity, unit,
    substance_ref, food_group_ref, content_locale, evidence_weight,
    -- NON-INPUT: la photo elle-même ne traverse jamais. Le coach apprend
    -- qu'une photo a existé, pas ce qu'elle montrait.
    media_path is not null as has_media,
    created_at, portion_band,
    -- FF-009. Exposée, PAS filtrée: un repas hors plan est un repas mangé, et
    -- le coach doit le voir — c'est même toute la valeur de la colonne. Ce qui
    -- reste filtré, c'est la RÉTRACTATION, juste en dessous.
    plan_relation
  from public.protocol_events e
  where user_id = any (((select public.coached_student_ids()))::uuid[])
    and disqualified_reason is null
    and occurred_at >= public.coach_student_history_floor(user_id);

alter view public.coach_student_events set (security_invoker = off);

comment on view public.coach_student_events is
  'Les faits de protocole des élèves de CE coach, bornés au lien vivant. Les '
  'photos disqualifiées sont exclues. `plan_relation` est EXPOSÉE et non '
  'filtrée: un repas hors plan est un repas mangé. La photo elle-même ne '
  'traverse jamais (has_media).';

-- ----------------------------------------------------------------------------
-- 3. CONTRÔLE FINAL — ON REJOUE LE GESTE, ON N'INSPECTE PAS DU TEXTE
--
-- La leçon payée par `20260804140000`: une épreuve d'absence textuelle laisse
-- passer une panne réelle. Trois gestes réels ici, tous annulés :
--   a. le CHECK refuse un jeton hors vocabulaire ;
--   b. `null` reste `null` — aucun remplissage rétroactif ;
--   c. `security_invoker` est bien resté `off` après le `create or replace`.
-- ----------------------------------------------------------------------------

do $$
declare
  probe_user uuid;
  refused boolean := false;
  v_relation text;
  v_options text[];
begin
  -- (c) l'option de la vue: vérifiable sans utilisateur, donc en premier.
  select c.reloptions into v_options
    from pg_class c
   where c.oid = 'public.coach_student_events'::regclass;
  if v_options is null or not ('security_invoker=off' = any (v_options)) then
    raise exception
      'plan_relation: coach_student_events a PERDU security_invoker=off au '
      '`create or replace view` (reloptions = %) — la vue lirait avec les '
      'droits de l''appelant, et le coach ne verrait plus rien', v_options;
  end if;

  select id into probe_user from auth.users limit 1;
  if probe_user is null then
    raise notice 'plan_relation: aucun utilisateur en base, contrôles a/b sautés';
    return;
  end if;

  -- (a) le CHECK mord vraiment.
  begin
    insert into public.protocol_events
      (user_id, occurred_at, local_date, source, content_locale, plan_relation)
    values
      (probe_user, now(), current_date, 'chat', 'fr-FR', 'cheat_meal');
    raise exception
      'plan_relation: le CHECK n''a PAS refusé un jeton hors vocabulaire — '
      'le domaine serait ouvert à n''importe quelle étiquette';
  exception
    when check_violation then
      refused := true;
  end;
  if not refused then
    raise exception 'plan_relation: contrôle du CHECK non concluant';
  end if;

  -- (b) une ligne écrite SANS la colonne reste `null`: aucun défaut ne se
  -- glisse, aucune adhérence rétroactive ne se fabrique.
  insert into public.protocol_events
    (user_id, occurred_at, local_date, source, content_locale, student_note)
  values
    (probe_user, now(), current_date, 'chat', 'fr-FR', '__qa_plan_relation__')
  returning plan_relation into v_relation;

  if v_relation is not null then
    raise exception
      'plan_relation: une ligne neuve porte % au lieu de NULL — un défaut a '
      'été posé quelque part et il fabrique de l''adhérence', v_relation;
  end if;

  raise notice 'plan_relation: CHECK, défaut NULL et security_invoker vérifiés';
  raise exception using errcode = 'triggered_action_exception',
    message = '__qa_rollback__';
exception
  when triggered_action_exception then
    if sqlerrm <> '__qa_rollback__' then raise; end if;
end $$;
