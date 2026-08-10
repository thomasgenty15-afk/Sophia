-- ============================================================================
-- KEEL — LE FOYER: test négatif des policies et des gardes de restriction
--
-- MANUEL, comme `tenancy_rls_test.sql`. C'est un script psql et pas un test
-- deno, parce que la chose testée est le moteur de policies de Postgres: un
-- client qui contournerait `set local role` ne testerait rien du tout.
--
--   docker cp supabase/functions/_shared/keel/household_rls_test.sql \
--     supabase_db_Sophia_2:/tmp/household_rls_test.sql
--   docker exec supabase_db_Sophia_2 psql -U postgres -d postgres \
--     -f /tmp/household_rls_test.sql
--
-- Tout tourne dans UNE transaction qui finit par ROLLBACK: la base est laissée
-- exactement telle qu'on l'a trouvée. C'est non négociable ici — la base
-- locale est partagée avec d'autres sessions.
--
-- CE QUI EST AFFIRMÉ
--   1. un membre lit son foyer                                  -> 1
--   2. un intrus ne lit RIEN du foyer voisin                    -> 0 partout
--   3. `anon` ne lit rien, nulle part                            -> 0
--   4. personne n'ÉCRIT en direct (tout passe par les RPC)       -> refusé
--   5. hors mode famille, aucune restriction n'est possible      -> not_a_family
--   6. un membre non-owner ne restreint personne                 -> not_owner
--   7. un MAJEUR sans consentement n'est pas restreignable       -> adult_without_consent
--   8. un MINEUR l'est                                           -> ok
--   9. un majeur CONSENTANT l'est                                -> ok
--  10. LA RÉVOCATION SUPPRIME LES RESTRICTIONS DÉJÀ POSÉES       -> 1 supprimée
--  11. une date de naissance ABSENTE = traité majeur             -> refusé sans accord
--  12. le jeton d'invitation est à USAGE UNIQUE                  -> already_used
--  13. un jeton qui fuite ne sert à personne d'autre             -> email_mismatch
--  14. la composition du foyer se lit par tout le foyer          -> 1
--  15. une composition SANS foyer reste privée à son auteur      -> 0
--
-- Chaque assertion RAISE en cas d'écart: un vert silencieux sur une policy
-- cassée est le seul résultat que ce fichier existe pour empêcher.
-- ============================================================================

begin;

create or replace function pg_temp.assert_eq(label text, got bigint, want bigint)
returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAIL % : got %, want %', label, got, want;
  end if;
  raise notice 'PASS % (%)', label, got;
end;
$$;

-- DEUX helpers et pas un seul, parce qu'un succès n'a PAS de clé `reason`:
-- une assertion « reason is null » passerait donc aussi sur une réponse
-- malformée qui n'aurait ni `ok` ni `reason`. On affirme séparément ce qui
-- réussit et ce qui échoue, avec le motif exact du refus.
create or replace function pg_temp.assert_ok(label text, got jsonb)
returns void language plpgsql as $$
begin
  if coalesce((got->>'ok')::boolean, false) is not true then
    raise exception 'FAIL % : attendu ok=true, reçu %', label, got;
  end if;
  raise notice 'PASS % (ok)', label;
end;
$$;

create or replace function pg_temp.assert_refused(label text, got jsonb, want text)
returns void language plpgsql as $$
begin
  if coalesce((got->>'ok')::boolean, true) is not false then
    raise exception 'FAIL % : attendu un REFUS, reçu %', label, got;
  end if;
  if coalesce(got->>'reason', '') is distinct from want then
    raise exception 'FAIL % : reason=%, want %', label, got->>'reason', want;
  end if;
  raise notice 'PASS % (refus: %)', label, want;
end;
$$;

create or replace function pg_temp.become(who uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', who, 'role', 'authenticated')::text,
                     true);
  execute 'set local role authenticated';
end;
$$;

create or replace function pg_temp.become_anon()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
end;
$$;

create or replace function pg_temp.become_super()
returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Herméticité vis-à-vis des voisins.
--
-- La base locale est PARTAGÉE. On préfixe donc tous les uuid de fixture par
-- `f0ed` — pas les `aaaaaaaa-…0001` du dépôt, qui sont l'aimant à collision
-- documenté dans `tenancy_rls_test.sql`. Les suppressions sont DANS la
-- transaction qui finit par ROLLBACK.
-- ---------------------------------------------------------------------------

