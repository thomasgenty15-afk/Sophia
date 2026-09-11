-- ============================================================================
-- LOT 8 · FAMILLE ① IDENTITÉ/SQL — LE COMPLÉMENT DES 49 CAS DÉJÀ LIVRÉS.
--
-- Ce fichier n'éprouve QUE ce que les trois fichiers du lot 1 laissent ouvert.
-- Ce qu'ils couvrent déjà, il ne le rejoue pas — il le nomme:
--
--   · nouveau compte ............ personal_household_test.sql ① ,
--                                 personal_household_lifecycle_test.sql ④
--   · membre existant ........... personal_household_test.sql ③
--   · compte supprimé (ensure) .. personal_household_test.sql ④
--   · foyer personnel VIDE ...... personal_household_lifecycle_test.sql ①
--   · échéance RANGÉE au départ . personal_household_departure_test.sql ②③
--
-- CE QUI RESTAIT SANS AUCUN TEST, ET QUI EST ICI:
--   ① le RATTRAPAGE (`keel_backfill_personal_households`) — 64 lignes de
--      corps, 1 437 comptes sans foyer à traiter (compté le 2026-09-10 sur la
--      base locale), et zéro test;
--   ② la NON-DUPLICATION, autrement que par deux appels séquentiels;
--   ③ la branche `vide_conserve` de l'invitation — un foyer personnel qui
--      PORTE un plan et qui refuse donc d'être supprimé;
--   ④ la branche `else` du départ — aucune échéance rangée;
--   ⑤ ce que la SUPPRESSION D'UN COMPTE laisse derrière elle depuis le lot 1.
--
--   docker cp supabase/functions/_shared/keel/lot8_identite_test.sql \
--     supabase_db_Sophia_2:/tmp/t.sql && \
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f /tmp/t.sql
--
-- ⚠️ Transaction ROLLBACK: la base ressort intacte.
-- ⛔ Aucun compte réel: onze comptes de test sont créés ici, et eux seuls.
--
-- ⚠️ LES IDENTIFIANTS SONT LES PLUS PETITS DU DÉPÔT, ET C'EST OBLIGATOIRE.
-- Le rattrapage parcourt `auth.users` dans l'ordre des `id`. Avec des
-- identifiants quelconques, `p_limit = 2` traiterait deux comptes du décor de
-- quelqu'un d'autre et ce fichier ne mesurerait rien.
-- ============================================================================

begin;

create temporary table t_probe(name text, ok boolean, detail text) on commit drop;

