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
-- ⛔ ET LA PORTE ELLE-MÊME A ÉTÉ UNE FAUSSE GARDE — V0-B-bis, 2026-08-21.
-- Le verdict s'agrégeait par `select count(*) … where not ok`. En SQL,
-- `not null` vaut `null`, et un `where` ne rend PAS une ligne dont le prédicat
-- vaut `null`. Or `ok` vaut `null` dès qu'une ligne cible MANQUE — c'est
-- exactement ce qui arrive au cas ⑤ si la vue cesse de rendre la semaine
-- mesurée. Résultat mesuré: le tableau affichait « ÉCHEC », et la porte rendait
-- `NOTICE: tous les cas passent` avec rc=0. **Une vue cassée passait le test, sur
-- le cas dont ce fichier écrit qu'il est celui sans lequel les autres ne prouvent
-- rien.** La porte compte désormais `ok is distinct from true`, et elle compte
-- aussi LE NOMBRE DE CAS (voir ⑥) — une sonde qui disparaît est une sonde qui
-- passe.
--
-- CE QUI EST AFFIRMÉ
--   ① la colonne ACCEPTE `null`          (le `drop not null` a bien eu lieu)
--   ② la vue EXCLUT la ligne non mesurée (la clause `where`)
--   ③ `reloptions` porte `security_invoker=true`
--   ④ le DÉFAUT est parti: une écriture qui ne dit rien laisse `null`, pas `0`
--   ⑤ ⛔ LE CAS QUI PASSE: une ligne MESURÉE apparaît bien dans la vue
--   ⑥ la RPC `write_student_meal_plan` LAISSE PASSER L'ABSENCE (V0-B-bis):
--      un payload sans les deux clés écrit `null`/`null`, et non `0`/`{}`
--   ⑦ … et un `null` JSON EXPLICITE aussi — c'est ce que les lanes envoient
--   ⑧ ⛔ `greatest(0, …)` N'A PAS ÉTÉ RETIRÉ: -1 devient 0, pas une erreur
--   ⑨ ⛔ ET UN ZÉRO MESURÉ RESTE 0 — sans ce cas, « rendre null partout »
--      passerait ⑥ et ⑦ et détruirait la seule mesure qui dit que le sas a
--      réussi
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
  v_unknowns int;
  v_sources jsonb;
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

  -- ── ⑥ ⛔ LE TROISIÈME PORTEUR DU ZÉRO — V0-B-bis ───────────────────────────
  -- `drop default` sur la colonne ne suffit PAS: `write_student_meal_plan`, le
  -- SEUL point d'écriture d'un plan, portait
  --   greatest(0, coalesce((p_payload ->> 'composition_unknowns')::int, 0))
  --   coalesce(p_payload -> 'composition_energy_sources', '{}'::jsonb)
  -- et refabriquait donc `0` / `{}` à partir d'une absence. Les cas ① et ④
  -- passent par un `insert` DIRECT: ils ne voient jamais la RPC, et le mensonge
  -- serait rentré par la seule porte que le produit utilise réellement.
  --
  -- ⚠️ ET `greatest(0, null)` VAUT `0` EN SQL — `greatest` ignore les `null`.
  -- Retirer le `coalesce` seul n'aurait rien changé; il faut la branche
  -- explicite. C'est pour ça que ce cas existe.
  -- ⚠️ DEUX INSTRUCTIONS, ET C'EST OBLIGATOIRE. Écrire
  --   select … from student_generated_meals where id = (select meal_id from …())
  -- ne marche PAS: la ligne que la fonction insère PENDANT l'instruction n'est
  -- pas visible au scan de cette même instruction (son `CommandId` est figé au
  -- départ). La sonde rendait alors `NULL` — et une sonde qui affirme `is null`
  -- serait passée pour la RAISON EXACTEMENT INVERSE de celle qu'elle teste.
  -- C'est la même famille de faux vert que le `where not ok` que ce lot répare.
  --
  -- ⛔ ET `into strict` EST LA CEINTURE: si la ligne manque, on lève au lieu de
  -- rendre `null`. Un cas non évaluable doit s'entendre.
  select meal_id into v_id from public.write_student_meal_plan(
    u, 'prepare_next', '2019-02-04'::date, 1::smallint,
    jsonb_build_object('mode', 'to_shop'));
  select composition_unknowns, composition_energy_sources
    into strict v_unknowns, v_sources
    from public.student_generated_meals where id = v_id;

  insert into t_probe values ('⑥ la RPC laisse passer l''ABSENCE des deux clés',
    v_unknowns is null and v_sources is null,
    format('unknowns=%s sources=%s',
      coalesce(v_unknowns::text, 'NULL'), coalesce(v_sources::text, 'NULL')));

  -- Et le `null` JSON explicite, qui est ce que les deux lanes envoient
  -- désormais quand le remplissage n'a pas tourné. `->>` rend déjà SQL NULL
  -- dessus; `-> ` rend un jsonb `null`, qui n'est PAS SQL NULL — c'est le
  -- `nullif` de la migration qui le traite, et c'est ce cas qui le prouve.
  select meal_id into v_id from public.write_student_meal_plan(
    u, 'prepare_next', '2019-02-11'::date, 1::smallint,
    jsonb_build_object('mode', 'to_shop',
      'composition_unknowns', null, 'composition_energy_sources', null));
  select composition_unknowns, composition_energy_sources
    into strict v_unknowns, v_sources
    from public.student_generated_meals where id = v_id;

  insert into t_probe values ('⑦ la RPC laisse passer un `null` EXPLICITE',
    v_unknowns is null and v_sources is null,
    format('unknowns=%s sources=%s',
      coalesce(v_unknowns::text, 'NULL'), coalesce(v_sources::text, 'NULL')));

  -- ── ⑧ ET LA GARDE DU NÉGATIF N'A PAS ÉTÉ RETIRÉE ─────────────────────────
  -- ⛔ C'est le cas qui empêche de « réparer » en supprimant le `greatest`. La
  -- colonne porte un CHECK >= 0, et une écriture de plan ne doit JAMAIS échouer
  -- pour un compteur: un instrument de mesure n'a pas le droit de coûter un
  -- dîner. Une valeur PRÉSENTE et négative est ramenée à 0; une valeur présente
  -- et valide est écrite telle quelle — y compris un ZÉRO, qui est une mesure.
  select meal_id into v_id from public.write_student_meal_plan(
    u, 'prepare_next', '2019-02-18'::date, 1::smallint,
    jsonb_build_object('mode', 'to_shop',
      'composition_unknowns', -1,
      'composition_energy_sources', jsonb_build_object('table', 1)));
  select composition_unknowns, composition_energy_sources
    into strict v_unknowns, v_sources
    from public.student_generated_meals where id = v_id;

  insert into t_probe values ('⑧ `greatest(0, …)` tient encore sur une valeur PRÉSENTE',
    v_unknowns = 0 and v_sources = '{"table": 1}'::jsonb,
    format('unknowns=%s sources=%s',
      coalesce(v_unknowns::text, 'NULL'), coalesce(v_sources::text, 'NULL')));

  select meal_id into v_id from public.write_student_meal_plan(
    u, 'prepare_next', '2019-02-25'::date, 1::smallint,
    jsonb_build_object('mode', 'to_shop', 'composition_unknowns', 0));
  select composition_unknowns
    into strict v_unknowns
    from public.student_generated_meals where id = v_id;

  insert into t_probe values ('⑨ un ZÉRO MESURÉ reste 0, il ne devient pas NULL',
    v_unknowns = 0,
    format('unknowns=%s', coalesce(v_unknowns::text, 'NULL')));
