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
--  25. l'envie est écrite par le MAÎTRE SEUL, une par semaine    -> not_owner / 1 (lot 5)
--  26. elle est ancrée au LUNDI, et une semaine passée reste     -> 1 / 2         (lot 5)
--      rangée à sa date — c'est ce qui empêche de servir une
--      phrase vieille de six semaines comme si elle datait de
--      ce matin
--  27. le compte FACTURABLE exclut le maître et les bouches       -> 4 / 0     (lot 7)
--      sans compte — un foyer d'une seule personne facture
--      ZÉRO profil réclamé, pas un
--  28. le plafond de 8 et le compte facturable sont DEUX          -> 8 / 8 / 4 (lot 7)
--      nombres, de deux natures: une garde de coût LLM, et
--      une quantité de facture
--  29. une réclamation ANNULÉE redescend le compte                -> 3 / 7     (lot 7)
--  30. compter une facture est réservé au SERVEUR                 -> 0 / 1 / lève
--  31. DÉTACHER: quatre refus nommés                              -> not_owner /  (ch. 2)
--      not_a_member / cannot_detach_owner / not_claimed
--  32. une personne détachée GARDE tout, `member_id` compris      -> 1 / 1 / 1 (ch. 2)
--  33. et son profil REDEVIENT réclamable                         -> ok / même member_id
--  34. supprimer son compte SANS la case détache et ne détruit    -> 1 / 1     (ch. 2)
--      rien — prouvé par `purge_auth_user`, pas par une RPC
--  35. avec la case, la bouche part, allergies comprises          -> 0 / 0     (ch. 2)
--  36b. purger le MAÎTRE ne lève plus, et le foyer survit         -> 1 / null  (ch. 2)
--  36c. les deux portes de purge sont réservées au SERVEUR        -> 0 / 0 / 2
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
-- 16. L'ENVIE — UNE LIGNE, ÉCRITE PAR LE COMPTE MAÎTRE (lot 5, 2026-08-10)
--
-- CE QUI A DISPARU DE CETTE SECTION: « chacun dépose la sienne ». La récolte
-- par membre est morte — elle faisait courir celui qui tient le foyer après
-- tout le monde — et l'écriture est réservée au maître. Les anciennes
-- assertions 30/31 affirmaient donc l'INVERSE de la règle en vigueur: elles
-- faisaient déposer une envie par `…0002`, qui est un simple membre.
-- ---------------------------------------------------------------------------

-- ⚠️ TOUT COMPTE SOUS `postgres` EST SCOPÉ AU FOYER DE LA FIXTURE. La base
-- locale est PARTAGÉE: un `count(*)` global virerait au rouge dès qu'une autre
-- session écrit une envie dans son propre foyer — un faux rouge que ce dépôt a
-- déjà payé ailleurs. Sous `authenticated`, RLS scope déjà.
create or replace function pg_temp.fixture_household()
returns uuid language sql stable as $$
  select id from public.households
   where created_by = 'f0ed0000-0000-0000-0000-000000000001'
$$;

create or replace function pg_temp.this_monday()
returns date language sql stable as $$
  select current_date - (extract(isodow from current_date)::int - 1)
$$;

-- 30. LE REFUS D'ABORD. Un membre qui appelle la RPC en direct doit se heurter
--     au même mur que celui qui ne voit pas le champ à l'écran: une limite
--     d'UI n'est pas une limite.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000002');
select pg_temp.assert_refused('30 un simple membre n''écrit PAS l''envie',
public.keel_household_submit_envy(current_date, 'un curry'), 'not_owner');

-- 30b. Et le refus est TOTAL, pas cosmétique: aucune ligne n'est entrée. Un
--      `ok=false` qui aurait quand même écrit passerait l'assertion 30.
select pg_temp.become_super();
select pg_temp.assert_eq('30b le refus n''a rien écrit',
  (select count(*) from public.household_envy_submissions
    where household_id = pg_temp.fixture_household()), 0);

-- 31. LE MAÎTRE ÉCRIT, ET RÉÉCRIT: la dernière REMPLACE. On change d'avis le
--     samedi, ce n'est pas un journal.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000001');
select pg_temp.assert_ok('31 le compte maître écrit la ligne de la semaine',
public.keel_household_submit_envy(current_date, 'Lea veut des pâtes'));
select pg_temp.assert_ok('31b il la réécrit (remplace)',
public.keel_household_submit_envy(current_date, 'plutôt un tajine'));

select pg_temp.become_super();
select pg_temp.assert_eq('32 UNE SEULE ligne par foyer et par semaine',
  (select count(*) from public.household_envy_submissions
    where household_id = pg_temp.fixture_household()), 1);
select pg_temp.assert_eq('33 c''est la DERNIÈRE qui reste',
  (select count(*) from public.household_envy_submissions
    where household_id = pg_temp.fixture_household()
      and body = 'plutôt un tajine'), 1);

-- 34. L'ANCRE EST UN LUNDI, QUEL QUE SOIT LE JOUR OÙ ON ÉCRIT.
--     C'est TOUTE la raison de garder cette table plutôt qu'une colonne sur
--     `households`: sans ancre, « Marc en a marre du poulet » écrit ce matin
--     et la même phrase oubliée depuis six semaines sont indiscernables, et le
--     générateur les servirait pareil.
select pg_temp.assert_eq('34 la ligne est rangée sur un LUNDI',
  (select count(*) from public.household_envy_submissions
    where household_id = pg_temp.fixture_household()
      and week_start = pg_temp.this_monday()), 1);

-- 34b. DEUX JOURS DE LA MÊME SEMAINE ÉCRIVENT LA MÊME LIGNE — et c'est le
--      défaut que ce lot corrige: sans recalage, une phrase écrite lundi
--      n'était plus trouvée par une composition lancée mercredi, et le foyer
--      recevait un plan qui ignorait sa demande sans une seule erreur.
--      MUTATION: si le recalage disparaissait de la RPC, 34c rendrait 2.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000001');
select pg_temp.assert_ok('34b il réécrit un autre jour de la même semaine',
public.keel_household_submit_envy(pg_temp.this_monday() + 3,
                                  'finalement des lasagnes'));
