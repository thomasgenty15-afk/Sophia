-- ============================================================================
-- INSCRIPTION LIBRE, COACH MAISON, FACTURATION, PASSAGE AU VRAI COACH
--
-- MANUEL. À jouer sur la base LOCALE :
--
--   docker cp supabase/tests/keel/free_signup_test.sql \
--     supabase_db_Sophia_2:/tmp/free_signup.sql
--   docker exec supabase_db_Sophia_2 psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f /tmp/free_signup.sql
--
-- POURQUOI ICI ET PAS EN DENO
-- Tout ce qui est sous test est un trigger, un index unique, une contrainte ou
-- une fonction SECURITY DEFINER. Les deux défauts que ce lot a trouvés avant
-- d'écrire une ligne — le paywall à J+15 et le refus du 4ᵉ inscrit — sont l'un
-- une fonction de solvabilité, l'autre un trigger BEFORE INSERT. Un test
-- TypeScript de la même logique aurait été vert le jour du défaut.
--
-- Tout tourne dans UNE transaction qui finit par ROLLBACK.
--
-- CE QUI EST ASSERTÉ
--   A. LE COACH MAISON
--      1. il existe, actif, avec une doctrine publiée NON VIDE
--      2. un SECOND coach maison est refusé par la base
--      3. il reste solvable APRÈS l'expiration de son essai de 14 jours
--         (= le paywall silencieux à J+15 sur tous les inscrits libres)
--      4. condition de désarmement: un coach HUMAIN dont l'essai expire
--         redevient insolvable
--   B. LA PORTE LIBRE
--      5. rattachement: lien actif + keel_role + locale en-US + pays déclaré
--      6. le siège est marqué 'free'
--      7. pays absent  -> refus `country_required`, AUCUN lien créé
--      8. pays malformé -> RAISE (R7), aucun lien
--      9. un pays déjà déclaré par l'élève n'est pas écrasé
--     10. ré-appel idempotent: toujours UN seul lien
--     11. un compte COACH est refusé (`caller_is_coach`)
--     12. dix inscrits libres passent — le plafond d'essai ne mord pas
--     13. condition de désarmement: le plafond mord toujours pour un humain
--   C. LA FACTURATION — le piège du lot
--     14. dix inscrits libres ACTIFS (≥ seuil d'interactions) -> zéro siège
--         facturable chez le coach maison
--     15. contre-factuel: le même élève chez un coach HUMAIN -> siège facturable
--     16. l'activité reste COMPTÉE (on nie la facturabilité, pas l'usage)
--     17. l'accès n'est pas la facturation: access_tier = 'student', et il le
--         reste après l'expiration de l'essai maison
--   D. LE PASSAGE AU VRAI COACH
--     18. l'invitation d'un vrai coach CLÔT le lien maison
--     19. exactement UN lien vivant après la bascule (pas de `.limit(1)`
--         arbitraire entre deux coachs)
--     20. un SECOND vrai coach est refusé (`already_coached`)
--     21. la maison ne peut PAS déplacer un vrai coach
--     22. invitation acceptée alors que le lien maison est déjà clos
--     23. le chemin d'invitation écrit TOUJOURS le pays du coach
--         (non-régression de 20260804180000)
--   E. L'HISTORIQUE
--     24. le nouveau coach ne lit pas les repas d'avant son arrivée
--     25. il lit bien ceux d'après
--     26. la SÉCURITÉ n'est pas planchonnée (allergies visibles quelle que soit
--         leur date)
--     27. un `started_at` NULL ne cache rien à un coach en exercice
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

create or replace function pg_temp.assert_txt(label text, got text, want text)
returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAIL % : got %, want %', label, coalesce(got,'<null>'), coalesce(want,'<null>');
  end if;
  raise notice 'PASS % (%)', label, coalesce(got,'<null>');
end;
$$;

create or replace function pg_temp.assert_true(label text, got boolean)
returns void language plpgsql as $$
begin
  if got is not true then
    raise exception 'FAIL % : expected true, got %', label, coalesce(got::text,'<null>');
  end if;
  raise notice 'PASS %', label;
