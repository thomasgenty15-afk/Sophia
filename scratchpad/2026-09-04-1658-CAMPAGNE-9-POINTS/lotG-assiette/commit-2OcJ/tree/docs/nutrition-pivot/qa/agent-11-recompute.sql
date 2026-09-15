-- ===========================================================================
-- QA AGENT 11 — chaque nombre du récit, recalculé À LA MAIN depuis les lignes
-- ===========================================================================
-- Le MUST du prompt: aucun chiffre de la synthèse n'est cru sur parole. Ce
-- fichier réimplémente les règles EN SQL (pas d'appel au TS) et compare au
-- narratif écrit par le job.
--
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
--     < docs/nutrition-pivot/qa/agent-11-recompute.sql
--
-- Fenêtre: 2026-07-27 .. 2026-08-02 ; horloge simulée: 2026-08-03T21:00:00Z.
-- ===========================================================================

\pset footer off

-- ---------------------------------------------------------------------------
-- 1) CONTACT — responsive / slipping (>=48h) / silent (>=120h)
--    Narratif ALPHA: "7 students this week: 6 in touch, 0 slipping, 1 silent."
--    Narratif CHARLIE: "4 students this week: 1 in touch, 2 slipping, 1 silent."
-- ---------------------------------------------------------------------------
\echo '=== 1) CONTACT recalculé (le dernier message role=user, jamais un outbound) ==='
select c.display_name as coach,
       p.full_name,
       round(extract(epoch from (timestamptz '2026-08-03 21:00:00+00' - m.last_in))/3600.0, 1) as hours,
       case
         when m.last_in is null then 'silent'
         when extract(epoch from (timestamptz '2026-08-03 21:00:00+00' - m.last_in))/3600.0 >= 120 then 'silent'
         when extract(epoch from (timestamptz '2026-08-03 21:00:00+00' - m.last_in))/3600.0 >= 48  then 'slipping'
         else 'responsive'
       end as recomputed_state
  from public.coach_clients cc
  join public.coaches c on c.id = cc.coach_id
  join public.profiles p on p.id = cc.student_user_id
  left join lateral (
    select max(x.created_at) as last_in from public.chat_messages x
     where x.user_id = cc.student_user_id and x.role = 'user') m on true
 where c.id in ('b1c0ac00-0000-4000-8000-00000000000a','b1c0ac00-0000-4000-8000-00000000000c')
   and cc.status = 'active'
 order by c.display_name, hours nulls last;

\echo '--- totaux par coach (à comparer au narratif) ---'
select c.display_name as coach,
       count(*) filter (where st = 'responsive') as responsive,
       count(*) filter (where st = 'slipping')   as slipping,
       count(*) filter (where st = 'silent')     as silent
  from (
    select cc.coach_id,
           case
             when m.last_in is null then 'silent'
             when extract(epoch from (timestamptz '2026-08-03 21:00:00+00' - m.last_in))/3600.0 >= 120 then 'silent'
             when extract(epoch from (timestamptz '2026-08-03 21:00:00+00' - m.last_in))/3600.0 >= 48  then 'slipping'
             else 'responsive'
           end as st
      from public.coach_clients cc
      left join lateral (
        select max(x.created_at) as last_in from public.chat_messages x
         where x.user_id = cc.student_user_id and x.role = 'user') m on true
     where cc.status = 'active') s
  join public.coaches c on c.id = s.coach_id
 where c.id in ('b1c0ac00-0000-4000-8000-00000000000a','b1c0ac00-0000-4000-8000-00000000000c',
                'b1c0ac00-0000-4000-8000-00000000000d')
 group by c.display_name order by c.display_name;

-- ---------------------------------------------------------------------------
-- 2) VIVABILITÉ — bande calculée SEULEMENT à partir de 3 taps
--    hard    si hard/taps >= 1/3
--    strained si (hard+mixed)/taps > 0.5
--    sinon sustainable ; < 3 taps => unknown
--    Narratif ALPHA: "How the week felt: 2 holding up, 1 having a hard time."
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 2) VIVABILITÉ recalculée (seuil 3 taps) ==='
with t as (
  select cc.student_user_id as uid, p.full_name,
         count(*) filter (where k.overall = 'good')  as good,
         count(*) filter (where k.overall = 'mixed') as mixed,
         count(*) filter (where k.overall = 'hard')  as hard,
         count(k.*) as taps
    from public.coach_clients cc
    join public.profiles p on p.id = cc.student_user_id
    left join public.student_daily_checkins k
      on k.user_id = cc.student_user_id
     and k.local_date between date '2026-07-27' and date '2026-08-02'
   where cc.coach_id = 'b1c0ac00-0000-4000-8000-00000000000a' and cc.status='active'
   group by cc.student_user_id, p.full_name)