select pg_temp.become_super();
select pg_temp.assert_eq('34c toujours UNE ligne pour la semaine',
  (select count(*) from public.household_envy_submissions
    where household_id = pg_temp.fixture_household()), 1);
select pg_temp.assert_eq('34d et c''est bien la phrase du jeudi',
  (select count(*) from public.household_envy_submissions
    where household_id = pg_temp.fixture_household()
      and body = 'finalement des lasagnes'), 1);

-- 34e. UNE SEMAINE PASSÉE EST UNE AUTRE LIGNE, jamais un écrasement. C'est ce
--      qui permet au lecteur de ne PAS servir une envie périmée: il filtre sur
--      le lundi de la semaine composée, et la phrase de la semaine dernière
--      reste rangée à SA date.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000001');
select pg_temp.assert_ok('34e la semaine passée s''écrit à part',
public.keel_household_submit_envy(current_date - 7, 'la semaine passée'));
select pg_temp.become_super();
select pg_temp.assert_eq('34f deux semaines, deux lignes',
  (select count(*) from public.household_envy_submissions
    where household_id = pg_temp.fixture_household()), 2);
select pg_temp.assert_eq('34g la ligne de CETTE semaine n''a pas bougé',
  (select count(*) from public.household_envy_submissions
    where household_id = pg_temp.fixture_household()
      and week_start = pg_temp.this_monday()
      and body = 'finalement des lasagnes'), 1);
select pg_temp.assert_eq('34h celle d''AVANT est rangée au lundi d''avant',
  (select count(*) from public.household_envy_submissions
    where household_id = pg_temp.fixture_household()
      and week_start = pg_temp.this_monday() - 7
      and body = 'la semaine passée'), 1);

-- 35. LE FOYER LA LIT, TOUT ENTIER — y compris celui qui ne l'écrit pas.
--     « On mange des pâtes cette semaine » n'est pas une donnée sensible;
--     c'est même l'objet de la phrase. Ce qui reste privé (objectif, poids,
--     contraintes de sécurité) n'est pas dans cette table.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000002');
select pg_temp.assert_eq('35 un membre LIT la ligne du maître',
  (select count(*) from public.household_envy_submissions), 2);

-- 36. LE CLOISONNEMENT. L'intrus a SON foyer, donc `keel_household_of` lui rend
--     quelque chose: c'est le cas piégeux d'une policy qui aurait comparé
--     « non nul » au lieu de « égal ».
select pg_temp.become('f0ed0000-0000-0000-0000-000000000005');
select pg_temp.assert_eq('36 l''intrus ne lit aucune envie du foyer voisin',
  (select count(*) from public.household_envy_submissions), 0);
-- Il EST maître chez lui, donc son écriture réussit: ce qu'on affirme n'est pas
-- un refus, c'est que sa phrase ne traverse pas la cloison.
select pg_temp.assert_ok('36b l''intrus écrit dans SON foyer',
public.keel_household_submit_envy(current_date, 'des sushis'));
select pg_temp.become('f0ed0000-0000-0000-0000-000000000002');
select pg_temp.assert_eq('36c les sushis du voisin restent chez le voisin',
  (select count(*) from public.household_envy_submissions
    where body = 'des sushis'), 0);

-- ---------------------------------------------------------------------------
-- 37–40. LE COMPTE FACTURABLE, ET CE QU'IL N'EST PAS (lot 7)
--
-- Le foyer est à 12,99 €/mois entier, +2 €/mois PAR PROFIL RÉCLAMÉ — porté par
-- une ligne sur l'abonnement du MAÎTRE. Ce qui suit affirme la QUANTITÉ de
-- cette ligne, et rien d'autre: aucun prix, aucun appel Stripe, aucune
-- intégration. Ce lot livre le nombre; le job qui le pousse est un geste
-- humain (voir la migration 20260810260000, section 4).
--
-- La fixture est au PIRE endroit possible pour se tromper: le foyer est PLEIN
-- (8 bouches, plafond atteint en 24), il contient un maître avec compte, trois
-- membres avec compte, une bouche réclamée en cours de route (Léa, lot 6) et
-- trois bouches sans compte. Les deux nombres qu'on refuse de confondre valent
-- donc 8 et 4 — s'ils étaient confondus, la facture serait DOUBLE.
-- ---------------------------------------------------------------------------

select pg_temp.become_super();

-- 37. LE COMPTE. Quatre profils réclamés: Adulte, Enfant, Sansage, et Léa
--     réclamée en 66. Le MAÎTRE n'en fait pas partie — son accès est dans les
--     12,99 €, et le compter ferait payer 2 € de plus à TOUS les foyers, y
--     compris à celui d'une seule personne.
select pg_temp.assert_eq('37 quatre profils réclamés, le maître EXCLU',
  public.keel_household_billable_profiles(
    public.keel_household_of('f0ed0000-0000-0000-0000-000000000001')), 4);

-- 38. LE PLAFOND N'EST PAS LE COMPTE FACTURABLE. Huit bouches (le foyer est
--     plein), quatre profils réclamés, un plafond de huit: trois nombres, deux
--     natures. Le plafond est une garde de COÛT LLM; le compte est une
--     quantité de facture. Les affirmer côte à côte est le seul moyen de voir
--     le jour où quelqu'un branchera l'un sur l'autre.
select pg_temp.assert_eq('38 le foyer est PLEIN: huit bouches',
  (select count(*) from public.household_members
    where household_id = public.keel_household_of('f0ed0000-0000-0000-0000-000000000001')), 8);
