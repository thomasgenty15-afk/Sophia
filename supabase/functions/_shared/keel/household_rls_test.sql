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
-- CE QUI EST AFFIRMÉ (liste réécrite au lot 4 — l'ancienne décrivait le
-- consentement du majeur et le mode colocation, tous deux sortis du produit)
--   1. un membre lit son foyer, bouches SANS COMPTE comprises    -> 5
--   2. un intrus ne lit RIEN du foyer voisin                     -> 0 partout
--   3. `anon` n'a pas même le PRIVILÈGE de lire                  -> lève
--   4. personne n'ÉCRIT en direct (TRUNCATE compris)             -> refusé
--   5. seul le compte maître restreint, et seulement chez lui    -> not_owner / not_a_member
--   6. une bouche SANS COMPTE est restreignable                  -> ok
--   7. la personne restreinte voit sa contrainte ET son auteur   -> 1
--   8. l'âge a TROIS états, et `unknown` n'est PAS `adult`       -> 1 / 0
--   9. l'objectif se pose par son propriétaire ou par le maître  -> not_your_line / ok
--  10. le plafond de 8 mord EN BASE, pas à l'écran               -> household_full
--  11. le jeton d'invitation est à USAGE UNIQUE                  -> already_used
--  12. un jeton qui fuite ne sert à personne d'autre             -> email_mismatch
--  13. la composition du foyer se lit par tout le foyer          -> 1
--  14. une composition SANS foyer reste privée à son auteur      -> 0
--  15. une ALLERGIE se pose sur une bouche sans compte           -> ok        (lot 4)
--  16. allergie et règle de maison sont dans DEUX tables         -> 0 / 0 / 1 (lot 4)
--  17. le prénom et la date se corrigent, par la bonne personne  -> ok / not_your_line
--  18. poser la date fait passer `unknown` à `adult`             -> 1         (lot 4)
--  19. l'invitation VISE une bouche, et le lien la nomme         -> ok / Lea  (lot 6)
--  20. on n'invite ni une ligne déjà réclamée ni un voisin       -> already_claimed / not_a_member
--  21. `anon` LIT l'invitation, et rien d'autre du foyer         -> valid     (lot 6)
--  22. réclamer ATTACHE: même member_id, rien de perdu           -> 1 / 8     (lot 6)
--  23. un compte déjà logé ailleurs ne réclame pas               -> already_in_household
--  24. le profil réclamé pose SON objectif et RIEN d'autre       -> ok / 4× not_owner
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

-- ⚠️ L'IDENTIFIANT DU VOISIN, CAPTURÉ SOUS POSTGRES — et c'est une correction
-- de fixture, pas une commodité. Les assertions « une bouche d'un AUTRE foyer
-- est refusée » lisaient ce `member_id` sous le JWT du compte maître, à qui RLS
-- ne rend RIEN du foyer d'à côté: le sous-select rendait NULL, la RPC recevait
-- `p_member = null` et refusait « membre inconnu ». Le test passait pour la
-- mauvaise raison — il prouvait qu'un NULL est refusé, pas qu'un identifiant
-- ÉTRANGER l'est. Capturé ici, il est réel.
select pg_temp.become_super();
create temporary table pg_temp_neighbour on commit drop as
  select member_id from public.household_members
   where user_id = 'f0ed0000-0000-0000-0000-000000000005';
-- Créée sous `postgres`, lue sous `authenticated`: sans ce grant, la lecture
-- lève « permission denied » et la fixture meurt au lieu d'affirmer.
grant select on pg_temp_neighbour to authenticated;

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
     ('household_food_restrictions'),('household_envy_submissions'),
     -- LOT 4. Une table neuve donne TOUT à `authenticated` par défaut, et
     -- `revoke from public` ne retire PAS `anon`. Celle-ci porte des allergies
     -- d'enfants: elle ne doit pas être la première à l'oublier.
     ('household_member_allergies')) t(n)
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
     ('household_food_restrictions'),('household_envy_submissions'),
     ('household_member_allergies')) t(n),
   unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) as verb
   where has_table_privilege('authenticated', 'public.' || t.n, verb)), 0);

