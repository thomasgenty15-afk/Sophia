-- ============================================================================
-- `anon` GARDAIT SELECT/INSERT/UPDATE/DELETE SUR 13 TABLES DU PIVOT
--
-- LE CONSTAT, MESURÉ (QA WEB L10, 2026-08-04)
-- --------------------------------------------
--     13 des 17 tables du pivot rendent `true` sur has_table_privilege('anon', …)
--     pour SELECT, INSERT, UPDATE **et** DELETE.
--
-- CE QUE CE N'EST PAS : une fuite. RLS est activée sur les 17, et une lecture
-- réelle avec la clé anonyme rend **0 ligne** sur les 8 tables sondées. Aucune
-- donnée ne sort aujourd'hui.
--
-- CE QUE C'EST : une couche de défense manquante. `revoke ... from public` —
-- le geste réflexe — ne retire PAS les privilèges par défaut d'`anon`, qui les
-- tient de son propre `grant`. C'est le piège que ce dépôt s'est déjà écrit
-- (« vérifier has_table_privilege('anon', …), jamais 'public' »), et le
-- prompt de QA le nomme explicitement.
--
-- Le signe que la discipline existe : les tables RÉCENTES
-- (`meal_precision_questions`, `coach_clients`, `coaches`, `coach_invitations`)
-- n'ont AUCUN privilège anon. Ce sont les tables antérieures au durcissement
-- qui traînent leurs grants d'origine.
--
-- POURQUOI RETIRER PLUTÔT QUE S'EN REMETTRE À RLS
-- ------------------------------------------------
-- Parce qu'une policy oubliée sur une table sans grant ne donne rien, alors
-- qu'une policy oubliée sur une table avec grant donne TOUT. Les deux erreurs
-- ont la même probabilité et des conséquences incomparables. C'est le même
-- raisonnement asymétrique que partout ailleurs ici.
--
-- CE QUI N'EST PAS TOUCHÉ
-- ------------------------
-- `authenticated` et `service_role` gardent tout. Aucun chemin applicatif ne
-- lit ces tables en anonyme : l'élève et le coach sont authentifiés, les jobs
-- écrivent en `service_role`, et les deux seules RPC accessibles sans compte
-- (`preview_coach_invitation`, `accept_coach_invitation`) sont `SECURITY
-- DEFINER` — elles n'ont donc besoin d'aucun privilège de table côté appelant.
-- ============================================================================

do $$
declare
  v_table text;
  v_before int := 0;
  v_after int := 0;
begin
  for v_table in
    select unnest(array[
      'protocol_events',
      'chat_messages',
      'student_week_plans',
      'student_safety_constraints',
      'student_daily_checkins',
      'planned_deviations',
      'outbound_messages',
      'coach_syntheses',
      'reengagement_episodes',
      'contract_change_requests',
      'coach_doctrines',
      'plan_versions',
      'plan_commitments'
    ])
  loop
    -- Une table absente n'est pas une erreur: cette migration doit pouvoir
    -- s'appliquer sur une base où le pivot a évolué.
    if to_regclass('public.' || v_table) is null then
      raise notice 'revoke anon: %.% absente, ignorée', 'public', v_table;
      continue;
    end if;
    if has_table_privilege('anon', 'public.' || v_table, 'SELECT') then
      v_before := v_before + 1;
    end if;
    execute format('revoke all on table public.%I from anon', v_table);
    if has_table_privilege('anon', 'public.' || v_table, 'SELECT')
       or has_table_privilege('anon', 'public.' || v_table, 'INSERT')
       or has_table_privilege('anon', 'public.' || v_table, 'UPDATE')
       or has_table_privilege('anon', 'public.' || v_table, 'DELETE')
    then
      v_after := v_after + 1;
    end if;
  end loop;

  if v_after <> 0 then
    raise exception 'revoke anon: % table(s) gardent un privilège après le revoke', v_after;
  end if;
  raise notice 'revoke anon: % table(s) avaient un privilège, 0 après', v_before;
end $$;

-- ── CONTRÔLE FINAL : ON REJOUE LE GESTE ────────────────────────────────────
-- `authenticated` doit garder ce qu'il avait. Un revoke qui emporte le rôle
-- applicatif casserait le produit entier — et un contrôle qui ne regarderait
-- que `anon` ne le verrait pas.
do $$
declare
  v_table text;
  v_broken text[] := '{}';
begin
  for v_table in
    select unnest(array['protocol_events', 'chat_messages', 'student_week_plans',
                        'student_safety_constraints', 'plan_commitments'])
  loop
    if to_regclass('public.' || v_table) is null then continue; end if;
    if not has_table_privilege('authenticated', 'public.' || v_table, 'SELECT') then
      v_broken := v_broken || v_table;
    end if;
  end loop;
  if array_length(v_broken, 1) is not null then
    raise exception 'revoke anon a emporté authenticated sur: %', v_broken;
  end if;
  raise notice 'revoke anon: authenticated garde son SELECT sur les 5 tables témoins';
end $$;
