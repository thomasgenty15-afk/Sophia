-- ============================================================================
-- LE FOYER — LA FACTURATION (chantier 1, part BASE)
--
-- Autorité: docs/keel/CHANTIER-FOYER-SUITE.md § « Chantier 1 ».
-- Amont: 20260810260000 (le compte facturable, sans appelant) et
--        20260727235000 (le patron coach: `coach_billing_periods` + les crons).
--
-- ── CE QUE CE FICHIER LIVRE ────────────────────────────────────────────────
--
--   1. `households.free_until` — l'essai de D4bis, POSÉ SUR LA LIGNE.
--   2. `household_billing_periods` — l'historique de facturation, sur le
--      patron EXACT de `coach_billing_periods`.
--   3. Le VOCABULAIRE DE PALIER: deux jetons neufs, `household` et
--      `household_member`, aux DEUX sites SQL. Les deux autres sites (TS)
--      bougent dans le même lot, et un test deno le prouve
--      (`_shared/tier_vocabulary_test.ts`) — pas un grep manuel.
--   4. Le cron mensuel de `stripe-reconcile-households`.
--
-- ── CE QU'IL NE LIVRE PAS, DIT POUR QU'ON NE LE LISE PAS DEDANS ────────────
--
--   · AUCUN prix Stripe, aucun produit, aucun abonnement. Créer un prix est un
--     geste HUMAIN (`supabase secrets set` est bloqué pour les agents), et la
--     fonction edge REFUSE de tourner tant qu'il manque — bruyamment, pas en
--     dégradant.
--   · AUCUN GEL. « Le foyer est gelé quand ni l'abonnement ni `free_until` ne
--     le couvrent » est le chantier 3, et sa fonction de couverture doit avoir
--     UNE SEULE définition. L'écrire ici, alors que les portes qui la liront
--     n'existent pas, en ferait une garde désarmée de plus — le défaut que le
--     chantier passe son temps à retirer. `free_until` est lu ici par UNE
--     chose et une seule: le job de facturation, pour ne PAS facturer.
--   · AUCUN écrivain de `household_member`. Le jeton entre au vocabulaire (les
--     quatre sites bougent ensemble ou aucun), et il n'est écrit par personne:
--     son écrivain est une dérivation « héritée » calquée sur `student`, qui a
--     besoin de la fonction de couverture du chantier 3. Nommé ici, et NON
--     construit — voir la section 3.
-- ============================================================================

begin;


-- ============================================================================
-- 1. L'ESSAI — UNE DATE SUR LA LIGNE, JAMAIS UNE RÈGLE RECALCULÉE
-- ============================================================================
--
-- D4bis: 30 jours à compter DU BRANCHEMENT de Stripe, pas de la création du
-- foyer. Les deux options écartées sont écrites parce qu'elles reviendront:
--
--   · le grandfather (gratuit pour toujours) crée une classe d'utilisateurs
--     dont le retour est biaisé à jamais, et ce sont les plus engagés;
--   · la coupe sèche détruit exactement ce que D4 vient de protéger (le graphe
--     du foyer est la douve).
--
-- POURQUOI UNE COLONNE ET PAS `created_at + 30 jours`. Une règle qu'on
-- recalcule à la volée devient irreproductible en six mois: il suffit qu'on
-- change 30 en 45, ou qu'on décide que l'essai part de la première génération,
-- et toutes les dates passées bougent avec. La colonne, elle, dit ce qui a été
-- promis À CE FOYER-LÀ. C'est aussi ce qui permet à un humain d'allonger
-- l'essai d'UN foyer (la « réserve » du chantier: les pilotes recrutés
-- personnellement) sans changer une règle produit.
--
-- NULL = aucun essai posé. Ce n'est PAS « essai expiré » et ce n'est pas
-- « gratuit pour toujours »: c'est « personne n'a encore fait le geste ». Le
-- backfill est le geste humain n°5, le JOUR du branchement — pas ici, où il
-- daterait l'essai du jour d'application de la migration.