-- ET LE SERVEUR, LUI, DOIT POUVOIR LIRE. Une table verrouillée si fort que le
-- générateur n'y accède plus rendrait `safety_constraints_unreadable` à chaque
-- composition — c'est-à-dire un fail-closed permanent, qui a exactement la même
-- tête qu'une fonctionnalité absente.
select pg_temp.assert_eq('10d le service_role lit les allergies du foyer',
  (select count(*) from (values ('household_member_allergies')) t(n)
   where has_table_privilege('service_role', 'public.' || t.n, 'SELECT')), 1);

-- Les portes d'écriture du lot 4, côté privilège de FONCTION.
select pg_temp.assert_eq('10e anon n''exécute aucune RPC du lot 4',
  (select count(*) from (values
     ('public.keel_household_add_allergy(uuid,text)'),
     ('public.keel_household_remove_allergy(uuid)'),
     ('public.keel_household_set_member_name(uuid,text)'),
     ('public.keel_household_set_member_birth_date(uuid,date)')) t(f)
   where has_function_privilege('anon', t.f, 'EXECUTE')), 0);
select pg_temp.assert_eq('10f authenticated les exécute toutes les quatre',
  (select count(*) from (values
     ('public.keel_household_add_allergy(uuid,text)'),
     ('public.keel_household_remove_allergy(uuid)'),
     ('public.keel_household_set_member_name(uuid,text)'),
     ('public.keel_household_set_member_birth_date(uuid,date)')) t(f)
   where has_function_privilege('authenticated', t.f, 'EXECUTE')), 4);

-- LOT 6 — LES DEUX PORTES DE LA RÉCLAMATION, ET L'EXCEPTION ASSUMÉE.
-- `revoke from public` NE RETIRE PAS `anon`: chaque fonction neuve est
-- exécutable par tout le monde tant qu'on ne l'a pas révoquée nommément.
select pg_temp.assert_eq('10g anon n''émet ni ne consomme une invitation',
  (select count(*) from (values
     ('public.keel_household_invite(text,uuid)'),
     ('public.keel_household_join(text)')) t(f)
   where has_function_privilege('anon', t.f, 'EXECUTE')), 0);

-- L'EXCEPTION, ET ELLE EST VOULUE: l'aperçu est la SEULE fonction de foyer
-- qu'`anon` exécute, parce que la personne qui ouvre le lien n'a pas encore de
-- compte. Elle ne rend que trois champs déjà détenus par qui tient le lien, et
-- elle ne consomme rien. L'affirmer ici rend le choix VISIBLE plutôt que
-- découvert un jour par un audit.
select pg_temp.assert_eq('10h anon LIT l''aperçu d''invitation, et lui seul',
  (select count(*) from (values
     ('public.keel_household_preview_invitation(text)')) t(f)
   where has_function_privilege('anon', t.f, 'EXECUTE')), 1);

-- ET L'ANCIENNE SIGNATURE EST PARTIE. Deux arités sont deux fonctions: laisser
-- `keel_household_invite(text)` en place garderait vivante une porte qui émet
-- un jeton SANS CIBLE, que la nouvelle réclamation ne saurait pas honorer.
select pg_temp.assert_eq('10i l''invitation sans cible n''existe plus',
  (select count(*) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'keel_household_invite'
     and pg_get_function_identity_arguments(p.oid) = 'text'), 0);

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
    (select member_id from pg_temp_neighbour), 'nutella'),
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
-- 40–49. LES ALLERGIES DU FOYER, ET L'IDENTITÉ QU'ON CORRIGE (lot 4)
--
-- Ce que cette section existe pour empêcher: qu'une allergie posée sur un
-- enfant sans compte n'arrive nulle part, et qu'une règle de maison et une
-- allergie finissent dans la même table — auquel cas le verrou qui EFFACE le
-- « pourquoi » du plat s'appliquerait à une raison médicale.
-- ---------------------------------------------------------------------------

-- 40. Un membre non-owner ne déclare rien pour personne.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000002');
select pg_temp.assert_refused('40 un membre ne déclare pas une allergie',
  public.keel_household_add_allergy(
    (select member_id from public.household_members
      where user_id = 'f0ed0000-0000-0000-0000-000000000003'), 'peanut'),
  'not_owner');

select pg_temp.become('f0ed0000-0000-0000-0000-000000000001');

