-- ============================================================================
-- A8.2 — `meal_share_outcomes`: test NÉGATIF des policies et de la porte
--
-- MANUEL, comme `household_rls_test.sql` et `tenancy_rls_test.sql`. C'est un
-- script psql et pas un test deno, parce que la chose testée est le moteur de
-- policies de Postgres: un client qui contournerait `set local role` ne
-- testerait rien du tout.
--
--   docker cp supabase/functions/_shared/keel/meal_share_outcomes_rls_test.sql \
--     supabase_db_Sophia_2:/tmp/meal_share_outcomes_rls_test.sql
--   docker exec supabase_db_Sophia_2 psql -U postgres -d postgres \
--     -f /tmp/meal_share_outcomes_rls_test.sql
--
-- Tout tourne dans UNE transaction qui finit par ROLLBACK: la base est laissée
-- exactement telle qu'on l'a trouvée. C'est non négociable — la base locale est
-- partagée avec d'autres sessions.
--
-- Les uuid de fixture sont préfixés `a802` pour ne collisionner avec personne.
--
-- CE QUI EST AFFIRMÉ
--   1. la personne déclare le sort de SA boîte                    -> ok
--   2. ⛔ LE MAÎTRE NE DÉCLARE PAS POUR UN PROFIL RÉCLAMÉ         -> not_your_line
--   3. le maître déclare pour une bouche SANS COMPTE (D8.5)       -> ok
--   4. ⛔ LE MAÎTRE NE LIT PAS LA LIGNE DU PROFIL RÉCLAMÉ         -> 0
--   5. le membre lit la SIENNE                                    -> 1
--   6. le membre ne lit pas celle de la bouche sans compte        -> 0
--   7. un INTRUS d'un autre foyer ne lit rien                     -> 0
--   8. `anon` n'a pas même le PRIVILÈGE de lire                   -> lève
--   9. personne n'ÉCRIT en direct (TRUNCATE compris)              -> refusé
--  10. un plan d'un AUTRE foyer est refusé (H2 en écriture)       -> not_your_plan
--  11. les deux déclarations COEXISTENT sur la même boîte (D8.3)  -> 2
--  12. la même personne qui se ravise ÉCRASE sa propre ligne      -> 1
-- ============================================================================

\set ON_ERROR_STOP on
begin;

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

create or replace function pg_temp.assert_eq(label text, got bigint, want bigint)
returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '% : attendu %, obtenu %', label, want, got;
  end if;
  raise notice 'OK  %  (= %)', label, want;
end;
$$;

create or replace function pg_temp.assert_reason(label text, got jsonb, want text)
returns void language plpgsql as $$
begin
  if (got ->> 'reason') is distinct from want then
    raise exception '% : attendu reason=%, obtenu %', label, want, got::text;
  end if;
  raise notice 'OK  %  (reason = %)', label, want;
end;
$$;

create or replace function pg_temp.assert_ok(label text, got jsonb)
returns void language plpgsql as $$
begin
  if (got ->> 'ok') is distinct from 'true' then
    raise exception '% : attendu ok=true, obtenu %', label, got::text;
  end if;
  raise notice 'OK  %', label;
end;
$$;

-- ---------------------------------------------------------------------------
-- LA FIXTURE — un foyer à trois bouches, et un voisin
-- ---------------------------------------------------------------------------

select pg_temp.become_super();

