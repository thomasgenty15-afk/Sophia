-- ============================================================================
-- KEEL — `keel_household_dissolve`, testée là où elle vit (Postgres).
--
-- MANUEL. Contre la base LOCALE, après `supabase migration up --local`:
--
--   docker cp supabase/tests/keel/household_dissolve_test.sql \
--     supabase_db_Sophia_2:/tmp/dissolve.sql
--   docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -f /tmp/dissolve.sql
--
-- Tout se joue dans UNE transaction terminée par ROLLBACK.
--
-- ── POURQUOI ICI, ET PAS EN TYPESCRIPT ─────────────────────────────────────
-- Les trois choses que cette porte doit prouver sont des comportements de BASE
-- qu'aucun faux ne peut rendre:
--
--   · le piège du `null` — une bouche SANS COMPTE porte `user_id is null`, et
--     `null <> v_user` ne rend PAS `true`. Une garde écrite sur `user_id`
--     aurait donc dit « il est seul » sur un foyer plein d'enfants, c'est-à-dire
--     ouvert la suppression exactement là où elle est interdite. C'est le cas 5,
--     et c'est le seul qui vaut ce fichier à lui tout seul;
--   · les CASCADES — ce que la suppression du foyer emporte, et ce qu'elle
--     laisse. La promesse faite à l'écran (« ton profil et ta direction ne
--     bougent pas ») est tenue par des clés étrangères, pas par du code;
--   · la clé SANS cascade de `student_generated_meals.household_id`
--     (`ON DELETE NO ACTION`), qui ferait remonter un 23503 brut si la garde
--     `household_has_plans` disparaissait.
--
-- CE QUI EST AFFIRMÉ
--   1. sans identité            -> not_authenticated
--   2. compte sans foyer        -> no_household
--   3. simple membre            -> not_owner
--   4. maître + une bouche      -> not_alone, et `others` compte juste
--   5. la bouche SANS COMPTE compte quand même (le piège du `null`)
--   6. maître + un plan composé -> household_has_plans
--   7. maître seul              -> ok, et le foyer n'existe plus
--   8. les cascades emportent la ligne de bouche et son corps
--   9. le profil et la ligne `student_goals` SURVIVENT (la promesse de l'écran)
-- ============================================================================

begin;

create or replace function pg_temp.assert_txt(label text, got text, want text)
returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAIL % : got %, want %', label, got, want;
  end if;
  raise notice 'PASS % (%)', label, got;
end;
$$;

create or replace function pg_temp.assert_eq(label text, got bigint, want bigint)
returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAIL % : got %, want %', label, got, want;
  end if;
  raise notice 'PASS % (%)', label, got;
end;
$$;

create or replace function pg_temp.mkuser(uid uuid, mail text)
returns void language plpgsql as $$
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated','authenticated',
    mail, 'x', now(), now(), now(), '{}', '{}')
  on conflict (id) do nothing;
end;
$$;

create or replace function pg_temp.become(uid uuid)
returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';
end;
$$;

create or replace function pg_temp.unbecome()
returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end;
$$;

/** Le motif rendu par la porte, pour l'appelant courant. */
create or replace function pg_temp.reason()
returns text language sql as $$
  select coalesce(public.keel_household_dissolve() ->> 'reason', 'ok');
$$;

-- ---------------------------------------------------------------------------
-- LES FIGURANTS
-- ---------------------------------------------------------------------------

do $$
begin
  perform pg_temp.mkuser('d1550000-0000-4000-8000-000000000001', 'dis-owner@example.com');
  perform pg_temp.mkuser('d1550000-0000-4000-8000-000000000002', 'dis-second@example.com');
  perform pg_temp.mkuser('d1550000-0000-4000-8000-000000000003', 'dis-nohouse@example.com');

  insert into public.households (id, name, created_by)
  values ('d1550000-0000-4000-8000-00000000000a', 'Chez le test', 'd1550000-0000-4000-8000-000000000001');

  insert into public.household_members (member_id, household_id, user_id, role, first_name)
  values
    ('d1550000-0000-4000-8000-0000000000b1', 'd1550000-0000-4000-8000-00000000000a',
     'd1550000-0000-4000-8000-000000000001', 'owner', 'Maitre'),
    -- ⚠️ SANS COMPTE, ET C'EST TOUT L'INTÉRÊT DE CETTE LIGNE. Voir le cas 5.
    ('d1550000-0000-4000-8000-0000000000b2', 'd1550000-0000-4000-8000-00000000000a',
     null, 'member', 'Enfant');

  -- Son corps, pour prouver la cascade au cas 8.
  insert into public.household_member_bodies
    (member_id, household_id, height_cm, weight_kg, gender)
  values ('d1550000-0000-4000-8000-0000000000b1', 'd1550000-0000-4000-8000-00000000000a',
          180, 75, 'male');

  -- Sa direction, pour prouver la SURVIE au cas 9.
  insert into public.student_goals (user_id, goal, content_locale)
  values ('d1550000-0000-4000-8000-000000000001', 'maintenance', 'fr-FR');
end;
$$;

-- ---------------------------------------------------------------------------
-- 1-3 · QUI N'A PAS LE DROIT
-- ---------------------------------------------------------------------------

do $$
begin
  perform pg_temp.assert_txt('1 sans identité', pg_temp.reason(), 'not_authenticated');
end;
$$;

do $$
begin
  perform pg_temp.become('d1550000-0000-4000-8000-000000000003');
  perform pg_temp.assert_txt('2 compte sans foyer', pg_temp.reason(), 'no_household');
  perform pg_temp.unbecome();
end;
$$;