alter table public.households
  add column if not exists free_until date;

comment on column public.households.free_until is
  'D4bis — le dernier jour COUVERT par l''essai, inclus. Posé sur la ligne, '
  'jamais dérivé de created_at: une règle recalculée à la volée rend '
  'irreproductible ce qui a été promis à CE foyer. NULL = aucun essai posé '
  '(≠ expiré, ≠ gratuit à vie). Lu par stripe-reconcile-households, qui ne '
  'facture pas un foyer couvert — profils réclamés compris. N''est PAS la '
  'définition du gel (chantier 3).';


-- ============================================================================
-- 2. L'HISTORIQUE DE FACTURATION — DEUX NOMBRES, JAMAIS FUSIONNÉS
-- ============================================================================
--
-- Patron de `coach_billing_periods` (20260727235000 §8), y compris sa raison
-- d'être: `active_profile_count` (ce qu'on a CALCULÉ) et `pushed_quantity` (ce
-- que Stripe a ACCEPTÉ) sont deux colonnes, jamais une. Si la poussée échoue,
-- la ligne existe quand même, `push_error` renseigné et `pushed_quantity` nul:
-- l'écart est LISIBLE au lieu d'être déduit d'une ligne de log manquante. Les
-- fusionner est exactement la façon dont une poussée ratée devient une
-- sous-facturation invisible.
--
-- CE QUE CETTE TABLE AJOUTE AU PATRON COACH, ET POURQUOI:
--
--   `mouth_count` — LE SECOND NOMBRE DU FOYER. Le plafond de 8 (garde de COÛT
--     LLM) et le compte facturable (quantité de facture) sont deux natures
--     différentes, et 20260810260000 existe pour qu'on ne les confonde jamais.
--     Les porter CÔTE À CÔTE dans l'historique étend cette preuve jusqu'à la
--     facture: un foyer plein à 8 bouches dont 4 profils réclamés laisse une
--     trace où 8 et 4 sont écrits séparément. La CHECK ci-dessous mord si un
--     jour quelqu'un branche l'un sur l'autre.
--
--   `free_until_at_computation` — POURQUOI on n'a pas facturé. Sans lui, un
--     mois d'essai et un mois de panne se ressemblent: deux lignes à
--     `pushed_quantity` nul. Snapshot, comme `threshold_at_computation` chez
--     le coach: une prolongation d'essai décidée plus tard ne doit pas
--     réécrire l'histoire des mois déjà calculés.
--
--   `skip_reason` — DISTINCT de `push_error`. « Ce foyer est en essai » n'est
--     pas une erreur, et l'écrire dans `push_error` ferait paraître en panne
--     un produit qui fonctionne. Un refus nommé et une panne ne se rangent pas
--     dans la même colonne.