select pg_temp.assert_eq('38b et le plafond vaut bien huit',
  public.keel_household_max_mouths(), 8);
select pg_temp.assert_eq('38c mais on n''en facture que quatre',
  public.keel_household_billable_profiles(
    public.keel_household_of('f0ed0000-0000-0000-0000-000000000001')), 4);

-- 38d. LE FOYER D'UNE SEULE PERSONNE. Le voisin est seul chez lui, et il porte
--      un compte: c'est LE cas où confondre « a un compte » et « profil
--      réclamé » produit un nombre plausible (1) au lieu du bon (0).
select pg_temp.assert_eq('38d un foyer d''une personne ne facture AUCUN profil',
  public.keel_household_billable_profiles(
    public.keel_household_of('f0ed0000-0000-0000-0000-000000000005')), 0);

-- 39. LA RÉCLAMATION ANNULÉE REDESCEND. Le maître retire la bouche de Léa —
--     aujourd'hui le seul geste de retrait qui existe. Le compte doit tomber à
--     trois; s'il restait à quatre, le maître paierait un accès qu'il a retiré,
--     et personne ne le verrait avant la facture.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000001');
select pg_temp.assert_ok('39 le maître retire la bouche réclamée',
public.keel_household_remove_member(
  (select member_id from pg_temp_lea)));
select pg_temp.become_super();
select pg_temp.assert_eq('39b trois profils réclamés après le retrait',
  public.keel_household_billable_profiles(
    public.keel_household_of('f0ed0000-0000-0000-0000-000000000001')), 3);
-- 39c. ET LES BOUCHES SANS COMPTE SONT TOUJOURS LÀ, non facturées. Sept
--      bouches pour trois profils: la promesse « bouches illimitées » est
--      exactement cet écart-là.
select pg_temp.assert_eq('39c sept bouches, dont trois seulement facturées',
  (select count(*) from public.household_members
    where household_id = public.keel_household_of('f0ed0000-0000-0000-0000-000000000001')), 7);

-- 40. LE PRIVILÈGE. La fonction prend un foyer EN ARGUMENT et est
--     `security definer`: ouverte à `authenticated`, elle rendrait le compte de
--     n'importe quel foyer à qui devine un uuid. Elle est réservée au serveur,
--     comme `keel_household_roster_for`. Et `revoke from public` NE RETIRE PAS
--     `anon` — c'est pour ça qu'`anon` est affirmé à part.
select pg_temp.assert_eq('40 ni anon ni authenticated ne comptent une facture',
  (select count(*) from (values ('anon'), ('authenticated')) t(r)
   where has_function_privilege(
     t.r, 'public.keel_household_billable_profiles(uuid)', 'EXECUTE')), 0);
select pg_temp.assert_eq('40b le serveur, lui, l''exécute',
  (select count(*) from (values ('service_role')) t(r)
   where has_function_privilege(
     t.r, 'public.keel_household_billable_profiles(uuid)', 'EXECUTE')), 1);

-- 40c. EN CONDITIONS RÉELLES, et pas seulement dans le catalogue: un membre
--      authentifié qui appelle la fonction doit se faire jeter par le moteur.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000002');
do $$
declare v_n integer;
begin
  begin
    v_n := public.keel_household_billable_profiles(
      public.keel_household_of('f0ed0000-0000-0000-0000-000000000001'));
    raise exception
      'FAIL 40c : un membre a pu compter la facture du foyer (%)', v_n;
  exception
    when insufficient_privilege then
      raise notice 'PASS 40c un membre authentifié ne compte aucune facture';
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 41–45. L'ESSAI ET L'HISTORIQUE DE FACTURATION (chantier 1)
--
-- Le foyer est à 12,99 €/mois + 2 € par profil réclamé, et D4bis lui offre
-- 30 jours à compter DU BRANCHEMENT de Stripe. Ce qui suit affirme deux
-- choses que rien d'autre ne tient:
--
--   · l'essai NE CHANGE PAS le compte facturable. On CALCULE toujours, on ne
--     POUSSE pas. Confondre les deux ferait disparaître les profils réclamés
--     de l'historique pendant un mois, et personne ne saurait, à la fin de
--     l'essai, ce qu'on aurait dû facturer;
--   · la facture est au MAÎTRE. Le reste du foyer voit ce qu'on mange, pas ce
--     qu'on paie.
--
-- État de la fixture ici: le foyer de 0001 a SEPT bouches et TROIS profils
-- réclamés (Léa a été retirée en 39).
-- ---------------------------------------------------------------------------

select pg_temp.become_super();

-- 41. L'ESSAI EST UNE DATE SUR LA LIGNE, pas une règle. On la pose comme le
--     fera le geste humain du branchement.
update public.households
   set free_until = current_date + 30
 where id = public.keel_household_of('f0ed0000-0000-0000-0000-000000000001');
select pg_temp.assert_eq('41 l''essai est posé sur la ligne du foyer',
  (select count(*) from public.households
    where id = public.keel_household_of('f0ed0000-0000-0000-0000-000000000001')
      and free_until = current_date + 30), 1);

-- 42. ET LE COMPTE FACTURABLE NE BOUGE PAS D'UN CRAN. C'est l'invariant de ce
--     bloc: `free_until` gouverne ce qu'on POUSSE à Stripe, jamais ce qu'on
--     COMPTE. Un compte qui tomberait à zéro pendant l'essai rendrait la fin
--     de l'essai illisible — on ne saurait pas quoi facturer le premier jour
--     d'après.
select pg_temp.assert_eq('42 l''essai ne change pas le compte facturable',
  public.keel_household_billable_profiles(
    public.keel_household_of('f0ed0000-0000-0000-0000-000000000001')), 3);