-- 41. LE GESTE NOMINAL: une allergie sur une bouche SANS COMPTE. C'est
-- littéralement impossible dans `student_safety_constraints`, dont `user_id`
-- est NOT NULL et référence `auth.users`.
select pg_temp.assert_ok('41 une bouche SANS COMPTE porte une allergie',
public.keel_household_add_allergy(
    (select member_id from public.household_members
      where household_id = public.keel_household_of('f0ed0000-0000-0000-0000-000000000001')
        and user_id is null and first_name = 'Lea'), 'arachide'));

-- 42. Pas dans le foyer d'à côté.
select pg_temp.assert_refused('42 une bouche d''un autre foyer: refusé',
  public.keel_household_add_allergy(
    (select member_id from pg_temp_neighbour), 'peanut'),
  'not_a_member');

-- 43. LA SÉPARATION, SUR LA MÊME BOUCHE. Léa porte « champignons » (règle de
-- maison, posée en 15) et « arachide » (allergie, posée en 41). Aucune des deux
-- tables ne contient le libellé de l'autre — c'est ce que deux tables
-- garantissent et qu'une colonne `kind` n'aurait garanti qu'au prix d'un
-- `where` dans chaque lecteur.
select pg_temp.become_super();
select pg_temp.assert_eq('43 la règle de maison n''est PAS une allergie',
  (select count(*) from public.household_member_allergies
    where label = 'champignons'), 0);
select pg_temp.assert_eq('44 l''allergie n''est PAS une règle de maison',
  (select count(*) from public.household_food_restrictions
    where label = 'arachide'), 0);
select pg_temp.assert_eq('45 et les deux existent bien, chacune chez elle',
  (select count(*) from public.household_member_allergies a
    join public.household_food_restrictions r on r.member_id = a.member_id
   where a.label = 'arachide' and r.label = 'champignons'), 1);

-- 46. Le foyer lit ses allergies; l'intrus n'en lit aucune.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000002');
select pg_temp.assert_eq('46 le foyer lit ses allergies',
  (select count(*) from public.household_member_allergies), 1);
select pg_temp.become('f0ed0000-0000-0000-0000-000000000005');
select pg_temp.assert_eq('47 l''intrus ne lit aucune allergie',
  (select count(*) from public.household_member_allergies), 0);

-- 48. Le retrait: seulement chez soi. Un identifiant du foyer voisin ne se
-- supprime pas, et le refus dit `not_found` plutôt que de mentir en `ok`.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000001');
select pg_temp.assert_refused('48 un identifiant inconnu ne se supprime pas',
  public.keel_household_remove_allergy('f0ed0000-0000-0000-0000-0000000000ff'),
  'not_found');

-- ── L'IDENTITÉ D'UNE BOUCHE SE CORRIGE ────────────────────────────────────

-- 49. Le prénom. Sans cette porte, `keel_household_create` fige « Me » pour un
-- compte dont `profiles.full_name` est vide — et ce « Me » part au modèle.
select pg_temp.assert_ok('49 le compte maître corrige un prénom',
public.keel_household_set_member_name(
    (select member_id from public.household_members
      where user_id = 'f0ed0000-0000-0000-0000-000000000003'), 'Enfant2'));
select pg_temp.become_super();
select pg_temp.assert_eq('50 et le prénom a VRAIMENT changé',
  (select count(*) from public.household_members
    where user_id = 'f0ed0000-0000-0000-0000-000000000003'
      and first_name = 'Enfant2'), 1);

-- 51. Un membre non-owner ne renomme pas la ligne d'un autre.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000002');
select pg_temp.assert_refused('51 un membre ne renomme pas un autre',
  public.keel_household_set_member_name(
    (select member_id from public.household_members
      where user_id = 'f0ed0000-0000-0000-0000-000000000003'), 'Pirate'),
  'not_your_line');
select pg_temp.assert_ok('52 mais il renomme LA SIENNE',
public.keel_household_set_member_name(
    (select member_id from public.household_members
      where user_id = 'f0ed0000-0000-0000-0000-000000000002'), 'Adulte2'));

-- 53. La date de naissance. Une date FUTURE est un lapsus de saisie: refusée
-- ici plutôt que devenue un `unknown` silencieux.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000001');
select pg_temp.assert_refused('53 une date future est refusée',
  public.keel_household_set_member_birth_date(
    (select member_id from public.household_members
      where user_id = 'f0ed0000-0000-0000-0000-000000000004'),
    (current_date + 1)),
  'bad_birth_date');