delete from public.household_members where user_id in (
  'f0ed0000-0000-0000-0000-000000000001','f0ed0000-0000-0000-0000-000000000002',
  'f0ed0000-0000-0000-0000-000000000003','f0ed0000-0000-0000-0000-000000000004',
  'f0ed0000-0000-0000-0000-000000000005','f0ed0000-0000-0000-0000-000000000009');

insert into auth.users (id, email, instance_id, aud, role)
values
  ('f0ed0000-0000-0000-0000-000000000001','nightfoyer_owner@example.com',
   '00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('f0ed0000-0000-0000-0000-000000000002','nightfoyer_adult@example.com',
   '00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('f0ed0000-0000-0000-0000-000000000003','nightfoyer_kid@example.com',
   '00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('f0ed0000-0000-0000-0000-000000000004','nightfoyer_nobirth@example.com',
   '00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('f0ed0000-0000-0000-0000-000000000005','nightfoyer_intruder@example.com',
   '00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('f0ed0000-0000-0000-0000-000000000009','nightfoyer_invitee@example.com',
   '00000000-0000-0000-0000-000000000000','authenticated','authenticated')
on conflict (id) do nothing;

-- `profiles.locale` a un DÉFAUT fr-FR: une fixture qui ne l'écrit pas ment sur
-- la langue. On l'écrit, même si ce test ne lit pas de langue.
insert into public.profiles (id, email, locale, birth_date)
values
  ('f0ed0000-0000-0000-0000-000000000001','nightfoyer_owner@example.com','en-US','1985-04-02'),
  ('f0ed0000-0000-0000-0000-000000000002','nightfoyer_adult@example.com','en-US','1990-06-11'),
  ('f0ed0000-0000-0000-0000-000000000003','nightfoyer_kid@example.com','en-US','2014-03-20'),
  -- PAS de birth_date: le cas « on ne sait pas », qui doit être traité MAJEUR.
  ('f0ed0000-0000-0000-0000-000000000004','nightfoyer_nobirth@example.com','en-US',null),
  ('f0ed0000-0000-0000-0000-000000000005','nightfoyer_intruder@example.com','en-US','1980-01-01'),
  ('f0ed0000-0000-0000-0000-000000000009','nightfoyer_invitee@example.com','en-US','1988-09-09')
on conflict (id) do update
  set email = excluded.email, birth_date = excluded.birth_date;

-- ---------------------------------------------------------------------------
-- Le foyer FAMILLE, monté par ses propres RPC (donc au JWT, jamais en direct).
-- ---------------------------------------------------------------------------

select pg_temp.become('f0ed0000-0000-0000-0000-000000000001');
select pg_temp.assert_ok('01 création du foyer famille',
public.keel_household_create('Maison'));

select pg_temp.become_super();
-- Les trois autres rejoignent. On insère l'appartenance en direct SOUS
-- postgres: le chemin d'invitation est testé séparément (12/13), et le monter
-- ici à coups de jetons rendrait ce bloc illisible.
insert into public.household_members
  (household_id, user_id, role, first_name, birth_date)
select h.id, m.u, 'member', m.n, m.b
from public.households h,
     (values
       ('f0ed0000-0000-0000-0000-000000000002'::uuid, 'Adulte', '1990-06-11'::date),
       ('f0ed0000-0000-0000-0000-000000000003'::uuid, 'Enfant', '2014-03-20'::date),
       -- PAS DE DATE: le cas « on ne sait pas ». Il vaut désormais `unknown`,
       -- et surtout PLUS `adult` — c'est l'inversion du lot 2.
       ('f0ed0000-0000-0000-0000-000000000004'::uuid, 'Sansage', null)
     ) as m(u, n, b)
where h.created_by = 'f0ed0000-0000-0000-0000-000000000001';

-- ── LA BOUCHE SANS COMPTE, par sa propre RPC ────────────────────────────────
-- C'est le geste que tout le chantier existe pour permettre, et il passe par le
-- JWT du compte maître comme n'importe quelle écriture du foyer.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000001');
select pg_temp.assert_ok('01b une bouche SANS COMPTE est ajoutée',
public.keel_household_add_member('Lea', '2018-05-04', null));
select pg_temp.become_super();

-- Le foyer VOISIN, celui que l'intrus habite.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000005');
select pg_temp.assert_ok('02 création du foyer voisin',
public.keel_household_create('Ailleurs'));