-- ══════════════════════════════════════════════════════════════════════════
-- ① LE RATTRAPAGE — `keel_backfill_personal_households`
-- ══════════════════════════════════════════════════════════════════════════
--
-- Trois comptes « d'avant »: deux vivants sans foyer, un supprimé sans foyer.

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data,
                        created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000101',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'lot8.bf.un@keeltest.dev', '{"full_name":"Alan Ancien"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000102',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'lot8.bf.deux@keeltest.dev', '{"full_name":"Bea Ancienne"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000103',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'lot8.bf.efface@keeltest.dev', '{"full_name":"Cyd Efface"}'::jsonb, now(), now());

-- ⛔ ON DÉFAIT LE PROVISIONNEMENT AUTOMATIQUE — c'est ce qui fabrique un
-- « compte d'avant ». Le déclencheur de 20260910194000 vient de poser un foyer
-- à chacun des trois; sans cette remise à zéro, le rattrapage n'aurait rien à
-- rattraper et ce fichier serait vert sans rien mesurer.
-- ⚠️ Ce n'est PAS un contournement du déclencheur: `lifecycle` ④ le mesure, lui.
delete from public.households h
where h.created_by in ('00000000-0000-4000-8000-000000000101'::uuid,
                       '00000000-0000-4000-8000-000000000102'::uuid,
                       '00000000-0000-4000-8000-000000000103'::uuid)
  and h.origin = 'personal_auto';

update auth.users set deleted_at = now()
 where id = '00000000-0000-4000-8000-000000000103';

insert into t_probe select '⓪ prémisse: les trois comptes sont sans foyer',
  (select count(*) from public.household_members
    where user_id in ('00000000-0000-4000-8000-000000000101',
                      '00000000-0000-4000-8000-000000000102',
                      '00000000-0000-4000-8000-000000000103')) = 0,
  'sinon tout ce qui suit mesurerait le déclencheur, pas le rattrapage';

-- ── ①.a UN JETON QUI N'EST PAS `service_role` N'OUVRE PAS LE RATTRAPAGE ───
-- ⛔ SANS CE REFUS, N'IMPORTE QUEL COMPTE CONNECTÉ PROVISIONNE 1 437 FOYERS —
-- et sept jours d'essai avec. Le `grant` l'interdit déjà; ce cas éprouve le
-- garde du CORPS, qui est ce qui reste quand quelqu'un re-`grant` par confort.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000101","role":"authenticated"}', true);
insert into t_probe select '① jeton `authenticated`: not_allowed',
  (public.keel_backfill_personal_households(2, false)->>'reason') = 'not_allowed',
  public.keel_backfill_personal_households(2, false)::text;

insert into t_probe select '① et le refus N''A RIEN ÉCRIT',
  (select count(*) from public.household_members
    where user_id in ('00000000-0000-4000-8000-000000000101',
                      '00000000-0000-4000-8000-000000000102')) = 0,
  format('lignes=%s', (select count(*) from public.household_members
    where user_id in ('00000000-0000-4000-8000-000000000101',
                      '00000000-0000-4000-8000-000000000102')));

-- ── ①.b L'ESSAI À BLANC EST LE DÉFAUT, ET IL N'ÉCRIT RIEN ─────────────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000101","role":"service_role"}', true);

create temporary table t_sec as
  select public.keel_backfill_personal_households(2) as r;   -- p_dry_run implicite

insert into t_probe select '① l''essai à blanc est le DÉFAUT du paramètre',
  (select (r->>'dry_run')::boolean from t_sec), (select r->>'dry_run' from t_sec);

insert into t_probe select '① l''essai à blanc COMPTE ce qu''il ferait',
  (select (r->>'vus')::int from t_sec) = 2
  and (select (r->>'crees')::int from t_sec) = 2,
  (select r::text from t_sec);

-- ⛔ LE CAS QUI COMPTE DE TOUTE LA SECTION. Un rattrapage qui écrit au premier
-- appel est un rattrapage qu'on lance « pour voir » sur 1 437 comptes.
insert into t_probe select '① l''essai à blanc N''A RIEN ÉCRIT',
  (select count(*) from public.household_members
    where user_id in ('00000000-0000-4000-8000-000000000101',
                      '00000000-0000-4000-8000-000000000102')) = 0,
  format('lignes=%s', (select count(*) from public.household_members
    where user_id in ('00000000-0000-4000-8000-000000000101',
                      '00000000-0000-4000-8000-000000000102')));

-- ── ①.c LE VRAI RATTRAPAGE ────────────────────────────────────────────────
create temporary table t_run as
  select public.keel_backfill_personal_households(2, false) as r;

insert into t_probe select '① le vrai passage crée les deux foyers',
  (select (r->>'vus')::int from t_run) = 2
  and (select (r->>'crees')::int from t_run) = 2
  and (select (r->>'echecs')::int from t_run) = 0,
  (select r::text from t_run);

insert into t_probe select '① chacun est maître de SON foyer, origine automatique',
  (select count(*) from public.household_members hm
     join public.households h on h.id = hm.household_id
    where hm.user_id in ('00000000-0000-4000-8000-000000000101',
                         '00000000-0000-4000-8000-000000000102')
      and hm.role = 'owner' and h.origin = 'personal_auto') = 2,
  (select string_agg(format('%s/%s', hm.role, h.origin), ' · ')
     from public.household_members hm
     join public.households h on h.id = hm.household_id
    where hm.user_id in ('00000000-0000-4000-8000-000000000101',
                         '00000000-0000-4000-8000-000000000102'));

-- L'identité vient de `profiles`, exactement comme la porte publique.
insert into t_probe select '① le prénom vient du profil, pas d''un repli',
  (select first_name from public.household_members
    where user_id = '00000000-0000-4000-8000-000000000101') = 'Alan',
  coalesce((select first_name from public.household_members
    where user_id = '00000000-0000-4000-8000-000000000101'), '(aucun)');

-- ⛔ L'ESSAI EST LE DÉFAUT DE LA COLONNE — sept jours. Le rattrapage est
-- l'endroit où quelqu'un serait tenté d'écrire `free_until` à la main « pour
-- ne rien accorder »: `NULL` vaudrait couvert POUR TOUJOURS
-- (`keel_household_is_covered`), et une date passée vaudrait mur immédiat.
insert into t_probe select '① le rattrapage laisse le DÉFAUT (7 j) s''appliquer',
  (select h.free_until from public.households h
    where h.id = public.keel_household_of('00000000-0000-4000-8000-000000000101'))
  = current_date + public.keel_household_trial_days(),
  format('rendu=%s attendu=%s',
    (select h.free_until from public.households h
      where h.id = public.keel_household_of('00000000-0000-4000-8000-000000000101')),
    current_date + public.keel_household_trial_days());

-- Le compteur de reste diminue exactement de ce qui a été créé.
insert into t_probe select '① `reste` diminue de ce qui a été créé',
  (select (r->>'sans_foyer_apres')::int from t_run)
  = (select (r->>'sans_foyer_avant')::int from t_run) - 2,
  (select format('avant=%s après=%s', r->>'sans_foyer_avant', r->>'sans_foyer_apres')
     from t_run);

-- ── ①.d UN COMPTE SUPPRIMÉ N'EST PAS MÊME REGARDÉ ─────────────────────────
--
-- ⛔ CE CAS DOIT VENIR APRÈS ①.c, ET C'EST TOUT SON INTÉRÊT. Tant que `0101` et
-- `0102` étaient sans foyer, `0103` n'était que le troisième candidat: un
-- `p_limit = 2` ne l'aurait pas atteint, et le test aurait été vert sans rien
-- éprouver. Maintenant qu'ils sont rattrapés, `0103` est LE PLUS PETIT
-- identifiant restant — donc le premier que la boucle prendrait si le filtre
-- `deleted_at is null` disparaissait.
--
-- ⚠️ ON MESURE `echecs`/`motifs`, PAS SEULEMENT L'ABSENCE DE FOYER. La
-- primitive refuse elle aussi (`account_deleted`, éprouvé par
-- `personal_household_test.sql` ④): sans foyer, le compte le resterait dans les
-- deux cas. Ce qui distingue « jamais regardé » de « regardé puis refusé »,
-- c'est le motif compté.
create temporary table t_efface as
  select public.keel_backfill_personal_households(1, false) as r;

insert into t_probe select '① un compte supprimé n''entre même pas dans la boucle',
  (select (r->>'echecs')::int from t_efface) = 0
  and (select r->>'motifs' from t_efface) = '{}',
  (select r::text from t_efface);

insert into t_probe select '① …et il n''a toujours aucun foyer',
  public.keel_household_of('00000000-0000-4000-8000-000000000103') is null,
  coalesce(public.keel_household_of('00000000-0000-4000-8000-000000000103')::text,
           '(aucun foyer — attendu)');

-- ⚠️ ET VOICI POURQUOI `motifs = {}` VEUT DIRE QUELQUE CHOSE: la primitive, si
-- la boucle lui donnait ce compte, rendrait `account_deleted` — donc un motif
-- COMPTÉ. Sans ce cas, `echecs = 0` pourrait aussi bien vouloir dire « rien
-- n'échoue jamais ».
insert into t_probe select '① (démonstration) la primitive, elle, compterait le motif',
  (public.keel__ensure_personal_household(
     '00000000-0000-4000-8000-000000000103')->>'reason') = 'account_deleted',
  public.keel__ensure_personal_household(
    '00000000-0000-4000-8000-000000000103')::text;

-- ── ①.e LE RATTRAPAGE RÉPÉTÉ NE RETOUCHE PERSONNE ─────────────────────────
-- ⛔ C'EST LA MOITIÉ « CONSERVATION DES ESSAIS » DE CETTE FAMILLE. Un
-- rattrapage relancé le lendemain sur 1 437 comptes ne doit pas rendre à ceux
-- de la veille un essai neuf de sept jours — ni un identifiant de foyer neuf,
-- qui décrocherait leurs plans déjà écrits.
--
-- ⚠️ LA RELANCE SEULE NE PROUVERAIT RIEN: la boucle exclut déjà les comptes
-- rattachés, donc elle ne les touche pas — un test qui se contente de relancer
-- reste vert même si la primitive écrasait tout. On éprouve donc les DEUX
-- pièces séparément: le filtre, puis l'idempotence sur une échéance
-- RECONNAISSABLE.

insert into t_probe select '① la boucle exclut les comptes déjà rattachés',
  p.prosrc ~ 'not exists\s*\(\s*select 1 from public\.household_members hm where hm\.user_id = u\.id\s*\)',
  'filtre `not exists` de la requête de page'
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'keel_backfill_personal_households';

-- Une échéance qu'un rattrapage neuf ne pourrait pas produire.
update public.households set free_until = date '2019-03-04'
 where id = public.keel_household_of('00000000-0000-4000-8000-000000000101');

create temporary table t_idem as
  select public.keel__ensure_personal_household(
    '00000000-0000-4000-8000-000000000101') as r;

insert into t_probe select '① la primitive rend un rattaché INTACT (created=false)',
  not (select (r->>'created')::boolean from t_idem)
  and (select (r->>'household_id')::uuid from t_idem)
     = public.keel_household_of('00000000-0000-4000-8000-000000000101'),
  (select r::text from t_idem);

-- ⛔ LE CAS QUI COMPTE: sept jours neufs vaudraient `current_date + 7`.
insert into t_probe select '① …et elle NE TOUCHE PAS l''échéance (2019 survit)',
  (select h.free_until from public.households h
    where h.id = public.keel_household_of('00000000-0000-4000-8000-000000000101'))
  = date '2019-03-04',
  format('rendue=%s (un essai neuf aurait donné %s)',
    (select h.free_until from public.households h
      where h.id = public.keel_household_of('00000000-0000-4000-8000-000000000101')),
    current_date + public.keel_household_trial_days());

insert into t_probe select '① relance: toujours une seule appartenance chacun',
  (select count(*) from public.household_members
    where user_id in ('00000000-0000-4000-8000-000000000101',
                      '00000000-0000-4000-8000-000000000102')) = 2,
  format('lignes=%s', (select count(*) from public.household_members
    where user_id in ('00000000-0000-4000-8000-000000000101',
                      '00000000-0000-4000-8000-000000000102')));

-- ── ①.f LA PAGE EST BORNÉE, ET LE ZÉRO NE VIDE PAS LA BASE ────────────────
-- `greatest(1, least(coalesce(p_limit, 100), 1000))`: un `0` reçu d'un script
-- ne doit ni tout traiter, ni ne rien traiter en silence.
insert into t_probe select '① `p_limit = 0` est ramené à 1, pas à « tout »',
  (public.keel_backfill_personal_households(0, true)->>'vus')::int = 1,
  public.keel_backfill_personal_households(0, true)::text;

-- ══════════════════════════════════════════════════════════════════════════
-- ② DEUX `ENSURE` SIMULTANÉS — ce qu'une transaction annulée peut prouver
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ LA VRAIE CONCURRENCE N'EST PAS ÉPROUVABLE ICI, ET LE PRÉTENDRE SERAIT UN
-- MENSONGE: deux sessions Postgres ne partagent pas une transaction non
-- commitée. Ce qui est éprouvé, ce sont les DEUX pièces qui, ensemble, ferment
-- la faute « deux appels lisent “aucun foyer” »:
--   · le verrou consultatif est pris AVANT la lecture — sinon il n'empêche rien;
--   · l'index unique MORD — c'est la ceinture, celle qui reste si le verrou saute.
-- Le cas séquentiel (deux appels, mêmes identifiants) est déjà couvert:
-- `personal_household_test.sql` ②.

insert into t_probe select '② le verrou est pris AVANT la lecture du siège',
  strpos(p.prosrc, 'pg_advisory_xact_lock') > 0
  and strpos(p.prosrc, 'hm.user_id = p_user') > 0
  and strpos(p.prosrc, 'pg_advisory_xact_lock') < strpos(p.prosrc, 'hm.user_id = p_user'),
  format('verrou@%s lecture@%s',
         strpos(p.prosrc, 'pg_advisory_xact_lock'),
         strpos(p.prosrc, 'hm.user_id = p_user'))
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'keel__ensure_personal_household';

-- LA CEINTURE MORD: une seconde appartenance pour le MÊME compte est refusée
-- par l'index, pas par la politesse de l'appelant.
do $$
begin
  insert into public.household_members (household_id, user_id, role, first_name)
  values (public.keel_household_of('00000000-0000-4000-8000-000000000102'),
          '00000000-0000-4000-8000-000000000101', 'member', 'Doublon');
  insert into t_probe values ('② index unique: MORD sur une double appartenance',
    false, 'la seconde appartenance a été ACCEPTÉE');
exception when unique_violation then
  insert into t_probe values ('② index unique: MORD sur une double appartenance',
    true, sqlerrm);
end $$;

-- ⚠️ ET LE CAS QUI PASSE, sans lequel le précédent ressemblerait à une garde
-- qui marche alors qu'elle bloque tout: deux BOUCHES SANS COMPTE dans le même
-- foyer sont parfaitement légitimes, et l'index (sur `user_id`, donc muet sur
-- les `null`) les laisse passer toutes les deux.
do $$
begin
  insert into public.household_members (household_id, user_id, role, first_name)
  values (public.keel_household_of('00000000-0000-4000-8000-000000000102'),
          null, 'member', 'Bouche A'),
         (public.keel_household_of('00000000-0000-4000-8000-000000000102'),
          null, 'member', 'Bouche B');
  insert into t_probe values ('② et il LAISSE PASSER deux bouches sans compte',
    true, 'deux lignes user_id null acceptées');