insert into auth.users (id, email, instance_id, aud, role)
values
  ('a8020000-0000-4000-8000-000000000001','a802_master@example.com',
   '00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('a8020000-0000-4000-8000-000000000002','a802_member@example.com',
   '00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('a8020000-0000-4000-8000-000000000003','a802_stranger@example.com',
   '00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  -- A8.3 (D4) — LE COMPTE QUI RÉCLAMERA UNE BOUCHE. Il n'a AUCUNE ligne de
  -- foyer au départ, et c'est obligatoire: `household_members_one_per_user`
  -- refuse un second siège, donc réutiliser l'intrus ferait échouer la
  -- réclamation pour une raison qui n'est pas celle qu'on mesure.
  ('a8020000-0000-4000-8000-000000000004','a802_claimer@example.com',
   '00000000-0000-0000-0000-000000000000','authenticated','authenticated');

-- Le foyer du maître, et celui du voisin. Deux foyers: sans le second, « un
-- intrus ne lit rien » serait vrai parce qu'il n'y a rien à lire.
insert into public.households (id, name, created_by)
values
  ('a8021111-0000-4000-8000-000000000001','Maison A802',
   'a8020000-0000-4000-8000-000000000001'),
  ('a8021111-0000-4000-8000-000000000002','Maison voisine',
   'a8020000-0000-4000-8000-000000000003');

insert into public.household_members
  (member_id, household_id, user_id, role, first_name)
values
  -- le maître
  ('a8022222-0000-4000-8000-000000000001','a8021111-0000-4000-8000-000000000001',
   'a8020000-0000-4000-8000-000000000001','owner','Maitre'),
  -- LE PROFIL RÉCLAMÉ: `user_id` posé, `role = member`
  ('a8022222-0000-4000-8000-000000000002','a8021111-0000-4000-8000-000000000001',
   'a8020000-0000-4000-8000-000000000002','member','Conjoint'),
  -- ⚠️ LA BOUCHE SANS COMPTE: `user_id` NULL. C'est elle qui sépare D8.5 de
  -- la surveillance retirée.
  ('a8022222-0000-4000-8000-000000000003','a8021111-0000-4000-8000-000000000001',
   null,'member','Enfant'),
  -- le voisin, chez lui
  ('a8022222-0000-4000-8000-000000000004','a8021111-0000-4000-8000-000000000002',
   'a8020000-0000-4000-8000-000000000003','owner','Voisin');

-- Le plan DU FOYER, écrit sous le maître — c'est le cas réel.
insert into public.student_generated_meals
  (id, user_id, household_id, plan_kind, mode, scope, content_locale,
   starts_on, duration_days)
values
  ('a8023333-0000-4000-8000-000000000001',
   'a8020000-0000-4000-8000-000000000001','a8021111-0000-4000-8000-000000000001',
   'household','to_shop','several_days','fr-FR', current_date, 3),
  -- Le plan du VOISIN, pour l'épreuve H2 en écriture.
  ('a8023333-0000-4000-8000-000000000002',
   'a8020000-0000-4000-8000-000000000003','a8021111-0000-4000-8000-000000000002',
   'household','to_shop','several_days','fr-FR', current_date, 3);

-- ---------------------------------------------------------------------------
-- LA PORTE D'ÉCRITURE
-- ---------------------------------------------------------------------------

-- 1. LE CAS QUI PASSE. Sans lui, tous les refus ci-dessous seraient une garde
--    parfaite sur une porte qui ne s'ouvre jamais.
select pg_temp.assert_ok('01 le membre déclare le sort de SA boîte',
  public.keel_household_declare_share_outcome_for(
    'a8020000-0000-4000-8000-000000000002',   -- p_user: le membre
    'a8023333-0000-4000-8000-000000000001',
    0,
    'a8022222-0000-4000-8000-000000000002',   -- sa propre bouche
    'shifted', current_date + 1, current_date));

-- 2. ⛔ L'INTERDIT DU LOT. Le maître ne parle pas pour quelqu'un qui peut
--    parler lui-même. C'est ce refus qui rend la contradiction de D8.3
--    structurellement impossible sur un compte, plutôt qu'arbitrée par une
--    convention que personne ne relit.
select pg_temp.assert_reason('02 le MAÎTRE ne déclare PAS pour un profil réclamé',
  public.keel_household_declare_share_outcome_for(
    'a8020000-0000-4000-8000-000000000001',   -- p_user: le maître
    'a8023333-0000-4000-8000-000000000001',
    0,
    'a8022222-0000-4000-8000-000000000002',   -- la bouche AVEC compte
    'not_eaten', null, current_date),
  'not_your_line');

-- 3. D8.5 — mais il range la boîte d'une bouche SANS COMPTE. Ce n'est pas
--    surveiller un adulte: on ne compte aucune consommation, on range un
--    contenant.
select pg_temp.assert_ok('03 le maître déclare pour une bouche SANS COMPTE',
  public.keel_household_declare_share_outcome_for(
    'a8020000-0000-4000-8000-000000000001',
    'a8023333-0000-4000-8000-000000000001',
    0,
    'a8022222-0000-4000-8000-000000000003',   -- la bouche sans compte
    'discarded', null, current_date));

-- 10. H2 EN ÉCRITURE. Un `p_meal` forgé citant le plan d'un AUTRE foyer: le
--     foyer vient de la base, jamais de la charge.
select pg_temp.assert_reason('10 un plan d''un AUTRE foyer est refusé',
  public.keel_household_declare_share_outcome_for(
    'a8020000-0000-4000-8000-000000000001',
    'a8023333-0000-4000-8000-000000000002',   -- le plan du voisin
    0,
    'a8022222-0000-4000-8000-000000000003',
    'discarded', null, current_date),
  'not_your_plan');

-- 11. LES DEUX DÉCLARATIONS COEXISTENT (D8.3). Le maître a rangé la boîte de
--     l'enfant, le membre a rangé la sienne: deux lignes sur le même plat, et
--     aucune n'a écrasé l'autre. C'est ce que la 4e colonne de la clé achète.
select pg_temp.become_super();
select pg_temp.assert_eq('11 deux déclarations sur le même plat coexistent',
  (select count(*) from public.meal_share_outcomes
    where generated_meal_id = 'a8023333-0000-4000-8000-000000000001'
      and dish_index = 0), 2);

-- 12. UN ÉTAT, PAS UN JOURNAL. La même personne qui se ravise écrase SA ligne,
--     et seulement la sienne.
select pg_temp.assert_ok('12a le membre se ravise',
  public.keel_household_declare_share_outcome_for(
    'a8020000-0000-4000-8000-000000000002',
    'a8023333-0000-4000-8000-000000000001',
    0,
    'a8022222-0000-4000-8000-000000000002',
    'frozen', null, current_date));
select pg_temp.assert_eq('12b sa ligne est REMPLACÉE, pas dupliquée',
  (select count(*) from public.meal_share_outcomes
    where generated_meal_id = 'a8023333-0000-4000-8000-000000000001'
      and dish_index = 0), 2);
select pg_temp.assert_eq('12c et c''est bien le nouveau sort',
  (select count(*) from public.meal_share_outcomes
    where declared_by = 'a8020000-0000-4000-8000-000000000002'
      and outcome = 'frozen' and shifted_to_day is null), 1);

-- ---------------------------------------------------------------------------
-- LA LECTURE — c'est ici que la surveillance est refusée
-- ---------------------------------------------------------------------------

-- 4. ⛔ L'AFFIRMATION CENTRALE. Le maître voit sa propre déclaration sur
--    l'enfant, et RIEN du conjoint. Une carte « qui a mangé quoi » chez le
--    maître serait la surveillance que R11 et R12 ont retirée du produit.
select pg_temp.become('a8020000-0000-4000-8000-000000000001');
select pg_temp.assert_eq('04a le maître lit ce qu''IL a déclaré',
  (select count(*) from public.meal_share_outcomes
    where declared_by = 'a8020000-0000-4000-8000-000000000001'), 1);
select pg_temp.assert_eq('04b ⛔ et RIEN de la ligne du profil réclamé',
  (select count(*) from public.meal_share_outcomes
    where declared_by = 'a8020000-0000-4000-8000-000000000002'), 0);
select pg_temp.assert_eq('04c donc UNE seule ligne en tout, pas deux',
  (select count(*) from public.meal_share_outcomes), 1);

-- 5. Le membre lit la sienne.
select pg_temp.become('a8020000-0000-4000-8000-000000000002');
select pg_temp.assert_eq('05 le membre lit SA ligne',
  (select count(*) from public.meal_share_outcomes
    where member_id = 'a8022222-0000-4000-8000-000000000002'), 1);

-- 6. Et rien de la bouche sans compte: elle n'est pas la sienne, et il n'est
--    pas maître. La branche 3 de la policy est réservée au maître.
select pg_temp.assert_eq('06 le membre ne lit pas la boîte de l''enfant',
  (select count(*) from public.meal_share_outcomes
    where member_id = 'a8022222-0000-4000-8000-000000000003'), 0);
select pg_temp.assert_eq('06b donc UNE seule ligne pour lui aussi',
  (select count(*) from public.meal_share_outcomes), 1);

-- 7. L'intrus du foyer voisin ne lit rien du tout.
select pg_temp.become('a8020000-0000-4000-8000-000000000003');
select pg_temp.assert_eq('07 un intrus ne lit RIEN de ce foyer',
  (select count(*) from public.meal_share_outcomes), 0);

-- 8. `anon` n'a pas même le privilège. `revoke ... from public` le laisse
--    intact: c'est une cicatrice mesurée de ce dépôt.
select pg_temp.become_anon();
do $$
begin
  perform 1 from public.meal_share_outcomes;
  raise exception '08 `anon` a PU interroger la table';
exception
  when insufficient_privilege then
    raise notice 'OK  08 `anon` n''a pas le privilège de lire';
end;
$$;

-- 9. Personne n'écrit en direct. Les privilèges par défaut de ce projet
--    donnent TOUT à `authenticated` sur une table neuve, TRUNCATE compris.
select pg_temp.become('a8020000-0000-4000-8000-000000000002');
do $$
begin
  insert into public.meal_share_outcomes (
    generated_meal_id, dish_index, member_id, declared_by,
    outcome, shifted_to_day, answered_local_date
  ) values (
    'a8023333-0000-4000-8000-000000000001', 1,
    'a8022222-0000-4000-8000-000000000002',
    'a8020000-0000-4000-8000-000000000002',
    'discarded', null, current_date);
  raise exception '09a un membre a PU écrire en direct, sans passer par la porte';
exception
  when insufficient_privilege then
    raise notice 'OK  09a aucune écriture directe';
end;
$$;
do $$
begin
  execute 'truncate table public.meal_share_outcomes';
  raise exception '09b un membre a PU vider la table';
exception
  when insufficient_privilege then
    raise notice 'OK  09b aucun TRUNCATE';
end;
$$;

-- ===========================================================================
-- ⛔ D3 (2026-09-03) — LES DEUX CHECK DE LA TABLE, TENUS SUR DES LIGNES RÉELLES
--
-- LE DÉFAUT MESURÉ, ET L'EXCUSE QUI ÉTAIT FAUSSE. Les contrôles (e) et (f) du
-- bloc `do $$` de la migration interceptent `foreign_key_violation` EN PLUS de
-- `check_violation`, parce que leurs uuid bidons ne référencent rien: la FK
-- tombe AVANT le CHECK, et neutraliser le CHECK ne fait pas rougir le bloc. Le
-- journal d'A8.2 disait « ce que ces deux CHECK gardent est tenu par le test
-- RLS » — c'est FAUX, et le vérificateur l'a mesuré: les deux CHECK neutralisés
-- laissaient 18/18 assertions vertes, parce que la PORTE refuse avant que la
-- table ne soit touchée. Le CHECK `shifted ⟺ shifted_to_day` n'était donc tenu
-- par RIEN.
--
-- ⚠️ ON ÉCRIT DONC EN DIRECT, SOUS `postgres`, ET C'EST LE SEUL ENDROIT DU
-- FICHIER QUI LE FAIT. Le but n'est pas de tester la porte (elle a ses propres
-- cas): c'est d'atteindre la TABLE avec des clés étrangères qui RÉSOLVENT, pour
-- que le CHECK soit la seule chose qui puisse tomber. La FK ne peut plus mordre
-- puisque le plan, la bouche et le compte existent tous les trois.
--
-- ⚠️ ET LE SQLSTATE EST VÉRIFIÉ NOMMÉMENT (`23514`, pas `23503`): un contrôle
-- qui attrape deux erreurs différentes ne prouve pas laquelle a mordu — c'est
-- exactement la faute qu'on répare ici, et l'attraper au sens large la
-- reproduirait.
-- ===========================================================================