-- ---------------------------------------------------------------------------
-- 1–3. Ce qui se lit, et par qui
-- ---------------------------------------------------------------------------

select pg_temp.become('f0ed0000-0000-0000-0000-000000000002');
select pg_temp.assert_eq('03 un membre lit son foyer',
  (select count(*) from public.households), 1);
-- CINQ, et la cinquième est le sujet: Léa n'a pas de compte, et elle est
-- pourtant une ligne de plein droit que tout le foyer lit. Un roster qui ne
-- rendrait que les comptes rendrait 4 — et la moitié du foyer serait invisible
-- au chat comme au générateur.
select pg_temp.assert_eq('04 un membre lit les 5 bouches, compte ou pas',
  (select count(*) from public.household_members), 5);

-- L'INTRUS. Il a son propre foyer, donc `keel_household_of` lui rend quelque
-- chose — ce qui est exactement le cas piégeux: une policy qui aurait comparé
-- « non nul » au lieu de « égal » le laisserait tout lire.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000005');
select pg_temp.assert_eq('05 l''intrus ne voit que SON foyer',
  (select count(*) from public.households), 1);
select pg_temp.assert_eq('06 l''intrus ne voit aucun membre du foyer voisin',
  (select count(*) from public.household_members
    where user_id = 'f0ed0000-0000-0000-0000-000000000002'), 0);

-- ANON. La première rédaction affirmait « rend 0 ligne » et c'était trop
-- faible: `anon` n'a même pas le privilège de TABLE, donc la lecture LÈVE.
-- C'est une meilleure propriété — elle survit à quelqu'un qui désactiverait
-- RLS pour déboguer — et c'est donc elle qu'on affirme. Une assertion « 0
-- ligne » serait passée aussi bien sur une table simplement vide.
select pg_temp.become_anon();
do $$
declare r bigint;
begin
  begin
    select count(*) into r from public.households;
    raise exception 'FAIL 07 : anon a pu lire households (% lignes)', r;
  exception when insufficient_privilege then
    raise notice 'PASS 07 anon n''a pas le privilège de lire households';
  end;
end;
$$;
do $$
declare r bigint;
begin
  begin
    select count(*) into r from public.household_envy_submissions;
    raise exception 'FAIL 08 : anon a pu lire les envies (% lignes)', r;
  exception when insufficient_privilege then
    raise notice 'PASS 08 anon n''a pas le privilège de lire les envies';
  end;
end;
$$;

-- Le privilège TABLE lui-même, pas seulement la policy: `revoke from public`
-- ne retire pas `anon`, et une table qui l'aurait gardé serait ouverte le jour
-- où quelqu'un désactive RLS pour déboguer.
select pg_temp.become_super();
select pg_temp.assert_eq('09 anon n''a aucun privilège sur households',
  (select count(*) from (values
     ('households'),('household_members'),('household_invitations'),
     ('household_food_restrictions'),('household_envy_submissions')) t(n)
   where has_table_privilege('anon', 'public.' || t.n, 'SELECT')), 0);

-- ---------------------------------------------------------------------------
-- 4. Aucune écriture directe: tout passe par les RPC
-- ---------------------------------------------------------------------------

-- ⚠️ CE BLOC A TROUVÉ UN VRAI DÉFAUT, et sa forme actuelle vient de là.
--
-- La première rédaction affirmait que l'UPDATE LÈVE. Il ne lève pas: il touche
-- zéro ligne, en silence, parce qu'aucune policy d'UPDATE n'existe. On affirme
-- donc le RÉSULTAT (le rôle n'a pas bougé), qui est ce qui compte, et pas le
-- mécanisme, qui n'est pas celui qu'on croyait.
--
-- Et c'est en creusant ce faux rouge qu'on a mesuré le vrai trou: Supabase
-- accorde TOUT à `authenticated` sur chaque table neuve, `grant select` par
-- dessus n'enlève rien, et **TRUNCATE n'est pas soumis à RLS**. D'où les deux
-- assertions qui suivent — sans elles, la migration partait avec cinq tables
-- que n'importe quel compte connecté pouvait vider.
-- La tentative tolère LES DEUX issues — privilège refusé, ou zéro ligne
-- touchée — parce que ce qui est garanti est le RÉSULTAT, pas la mécanique.
-- Aujourd'hui c'est le privilège qui mord (voir 10b); si un jour une policy
-- d'UPDATE légitime apparaît, ce sera l'absence de colonne autorisée. Dans les
-- deux cas l'assertion suivante doit tenir.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000002');
do $$
begin
  update public.household_members set role = 'owner'
   where user_id = 'f0ed0000-0000-0000-0000-000000000002';
