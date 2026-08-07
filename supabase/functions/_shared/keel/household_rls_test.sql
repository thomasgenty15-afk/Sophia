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
public.keel_household_create('Maison', 'family'));

select pg_temp.become_super();
-- Les trois autres rejoignent. On insère l'appartenance en direct SOUS
-- postgres: le chemin d'invitation est testé séparément (12/13), et le monter
-- ici à coups de jetons rendrait ce bloc illisible.
insert into public.household_members (household_id, user_id, role)
select h.id, u, 'member'
from public.households h,
     unnest(array[
       'f0ed0000-0000-0000-0000-000000000002'::uuid,
       'f0ed0000-0000-0000-0000-000000000003'::uuid,
       'f0ed0000-0000-0000-0000-000000000004'::uuid
     ]) as u
where h.created_by = 'f0ed0000-0000-0000-0000-000000000001';

-- Le foyer VOISIN, celui que l'intrus habite.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000005');
select pg_temp.assert_ok('02 création du foyer voisin',
public.keel_household_create('Ailleurs', 'shared'));

-- ---------------------------------------------------------------------------
-- 1–3. Ce qui se lit, et par qui
-- ---------------------------------------------------------------------------

select pg_temp.become('f0ed0000-0000-0000-0000-000000000002');
select pg_temp.assert_eq('03 un membre lit son foyer',
  (select count(*) from public.households), 1);
select pg_temp.assert_eq('04 un membre lit les 4 membres',
  (select count(*) from public.household_members), 4);

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
-- 5–9, 11. LES GARDES DE RESTRICTION — le cœur de §8.5
-- ---------------------------------------------------------------------------

-- 6. Un membre non-owner ne restreint personne, même un mineur.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000002');
select pg_temp.assert_refused('11 non-owner ne restreint pas',
  public.keel_household_add_restriction(
    'f0ed0000-0000-0000-0000-000000000003', 'nutella'), 'not_owner');

-- 5. Hors mode famille, AUCUN verrouillage — c'est le compte maître du foyer
-- « shared » qui essaie, sur lui-même faute d'autre membre: même en étant
-- owner, le mode suffit à refuser.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000005');
select pg_temp.assert_refused('12 mode partagé: aucune restriction',
  public.keel_household_add_restriction(
    'f0ed0000-0000-0000-0000-000000000005', 'nutella'), 'not_a_family');

select pg_temp.become('f0ed0000-0000-0000-0000-000000000001');

-- 7. Un MAJEUR sans consentement n'est pas restreignable.
select pg_temp.assert_refused('13 majeur sans accord: refusé',
  public.keel_household_add_restriction(
    'f0ed0000-0000-0000-0000-000000000002', 'nutella'), 'adult_without_consent');

-- 11. Date de naissance ABSENTE = traité MAJEUR. La direction est
-- contre-intuitive et c'est pour ça qu'elle est testée: « on ne sait pas » ne
-- doit pas donner au compte maître un pouvoir qu'on ne lui a pas accordé.
select pg_temp.assert_refused('14 date absente: traité majeur, refusé',
  public.keel_household_add_restriction(
    'f0ed0000-0000-0000-0000-000000000004', 'nutella'), 'adult_without_consent');

-- 8. Un MINEUR l'est.
select pg_temp.assert_ok('15 mineur: autorisé',
public.keel_household_add_restriction(
    'f0ed0000-0000-0000-0000-000000000003', 'nutella'));

-- 9. Un majeur CONSENTANT l'est. Le consentement se pose par lui, jamais par
-- le compte maître: la RPC n'a aucun paramètre.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000002');
select pg_temp.assert_ok('16 le majeur pose son accord',
public.keel_household_grant_consent());

select pg_temp.become('f0ed0000-0000-0000-0000-000000000001');
select pg_temp.assert_ok('17 majeur consentant: autorisé',
public.keel_household_add_restriction(
    'f0ed0000-0000-0000-0000-000000000002', 'chips'));

-- §8.5 règle 3: la personne restreinte VOIT qu'elle l'est, et par qui.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000002');
select pg_temp.assert_eq('18 le restreint voit sa restriction et son auteur',
  (select count(*) from public.household_food_restrictions
    where member_user_id = 'f0ed0000-0000-0000-0000-000000000002'
      and created_by = 'f0ed0000-0000-0000-0000-000000000001'), 1);

-- ---------------------------------------------------------------------------
-- 10. LA RÉVOCATION SUPPRIME CE QUI EXISTE DÉJÀ
--
-- L'assertion la plus importante du fichier. Ne retirer que le droit de poser
-- de NOUVELLES restrictions laisserait toutes les anciennes en place — un
-- retrait de consentement sans effet, c'est-à-dire pire qu'un consentement
-- jamais demandé.
-- ---------------------------------------------------------------------------

select pg_temp.assert_eq('19 la révocation supprime 1 restriction déjà posée',
  (public.keel_household_revoke_consent()->>'restrictions_removed')::bigint, 1);

select pg_temp.assert_eq('20 plus aucune restriction ne vise ce majeur',
  (select count(*) from public.household_food_restrictions
    where member_user_id = 'f0ed0000-0000-0000-0000-000000000002'), 0);

-- Et le mineur, lui, n'est pas affecté: la révocation est PAR PERSONNE.
select pg_temp.assert_eq('21 la restriction du mineur survit',
  (select count(*) from public.household_food_restrictions
    where member_user_id = 'f0ed0000-0000-0000-0000-000000000003'), 1);

-- Le compte maître ne peut plus reposer la restriction sur ce majeur.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000001');
select pg_temp.assert_refused('22 après révocation: refusé de nouveau',
  public.keel_household_add_restriction(
    'f0ed0000-0000-0000-0000-000000000002', 'chips'), 'adult_without_consent');

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