-- 43. LA LIGNE DE PÉRIODE, ÉCRITE PAR LE SERVEUR. On y met l'état exact d'un
--     foyer en essai: calculé, non poussé, et la raison NOMMÉE — un refus
--     nommé et une panne ne se rangent pas dans la même colonne.
insert into public.household_billing_periods
  (household_id, period_month, active_profile_count, mouth_count,
   free_until_at_computation, skip_reason)
values (
  public.keel_household_of('f0ed0000-0000-0000-0000-000000000001'),
  date_trunc('month', now())::date, 3, 7, current_date + 30, 'in_trial');

select pg_temp.assert_eq('43 un foyer en essai n''a POUSSÉ aucune quantité',
  (select count(*) from public.household_billing_periods
    where household_id = public.keel_household_of('f0ed0000-0000-0000-0000-000000000001')
      and pushed_quantity is null
      and skip_reason = 'in_trial'
      and push_error is null), 1);
-- 43b. LES DEUX NOMBRES SONT DEUX, jusque dans l'historique: sept bouches,
--      trois facturées. Le plafond snapshotté vaut huit et ne facture rien.
select pg_temp.assert_eq('43b sept bouches, trois facturées, plafond de huit',
  (select count(*) from public.household_billing_periods
    where household_id = public.keel_household_of('f0ed0000-0000-0000-0000-000000000001')
      and mouth_count = 7
      and active_profile_count = 3
      and max_mouths_at_computation = public.keel_household_max_mouths()), 1);

-- 43c. FACTURER PLUS DE PROFILS QUE DE BOUCHES EST REFUSÉ PAR LA BASE. C'est
--      la seule forme d'erreur de comptage qui produirait un nombre plausible,
--      et elle ne se verrait qu'à la facture.
do $$
begin
  begin
    update public.household_billing_periods
       set active_profile_count = 8
     where household_id = public.keel_household_of('f0ed0000-0000-0000-0000-000000000001');
    raise exception
      'FAIL 43c : 8 profils facturés pour 7 bouches ont été ACCEPTÉS';
  exception
    when check_violation then
      raise notice 'PASS 43c la base refuse plus de profils que de bouches';
  end;
end;
$$;

-- 44. LA FACTURE EST AU MAÎTRE. Un membre du foyer ne la lit pas: il voit ce
--     qu'on mange, pas ce qu'on paie. L'intrus non plus, évidemment.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000001');
select pg_temp.assert_eq('44 le maître lit SA période de facturation',
  (select count(*) from public.household_billing_periods), 1);
select pg_temp.become('f0ed0000-0000-0000-0000-000000000002');
select pg_temp.assert_eq('44b un membre ne lit AUCUNE facture',
  (select count(*) from public.household_billing_periods), 0);
select pg_temp.become('f0ed0000-0000-0000-0000-000000000005');
select pg_temp.assert_eq('44c l''intrus non plus',
  (select count(*) from public.household_billing_periods), 0);

-- 44d. ET PERSONNE N'ÉCRIT DEPUIS UN CLIENT. Aucune policy d'écriture
--      n'existe, mais une policy ne suffit pas: `TRUNCATE` ÉCHAPPE À RLS, et
--      toute table neuve donne TOUT à `authenticated` par défaut. On affirme
--      donc le PRIVILÈGE, pas la policy.
select pg_temp.become_super();
select pg_temp.assert_eq('44d aucun privilège d''écriture pour anon ni authenticated',
  (select count(*)
     from (values ('anon'), ('authenticated')) t(r)
     cross join (values ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) p(priv)
    where has_table_privilege(t.r, 'public.household_billing_periods', p.priv)), 0);
-- `revoke ... from public` NE RETIRE PAS `anon`: il a son propre GRANT, et
-- c'est pour ça qu'il est affirmé séparément de la lecture d'`authenticated`.
select pg_temp.assert_eq('44e anon ne LIT pas non plus les factures',
  (select count(*) from (values ('anon')) t(r)
    where has_table_privilege(t.r, 'public.household_billing_periods', 'SELECT')), 0);
select pg_temp.assert_eq('44f le serveur, lui, écrit sa propre table',
  (select count(*) from (values ('service_role')) t(r)
    where has_table_privilege(t.r, 'public.household_billing_periods', 'INSERT')), 1);

