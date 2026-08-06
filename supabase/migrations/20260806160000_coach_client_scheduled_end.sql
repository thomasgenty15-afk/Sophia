-- ============================================================================
-- LA DÉSACTIVATION D'UN SIÈGE PAR LE COACH — programmée, jamais immédiate
-- ============================================================================
-- Le coach vend l'accès à ses élèves et nous paie par siège. Quand un élève
-- arrête de le payer, LUI, il faut qu'il puisse rendre le siège. Aujourd'hui il
-- ne le peut pas: `coach_clients` porte l'état `'paused'` et l'écran le sait
-- l'AFFICHER, mais rien ne sait le POSER.
--
-- Ça ne se voyait pas tant qu'un siège n'était facturé qu'au-delà de 3
-- interactions dans le mois: l'élève qui part cesse d'interagir, donc cesse
-- d'être facturé, et le trou se refermait tout seul. Le jour où la facturation
-- suit l'ABONNEMENT et non l'activité, ce filet disparaît — et le coach se
-- retrouve à payer indéfiniment quelqu'un qui l'a quitté.
--
-- ── POURQUOI UNE RPC ET PAS UNE POLICY D'ÉCRITURE ────────────────────────
-- `coach_clients` n'a DÉLIBÉRÉMENT aucune policy d'écriture (20260727120000:
-- « a client-side PATCH on a billing-bearing row is not a consent mechanism »).
-- La raison n'a pas bougé et elle est structurelle: une policy RLS ne restreint
-- pas les COLONNES. Ouvrir l'UPDATE pour `status` ouvrirait du même geste
-- `consent_granted_at` (le consentement de l'élève) et `seat_state` (l'axe de
-- facturation). Trois RPC à porte étroite coûtent moins que cette porte-là.
--
-- ── POURQUOI PROGRAMMÉ ET PAS IMMÉDIAT ───────────────────────────────────
-- L'élève a payé son mois À SON COACH. Couper l'accès le jour où le coach
-- clique ferme un service déjà payé, et c'est le COACH qui reçoit le reproche
-- — pas nous. On programme donc la bascule à la frontière du mois.
--
-- ET CETTE FRONTIÈRE N'EST PAS UN CHOIX ESTHÉTIQUE: c'est EXACTEMENT celle que
-- `keel_coach_seat_ledger` utilise pour compter un mois de facturation
-- (`date_trunc('month', now() at time zone 'utc')`). Le siège est donc facturé
-- pour le mois entier pendant lequel il a été résilié, puis disparaît au
-- premier instant de la fenêtre suivante. Aucun prorata, aucun décalage d'un
-- jour entre ce que la page de facturation montre et ce que Stripe voit.
--
-- ── CE QUE LA BASCULE DÉCLENCHE, ET CE QU'ELLE NE DÉCLENCHE PAS ──────────
-- MESURÉ sur la base locale, pas supposé — la première rédaction de cet en-tête
-- affirmait « l'élève perd l'accès » et c'était faux.
--
-- CE QUI SE PRODUIT VRAIMENT:
--   * `on_coach_clients_change_recompute_access` (trigger `after insert or
--     update or delete`) recalcule `access_tier`: 'student' → 'none'. Le tier
--     'student' est INHÉRITÉ du lien vivant, il tombe avec lui;
--   * `stripe-reconcile-seats` suit au cycle suivant: `keel_coach_seat_ledger`
--     ne compte que `status = 'active'`;
--   * `generate-week-plan-v1` répond 409 `no_coach`, et les chargeurs de
--     doctrine et de note ne résolvent plus aucun coach vivant.
--
-- CE QUI NE SE PRODUIT PAS:
--   * les écrans `/app/*` restent ATTEIGNABLES. `KeelStudentRoute` garde sur
--     `profiles.keel_role = 'student'`, que cette bascule ne touche pas — et
--     c'est délibéré côté route (« RLS reste la vraie frontière »). L'élève
--     peut donc rouvrir son historique; il ne peut plus rien composer de neuf.
--     C'est le comportement voulu pour une PAUSE: on coupe le service, on ne
--     confisque pas ce qui a été vécu.
--
-- RÉSIDU CONNU, mesuré: un élève mis en pause pendant ses ~15 premiers jours
-- retombe sur `access_tier = 'trial'` et non `'none'`, parce que l'essai du
-- produit grand public survit au siège KEEL. Ça n'ouvre aucune surface KEEL
-- (elles ne lisent pas ce tier), et ça se résorbe seul à l'expiration. Noté ici
-- pour que la prochaine lecture ne le prenne pas pour un bug neuf.
--
-- ── CE QU'ON NE TOUCHE PAS ───────────────────────────────────────────────
-- La ligne SURVIT (`'paused'`, pas `'ended'`, pas de DELETE): l'historique de
-- facturation reste lisible et l'élève retrouve ses données s'il revient. Et
-- `ended_at` reste NULL — une pause n'est pas une fin, et l'écrire mentirait à
-- toute lecture future qui date la rupture du lien.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. La colonne
-- ---------------------------------------------------------------------------