end $$;

-- ── LE VERDICT ──────────────────────────────────────────────────────────────
--
-- ⛔ V0-B-bis — LE `null` EST AFFICHÉ POUR CE QU'IL EST. Un cas dont
-- l'expression `ok` vaut `null` n'est pas « faux »: c'est un cas qu'on n'a même
-- pas pu évaluer, parce que la ligne cible a MANQUÉ. Les deux se lisaient
-- « ÉCHEC » à l'identique, et seul le second est un défaut de la SONDE.
select case when ok then '  OK  '
            when ok is null then ' ÉCHEC ⌀'
            else ' ÉCHEC' end as verdict,
       name, detail
from t_probe order by name;

-- ⛔ LE NOMBRE DE CAS EST UNE ASSERTION, PAS UN COMMENTAIRE.
-- Trois des sondes ci-dessus s'écrivent `insert into t_probe select … from <x>
-- where …`. Si le `where` ne trouve RIEN — vue renommée, sortie d'un autre
-- schéma, ligne absente — l'insert pose **zéro ligne** et le cas DISPARAÎT du
-- tableau. Il n'est ni `OK` ni `ÉCHEC`: il n'est plus là. Un tableau à cinq
-- lignes toutes vertes se lit exactement comme un tableau à six lignes toutes
-- vertes, et c'est la même famille de défaut que le `null` juste au-dessus.
-- Le seul remède est de compter les cas attendus.
--
-- ⚠️ Le nombre est écrit EN DUR ici, et pas dans une variable psql: psql
-- n'interpole PAS `:variable` à l'intérieur d'un bloc dollar-quoté. Une
-- variable y serait envoyée telle quelle au serveur.
do $$
declare
  expected_probes constant integer := 10;
  n_failed integer;
  n_null integer;
  n_total integer;
begin
  -- ⛔ V0-B-bis · LE CORRECTIF DE LA PORTE. `where not ok` est AVEUGLE AUX
  -- `null`: en SQL, `not null` vaut `null`, et une ligne dont le prédicat vaut
  -- `null` n'est PAS rendue par un `where`. Le tableau affichait donc « ÉCHEC »
  -- — le `case … else` attrape le `null` — pendant que le compteur rendait `0`
  -- et que `raise exception` ne partait jamais. Mesuré: une vue mutée pour
  -- rendre la semaine mesurée sous un autre `plan_kind` fait afficher
  -- « ÉCHEC | ⑤ … plans=ABSENTE » **et** « tous les cas passent », rc=0 —
  -- sur le cas dont ce fichier écrit lui-même qu'il est celui « sans lequel les
  -- autres ne prouvent rien ».
  --
  -- `is distinct from true` est vrai pour `false` ET pour `null`. C'est la
  -- seule formulation qui ne laisse pas de troisième état s'échapper.
  select count(*) filter (where ok is distinct from true),
         count(*) filter (where ok is null),
         count(*)
    into n_failed, n_null, n_total
    from t_probe;

  if n_total <> expected_probes then
    raise exception 'V0-B · % cas rendus, % attendus — une sonde a DISPARU (son insert n''a posé aucune ligne)',
      n_total, expected_probes;
  end if;
  if n_failed > 0 then
    raise exception 'V0-B · % cas en échec (dont % non évaluables)', n_failed, n_null;
  end if;
  raise notice 'V0-B · compteurs de composition: % cas, tous passent', n_total;
end $$;

rollback;