-- 45. LE VOCABULAIRE DE PALIER. Deux jetons neufs, et une ASYMÉTRIE voulue:
--     'household' est vendable (le maître a un abonnement), 'household_member'
--     ne l'est pas (droit HÉRITÉ, comme 'student' — le maître paie). L'admettre
--     sur un abonnement mettrait sur une facture un accès dont on a promis
--     qu'il ne coûterait rien à celui qui l'a.
select pg_temp.assert_eq('45 les deux jetons sont admis sur un PROFIL',
  (select count(*)
     from (values ('household'), ('household_member')) t(v)
    where (select pg_catalog.pg_get_constraintdef(c.oid)
             from pg_catalog.pg_constraint c
            where c.conname = 'profiles_access_tier_check'
              and c.conrelid = 'public.profiles'::regclass)
          like '%''' || t.v || '''%'), 2);
select pg_temp.assert_eq('45b seul ''household'' est admis sur un ABONNEMENT',
  (select count(*)
     from (values ('household'), ('household_member')) t(v)
    where (select pg_catalog.pg_get_constraintdef(c.oid)
             from pg_catalog.pg_constraint c
            where c.conname = 'subscriptions_tier_check'
              and c.conrelid = 'public.subscriptions'::regclass)
          like '%''' || t.v || '''%'), 1);

-- ---------------------------------------------------------------------------
-- 45c–45n. LE GEL À L'IMPAYÉ (chantier 3, D4)
--
-- D4: un foyer impayé est GELÉ, jamais effacé. Le graphe du foyer est la douve;
-- l'effacer à l'impayé détruirait la seule chose qui fait revenir. On gèle la
-- PRODUCTION, jamais la CONSULTATION.
--
-- ⚠️ ON MUTE POUR PROUVER. Chaque assertion de gel est encadrée par son
-- contraire SUR LE MÊME FOYER: un bloc qui n'affirmerait que « gelé » resterait
-- vert si `keel_household_is_covered` rendait `false` en toutes circonstances —
-- c'est-à-dire si le produit était coupé pour tout le monde.
--
-- État de la fixture ici: le foyer de 0001 porte `free_until = current_date+30`
-- (posé en 41), SEPT bouches et TROIS profils réclamés. Le foyer VOISIN, lui,
-- n'a jamais été touché: il porte ce que la RPC de création lui a donné.
-- ---------------------------------------------------------------------------

select pg_temp.become_super();

-- 45c. L'ESSAI A UN ÉCRIVAIN. Le foyer voisin a été créé par la VRAIE RPC et
--      personne ne lui a posé de date à la main: s'il n'en a pas, aucun foyer
--      neuf n'expirera jamais et le gel est une garde désarmée.
select pg_temp.assert_eq('45c un foyer créé par la RPC naît avec un essai daté',
  (select count(*) from public.households
    where id = public.keel_household_of('f0ed0000-0000-0000-0000-000000000005')
      and free_until = current_date + public.keel_household_trial_days()), 1);

-- 45d. ET LA FONCTION SAIT DIRE OUI. Sans cette ligne, la mutation de 45e ne
--      prouverait rien.
select pg_temp.assert_eq('45d un foyer en essai est COUVERT',
  (select count(*) where public.keel_household_is_covered(
    public.keel_household_of('f0ed0000-0000-0000-0000-000000000001'))), 1);

-- L'ÉTAT COMPLET AVANT LE GEL. « Aucune donnée n'a bougé » ne se prouve pas en
-- regardant: il se prouve en comparant.
create temporary table pg_temp_before_freeze on commit drop as
  select
    (select count(*) from public.household_members
      where household_id = public.keel_household_of('f0ed0000-0000-0000-0000-000000000001')) as mouths,
    (select count(*) from public.household_member_allergies
      where household_id = public.keel_household_of('f0ed0000-0000-0000-0000-000000000001')) as allergies,
    (select count(*) from public.household_food_restrictions
      where household_id = public.keel_household_of('f0ed0000-0000-0000-0000-000000000001')) as rules,
    (select count(*) from public.household_members
      where household_id = public.keel_household_of('f0ed0000-0000-0000-0000-000000000001')
        and birth_date is not null) as births,
    public.keel_household_billable_profiles(
      public.keel_household_of('f0ed0000-0000-0000-0000-000000000001')) as claimed;
grant select on pg_temp_before_freeze to authenticated;

-- 45e. LA MUTATION: l'essai a expiré HIER, il n'y a pas d'abonnement.
update public.households
   set free_until = current_date - 1
 where id = public.keel_household_of('f0ed0000-0000-0000-0000-000000000001');
select pg_temp.assert_eq('45e un essai expiré HIER gèle le foyer',
  (select count(*) where public.keel_household_is_covered(
    public.keel_household_of('f0ed0000-0000-0000-0000-000000000001'))), 0);

-- 45f. LA DÉRIVATION PAR COMPTE VOIT LA MÊME CHOSE. C'est elle que le cron
--      quotidien et l'écran lisent: si elle disait autre chose que la
--      définition, il y aurait deux vérités.
select pg_temp.assert_eq('45f la porte du serveur voit le gel, sur le bon foyer',
  (select count(*)
    from (select public.keel_household_coverage_for_user(
            'f0ed0000-0000-0000-0000-000000000001') as c) t
   where (t.c->>'frozen')::boolean
     and (t.c->>'household_id')::uuid
         = public.keel_household_of('f0ed0000-0000-0000-0000-000000000001')), 1);
-- Et un compte SANS foyer n'est PAS gelé: c'est l'écrasante majorité du
-- produit, et un gel par défaut le couperait en entier.
select pg_temp.assert_eq('45g un compte hors foyer n''est pas gelé',
  (select count(*)
    from (select public.keel_household_coverage_for_user(
            '00000000-0000-0000-0000-0000000000ff') as c) t
   where (t.c->>'frozen')::boolean is false
     and (t.c->>'in_household')::boolean is false), 1);

-- 45h. AUCUNE DONNÉE N'A BOUGÉ (preuve d'acceptation n°4). Sept bouches, leurs
--      dates, leurs allergies, leurs règles de maison et le compte facturable
--      sont exactement ce qu'ils étaient.
select pg_temp.assert_eq('45h le gel n''a touché AUCUNE donnée du foyer',
  (select count(*) from pg_temp_before_freeze b
    where b.mouths = (select count(*) from public.household_members
        where household_id = public.keel_household_of('f0ed0000-0000-0000-0000-000000000001'))
      and b.allergies = (select count(*) from public.household_member_allergies
        where household_id = public.keel_household_of('f0ed0000-0000-0000-0000-000000000001'))
      and b.rules = (select count(*) from public.household_food_restrictions
        where household_id = public.keel_household_of('f0ed0000-0000-0000-0000-000000000001'))
      and b.births = (select count(*) from public.household_members
        where household_id = public.keel_household_of('f0ed0000-0000-0000-0000-000000000001')
          and birth_date is not null)
      and b.claimed = public.keel_household_billable_profiles(
        public.keel_household_of('f0ed0000-0000-0000-0000-000000000001'))), 1);

-- 45i. LA CONSULTATION RESTE OUVERTE, ET C'EST LA MOITIÉ DE D4. Un foyer gelé
--      se LIT: ses bouches, ses allergies, ses règles. Le jour où une policy
--      `for select` tombera avec le gel, c'est cette assertion qui le dira.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000002');
select pg_temp.assert_eq('45i un membre lit encore les sept bouches d''un foyer GELÉ',
  (select count(*) from public.household_members), 7);
select pg_temp.assert_eq('45j et il lit encore ce que la maison ne sert pas',
  (select count(*) from public.household_food_restrictions),
  (select rules from pg_temp_before_freeze));
-- ET IL SAIT POURQUOI. Sans cette porte, le refus du serveur arriverait à
-- l'écran comme « non-2xx status code », c'est-à-dire comme une PANNE.
select pg_temp.assert_eq('45k l''écran peut savoir qu''il est en pause',
  (select count(*) where (public.keel_household_my_coverage()->>'frozen')::boolean), 1);

-- 45l. L'ABONNEMENT DU MAÎTRE DÉGÈLE, SANS TOUCHER À `free_until`. La seconde
--      branche de la définition doit valoir toute seule — sinon « payer »
--      n'aurait aucun effet tant qu'un humain n'a pas rallongé l'essai à la
--      main.
select pg_temp.become_super();
insert into public.subscriptions (user_id, tier, status)
values ('f0ed0000-0000-0000-0000-000000000001', 'household', 'active');
select pg_temp.assert_eq('45l le maître PAIE, le foyer dégèle',
  (select count(*) where public.keel_household_is_covered(
    public.keel_household_of('f0ed0000-0000-0000-0000-000000000001'))), 1);
-- ET UN ABONNEMENT MORT NE COUVRE PAS. Sans ça, « il existe une ligne
-- subscriptions » suffirait à dégeler pour toujours.
update public.subscriptions set status = 'canceled'
 where user_id = 'f0ed0000-0000-0000-0000-000000000001';
select pg_temp.assert_eq('45m un abonnement ANNULÉ ne couvre plus',
  (select count(*) where public.keel_household_is_covered(
    public.keel_household_of('f0ed0000-0000-0000-0000-000000000001'))), 0);
delete from public.subscriptions
 where user_id = 'f0ed0000-0000-0000-0000-000000000001';

-- 45n. LES PRIVILÈGES. La définition et la porte du SERVEUR sont fermées à
--      `anon` ET à `authenticated` — ouvertes, elles rendraient l'état de
--      facturation de n'importe quel foyer à qui devine un uuid. Seule la
--      porte de l'écran est ouverte, et elle n'a PAS de paramètre.
--      ⚠️ `revoke ... from public` NE RETIRE PAS `anon`.
select pg_temp.assert_eq('45n la définition et la porte serveur sont au SERVEUR seul',
  (select count(*)
     from (values ('anon'), ('authenticated')) t(r)
     cross join (values
       ('public.keel_household_is_covered(uuid)'),
       ('public.keel_household_coverage_for_user(uuid)')) f(sig)
    where has_function_privilege(t.r, f.sig, 'EXECUTE')), 0);
select pg_temp.assert_eq('45o anon ne lit AUCUN état de facturation',
  (select count(*) from (values ('anon')) t(r)
    where has_function_privilege(
      t.r, 'public.keel_household_my_coverage()', 'EXECUTE')), 0);
select pg_temp.assert_eq('45p l''écran connecté, lui, a sa porte',
  (select count(*) from (values ('authenticated')) t(r)
    where has_function_privilege(
      t.r, 'public.keel_household_my_coverage()', 'EXECUTE')), 1);

-- 45q. EN CONDITIONS RÉELLES, pas seulement dans le catalogue: un membre
--      authentifié qui appelle la définition doit se faire jeter par le moteur.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000002');
do $$
declare v_b boolean;
begin
  begin
    v_b := public.keel_household_is_covered(
      public.keel_household_of('f0ed0000-0000-0000-0000-000000000001'));
    raise exception
      'FAIL 45q : un membre a pu lire l''état de couverture du foyer (%)', v_b;
  exception
    when insufficient_privilege then
      raise notice 'PASS 45q un membre authentifié ne lit pas la définition';
  end;
end;
$$;

-- ON DÉGÈLE, ET C'EST OBLIGATOIRE. Les blocs qui suivent décrivent le
-- détachement, pas la facturation: les laisser tourner sur un foyer gelé
-- ferait dépendre leurs assertions d'un état qu'elles ne nomment pas.
select pg_temp.become_super();
update public.households
   set free_until = current_date + 30
 where id = public.keel_household_of('f0ed0000-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- 46. LE DÉTACHEMENT (chantier 2, D2 + D3)
--
-- LE FAIT MESURÉ QUI COMMANDE CES ASSERTIONS. Avant la migration
-- `20260811040000`, sur cette même base:
--   · purger le compte du MAÎTRE levait `23503 / households_created_by_fkey`
--     — le droit à l'effacement était INAPPLICABLE pour lui;
--   · purger le compte d'un MEMBRE emportait sa ligne de foyer, sa portion et
--     ses allergies, et le repas du lendemain était composé pour une bouche de
--     moins sans que personne ne l'ait décidé.
--
-- ⚠️ CE BLOC EST EN DERNIER, ET C'EST STRUCTUREL: il supprime des lignes de
-- `auth.users` pour prouver la purge. Tout est dans la transaction qui finit
-- par ROLLBACK, mais aucune assertion ne doit tourner APRÈS lui.
-- ---------------------------------------------------------------------------

-- ⚠️ LE PRÉNOM EST CAPTURÉ, PAS ÉCRIT EN DUR. Les assertions 49–52 l'ont déjà
-- corrigé (« Adulte » est devenu « Adulte2 »): un littéral ici prouverait
-- surtout que quelqu'un a relu le fichier. On garde l'état d'AVANT le
-- détachement et on affirme qu'il est identique après.
select pg_temp.become_super();
create temporary table pg_temp_adulte on commit drop as
  select member_id, first_name, birth_date from public.household_members
   where user_id = 'f0ed0000-0000-0000-0000-000000000002';
create temporary table pg_temp_enfant on commit drop as
  select member_id, first_name from public.household_members
   where user_id = 'f0ed0000-0000-0000-0000-000000000003';
create temporary table pg_temp_sansage on commit drop as
  select member_id from public.household_members
   where user_id = 'f0ed0000-0000-0000-0000-000000000004';
create temporary table pg_temp_bouche on commit drop as
  select member_id from public.household_members
   where household_id = public.keel_household_of('f0ed0000-0000-0000-0000-000000000001')
     and user_id is null
   limit 1;
grant select on pg_temp_adulte, pg_temp_enfant, pg_temp_sansage, pg_temp_bouche
  to authenticated;

-- L'Adulte porte une règle de maison ET une allergie: c'est ce qu'il doit
-- GARDER en perdant son accès. Les poser ici, sous le maître, par les vraies
-- RPC.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000001');
select pg_temp.assert_ok('46 une règle de maison sur l''Adulte',
public.keel_household_add_restriction((select member_id from pg_temp_adulte), 'anchois'));
select pg_temp.assert_ok('46b une allergie sur l''Adulte',
public.keel_household_add_allergy((select member_id from pg_temp_adulte), 'crustaces'));

-- 46c–46f. LES QUATRE REFUS NOMMÉS.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000002');
select pg_temp.assert_refused('46c un profil réclamé ne détache personne',
  public.keel_household_detach_member((select member_id from pg_temp_enfant)),
  'not_owner');

select pg_temp.become('f0ed0000-0000-0000-0000-000000000001');
-- LE VOISIN. Identifiant RÉEL d'une autre maison, capturé sous postgres —
-- pas un NULL, qui prouverait seulement qu'un NULL est refusé.
select pg_temp.assert_refused('46d une bouche du foyer d''à côté est inconnue',
  public.keel_household_detach_member((select member_id from pg_temp_neighbour)),
  'not_a_member');
-- LE MAÎTRE NE SE DÉTACHE PAS LUI-MÊME (preuve d'acceptation n°5). Sans cette
-- garde, un foyer se retrouve sans personne pour composer, et ses bouches sans
-- compte n'ont par construction personne pour reprendre la main.
select pg_temp.assert_refused('46e le maître ne se détache pas lui-même',
  public.keel_household_detach_member(
    (select member_id from public.household_members
      where user_id = 'f0ed0000-0000-0000-0000-000000000001')),
  'cannot_detach_owner');
-- RIEN À DÉTACHER. Rendre `ok` ici ferait annoncer à l'écran un accès retiré
-- qui n'a jamais existé.
select pg_temp.assert_refused('46f une bouche sans compte n''a pas d''accès à retirer',
  public.keel_household_detach_member((select member_id from pg_temp_bouche)),
  'not_claimed');

-- 46g. LE DÉTACHEMENT NE PERD RIEN (preuve d'acceptation n°1).
select pg_temp.assert_ok('46g le maître retire l''accès de l''Adulte',
public.keel_household_detach_member((select member_id from pg_temp_adulte)));
select pg_temp.become_super();
select pg_temp.assert_eq('46h même member_id, même prénom, même date, plus de compte',
  (select count(*) from public.household_members hm
    where hm.member_id = (select member_id from pg_temp_adulte)
      and hm.user_id is null
      and hm.first_name = (select first_name from pg_temp_adulte)
      and hm.birth_date is not distinct from (select birth_date from pg_temp_adulte)), 1);
select pg_temp.assert_eq('46i sa règle de maison lui reste',
  (select count(*) from public.household_food_restrictions
    where member_id = (select member_id from pg_temp_adulte) and label = 'anchois'), 1);
select pg_temp.assert_eq('46j son allergie lui reste',
  (select count(*) from public.household_member_allergies
    where member_id = (select member_id from pg_temp_adulte) and label = 'crustaces'), 1);
-- ET LE FOYER N'A PAS RÉTRÉCI: sept bouches avant, sept après. C'est toute la
-- différence entre « retirer l'accès » et « retirer du foyer ».
select pg_temp.assert_eq('46k le foyer compte toujours sept bouches',
  (select count(*) from public.household_members
    where household_id = public.keel_household_of('f0ed0000-0000-0000-0000-000000000001')), 7);
-- ET LA FACTURE SUIT: un accès retiré n'est plus un accès facturé. Trois
-- profils réclamés (39b), moins l'Adulte, égale deux.
select pg_temp.assert_eq('46l deux profils facturables après le détachement',
  public.keel_household_billable_profiles(
    public.keel_household_of('f0ed0000-0000-0000-0000-000000000001')), 2);
-- L'ADULTE N'EST PLUS DANS AUCUN FOYER: il ne lit plus rien, et c'est ce que
-- « retirer l'accès » veut dire. Une ligne détachée qui laisserait la lecture
-- ouverte ne retirerait rien du tout.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000002');
select pg_temp.assert_eq('46m la personne détachée ne lit plus le foyer',
  (select count(*) from public.household_members), 0);

-- 46n. LE PROFIL REDEVIENT RÉCLAMABLE (preuve d'acceptation n°4).
-- Par un lien NEUF: l'ancien est consommé et doit le rester. `0009` a perdu sa
-- ligne en 39, il n'est donc dans aucun foyer.
select pg_temp.become('f0ed0000-0000-0000-0000-000000000001');
create temporary table pg_temp_reinvite on commit drop as
  select public.keel_household_invite(
    'nightfoyer_invitee@example.com', (select member_id from pg_temp_adulte)) as r;
grant select on pg_temp_reinvite to authenticated;
select pg_temp.assert_ok('46n on réinvite sur la bouche détachée',
  (select r from pg_temp_reinvite));
select pg_temp.become('f0ed0000-0000-0000-0000-000000000009');
select pg_temp.assert_ok('46o et la re-réclamation aboutit',
  public.keel_household_join((select r->>'token' from pg_temp_reinvite)));
select pg_temp.become_super();
select pg_temp.assert_eq('46p la MÊME ligne porte le nouveau compte',
  (select count(*) from public.household_members hm
    where hm.member_id = (select member_id from pg_temp_adulte)
      and hm.user_id = 'f0ed0000-0000-0000-0000-000000000009'
      and hm.first_name = (select first_name from pg_temp_adulte)), 1);

-- 46q. LES DEUX PORTES DE PURGE SONT AU SERVEUR. `auth.uid()` est NULL sous
--      `service_role`: ces fonctions prennent donc le compte en PARAMÈTRE, et
--      le GRANT est leur seule garde. Ouvertes à `authenticated`, elles
--      rendraient à n'importe qui le droit d'effacer la bouche d'un autre.
select pg_temp.assert_eq('46q ni anon ni authenticated n''exécutent les portes de purge',
  (select count(*)
     from (values ('anon'), ('authenticated')) t(r)
     cross join (values
       ('public.keel_household_set_departure(uuid, boolean)'),
       ('public.keel_household_purge_user(uuid)')) f(sig)
    where has_function_privilege(t.r, f.sig, 'EXECUTE')), 0);
select pg_temp.assert_eq('46r le serveur, lui, les exécute',
  (select count(*)
     from (values
       ('public.keel_household_set_departure(uuid, boolean)'),
       ('public.keel_household_purge_user(uuid)')) f(sig)
    where has_function_privilege('service_role', f.sig, 'EXECUTE')), 2);

-- 46s. LES CLAUSES ON DELETE, DANS LE CATALOGUE. Faible toute seule — d'où les
--      assertions de comportement qui suivent — mais elle nomme la régression
--      exacte si quelqu'un repose une de ces clés sans y penser.
select pg_temp.assert_eq('46s aucune FK du foyer ne CASCADE plus sur auth.users, sauf les envies',
  (select count(*) from pg_catalog.pg_constraint c
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and c.conrelid::regclass::text like 'household%'
      and c.confdeltype <> 'n'), 1);

-- ══════════════════════════════════════════════════════════════════════════
-- 46t–46z. LA PURGE RGPD. À partir d'ici on SUPPRIME des `auth.users`.
-- ══════════════════════════════════════════════════════════════════════════

-- 46t. SANS LA CASE: la bouche se détache et ne perd rien (preuve n°2).
--      L'Enfant part — c'est le cas qui compte, parce que son allergie est ce
--      que le générateur lit fail-closed.
select pg_temp.assert_ok('46t l''Enfant ne demande PAS à quitter le foyer',
  public.keel_household_set_departure('f0ed0000-0000-0000-0000-000000000003', false));
select pg_temp.assert_ok('46u la purge du foyer précède le delete auth',
  public.keel_household_purge_user('f0ed0000-0000-0000-0000-000000000003'));
select public.purge_auth_user('f0ed0000-0000-0000-0000-000000000003');
select pg_temp.assert_eq('46v la bouche de l''Enfant a SURVÉCU à son compte',
  (select count(*) from public.household_members hm
    where hm.member_id = (select member_id from pg_temp_enfant)
      and hm.user_id is null
      and hm.first_name = (select first_name from pg_temp_enfant)), 1);
select pg_temp.assert_eq('46w et le foyer compte toujours sept bouches',
  (select count(*) from public.household_members
    where household_id = public.keel_household_of('f0ed0000-0000-0000-0000-000000000001')), 7);

-- 46x. AVEC LA CASE: tout part (preuve n°3). Sansage le demande.
select pg_temp.assert_ok('46x Sansage demande à quitter le foyer',
  public.keel_household_set_departure('f0ed0000-0000-0000-0000-000000000004', true));
select public.keel_household_purge_user('f0ed0000-0000-0000-0000-000000000004');
select public.purge_auth_user('f0ed0000-0000-0000-0000-000000000004');
select pg_temp.assert_eq('46y la bouche de Sansage est partie avec son compte',
  (select count(*) from public.household_members
    where member_id = (select member_id from pg_temp_sansage)), 0);
select pg_temp.assert_eq('46z six bouches: une seule ligne a disparu',
  (select count(*) from public.household_members
    where household_id = public.keel_household_of('f0ed0000-0000-0000-0000-000000000001')), 6);

-- 46aa. LE MAÎTRE NE QUITTE PAS SON FOYER. Même règle que
--       `cannot_remove_owner`, et pour la même raison exactement.
select pg_temp.assert_refused('46aa le maître ne peut pas demander son départ',
  public.keel_household_set_departure('f0ed0000-0000-0000-0000-000000000001', true),
  'cannot_remove_owner');

-- 46bb. ET SA PURGE NE LÈVE PLUS. C'est l'assertion qui rend le droit à
--       l'effacement APPLICABLE: avant ce lot, cette ligne levait 23503 et le
--       cron `purge-deleted-accounts` rejouait le même échec tous les jours.
do $$
declare v_house uuid := public.keel_household_of('f0ed0000-0000-0000-0000-000000000001');
        v_rows bigint; v_created uuid;
begin
  perform public.keel_household_purge_user('f0ed0000-0000-0000-0000-000000000001');
  begin
    perform public.purge_auth_user('f0ed0000-0000-0000-0000-000000000001');
  exception when foreign_key_violation then
    raise exception
      'FAIL 46bb : purger le maître lève encore (%) — le droit à l''effacement '
      'reste inapplicable pour lui', sqlerrm;
  end;
  select count(*) into v_rows from public.households where id = v_house;
  if v_rows <> 1 then
    raise exception
      'FAIL 46bb : le foyer a disparu avec son créateur — et les données de '
      'tous les autres avec';
  end if;
  select created_by into v_created from public.households where id = v_house;
  if v_created is not null then
    raise exception
      'FAIL 46bb : households.created_by pointe encore sur un compte effacé';
  end if;
  raise notice
    'PASS 46bb le maître est purgé, le foyer survit, created_by est NULL';
end;
$$;

select pg_temp.become_super();
rollback;