select pg_temp.become_super();

-- 13. LE VOCABULAIRE EST FERMÉ EN BASE, et pas seulement dans la porte. Une
--     écriture serveur qui contournerait la RPC doit tomber aussi.
do $$
begin
  insert into public.meal_share_outcomes (
    generated_meal_id, dish_index, member_id, declared_by,
    outcome, shifted_to_day, answered_local_date
  ) values (
    'a8023333-0000-4000-8000-000000000001', 7,
    'a8022222-0000-4000-8000-000000000003',   -- une bouche RÉELLE
    'a8020000-0000-4000-8000-000000000001',   -- un compte RÉEL
    'eaten_somewhere_else', null, current_date);
  raise exception '13 CHECK: un `outcome` hors vocabulaire a été ACCEPTÉ';
exception
  when sqlstate '23514' then
    raise notice 'OK  13 le CHECK du vocabulaire a mordu (23514)';
  when sqlstate '23503' then
    raise exception '13 la CLÉ ÉTRANGÈRE a mordu avant le CHECK — la fixture '
      'ne référence pas des lignes réelles, ce contrôle ne prouve rien';
end;
$$;

-- 14. LA DATE ET LE SORT SE TIENNENT, DANS LES DEUX SENS. Une ligne
--     `discarded` datée décrirait deux sorts pour la même boîte, et le lecteur
--     devrait deviner; un `shifted` sans date ne dit pas à quel jour, donc ne
--     dit rien. C'est LE CHECK que rien ne tenait.
do $$
begin
  insert into public.meal_share_outcomes (
    generated_meal_id, dish_index, member_id, declared_by,
    outcome, shifted_to_day, answered_local_date
  ) values (
    'a8023333-0000-4000-8000-000000000001', 8,
    'a8022222-0000-4000-8000-000000000003',
    'a8020000-0000-4000-8000-000000000001',
    'discarded', current_date + 1, current_date);
  raise exception '14a CHECK: une boîte `discarded` a PU porter un jour de report';