end;
$$;

create or replace function pg_temp.assert_false(label text, got boolean)
returns void language plpgsql as $$
begin
  if got is not false then
    raise exception 'FAIL % : expected false, got %', label, coalesce(got::text,'<null>');
  end if;
  raise notice 'PASS %', label;
end;
$$;

-- Impersonate an authenticated user the way PostgREST does.
create or replace function pg_temp.become(uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', uid, 'role', 'authenticated')::text,
                     true);
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

-- ---------------------------------------------------------------------------
-- A. LE COACH MAISON
-- ---------------------------------------------------------------------------

do $$
declare
  v_house uuid;
  v_beliefs integer;
begin
  select id into v_house from public.coaches where coach_kind = 'house' and status = 'active';
  perform pg_temp.assert_true('A1a the house coach exists and is active', v_house is not null);

  select jsonb_array_length(beliefs) into v_beliefs
  from public.coach_doctrines
  where coach_id = v_house and published_at is not null;
  perform pg_temp.assert_true('A1b its doctrine is published and NOT empty', coalesce(v_beliefs,0) > 0);
  perform pg_temp.assert_true('A1c keel_free_signup_available()', public.keel_free_signup_available());
end;
$$;

do $$
declare
  v_refused boolean := false;
begin
  perform pg_temp.mkuser('aaaa0000-0000-4000-8000-000000000001', 'house2@example.com');
  begin
    insert into public.coaches (user_id, display_name, status, coach_kind)
    values ('aaaa0000-0000-4000-8000-000000000001', 'Second house', 'active', 'house');
  exception when unique_violation then
    v_refused := true;
  end;
  perform pg_temp.assert_true('A2 a SECOND house coach is refused by the database', v_refused);
end;
$$;

do $$
declare
  v_house uuid := (select id from public.coaches where coach_kind = 'house');
begin
  -- L'ESSAI DE 14 JOURS EXPIRE. `_trg_coaches_default_trial_end` l'a posé à
  -- l'insertion; personne ne l'a choisi. C'était le paywall silencieux.
  update public.coaches set trial_ends_at = now() - interval '1 day' where id = v_house;
  perform pg_temp.assert_true(
    'A3 the house coach is STILL solvent after its 14-day trial elapsed',
    public.keel_coach_is_solvent(v_house));
end;
$$;

do $$
declare
  v_human uuid;
begin
  perform pg_temp.mkuser('aaaa0000-0000-4000-8000-000000000002', 'humancoach@example.com');
  insert into public.coaches (user_id, display_name, status, coach_kind, trial_ends_at)
  values ('aaaa0000-0000-4000-8000-000000000002', 'Marc', 'active', 'human', now() - interval '1 day')
  returning id into v_human;
  perform pg_temp.assert_false(
    'A4 DISARM CONDITION: a HUMAN coach whose trial elapsed is insolvent',
    public.keel_coach_is_solvent(v_human));
end;
$$;

-- ---------------------------------------------------------------------------
-- B. LA PORTE LIBRE
-- ---------------------------------------------------------------------------

do $$
declare
  v_house uuid := (select id from public.coaches where coach_kind = 'house');
  v_res jsonb;
  v_link record;
  v_prof record;
begin
  perform pg_temp.mkuser('bbbb0000-0000-4000-8000-000000000001', 'free1@example.com');
  perform pg_temp.become('bbbb0000-0000-4000-8000-000000000001');
  v_res := public.keel_join_house_coach('GB');
  perform pg_temp.unbecome();

  perform pg_temp.assert_true('B5a joined', (v_res->>'joined')::boolean);

  select status, coach_id, seat_state into v_link
  from public.coach_clients where student_user_id = 'bbbb0000-0000-4000-8000-000000000001';
  perform pg_temp.assert_txt('B5b the link is active', v_link.status, 'active');
  perform pg_temp.assert_true('B5c it points at the house coach', v_link.coach_id = v_house);
  perform pg_temp.assert_txt('B6 the seat is marked free', v_link.seat_state, 'free');

  select keel_role, locale, country into v_prof
  from public.profiles where id = 'bbbb0000-0000-4000-8000-000000000001';
  perform pg_temp.assert_txt('B5d keel_role', v_prof.keel_role, 'student');
  perform pg_temp.assert_txt('B5e locale', v_prof.locale, 'en-US');
  -- LE POINT LE PLUS IMPORTANT DU LOT. Un pays absent ici, et le résolveur de
  -- crise le déduit de la langue (en-US) -> hotline américaine pour un
  -- britannique, sans lever de fallback.
  perform pg_temp.assert_txt('B5f the DECLARED country is written', v_prof.country, 'GB');
