-- ============================================================================
-- LE SIÈGE FACTURABLE, C'EST L'ABONNEMENT — plus l'activité
-- ============================================================================
-- `keel_coach_seat_ledger` exigeait `>= keel_active_student_threshold()`
-- (3 interactions dans le mois) pour qu'un siège soit facturable. On retire
-- cette condition: le siège facturable devient `cc.status = 'active'`, c'est-
-- à-dire l'élève rattaché au coach.
--
-- ── POURQUOI CETTE CONDITION EXISTAIT, ET POURQUOI ELLE NE TIENT PLUS ─────
-- Elle a été écrite quand le coach ABSORBAIT le coût. « Tu ne paies que ceux
-- qui s'en servent » lui retirait alors un vrai risque, et c'était juste.
--
-- Le modèle a changé: le coach REVEND l'accès à ses élèves. Il encaisse que
-- l'élève se connecte ou non, donc la condition ne le protège plus de rien —
-- elle fait cadeau d'un siège qui ne coûte presque rien à servir (un élève
-- silencieux ne consomme ni tour de conversation ni analyse photo).
--
-- ── ET ELLE PAYAIT L'INVERSE DE CE QU'IL FALLAIT ─────────────────────────
-- `_shared/keel/reengagement.ts` dit de lui-même: « c'est la boucle qui sauve
-- le jour 9 — celle pour laquelle le coach paie ». Elle se déclenche à 72h de
-- silence. Or un élève silencieux depuis 72h est, par construction, en train de
-- tomber sous le seuil des 3 interactions. La fonctionnalité la plus chère du
-- produit servait donc exactement les élèves qui cessaient d'être facturés:
-- plus elle travaillait, moins elle était payée.
--
-- ── CE QUI NE CHANGE PAS ─────────────────────────────────────────────────
--   * `interaction_count` reste RENSEIGNÉ. On veut toujours savoir qui utilise
--     le produit — c'est le caractère FACTURABLE qui se détache de l'activité,
--     pas la mesure qui disparaît.
--   * `keel_active_student_threshold()` SURVIT. Elle reste juste, elle n'est
--     simplement plus le critère de facturation. `_shared/billing-tier.ts` en
--     tient un miroir dont `billing-tier_test.ts` vérifie l'accord en lisant la
--     migration 20260727235000: la supprimer casserait ce test pour rien.
--   * UN SIÈGE MAISON N'EST JAMAIS FACTURABLE. Cette règle-là est intacte, et
--     elle reste ici, dans la définition unique.
--   * Les statuts lus (`invited`, `active`, `paused`) ne bougent pas: c'est
--     `status='active'` seul qui porte désormais la facturabilité, et
--     `keel_coach_schedule_client_end` (20260806160000) est ce qui permet au
--     coach de rendre un siège quand son élève arrête de le payer. Les deux
--     changements ne valent QUE l'un avec l'autre: sans le bouton de pause,
--     facturer l'abonné condamnerait le coach à payer un élève parti.
-- ============================================================================

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
  is_active_seat boolean
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
    -- TOUJOURS COMPTÉ, même s'il ne décide plus de la facture: la page de
    -- facturation du coach affiche cette colonne, et « cet élève est rattaché
    -- mais n'a rien fait ce mois-ci » est une information qu'il doit garder.
    coalesce(
      public.keel_student_interaction_count(cc.student_user_id, b.m_from, b.m_to),
      0
    )::integer,
    (
      -- Un siège maison n'est jamais facturable (20260805090000). Inchangé.
      (select coach.coach_kind from coach) is distinct from 'house'
      and cc.status = 'active'
      and cc.student_user_id is not null
    )
  from public.coach_clients cc
  cross join bounds b
  where cc.coach_id = p_coach_id
    and cc.status in ('invited','active','paused');
$function$;

comment on function public.keel_coach_seat_ledger(uuid, date) is
  'Registre des sièges d''un coach pour un mois. is_active_seat est la '
  'définition UNIQUE de « siège facturable »: le lien ACTIF, sans condition '
  'd''activité — le coach revend l''accès et encaisse que l''élève se connecte '
  'ou non. Toujours faux pour un coach maison. interaction_count reste '
  'renseigné: seule la facturabilité s''en détache.';