select full_name, taps, good, mixed, hard,
       case when taps < 3 then 'unknown'
            when hard::numeric / taps >= 1.0/3.0 then 'hard'
            when (hard + mixed)::numeric / taps > 0.5 then 'strained'
            else 'sustainable' end as recomputed_band,
       (select k2.axis from public.student_daily_checkins k2
         where k2.user_id = t.uid and k2.axis is not null
           and k2.local_date between date '2026-07-27' and date '2026-08-02'
         group by k2.axis order by count(*) desc, k2.axis limit 1) as dominant_axis
  from t order by full_name;

-- ---------------------------------------------------------------------------
-- 3) PORTIONS — "48 plates seen: 17 small, 22 moderate, 7 large, 2 unclear."
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 3) PORTIONS recalculées (toutes les lignes portion_band de la cohorte) ==='
select count(*) as total,
       count(*) filter (where e.portion_band='small')    as small,
       count(*) filter (where e.portion_band='moderate') as moderate,
       count(*) filter (where e.portion_band='large')    as large,
       count(*) filter (where e.portion_band='unclear')  as unclear,
       count(*) filter (where e.portion_band in ('small','moderate','large')) as decidable
  from public.protocol_events e
  join public.coach_clients cc on cc.student_user_id = e.user_id and cc.status='active'
 where cc.coach_id = 'b1c0ac00-0000-4000-8000-00000000000a'
   and e.local_date between date '2026-07-27' and date '2026-08-02'
   and e.portion_band is not null;

-- ---------------------------------------------------------------------------
-- 4) COUVERTURE — jours loggés (>= 2 protocol_events/jour), gate à 4/7
--    C'est le chiffre qui rend FAUSSE la phrase du narratif:
--    "4 of 7 students have no published plan, and the others logged fewer
--     than 4 of 7 days."  -> Bilal Haddad a loggé 5 jours sur 7.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 4) COUVERTURE recalculée + les "others" de la phrase du narratif ==='
with logged as (
  select cc.student_user_id as uid, p.full_name,
         (select count(*) from (
            select e.local_date from public.protocol_events e
             where e.user_id = cc.student_user_id
               and e.local_date between date '2026-07-27' and date '2026-08-02'
             group by e.local_date having count(*) >= 2) d) as logged_days,
         exists (select 1 from public.commitment_evaluations ev
                  where ev.user_id = cc.student_user_id
                    and ev.local_date between date '2026-07-27' and date '2026-08-02') as has_evaluations
    from public.coach_clients cc
    join public.profiles p on p.id = cc.student_user_id
   where cc.coach_id = 'b1c0ac00-0000-4000-8000-00000000000a' and cc.status='active')
select full_name, logged_days, has_evaluations,
       (logged_days >= 4) as clears_gate,
       case when logged_days >= 4 and not has_evaluations then 'no_evaluable_plan (rien à mesurer)'
            else 'autre motif' end as truthful_reason
  from logged order by logged_days desc, full_name;

\echo '--- 4bis) le motif de CHAQUE élève, recalculé, et les "others" de la phrase ---'
-- AVANT le fix, le narratif comptait « sans plan » par le MOTIF de
-- signalement. `flagReason` porte une priorité (silence > semaine dure >
-- couverture), donc Bilal — 5 jours loggés, aucune ligne à mesurer — sortait
-- du compte et se retrouvait décrit comme « a loggé moins de 4 jours sur 7 ».
-- La colonne `verdict` marque ce contre-exemple.
with base as (
  select p.full_name, cc.student_user_id as uid,
    (select count(*) from (select e.local_date from public.protocol_events e
       where e.user_id=cc.student_user_id
         and e.local_date between date '2026-07-27' and date '2026-08-02'
       group by e.local_date having count(*)>=2) d) as logged_days,
    (select count(*) from public.student_daily_checkins k where k.user_id=cc.student_user_id
       and k.local_date between date '2026-07-27' and date '2026-08-02') as taps,
    (select count(*) from public.student_daily_checkins k where k.user_id=cc.student_user_id
       and k.overall='hard'
       and k.local_date between date '2026-07-27' and date '2026-08-02') as hard_taps,
    round(extract(epoch from (timestamptz '2026-08-03 21:00:00+00' -
      (select max(m.created_at) from public.chat_messages m
        where m.user_id=cc.student_user_id and m.role='user')))/3600.0,1) as hours
  from public.coach_clients cc join public.profiles p on p.id=cc.student_user_id
  where cc.coach_id='b1c0ac00-0000-4000-8000-00000000000a' and cc.status='active'),