end;
$$;

do $$
declare
  v_res jsonb;
begin
  perform pg_temp.mkuser('bbbb0000-0000-4000-8000-000000000002', 'free2@example.com');
  perform pg_temp.become('bbbb0000-0000-4000-8000-000000000002');
  v_res := public.keel_join_house_coach(null);
  perform pg_temp.unbecome();
  perform pg_temp.assert_false('B7a no country -> refused', (v_res->>'joined')::boolean);
  perform pg_temp.assert_txt('B7b reason', v_res->>'reason', 'country_required');
  perform pg_temp.assert_eq('B7c and NO link was created',
    (select count(*) from public.coach_clients
      where student_user_id = 'bbbb0000-0000-4000-8000-000000000002'), 0);
  perform pg_temp.assert_txt('B7d keel_role stays null',
    (select coalesce(keel_role,'<null>') from public.profiles
      where id = 'bbbb0000-0000-4000-8000-000000000002'), '<null>');
end;
$$;

do $$
declare
  v_raised boolean := false;
begin
  perform pg_temp.mkuser('bbbb0000-0000-4000-8000-000000000003', 'free3@example.com');
  perform pg_temp.become('bbbb0000-0000-4000-8000-000000000003');
  begin
    perform public.keel_join_house_coach('Royaume-Uni');
  exception when others then
    v_raised := true;
  end;
  perform pg_temp.unbecome();
  perform pg_temp.assert_true('B8a a malformed country RAISES (R7)', v_raised);
  perform pg_temp.assert_eq('B8b and no link was created',
    (select count(*) from public.coach_clients
      where student_user_id = 'bbbb0000-0000-4000-8000-000000000003'), 0);
end;
$$;

do $$
declare
  v_res jsonb;
begin
  perform pg_temp.mkuser('bbbb0000-0000-4000-8000-000000000004', 'free4@example.com');
  update public.profiles set country = 'CA' where id = 'bbbb0000-0000-4000-8000-000000000004';
  perform pg_temp.become('bbbb0000-0000-4000-8000-000000000004');
  v_res := public.keel_join_house_coach('US');
  perform pg_temp.unbecome();
  perform pg_temp.assert_true('B9a joined', (v_res->>'joined')::boolean);
  perform pg_temp.assert_txt('B9b a country the STUDENT declared is never overwritten',
    (select country from public.profiles where id = 'bbbb0000-0000-4000-8000-000000000004'), 'CA');
end;
$$;

do $$
declare
  v_res jsonb;
begin
  perform pg_temp.become('bbbb0000-0000-4000-8000-000000000001');
  v_res := public.keel_join_house_coach('GB');
  perform pg_temp.unbecome();
  perform pg_temp.assert_true('B10a re-joining is idempotent', (v_res->>'joined')::boolean);
  perform pg_temp.assert_eq('B10b still exactly ONE link',
    (select count(*) from public.coach_clients
      where student_user_id = 'bbbb0000-0000-4000-8000-000000000001'), 1);
end;
$$;

do $$
declare
  v_res jsonb;
begin
  perform pg_temp.become('aaaa0000-0000-4000-8000-000000000002');  -- Marc, a coach
  v_res := public.keel_join_house_coach('FR');
  perform pg_temp.unbecome();
  perform pg_temp.assert_false('B11a a coach account is refused', (v_res->>'joined')::boolean);
  perform pg_temp.assert_txt('B11b reason', v_res->>'reason', 'caller_is_coach');
