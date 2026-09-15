-- ===========================================================================
-- PIVOT NUTRITION — C8 : `portion_band` rejoint la vue coach
-- ===========================================================================
--
-- POURQUOI
-- --------
-- Le journal alimentaire du coach (« this week on their plate ») se lit via
-- `coach_student_events` — la vue Tier B, seule surface par laquelle un coach
-- voit les faits d'un élève. Elle expose déjà `recognized` (aliments détectés,
-- groupes présents) et `food_group_ref` ; il lui manque `portion_band`, écrite
-- par `analyze-meal-photo-v1` APRÈS la création de la vue.
--
-- CE QUE ÇA N'OUVRE PAS
-- ----------------------
-- La doctrine « le verbatim reste chez l'élève » tient : toujours pas de
-- `media_path` (le coach sait QU'une photo existe, jamais où elle est), pas de
-- `student_note`, pas de `source_message_id`. `portion_band` est un token d'un
-- vocabulaire fermé (small|moderate|large|unclear) — un fait structuré, pas de
-- la prose.
--
-- MÉCANIQUE : CREATE OR REPLACE n'accepte d'ajouter une colonne qu'EN FIN de
-- liste — c'est exactement ce qu'on fait. Les consommateurs existants (fiche
-- élève du coach) listent leurs colonnes explicitement et ne bougent pas.
-- ===========================================================================

begin;

create or replace view public.coach_student_events as
select
  e.id,
  e.user_id,
  e.occurred_at,
  e.local_date,
  e.slot_key,
  e.source,
  e.recognized,
  e.recognition_confidence,
  e.quantity,
  e.unit,
  e.substance_ref,
  e.food_group_ref,
  e.content_locale,
  e.evidence_weight,
  e.media_path is not null as has_media,
  e.created_at,
  e.portion_band
from public.protocol_events e
where e.user_id = any ((select coached_student_ids())::uuid[]);

commit;

-- ===========================================================================
-- GARDE
-- ===========================================================================
do $$
declare
  v_col int;
  v_def text;
  v_anon boolean;
  v_auth boolean;
  v_leak int;
begin
  select count(*) into v_col
  from information_schema.columns
  where table_name = 'coach_student_events' and column_name = 'portion_band';

  select pg_get_viewdef('public.coach_student_events'::regclass, true) into v_def;

  -- La doctrine « revoke from public laisse anon » : on vérifie has_table_privilege
  -- pour 'anon' NOMMÉMENT, jamais pour 'public'.
  select has_table_privilege('anon', 'public.coach_student_events', 'select') into v_anon;
  select has_table_privilege('authenticated', 'public.coach_student_events', 'select') into v_auth;

  -- Le verbatim reste chez l'élève : aucune des colonnes proscrites ne doit
  -- réapparaître dans la définition, quelle que soit la main qui la réécrit.
  select count(*) into v_leak
  from information_schema.columns
  where table_name = 'coach_student_events'
    and column_name in ('media_path', 'student_note', 'source_message_id');

  if v_col <> 1 then
    raise exception 'C8 guard: portion_band absente de la vue';
  end if;
  if v_def not like '%coached_student_ids%' then
    raise exception 'C8 guard: le filtre coached_student_ids a disparu de la vue';
  end if;
  if v_anon then
    raise exception 'C8 guard: anon peut lire la vue coach';
  end if;
  if not v_auth then
    raise exception 'C8 guard: authenticated ne peut plus lire la vue';
  end if;
  if v_leak <> 0 then
    raise exception 'C8 guard: une colonne verbatim a fui dans la vue';
  end if;

  raise notice 'C8 OK — portion_band exposee, filtre et grants intacts, zero verbatim';
end $$;
