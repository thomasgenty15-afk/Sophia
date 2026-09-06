-- ===========================================================================
-- `student_meal_drafts` — LE PLAFOND DE CONCURRENCE, LES DEUX CHECKS, ET LA
-- BALAYEUSE. Dans les DEUX SENS.
--
-- ⛔ LA MOITIÉ QU'ON OUBLIE EST CELLE QUI PASSE. Une contrainte qui refuse TOUT
-- ressemble exactement à une contrainte qui marche: elle rougit sur le cas
-- fautif. Ce fichier tient donc, pour chaque garde, un cas refusé ET un cas
-- accepté.
--
-- ⚠️ CE TEST NE TOURNE PAS DANS `agent-gate.sh` — aucun test SQL n'y tourne. Il
-- se lance à la main, comme ses voisins (docs/keel/TESTING.md):
--
--   docker cp supabase/tests/keel/meal_drafts_test.sql \
--     supabase_db_Sophia_2:/tmp/t.sql \
--     && docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -f /tmp/t.sql
--
-- La migration 20260906230000 porte la MÊME preuve, mais elle ne joue qu'UNE
-- fois, au moment de l'application. Ce fichier la rejoue à volonté — c'est ce
-- qui permet de vérifier que la table d'une base déjà migrée mord encore.
--
-- Il n'écrit RIEN: tout se passe dans une transaction annulée à la fin.
-- ===========================================================================

begin;

do $$
declare
  probe uuid := gen_random_uuid();
  first_row uuid;
  meal_row uuid;
  v_status text;
  v_code text;
  refuses int := 0;
  passe   int := 0;
  swept record;