exception when insufficient_privilege then
  null;
end;
$$;
select pg_temp.become_super();
select pg_temp.assert_eq('10 un membre n''a pas pu se promouvoir compte maître',
  (select count(*) from public.household_members
    where user_id = 'f0ed0000-0000-0000-0000-000000000002' and role = 'member'), 1);

select pg_temp.assert_eq('10b authenticated n''a AUCUN privilège d''écriture',
  (select count(*) from (values
     ('households'),('household_members'),('household_invitations'),
     ('household_food_restrictions'),('household_envy_submissions')) t(n),
   unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) as verb
   where has_table_privilege('authenticated', 'public.' || t.n, verb)), 0);

-- TRUNCATE, en conditions réelles. RLS ne le filtre PAS: c'est la seule
-- écriture que l'absence de policy ne protège pas, donc la seule qui exige que
-- le privilège lui-même ait été retiré.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000002');
do $$
begin
  begin
    truncate public.household_envy_submissions cascade;
    raise exception 'FAIL 10c : un membre a pu VIDER la table (TRUNCATE ignore RLS)';
  exception when insufficient_privilege then
    raise notice 'PASS 10c un membre ne peut pas vider la table';
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5–11. LES GARDES DE RESTRICTION — réécrites le 2026-08-10 (lots 1 et 2)
--
-- CE QUI A DISPARU DE CETTE SECTION, ET POURQUOI IL NE FAUT PAS LE REMETTRE:
--
--   « hors mode famille, aucun verrouillage »  → la colocation est sortie du
--     produit, `households.kind` n'existe plus.
--   « un majeur sans consentement n'est pas restreignable » → le consentement
--     n'existe plus. Le compte maître gouverne le menu; LA CONTREPARTIE est que
--     `created_by` reste et que l'écran l'affiche (assertion 18 plus bas).
--   « date absente = traité MAJEUR » → INVERSÉ. Sans date, l'âge vaut
--     `unknown`, et `unknown` n'applique AUCUNE direction d'objectif.
--
-- Ce qui reste est ce qui protège encore vraiment quelque chose: seul le compte
-- maître écrit, seulement dans SON foyer, et la décision porte un auteur.
-- ---------------------------------------------------------------------------

-- 6. Un membre non-owner ne restreint personne.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000002');
select pg_temp.assert_refused('14 un membre ne restreint personne',
  public.keel_household_add_restriction(
    (select member_id from public.household_members
      where user_id = 'f0ed0000-0000-0000-0000-000000000003'), 'nutella'),
  'not_owner');

select pg_temp.become('f0ed0000-0000-0000-0000-000000000001');

-- 5. LE GESTE NOMINAL, ET IL ÉTAIT IMPOSSIBLE AVANT CE LOT: une contrainte sur
-- une bouche SANS COMPTE. `member_user_id references auth.users` rendait la
-- ligne inécrivable — c'est-à-dire que « pas de champignons pour Léa » ne
-- pouvait pas exister pour une Léa de huit ans.
select pg_temp.assert_ok('15 une bouche SANS COMPTE porte une contrainte',
public.keel_household_add_restriction(
    (select member_id from public.household_members
      where household_id = public.keel_household_of('f0ed0000-0000-0000-0000-000000000001')
        and user_id is null and first_name = 'Lea'), 'champignons'));

-- 7. Un majeur du foyer aussi, et sans rien lui demander. C'est le modèle:
-- une seule personne gouverne le menu.
select pg_temp.assert_ok('16 un majeur est restreignable, sans consentement',
public.keel_household_add_restriction(
    (select member_id from public.household_members
      where user_id = 'f0ed0000-0000-0000-0000-000000000002'), 'chips'));

-- 8. Mais PAS quelqu'un d'un AUTRE foyer. La garde qui reste est celle-là.
select pg_temp.assert_refused('17 une bouche d''un autre foyer: refusé',
  public.keel_household_add_restriction(
    (select member_id from public.household_members
      where user_id = 'f0ed0000-0000-0000-0000-000000000005'), 'nutella'),
  'not_a_member');

