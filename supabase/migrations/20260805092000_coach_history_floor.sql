-- ============================================================================
-- L'HISTORIQUE SUIT L'ÉLÈVE — le coach ne lit que ce qui suit son arrivée
--
-- CE QUE LE PASSAGE AU VRAI COACH A RÉVÉLÉ
-- ----------------------------------------
-- Un inscrit libre traverse le programme de découverte pendant trois semaines,
-- puis un vrai coach l'invite (migration 20260805091000: le lien maison est
-- clos, le nouveau lien est créé). À la seconde où ce lien passe 'active',
-- `coached_student_ids()` le fait entrer dans les vues du coach — avec, en
-- l'état, TOUT son passé: chaque repas photographié, chaque tap du soir, chaque
-- semaine vécue sous un autre programme.
--
-- Ce n'est pas un cas exotique du chantier « inscription libre ». C'est ce qui
-- se passe DÉJÀ quand un élève change de coach humain après un
-- `revoke_coach_access()`: le nouveau coach héritait de l'historique du
-- précédent. Le chantier libre l'a seulement rendu systématique.
--
-- Et c'est une promesse tenue de travers. La page /join dit à l'élève ce que son
-- coach voit, et le fait en énumérant des COLONNES. Aucune ligne de ce registre
-- ne dit à qui appartient le passé — parce que la question ne se posait pas
-- quand un élève n'avait jamais qu'un coach.
--
-- LA RÈGLE, ET ELLE EST UNIFORME
-- ------------------------------
-- Un coach lit l'activité de son élève DEPUIS `coach_clients.started_at` du lien
-- vivant qui les relie. Ce n'est pas une exception pour le cas maison: pour un
-- élève invité par son unique coach, ce plancher EST le début de la relation, et
-- la vue ne change pas d'une ligne. Une règle uniforme plutôt qu'un cas
-- particulier — un cas particulier « si l'ancien coach était la maison » se
-- serait propagé dans les six surfaces que §3 de la mission énumère.
--
-- Une reprise de lien (même coach, après pause) conserve `started_at`
-- (`coalesce(started_at, now())` dans le moteur), donc un coach ne perd pas
-- l'historique qu'il a réellement encadré.
--
-- ── CE QUI N'EST DÉLIBÉRÉMENT PAS PLANCHONNÉ, ET POURQUOI ────────────────
-- Le plancher s'applique à ce qui S'EST PASSÉ. Il ne s'applique PAS à ce qui
-- EST — et la distinction n'est pas stylistique, elle a un coût de sécurité:
--
--   · `student_safety_constraints` — les allergies et contre-indications d'un
--     élève. Un nouveau coach doit les voir dès le premier jour, quelle que soit
--     la date où elles ont été saisies. Un plancher ici serait un verrou de
--     sécurité désarmé par une date, c'est-à-dire le pire défaut de ce dépôt.
--   · `student_goals`, `profiles` (coach_student_directory) — l'objectif et
--     l'identité de la personne qu'il coache MAINTENANT.
--   · `plan_versions` / `plan_commitments` — le plan EN VIGUEUR. Un coach qui ne
--     peut pas lire le plan qu'il doit modifier ne peut pas travailler.
--   · `student_cards` — les cartes armées, qui sont un état courant.
--
-- Ces quatre-là restent sur `coached_student_ids()` seul. Le plancher ne touche
-- que les trois vues d'ACTIVITÉ PASSÉE: repas (`coach_student_events`), contact
-- (`coach_student_contact`), taps du soir (`coach_student_pulse`).
-- ============================================================================