exception when others then
  insert into t_probe values ('② et il LAISSE PASSER deux bouches sans compte',
    false, sqlerrm);
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- ③ L'INVITATION DEPUIS UN FOYER PERSONNEL QUI PORTE UN PLAN
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⛔ LA BRANCHE `vide_conserve` DE `keel_household_join`, QUE RIEN N'ATTEIGNAIT.
-- `student_generated_meals.household_id` est en NO ACTION: le `delete from
-- households` de la porte d'invitation lève `foreign_key_violation` dès que le
-- foyer personnel porte un plan. La fonction rattrape l'erreur — mais personne
-- ne l'avait jamais fait lever. Sans ce cas, la première personne du produit
-- qui a composé UN plan avant d'être invitée reçoit un 500 sur « Rejoindre ».
--
-- Le jumeau — foyer personnel VIDE, donc supprimé — est
-- `personal_household_lifecycle_test.sql` ①. Ici on éprouve les deux moitiés
-- côte à côte: `0202` a composé, `0203` non.

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data,
                        created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000201',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'lot8.hote@keeltest.dev', '{"full_name":"Hugo Hote"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000202',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'lot8.avecplan@keeltest.dev', '{"full_name":"Iris AvecPlan"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000203',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'lot8.sansplan@keeltest.dev', '{"full_name":"Jo SansPlan"}'::jsonb, now(), now());

update public.profiles set country = 'FR'
 where id in ('00000000-0000-4000-8000-000000000201',
              '00000000-0000-4000-8000-000000000202',
              '00000000-0000-4000-8000-000000000203');

create temporary table t_foyers as select
  public.keel_household_of('00000000-0000-4000-8000-000000000201') as hote,
  public.keel_household_of('00000000-0000-4000-8000-000000000202') as avec_plan,
  public.keel_household_of('00000000-0000-4000-8000-000000000203') as sans_plan;

-- ⚠️ LE PLAN PASSE PAR LA VRAIE RPC D'ÉCRITURE, pas par un `insert` à la main:
-- c'est elle qui pose `household_id` et `plan_kind`, et un décor qui les
-- écrirait lui-même pourrait rater justement la colonne qui retient le foyer.
create temporary table t_plan as
  select w.meal_id from public.write_student_meal_plan(
    '00000000-0000-4000-8000-000000000202'::uuid,
    'prepare_next', current_date + 60, 2::smallint,
    jsonb_build_object(
      'plan_kind', 'household',
      'household_id', (select avec_plan from t_foyers),
      'mode', 'to_shop')) w;

insert into t_probe select '⓪ prémisse: le foyer personnel PORTE un plan',
  (select count(*) from public.student_generated_meals
    where household_id = (select avec_plan from t_foyers)) = 1,
  (select meal_id::text from t_plan);

-- Deux bouches libres chez l'hôte, et deux invitations.
insert into public.household_members (member_id, household_id, user_id, role, first_name)
values
  ('00000000-0000-4000-8000-0000000002a2', (select hote from t_foyers), null, 'member', 'Iris'),
  ('00000000-0000-4000-8000-0000000002a3', (select hote from t_foyers), null, 'member', 'Jo');

insert into public.household_invitations
  (household_id, email, token_hash, invited_by, expires_at, member_id)
values
  ((select hote from t_foyers), 'lot8.avecplan@keeltest.dev',
   public.coach_invite_token_hash('jeton-lot8-avecplan'),
   '00000000-0000-4000-8000-000000000201', now() + interval '7 days',
   '00000000-0000-4000-8000-0000000002a2'),
  ((select hote from t_foyers), 'lot8.sansplan@keeltest.dev',
   public.coach_invite_token_hash('jeton-lot8-sansplan'),
   '00000000-0000-4000-8000-000000000201', now() + interval '7 days',
   '00000000-0000-4000-8000-0000000002a3');

-- ── ③.a CELLE QUI A COMPOSÉ ───────────────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000202","role":"authenticated"}', true);
create temporary table t_join_plan as
  select public.keel_household_join('jeton-lot8-avecplan', 'FR') as r;

insert into t_probe select '③ un plan déjà composé ne BLOQUE PAS l''invitation',
  coalesce((r->>'ok')::boolean, false), r::text from t_join_plan;

insert into t_probe select '③ elle est bien chez l''hôte, une seule fois',
  public.keel_household_of('00000000-0000-4000-8000-000000000202')
    = (select hote from t_foyers)
  and (select count(*) from public.household_members
        where user_id = '00000000-0000-4000-8000-000000000202') = 1,
  coalesce(public.keel_household_of('00000000-0000-4000-8000-000000000202')::text, '(aucun)');

-- ⛔ LE FOYER VIDÉ SURVIT, PARCE QU'IL PORTE ENCORE L'HISTORIQUE. C'est la
-- branche `vide_conserve`, et c'est la bonne direction: un `on delete cascade`
-- aurait effacé le plan de quelqu'un au moment où il accepte une invitation.
insert into t_probe select '③ le foyer personnel SURVIT (il porte le plan)',
  (select count(*) from public.households where id = (select avec_plan from t_foyers)) = 1,
  format('restant=%s',
    (select count(*) from public.households where id = (select avec_plan from t_foyers)));

insert into t_probe select '③ …et il ne porte plus AUCUNE bouche',
  (select count(*) from public.household_members
    where household_id = (select avec_plan from t_foyers)) = 0,
  format('bouches=%s', (select count(*) from public.household_members
    where household_id = (select avec_plan from t_foyers)));

-- ⛔ ET LE PLAN N'EST PAS DÉMÉNAGÉ. Le repointer sur le foyer d'accueil le
-- rendrait lisible par tout le foyer (`student_generated_meals_household_read`),
-- c'est-à-dire par des gens qui n'existaient pas quand il a été composé.
insert into t_probe select '③ le plan reste attaché à SON foyer d''origine',
  (select household_id from public.student_generated_meals
    where id = (select meal_id from t_plan)) = (select avec_plan from t_foyers),
  format('plan→%s hôte=%s',
    (select household_id from public.student_generated_meals
      where id = (select meal_id from t_plan)),
    (select hote from t_foyers));

-- ── ③.b CELUI QUI N'A RIEN COMPOSÉ: LE FOYER PART ─────────────────────────
-- ⚠️ LA MOITIÉ QUI PASSE. Sans elle, « le foyer survit » ressemblerait à une
-- suppression qui ne marche jamais.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000203","role":"authenticated"}', true);
create temporary table t_join_sans as
  select public.keel_household_join('jeton-lot8-sansplan', 'FR') as r;

insert into t_probe select '③ sans plan: l''invitation passe aussi',
  coalesce((r->>'ok')::boolean, false), r::text from t_join_sans;

insert into t_probe select '③ sans plan: le foyer personnel vidé est SUPPRIMÉ',
  (select count(*) from public.households where id = (select sans_plan from t_foyers)) = 0,
  format('restant=%s',
    (select count(*) from public.households where id = (select sans_plan from t_foyers)));

-- ══════════════════════════════════════════════════════════════════════════
-- ④ LE DÉPART SANS ÉCHÉANCE RANGÉE — la branche `else` du même garde
-- ══════════════════════════════════════════════════════════════════════════
--
-- `keel_household_detach_member` / `_remove_member` reposent l'échéance
-- `personal_free_until` « quand on la connaît ». Le cas CONNU est couvert par
-- `personal_household_departure_test.sql` ②③. Le cas INCONNU — une ligne
-- écrite avant 20260910196000, ou une bouche réclamée par un chemin qui ne
-- range rien — ne l'était pas, et c'est lui qui décide si un compte de 2026
-- ressort avec un essai ou avec un mur.

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000201","role":"authenticated"}', true);

-- On efface l'échéance rangée à l'arrivée: c'est exactement l'état d'une ligne
-- d'avant le lot.
update public.household_members set personal_free_until = null
 where member_id = '00000000-0000-4000-8000-0000000002a2';

insert into t_probe select '⓪ prémisse: aucune échéance rangée sur la ligne',
  (select personal_free_until from public.household_members
    where member_id = '00000000-0000-4000-8000-0000000002a2') is null, '';

create temporary table t_det as
  select public.keel_household_detach_member(
    '00000000-0000-4000-8000-0000000002a2') as r;

insert into t_probe select '④ détachement accepté',
  coalesce((r->>'ok')::boolean, false), r::text from t_det;

insert into t_probe select '④ elle a de nouveau UN foyer, un seul',
  (select count(*) from public.household_members
    where user_id = '00000000-0000-4000-8000-000000000202') = 1
  and public.keel_household_of('00000000-0000-4000-8000-000000000202') is not null,
  coalesce(public.keel_household_of('00000000-0000-4000-8000-000000000202')::text, '(aucun)');

-- ⛔ SANS ÉCHÉANCE CONNUE, C'EST LE DÉFAUT QUI S'APPLIQUE — sept jours. Ni
-- `NULL` (couvert POUR TOUJOURS), ni une date passée (un mur immédiat pour
-- quelqu'un qu'on vient de sortir d'un foyer).
insert into t_probe select '④ échéance inconnue ⇒ le DÉFAUT (7 j), pas NULL',
  (select h.free_until from public.households h
    where h.id = public.keel_household_of('00000000-0000-4000-8000-000000000202'))
  = current_date + public.keel_household_trial_days(),
  format('rendue=%s attendu=%s',
    (select h.free_until from public.households h
      where h.id = public.keel_household_of('00000000-0000-4000-8000-000000000202')),
    current_date + public.keel_household_trial_days());

-- ⚠️ ET LE PLAN D'AVANT NE LA SUIT PAS. Le foyer rendu est NEUF: l'historique
-- reste sur l'ancien foyer personnel, lisible par son auteur et par personne
-- d'autre. C'est éprouvé côté droits dans `lot8_autorisation_test.sql` ①.
insert into t_probe select '④ le foyer rendu est NEUF, pas celui d''avant',
  public.keel_household_of('00000000-0000-4000-8000-000000000202')
    is distinct from (select avec_plan from t_foyers),
  format('rendu=%s ancien=%s',
    public.keel_household_of('00000000-0000-4000-8000-000000000202'),
    (select avec_plan from t_foyers));

-- ══════════════════════════════════════════════════════════════════════════
-- ⑤ CE QUE LA SUPPRESSION D'UN COMPTE LAISSE DERRIÈRE ELLE
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⛔⛔ CETTE SECTION ÉPINGLE UN FAIT, PAS UNE PROPRIÉTÉ VOULUE — voir le
-- rapport de lot. Avant le lot 1, un compte seul n'avait PAS de foyer: le
-- supprimer ne laissait rien. Depuis le lot 1, il en a un, et rien ne
-- l'emporte: `keel_household_purge_user` DÉTACHE (`user_id = null`) au lieu de
-- supprimer, et `household_members_user_id_fkey` est en `on delete set null`.
-- Le foyer `personal_auto` d'un compte effacé survit donc, avec une bouche
-- « maître » sans compte, pour toujours.
--
-- ⚠️ CE N'EST PAS UNE FUITE DE LECTURE: plus aucun compte n'est membre, donc
-- aucune politique RLS ne rend ces lignes à qui que ce soit. C'est un résidu.
-- Le jour où quelqu'un décide de le nettoyer, CE CAS ROUGIT — et c'est le
-- signal de le supprimer, pas de le contourner.

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data,
                        created_at, updated_at)
values ('00000000-0000-4000-8000-000000000401',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'lot8.efface@keeltest.dev', '{"full_name":"Kim Efface"}'::jsonb, now(), now());

create temporary table t_solo as
  select public.keel_household_of('00000000-0000-4000-8000-000000000401') as h;

insert into t_probe select '⓪ prémisse: le compte seul a bien un foyer personnel',
  (select h from t_solo) is not null, coalesce((select h::text from t_solo), '(aucun)');

create temporary table t_purge as
  select public.keel_household_purge_user(
    '00000000-0000-4000-8000-000000000401') as r;

insert into t_probe select '⑤ la purge DÉTACHE le maître, elle ne le retire pas',
  (select r->>'action' from t_purge) = 'detached', (select r::text from t_purge);

select public.purge_auth_user('00000000-0000-4000-8000-000000000401');

insert into t_probe select '⑤ le compte est bien parti',
  not exists (select 1 from auth.users
               where id = '00000000-0000-4000-8000-000000000401'), '';

-- ⛔ LE RÉSIDU, NOMMÉ. Si ce cas rougit un jour, c'est que le nettoyage existe.
insert into t_probe select '⑤ ⚠️ RÉSIDU: le foyer personnel SURVIT au compte',
  (select count(*) from public.households where id = (select h from t_solo)) = 1
  and (select count(*) from public.household_members
        where household_id = (select h from t_solo) and user_id is null
          and role = 'owner') = 1,
  format('foyers=%s bouches orphelines=%s',
    (select count(*) from public.households where id = (select h from t_solo)),
    (select count(*) from public.household_members
      where household_id = (select h from t_solo)));

-- ── LE VERDICT ─────────────────────────────────────────────────────────────
select case when ok then '  OK  ' else ' ÉCHEC' end as verdict, name, detail
from t_probe order by name;

do $$ declare n integer; begin
  select count(*) into n from t_probe where not ok;
  if n > 0 then raise exception 'LOT 8 · identité · % cas en échec', n; end if;
  raise notice 'LOT 8 · identité/SQL: tous les cas passent';
end $$;

rollback;
