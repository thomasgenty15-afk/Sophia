-- ============================================================================
-- LE FOYER — LE GEL À L'IMPAYÉ (chantier 3, décision D4)
--
-- Autorité: docs/keel/CHANTIER-FOYER-SUITE.md § « Chantier 3 » (D4, D4bis).
-- Amont: 20260811030000 (`free_until`, les deux jetons de palier, le job
--        mensuel) et 20260810260000 (le compte facturable).
--
-- ── LA DÉCISION, ET SON MOTIF — qui n'est PAS de la clémence ───────────────
--
-- Un foyer impayé est GELÉ, jamais effacé. Le graphe du foyer EST la douve:
-- huit bouches, leurs âges, leurs allergies, leurs objectifs, c'est ce qu'un
-- concurrent ne peut pas copier et ce qu'un utilisateur ne veut pas ressaisir.
-- Quelqu'un qui revient après trois mois et retrouve son foyer intact se
-- réabonne en un clic; celui qui doit retaper huit personnes ne revient pas.
-- Effacer à l'impayé, c'est détruire soi-même la seule chose qui fait revenir.
-- L'effacement réel reste au lifecycle RGPD, sur son propre calendrier.
--
-- ON GÈLE LA PRODUCTION, PAS LA CONSULTATION. Ce fichier ne retire AUCUNE
-- policy `for select`: le plan courant reste lisible, l'écran du foyer aussi,
-- le chat aussi. Deux portes se ferment, et elles sont nommées en §2/§3 du
-- chantier: la génération de repas de foyer, et la recommandation quotidienne.
--
-- ── CE QUE CE FICHIER LIVRE ────────────────────────────────────────────────
--
--   1. `keel_household_trial_days()` — le 30 de D4bis, ADRESSABLE, et un
--      DÉFAUT sur `households.free_until` pour que tout foyer NEUF naisse avec
--      une date. Sans écrivain, le prédicat ci-dessous ne mordrait jamais.
--   2. `keel_household_is_covered(uuid)` — LA DÉFINITION UNIQUE du dépôt.
--   3. Deux dérivations qui la CITENT (jamais qui la recopient): une pour le
--      serveur (`..._for_user`, service_role), une pour l'écran
--      (`keel_household_my_coverage()`, gatée sur `auth.uid()`).
--   4. L'ÉCRIVAIN DE `household_member` — la dette EXPRESSE du chantier 1,
--      qui attendait exactement le prédicat de (2). Voir §4.
--
-- ── CE QU'IL NE LIVRE PAS, DIT POUR QU'ON NE LE LISE PAS DEDANS ────────────
--
--   · AUCUN backfill de `free_until` sur les foyers EXISTANTS. C'est le geste
--     humain n°5 du chantier 1 (« le JOUR du branchement »), et le faire ici
--     daterait l'essai du jour d'APPLICATION de la migration — c'est-à-dire
--     brûlerait 30 jours d'essai dans un environnement où aucun prix Stripe
--     n'est encore posé, donc où personne ne PEUT payer. Conséquence exacte,
--     écrite en §2: un foyer à `free_until` NULL est COUVERT.
--   · AUCUN palier neuf pour le MAÎTRE en essai. `household` reste ce que
--     20260811030000 en a dit: un jeton VENDU, projeté depuis sa ligne
--     `subscriptions`. Un maître couvert par l'essai garde donc 'trial' ou
--     'none'. C'est nommé en §4, et c'est une QUESTION PRODUIT ouverte — pas
--     un oubli.
--   · AUCUNE fermeture du chat, du plan, ni de l'écran du foyer.
-- ============================================================================

begin;


-- ============================================================================
-- 1. L'ESSAI A UN ÉCRIVAIN — SANS QUOI LE GEL EST UNE GARDE DÉSARMÉE
-- ============================================================================
--
-- 20260811030000 a posé la COLONNE et laissé l'écriture au geste humain du
-- branchement. Pour les foyers EXISTANTS, c'est toujours vrai et ça le reste
-- (voir l'en-tête). Pour les foyers NEUFS, ça ne peut pas l'être: si personne
-- n'écrit jamais `free_until`, aucun foyer créé demain n'a de date, donc aucun
-- n'expire, donc le prédicat de §2 rend `true` pour tout le monde POUR
-- TOUJOURS. Ce serait un gel construit et jamais branché — le mode d'échec n°1
-- de ce dépôt.
--
-- POURQUOI UN DÉFAUT DE COLONNE ET PAS UNE LIGNE DANS `keel_household_create`.
-- Le défaut s'applique à TOUT chemin d'insertion, y compris ceux qu'on n'a pas
-- écrits (une fixture, un import, une RPC future). Une ligne dans la RPC
-- s'oublie au deuxième chemin, et l'oubli est invisible: le foyer marche, il
-- est simplement gratuit à vie.
--
-- ⚠️ 30 JOURS POUR UN FOYER NEUF EST UNE EXTRAPOLATION DE D4bis, ET ELLE EST
-- NOMMÉE. D4bis fixe 30 jours pour les foyers créés AVANT Stripe. Rien n'a été
-- décidé pour ceux d'après. Le choix fait ici est le moins surprenant (c'est
-- le patron de `coaches.trial_ends_at`, posé à la création par un trigger), et
-- il est RÉVERSIBLE d'une ligne: changer ce défaut ne réécrit aucune date déjà
-- promise, puisque la date vit SUR LA LIGNE.

