#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# S4 — LA MUTATION, SURFACE PAR SURFACE
# ════════════════════════════════════════════════════════════════════════════
#
# « Quatre gardes de cette vague auraient passé vertes sur leur propre cas. »
# On retire la garde d'UNE surface à la fois et on vérifie que le cas
# correspondant ROUGIT — et que les autres restent verts.
#
# ⛔ LE MUTANT NE SURVIT À AUCUNE COMMANDE. Le DDL est transactionnel en
#    PostgreSQL: le `create or replace function` mutant et le harnais vivent
#    dans la MÊME transaction, annulée à la fin. Rien n'est jamais posé sur la
#    base, même une seconde — et il n'y a donc aucun état à « restaurer », donc
#    aucune fenêtre où une session voisine lirait une fonction désarmée.
#
# Lancement:  bash scratchpad/2026-08-22-S4-mutation.sh
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")/.."

DB=supabase_db_Sophia_2
HARNAIS=scratchpad/2026-08-22-S4-quatre-surfaces.sql
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Le corps du harnais: tout ce qui est entre le premier `begin;` et le
# `rollback;` final. On le réutilise tel quel — une COPIE divergerait.
awk '/^begin;$/{f=1;next} /^rollback;$/{f=0} f' "$HARNAIS" > "$TMP/corps.sql"

# ── LES QUATRE MUTANTS ────────────────────────────────────────────────────
# Chacun est la fonction LIVRÉE, moins son seul bloc de garde.

cat > "$TMP/mutant-A.sql" <<'SQL'
create or replace function public.keel_household_add_member(
  p_first_name text, p_birth_date date default null, p_goal text default null
) returns jsonb language plpgsql security definer set search_path to '' as $mut$
declare
  v_user uuid := (select auth.uid()); v_household uuid; v_role text;
  v_first text := btrim(coalesce(p_first_name, '')); v_count integer; v_member uuid;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'reason', 'not_authenticated'); end if;
  select hm.household_id, hm.role into v_household, v_role
  from public.household_members hm where hm.user_id = v_user;
  if v_household is null then return jsonb_build_object('ok', false, 'reason', 'no_household'); end if;
  if v_role <> 'owner' then return jsonb_build_object('ok', false, 'reason', 'not_owner'); end if;
  if char_length(v_first) < 1 or char_length(v_first) > 40 then
    return jsonb_build_object('ok', false, 'reason', 'bad_first_name'); end if;
  if p_goal is not null and p_goal not in ('fat_loss','maintenance','muscle_gain') then
    return jsonb_build_object('ok', false, 'reason', 'bad_goal'); end if;
  if p_birth_date is not null and p_birth_date > current_date then
    return jsonb_build_object('ok', false, 'reason', 'bad_birth_date'); end if;
  -- ⛔ MUTANT: le bloc `goal_not_for_minor` est RETIRÉ ici.
  select count(*) into v_count from public.household_members hm where hm.household_id = v_household;
  if v_count >= public.keel_household_max_mouths() then
    return jsonb_build_object('ok', false, 'reason', 'household_full'); end if;
  insert into public.household_members (household_id, user_id, role, first_name, birth_date, goal)
  values (v_household, null, 'member', v_first, p_birth_date, p_goal)
  returning member_id into v_member;
  return jsonb_build_object('ok', true, 'member_id', v_member);
end; $mut$;
SQL

cat > "$TMP/mutant-C.sql" <<'SQL'
create or replace function public.keel_household_set_member_goal(
  p_member uuid, p_goal text
) returns jsonb language plpgsql security definer set search_path to '' as $mut$
declare
  v_user uuid := (select auth.uid()); v_household uuid; v_role text; v_target record;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'reason', 'not_authenticated'); end if;
  if p_goal is not null and p_goal not in ('fat_loss','maintenance','muscle_gain') then
    return jsonb_build_object('ok', false, 'reason', 'bad_goal'); end if;
  select hm.household_id, hm.role into v_household, v_role
  from public.household_members hm where hm.user_id = v_user;
  if v_household is null then return jsonb_build_object('ok', false, 'reason', 'no_household'); end if;
  select hm.member_id, hm.user_id, hm.birth_date into v_target
  from public.household_members hm where hm.member_id = p_member and hm.household_id = v_household;
  if v_target.member_id is null then return jsonb_build_object('ok', false, 'reason', 'not_a_member'); end if;
  if v_role <> 'owner' and v_target.user_id is distinct from v_user then
    return jsonb_build_object('ok', false, 'reason', 'not_your_line'); end if;
  if v_target.user_id is not null then return jsonb_build_object('ok', false, 'reason', 'has_account'); end if;
  -- ⛔ MUTANT: le bloc `goal_not_for_minor` est RETIRÉ ici.
  update public.household_members set goal = p_goal where member_id = p_member;
  return jsonb_build_object('ok', true);