-- 54. ET LA CONSÉQUENCE, QUI EST TOUT L'INTÉRÊT DE LA PORTE: la bouche sans
-- date vaut `unknown`, donc AUCUNE direction d'objectif ne lui est appliquée
-- (`goalApplies`). Poser la date la fait passer à `adult`, ce qui ACTIVE son
-- objectif. Sans cette RPC, l'écran afficherait un champ qui ne fait rien.
select pg_temp.become_super();
select pg_temp.assert_eq('54 avant: la bouche sans date est unknown',
  (select count(*) from public.household_members
    where user_id = 'f0ed0000-0000-0000-0000-000000000004'
      and public.keel_household_member_age(member_id) = 'unknown'), 1);
select pg_temp.become('f0ed0000-0000-0000-0000-000000000001');
select pg_temp.assert_ok('55 le compte maître pose la date',
public.keel_household_set_member_birth_date(
    (select member_id from public.household_members
      where user_id = 'f0ed0000-0000-0000-0000-000000000004'),
    '1992-03-15'));
select pg_temp.become_super();
select pg_temp.assert_eq('56 après: elle est adulte, et son objectif s''applique',
  (select count(*) from public.household_members
    where user_id = 'f0ed0000-0000-0000-0000-000000000004'
      and public.keel_household_member_age(member_id) = 'adult'), 1);

-- ---------------------------------------------------------------------------
-- 12–13 + 60–72. L'INVITATION EST UNE RÉCLAMATION DE PROFIL (lot 6)
--
-- CE QUI A CHANGÉ DE NATURE ICI: `keel_household_join` n'INSÈRE plus une ligne,
-- elle en ATTACHE une. L'invitation vise donc une bouche précise, choisie par
-- le compte maître, et la réclamation ne doit RIEN faire perdre à cette bouche.
--
-- ⚠️ CE QUE CETTE SECTION NE FAIT PLUS, ET POURQUOI C'EST UN RENFORCEMENT:
-- l'ancienne rédaction SORTAIT l'intrus de son foyer avant de lui faire voler
-- un jeton, parce que `already_in_household` était vérifié AVANT l'adresse — le
-- test annonçait « un jeton volé ne sert à personne » et prouvait « un compte
-- déjà logé ne rejoint pas », ce qui n'est pas la même propriété. L'ordre des
-- refus a été inversé dans la RPC; le vol est maintenant testé sur un voleur
-- QUI GARDE SON FOYER, et le motif attendu vient bien de l'adresse.
-- ---------------------------------------------------------------------------

select pg_temp.become('f0ed0000-0000-0000-0000-000000000001');

-- LA CIBLE: Léa, la bouche SANS COMPTE, qui porte déjà une règle de maison
-- (« champignons », posée en 15) et une allergie (« arachide », posée en 41).
-- C'est exactement ce qui doit lui rester après la réclamation.
create temporary table pg_temp_lea on commit drop as
  select member_id from public.household_members
   where household_id = public.keel_household_of('f0ed0000-0000-0000-0000-000000000001')
     and user_id is null and first_name = 'Lea';

create temporary table pg_temp_invite on commit drop as
  select public.keel_household_invite(
    'nightfoyer_invitee@example.com', (select member_id from pg_temp_lea)) as r;

select pg_temp.assert_ok('60 invitation émise POUR UNE BOUCHE',
(select r from pg_temp_invite));

-- 61. Le lien NOMME sa cible. Le maître émet plusieurs invitations dans la même
-- minute; un jeton anonyme est un jeton qu'on envoie à la mauvaise personne.
select pg_temp.assert_eq('61 l''invitation nomme la bouche qu''elle vise',
  (select count(*) from pg_temp_invite where r->>'first_name' = 'Lea'), 1);

-- 62. On n'émet pas un lien MORT: la ligne du maître a déjà un compte.
select pg_temp.assert_refused('62 une ligne déjà réclamée ne s''invite pas',
  public.keel_household_invite('nightfoyer_invitee2@example.com',
    (select member_id from public.household_members
      where user_id = 'f0ed0000-0000-0000-0000-000000000002')),
  'already_claimed');