create or replace function public.keel_household_trial_days()
returns integer
language sql
immutable
as $function$ select 30 $function$;

comment on function public.keel_household_trial_days() is
  'L''essai d''un foyer, en JOURS (D4bis). Doit valoir HOUSEHOLD_TRIAL_DAYS de '
  'supabase/functions/_shared/billing-tier.ts — une constante dupliquée entre '
  'deux runtimes dérive, et `_shared/keel/household_freeze_test.ts` lit les '
  'DEUX fichiers pour que ça ne se voie pas seulement en production. Cité par '
  'le défaut de households.free_until, jamais recopié.';

revoke all on function public.keel_household_trial_days() from public, anon;
grant execute on function public.keel_household_trial_days()
  to authenticated, service_role;

alter table public.households
  alter column free_until
  set default (current_date + public.keel_household_trial_days());

comment on column public.households.free_until is
  'D4bis — le dernier jour COUVERT par l''essai, INCLUS. Posé sur la ligne, '
  'jamais dérivé de created_at: une règle recalculée à la volée rend '
  'irreproductible ce qui a été promis à CE foyer. DEPUIS LE CHANTIER 3, tout '
  'foyer NEUF naît avec current_date + keel_household_trial_days(). NULL ne '
  'subsiste que sur les foyers créés AVANT, et vaut « aucun essai posé » — '
  'donc COUVERT (keel_household_is_covered), en attendant le geste humain de '
  'backfill. Lu par stripe-reconcile-households (ne pas facturer) ET par '
  'keel_household_is_covered (ne pas geler).';


-- ============================================================================
-- 2. « CE FOYER EST-IL COUVERT ? » — LA DÉFINITION UNIQUE
-- ============================================================================
--
-- UNE SEULE DÉFINITION, et c'est le piège n°1 de ce lot. Si la règle s'écrit
-- deux fois — une en SQL pour le cron, une en TypeScript pour le générateur —
-- elles divergeront au premier ajustement, et personne ne saura laquelle ment.
-- Le patron est `keel_coach_is_solvent` (20260727235000 §4), dont le
-- commentaire porte déjà la charge: la définition d'un fait facturable vit en
-- base, et les deux runtimes la LISENT.
--
-- ── LES TROIS BRANCHES, DANS L'ORDRE OÙ ELLES SE LISENT ───────────────────
--
--   a) `free_until IS NULL` — AUCUN ESSAI POSÉ ⇒ COUVERT.
--      C'est la branche héritée, et elle est nommée, datée et DÉSARMABLE,
--      exactement comme `c.coach_kind = 'house'` l'est chez le coach.
--      MOTIF: la colonne dit elle-même (20260811030000) que NULL n'est « PAS
--      essai expiré ». Un foyer qui existe aujourd'hui n'a pas de date parce
--      que personne n'a encore fait le geste — et il n'existe aujourd'hui
--      AUCUN prix Stripe, donc aucun moyen de payer. Geler sur NULL, ce serait
--      couper tous les foyers vivants le jour où on applique une migration, et
--      leur offrir en face un tunnel qui refuse. On préfère un gel qui mord
--      TARD à un gel qui mord un client qui ne peut pas payer.
--      CONDITION DE DÉSARMEMENT: le jour où le geste humain n°5 pose
--      `free_until` sur les foyers existants, plus aucune ligne n'est NULL (§1
--      s'en charge pour les neuves), et cette branche devient inatteignable.
--
--   b) `current_date <= free_until` — L'ESSAI COUVRE ENCORE.
--      DERNIER JOUR INCLUS, comme `householdTrialCovers` en TypeScript: un
--      foyer dont l'essai finit aujourd'hui n'est ni facturé ni gelé
--      aujourd'hui. Les deux runtimes doivent dire la même chose du même jour,
--      sinon on facture quelqu'un qu'on vient de geler.
--
--   c) L'ABONNEMENT DU MAÎTRE EST VIVANT.
--      Le foyer n'a pas d'identité Stripe: `subscriptions.user_id` est UNIQUE
--      et l'abonnement est celui du COMPTE MAÎTRE (20260811030000 §3).
--
-- ── CE QUI N'EST DÉLIBÉRÉMENT PAS LU: `subscriptions.tier` ────────────────
--
-- Même arbitrage que `keel_coach_is_solvent`, et le sien est écrit en toutes
-- lettres: « Solvency is "money is arriving", not "the label is right" —
-- mapping a price id must never be able to cut a paying coach's whole roster ».
-- Ici la conséquence d'une erreur de mapping serait pire qu'une facture fausse:
-- ce serait une COUPURE de service chez quelqu'un qui paie.
--
-- ⚠️ CONSÉQUENCE ASSUMÉE, ET C'EST UNE QUESTION PRODUIT OUVERTE: un maître qui
-- porte DÉJÀ un abonnement pour autre chose (un coach KEEL à 49 $/mois, un
-- palier grand public hérité) voit son foyer couvert sans payer les 12,99 €.
-- La population est aujourd'hui nulle ou négligeable; le jour où elle ne l'est
-- plus, la réponse est de lire `tier = 'household'` ICI, à un seul endroit, et
-- pas de dupliquer la règle chez les appelants.