create table if not exists public.household_billing_periods (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  -- Premier jour du mois calendaire, en UTC pour le pilote — dit ici pour que
  -- personne ne suppose plus tard un minuit local.
  period_month date not null,

  -- LES DEUX NOMBRES DU FOYER, JAMAIS FUSIONNÉS.
  -- `active_profile_count` est la QUANTITÉ de l'article « profil réclamé »;
  -- `mouth_count` est ce que le foyer nourrit. Le second ne facture rien.
  active_profile_count integer not null default 0,
  mouth_count integer not null default 0,

  -- Le plafond EN VIGUEUR au calcul, cité et non recopié. Snapshot pour la
  -- même raison que `threshold_at_computation`: changer le plafond un jour ne
  -- doit pas réécrire ce qu'on a facturé hier.
  max_mouths_at_computation integer not null default public.keel_household_max_mouths(),

  -- L'essai en vigueur au calcul. NULL = aucun essai posé sur ce foyer.
  free_until_at_computation date,

  stripe_subscription_id text,
  -- L'article « profil réclamé ». Le forfait (quantité 1) n'est PAS suivi ici:
  -- il ne bouge jamais, et le job ne le touche jamais — le redimensionner à N
  -- facturerait 12,99 € par tête.
  stripe_profile_item_id text,

  -- CE QUE STRIPE A ACCEPTÉ. Nul tant que rien n'a été poussé.
  pushed_quantity integer,
  pushed_at timestamptz,
  -- UNE PANNE.
  push_error text,
  -- UN REFUS NOMMÉ (essai en cours, pas d'abonnement, rien à pousser). Ce
  -- n'est pas une panne, et les mélanger rendrait illisible la seule question
  -- qu'on posera à cette table: « pourquoi ce mois n'a-t-il rien facturé ? »
  skip_reason text,

  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint household_billing_periods_month_is_first_of_month
    check (period_month = date_trunc('month', period_month)::date),
  constraint household_billing_periods_counts_nonneg
    check (active_profile_count >= 0 and mouth_count >= 0),
  -- UN PROFIL RÉCLAMÉ EST UNE BOUCHE. Si cette CHECK saute un jour, c'est que
  -- le job a compté deux populations différentes — ou qu'il a branché le
  -- plafond sur la quantité de facture, l'erreur que 20260810260000 existe
  -- pour empêcher.
  constraint household_billing_periods_profiles_within_mouths
    check (active_profile_count <= mouth_count)
);

comment on table public.household_billing_periods is
  'L''historique de facturation d''un foyer, une ligne par mois. Patron de '
  'coach_billing_periods: ce qu''on a CALCULÉ (active_profile_count) et ce que '
  'Stripe a ACCEPTÉ (pushed_quantity) ne sont jamais la même colonne. Écrite '
  'par stripe-reconcile-households AVANT l''appel Stripe, quoi qu''il arrive: '
  'un mois sans ligne est indiscernable d''un mois qu''on n''a jamais lancé.';

comment on column public.household_billing_periods.mouth_count is
  'Les bouches du foyer au calcul. NE FACTURE RIEN — c''est le nombre que '
  'keel_household_max_mouths() plafonne, pas celui qu''on vend. Il est ici '
  'pour que l''écart avec active_profile_count reste lisible sur la facture, '
  'des mois plus tard.';

comment on column public.household_billing_periods.skip_reason is
  'Le motif NOMMÉ d''un mois sans poussée qui n''est pas une panne: '
  'in_trial, no_stripe_subscription, no_profiles_no_item… Séparé de '
  'push_error exprès: un essai en cours n''est pas un incident.';

create unique index if not exists household_billing_periods_house_month_idx
  on public.household_billing_periods (household_id, period_month);

alter table public.household_billing_periods enable row level security;

-- LE MAÎTRE lit sa propre facture. Personne n'écrit depuis un client: le job
-- est `service_role`. Aucune policy INSERT/UPDATE/DELETE n'existe, et CETTE
-- ABSENCE est la protection d'écriture.
--
-- Pourquoi le maître SEUL et pas tout le foyer: c'est SON contrat et SA carte.
-- Le reste du foyer voit ce qu'on mange, pas ce qu'on paie.
drop policy if exists household_billing_periods_owner_select
  on public.household_billing_periods;
create policy household_billing_periods_owner_select
  on public.household_billing_periods
  for select to authenticated
  using (
    household_id in (
      select hm.household_id
      from public.household_members hm
      where hm.user_id = (select auth.uid())
        and hm.role = 'owner'
    )
  );

-- TOUTE TABLE NEUVE DONNE TOUT À `authenticated` PAR DÉFAUT, `TRUNCATE`
-- COMPRIS — et `TRUNCATE` ÉCHAPPE À RLS. Une policy de lecture ne protège donc
-- rien contre un client qui viderait la table. On retire explicitement.
revoke insert, update, delete, truncate, references, trigger
  on public.household_billing_periods from authenticated;
-- Et `revoke ... from public` NE RETIRE PAS `anon`: il a son propre GRANT.
revoke all on public.household_billing_periods from public;
revoke all on public.household_billing_periods from anon;
grant select on public.household_billing_periods to authenticated;
grant all on public.household_billing_periods to service_role;


-- ============================================================================
-- 3. LE VOCABULAIRE DE PALIER — DEUX JETONS, ET LES QUATRE SITES
-- ============================================================================
--
-- Les quatre sites bougent ENSEMBLE ou aucun:
--   1. `profiles_access_tier_check`      (ici)
--   2. `subscriptions_tier_check`        (ici)
--   3. `_shared/billing-tier.ts`         (même lot)
--   4. `frontend/src/lib/entitlements.ts`(même lot)
-- `_shared/tier_vocabulary_test.ts` lit les QUATRE fichiers et échoue si l'un
-- d'eux ne porte pas les jetons. C'est la seule façon connue dans ce dépôt
-- qu'une constante dupliquée entre deux runtimes reste honnête.
--
-- ── DEUX JETONS ET PAS UN, ET LA RAISON EST UNE SEULE SOURCE DE VÉRITÉ ─────
--
--   'household'        — LE COMPTE MAÎTRE. Vendu, porté par SA ligne
--                        `subscriptions` (`subscriptions.user_id` est UNIQUE:
--                        le foyer n'a pas d'identité Stripe, l'abonnement est
--                        celui du maître).
--   'household_member' — UN PROFIL RÉCLAMÉ. HÉRITÉ, jamais vendu, jamais sur
--                        une ligne `subscriptions` — exactement comme
--                        'student', et pour la même raison: sa carte n'existe
--                        pas, c'est le maître qui paie.
--
-- L'alternative — un seul jeton, et l'accès d'un profil réclamé DÉRIVÉ de
-- l'état du foyer — obligerait `getEffectiveTierForUser` à interroger le
-- foyer. Ce serait une SECONDE source de vérité sur l'accès, à côté de
-- `profiles.access_tier`. C'est la classe de défaut que tout ce chantier
-- retire; on ne l'ajoute pas dans le geste qui la retire.
--
-- ⚠️ CE QUI EST ÉCRIT, ET CE QUI NE L'EST PAS — dit ici pour qu'on ne le
--    découvre pas à l'usage:
--
--   'household' A SON ÉCRIVAIN, de bout en bout: le prix Stripe du forfait →
--     `tierFromStripePriceIds` rend 'household' → le webhook écrit
--     `subscriptions.tier` → `recompute_profile_access_tier` (section 3.3) le
--     recopie sur `profiles.access_tier`. Sans la section 3.3, un maître qui
--     PAIE retomberait sur 'none' et se verrait proposer le tunnel grand
--     public: le jeton serait admis par la CHECK et refusé par le calcul.
--
--   'household_member' N'A PAS D'ÉCRIVAIN, et c'est nommé, pas caché. Le sien
--     serait une branche « héritée » dans `recompute_profile_access_tier`,
--     calquée sur `has_inherited_seat`, dont la condition est « le foyer du
--     maître est COUVERT » — c'est-à-dire la fonction de couverture du
--     chantier 3, qui doit avoir UNE SEULE définition dans ce dépôt. L'écrire
--     ici en dupliquerait la règle avant même que la première existe.
--     CONSÉQUENCE, exacte: un profil réclamé garde aujourd'hui le palier qu'il
--     avait ('none' ou 'trial'). Rien ne régresse — aucun chemin du foyer ne
--     lit `access_tier` — et rien n'est promis qui ne soit pas là.

-- ── 3.1 profiles_access_tier_check ────────────────────────────────────────
alter table public.profiles
  drop constraint if exists profiles_access_tier_check;

alter table public.profiles
  add constraint profiles_access_tier_check
  check (access_tier = any (array[
    'none'::text,
    'trial'::text,
    -- KEEL coach
    'coach'::text,
    'student'::text,
    -- KEEL foyer
    'household'::text,
    'household_member'::text,
    -- legacy B2C, plus émis, gardé pour que les lignes existantes restent valides
    'system'::text,
    'alliance'::text,
    'architecte'::text
  ]));

-- ── 3.2 subscriptions_tier_check ──────────────────────────────────────────
alter table public.subscriptions
  drop constraint if exists subscriptions_tier_check;

-- 'student' et 'household_member' sont délibérément ABSENTS: un droit HÉRITÉ
-- n'a pas de ligne d'abonnement, par construction. Si l'un d'eux apparaissait
-- ici, c'est que quelque chose a acheté un accès qu'il ne peut pas posséder —
-- on échoue à l'écriture (R7) plutôt que d'émettre une facture à quelqu'un
-- dont on a promis qu'il ne paierait rien.
alter table public.subscriptions
  add constraint subscriptions_tier_check
  check (tier is null or tier = any (array[
    'coach'::text,
    'household'::text,
    'system'::text,
    'alliance'::text,
    'architecte'::text
  ]));

-- ── 3.3 L'ÉCRIVAIN DE 'household' ─────────────────────────────────────────
--
-- Corps IDENTIQUE à celui en place, à UNE liste près: 'household' rejoint les
-- paliers qu'un abonnement peut projeter sur le profil. Sans cette ligne, la
-- CHECK admettrait un jeton que le calcul refuserait — un maître qui paie
-- retomberait sur 'none', c'est-à-dire sur le tunnel de vente grand public.
--
-- 'household_member' n'apparaît PAS ici, et ne le peut pas: il n'a pas de
-- ligne `subscriptions` (3.2). Sa branche est la branche « héritée », et elle
-- appartient au chantier 3 (voir plus haut).
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

  if sub_active and sub_tier is not null
     and sub_tier in ('coach','household','system','alliance','architecte') then
    next_tier := sub_tier;
  elsif has_inherited_seat then
    next_tier := 'student';
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


-- ============================================================================
-- 4. LE CRON MENSUEL
-- ============================================================================
--
-- Même patron que `keel-reconcile-seats-monthly` (20260727235000 §10), et même
-- garde: rien n'est POSTé si l'une des trois valeurs de configuration manque —
-- un cron qui tire sur un 404 tous les mois est pire qu'un cron qui ne part
-- pas. `x-internal-secret` est passé explicitement: `ensureInternalRequest`
-- exige cet en-tête, et un `invoke` sans lui rend 403 à chaque envoi.
--
-- 03:40 UTC le 1er, VINGT MINUTES APRÈS les sièges du coach: les deux jobs
-- parlent à la même API Stripe avec la même clé, et les faire partir à la même
-- minute mettrait deux réconciliations en concurrence sur le rate limit pour
-- rien.

create extension if not exists "pg_net" with schema "extensions";
create extension if not exists "pg_cron" with schema "extensions";

do $$
declare job record;
begin
  for job in
    select jobid from cron.job where jobname = 'keel-reconcile-households-monthly'
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end $$;

do $$
begin
  perform cron.schedule(
    'keel-reconcile-households-monthly',
    '40 3 1 * *',
    $command$
    with cfg as (
      select
        coalesce((select value from public.app_config where key = 'edge_functions_base_url' limit 1), '') as base_url,
        coalesce((select value from public.app_config where key = 'edge_functions_anon_key' limit 1), '') as anon_key,
        coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'INTERNAL_FUNCTION_SECRET' limit 1), '') as internal_secret
    )
    select
      net.http_post(
        url := rtrim((select base_url from cfg), '/') || '/functions/v1/stripe-reconcile-households',
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'apikey', (select anon_key from cfg),
          'authorization', 'Bearer ' || (select anon_key from cfg),
          'x-internal-secret', (select internal_secret from cfg)
        ),
        body := '{}'::jsonb
      ) as request_id
    from cfg
    where (select base_url from cfg) <> ''
      and (select anon_key from cfg) <> ''
      and (select internal_secret from cfg) <> '';
    $command$
  );