-- 63. Ni une bouche du foyer d'à côté. Même motif que partout ailleurs:
-- `not_a_member` ne distingue pas « inexistante » de « chez le voisin », sinon
-- la RPC devient un moyen de tester l'existence d'un identifiant.
select pg_temp.assert_refused('63 une bouche d''un autre foyer ne s''invite pas',
  public.keel_household_invite('nightfoyer_invitee2@example.com',
    (select member_id from pg_temp_neighbour)),
  'not_a_member');

-- 64. `anon` LIT L'INVITATION — la seule fonction de foyer qu'il exécute, et
-- c'est son objet: la personne qui ouvre le lien n'a pas encore de compte.
-- Le jeton est lu SOUS postgres puis le rôle bascule, parce qu'`anon` n'a
-- aucun privilège sur une table temporaire de cette session.
do $$
declare v_token text; v_res jsonb;
begin
  select r->>'token' into v_token from pg_temp_invite;
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  v_res := public.keel_household_preview_invitation(v_token);
  execute 'reset role';
  if coalesce((v_res->>'valid')::boolean, false) is not true then
    raise exception 'FAIL 64 : anon ne peut pas lire l''invitation (%)', v_res;
  end if;
  if v_res->>'first_name' <> 'Lea' or v_res->>'household_name' <> 'Maison'
     or v_res->>'email' <> 'nightfoyer_invitee@example.com' then
    raise exception 'FAIL 64 : l''aperçu ne dit pas ce qu''il doit dire (%)', v_res;
  end if;
  -- ET RIEN D'AUTRE. Un aperçu qui rendrait un identifiant de membre donnerait
  -- à un jeton qui fuite de quoi viser une autre ligne.
  if v_res ? 'member_id' or v_res ? 'household_id' or v_res ? 'goal' then
    raise exception 'FAIL 64 : l''aperçu rend plus que les trois champs (%)', v_res;
  end if;
  raise notice 'PASS 64 anon lit l''invitation, et strictement trois champs';
end;
$$;

-- 65. LE JETON VOLÉ. L'intrus GARDE son foyer: le refus doit venir de
-- l'adresse, pas de son état de compte (voir l'avertissement en tête).
select pg_temp.become('f0ed0000-0000-0000-0000-000000000005');
select pg_temp.assert_refused('65 un jeton volé ne sert à personne d''autre',
  public.keel_household_join((select r->>'token' from pg_temp_invite)),
  'email_mismatch');

-- 66. LA RÉCLAMATION.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000009');
select pg_temp.assert_ok('66 le destinataire réclame le profil',
public.keel_household_join((select r->>'token' from pg_temp_invite)));

-- 67. LE MÊME `member_id` PORTE MAINTENANT UN COMPTE. C'est l'assertion pour
-- laquelle ce lot existe: pas une ligne créée, une ligne attachée.
select pg_temp.become_super();
select pg_temp.assert_eq('67 la MÊME ligne porte le compte, prénom intact',
  (select count(*) from public.household_members hm
    where hm.member_id = (select member_id from pg_temp_lea)
      and hm.user_id = 'f0ed0000-0000-0000-0000-000000000009'
      and hm.first_name = 'Lea'
      and hm.role = 'member'), 1);

-- 68. ET RIEN N'A ÉTÉ PERDU: sa règle de maison et son allergie pendent au
-- `member_id`, pas à un compte, donc elles ne bougent pas d'un cheveu.
select pg_temp.assert_eq('68 sa règle de maison lui reste',
  (select count(*) from public.household_food_restrictions
    where member_id = (select member_id from pg_temp_lea)
      and label = 'champignons'), 1);
select pg_temp.assert_eq('69 son allergie lui reste',
  (select count(*) from public.household_member_allergies
    where member_id = (select member_id from pg_temp_lea)
      and label = 'arachide'), 1);

-- 70. LE FOYER N'A PAS GRANDI. Une réclamation qui INSÈRE laisserait 9 lignes
-- ici, et le générateur composerait une portion pour un fantôme.
select pg_temp.assert_eq('70 le foyer compte toujours 8 bouches',
  (select count(*) from public.household_members
    where household_id = public.keel_household_of('f0ed0000-0000-0000-0000-000000000001')), 8);