alter table public.coach_clients
  add column if not exists scheduled_end_at timestamptz;

comment on column public.coach_clients.scheduled_end_at is
  'Instant à partir duquel ce siège doit passer en ''paused'' (frontière de '
  'mois UTC, celle de keel_coach_seat_ledger). NULL = aucune désactivation '
  'programmée. Posé par keel_coach_schedule_client_end, effacé par '
  'keel_coach_cancel_client_end, consommé par keel_apply_scheduled_client_ends.';

-- Un index PARTIEL, parce que le balayeur ne lit que les lignes programmées et
-- qu'elles sont une minorité permanente de la table.
create index if not exists coach_clients_scheduled_end_idx
  on public.coach_clients (scheduled_end_at)
  where scheduled_end_at is not null;

-- ---------------------------------------------------------------------------
-- 2. La frontière de mois — UNE seule définition
-- ---------------------------------------------------------------------------
--
-- Elle est dupliquée nulle part: la RPC et le balayeur l'appellent tous les
-- deux. Deux expressions `date_trunc` recopiées à la main auraient divergé le
-- premier jour où l'une aurait gagné un `+ interval '1 day'`.
create or replace function public.keel_billing_month_boundary(
  p_at timestamptz default now()
)
returns timestamptz
language sql
immutable
set search_path to ''
as $function$
  select (
    date_trunc('month', (p_at at time zone 'utc')::date)
      + interval '1 month'
  )::timestamptz;
$function$;

comment on function public.keel_billing_month_boundary(timestamptz) is
  'Premier instant du mois de facturation SUIVANT. Même borne que celle de '
  'keel_coach_seat_ledger: un siège désactivé est facturé pour le mois entier '
  'puis sort exactement au changement de fenêtre.';