-- 9. §8.5 règle 3, ET LA CONTREPARTIE DU CONSENTEMENT DISPARU: la personne
-- restreinte voit qu'elle l'est, ET par qui. Sans `created_by`, l'écran
-- n'aurait d'autre choix qu'une phrase impersonnelle — c'est-à-dire faire
-- passer une décision domestique pour un avis du produit.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000002');
select pg_temp.assert_eq('18 le restreint voit sa contrainte et son auteur',
  (select count(*) from public.household_food_restrictions r
    join public.household_members m on m.member_id = r.member_id
    where m.user_id = 'f0ed0000-0000-0000-0000-000000000002'
      and r.created_by = 'f0ed0000-0000-0000-0000-000000000001'), 1);

-- 10. L'ÂGE À TROIS ÉTATS, RELU EN BASE. C'est l'assertion la plus importante
-- de la section: `unknown` et `adult` doivent être DISTINCTS, sinon une bouche
-- saisie sans date reçoit une direction d'objectif d'adulte en silence.
select pg_temp.become_super();
-- `assert_eq` compare des bigint: on compte les lignes dont l'état d'âge est
-- celui attendu. Une comparaison de texte demanderait une seconde surcharge de
-- l'assertion, et une assertion qui existe en deux formes finit par diverger.
select pg_temp.assert_eq('19 un enfant est mineur',
  (select count(*) from public.household_members
    where user_id = 'f0ed0000-0000-0000-0000-000000000003'
      and public.keel_household_member_age(member_id) = 'minor'), 1);
select pg_temp.assert_eq('20 un adulte est adulte',
  (select count(*) from public.household_members
    where user_id = 'f0ed0000-0000-0000-0000-000000000002'
      and public.keel_household_member_age(member_id) = 'adult'), 1);
select pg_temp.assert_eq('21 SANS DATE: unknown, et surtout PAS adult',
  (select count(*) from public.household_members
    where user_id = 'f0ed0000-0000-0000-0000-000000000004'
      and public.keel_household_member_age(member_id) = 'unknown'), 1);
select pg_temp.assert_eq('21b la contre-épreuve: cette bouche n''est PAS adulte',
  (select count(*) from public.household_members
    where user_id = 'f0ed0000-0000-0000-0000-000000000004'
      and public.keel_household_member_age(member_id) = 'adult'), 0);

-- 11. L'OBJECTIF SE POSE PAR SON PROPRIÉTAIRE, OU PAR LE MAÎTRE — et par
-- personne d'autre. C'est la seule autorité que réclamer son profil donne.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000002');
select pg_temp.assert_refused('22 un membre ne pose pas l''objectif d''un autre',
  public.keel_household_set_member_goal(
    (select member_id from public.household_members
      where user_id = 'f0ed0000-0000-0000-0000-000000000003'), 'fat_loss'),
  'not_your_line');
select pg_temp.assert_ok('23 mais il pose LE SIEN',
public.keel_household_set_member_goal(
    (select member_id from public.household_members
      where user_id = 'f0ed0000-0000-0000-0000-000000000002'), 'fat_loss'));

-- Et le plafond de 8 tient EN BASE, pas à l'écran (lot 7).
select pg_temp.become('f0ed0000-0000-0000-0000-000000000001');
do $$
declare v_i int; v_res jsonb;
begin
  -- Le foyer en compte 5 (maître + 3 comptes + Léa). On pousse jusqu'au refus.
  for v_i in 1..5 loop
    v_res := public.keel_household_add_member('Bouche' || v_i, null, null);
    exit when (v_res->>'reason') = 'household_full';
  end loop;
  if (v_res->>'reason') is distinct from 'household_full' then
    raise exception 'FAIL 24 : le plafond de 8 n''a pas mordu (dernier: %)', v_res;
  end if;
  raise notice 'PASS 24 le plafond de 8 mord EN BASE';
end;
$$;

-- ---------------------------------------------------------------------------
-- 12–13. L'INVITATION: usage unique, et liée à une adresse
-- ---------------------------------------------------------------------------

select pg_temp.become('f0ed0000-0000-0000-0000-000000000001');
create temporary table pg_temp_invite on commit drop as
  select public.keel_household_invite('nightfoyer_invitee@example.com') as r;

select pg_temp.assert_ok('23 invitation émise',
(select r from pg_temp_invite));