-- 71. NON REJOUABLE — et testé SANS sortir la personne de son foyer, pour que
-- le motif rendu soit bien `already_used` et pas un effet de bord.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000009');
select pg_temp.assert_refused('71 le jeton ne resert pas',
  public.keel_household_join((select r->>'token' from pg_temp_invite)),
  'already_used');

-- 72. Et l'aperçu le dit aussi, plutôt que de laisser croire à un lien vivant.
do $$
declare v_token text; v_res jsonb;
begin
  select r->>'token' into v_token from pg_temp_invite;
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  v_res := public.keel_household_preview_invitation(v_token);
  execute 'reset role';
  if coalesce(v_res->>'reason', '') <> 'already_used' then
    raise exception 'FAIL 72 : l''aperçu d''un lien consommé rend % ', v_res;
  end if;
  raise notice 'PASS 72 l''aperçu d''un lien consommé dit already_used';
end;
$$;

-- ---------------------------------------------------------------------------
-- 73–78. CE QUE LA RÉCLAMATION DONNE, ET CE QU'ELLE NE DONNE PAS
--
-- UNE SEULE PERSONNE GOUVERNE LE MENU. C'est ce qui évite le marécage d'un
-- arbitrage entre un parent et son enfant, et c'est pour ça que les quatre
-- refus ci-dessous comptent autant que le succès qui les précède.
-- ---------------------------------------------------------------------------

-- 73. LA SEULE AUTORITÉ GAGNÉE: son propre objectif.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000009');
select pg_temp.assert_ok('73 le profil réclamé pose SON objectif',
public.keel_household_set_member_goal(
    (select member_id from pg_temp_lea), 'health'));
select pg_temp.become_super();
select pg_temp.assert_eq('74 et l''objectif est VRAIMENT écrit',
  (select count(*) from public.household_members
    where member_id = (select member_id from pg_temp_lea) and goal = 'health'), 1);

-- 75–78. LES QUATRE REFUS.
--
-- « Composer » n'est pas une RPC: `generate-household-meal-v1` lit
-- `household_members.role` et rend 403 `not_owner` (index.ts:220). Ce que SQL
-- peut prouver, et prouve, c'est l'entrée de cette garde — le rôle de la ligne
-- réclamée vaut `member` (assertion 67) et aucun membre ne peut l'écrire en
-- direct (assertions 10 et 10b).
select pg_temp.become('f0ed0000-0000-0000-0000-000000000009');
select pg_temp.assert_refused('75 il n''AJOUTE pas de bouche',
  public.keel_household_add_member('Clandestin', null, null), 'not_owner');
select pg_temp.assert_refused('76 il ne RETIRE personne',
  public.keel_household_remove_member(
    (select member_id from public.household_members
      where user_id = 'f0ed0000-0000-0000-0000-000000000003')),
  'not_owner');
select pg_temp.assert_refused('77 il ne RESTREINT personne',
  public.keel_household_add_restriction(
    (select member_id from public.household_members
      where user_id = 'f0ed0000-0000-0000-0000-000000000003'), 'nutella'),
  'not_owner');
select pg_temp.assert_refused('78 il ne déclare aucune allergie',
  public.keel_household_add_allergy(
    (select member_id from public.household_members
      where user_id = 'f0ed0000-0000-0000-0000-000000000003'), 'peanut'),
  'not_owner');

-- 79. UN COMPTE = UN FOYER. L'intrus reçoit une invitation VALIDE, à SON
-- adresse, pour une bouche libre — et il est refusé parce qu'il habite déjà
-- ailleurs. C'est `household_members_one_per_user`, l'invariant scalaire dont
-- dépend `keel_household_of`, donc toutes les policies du foyer.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000001');
create temporary table pg_temp_invite2 on commit drop as
  select public.keel_household_invite(
    'nightfoyer_intruder@example.com',
    (select member_id from public.household_members
      where household_id = public.keel_household_of('f0ed0000-0000-0000-0000-000000000001')
        and first_name = 'Bouche1')) as r;
select pg_temp.assert_ok('79 invitation émise pour une bouche libre',
(select r from pg_temp_invite2));

select pg_temp.become('f0ed0000-0000-0000-0000-000000000005');
select pg_temp.assert_refused('80 un compte déjà logé ailleurs ne réclame pas',
  public.keel_household_join((select r->>'token' from pg_temp_invite2)),
  'already_in_household');

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