exception
  when sqlstate '23514' then
    raise notice 'OK  14a `discarded` + une date est refusé (23514)';
  when sqlstate '23503' then
    raise exception '14a la CLÉ ÉTRANGÈRE a mordu avant le CHECK';
end;
$$;

do $$
begin
  insert into public.meal_share_outcomes (
    generated_meal_id, dish_index, member_id, declared_by,
    outcome, shifted_to_day, answered_local_date
  ) values (
    'a8023333-0000-4000-8000-000000000001', 9,
    'a8022222-0000-4000-8000-000000000003',
    'a8020000-0000-4000-8000-000000000001',
    'shifted', null, current_date);
  raise exception '14b CHECK: un `shifted` a PU ne porter aucun jour';
exception
  when sqlstate '23514' then
    raise notice 'OK  14b `shifted` sans date est refusé (23514)';
  when sqlstate '23503' then
    raise exception '14b la CLÉ ÉTRANGÈRE a mordu avant le CHECK';
end;
$$;

-- 15. ⚠️ LE CAS QUI PASSE, ET IL EST OBLIGATOIRE. Sans lui, les trois refus
--     ci-dessus seraient verts sur une table qui refuse TOUT — une garde qu'on
--     ne sait pas faire dire « oui » bloque tout en ressemblant à une garde qui
--     marche.
insert into public.meal_share_outcomes (
  generated_meal_id, dish_index, member_id, declared_by,
  outcome, shifted_to_day, answered_local_date
) values (
  'a8023333-0000-4000-8000-000000000001', 7,
  'a8022222-0000-4000-8000-000000000003',
  'a8020000-0000-4000-8000-000000000001',
  'shifted', current_date + 1, current_date);