-- 13. Le jeton qui fuite: un TIERS ne peut pas s'en servir. L'intrus a déjà un
-- foyer, on le sort d'abord pour que le refus vienne bien de l'adresse et non
-- de `already_in_household` — un test qui passe pour la mauvaise raison ne
-- teste rien.
select pg_temp.become_super();
delete from public.household_members
 where user_id = 'f0ed0000-0000-0000-0000-000000000005';

select pg_temp.become('f0ed0000-0000-0000-0000-000000000005');
select pg_temp.assert_refused('24 un jeton volé ne sert à personne d''autre',
  public.keel_household_join((select r->>'token' from pg_temp_invite)),
  'email_mismatch');

-- 12. Usage unique: le bon destinataire l'utilise, puis plus personne.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000009');
select pg_temp.assert_ok('25 le destinataire rejoint',
public.keel_household_join((select r->>'token' from pg_temp_invite)));

select pg_temp.become_super();
delete from public.household_members
 where user_id = 'f0ed0000-0000-0000-0000-000000000009';

select pg_temp.become('f0ed0000-0000-0000-0000-000000000009');
select pg_temp.assert_refused('26 le jeton ne resert pas',
  public.keel_household_join((select r->>'token' from pg_temp_invite)),
  'already_used');

-- ---------------------------------------------------------------------------
-- 14–15. La composition: partagée par le foyer, privée sans foyer
-- ---------------------------------------------------------------------------

select pg_temp.become_super();
insert into public.student_generated_meals
  (user_id, household_id, mode, scope, content_locale, starts_on, duration_days)
select 'f0ed0000-0000-0000-0000-000000000001', h.id, 'to_shop', 'several_days',
       'en-US', current_date, 3
from public.households h
where h.created_by = 'f0ed0000-0000-0000-0000-000000000001';

-- Une composition SANS foyer, par le même auteur.
--
-- ⚠️ DATE DIFFÉRENTE, ET CE N'EST PAS UN DÉTAIL DE FIXTURE.
-- `student_generated_meals_one_live_start_idx` est UNIQUE sur
-- (user_id, starts_on) where retired_at is null: une personne n'a qu'UNE
-- composition vivante par jour de départ. Deux lignes au même `starts_on`
-- pour le même auteur sont donc impossibles par construction — et la
-- conséquence dépasse ce test: une composition de FOYER qui démarre le même
-- jour qu'une composition perso doit RETIRER l'ancienne, jamais s'ajouter à
-- côté. C'est une contrainte que le générateur de foyer doit honorer.
insert into public.student_generated_meals
  (user_id, mode, scope, content_locale, starts_on, duration_days)
values ('f0ed0000-0000-0000-0000-000000000001', 'to_shop', 'day',
        'en-US', current_date + 7, 1);

select pg_temp.become('f0ed0000-0000-0000-0000-000000000002');
select pg_temp.assert_eq('27 le foyer lit la composition du foyer',
  (select count(*) from public.student_generated_meals
    where household_id is not null), 1);
select pg_temp.assert_eq('28 le foyer ne lit PAS la composition perso du maître',
  (select count(*) from public.student_generated_meals
    where household_id is null), 0);

select pg_temp.become('f0ed0000-0000-0000-0000-000000000005');
select pg_temp.assert_eq('29 l''intrus ne lit aucune composition',
  (select count(*) from public.student_generated_meals), 0);

-- ---------------------------------------------------------------------------
-- 16. L'envie: déposée par soi, relue par le foyer, remplacée si redéposée
-- ---------------------------------------------------------------------------

select pg_temp.become('f0ed0000-0000-0000-0000-000000000002');
select pg_temp.assert_ok('30 envie déposée',
public.keel_household_submit_envy(current_date, 'un curry'));
select pg_temp.assert_ok('31 envie redéposée (remplace)',
public.keel_household_submit_envy(current_date, 'plutôt un tajine'));

select pg_temp.become('f0ed0000-0000-0000-0000-000000000001');
select pg_temp.assert_eq('32 une seule envie par personne et par semaine',
  (select count(*) from public.household_envy_submissions
    where user_id = 'f0ed0000-0000-0000-0000-000000000002'), 1);
select pg_temp.assert_eq('33 c''est la DERNIÈRE qui reste',
  (select count(*) from public.household_envy_submissions
    where user_id = 'f0ed0000-0000-0000-0000-000000000002'
      and body = 'plutôt un tajine'), 1);

select pg_temp.become_super();
rollback;