end $$;


-- ============================================================================
-- 5. CONTRÔLE FINAL — ON REJOUE LES INVARIANTS, PAS LE CATALOGUE
-- ============================================================================
--
-- Vérifier que la table existe ne prouverait rien. On monte un foyer, on écrit
-- une période, et on essaie de la casser dans les trois directions où une
-- facturation se trompe sans qu'on le voie: fusionner les deux nombres,
-- brancher le plafond sur la quantité, laisser un client écrire.
--
-- ⚠️ UN COMPTE EST CRÉÉ DANS `auth.users` puis ANNULÉ: le bloc entier est une
-- sous-transaction qui se termine par un `raise` attrapé.

do $$
declare
  v_owner uuid := 'b111a000-0000-0000-0000-0000000000a1';
  v_house uuid;
  v_res jsonb;
  v_n integer;
  v_month date := date_trunc('month', now())::date;
begin
  insert into auth.users (id, email, instance_id, aud, role)
  values (v_owner, '__qa_hbill_owner@example.invalid',
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  v_res := public.keel_household_create('__qa_hbill__');
  v_house := (v_res->>'household_id')::uuid;
  perform set_config('request.jwt.claims', '', true);

  -- 1. L'ESSAI SE POSE, ET IL EST UNE DATE. Pas un booléen: « couvert jusqu'à
  --    quand » doit rester répondable des mois plus tard.
  update public.households set free_until = current_date + 30 where id = v_house;
  if (select free_until from public.households where id = v_house)
       <> current_date + 30 then
    raise exception 'household billing QA: free_until ne tient pas sur la ligne';
  end if;

  -- 2. LA LIGNE DE PÉRIODE S'ÉCRIT AVANT TOUT APPEL STRIPE, avec les deux
  --    nombres SÉPARÉS et rien de poussé. C'est l'état exact d'un foyer en
  --    essai: calculé, non facturé, et la raison est écrite.
  insert into public.household_billing_periods
    (household_id, period_month, active_profile_count, mouth_count,
     free_until_at_computation, skip_reason)
  values (v_house, v_month, 4, 8, current_date + 30, 'in_trial');

  select pushed_quantity into v_n
  from public.household_billing_periods
  where household_id = v_house and period_month = v_month;
  if v_n is not null then
    raise exception
      'household billing QA: un foyer en essai porte une quantité poussée (%)', v_n;
  end if;

  -- 3. LES DEUX NOMBRES SONT DEUX. Le plafond snapshotté vaut 8, les bouches
  --    valent 8, et on n'en facture QUE 4: le foyer est PLEIN et facture la
  --    moitié. Si un jour quelqu'un branche le plafond sur la quantité, c'est
  --    cette assertion qui tombe — pas une facture.
  select max_mouths_at_computation into v_n
  from public.household_billing_periods
  where household_id = v_house and period_month = v_month;
  if v_n <> public.keel_household_max_mouths() then
    raise exception
      'household billing QA: le plafond snapshotté (%) ne cite pas '
      'keel_household_max_mouths() (%)', v_n, public.keel_household_max_mouths();
  end if;
  if (select active_profile_count from public.household_billing_periods
       where household_id = v_house and period_month = v_month) =
     (select mouth_count from public.household_billing_periods
       where household_id = v_house and period_month = v_month) then
    raise exception
      'household billing QA: la quantité de facture égale le nombre de bouches '
      '— les deux nombres ont été confondus';
  end if;

  -- 4. FACTURER PLUS DE PROFILS QUE DE BOUCHES EST REFUSÉ PAR LA BASE. C'est
  --    la seule forme d'erreur de comptage qui produirait un nombre plausible.
  begin
    update public.household_billing_periods
      set active_profile_count = 9
    where household_id = v_house and period_month = v_month;
    raise exception
      'household billing QA: 9 profils facturés pour 8 bouches ont été ACCEPTÉS';
  exception
    when check_violation then null;
  end;

  -- 5. UN MOIS N'A QU'UNE LIGNE. Sans l'index unique, deux runs du même mois
  --    laisseraient deux vérités et l'`upsert` du job cesserait d'être
  --    idempotent — c'est-à-dire que « relancer » cesserait d'être la
  --    réparation.
  begin
    insert into public.household_billing_periods (household_id, period_month)
    values (v_house, v_month);
    raise exception
      'household billing QA: deux lignes pour le même mois ont été acceptées';
  exception
    when unique_violation then null;
  end;

  -- 6. LES PRIVILÈGES. `revoke from public` NE RETIRE PAS `anon`; TRUNCATE
  --    échappe à RLS. Les deux sont affirmés séparément parce qu'ils tombent
  --    séparément.
  select count(*) into v_n
  from (values ('anon'), ('authenticated')) t(r)
  cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p(priv)
  where has_table_privilege(t.r, 'public.household_billing_periods', p.priv);
  if v_n <> 0 then
    raise exception
      'household billing QA: % privilège(s) d''écriture restent à anon ou '
      'authenticated sur household_billing_periods', v_n;
  end if;
  if has_table_privilege('anon', 'public.household_billing_periods', 'SELECT') then
    raise exception 'household billing QA: anon LIT les factures des foyers';
  end if;
  if not has_table_privilege('service_role', 'public.household_billing_periods', 'INSERT') then
    raise exception 'household billing QA: le job ne peut pas écrire sa propre table';
  end if;

  -- 7. LE VOCABULAIRE. Les deux jetons sont admis sur un PROFIL; seul
  --    'household' l'est sur un ABONNEMENT — un droit HÉRITÉ n'a pas de ligne
  --    d'abonnement, et l'y admettre facturerait quelqu'un à qui on a promis
  --    qu'il ne paierait rien.
  --
  --    ⚠️ On compte les lignes touchées. Sans ça, un `update` qui ne trouve
  --    aucun profil « passerait » — c'est-à-dire qu'on prouverait la CHECK sur
  --    zéro ligne.
  update public.profiles set access_tier = 'household' where id = v_owner;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception
      'household billing QA: le jeton ''household'' a été « prouvé » sur % '
      'ligne(s) de profil', v_n;
  end if;
  update public.profiles set access_tier = 'household_member' where id = v_owner;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception
      'household billing QA: le jeton ''household_member'' a été « prouvé » '
      'sur % ligne(s) de profil', v_n;
  end if;
  update public.profiles set access_tier = 'none' where id = v_owner;

  -- 'household' EST VENDABLE: il doit passer sur un abonnement.
  insert into public.subscriptions (user_id, tier, status)
  values (v_owner, 'household', 'active');
  delete from public.subscriptions where user_id = v_owner;

  -- 'household_member' NE L'EST PAS.
  begin
    insert into public.subscriptions (user_id, tier, status)
    values (v_owner, 'household_member', 'active');
    raise exception
      'household billing QA: un abonnement ''household_member'' a été accepté '
      '— un droit hérité vient d''être mis sur une facture';
  exception
    when check_violation then null;
  end;

  raise notice
    'household_billing: essai posé sur la ligne, période écrite sans poussée, '
    'plafond et quantité distincts, écriture client refusée, deux jetons au '
    'vocabulaire';
  raise exception using errcode = 'triggered_action_exception', message = '__qa_rollback__';
exception
  when triggered_action_exception then
    if sqlerrm <> '__qa_rollback__' then raise; end if;
end $$;

select set_config('request.jwt.claims', '', true);

commit;