select pg_temp.assert_eq('15 le CHECK laisse passer une ligne cohérente',
  (select count(*) from public.meal_share_outcomes
    where dish_index = 7), 1);

-- ===========================================================================
-- ⛔ D4 (2026-09-03) — CE QUE LA 4ᵉ COLONNE DE LA CLÉ ACHÈTE VRAIMENT
--
-- LE DÉFAUT MESURÉ. Le cas 11 comptait deux lignes sur DEUX BOUCHES
-- DIFFÉRENTES: une clé à TROIS colonnes (sans `declared_by`) les autorise tout
-- autant. Ramener la clé à trois laissait donc 18/18 vertes, et la décision
-- centrale du lot n'avait aucune épreuve qui morde.
--
-- ── LE CAS QUI LA DISTINGUE, ET C'EST LE VRAI SCÉNARIO PRODUIT ─────────────
-- La MÊME bouche, le MÊME plat, DEUX déclarants. La porte l'interdit tant que
-- la bouche a un compte (`not_your_line`), donc il n'existe qu'un chemin par
-- lequel les deux lignes se rencontrent — et c'est le chemin NORMAL du produit:
--
--   1. la bouche n'a PAS de compte, le maître range sa boîte (D8.5);
--   2. plus tard, la personne RÉCLAME ce profil (`user_id` posé — c'est ce que
--      fait `keel_household_claim_member`);
--   3. elle déclare à son tour sur SA boîte.
--
-- Avec quatre colonnes, les deux lignes COEXISTENT et `resolveShareOutcomes`
-- tranche par AUTORITÉ (D8.3: la sienne gagne). Avec trois, la seconde écrase
-- la première — et l'arbitrage n'a plus rien à arbitrer, en silence.
--
-- MUTATION QUI DOIT ROUGIR: retirer `declared_by` de la clé primaire ET du
-- `on conflict` de la porte.
-- ===========================================================================

