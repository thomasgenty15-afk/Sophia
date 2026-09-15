#!/usr/bin/env bash
# LOT 1 — PREUVES EN BASE LOCALE. Lecture seule, plus une transaction ANNULÉE.
# Aucune ligne réelle n'est modifiée : les deux verrous morts (546, 502) restent
# en place comme pièces. Prérequis : Docker, pile locale, migration
# 20260915100000 appliquée (`supabase migration up`).
set -euo pipefail
C=${SUPABASE_DB_CONTAINER:-supabase_db_Sophia_2}
sql() { docker exec -i "$C" psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 "$@"; }

echo "== 0. la migration est installée =="
sql -At -c "select version from supabase_migrations.schema_migrations where version='20260915100000';" \
  | grep -q 20260915100000 || { echo "⛔ 20260915100000 absente : lancer 'supabase migration up'"; exit 2; }
sql -At -c "select 'stale_after = ' || public.keel_generation_stale_after();"

echo "== 1. les verrous morts, lus SOUS L'IDENTITÉ de leur propriétaire =="
sql <<'SQL'
do $$
declare l record; s jsonb; n int := 0;
begin
  for l in
    select k.request_id, k.actor_user_id, k.started_at, u.email
      from public.household_generation_lock k
      join auth.users u on u.id = k.actor_user_id
     where k.started_at < now() - public.keel_generation_stale_after()
     order by k.started_at
  loop
    perform set_config('request.jwt.claims',
      format('{"sub":"%s","role":"authenticated"}', l.actor_user_id), true);
    s := public.keel_household_request_status(l.request_id);
    raise notice '% | % | age % s | kind=%', l.email, l.started_at, s->>'age_seconds', s->>'kind';
    if s->>'kind' <> 'expired' then
      raise exception 'attendu expired, lu %', s->>'kind';
    end if;
    n := n + 1;
  end loop;
  raise notice '% verrou(x) périmé(s) lu(s) expired', n;
end $$;
SQL

echo "== 2. transaction ANNULÉE : prise après échéance, second exécuteur, bail faux =="
sql <<'SQL'
begin;
do $$
declare l record; s jsonb; c jsonb; n int;
begin
  select * into l from public.household_generation_lock order by started_at limit 1;
  if l is null then raise exception 'aucun verrou en base pour la fixture'; end if;
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', l.actor_user_id), true);

  s := public.keel_household_request_status(l.request_id);
  raise notice 'avant prise : kind=% (age % s)', s->>'kind', s->>'age_seconds';
  if s->>'kind' <> 'expired' then raise exception 'attendu expired'; end if;

  c := public.keel_household_claim_generation(
    l.household_id, gen_random_uuid(), 'preuve_lot1', l.actor_user_id,
    public.keel_generation_stale_after());
  raise notice 'prise neuve : ok=% reason=%', c->>'ok', coalesce(c->>'reason','-');
  if (c->>'ok')::boolean is not true then raise exception 'la prise devait balayer le bail périmé'; end if;

  select count(*) into n from public.household_generation_lock where request_id = l.request_id;
  raise notice 'ancien bail restant après la prise : %', n;
  if n <> 0 then raise exception 'le bail périmé devait disparaître'; end if;

  s := public.keel_household_request_status((c->>'request_id')::uuid);
  raise notice 'statut de la demande neuve : kind=%', s->>'kind';
  if s->>'kind' <> 'in_flight' then raise exception 'une prise fraîche doit se lire in_flight'; end if;

  s := public.keel_household_claim_generation(
    l.household_id, (c->>'request_id')::uuid, 'preuve_lot1', l.actor_user_id,
    public.keel_generation_stale_after());
  raise notice 'seconde prise, même demande : ok=% reason=%', s->>'ok', s->>'reason';
  if s->>'reason' <> 'in_flight' then raise exception 'deux exécuteurs vivants'; end if;

  s := public.keel_household_publish_generation(
    l.household_id, (c->>'request_id')::uuid, gen_random_uuid(), l.actor_user_id,
    'prepare_next', current_date, 3, null, '{}'::jsonb);
  raise notice 'publication avec un bail FAUX : ok=% reason=%', s->>'ok', s->>'reason';
  if s->>'reason' <> 'generation_lease_lost' then raise exception 'la publication devait refuser'; end if;
end $$;
rollback;
SQL

echo "== 3. les pièces sont intactes (rollback) =="
sql -At -F ' | ' -c "select request_id, started_at, floor(extract(epoch from now()-started_at)) as age_s from public.household_generation_lock order by started_at;"
sql -At -c "select 'brouillons pending/running périmés : ' || count(*) from public.student_meal_drafts where status in ('pending','running') and created_at < now() - public.keel_generation_stale_after();"
echo "== lot 1 : preuves en base OK =="