do $$
begin
  -- Le second compte RÉCLAME la ligne de l'enfant: il devient un membre, pas
  -- un maître. C'est le seul chemin par lequel un non-maître peut appeler.
  update public.household_members
     set user_id = 'd1550000-0000-4000-8000-000000000002'
   where member_id = 'd1550000-0000-4000-8000-0000000000b2';
  perform pg_temp.become('d1550000-0000-4000-8000-000000000002');
  perform pg_temp.assert_txt('3 simple membre', pg_temp.reason(), 'not_owner');
  perform pg_temp.unbecome();
end;
$$;

-- ---------------------------------------------------------------------------
-- 4-5 · ON NE DÉFAIT PAS UN FOYER HABITÉ
-- ---------------------------------------------------------------------------

do $$
declare
  v jsonb;
begin
  perform pg_temp.become('d1550000-0000-4000-8000-000000000001');
  v := public.keel_household_dissolve();
  perform pg_temp.assert_txt('4a maître + une bouche', v ->> 'reason', 'not_alone');
  perform pg_temp.assert_eq('4b et il en compte une', (v ->> 'others')::bigint, 1);
  perform pg_temp.unbecome();
end;
$$;

do $$
declare
  v jsonb;
begin
  -- ⚠️ LE CAS QUI VAUT CE FICHIER. On rend sa ligne à l'enfant — SANS COMPTE,
  -- comme le produit nominal (« un enfant de huit ans est une bouche sans
  -- compte, c'est le cas NOMINAL »). Une garde écrite sur `user_id` aurait
  -- compté zéro « autre » ici, et la porte aurait effacé un foyer habité.
  update public.household_members
     set user_id = null
   where member_id = 'd1550000-0000-4000-8000-0000000000b2';
  perform pg_temp.become('d1550000-0000-4000-8000-000000000001');
  v := public.keel_household_dissolve();
  perform pg_temp.assert_txt('5a une bouche SANS COMPTE retient aussi', v ->> 'reason', 'not_alone');
  perform pg_temp.assert_eq('5b et elle est comptée', (v ->> 'others')::bigint, 1);
  perform pg_temp.unbecome();
end;
$$;

-- ---------------------------------------------------------------------------
-- 6 · UN FOYER QUI A DÉJÀ COMPOSÉ NE SE DÉFAIT PAS D'ICI
-- ---------------------------------------------------------------------------

do $$
declare
  v_cols text;
begin
  delete from public.household_members
   where member_id = 'd1550000-0000-4000-8000-0000000000b2';

  -- La table des repas composés a beaucoup de colonnes obligatoires et elles
  -- bougent; on n'en écrit QUE ce qui est nécessaire à la clé étrangère, en
  -- laissant la base remplir le reste. Si un jour elle refuse cet insert, ce
  -- test doit ROUGIR — pas se taire: la garde `household_has_plans` n'aurait
  -- alors plus rien à retenir.
  select string_agg(column_name, ',') into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'student_generated_meals'
    and is_nullable = 'NO' and column_default is null;
  raise notice 'colonnes obligatoires sans défaut de student_generated_meals: %', v_cols;
end;
$$;

do $$
declare
  v_ok boolean := false;
begin
  begin
    insert into public.student_generated_meals
      (user_id, household_id, mode, content_locale, starts_on, duration_days)
    values ('d1550000-0000-4000-8000-000000000001', 'd1550000-0000-4000-8000-00000000000a',
            'to_shop', 'fr-FR', current_date, 1);
    v_ok := true;
  exception when others then
    raise exception 'FAIL 6 : impossible de poser un repas composé (%). La garde household_has_plans n''est plus testée.', sqlerrm;
  end;

  perform pg_temp.become('d1550000-0000-4000-8000-000000000001');
  perform pg_temp.assert_txt('6 foyer qui a composé', pg_temp.reason(), 'household_has_plans');
  perform pg_temp.unbecome();

  delete from public.student_generated_meals
   where household_id = 'd1550000-0000-4000-8000-00000000000a';
end;
$$;

-- ---------------------------------------------------------------------------
-- 7-9 · LE MAÎTRE SEUL: CE QUI PART, ET CE QUI RESTE
-- ---------------------------------------------------------------------------

do $$
begin
  perform pg_temp.become('d1550000-0000-4000-8000-000000000001');
  perform pg_temp.assert_txt('7a maître seul', pg_temp.reason(), 'ok');
  perform pg_temp.unbecome();

  perform pg_temp.assert_eq(
    '7b le foyer n''existe plus',
    (select count(*) from public.households where id = 'd1550000-0000-4000-8000-00000000000a'),
    0);
  perform pg_temp.assert_eq(
    '8a sa ligne de bouche est partie avec',
    (select count(*) from public.household_members
      where member_id = 'd1550000-0000-4000-8000-0000000000b1'),
    0);
  perform pg_temp.assert_eq(
    '8b son corps de foyer aussi',
    (select count(*) from public.household_member_bodies
      where member_id = 'd1550000-0000-4000-8000-0000000000b1'),
    0);
  -- ⚠️ LA PROMESSE FAITE À L'ÉCRAN. « Ton profil, ta direction et ton poids
  -- visé ne bougent pas — tu continues seul. » Elle est tenue par l'absence de
  -- cascade sur ces deux tables-là, et par rien d'autre.
  perform pg_temp.assert_eq(
    '9a sa direction survit',
    (select count(*) from public.student_goals
      where user_id = 'd1550000-0000-4000-8000-000000000001'),
    1);
  perform pg_temp.assert_eq(
    '9b son profil survit',
    (select count(*) from public.profiles
      where id = 'd1550000-0000-4000-8000-000000000001'),
    1);
end;
$$;

rollback;