end;
$$;

-- Dix inscrits libres. Sans l'exemption, le 4ᵉ lève
-- `keel_trial_seat_limit_reached` (trial_seat_limit = 3).
do $$
declare
  i integer;
  v_uid uuid;
  v_res jsonb;
begin
  for i in 1..10 loop
    v_uid := ('cccc0000-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid;
    perform pg_temp.mkuser(v_uid, 'freerun' || i || '@example.com');
    perform pg_temp.become(v_uid);
    v_res := public.keel_join_house_coach('US');
    perform pg_temp.unbecome();
    if (v_res->>'joined')::boolean is not true then
      raise exception 'FAIL B12 : free signup #% refused (%)', i, v_res->>'reason';
    end if;
  end loop;
  perform pg_temp.assert_eq('B12 ten free signups all get a live house seat',
    (select count(*) from public.coach_clients
      where coach_id = (select id from public.coaches where coach_kind='house')
        and status = 'active'
        and student_user_id::text like 'cccc0000%'), 10);
end;
$$;

do $$
declare
  v_human uuid := (select id from public.coaches where user_id = 'aaaa0000-0000-4000-8000-000000000002');
  i integer;
  v_uid uuid;
  v_capped boolean := false;
begin
  -- Marc n'a pas d'abonnement: plafond d'essai à 3.
  for i in 1..4 loop
    v_uid := ('dddd0000-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid;
    perform pg_temp.mkuser(v_uid, 'marcstu' || i || '@example.com');
    begin
      insert into public.coach_clients (coach_id, student_user_id, status, consent_granted_at, started_at)
      values (v_human, v_uid, 'active', now(), now());
    exception when check_violation then
      v_capped := true;
    end;
  end loop;
  perform pg_temp.assert_true(
    'B13 DISARM CONDITION: the trial cap still bites for a HUMAN coach (4th seat)', v_capped);
end;
$$;

-- ---------------------------------------------------------------------------
-- C. LA FACTURATION
-- ---------------------------------------------------------------------------

do $$
declare
  v_house uuid := (select id from public.coaches where coach_kind='house');
  v_human uuid := (select id from public.coaches where user_id = 'aaaa0000-0000-4000-8000-000000000002');
  i integer;
  v_uid uuid;
  v_billable bigint;
  v_counted bigint;
begin
  -- Les dix inscrits libres INTERAGISSENT: 4 messages chacun, soit au-dessus du
  -- seuil `keel_active_student_threshold()` = 3.
  for i in 1..10 loop
    v_uid := ('cccc0000-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid;
    insert into public.chat_messages (user_id, role, content, scope, created_at)
    select v_uid, 'user', 'hello ' || g, 'keel', date_trunc('month', now()) + interval '2 days'
    from generate_series(1,4) g;
  end loop;

  select count(*) filter (where is_active_seat) into v_billable
  from public.keel_coach_seat_ledger(v_house, date_trunc('month', now())::date);
  perform pg_temp.assert_eq(
    'C14a ten ACTIVE free signups -> ZERO billable seat on the house coach', v_billable, 0);

  select min(interaction_count) into v_counted
  from public.keel_coach_seat_ledger(v_house, date_trunc('month', now())::date)
  where student_user_id::text like 'cccc0000%';
  perform pg_temp.assert_eq(
    'C16 their activity is still COUNTED (we deny billability, not usage)', v_counted, 4);

  -- CONTRE-FACTUEL. Même élève, mêmes interactions, coach HUMAIN: siège
  -- facturable. Une garde qu'on n'a pas vue mordre est une garde qu'on croit
  -- sur parole — et son inverse doit mordre aussi.
  --
  -- Un coach humain NEUF, pas Marc: Marc a déjà ses 3 sièges d'essai depuis B13,
  -- et le 4ᵉ lèverait `keel_trial_seat_limit_reached`. Ce plafond-là est
  -- justement celui que B13 vient de prouver encore armé.
  perform pg_temp.mkuser('aaaa0000-0000-4000-8000-000000000004', 'paying-coach@example.com');
  insert into public.coaches (user_id, display_name, status, coach_kind, trial_ends_at)
  values ('aaaa0000-0000-4000-8000-000000000004', 'Léa Fournier', 'active', 'human',
          now() + interval '30 days')
  returning id into v_human;

  perform pg_temp.mkuser('eeee0000-0000-4000-8000-000000000001', 'paying@example.com');
  insert into public.coach_clients (coach_id, student_user_id, status, consent_granted_at, started_at)
  values (v_human, 'eeee0000-0000-4000-8000-000000000001', 'active', now(), now());
  insert into public.chat_messages (user_id, role, content, scope, created_at)
  select 'eeee0000-0000-4000-8000-000000000001', 'user', 'hi ' || g, 'keel',
         date_trunc('month', now()) + interval '2 days'
  from generate_series(1,4) g;

  select count(*) filter (where is_active_seat) into v_billable
  from public.keel_coach_seat_ledger(v_human, date_trunc('month', now())::date)
  where student_user_id = 'eeee0000-0000-4000-8000-000000000001';
  perform pg_temp.assert_eq(
    'C15 CONTRE-FACTUEL: the same student under a HUMAN coach IS a billable seat',
    v_billable, 1);
end;
$$;

do $$
declare
  v_house uuid := (select id from public.coaches where coach_kind='house');
begin
  -- L'ACCÈS N'EST PAS LA FACTURATION. `recompute_profile_access_tier` ne lit pas
  -- `seat_state`: un siège gratuit donne accès exactement comme un siège
  -- facturé. Et l'essai maison est expiré depuis A3, donc c'est bien
  -- l'exemption de solvabilité qui tient l'accès ici.
  perform public.recompute_profile_access_tier('cccc0000-0000-4000-8000-000000000001');
  perform pg_temp.assert_txt(
    'C17a a free signup has access_tier student, house trial elapsed and all',
    (select access_tier from public.profiles where id = 'cccc0000-0000-4000-8000-000000000001'),
    'student');
  perform pg_temp.assert_true('C17b and the house coach is still solvent',
    public.keel_coach_is_solvent(v_house));
end;
$$;

-- ---------------------------------------------------------------------------
-- D. LE PASSAGE AU VRAI COACH
-- ---------------------------------------------------------------------------

create or replace function pg_temp.invite(p_coach uuid, p_email text, p_token text)
returns void language plpgsql as $$
begin
  insert into public.coach_invitations (coach_id, email, invite_token_hash, expires_at, status)
  values (p_coach, lower(p_email), public.coach_invite_token_hash(p_token),
          now() + interval '7 days', 'pending');
end;
$$;

do $$
declare
  v_house uuid := (select id from public.coaches where coach_kind='house');
  v_real uuid;
  v_res jsonb;
  v_live bigint;
begin
  -- Un VRAI coach, solvable, avec un pays déclaré.
  perform pg_temp.mkuser('aaaa0000-0000-4000-8000-000000000003', 'realcoach@example.com');
  update public.profiles set country = 'GB' where id = 'aaaa0000-0000-4000-8000-000000000003';
  insert into public.coaches (user_id, display_name, status, coach_kind, trial_ends_at)
  values ('aaaa0000-0000-4000-8000-000000000003', 'Sarah Kent', 'active', 'human',
          now() + interval '30 days')
  returning id into v_real;

  -- L'inscrit libre bbbb...0001 (pays GB déclaré, lié à la maison) est invité.
  perform pg_temp.invite(v_real, 'free1@example.com', 'tok_transfer_0000000000001');
  v_res := public.accept_coach_invitation_for_user(
    'bbbb0000-0000-4000-8000-000000000001', 'tok_transfer_0000000000001');
  perform pg_temp.assert_true('D18a the real coach''s invitation is accepted',
    (v_res->>'accepted')::boolean);

  perform pg_temp.assert_eq('D18b the HOUSE link is closed',
    (select count(*) from public.coach_clients
      where student_user_id = 'bbbb0000-0000-4000-8000-000000000001'
        and coach_id = v_house and status = 'ended'), 1);

  select count(*) into v_live from public.coach_clients
   where student_user_id = 'bbbb0000-0000-4000-8000-000000000001'
     and status in ('invited','active');
  perform pg_temp.assert_eq(
    'D19 exactly ONE live link after the switch (no arbitrary .limit(1))', v_live, 1);
  perform pg_temp.assert_true('D19b and it is the real coach''s',
    (select coach_id from public.coach_clients
      where student_user_id = 'bbbb0000-0000-4000-8000-000000000001'
        and status = 'active') = v_real);

  -- UN SECOND VRAI COACH: refus. Un élève ne change pas de vrai coach par une
  -- invitation, il passe par revoke_coach_access().
  perform pg_temp.invite((select id from public.coaches where user_id = 'aaaa0000-0000-4000-8000-000000000002'),
                         'free1@example.com', 'tok_second_real_000000000001');
  v_res := public.accept_coach_invitation_for_user(
    'bbbb0000-0000-4000-8000-000000000001', 'tok_second_real_000000000001');
  perform pg_temp.assert_false('D20a a SECOND real coach is refused',
    (v_res->>'accepted')::boolean);
  perform pg_temp.assert_txt('D20b reason', v_res->>'reason', 'already_coached');

  -- LA MAISON NE DÉPLACE PERSONNE.
  perform pg_temp.become('bbbb0000-0000-4000-8000-000000000001');
  v_res := public.keel_join_house_coach('GB');
  perform pg_temp.unbecome();
  perform pg_temp.assert_false('D21a the house coach cannot displace a real coach',
    (v_res->>'joined')::boolean);
  perform pg_temp.assert_txt('D21b reason', v_res->>'reason', 'already_coached');
  perform pg_temp.assert_true('D21c the real coach still holds the live link',
    (select coach_id from public.coach_clients
      where student_user_id = 'bbbb0000-0000-4000-8000-000000000001'
        and status = 'active') = v_real);
end;
$$;

do $$
declare
  v_real uuid := (select id from public.coaches where user_id = 'aaaa0000-0000-4000-8000-000000000003');
  v_house uuid := (select id from public.coaches where coach_kind='house');
  v_res jsonb;
begin
  -- INVITATION ACCEPTÉE ALORS QUE LE LIEN MAISON EST DÉJÀ CLOS.
  -- L'inscrit libre cccc...02 quitte la maison de son propre chef, puis accepte.
  update public.coach_clients set status = 'ended', ended_at = now()
   where student_user_id = 'cccc0000-0000-4000-8000-000000000002' and coach_id = v_house;

  perform pg_temp.invite(v_real, 'freerun2@example.com', 'tok_house_closed_00000000001');
  v_res := public.accept_coach_invitation_for_user(
    'cccc0000-0000-4000-8000-000000000002', 'tok_house_closed_00000000001');
  perform pg_temp.assert_true('D22a accepted with the house link already closed',
    (v_res->>'accepted')::boolean);
  perform pg_temp.assert_eq('D22b one live link, the real coach''s',
    (select count(*) from public.coach_clients
      where student_user_id = 'cccc0000-0000-4000-8000-000000000002'
        and status = 'active' and coach_id = v_real), 1);

  -- NON-RÉGRESSION 20260804180000: un élève dont le pays est NULL hérite du pays
  -- DÉCLARÉ du coach. Sans cette ligne, la hotline vient de la langue.
  perform pg_temp.mkuser('bbbb0000-0000-4000-8000-000000000009', 'inherit@example.com');
  perform pg_temp.invite(v_real, 'inherit@example.com', 'tok_country_inherit_000000001');
  v_res := public.accept_coach_invitation_for_user(
    'bbbb0000-0000-4000-8000-000000000009', 'tok_country_inherit_000000001');
  perform pg_temp.assert_true('D23a accepted', (v_res->>'accepted')::boolean);
  perform pg_temp.assert_txt('D23b the invitation path STILL writes the coach''s country',
    (select country from public.profiles where id = 'bbbb0000-0000-4000-8000-000000000009'), 'GB');
  perform pg_temp.assert_txt('D23c and the product locale',
    (select locale from public.profiles where id = 'bbbb0000-0000-4000-8000-000000000009'), 'en-US');
end;
$$;

-- ---------------------------------------------------------------------------
-- E. L'HISTORIQUE
-- ---------------------------------------------------------------------------

do $$
declare
  v_real_user uuid := 'aaaa0000-0000-4000-8000-000000000003';  -- Sarah Kent
  v_student uuid := 'bbbb0000-0000-4000-8000-000000000001';
  v_started timestamptz;
  v_seen bigint;
begin
  select started_at into v_started from public.coach_clients
   where student_user_id = v_student and status = 'active';

  -- Deux repas: un AVANT l'arrivée de Sarah (sous le programme de découverte),
  -- un APRÈS.
  insert into public.protocol_events (user_id, occurred_at, local_date, source, content_locale)
  values (v_student, v_started - interval '10 days', (v_started - interval '10 days')::date, 'photo', 'en-US'),
         (v_student, v_started + interval '1 day',  (v_started + interval '1 day')::date,  'photo', 'en-US');

  perform pg_temp.become(v_real_user);
  select count(*) into v_seen from public.coach_student_events where user_id = v_student;
  perform pg_temp.unbecome();

  perform pg_temp.assert_eq(
    'E24/E25 the new coach reads only what follows their arrival (1 of 2 meals)', v_seen, 1);

  perform pg_temp.become(v_real_user);
  select count(*) into v_seen from public.coach_student_events
   where user_id = v_student and occurred_at < v_started;
  perform pg_temp.unbecome();
  perform pg_temp.assert_eq('E24b nothing from before the switch is readable', v_seen, 0);
end;
$$;

do $$
declare
  v_real_user uuid := 'aaaa0000-0000-4000-8000-000000000003';
  v_student uuid := 'bbbb0000-0000-4000-8000-000000000001';
  v_started timestamptz;
  v_seen bigint;
begin
  select started_at into v_started from public.coach_clients
   where student_user_id = v_student and status = 'active';

  -- UNE ALLERGIE SAISIE AVANT L'ARRIVÉE DU COACH. Elle doit rester visible: un
  -- plancher sur la sécurité serait un verrou désarmé par une date.
  insert into public.student_safety_constraints
    (user_id, kind, allergen_ref, severity, declared_by, content_locale, created_at)
  values (v_student, 'allergy', 'peanut', 'medical', 'student', 'en-US',
          v_started - interval '20 days');

  perform pg_temp.become(v_real_user);
  select count(*) into v_seen from public.student_safety_constraints
   where user_id = v_student and allergen_ref = 'peanut';
  perform pg_temp.unbecome();
  perform pg_temp.assert_eq(
    'E26 SAFETY is NOT floored: an allergy recorded before the switch stays visible',
    v_seen, 1);
end;
$$;

do $$
declare
  v_human_user uuid := 'aaaa0000-0000-4000-8000-000000000004';  -- Léa Fournier
  v_student uuid := 'eeee0000-0000-4000-8000-000000000001';
  v_seen bigint;
begin
  -- `started_at` NULL: des liens d'avant W10 en portent. Le plancher doit alors
  -- ne RIEN cacher — une donnée manquante ne retire pas un accès légitime.
  update public.coach_clients set started_at = null
   where student_user_id = v_student
     and coach_id = (select id from public.coaches where user_id = v_human_user);
  insert into public.protocol_events (user_id, occurred_at, local_date, source, content_locale)
  values (v_student, now() - interval '400 days', (now() - interval '400 days')::date, 'photo', 'en-US');

  perform pg_temp.become(v_human_user);
  select count(*) into v_seen from public.coach_student_events where user_id = v_student;
  perform pg_temp.unbecome();
  perform pg_temp.assert_eq(
    'E27 a NULL started_at hides nothing from a coach in exercise', v_seen, 1);
end;
$$;

rollback;