create or replace function public.coach_student_history_floor(p_student uuid)
returns timestamptz
language sql
stable
security definer
set search_path to ''
as $function$
  -- `-infinity` quand il n'y a pas de plancher connaissable, et c'est le bon
  -- défaut: les liens créés avant W10 peuvent porter `started_at` NULL, et un
  -- plancher inventé (now(), par exemple) CACHERAIT à un coach en exercice
  -- l'historique de ses propres élèves. Une donnée manquante ne doit jamais
  -- retirer un accès légitime — elle ne doit pas non plus en créer un, et c'est
  -- pourquoi `coached_student_ids()` reste la garde d'appartenance: ce plancher
  -- ne borne que la FENÊTRE, il n'autorise personne.
  select coalesce(min(cc.started_at), '-infinity'::timestamptz)
  from public.coach_clients cc
  join public.coaches c on c.id = cc.coach_id
  where c.user_id = (select auth.uid())
    and c.status = 'active'
    and cc.status = 'active'
    and cc.student_user_id = p_student;
$function$;

comment on function public.coach_student_history_floor(uuid) is
  'Depuis quand le coach appelant a-t-il le droit de lire l''activité de cet '
  'élève ? = started_at du lien vivant. Borne les vues d''activité PASSÉE '
  '(repas, contact, taps) pour qu''un coach qui reprend un élève — d''un autre '
  'coach ou du coach maison — ne lise pas des semaines qu''il n''a pas '
  'encadrées. Ne borne PAS la sécurité, l''objectif, ni le plan en vigueur.';

revoke all on function public.coach_student_history_floor(uuid) from public, anon;
grant execute on function public.coach_student_history_floor(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Les trois vues d'activité. `security_invoker` et les GRANT sont conservés à
-- l'identique: `create or replace view` ne les touche pas, mais A13 a montré
-- qu'un `drop`/`create` les perd en silence (revoke from public laisse anon).
-- On ne DROP donc rien ici.
-- ---------------------------------------------------------------------------

create or replace view public.coach_student_events as
  select
    id, user_id, occurred_at, local_date, slot_key, source,
    recognized, recognition_confidence, quantity, unit,
    substance_ref, food_group_ref, content_locale, evidence_weight,
    media_path is not null as has_media,
    created_at, portion_band
  from public.protocol_events e
  where user_id = any (((select public.coached_student_ids()))::uuid[])
    and disqualified_reason is null
    and occurred_at >= public.coach_student_history_floor(user_id);

create or replace view public.coach_student_contact as
  select
    user_id as student_user_id,
    max(created_at) filter (where role = 'user'::public.chat_role) as last_inbound_at,
    count(*) filter (
      where role = 'user'::public.chat_role
        and created_at >= (now() - '7 days'::interval)
    ) as inbound_count_7d
  from public.chat_messages m
  where user_id = any (((select public.coached_student_ids()))::uuid[])
    and created_at >= public.coach_student_history_floor(user_id)
  group by user_id;

create or replace view public.coach_student_pulse as
  with scoped as (
    select
      c.user_id,
      date_trunc('week', c.local_date::timestamptz)::date as week_start,
      c.overall,
      c.axis
    from public.student_daily_checkins c
    where c.user_id = any (((select public.coached_student_ids()))::uuid[])
      -- `student_daily_checkins` n'a pas d'`occurred_at`: son fait est une
      -- DATE LOCALE. Le plancher est un timestamptz, donc la comparaison se
      -- fait sur le jour — et elle est inclusive du jour d'arrivée, qui est le
      -- premier jour que le coach a encadré.
      and c.local_date >= (public.coach_student_history_floor(c.user_id) at time zone 'utc')::date
  ), dominant as (
    select distinct on (scoped.user_id, scoped.week_start)
      scoped.user_id, scoped.week_start, scoped.axis
    from scoped
    where scoped.axis is not null
    group by scoped.user_id, scoped.week_start, scoped.axis
    order by scoped.user_id, scoped.week_start, (count(*)) desc, scoped.axis
  )
  select
    s.user_id as student_user_id,
    s.week_start,
    count(*) filter (where s.overall = 'good') as days_good,
    count(*) filter (where s.overall = 'mixed') as days_mixed,
    count(*) filter (where s.overall = 'hard') as days_hard,
    d.axis as dominant_axis
  from scoped s
  left join dominant d on d.user_id = s.user_id and d.week_start = s.week_start
  group by s.user_id, s.week_start, d.axis;