create or replace function public.keel_household_is_covered(p_household uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.households h
    where h.id = p_household
      and (
        -- a) AUCUN ESSAI POSÉ. Branche héritée, désarmable — voir le pavé.
        h.free_until is null
        -- b) L'ESSAI COUVRE ENCORE. Dernier jour INCLUS.
        or current_date <= h.free_until
        -- c) LE MAÎTRE PAIE. `tier` n'est PAS lu: l'argent arrive, l'étiquette
        --    n'est pas la question.
        or exists (
          select 1
          from public.household_members hm
          join public.subscriptions s on s.user_id = hm.user_id
          where hm.household_id = h.id
            and hm.role = 'owner'
            and lower(coalesce(s.status, '')) in ('active', 'trialing')
            and (s.current_period_end is null or now() < s.current_period_end)
        )
      )
  );
$function$;

comment on function public.keel_household_is_covered(uuid) is
  'LA DÉFINITION UNIQUE du dépôt: ce foyer a-t-il le droit de PRODUIRE ? '
  'Couvert = aucun essai posé (héritage, branche désarmable) OU l''essai '
  'couvre encore (dernier jour inclus) OU l''abonnement du MAÎTRE est vivant. '
  'Ne lit PAS subscriptions.tier — même motif que keel_coach_is_solvent: une '
  'erreur de mapping de prix ne doit jamais couper un client qui paie. Un '
  'foyer inconnu rend false. GELÉ = le contraire de ceci, et le gel ne ferme '
  'que la PRODUCTION: aucune lecture n''en dépend.';

revoke all on function public.keel_household_is_covered(uuid)
  from public, anon, authenticated;
grant execute on function public.keel_household_is_covered(uuid) to service_role;


-- ============================================================================
-- 3. LES DEUX DÉRIVATIONS — ELLES CITENT §2, ELLES NE LA RECOPIENT PAS
-- ============================================================================
--
-- Deux appelants n'ont pas d'identifiant de foyer sous la main, ils ont un
-- COMPTE: le cron quotidien (qui pagine `profiles`) et l'écran. Leur faire
-- écrire eux-mêmes la jointure `household_members` → `households` mettrait
-- deux fois la question « quel foyer ? » dans le produit. Elles sont donc ici,
-- et les deux appellent §2 — il n'y a toujours qu'un seul endroit qui décide.
--
-- POURQUOI DEUX FONCTIONS ET PAS UNE À PARAMÈTRE OPTIONNEL. « Un paramètre de
-- garde optionnel est une garde désarmée »: une fonction
-- `..._for_user(p_user default null)` où NULL vaudrait `auth.uid()` serait
-- soit ouverte à `authenticated` avec un paramètre (donc lisible sur
-- n'importe qui), soit gatée sur `auth.uid()` (donc MORTE côté serveur, où
-- `auth.uid()` est NULL sous service_role). Deux portes, deux gardes, aucun
-- défaut à choisir.