-- ---------------------------------------------------------------------------
-- 3. Programmer la désactivation
-- ---------------------------------------------------------------------------
--
-- IDEMPOTENTE PAR CONSTRUCTION: rappeler la fonction sur un siège déjà
-- programmé renvoie la même date sans rien réécrire. Un double-clic sur le
-- bouton ne doit pas pouvoir produire deux dates différentes.
--
-- ⚠️ `auth.uid()` EST NULL SOUS service_role. Cette RPC est faite pour être
-- appelée avec le JWT DU COACH depuis le navigateur, et elle refuse
-- proprement (`not_a_coach`) sinon. Un job serveur qui voudrait le même effet
-- doit écrire la colonne directement, pas passer par ici.
create or replace function public.keel_coach_schedule_client_end(
  p_student_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_coach_id uuid;
  v_link_id uuid;
  v_scheduled timestamptz;
  v_effective timestamptz;
begin
  select c.id into v_coach_id
  from public.coaches c
  where c.user_id = (select auth.uid())
    and c.status = 'active';

  if v_coach_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_coach');
  end if;

  -- FOR UPDATE: la ligne de lien est le mutex de l'opération, exactement comme
  -- l'invitation l'est dans `accept_coach_invitation_for_user`.
  select cc.id, cc.scheduled_end_at into v_link_id, v_scheduled
  from public.coach_clients cc
  where cc.coach_id = v_coach_id
    and cc.student_user_id = p_student_user_id
    and cc.status = 'active'
  for update;

  if v_link_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_active_link');
  end if;

  if v_scheduled is not null then
    return jsonb_build_object(
      'ok', true, 'reason', 'already_scheduled', 'effective_at', v_scheduled
    );
  end if;

  v_effective := public.keel_billing_month_boundary();

  update public.coach_clients
     set scheduled_end_at = v_effective,
         updated_at = now()
   where id = v_link_id;

  return jsonb_build_object('ok', true, 'reason', 'scheduled', 'effective_at', v_effective);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Annuler une désactivation programmée
-- ---------------------------------------------------------------------------
--
-- Le chemin du repentir, tant que la bascule n'a pas eu lieu. Il ne touche que
-- `scheduled_end_at`: un siège dont on annule la désactivation n'a jamais
-- quitté `'active'`, il n'y a donc rien à restaurer.
create or replace function public.keel_coach_cancel_client_end(
  p_student_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_coach_id uuid;
  v_link_id uuid;
begin
  select c.id into v_coach_id
  from public.coaches c
  where c.user_id = (select auth.uid())
    and c.status = 'active';

  if v_coach_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_coach');
  end if;

  update public.coach_clients
     set scheduled_end_at = null,
         updated_at = now()
   where coach_id = v_coach_id
     and student_user_id = p_student_user_id
     and status = 'active'
     and scheduled_end_at is not null
  returning id into v_link_id;

  if v_link_id is null then
    return jsonb_build_object('ok', false, 'reason', 'nothing_scheduled');
  end if;

  return jsonb_build_object('ok', true, 'reason', 'cancelled');
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Réactiver un siège déjà basculé
-- ---------------------------------------------------------------------------
--
-- ⚠️ PEUT ÉCHOUER, ET C'EST LE COMPORTEMENT VOULU. `one_live_coach_per_student`
-- est un index unique partiel sur `status in ('invited','active')`: si l'élève
-- a rejoint un AUTRE coach pendant la pause, le repasser en `'active'` viole
-- l'index. Le commentaire de 20260727120000 l'annonce déjà mot pour mot
-- (« Resuming a paused link server-side while another coach is live now fails
-- loudly on this same index, which is the correct outcome »). On attrape la
-- violation pour rendre un motif lisible plutôt qu'une 500 — on ne la contourne
-- pas.
--
-- La CHECK `coach_clients_active_requires_consent` est satisfaite d'office: un
-- lien qui a été `'active'` porte déjà son `consent_granted_at`, et rien ici ne
-- l'efface.
create or replace function public.keel_coach_reactivate_client(
  p_student_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_coach_id uuid;
  v_link_id uuid;
begin
  select c.id into v_coach_id
  from public.coaches c
  where c.user_id = (select auth.uid())
    and c.status = 'active';

  if v_coach_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_coach');
  end if;

  begin
    update public.coach_clients
       set status = 'active',
           scheduled_end_at = null,
           updated_at = now()
     where coach_id = v_coach_id
       and student_user_id = p_student_user_id
       and status = 'paused'
    returning id into v_link_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'already_coached');
  end;

  if v_link_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_paused_link');
  end if;

  return jsonb_build_object('ok', true, 'reason', 'reactivated');
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Le balayeur
-- ---------------------------------------------------------------------------
--
-- `scheduled_end_at` est REMIS À NULL en même temps que la bascule, et c'est ce
-- qui rend le job rejouable: une ligne traitée ne ressort jamais du filtre.
-- Deux ticks concurrents ne peuvent pas la basculer deux fois — le `where` ne
-- la voit plus.
--
-- `p_limit` borne un tick, sur le patron de `recompute_time_based_access_tiers`:
-- un balayage non borné sur une table qui grossit est un incident qui attend
-- son jour.
create or replace function public.keel_apply_scheduled_client_ends(
  p_limit integer default 5000
)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_count integer;
begin
  with due as (
    select cc.id
    from public.coach_clients cc
    where cc.scheduled_end_at is not null
      and cc.scheduled_end_at <= now()
      and cc.status = 'active'
    order by cc.scheduled_end_at
    limit greatest(1, coalesce(p_limit, 5000))
    for update skip locked
  )
  update public.coach_clients cc
     set status = 'paused',
         scheduled_end_at = null,
         updated_at = now()
    from due
   where cc.id = due.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

comment on function public.keel_apply_scheduled_client_ends(integer) is
  'Bascule en ''paused'' les sièges dont la désactivation programmée est échue. '
  'Rejouable: efface scheduled_end_at en même temps. Le trigger '
  'on_coach_clients_change_recompute_access ferme l''accès de l''élève.';

-- ---------------------------------------------------------------------------
-- 7. Droits
-- ---------------------------------------------------------------------------
--
-- Les trois RPC du coach sont appelées depuis le navigateur: `authenticated`.
-- Elles se gardent elles-mêmes par `auth.uid()` → `coaches`, donc un
-- authentifié non-coach obtient `not_a_coach` et rien d'autre.
-- Le balayeur n'est appelé que par pg_cron: il ne sort pas de `service_role`.

revoke all on function public.keel_billing_month_boundary(timestamptz) from public;
revoke all on function public.keel_coach_schedule_client_end(uuid) from public;
revoke all on function public.keel_coach_cancel_client_end(uuid) from public;
revoke all on function public.keel_coach_reactivate_client(uuid) from public;
revoke all on function public.keel_apply_scheduled_client_ends(integer) from public;

revoke all on function public.keel_billing_month_boundary(timestamptz) from anon;
revoke all on function public.keel_coach_schedule_client_end(uuid) from anon;
revoke all on function public.keel_coach_cancel_client_end(uuid) from anon;
revoke all on function public.keel_coach_reactivate_client(uuid) from anon;
revoke all on function public.keel_apply_scheduled_client_ends(integer) from anon;

grant execute on function public.keel_billing_month_boundary(timestamptz) to authenticated;
grant execute on function public.keel_coach_schedule_client_end(uuid) to authenticated;
grant execute on function public.keel_coach_cancel_client_end(uuid) to authenticated;
grant execute on function public.keel_coach_reactivate_client(uuid) to authenticated;

grant execute on function public.keel_billing_month_boundary(timestamptz) to service_role;
grant execute on function public.keel_apply_scheduled_client_ends(integer) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Le cron
-- ---------------------------------------------------------------------------
--
-- SQL DIRECT, pas d'appel à une fonction edge: le travail est entièrement en
-- base, et le patron http_post de ce dépôt n'existe que pour ce qui a besoin
-- d'un runtime. Même forme que `recompute-time-based-access-tiers`.
--
-- HORAIRE et pas quotidien: la frontière est un premier-du-mois à 00:00 UTC, et
-- un job quotidien à 03:15 laisserait un siège résilié facturable — et surtout
-- son élève ACCESSIBLE — jusqu'à trois heures après la bascule. À :20 pour ne
-- pas tomber sur les minutes déjà prises (:00 provision, :10 pulse, :25
-- relance, :45 évaluation, :55 balayage).

create extension if not exists "pg_cron" with schema "extensions";

do $$
begin
  perform cron.unschedule(jobid) from cron.job
   where jobname = 'keel-apply-scheduled-client-ends';
exception when others then
  null;
end;
$$;

select cron.schedule(
  'keel-apply-scheduled-client-ends',
  '20 * * * *',
  $$select public.keel_apply_scheduled_client_ends();$$
);

-- Fail loud (R7) : « le job existe » est la vérification qui a déjà laissé
-- passer un cron muet dans ce dépôt. On assert qu'il est là ET actif.
do $$
declare j record;
begin
  select schedule, active into j from cron.job
   where jobname = 'keel-apply-scheduled-client-ends';
  if not found then
    raise exception 'cron keel-apply-scheduled-client-ends absent apres schedule';
  end if;
  if not j.active then
    raise exception 'cron keel-apply-scheduled-client-ends inactif';
  end if;
end;
$$;