end; $mut$;
SQL

cat > "$TMP/mutant-B.sql" <<'SQL'
create or replace function public.keel_household_set_member_birth_date(
  p_member uuid, p_birth_date date
) returns jsonb language plpgsql security definer set search_path to '' as $mut$
declare
  v_user uuid := (select auth.uid()); v_household uuid; v_role text; v_target record;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'reason', 'not_authenticated'); end if;
  if p_birth_date is not null and p_birth_date > current_date then
    return jsonb_build_object('ok', false, 'reason', 'bad_birth_date'); end if;
  select hm.household_id, hm.role into v_household, v_role
  from public.household_members hm where hm.user_id = v_user;
  if v_household is null then return jsonb_build_object('ok', false, 'reason', 'no_household'); end if;
  select hm.member_id, hm.user_id, hm.goal into v_target
  from public.household_members hm where hm.member_id = p_member and hm.household_id = v_household;
  if v_target.member_id is null then return jsonb_build_object('ok', false, 'reason', 'not_a_member'); end if;
  if v_role <> 'owner' and v_target.user_id is distinct from v_user then
    return jsonb_build_object('ok', false, 'reason', 'not_your_line'); end if;
  -- ⛔ MUTANT: le bloc `goal_not_for_minor` (la garde de L'ORDRE) est RETIRÉ ici.
  update public.household_members set birth_date = p_birth_date where member_id = p_member;
  return jsonb_build_object('ok', true);
end; $mut$;
SQL

cat > "$TMP/mutant-D.sql" <<'SQL'
create or replace function public.keel_household_set_member_target(
  p_member uuid, p_target_weight_kg numeric, p_pace_kg_per_week numeric
) returns jsonb language plpgsql security definer set search_path to '' as $mut$
declare
  v_user uuid := (select auth.uid()); v_household uuid; v_role text;
  v_target_member uuid; v_goal text; v_birth date;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'reason', 'not_authenticated'); end if;
  select hm.household_id, hm.role into v_household, v_role
  from public.household_members hm where hm.user_id = v_user;
  if v_household is null then return jsonb_build_object('ok', false, 'reason', 'no_household'); end if;
  if v_role <> 'owner' then return jsonb_build_object('ok', false, 'reason', 'not_owner'); end if;
  select hm.member_id, hm.goal, hm.birth_date into v_target_member, v_goal, v_birth
  from public.household_members hm where hm.member_id = p_member and hm.household_id = v_household;
  if v_target_member is null then return jsonb_build_object('ok', false, 'reason', 'not_a_member'); end if;
  if (p_target_weight_kg is null) <> (p_pace_kg_per_week is null) then
    return jsonb_build_object('ok', false, 'reason', 'target_incomplete'); end if;
  if p_target_weight_kg is not null then
    -- ⛔ MUTANT: le bloc `target_not_for_minor` est RETIRÉ ici.
    if p_target_weight_kg < 25 or p_target_weight_kg > 400 then
      return jsonb_build_object('ok', false, 'reason', 'bad_target_weight'); end if;
    if p_pace_kg_per_week <= 0 or p_pace_kg_per_week > 1 then
      return jsonb_build_object('ok', false, 'reason', 'bad_pace'); end if;
    if v_goal is null or v_goal not in ('fat_loss','muscle_gain') then
      return jsonb_build_object('ok', false, 'reason', 'target_needs_direction'); end if;
  end if;
  update public.household_members
     set target_weight_kg = p_target_weight_kg, target_pace_kg_per_week = p_pace_kg_per_week
   where member_id = p_member;
  return jsonb_build_object('ok', true, 'member_id', p_member);
end; $mut$;
SQL

for surface in A B C D; do
  echo ""
  echo "════════════════════════════════════════════════════════════════════"
  echo "  MUTANT $surface — la garde de cette surface est RETIRÉE"
  echo "════════════════════════════════════════════════════════════════════"
  {
    echo "\\pset pager off"
    echo "begin;"
    cat "$TMP/mutant-$surface.sql"
    cat "$TMP/corps.sql"
    echo "rollback;"
  } > "$TMP/run-$surface.sql"
  docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
    < "$TMP/run-$surface.sql" 2>&1 | grep -E '^ +[0-9]+ \| |^-----|^ ord|verdict|/5|/11' || true
done

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "  CONTRÔLE DE SORTIE — la base doit être revenue à 11/11"
echo "════════════════════════════════════════════════════════════════════"
docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < "$HARNAIS" 2>&1 | grep -E '/5|/11' || true