scored as (
  select *, case
    when hours >= 120 then 'silent_5d'
    when taps >= 3 and hard_taps::numeric/taps >= 1.0/3.0 then 'week_too_hard'
    when logged_days < 4 then 'coverage_below_gate'
    else 'no_evaluable_plan' end as reason_recomputed
  from base)
select full_name, logged_days, taps, hard_taps, hours, reason_recomputed,
       case when reason_recomputed <> 'no_evaluable_plan' and logged_days >= 4
            then '<<< la phrase "the others logged fewer than 4 of 7" etait FAUSSE pour lui'
            else '' end as verdict
  from scored order by reason_recomputed, full_name;

-- ---------------------------------------------------------------------------
-- 5) ADHÉRENCE (coach LEGACY) — "Average adherence on core lines: 75%"
--    day_score = SUM(w x mean(score) x coverage) / SUM(w x coverage)
--    une seule ligne core (w=3, expected=1) => day_score = score du jour
--    semaine = moyenne des jours évaluables ; moyenne cohorte = (100+50)/2
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 5) ADHÉRENCE recalculée pour la cohorte LEGACY ==='
with per_day as (
  select ev.user_id, ev.local_date,
         avg(case ev.status when 'met' then 1.0 when 'flex_used' then 1.0
                            when 'partial' then 0.5 when 'missed' then 0.0 end) as day_score
    from public.commitment_evaluations ev
    join public.plan_commitments pc on pc.id = ev.commitment_id
   where ev.local_date between date '2026-07-27' and date '2026-08-02'
     and pc.counts_toward_adherence and pc.priority='core' and ev.grain <> 'week'
     and ev.status in ('met','flex_used','partial','missed')
   group by ev.user_id, ev.local_date)
-- Groupé par user_id (via l'email): les deux personas LEGACY partagent le même
-- `full_name`, et grouper par le nom fusionnait deux élèves en une ligne.
select u.email,
       count(*) as evaluable_days,
       round(avg(day_score) * 100) as recomputed_core_pct
  from per_day join auth.users u on u.id = per_day.user_id
 group by u.email order by u.email;

\echo '--- moyenne cohorte LEGACY (ce que le narratif appelle "Average adherence on core lines") ---'
with per_day as (
  select ev.user_id, ev.local_date,
         avg(case ev.status when 'met' then 1.0 when 'flex_used' then 1.0
                            when 'partial' then 0.5 when 'missed' then 0.0 end) as day_score
    from public.commitment_evaluations ev
    join public.plan_commitments pc on pc.id = ev.commitment_id
   where ev.local_date between date '2026-07-27' and date '2026-08-02'
     and pc.counts_toward_adherence and pc.priority='core' and ev.grain <> 'week'
     and ev.status in ('met','flex_used','partial','missed')
   group by ev.user_id, ev.local_date),
per_student as (select user_id, round(avg(day_score)*100) as pct from per_day group by user_id)
select round(avg(pct)) as recomputed_cohort_mean_pct, count(*) as students_with_a_number
  from per_student
 where user_id in (select student_user_id from public.coach_clients
                    where coach_id='b1c0ac00-0000-4000-8000-00000000000f' and status='active');

-- ---------------------------------------------------------------------------
-- 6) Ce que le job a écrit, en face
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 6) EN FACE: ce que le job a écrit ==='
select c.display_name, s.narrative
  from public.coach_syntheses s join public.coaches c on c.id = s.coach_id
 where c.id in ('b1c0ac00-0000-4000-8000-00000000000a','b1c0ac00-0000-4000-8000-00000000000c',
                'b1c0ac00-0000-4000-8000-00000000000f')
 order by c.display_name;
