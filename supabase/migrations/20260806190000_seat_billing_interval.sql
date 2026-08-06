-- ============================================================================
-- L'INTERVALLE DE FACTURATION D'UN SIÈGE — mensuel ou annuel, siège par siège
-- ============================================================================
-- Le contrat n'a qu'un poste (le siège, migration 20260806170000) et un prix:
-- 7 €/mois. On ouvre un second tarif, 6 €/mois payé d'avance pour l'année.
--
-- ── POURQUOI SIÈGE PAR SIÈGE ET PAS COACH PAR COACH ──────────────────────
-- Parce qu'une cohorte réelle est MIXTE. Le coach revend l'accès à ses élèves:
-- certains lui prennent le mois, d'autres l'année. Un intervalle porté par le
-- COACH l'obligerait à choisir pour tout le monde, donc à renoncer à l'annuel
-- dès qu'un seul élève paie au mois.
--
-- ── CE QUE ÇA CHANGE, ET CE QUE ÇA NE CHANGE PAS ─────────────────────────
-- Ça ne change RIEN à la définition du siège facturable: c'est toujours le lien
-- actif. `is_active_seat` ne bouge pas. Ce qui s'ajoute est UNIQUEMENT sur quel
-- article Stripe ce siège est compté.
--
-- ── LE DÉFAUT PAR DÉFAUT EST LE MENSUEL, ET C'EST LE BON SENS ────────────
-- Un siège dont personne n'a rien dit est mensuel. C'est le tarif le PLUS CHER
-- et le moins engageant: l'oubli coûte au coach un peu d'argent et aucune
-- liberté. Le défaut inverse — annuel par omission — engagerait douze mois
-- quelqu'un qui n'a rien demandé, et c'est le genre de défaut qu'on découvre
-- sur une facture.
-- ============================================================================

alter table public.coach_clients
  add column if not exists billing_interval text not null default 'month';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.coach_clients'::regclass
       and conname = 'coach_clients_billing_interval_check'
  ) then
    alter table public.coach_clients
      add constraint coach_clients_billing_interval_check
      check (billing_interval in ('month', 'year'));
  end if;
end;
$$;

comment on column public.coach_clients.billing_interval is
  'Sur quel article Stripe ce siège est compté: ''month'' (7 €/mois) ou '
  '''year'' (6 €/mois prépayé). N''entre PAS dans is_active_seat — un siège est '
  'facturable parce que le lien est actif, cet axe dit seulement à quel tarif. '
  'Défaut ''month'': le plus cher et le moins engageant, donc l''oubli est sûr.';

-- ---------------------------------------------------------------------------
-- Le registre le remonte
-- ---------------------------------------------------------------------------
--
-- `keel_coach_seat_ledger` reste la définition UNIQUE du siège facturable. On
-- lui ajoute une colonne pour que `stripe-reconcile-seats` puisse pousser DEUX
-- quantités sans faire une seconde lecture — deux lectures auraient pu
-- diverger sur le même mois.

drop function if exists public.keel_coach_seat_ledger(uuid, date);

create or replace function public.keel_coach_seat_ledger(
  p_coach_id uuid,
  p_month date default null
)
returns table (
  coach_client_id uuid,
  student_user_id uuid,
  seat_state text,
  link_status text,
  interaction_count integer,
  is_active_seat boolean,
  billing_interval text
)
language sql
stable
security definer
set search_path = ''
as $function$
  with bounds as (
    select
      date_trunc('month', coalesce(p_month, (now() at time zone 'utc')::date))::timestamptz as m_from,
      (date_trunc('month', coalesce(p_month, (now() at time zone 'utc')::date)) + interval '1 month')::timestamptz as m_to
  ),
  coach as (
    select c.coach_kind from public.coaches c where c.id = p_coach_id
  )
  select
    cc.id,
    cc.student_user_id,
    cc.seat_state,
    cc.status,
    coalesce(
      public.keel_student_interaction_count(cc.student_user_id, b.m_from, b.m_to),
      0
    )::integer,
    (
      (select coach.coach_kind from coach) is distinct from 'house'
      and cc.status = 'active'
      and cc.student_user_id is not null
    ),
    cc.billing_interval
  from public.coach_clients cc
  cross join bounds b
  where cc.coach_id = p_coach_id
    and cc.status in ('invited','active','paused');
$function$;

comment on function public.keel_coach_seat_ledger(uuid, date) is
  'Registre des sièges d''un coach pour un mois. is_active_seat est la '
  'définition UNIQUE de « siège facturable »: le lien ACTIF, sans condition '
  'd''activité. billing_interval dit à quel tarif il est compté. Toujours faux '
  'pour un coach maison. interaction_count reste renseigné: seule la '
  'facturabilité s''en détache.';

revoke all on function public.keel_coach_seat_ledger(uuid, date) from public;
revoke all on function public.keel_coach_seat_ledger(uuid, date) from anon;
grant execute on function public.keel_coach_seat_ledger(uuid, date) to service_role;

-- ---------------------------------------------------------------------------
-- Le coach change l'intervalle d'un siège
-- ---------------------------------------------------------------------------
--
-- Même porte étroite que la pause (20260806160000): `coach_clients` n'a aucune
-- policy d'écriture, et pour la même raison — une policy RLS ne restreint pas
-- les colonnes, donc ouvrir `billing_interval` ouvrirait `consent_granted_at`
-- et `seat_state`.
--
-- ⚠️ CE CHANGEMENT NE REMBOURSE RIEN ET NE FACTURE RIEN IMMÉDIATEMENT. Il dit
-- sur quel article le siège sera compté À LA PROCHAINE RÉCONCILIATION.
-- `stripe-reconcile-seats` tourne en `proration_behavior=none`: un siège qui
-- passe au mensuel en cours d'année ne rend pas les mois prépayés, et un siège
-- qui passe à l'annuel ne facture pas douze mois d'un coup. C'est le coach qui
-- décide de son offre; nous ne faisons que compter.
create or replace function public.keel_coach_set_seat_interval(
  p_student_user_id uuid,
  p_interval text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_coach_id uuid;
  v_link_id uuid;
  v_interval text := lower(btrim(coalesce(p_interval, '')));
begin
  if v_interval not in ('month', 'year') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_interval');
  end if;

  select c.id into v_coach_id
  from public.coaches c
  where c.user_id = (select auth.uid())
    and c.status = 'active';

  if v_coach_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_coach');
  end if;

  update public.coach_clients
     set billing_interval = v_interval,
         updated_at = now()
   where coach_id = v_coach_id
     and student_user_id = p_student_user_id
     and status = 'active'
  returning id into v_link_id;

  if v_link_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_active_link');
  end if;

  return jsonb_build_object('ok', true, 'reason', 'updated', 'billing_interval', v_interval);
end;
$function$;

revoke all on function public.keel_coach_set_seat_interval(uuid, text) from public;
revoke all on function public.keel_coach_set_seat_interval(uuid, text) from anon;
grant execute on function public.keel_coach_set_seat_interval(uuid, text) to authenticated;