select pg_temp.become_super();

-- 16a. Le maître range la boîte de l'enfant, sur un plat neuf.
select pg_temp.assert_ok('16a le maître range la boîte d''une bouche sans compte',
  public.keel_household_declare_share_outcome_for(
    'a8020000-0000-4000-8000-000000000001',
    'a8023333-0000-4000-8000-000000000001',
    5,
    'a8022222-0000-4000-8000-000000000003',
    'discarded', null, current_date));

-- 16b. LA BOUCHE EST RÉCLAMÉE. On pose le `user_id` comme le fait la
--      réclamation: la bouche existait déjà, elle gagne un compte.
update public.household_members
   set user_id = 'a8020000-0000-4000-8000-000000000004'
 where member_id = 'a8022222-0000-4000-8000-000000000003';
-- ⚠️ ET SON FOYER RESTE LE MÊME. On ne déplace personne: la personne réclame
-- une bouche de CE foyer, sinon la porte rendrait `not_a_member` et l'épreuve
-- passerait pour une autre raison que celle qu'on mesure.

-- 16c. Elle déclare à son tour, sur SA boîte, sur LE MÊME PLAT.
select pg_temp.assert_ok('16c la personne déclare sur SA boîte, même plat',
  public.keel_household_declare_share_outcome_for(
    'a8020000-0000-4000-8000-000000000004',
    'a8023333-0000-4000-8000-000000000001',
    5,
    'a8022222-0000-4000-8000-000000000003',
    'frozen', null, current_date));

-- 16d. ⛔ L'ÉPREUVE. MÊME plat, MÊME bouche, DEUX déclarants, DEUX lignes.
--      Une clé à trois colonnes en laisserait UNE.
select pg_temp.assert_eq(
  '16d ⛔ même bouche + même plat + deux déclarants = DEUX lignes',
  (select count(*) from public.meal_share_outcomes
    where generated_meal_id = 'a8023333-0000-4000-8000-000000000001'
      and dish_index = 5
      and member_id = 'a8022222-0000-4000-8000-000000000003'), 2);

-- 16e. Et les deux SORTS sont distincts: sans ça, « deux lignes » pourrait
--      être deux fois la même chose, et D8.3 n'aurait rien à trancher.
select pg_temp.assert_eq('16e les deux lignes disent des choses DIFFÉRENTES',
  (select count(distinct outcome) from public.meal_share_outcomes
    where generated_meal_id = 'a8023333-0000-4000-8000-000000000001'
      and dish_index = 5
      and member_id = 'a8022222-0000-4000-8000-000000000003'), 2);

-- 16f. ⛔ ET LA LIGNE DU MAÎTRE N'A PAS ÉTÉ CORRIGÉE. Une déclaration est un
--      fait; un fait ne se réécrit pas parce qu'un autre le contredit. C'est
--      le LECTEUR qui choisit (`resolveShareOutcomes`), pas la base.
select pg_temp.assert_eq('16f la ligne du maître est intacte',
  (select count(*) from public.meal_share_outcomes
    where dish_index = 5
      and declared_by = 'a8020000-0000-4000-8000-000000000001'
      and outcome = 'discarded'), 1);

select pg_temp.become_super();
rollback;
