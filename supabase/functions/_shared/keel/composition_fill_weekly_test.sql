-- ============================================================================
-- V0-B · LES COMPTEURS DE COMPOSITION, ÉPROUVÉS EN BASE.
--
-- Migration sous test:
--   supabase/migrations/20260821225000_les_compteurs_de_composition_cessent_de_mentir.sql
--
-- MANUEL. Contre la base LOCALE:
--
--   docker cp supabase/functions/_shared/keel/composition_fill_weekly_test.sql \
--     supabase_db_Sophia_2:/tmp/fill_weekly.sql
--   docker exec supabase_db_Sophia_2 psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f /tmp/fill_weekly.sql
--
-- ⚠️ Tout se passe dans une transaction ROLLBACK: la base ressort intacte.
--
-- POURQUOI EN SQL ET PAS EN DENO
-- ------------------------------
-- Les trois choses affirmées ici sont des propriétés du SCHÉMA — une nullité,
-- une clause de vue, une `reloption`. Un test TypeScript de la même idée serait
-- vert le jour où la migration serait absente de la base, et c'est exactement la
-- classe de défaut que ce dépôt paie (« la garde était prouvée sur la fonction
-- et jamais sur le câblage »). En particulier `security_invoker` est INVISIBLE
-- à tout test qui ne lit pas `pg_class.reloptions`: c'est une cicatrice écrite
-- du dépôt, et c'est la raison d'être du cas ③.
--
-- ⛔ ET LE CAS ⑤ EST CELUI SANS LEQUEL LES AUTRES NE PROUVENT RIEN.
-- Une garde a besoin d'un cas qui PASSE. Si la vue ne rendait plus JAMAIS de
-- ligne — parce que le `where` a été recopié de travers, parce que quelqu'un a
-- ajouté un `and false`, parce que la vue a été remplacée par du vide — les cas
-- ② et ④ resteraient VERTS. Un test qui ne voit jamais rien ressemble
-- exactement à un test qui marche. ⑤ insère une ligne MESURÉE et exige de la
-- retrouver dans la vue, avec sa médiane, son max et sa part.
--
-- CE QUI EST AFFIRMÉ
--   ① la colonne ACCEPTE `null`          (le `drop not null` a bien eu lieu)
--   ② la vue EXCLUT la ligne non mesurée (la clause `where`)
--   ③ `reloptions` porte `security_invoker=true`
--   ④ le DÉFAUT est parti: une écriture qui ne dit rien laisse `null`, pas `0`
--   ⑤ ⛔ LE CAS QUI PASSE: une ligne MESURÉE apparaît bien dans la vue
-- ============================================================================

begin;

create temporary table t_probe(name text, ok boolean, detail text) on commit drop;

-- Un compte de test, et des dates si anciennes qu'aucun plan réel ne les
-- partage: les assertions sur la vue doivent porter sur MES lignes et sur
-- rien d'autre, y compris une fois que `V0-D` aura produit de vraies mesures.
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values ('99990000-0000-4000-8000-0000000000fb'::uuid,
        'fill-weekly-test@test.dev', 'x', now(), 'authenticated', 'authenticated')
on conflict (id) do nothing;

do $$
declare
  u uuid := '99990000-0000-4000-8000-0000000000fb';
  v_id uuid;
  v_err text;
  v_n int;
  v_median numeric;
  v_max int;
  v_share numeric;
  v_plans int;