-- ── 3a. LA PORTE DU SERVEUR ───────────────────────────────────────────────
--
-- ⚠️ `auth.uid()` EST NULL SOUS `service_role`. Le sujet est un PARAMÈTRE, et
-- la seule garde est le GRANT.
--
-- `frozen` est calculé ICI et pas chez l'appelant: sinon « gelé = dans un
-- foyer ET non couvert » serait écrit une fois dans le générateur et une fois
-- dans le cron, et la polarité est exactement le genre de détail qui
-- s'inverse. `in_household = false` ⇒ `frozen = false`: l'écrasante majorité
-- des comptes n'est dans aucun foyer, et un gel par défaut couperait tout le
-- produit.
create or replace function public.keel_household_coverage_for_user(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(
    (
      select jsonb_build_object(
        'in_household', true,
        'household_id', hm.household_id,
        'role', hm.role,
        'free_until', h.free_until,
        'covered', public.keel_household_is_covered(hm.household_id),
        'frozen', not public.keel_household_is_covered(hm.household_id)
      )
      from public.household_members hm
      join public.households h on h.id = hm.household_id
      where hm.user_id = p_user
      limit 1
    ),
    jsonb_build_object('in_household', false, 'frozen', false)
  );
$function$;

comment on function public.keel_household_coverage_for_user(uuid) is
  'Le foyer de CE COMPTE est-il gelé ? Dérivation de '
  'keel_household_is_covered, jamais une seconde règle. Rend '
  '{in_household, household_id, role, free_until, covered, frozen}. Hors '
  'foyer: {in_household:false, frozen:false} — la majorité des comptes, et un '
  'gel par défaut couperait tout le produit. Réservée au SERVEUR: elle prend '
  'son sujet en paramètre parce que auth.uid() est NULL sous service_role.';

revoke all on function public.keel_household_coverage_for_user(uuid)
  from public, anon, authenticated;
grant execute on function public.keel_household_coverage_for_user(uuid)
  to service_role;

-- ── 3b. LA PORTE DE L'ÉCRAN ───────────────────────────────────────────────
--
-- SANS PARAMÈTRE, et c'est la garde: ouverte à `authenticated` avec un
-- paramètre, elle dirait l'état de facturation de n'importe quel foyer à qui
-- devine un uuid. C'est la « seconde porte gardée par auth.uid() » que le
-- commentaire de `keel_household_billable_profiles` annonçait, écrite avec
-- l'écran qui en a besoin.
--
-- L'ÉCRAN EN A BESOIN POUR UNE RAISON PRÉCISE: `supabase.functions.invoke`
-- rend une erreur GÉNÉRIQUE sur un statut non-2xx (« non-2xx status code »),
-- pas le corps de la réponse. Un refus nommé côté serveur arriverait donc à
-- l'écran comme une panne — et « un refus muet se lit comme une panne » est
-- exactement ce que ce chantier existe pour éviter. L'écran demande donc son
-- état AVANT de proposer le geste, et le serveur refuse quand même (§ la
-- fonction edge): la ceinture et les bretelles, chacune à sa place.
create or replace function public.keel_household_my_coverage()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select public.keel_household_coverage_for_user((select auth.uid()));
$function$;

comment on function public.keel_household_my_coverage() is
  'Ce que l''ÉCRAN a le droit de savoir: mon foyer est-il en pause ? Sans '
  'paramètre — avec un, elle rendrait l''état de facturation de n''importe '
  'quel foyer à qui devine un uuid. Une seule règle derrière: '
  'keel_household_is_covered.';

revoke all on function public.keel_household_my_coverage() from public, anon;
grant execute on function public.keel_household_my_coverage()
  to authenticated, service_role;


-- ============================================================================
-- 4. LA DETTE DU CHANTIER 1 — L'ÉCRIVAIN DE `household_member`
-- ============================================================================
--
-- 20260811030000 §3 le dit mot pour mot: « 'household_member' N'A PAS
-- D'ÉCRIVAIN, et c'est nommé, pas caché. Le sien serait une branche « héritée »
-- dans `recompute_profile_access_tier`, calquée sur `has_inherited_seat`, dont
-- la condition est « le foyer du maître est COUVERT » — c'est-à-dire la
-- fonction de couverture du chantier 3 ». Elle existe (§2); la branche se
-- pose.
--
-- ── LA PRÉCÉDENCE, ET POURQUOI `student` RESTE AU-DESSUS ──────────────────
--
--   1. abonnement propre vivant   -> son palier ('coach', 'household', …)
--   2. SIÈGE HÉRITÉ d'un coach    -> 'student'
--   3. PLACE HÉRITÉE d'un foyer   -> 'household_member'      ← NEUF
--   4. essai personnel en cours   -> 'trial'
--   5. sinon                      -> 'none'
--
-- (2) AVANT (3), et ce n'est pas arbitraire: 'student' ouvre `/app/today`,
-- `/app/chat` et `/app/progress` — c'est-à-dire un produit ENTIER, avec un
-- coach et un plan. Mettre (3) devant DÉGRADERAIT un élève qui rejoint le
-- foyer de son conjoint: il perdrait le palier que son coach paie, le jour où
-- il réclame un profil. Une fonctionnalité qui en casse une autre en silence.
--
-- (3) AVANT (4) pour la raison déjà écrite pour (2): un droit hérité ne
-- s'éteint pas, un essai personnel si. Quelqu'un dont l'essai perso expire
-- pendant que le maître paie ne doit pas retomber sur 'none'.
--
-- ── LE MAÎTRE N'EST PAS ICI, ET C'EST UNE QUESTION OUVERTE ────────────────
--
-- `role <> 'owner'` est DANS la condition. 'household' reste ce que le
-- chantier 1 en a dit: un jeton VENDU, projeté depuis la ligne
-- `subscriptions`. Conséquence EXACTE, à lire et pas à découvrir: un maître
-- couvert par son ESSAI (donc sans abonnement) garde 'trial' puis 'none'
-- quand son essai perso expire — alors que ses profils réclamés, eux, portent
-- 'household_member'. Rien ne régresse (aucun chemin du foyer ne lit
-- `access_tier`), et rien n'est promis qui ne soit pas là. Décider que le
-- maître en essai porte 'household' est une DÉCISION PRODUIT: elle étendrait
-- un jeton « vendu » à un état non vendu, et elle ne se prend pas dans une
-- migration.
create or replace function public.recompute_profile_access_tier(uid uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t_end timestamptz;
  sub_status text;
  sub_end timestamptz;
  sub_tier text;
  sub_active boolean;
  has_inherited_seat boolean;
  has_household_place boolean;
  next_tier text;
begin
  if uid is null then
    return;
  end if;

  select p.trial_end into t_end
  from public.profiles p
  where p.id = uid;

  select s.status, s.current_period_end, s.tier
    into sub_status, sub_end, sub_tier
  from public.subscriptions s
  where s.user_id = uid;

  sub_active :=
    (lower(coalesce(sub_status,'')) in ('active','trialing'))
    and (sub_end is null or now() < sub_end);

  -- W10 · INHERITED ENTITLEMENT. The seat is 'active' AND the coach is solvent.
  -- `seat_state` is NOT read here: a comped or trial seat grants access exactly
  -- like a billed one. Billing decides what we charge, never what the student
  -- is allowed to execute.
  select exists (
    select 1
    from public.coach_clients cc
    where cc.student_user_id = uid
      and cc.status = 'active'
      and public.keel_coach_is_solvent(cc.coach_id)
  ) into has_inherited_seat;

  -- CHANTIER 3 · LA PLACE HÉRITÉE D'UN FOYER. Même forme que le siège
  -- au-dessus, et la condition est la DÉFINITION UNIQUE de §2 — pas une
  -- seconde lecture de `free_until` et de `subscriptions`.
  --
  -- `role <> 'owner'`: le maître n'hérite pas de lui-même (voir le pavé).
  select exists (
    select 1
    from public.household_members hm
    where hm.user_id = uid
      and hm.role <> 'owner'
      and public.keel_household_is_covered(hm.household_id)
  ) into has_household_place;

  if sub_active and sub_tier is not null
     and sub_tier in ('coach','household','system','alliance','architecte') then
    next_tier := sub_tier;
  elsif has_inherited_seat then
    next_tier := 'student';
  elsif has_household_place then
    next_tier := 'household_member';
  elsif t_end is not null and now() < t_end then
    next_tier := 'trial';
  else
    next_tier := 'none';
  end if;

  update public.profiles
  set access_tier = next_tier
  where id = uid;
end;
$function$;

-- ── 4a. LE FIL EST REBRANCHÉ, ET C'EST LA MOITIÉ DU TRAVAIL ───────────────
--
-- Une branche dans `recompute_profile_access_tier` ne vaut rien si personne
-- n'appelle la fonction quand le fait change. Le patron est celui du coach:
-- `on_coach_clients_change_recompute_access` recalcule les DEUX côtés d'un
-- lien déplacé. Trois événements bougent la place d'un foyer:
--
--   · la ligne membre change de compte (réclamation, détachement, purge);
--   · l'essai du foyer change (`free_until`, y compris le backfill humain);
--   · l'abonnement du MAÎTRE change (§4c).

create or replace function public.keel_household_recompute_members_access_tier(
  p_household uuid
)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  r record;
  n integer := 0;
begin
  if p_household is null then
    return 0;
  end if;
  for r in
    select hm.user_id as id
    from public.household_members hm
    where hm.household_id = p_household
      and hm.user_id is not null
      -- LE MAÎTRE AUSSI. Son palier ne dépend pas de la couverture du foyer
      -- (voir §4), mais l'exclure ici ferait de cette fonction « recalcule
      -- ceux dont le palier dépend du foyer », c'est-à-dire une règle de plus
      -- à maintenir. `recompute_profile_access_tier` est idempotente: la
      -- rejouer sur le maître ne change rien et ne coûte rien.
  loop
    perform public.recompute_profile_access_tier(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$function$;

comment on function public.keel_household_recompute_members_access_tier(uuid) is
  'Recalcule le palier de TOUS les comptes d''un foyer. Appelée quand la '
  'COUVERTURE du foyer bouge — un événement, N profils réclamés — comme '
  'recompute_coached_students_access_tier le fait pour une cohorte.';

revoke all on function public.keel_household_recompute_members_access_tier(uuid)
  from public, anon, authenticated;
grant execute on function public.keel_household_recompute_members_access_tier(uuid)
  to service_role;

-- ── 4b. LA LIGNE MEMBRE BOUGE ─────────────────────────────────────────────
create or replace function public._trg_recompute_access_tier_from_household_members()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- LES DEUX CÔTÉS, comme pour `coach_clients`: un détachement doit retirer le
  -- palier de la personne qui part, pas seulement le donner à celle qui entre.
  if tg_op <> 'INSERT' and old.user_id is not null then
    perform public.recompute_profile_access_tier(old.user_id);
  end if;
  if tg_op <> 'DELETE' and new.user_id is not null then
    perform public.recompute_profile_access_tier(new.user_id);
  end if;
  return null;
end;
$function$;

drop trigger if exists on_household_members_change_recompute_access
  on public.household_members;
-- `update of user_id, role` et pas `update` tout court: renommer une bouche ou
-- corriger sa date ne change aucun palier, et faire tourner un recalcul à
-- chaque frappe de l'écran serait payer un coût pour rien.
create trigger on_household_members_change_recompute_access
  after insert or delete or update of user_id, role
  on public.household_members
  for each row
  execute function public._trg_recompute_access_tier_from_household_members();

-- ── 4c. LA COUVERTURE DU FOYER BOUGE ──────────────────────────────────────
create or replace function public._trg_recompute_access_tier_from_household_cover()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform public.keel_household_recompute_members_access_tier(new.id);
  return null;
end;
$function$;

drop trigger if exists on_households_free_until_recompute_access
  on public.households;
create trigger on_households_free_until_recompute_access
  after update of free_until on public.households
  for each row
  when (old.free_until is distinct from new.free_until)
  execute function public._trg_recompute_access_tier_from_household_cover();

-- L'ABONNEMENT DU MAÎTRE. Le trigger existant ne recalculait que l'abonné
-- lui-même; sans cette ligne, le jour où le maître paie, ses profils réclamés
-- resteraient 'none' jusqu'à ce que quelque chose d'autre les touche. Corps
-- identique à celui en place, à UN `perform` près.
create or replace function public._trg_recompute_profile_access_tier_from_subscriptions()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.recompute_profile_access_tier(coalesce(new.user_id, old.user_id));
  -- LE FOYER DONT CE COMPTE EST LE MAÎTRE, s'il y en a un. La sous-requête
  -- rend NULL pour l'écrasante majorité des abonnés (les coachs), et
  -- `keel_household_recompute_members_access_tier(null)` rend 0 sans rien
  -- faire: le chemin coach ne paie qu'un index scan.
  perform public.keel_household_recompute_members_access_tier((
    select hm.household_id
    from public.household_members hm
    where hm.user_id = coalesce(new.user_id, old.user_id)
      and hm.role = 'owner'
    limit 1
  ));
  return coalesce(new, old);
end;
$function$;


-- ============================================================================
-- 5. CONTRÔLE FINAL — ON GÈLE UN VRAI FOYER, ET ON COMPTE CE QUI RESTE
-- ============================================================================
--
-- Vérifier que la fonction existe ne prouverait rien. On monte un foyer par
-- ses vraies RPC, on le gèle en reculant SA date, et on affirme les cinq
-- choses que le chantier demande: la couverture bascule, l'essai protège,
-- l'abonnement du maître protège, AUCUNE DONNÉE NE BOUGE, et le palier des
-- profils réclamés suit.
--
-- ⚠️ DEUX COMPTES SONT CRÉÉS DANS `auth.users` puis ANNULÉS: le bloc entier
-- est une sous-transaction qui se termine par un `raise` attrapé.
--
-- ⚠️ ON MUTE POUR PROUVER. Chaque assertion de gel est encadrée par son
-- contraire sur le MÊME foyer: un test qui n'affirmerait que « gelé » resterait
-- vert si la fonction rendait `false` en toutes circonstances.

do $$
declare
  v_owner uuid := 'f00d0000-0000-0000-0000-00000000000f';
  v_heir  uuid := 'f00d0000-0000-0000-0000-00000000001f';
  v_house uuid;
  v_lea uuid;
  v_res jsonb;
  v_n integer;
  v_before jsonb;
  v_after jsonb;
  v_tier text;
begin
  insert into auth.users (id, email, instance_id, aud, role)
  values
    (v_owner, '__qa_freeze_owner@example.invalid',
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (v_heir, '__qa_freeze_heir@example.invalid',
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  v_res := public.keel_household_create('__qa_freeze__');
  v_house := (v_res->>'household_id')::uuid;

  -- 1. UN FOYER NEUF NAÎT AVEC UNE DATE. Sans écrivain, le gel de ce fichier
  --    ne mordrait jamais — c'est la garde désarmée que §1 existe pour
  --    empêcher, et elle se prouve ici et pas par une lecture du DDL.
  if (select free_until from public.households where id = v_house)
       <> current_date + public.keel_household_trial_days() then
    raise exception
      'freeze QA: un foyer créé par keel_household_create n''a pas d''essai '
      'posé — aucun foyer neuf n''expirera jamais';
  end if;

  -- 2. ET IL EST COUVERT. La mutation du point 4 n'aurait aucune valeur sans
  --    cette ligne: on prouve que la fonction sait dire OUI avant de lui faire
  --    dire NON.
  if not public.keel_household_is_covered(v_house) then
    raise exception
      'freeze QA: un foyer neuf, en essai, est déjà GELÉ — le produit se coupe '
      'lui-même le jour de l''inscription';
  end if;

  -- On peuple: une bouche sans compte, puis une bouche RÉCLAMÉE par un vrai
  -- compte via la vraie chaîne d'invitation. C'est ce foyer-là qu'on gèlera.
  v_res := public.keel_household_add_member(
    'Lea', (current_date - interval '30 years')::date, 'fat_loss');
  v_lea := (v_res->>'member_id')::uuid;
  perform public.keel_household_add_allergy(v_lea, 'arachide');
  v_res := public.keel_household_add_member(
    'Enfant', (current_date - interval '8 years')::date, null);
  perform public.keel_household_add_allergy((v_res->>'member_id')::uuid, 'gluten');

  v_res := public.keel_household_invite('__qa_freeze_heir@example.invalid', v_lea);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_heir, 'role', 'authenticated')::text, true);
  v_res := public.keel_household_join(v_res->>'token');
  if (v_res->>'ok')::boolean is not true then
    raise exception 'freeze QA: la réclamation a été refusée (%)', v_res;
  end if;
  perform set_config('request.jwt.claims', '', true);

  -- 3. LA DETTE DU CHANTIER 1 EST PAYÉE: un profil réclamé d'un foyer COUVERT
  --    porte 'household_member'. Avant ce lot il gardait 'none'/'trial', et le
  --    jeton était au vocabulaire sans écrivain.
  select access_tier into v_tier from public.profiles where id = v_heir;
  if v_tier <> 'household_member' then
    raise exception
      'freeze QA: un profil réclamé porte « % » au lieu de household_member — '
      'le jeton du chantier 1 n''a toujours pas d''écrivain', v_tier;
  end if;

  -- L'ÉTAT COMPLET DU FOYER, AVANT LE GEL. C'est la preuve d'acceptation n°4:
  -- « aucune donnée n'a bougé » ne se prouve pas en regardant, il se prouve en
  -- comparant.
  select jsonb_build_object(
    'mouths', (select count(*) from public.household_members
                where household_id = v_house),
    'names', (select jsonb_agg(hm.first_name order by hm.first_name)
                from public.household_members hm where hm.household_id = v_house),
    'goals', (select jsonb_agg(distinct hm.goal)
                from public.household_members hm where hm.household_id = v_house),
    'births', (select count(*) from public.household_members
                where household_id = v_house and birth_date is not null),
    'allergies', (select count(*) from public.household_member_allergies
                where household_id = v_house),
    'claimed', public.keel_household_billable_profiles(v_house)
  ) into v_before;

  -- 4. ON GÈLE — ET C'EST LA MUTATION. `free_until` recule d'un jour derrière
  --    aujourd'hui: l'essai est fini, il n'y a pas d'abonnement.
  update public.households set free_until = current_date - 1 where id = v_house;
  if public.keel_household_is_covered(v_house) then
    raise exception
      'freeze QA: un foyer dont l''essai a expiré HIER est encore couvert — le '
      'gel ne mord pas';
  end if;
  v_res := public.keel_household_coverage_for_user(v_owner);
  if (v_res->>'frozen')::boolean is not true
     or (v_res->>'household_id')::uuid <> v_house then
    raise exception
      'freeze QA: la dérivation par COMPTE ne voit pas le gel (%) — le cron et '
      'le générateur liraient « tout va bien »', v_res;
  end if;

  -- 5. LE DERNIER JOUR EST INCLUS. Un foyer dont l'essai finit AUJOURD'HUI
  --    n'est pas gelé aujourd'hui — même arithmétique que
  --    `householdTrialCovers` en TypeScript, sinon on gèle quelqu'un qu'on
  --    vient de ne pas facturer.
  update public.households set free_until = current_date where id = v_house;
  if not public.keel_household_is_covered(v_house) then
    raise exception
      'freeze QA: l''essai qui finit AUJOURD''HUI gèle déjà — la base et '
      'billing-tier.ts ne disent pas la même chose du même jour';
  end if;

  -- 6. AUCUNE DONNÉE N'A BOUGÉ. On regèle, et on recompare l'état complet.
  update public.households set free_until = current_date - 1 where id = v_house;
  select jsonb_build_object(
    'mouths', (select count(*) from public.household_members
                where household_id = v_house),
    'names', (select jsonb_agg(hm.first_name order by hm.first_name)
                from public.household_members hm where hm.household_id = v_house),
    'goals', (select jsonb_agg(distinct hm.goal)
                from public.household_members hm where hm.household_id = v_house),
    'births', (select count(*) from public.household_members
                where household_id = v_house and birth_date is not null),
    'allergies', (select count(*) from public.household_member_allergies
                where household_id = v_house),
    'claimed', public.keel_household_billable_profiles(v_house)
  ) into v_after;
  if v_before is distinct from v_after then
    raise exception
      'freeze QA: le gel a MODIFIÉ le foyer. avant=% après=% — D4 dit gelé, '
      'jamais effacé', v_before, v_after;
  end if;

  -- 7. LE PALIER SUIT LE GEL, ET IL LE SUIT TOUT SEUL. Le trigger de §4c a
  --    recalculé les profils réclamés quand `free_until` a bougé: sans lui, la
  --    branche de §4 serait un morceau construit dont personne n'a rebranché
  --    le fil.
  select access_tier into v_tier from public.profiles where id = v_heir;
  if v_tier = 'household_member' then
    raise exception
      'freeze QA: le profil réclamé d''un foyer GELÉ porte encore '
      'household_member — le trigger de couverture n''a pas tourné';
  end if;

  -- 8. L'ABONNEMENT DU MAÎTRE DÉGÈLE, ET SANS TOUCHER À `free_until`. C'est la
  --    seconde branche de §2, et elle doit valoir toute seule.
  insert into public.subscriptions (user_id, tier, status)
  values (v_owner, 'household', 'active');
  if not public.keel_household_is_covered(v_house) then
    raise exception
      'freeze QA: le maître PAIE et son foyer est gelé — la branche « argent '
      'qui arrive » ne se lit pas';
  end if;
  -- ET LE PALIER EST REVENU TOUT SEUL, par le trigger d'abonnement de §4c.
  select access_tier into v_tier from public.profiles where id = v_heir;
  if v_tier <> 'household_member' then
    raise exception
      'freeze QA: le maître paie et son profil réclamé porte « % » — le '
      'paiement ne rebranche pas la cohorte', v_tier;
  end if;

  -- 9. UN ABONNEMENT MORT NE COUVRE PAS. Sans cette assertion, « il existe une
  --    ligne subscriptions » suffirait à dégeler pour toujours.
  update public.subscriptions set status = 'canceled' where user_id = v_owner;
  if public.keel_household_is_covered(v_house) then
    raise exception
      'freeze QA: un abonnement ANNULÉ couvre encore le foyer';
  end if;
  update public.subscriptions
     set status = 'active', current_period_end = now() - interval '1 day'
   where user_id = v_owner;
  if public.keel_household_is_covered(v_house) then
    raise exception
      'freeze QA: un abonnement actif dont la période est ÉCOULÉE couvre '
      'encore le foyer';
  end if;
  delete from public.subscriptions where user_id = v_owner;

  -- 10. LA BRANCHE HÉRITÉE: `free_until` NULL = aucun essai posé = COUVERT.
  --     Elle est ici pour être RELUE le jour où quelqu'un se demandera
  --     pourquoi un vieux foyer ne gèle pas. Sa condition de désarmement est
  --     dans le pavé de §2.
  update public.households set free_until = null where id = v_house;
  if not public.keel_household_is_covered(v_house) then
    raise exception
      'freeze QA: un foyer SANS essai posé est gelé — appliquer cette '
      'migration couperait tous les foyers existants d''un coup';
  end if;

  -- 11. UN FOYER INCONNU N'EST PAS COUVERT, et un compte HORS FOYER n'est pas
  --     gelé. Les deux tombent séparément, on les affirme séparément.
  if public.keel_household_is_covered('00000000-0000-0000-0000-0000000000ff') then
    raise exception 'freeze QA: un foyer inexistant est couvert';
  end if;
  v_res := public.keel_household_coverage_for_user(
    '00000000-0000-0000-0000-0000000000ff');
  if (v_res->>'in_household')::boolean is not false
     or (v_res->>'frozen')::boolean is not false then
    raise exception
      'freeze QA: un compte SANS foyer est vu gelé (%) — le cron sauterait '
      'tout le monde', v_res;
  end if;

  -- 12. LES PRIVILÈGES. La définition et la porte serveur sont au SERVEUR
  --     seul; seule la porte de l'écran est ouverte à `authenticated`, et elle
  --     n'a pas de paramètre. `revoke from public` NE RETIRE PAS `anon`.
  select count(*) into v_n
  from (values ('anon'), ('authenticated')) t(r)
  cross join (values
    ('public.keel_household_is_covered(uuid)'),
    ('public.keel_household_coverage_for_user(uuid)'),
    ('public.keel_household_recompute_members_access_tier(uuid)')) f(sig)
  where has_function_privilege(t.r, f.sig, 'EXECUTE');
  if v_n <> 0 then
    raise exception
      'freeze QA: % droit(s) d''exécution restent à anon ou authenticated sur '
      'les fonctions de couverture — l''état de facturation de n''importe quel '
      'foyer devient lisible', v_n;
  end if;
  if has_function_privilege('anon', 'public.keel_household_my_coverage()', 'EXECUTE') then
    raise exception 'freeze QA: anon lit l''état de facturation d''un foyer';
  end if;
  if not has_function_privilege('authenticated', 'public.keel_household_my_coverage()', 'EXECUTE') then
    raise exception
      'freeze QA: l''écran ne peut pas savoir qu''il est en pause — le refus '
      'se lira comme une panne';
  end if;

  raise notice
    'household_freeze: essai posé à la création, gel qui mord, dernier jour '
    'inclus, aucune donnée touchée, abonnement du maître qui dégèle, '
    'household_member écrit et recalculé';
  raise exception using errcode = 'triggered_action_exception', message = '__qa_rollback__';
exception
  when triggered_action_exception then
    if sqlerrm <> '__qa_rollback__' then raise; end if;
end $$;

select set_config('request.jwt.claims', '', true);

commit;