begin
  insert into auth.users (id, instance_id, aud, role, email)
  values (probe, '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'draft-sqltest-' || probe::text || '@keel.invalid');

  -- ── ① UNE SEULE COMPOSITION EN VOL, ARBITRÉE PAR L'INDEX ────────────────
  insert into public.student_meal_drafts
    (user_id, plan_kind, lane, status, request_id, idempotency_key, mode,
     request_body, source_version)
  values (probe, 'household', 'household_meal', 'running', 'req-1', 'cle-1',
          'sync', '{"days":3}'::jsonb, 'vX|draft_store.v1')
  returning id into first_row;
  passe := passe + 1;

  begin
    insert into public.student_meal_drafts
      (user_id, status, request_id, idempotency_key, mode, request_body, source_version)
    values (probe, 'running', 'req-2', 'cle-2', 'async', '{"days":1}'::jsonb,
            'vX|draft_store.v1');
    raise exception 'NON REFUSÉ: deux compositions en vol pour une personne';
  exception when unique_violation then refuses := refuses + 1;
  end;

  begin
    insert into public.student_meal_drafts
      (user_id, status, request_id, idempotency_key, mode, request_body, source_version)
    values (probe, 'pending', 'req-3', 'cle-3', 'async', '{"days":1}'::jsonb,
            'vX|draft_store.v1');
    raise exception 'NON REFUSÉ: un pending a été accepté à côté d''un running';
  exception when unique_violation then refuses := refuses + 1;
  end;

  -- ── ② UN `done` PORTE CE QUI SERA ÉCRIT, ET CE QUI A ÉTÉ RELU ───────────
  begin
    update public.student_meal_drafts
       set status = 'done', response = '{"dishes":[]}'::jsonb
     where id = first_row;
    raise exception 'NON REFUSÉ: un done sans write_payload';
  exception when check_violation then refuses := refuses + 1;
  end;

  begin
    update public.student_meal_drafts
       set status = 'done', write_payload = '{"dishes":[]}'::jsonb, response = null
     where id = first_row;
    raise exception 'NON REFUSÉ: un done sans response';
  exception when check_violation then refuses := refuses + 1;
  end;

  update public.student_meal_drafts
     set status = 'done',
         write_payload = '{"plan_kind":"household","dishes":[{"title":"probe"}]}'::jsonb,
         response = '{"dishes":[{"title":"probe"}]}'::jsonb,
         safety_fingerprint = 'deadbeef',
         finished_at = now()
   where id = first_row;
  passe := passe + 1;

  -- ── ③ UNE ADOPTION NOMME LA LIGNE ÉCRITE ────────────────────────────────
  begin
    update public.student_meal_drafts
       set status = 'adopted', adopted_at = now()
     where id = first_row;
    raise exception 'NON REFUSÉ: un adopted sans adopted_meal_id';
  exception when check_violation then refuses := refuses + 1;
  end;

  -- ⚠️ `starts_on` ET `duration_days` SONT EXIGÉS (mesuré: `not null` sur
  -- `starts_on`), et la fenêtre est posée loin devant pour ne croiser aucune
  -- ligne vivante — l'exclusion `student_generated_meals_live_windows_dont_overlap`
  -- refuserait deux plans qui se chevauchent.
  insert into public.student_generated_meals
    (user_id, mode, content_locale, starts_on, duration_days)
  values (probe, 'to_shop', 'fr-FR', current_date + 400, 1::smallint)
  returning id into meal_row;

  begin
    update public.student_meal_drafts
       set status = 'adopted', adopted_meal_id = meal_row, adopted_at = null
     where id = first_row;
    raise exception 'NON REFUSÉ: un adopted sans adopted_at';
  exception when check_violation then refuses := refuses + 1;
  end;

  update public.student_meal_drafts
     set status = 'adopted', adopted_meal_id = meal_row, adopted_at = now()
   where id = first_row;
  passe := passe + 1;

  -- ── ④ ET LA PLACE EST LIBÉRÉE: `done`/`adopted` ne comptent plus ────────
  insert into public.student_meal_drafts
    (user_id, status, request_id, idempotency_key, mode, request_body, source_version,
     started_at)
  values (probe, 'running', 'req-4', 'cle-4', 'async', '{"days":1}'::jsonb,
          'vX|draft_store.v1', now() - interval '10 minutes');
  passe := passe + 1;

  -- ── ⑤ LA BALAYEUSE: elle NOMME ce qu'elle fait tomber, et rien d'autre ──
  -- ⚠️ `write_payload` ET `response` DÈS L'INSERTION: le CHECK mord aussi à
  -- l'insert, pas seulement à l'update — les poser après ferait échouer ce
  -- test sur la garde qu'il vient de prouver.
  insert into public.student_meal_drafts
    (user_id, status, request_id, idempotency_key, mode, request_body, source_version,
     started_at, expires_at, write_payload, response)
  values (probe, 'done', 'req-5', 'cle-5', 'sync', '{"days":1}'::jsonb,
          'vX|draft_store.v1', now(), now() + interval '24 hours',
          '{"dishes":[]}'::jsonb, '{"dishes":[]}'::jsonb);
  passe := passe + 1;

  select * into swept from public.keel_sweep_meal_drafts();
  if swept.timed_out < 1 then
    raise exception 'la balayeuse n''a pas fait tomber la composition bloquée';
  end if;

  select status, error_code into v_status, v_code
    from public.student_meal_drafts where user_id = probe and request_id = 'req-4';
  if v_status is distinct from 'failed' or v_code is distinct from 'timed_out' then
    raise exception 'après balayage: statut=%, code=%', v_status, v_code;
  end if;

  select status into v_status
    from public.student_meal_drafts where user_id = probe and request_id = 'req-5';
  if v_status is distinct from 'done' then
    raise exception 'la balayeuse a touché un aperçu frais (%)', v_status;
  end if;

  -- Périmé ⇒ effacé.
  update public.student_meal_drafts set expires_at = now() - interval '1 minute'
   where user_id = probe and request_id = 'req-5';
  perform public.keel_sweep_meal_drafts();
  if exists (select 1 from public.student_meal_drafts
              where user_id = probe and request_id = 'req-5') then
    raise exception 'un aperçu périmé a survécu au balayage';
  end if;

  -- ── ⑥ LE CRON EXISTE — un balayage non planifié est un balayage qui ne
  --     tourne pas, et l'index unique resterait tenu par une ligne morte.
  if not exists (select 1 from cron.job where jobname = 'keel-sweep-meal-drafts') then
    raise exception 'le cron keel-sweep-meal-drafts n''est pas planifié';
  end if;

  -- ── ⑦ LE PLAN EFFACÉ EMPORTE SON BROUILLON, SANS EXCEPTION ─────────────
  -- Avec `on delete set null`, cette suppression mettrait `adopted_meal_id` à
  -- nul sur une ligne `adopted` — `check_violation` sur le chemin de la purge
  -- RGPD. C'est l'arbitrage écrit dans la migration.
  delete from public.student_generated_meals where id = meal_row;
  if exists (select 1 from public.student_meal_drafts where id = first_row) then
    raise exception 'le brouillon adopté a survécu à la suppression du plan';
  end if;

  if refuses <> 6 or passe <> 5 then
    raise exception 'attendu 6 refus et 5 passages, obtenu % et %', refuses, passe;
  end if;

  delete from auth.users where id = probe;
  if exists (select 1 from public.student_meal_drafts where user_id = probe) then
    raise exception 'un brouillon a survécu à la suppression du compte';
  end if;

  raise notice 'student_meal_drafts: 6 refus, 5 passages, balayeuse et cron — ok';
end $$;

rollback;
