-- ============================================================================
-- D11 — LE PLAFOND DE FUSIONS: `N + 3` PAR FOYER ET PAR SEMAINE ISO
--
-- Autorité: docs/keel/CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md, D11, lot L7.
-- Amont: 20260812160000 (le réglage discret), 20260811050000 (la couverture),
--        20260810260000 (le compte facturable), 20260810210000 (le lundi ISO
--        de la ligne d'envies).
--
-- ⚠️ LE COMPTE EST EN BASE, ET C'EST TOUTE LA DÉCISION. Un plafond que le
-- client calcule est un plafond qu'on contourne en changeant une ligne de JSON;
-- un plafond que la fonction edge calcule est un plafond qui saute au premier
-- appel concurrent. Les deux nombres — CE QUI EST CONSOMMÉ et CE QUI EST
-- PERMIS — vivent ici, et la GARDE VIT DANS LE PRÉDICAT d'un seul `insert …
-- on conflict do update … where` (§5). Ce dépôt a déjà payé exactement ça sur
-- `keel_validate_meal_plan`: deux gestes lancés en même temps lisaient le même
-- compteur et passaient tous les deux.
--
-- ── CE QUE CE FICHIER LIVRE ────────────────────────────────────────────────
--
--   1. `keel_iso_week_start(date)` — LE lundi ISO, une seule arithmétique.
--   2. `keel_household_active_accounts(uuid)` — le `N` de D11, défini ici et
--      nulle part ailleurs.
--   3. `keel_household_merge_quota_slack()` — le `+ 3`, ADRESSABLE (patron de
--      `keel_household_trial_days()`).
--   4. `keel_household_merge_quota_limit(uuid)` — `N + 3`, qui CITE (2) et (3).
--   5. La table `household_merge_quota` et la RÉCLAMATION atomique.
--   6. `keel_household_merge_quota_state(uuid, date)` — la lecture seule, pour
--      le refus rapide du générateur ET pour le lecteur de propositions.
--
-- ── CE QU'IL NE LIVRE PAS, DIT POUR QU'ON NE LE LISE PAS DEDANS ────────────
--
--   · AUCUNE remise. Une fusion réclamée est réclamée: le geste est compté
--     JUSTE AVANT l'appel modèle, et un échec postérieur au modèle ne rend pas
--     l'unité. Motif en toutes lettres dans le registre du lot (L7): le
--     plafond borne un COÛT, et le coût est payé à l'appel, pas à l'écriture.
--     Le retour arrière est une RPC de relâche à écrire, et 6 sites d'appel à
--     ne jamais oublier — c'est précisément ce qu'on refuse d'avoir.
--   · AUCUN comptage de la DÉFUSION ni de la reprise collante. `operation:
--     "unmerge"` et `operation: "compose"` ne touchent jamais cette table, et
--     c'est STRUCTUREL (la réclamation vit dans la branche `merge` du
--     générateur), pas conditionnel. Taxer la défusion taxerait la SORTIE que
--     D8 offre pour réparer une fusion; compter la reprise collante
--     facturerait au maître une décision qu'il n'a pas prise (L5).
--   · AUCUN plafond sur `generate-meal-v1`. « Les générations individuelles
--     gardent leur propre limite par personne: elles ne sont pas au frais du
--     foyer » (registre D11). Cette table n'a aucun appelant sur cette lane, et
--     un test de source le tient.
-- ============================================================================

begin;


-- ============================================================================
-- 1. LE LUNDI ISO — UNE SEULE ARITHMÉTIQUE, ET ELLE EXISTAIT DÉJÀ
-- ============================================================================
--
-- `keel_household_submit_envy` (20260810210000 §2) recale déjà la ligne
-- d'envies sur le lundi ISO, et son en-tête dit POURQUOI ça a compté: la
-- colonne acceptait n'importe quelle date, le générateur cherchait la ligne du
-- lundi et le foyer, qui avait écrit un mercredi, voyait sa phrase ignorée.
--
-- On ne réécrit pas cette RPC — une migration de plafond n'a pas à toucher
-- l'écriture des envies — mais on cesse d'inliner l'expression une troisième
-- fois. Les deux formes sont ici, et le contrôle final (§7) prouve qu'elles
-- coïncident sur quatorze jours consécutifs, c'est-à-dire sur les sept
-- positions de semaine, deux fois:
--
--   · `date_trunc('week', d)` — la semaine de Postgres COMMENCE le lundi (ISO
--     8601), et c'est la définition du moteur;
--   · `d - (extract(isodow from d)::int - 1)` — la forme inlinée par
--     `keel_household_submit_envy`.
--
-- Côté TypeScript, `weekStartOf` (`_shared/keel/weekly_flow_io.ts`) fait la
-- même chose — mais AUCUN chemin de ce lot ne l'appelle: le client passe SON
-- JOUR LOCAL, la base en tire la semaine. C'est la moitié de « compté en base ».

create or replace function public.keel_iso_week_start(p_date date)
returns date
language sql
immutable
as $function$ select date_trunc('week', p_date)::date $function$;

comment on function public.keel_iso_week_start(date) is
  'LE lundi de la semaine ISO qui contient cette date. Une seule arithmétique '
  'pour tout ce qui se compte à la semaine. Même résultat que la forme inlinée '
  'par keel_household_submit_envy (`d - (isodow - 1)`), et le contrôle de '
  '20260812170000 le prouve sur 14 jours consécutifs. ⚠️ Elle prend un JOUR '
  'LOCAL, jamais current_date: « cette semaine » se résout dans le fuseau de '
  'qui la vit, pas sur l''horloge du serveur.';

revoke all on function public.keel_iso_week_start(date) from public, anon;
grant execute on function public.keel_iso_week_start(date)
  to authenticated, service_role;


-- ============================================================================
-- 2. `N` — LES COMPTES ACTIFS DU FOYER
-- ============================================================================
--
-- ⚠️ POURQUOI PAS `keel_household_billable_profiles`, ET POURQUOI C'EST QUAND
-- MÊME LA MÊME DÉFINITION DE « COMPTE ».
--
-- Le prédicat « la ligne porte un compte » est celui de la facturation, mot
-- pour mot (20260810260000 §3: « RÉCLAMÉ = la ligne porte un compte.
-- L'invitation ne compte pas »). On le REPREND tel quel. Ce qu'on ne reprend
-- pas, c'est son `role <> 'owner'`, et sa raison est écrite juste à côté: « ET
-- PAS LE MAÎTRE. Son accès est dans les 12,99 € du foyer ». C'est un motif de
-- PRIX. Un plafond de fusions n'a rien à voir avec un prix: le maître est un
-- compte du foyer, c'est même le SEUL qui dépense ce quota (D10, la fusion est
-- déclenchée par lui). L'exclure ferait dire à `N` « comptes facturables » là
-- où D11 écrit « comptes actifs ».
--
-- Appeler `keel_household_billable_profiles(h) + 1` aurait été pire: le jour où
-- la facturation exclut une population pour une raison de prix (les mineurs,
-- un palier offert), le plafond de fusions bougerait tout seul, et personne ne
-- ferait le lien. Le contrôle final (§7) vérifie que les deux nombres se
-- répondent AUJOURD'HUI (`actifs = facturables + 1` sur un foyer dont le maître
-- porte un compte): si l'une des deux définitions dérive, ce fichier le dit.
--
-- « ACTIF » N'A PAS BESOIN D'UN DRAPEAU, et c'est structurel:
-- `household_members_user_id_fkey` est `on delete set null` depuis le
-- détachement (20260811040000). Un compte supprimé DÉTACHE sa bouche — la
-- bouche reste à table, son `user_id` tombe à NULL, et elle cesse de compter
-- sans que rien n'ait à être écrit. Une colonne `active` serait un second
-- écrivain à ne jamais oublier.

create or replace function public.keel_household_active_accounts(p_household uuid)
returns integer
language sql
stable
security definer
set search_path to ''
as $function$
  select count(*)::integer
  from public.household_members hm
  where hm.household_id = p_household
    and hm.user_id is not null;
$function$;

comment on function public.keel_household_active_accounts(uuid) is
  'LE `N` de D11 — combien de COMPTES vivants ce foyer porte, MAÎTRE COMPRIS. '
  'Même prédicat que keel_household_billable_profiles (« la ligne porte un '
  'compte »), SANS son exclusion du maître, qui est un motif de PRIX et non de '
  'quota: le maître est un compte, et c''est le seul qui dépense ce plafond. '
  'Une bouche sans compte ne compte pas; une invitation non réclamée non plus; '
  'un compte supprimé détache sa ligne (on delete set null) et cesse de '
  'compter tout seul. Ne sert QU''au plafond de fusions: la facturation a sa '
  'propre fonction, et les deux ne doivent pas se suivre.';

revoke all on function public.keel_household_active_accounts(uuid)
  from public, anon, authenticated;
grant execute on function public.keel_household_active_accounts(uuid)
  to service_role;


-- ============================================================================
-- 3. LE `+ 3` — ADRESSABLE, PARCE QU'UN NOMBRE MAGIQUE NE SE DISCUTE PAS
-- ============================================================================
--
-- Patron de `keel_household_trial_days()` (20260811050000 §1): la constante
-- vit dans une fonction, donc elle a un nom, un commentaire et un seul endroit
-- où la changer. D11 l'écrit `N + 3` sans en donner le motif; ce qu'on peut en
-- dire sans inventer, c'est qu'un foyer d'un seul compte doit pouvoir fusionner
-- plus d'une fois par semaine (se tromper, refaire), et que le terme constant
-- est ce qui le permet.
--
-- ⚠️ ELLE N'EXISTE PAS EN TYPESCRIPT, ET C'EST VOULU. Aucun fichier du produit
-- ne connaît le nombre 3: la fonction edge passe son jour local et reçoit
-- `limit`. C'est la différence entre un plafond compté en base et un plafond
-- récité en base.

create or replace function public.keel_household_merge_quota_slack()
returns integer
language sql
immutable
as $function$ select 3 $function$;

comment on function public.keel_household_merge_quota_slack() is
  'Le « + 3 » de D11: les fusions qu''un foyer garde EN PLUS de ses comptes '
  'actifs, par semaine ISO. Adressable exprès — un nombre magique dans un '
  'prédicat ne se discute pas. AUCUNE copie en TypeScript: le produit ne '
  'connaît jamais ce nombre, il reçoit `limit` de la base.';

revoke all on function public.keel_household_merge_quota_slack() from public, anon;
grant execute on function public.keel_household_merge_quota_slack()
  to authenticated, service_role;


-- ============================================================================
-- 4. `N + 3` — LA DÉFINITION UNIQUE DU PLAFOND
-- ============================================================================
--
-- Elle CITE §2 et §3, elle ne les recopie pas. Deux appelants la lisent — le
-- refus rapide (§6) et la réclamation (§5) — et ils doivent lire le même
-- nombre: un plafond qui s'annonce à 5 et mord à 4 est un plafond qui passe
-- pour une panne.

create or replace function public.keel_household_merge_quota_limit(p_household uuid)
returns integer
language sql
stable
security definer
set search_path to ''
as $function$
  select public.keel_household_active_accounts(p_household)
       + public.keel_household_merge_quota_slack();
$function$;

comment on function public.keel_household_merge_quota_limit(uuid) is
  'D11 — combien de fusions ce foyer a le droit de faire par semaine ISO: '
  'N + 3, N = keel_household_active_accounts. Définition unique: le refus '
  'rapide du générateur, la réclamation atomique et le lecteur de propositions '
  'la lisent tous les trois.';

revoke all on function public.keel_household_merge_quota_limit(uuid)
  from public, anon, authenticated;
grant execute on function public.keel_household_merge_quota_limit(uuid)
  to service_role;


-- ============================================================================
-- 5. LE COMPTEUR, ET LA GARDE — QUI VIT DANS LE PRÉDICAT
-- ============================================================================
--
-- ── POURQUOI UNE LIGNE PAR (FOYER, SEMAINE) ET PAS UN JOURNAL DE FUSIONS ───
-- Un journal (une ligne par fusion) obligerait à compter avant d'insérer, et
-- « lire-puis-écrire n'est pas une garde »: deux fusions lancées en même temps
-- liraient le même compte et passeraient toutes les deux. Ici, l'incrément EST
-- la garde — un seul `insert … on conflict do update … where used < limit`.
-- La seconde transaction attend le verrou de ligne, RELIT la version validée
-- (READ COMMITTED réévalue le `where` du DO UPDATE après le verrou), voit le
-- compteur plein, et n'écrit rien: 0 ligne rendue = refus.
--
-- Ce qu'on perd: le détail « quelle fusion, quand ». Ce qu'on garde à la place:
-- `last_member_id` / `last_claimed_at`, assez pour lire une semaine suspecte,
-- et la provenance complète reste dans `generated_from.household.merge` de
-- chaque plan écrit. Le retour arrière vers un journal est un `create table` de
-- plus, jamais une reprise de données: le compteur ne ment pas, il abrège.
--
-- ── POURQUOI PAS `enforce_rate_limit` (20260707170000) ─────────────────────
-- Le limiteur générique existe, il est atomique, et il ne peut pas porter D11:
--   · sa fenêtre est alignée sur l'ÉPOQUE UTC — une fenêtre de 7 jours y
--     commence un JEUDI, et D11 dit « semaine ISO » dans le jour local du
--     maître;
--   · son plafond est un PARAMÈTRE de l'appelant: `N` cesserait d'être compté
--     en base;
--   · il incrémente à chaque APPEL, refus compris — une fois la semaine pleine,
--     chaque nouvel appui repousserait la sortie, et un refus consommerait du
--     quota. Ici un refus ne coûte rien du tout.

create table if not exists public.household_merge_quota (
  household_id uuid not null references public.households(id) on delete cascade,
  -- LE LUNDI ISO, DANS LE JOUR LOCAL DU MAÎTRE. Jamais `current_date`: la
  -- fonction edge résout le fuseau du compte maître (elle le fait déjà pour la
  -- fenêtre du plan et pour la ligne d'envies) et passe SON jour.
  iso_week_start date not null,
  -- CE QUI A ÉTÉ RÉCLAMÉ CETTE SEMAINE-LÀ. Jamais décrémenté par le produit:
  -- il n'existe aucune remise (voir l'en-tête du fichier).
  used integer not null default 0 check (used >= 0),
  last_member_id uuid
    references public.household_members(member_id) on delete set null,
  last_claimed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (household_id, iso_week_start)
);

comment on table public.household_merge_quota is
  'D11 (L7, 2026-08-12) — combien de fusions ce foyer a réclamées cette '
  'semaine ISO. UNE ligne par (foyer, lundi local). Écrite UNIQUEMENT par '
  'keel_household_claim_merge_quota, dont le `where used < limit` EST la garde '
  '— pas une lecture suivie d''une écriture. Aucun rôle client n''y touche '
  '(RLS active, AUCUNE policy): un compteur qu''un client peut écrire n''est '
  'pas un plafond. La défusion et la composition ordinaire ne l''écrivent '
  'jamais, et c''est structurel.';
comment on column public.household_merge_quota.iso_week_start is
  'Le lundi ISO du JOUR LOCAL du maître (keel_iso_week_start). Jamais dérivé '
  'de l''horloge du serveur: à Auckland, un dimanche soir UTC est déjà lundi.';
comment on column public.household_merge_quota.used is
  'Les fusions RÉCLAMÉES — c''est-à-dire celles qui ont atteint l''appel '
  'modèle. Un refus antérieur (les onze de L4, ou le plafond lui-même) ne '
  'consomme rien; un échec POSTÉRIEUR au modèle ne rend rien.';

alter table public.household_merge_quota enable row level security;

-- ⚠️ DENY-ALL, ET AUCUNE POLICY. Patron de `rate_limit_counters`
-- (20260707170000): RLS active sans policy = tout est refusé sauf
-- `service_role`, qui la contourne. On nomme quand même les trois rôles, parce
-- que les privilèges par défaut de ce projet donnent TOUT à `authenticated` sur
-- toute table neuve et que `revoke from public` NE RETIRE PAS `anon`.
--
-- PAS DE `grant select` À `authenticated`, contrairement à
-- household_merge_settings: l'écran n'a pas besoin de la table, il a besoin du
-- NOMBRE — et le nombre lui arrive déjà par household-merge-notices-v1, calculé
-- avec le même plafond que la garde. Une lecture directe serait un second avis.
revoke all on public.household_merge_quota from public;
revoke all on public.household_merge_quota from anon;
revoke all on public.household_merge_quota from authenticated;


-- ---------------------------------------------------------------------------
-- 5b. LA RÉCLAMATION — UN SEUL ÉNONCÉ, ET C'EST LUI LA GARDE
-- ---------------------------------------------------------------------------

create or replace function public.keel_household_claim_merge_quota(
  p_household uuid,
  p_local_date date,
  p_member uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_week date;
  v_limit integer;
  v_used integer;
begin
  if p_household is null then
    return jsonb_build_object('ok', false, 'reason', 'household_required');
  end if;
  -- ⚠️ LE JOUR LOCAL EST OBLIGATOIRE, ET IL N'A PAS DE DÉFAUT. Un
  -- `coalesce(p_local_date, current_date)` ferait retomber « cette semaine »
  -- sur l'horloge du serveur dès qu'un appelant oublie le paramètre — et
  -- « un paramètre de garde optionnel est une garde désarmée » est une
  -- cicatrice de ce dépôt.
  if p_local_date is null then
    return jsonb_build_object('ok', false, 'reason', 'local_date_required');
  end if;

  v_week := public.keel_iso_week_start(p_local_date);
  v_limit := public.keel_household_merge_quota_limit(p_household);

  -- UN PLAFOND À ZÉRO REFUSE AVANT LE `insert`, ET CE N'EST PAS DE LA
  -- PARANOÏA: sur une ligne NEUVE il n'y a pas de conflit, donc pas de `where`
  -- — le premier `insert` passerait quel que soit le plafond. Le seul cas qui
  -- y mène aujourd'hui est un `slack` rendu négatif, mais c'est exactement le
  -- genre de trou qu'on ne voit qu'une fois ouvert.
  if v_limit is null or v_limit < 1 then
    return jsonb_build_object(
      'ok', false,
      'reason', 'merge_quota_exhausted',
      'week_start', v_week,
      'used', 0,
      'limit', coalesce(v_limit, 0),
      'remaining', 0,
      'resets_on', v_week + 7
    );
  end if;

  -- LA GARDE. Un seul énoncé: pas de lecture préalable à contourner, et le
  -- `where` porte sur la ligne VERROUILLÉE et relue.
  insert into public.household_merge_quota as q
    (household_id, iso_week_start, used, last_member_id, last_claimed_at, updated_at)
  values (p_household, v_week, 1, p_member, now(), now())
  on conflict (household_id, iso_week_start) do update
    set used = q.used + 1,
        last_member_id = excluded.last_member_id,
        last_claimed_at = excluded.last_claimed_at,
        updated_at = now()
    where q.used < v_limit
  returning q.used into v_used;

  if v_used is null then
    -- REFUS. On relit le compteur POUR LE MESSAGE seulement — la décision est
    -- déjà prise, et elle a été prise par le prédicat.
    select q.used into v_used
      from public.household_merge_quota q
     where q.household_id = p_household and q.iso_week_start = v_week;
    return jsonb_build_object(
      'ok', false,
      'reason', 'merge_quota_exhausted',
      'week_start', v_week,
      'used', coalesce(v_used, 0),
      'limit', v_limit,
      'remaining', 0,
      'resets_on', v_week + 7
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'week_start', v_week,
    'used', v_used,
    'limit', v_limit,
    'remaining', greatest(0, v_limit - v_used),
    'resets_on', v_week + 7
  );
end;
$function$;

comment on function public.keel_household_claim_merge_quota(uuid, date, uuid) is
  'D11 — RÉCLAME une fusion pour ce foyer, dans la semaine ISO du jour local '
  'donné. ATOMIQUE: l''incrément et la garde sont le même énoncé, donc deux '
  'fusions lancées en même temps ne peuvent pas passer toutes les deux. Rend '
  '{ok:true, used, limit, remaining, week_start, resets_on} ou {ok:false, '
  'reason:"merge_quota_exhausted", …}. Appelée JUSTE AVANT l''appel modèle, '
  'par generate-household-meal-v1 et par lui seul. Aucune remise: un échec '
  'postérieur au modèle ne rend pas l''unité (le plafond borne un coût, et le '
  'coût est payé à l''appel).';

revoke all on function public.keel_household_claim_merge_quota(uuid, date, uuid)
  from public, anon, authenticated;
grant execute on function public.keel_household_claim_merge_quota(uuid, date, uuid)
  to service_role;


-- ============================================================================
-- 6. LA LECTURE SEULE — LE REFUS RAPIDE, ET CE QUE LE LECTEUR DOIT SAVOIR
-- ============================================================================
--
-- DEUX APPELANTS, UNE SEULE ARITHMÉTIQUE:
--
--   · `generate-household-meal-v1` l'appelle AVANT tout le reste du chemin de
--     fusion, pour refuser en millisecondes. ⚠️ CE N'EST PAS LA GARDE — c'est
--     un refus rapide. La garde est le prédicat de §5b, et elle reste la seule
--     chose qui décide.
--   · `household-merge-notices-v1` l'appelle pour ne pas PROPOSER un bouton que
--     le quota refusera. « Proposer une fusion qui rendra merge_quota_exhausted
--     est une promesse qu'on ne tient pas » (L5, ce qui restait ouvert n°5).
--
-- ELLE N'ÉCRIT RIEN, pas même la ligne à zéro. Une lecture qui crée sa ligne
-- ferait du lecteur de propositions un écrivain, et il est vérifié par un test
-- de source qu'il n'en est pas un.

create or replace function public.keel_household_merge_quota_state(
  p_household uuid,
  p_local_date date
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_week date;
  v_limit integer;
  v_used integer;
begin
  if p_household is null then
    return jsonb_build_object('ok', false, 'reason', 'household_required');
  end if;
  if p_local_date is null then
    return jsonb_build_object('ok', false, 'reason', 'local_date_required');
  end if;

  v_week := public.keel_iso_week_start(p_local_date);
  v_limit := public.keel_household_merge_quota_limit(p_household);

  select q.used into v_used
    from public.household_merge_quota q
   where q.household_id = p_household and q.iso_week_start = v_week;
  v_used := coalesce(v_used, 0);

  return jsonb_build_object(
    'ok', true,
    'week_start', v_week,
    'used', v_used,
    'limit', v_limit,
    'remaining', greatest(0, v_limit - v_used),
    'exhausted', v_used >= v_limit,
    'resets_on', v_week + 7
  );
end;
$function$;

comment on function public.keel_household_merge_quota_state(uuid, date) is
  'D11, en LECTURE SEULE: où en est ce foyer cette semaine ISO ? Rend '
  '{used, limit, remaining, exhausted, week_start, resets_on}. Lue par le '
  'refus rapide du générateur (avant tout appel modèle) et par le lecteur de '
  'propositions (pour ne pas proposer un bouton que le quota refusera). '
  '⚠️ CE N''EST PAS LA GARDE: la garde est le prédicat de '
  'keel_household_claim_merge_quota. N''écrit rien, pas même une ligne à zéro.';

revoke all on function public.keel_household_merge_quota_state(uuid, date)
  from public, anon, authenticated;
grant execute on function public.keel_household_merge_quota_state(uuid, date)
  to service_role;


-- ============================================================================
-- 7. CONTRÔLE FINAL — ON REJOUE LES GESTES, PUIS ON ANNULE TOUT
-- ============================================================================
--
-- ⚠️ CE QUI NE PEUT PAS ÊTRE PROUVÉ ICI: la CONCURRENCE. Deux transactions
-- simultanées ne se simulent pas dans un seul `do $$`; le fait tenu ici est
-- que le compteur PLEIN refuse, et que le compteur à `N+3 - 1` accepte encore.
-- La preuve de la concurrence est une session psql à deux connexions, et elle
-- est dans le rapport du lot plutôt que suggérée par un contrôle qui n'y
-- touche pas.
--
-- CE QUI EST VÉRIFIÉ ICI, en revanche, ne se voit sur aucun écran: les
-- PRIVILÈGES, le cas qui PASSE (`N+3` aboutit, seule `N+4` mord), et la
-- coïncidence des deux arithmétiques de lundi.
do $$
declare
  v_user uuid;
  v_user2 uuid;
  v_house uuid;
  v_owner uuid;
  v_kid uuid;
  v_res jsonb;
  v_priv text;
  v_d date;
  v_i integer;
  v_rows integer;
begin
  -- 1. LES DEUX LUNDIS, SUR 14 JOURS CONSÉCUTIFS. Sept positions de semaine,
  --    deux fois: un décalage d'un jour ne peut pas se cacher.
  for v_i in 0..13 loop
    v_d := date '2026-08-09' + v_i;  -- un DIMANCHE en tête, le cas qui casse
    if public.keel_iso_week_start(v_d)
       <> v_d - (extract(isodow from v_d)::int - 1) then
      raise exception
        'keel_iso_week_start(%) = % mais la forme de keel_household_submit_envy '
        'dit % — deux ancrages de semaine dans le même produit, et personne ne '
        'saurait lequel ment',
        v_d, public.keel_iso_week_start(v_d),
        v_d - (extract(isodow from v_d)::int - 1);
    end if;
  end loop;
  if public.keel_iso_week_start(date '2026-08-09') <> date '2026-08-03' then
    raise exception
      'un DIMANCHE ne remonte pas au lundi précédent — le cas qui casse tous '
      'les ancrages de semaine écrits à la main';
  end if;

  -- 2. LES PRIVILÈGES DE TABLE. Aucun rôle client, dans les deux sens.
  foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
    if has_table_privilege('authenticated', 'public.household_merge_quota', v_priv) then
      raise exception
        'household_merge_quota: `authenticated` a le droit % — un compteur '
        'qu''un client peut écrire n''est pas un plafond', v_priv;
    end if;
    if has_table_privilege('anon', 'public.household_merge_quota', v_priv) then
      raise exception
        'household_merge_quota: `anon` a le droit % — `revoke from public` ne '
        'retire pas `anon`, cicatrice connue de ce dépôt', v_priv;
    end if;
  end loop;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'household_merge_quota'
       and c.relrowsecurity
  ) then
    raise exception 'household_merge_quota: RLS n''est pas active';
  end if;
  if not has_function_privilege('service_role',
       'public.keel_household_claim_merge_quota(uuid, date, uuid)', 'EXECUTE') then
    raise exception
      'keel_household_claim_merge_quota: `service_role` ne peut pas l''appeler '
      '— la fonction edge ne pourrait rien réclamer, et le plafond serait une '
      'garde qui ne mord jamais';
  end if;
  if has_function_privilege('authenticated',
       'public.keel_household_claim_merge_quota(uuid, date, uuid)', 'EXECUTE') then
    raise exception
      'keel_household_claim_merge_quota: `authenticated` peut l''appeler — un '
      'client pourrait vider le quota d''un foyer qu''il devine';
  end if;

  -- 3. LE JOUR LOCAL EST EXIGÉ EN LECTURE. (La RÉCLAMATION est éprouvée plus
  --    bas, sur un foyer RÉEL: sur un foyer inconnu, un défaut de garde
  --    tomberait sur la clé étrangère, et la clé étrangère dirait alors ce que
  --    la garde aurait dû dire — un rouge juste pour la mauvaise raison.)
  v_res := public.keel_household_merge_quota_state(gen_random_uuid(), null);
  if coalesce(v_res ->> 'reason', '') <> 'local_date_required' then
    raise exception 'la lecture accepte un jour local NULL (%)', v_res::text;
  end if;

  -- 4. LE CAS QUI PASSE, PUIS CELUI QUI MORD. « Une garde a besoin d'un cas
  --    qui passe »: cassée, elle refuse tout et ressemble trait pour trait à
  --    une garde qui marche.
  select id into v_user from auth.users u
   where public.keel_household_of(u.id) is null
   order by u.created_at limit 1;
  select id into v_user2 from auth.users u
   where public.keel_household_of(u.id) is null and u.id <> v_user
   order by u.created_at limit 1;
  if v_user is null or v_user2 is null then
    raise notice
      'household_merge_quota: moins de deux comptes libres, plafond non exercé';
  else
    insert into public.households (name, created_by)
    values ('__qa_merge_quota__', v_user) returning id into v_house;
    insert into public.household_members
      (household_id, user_id, role, first_name, birth_date)
    values (v_house, v_user, 'owner', 'Owner', '1990-01-01')
    returning member_id into v_owner;
    -- UN SECONDAIRE QUI PORTE UN COMPTE: c'est lui qui fait passer le plafond
    -- de 4 à 5, et c'est le seul fait que `N` mesure.
    insert into public.household_members
      (household_id, user_id, role, first_name, birth_date)
    values (v_house, v_user2, 'member', 'Zoe', '2000-01-01')
    returning member_id into v_kid;
    -- UNE BOUCHE SANS COMPTE: elle ne doit RIEN ajouter au plafond.
    insert into public.household_members
      (household_id, user_id, role, first_name, birth_date)
    values (v_house, null, 'member', 'Tom', '2001-01-01');

    -- `N` EST ÉCRIT EN TOUTES LETTRES, PAS DÉRIVÉ DE LA FONCTION TESTÉE: un
    -- maître avec un compte, un secondaire avec un compte, une bouche sans
    -- compte ⇒ 2 comptes actifs, plafond 2 + 3 = 5.
    if public.keel_household_active_accounts(v_house) <> 2 then
      raise exception
        'active_accounts = % au lieu de 2 — une bouche sans compte entre dans '
        'le plafond, ou le maître n''y entre pas',
        public.keel_household_active_accounts(v_house);
    end if;
    if public.keel_household_merge_quota_limit(v_house) <> 5 then
      raise exception
        'le plafond vaut % au lieu de 5 (2 comptes actifs + 3)',
        public.keel_household_merge_quota_limit(v_house);
    end if;
    -- LES DEUX DÉFINITIONS DE « COMPTE » SE RÉPONDENT. Si la facturation
    -- change son prédicat un jour, ce fichier le dit — au lieu de laisser le
    -- plafond dériver en silence.
    if public.keel_household_active_accounts(v_house)
       <> public.keel_household_billable_profiles(v_house) + 1 then
      raise exception
        'actifs (%) <> facturables (%) + 1 sur un foyer dont le maître porte '
        'un compte — les deux définitions de « compte » ont divergé',
        public.keel_household_active_accounts(v_house),
        public.keel_household_billable_profiles(v_house);
    end if;

    -- LE JOUR LOCAL EST EXIGÉ, SUR UN FOYER QUI EXISTE. Un
    -- `coalesce(p_local_date, current_date)` ferait retomber « cette semaine »
    -- sur l'horloge du serveur — et à Auckland, un dimanche soir UTC est déjà
    -- lundi.
    v_res := public.keel_household_claim_merge_quota(v_house, null, v_kid);
    if coalesce(v_res ->> 'reason', '') <> 'local_date_required' then
      raise exception
        'la réclamation accepte un jour local NULL (%) — « cette semaine » '
        'retomberait sur l''horloge du serveur', v_res::text;
    end if;
    if exists (select 1 from public.household_merge_quota
                where household_id = v_house) then
      raise exception
        'la réclamation a écrit une ligne alors qu''elle refusait — un refus '
        'ne doit rien coûter';
    end if;

    -- CINQ RÉCLAMATIONS PASSENT — LA `N+3` COMPRISE.
    for v_i in 1..5 loop
      v_res := public.keel_household_claim_merge_quota(v_house, date '2026-08-12', v_kid);
      if (v_res ->> 'ok')::boolean is not true then
        raise exception
          'la réclamation n° % est refusée (%) alors que le plafond est 5 — '
          'une garde qui refuse le cas passant ressemble à une garde qui marche',
          v_i, v_res::text;
      end if;
      if coalesce((v_res ->> 'used')::int, -1) <> v_i then
        raise exception 'la réclamation n° % compte % au lieu de %',
          v_i, v_res ->> 'used', v_i;
      end if;
    end loop;

    -- LA SIXIÈME MORD, ET ELLE SEULE.
    v_res := public.keel_household_claim_merge_quota(v_house, date '2026-08-12', v_kid);
    -- ⚠️ `coalesce` ET PAS UNE COMPARAISON NUE. Quand la réclamation PASSE,
    -- `reason` est NULL, et `NULL <> 'x'` vaut NULL — donc le `if` ne tire
    -- pas. Mesuré le 2026-08-12 en mutant le prédicat de la garde: la 6e
    -- réclamation passait, et CETTE ligne-ci ne disait rien. C'est la garde
    -- qui a besoin d'un cas qui échoue.
    if coalesce(v_res ->> 'reason', '') <> 'merge_quota_exhausted' then
      raise exception
        'la 6e réclamation passe (%) alors que le plafond est 5 — le plafond '
        'ne mord pas', v_res::text;
    end if;
    if coalesce((v_res ->> 'used')::int, -1) <> 5 then
      raise exception
        'un refus a incrémenté le compteur (used=%) — un refus ne doit rien '
        'coûter', v_res ->> 'used';
    end if;
    if coalesce((v_res ->> 'resets_on')::date, date '1970-01-01') <> date '2026-08-17' then
      raise exception
        'la semaine repart le % au lieu du lundi suivant (2026-08-17)',
        v_res ->> 'resets_on';
    end if;

    -- LA SEMAINE SUIVANTE EST NEUVE. Le plafond est « par semaine ISO »: le
    -- même foyer, sept jours plus tard, repart à zéro.
    v_res := public.keel_household_claim_merge_quota(v_house, date '2026-08-17', v_kid);
    if (v_res ->> 'ok')::boolean is not true
       or coalesce((v_res ->> 'used')::int, -1) <> 1 then
      raise exception
        'la semaine suivante n''est pas neuve (%) — le plafond serait un '
        'plafond à vie', v_res::text;
    end if;

    -- LA LECTURE SEULE DIT LA MÊME CHOSE QUE LA GARDE, et n'écrit pas.
    v_res := public.keel_household_merge_quota_state(v_house, date '2026-08-12');
    if (v_res ->> 'exhausted')::boolean is not true
       or coalesce((v_res ->> 'used')::int, -1) <> 5
       or coalesce((v_res ->> 'limit')::int, -1) <> 5 then
      raise exception
        'la lecture seule ne voit pas la même semaine que la garde (%)',
        v_res::text;
    end if;

    -- « ACTIF » SUIT LES COMPTES, ET ÇA SE VOIT SUR LE PLAFOND. Un compte
    -- supprimé DÉTACHE sa bouche (on delete set null): la bouche reste à
    -- table, elle cesse simplement de compter.
    update public.household_members set user_id = null where member_id = v_kid;
    if public.keel_household_active_accounts(v_house) <> 1 then
      raise exception
        'un compte détaché (user_id NULL) compte encore — « actif » ne veut '
        'plus rien dire';
    end if;
    if public.keel_household_merge_quota_limit(v_house) <> 4 then
      raise exception
        'le plafond reste à % après un détachement — `N` ne suit pas les '
        'comptes', public.keel_household_merge_quota_limit(v_house);
    end if;
    v_rows := (select count(*)::int from public.household_merge_quota
                where household_id = v_house);
    v_res := public.keel_household_merge_quota_state(v_house, date '2026-09-07');
    if (select count(*)::int from public.household_merge_quota
         where household_id = v_house) <> v_rows then
      raise exception
        'la lecture seule a CRÉÉ une ligne — le lecteur de propositions '
        'deviendrait un écrivain';
    end if;

    raise notice 'household_merge_quota: lundis, privilèges, cas passant, '
      'morsure, semaine neuve et lecture seule vérifiés';
  end if;

  raise exception using errcode = 'triggered_action_exception', message = '__qa_rollback__';
exception
  when triggered_action_exception then
    if sqlerrm <> '__qa_rollback__' then raise; end if;
end $$;

commit;