begin
  -- ── ① LA COLONNE ACCEPTE `null` ───────────────────────────────────────────
  -- Avant `V0-B` les deux colonnes étaient `not null default 0` / `not null
  -- default '{}'`: cet insert levait une violation de non-nullité.
  begin
    insert into public.student_generated_meals (
      user_id, starts_on, duration_days, scope, mode, servings,
      pantry, dishes, preparations, cooking_sessions, shopping_list,
      generated_from, content_locale, member_portions, plan_kind, created_at,
      composition_unknowns, composition_energy_sources
    ) values (
      u, '2019-01-07'::date, 1::smallint, 'day', 'to_shop', 1,
      '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
      '{}'::jsonb, 'en', '[]'::jsonb, 'personal', '2019-01-07 12:00:00+00',
      null, null
    ) returning id into v_id;

    insert into t_probe
    select '① la colonne accepte null',
      (select composition_unknowns is null and composition_energy_sources is null
       from public.student_generated_meals where id = v_id),
      format('unknowns=%s sources=%s',
        coalesce((select composition_unknowns::text from public.student_generated_meals
                  where id = v_id), 'NULL'),
        coalesce((select composition_energy_sources::text from public.student_generated_meals
                  where id = v_id), 'NULL'));
  exception when others then
    get stacked diagnostics v_err = message_text;
    insert into t_probe values ('① la colonne accepte null', false,
      'insert refusé: ' || v_err);
    v_id := null;
  end;

  -- ── ② LA VUE EXCLUT LA LIGNE NON MESURÉE ──────────────────────────────────
  -- ⛔ C'est TOUT le lot. Sans la clause `where`, la semaine apparaîtrait quand
  -- même — `percentile_cont` et `max` ignorent les `null`, mais `count(*)` non:
  -- on lirait `plans = 1, unknowns_median = null`, c'est-à-dire « la mesure a
  -- échoué » au lieu de « il n'y a rien à mesurer ».
  select count(*) into v_n from public.composition_fill_weekly
   where week = '2019-01-07'::date;
  insert into t_probe values ('② la vue exclut la ligne non mesurée',
    v_n = 0, format('%s ligne(s) pour la semaine 2019-01-07', v_n));

  -- ── ③ `reloptions` PORTE `security_invoker` ───────────────────────────────
  -- ⚠️ La cicatrice du dépôt: `create or replace view` PERD cette option, en
  -- silence, et aucun test de comportement ne s'en aperçoit. Elle ne se lit
  -- qu'ici.
  insert into t_probe
  select '③ reloptions porte security_invoker=true',
    coalesce('security_invoker=true' = any(c.reloptions), false),
    coalesce(array_to_string(c.reloptions, ','), 'VIDE')
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relname = 'composition_fill_weekly' and n.nspname = 'public';

  -- ── ④ LE DÉFAUT EST PARTI ─────────────────────────────────────────────────
  -- L'insert ci-dessous ne NOMME PAS les deux colonnes. Avant `V0-B` il en
  -- recevait `0` et `{}` — les valeurs qui ont menti sur 180 plans. Un futur lot
  -- qui remettrait un `default` rougirait ici, et nulle part ailleurs.
  insert into public.student_generated_meals (
    user_id, starts_on, duration_days, scope, mode, servings,
    pantry, dishes, preparations, cooking_sessions, shopping_list,
    generated_from, content_locale, member_portions, plan_kind, created_at
  ) values (
    u, '2019-01-09'::date, 1::smallint, 'day', 'to_shop', 1,
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
    '{}'::jsonb, 'en', '[]'::jsonb, 'personal', '2019-01-09 12:00:00+00'
  ) returning id into v_id;

  insert into t_probe
  select '④ aucun défaut: une écriture muette laisse null',
    composition_unknowns is null and composition_energy_sources is null,
    format('unknowns=%s sources=%s',
      coalesce(composition_unknowns::text, 'NULL'),
      coalesce(composition_energy_sources::text, 'NULL'))
  from public.student_generated_meals where id = v_id;

  -- ── ⑤ ⛔ LE CAS QUI PASSE — sans lui, ② et ④ ne prouvent rien ──────────────
  -- Deux plans RÉELLEMENT mesurés, dans une semaine à eux. La vue doit les
  -- rendre, et rendre le bon chiffre: médiane 3 (de 2 et 4), max 4, part
  -- `table` moyenne 0,750. Si la vue s'était vidée pour une autre raison que la
  -- clause `where`, c'est ici que ça se voit.
  insert into public.student_generated_meals (
    user_id, starts_on, duration_days, scope, mode, servings,
    pantry, dishes, preparations, cooking_sessions, shopping_list,
    generated_from, content_locale, member_portions, plan_kind, created_at,
    composition_unknowns, composition_energy_sources
  ) values
    (u, '2019-01-14'::date, 1::smallint, 'day', 'to_shop', 1,
     '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
     '{}'::jsonb, 'en', '[]'::jsonb, 'personal', '2019-01-14 12:00:00+00',
     2, '{"table":0.5,"model":0.5}'::jsonb),
    (u, '2019-01-16'::date, 1::smallint, 'day', 'to_shop', 1,
     '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
     '{}'::jsonb, 'en', '[]'::jsonb, 'personal', '2019-01-16 12:00:00+00',
     4, '{"table":1.0,"model":0.0}'::jsonb);

  select plans, unknowns_median, unknowns_max, share_table
    into v_plans, v_median, v_max, v_share
    from public.composition_fill_weekly
   where week = '2019-01-14'::date and plan_kind = 'personal';

  insert into t_probe values (
    '⑤ LE CAS QUI PASSE: la ligne mesurée apparaît',
    v_plans = 2 and v_median = 3 and v_max = 4 and v_share = 0.750,
    format('plans=%s median=%s max=%s share_table=%s',
      coalesce(v_plans::text, 'ABSENTE'), coalesce(v_median::text, '-'),
      coalesce(v_max::text, '-'), coalesce(v_share::text, '-')));

  -- ⚠️ ET LES DEUX POPULATIONS COEXISTENT. Une vue qui ne rendrait QUE la
  -- semaine mesurée pourrait le faire en filtrant sur la date; ce qu'on affirme
  -- est que le critère est la MESURE, pas le calendrier.
  insert into t_probe
  select '⑤ mesurée dedans, non mesurée dehors, en même temps',
    (select count(*) from public.composition_fill_weekly
      where week in ('2019-01-07'::date, '2019-01-14'::date)) = 1,
    format('semaines rendues: %s',
      coalesce((select string_agg(week::text, ', ' order by week)
                from public.composition_fill_weekly
                where week in ('2019-01-07'::date, '2019-01-14'::date)), 'aucune'));
end $$;

-- ── LE VERDICT ──────────────────────────────────────────────────────────────
select case when ok then '  OK  ' else ' ÉCHEC' end as verdict, name, detail
from t_probe order by name;

do $$
declare n integer;
begin
  select count(*) into n from t_probe where not ok;
  if n > 0 then raise exception 'V0-B · % cas en échec', n; end if;
  raise notice 'V0-B · compteurs de composition: tous les cas passent';
end $$;

rollback;
