#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# S6 — LES GRANTS PAR DÉFAUT : LA SESSION DE TEST PAR RÔLE
#
# ⛔ CE FICHIER EST L'ARME DU LOT, ET IL EXISTE PARCE QU'UNE MATRICE DE
#    PRIVILÈGES N'EST PAS UN CAS QUI PASSE.
#
# `has_table_privilege` dit ce que la base ACCORDE. Il ne dit pas ce que
# l'écran FAIT. Un `revoke` de trop casse une lecture du front, et la matrice
# reste parfaitement verte pendant que la page est vide. Ce harnais ouvre donc
# une SESSION PAR RÔLE (`anon`, puis `authenticated` avec les claims d'un
# compte réel) et rejoue les lectures LITTÉRALES du front — mêmes listes de
# colonnes, mêmes prédicats, appelant cité en clair.
#
# ⛔ ET IL Y A UN SECOND PIÈGE, MESURÉ LE 2026-08-22 AVANT LE PREMIER COMMIT :
#    tester « anon n'écrit pas » par le SEUL fait que l'écriture échoue est une
#    garde MORTE. Mesuré sur `profiles`, grants d'origine encore en place :
#      · `insert` → 42501 « new row violates row-level security policy »
#      · `update` → AUCUNE ERREUR, 0 ligne (la RLS filtre en silence)
#    Une assertion « ça échoue » serait donc verte AVEC le grant comme SANS
#    lui. Le harnais assert sur la FORME du refus : le message doit contenir
#    `permission denied for table`, que seul le PRIVILÈGE sait prononcer.
#    C'est ce qui le rend mutable — re-`grant`, et il rougit.
#
# ⚠️ TOUT TOURNE DANS UNE TRANSACTION QUI SE TERMINE PAR `rollback` : aucun
#    octet n'est écrit, y compris par les `update`/`insert` de contrôle.
# ⛔ ET LE `truncate` N'EST JAMAIS EXÉCUTÉ TANT QUE LE PRIVILÈGE EXISTE — il
#    réussirait. Dans cet état le contrôle est déclaré ROUGE sans être joué ;
#    une fois le privilège révoqué, la commande est jouée POUR DE VRAI et doit
#    être refusée. C'est la seule ligne du harnais qui regarde le privilège
#    avant d'agir, et c'est parce que « aucune suppression de données » n'est
#    pas négociable.
#
# usage : scripts/keel_s6_grants_par_role_20260822.sh
# sortie : une ligne par contrôle, puis PASS/FAIL. rc≠0 si un seul contrôle FAIL.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-supabase_db_Sophia_2}"

# Compte de banc QA porteur des trois familles de données lues ci-dessous
# (2 plans, 1 bilan hebdo, 6 contraintes de sécurité). Il n'est JAMAIS écrit :
# la seule écriture du harnais réaffecte une colonne à elle-même, et la
# transaction est annulée.
UID_TEST="${S6_TEST_UID:-1a000000-0000-4000-8000-000000000001}"

docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -v uid="$UID_TEST" <<'SQL'
\pset pager off
begin;

create temp table s6_cfg(uid text) on commit drop;
insert into s6_cfg(uid) values (:'uid');

create temp table s6_out(
  ord serial, role_name text, tab text, geste text,
  attendu text, observe text, ok boolean
) on commit drop;

do $harness$
declare
  r        record;
  obs      text;
  n        bigint;
  uid      text;
  claims   text;
  verdict  boolean;
  a_le_droit boolean;
begin
select c.uid into uid from s6_cfg c;
claims := '{"sub":"' || uid || '","role":"authenticated"}';

for r in
  select * from (values
    -- ─── LES LECTURES DU FRONT, LITTÉRALES ─────────────────────────────────
    ('authenticated','profiles','lecture front — AuthProvider.tsx:203',
     'select trial_end,access_tier,account_status,purge_at,locale from public.profiles where id = '''||uid||'''','ok:1'),
    ('anon','profiles','lecture front sous anon',
     'select trial_end,access_tier,account_status,purge_at,locale from public.profiles where id = '''||uid||'''','ok:0'),

    ('authenticated','student_generated_meals','lecture front — planFeedback.ts:232',
     'select id,starts_on,duration_days,retired_at,created_at,dishes from public.student_generated_meals where user_id = '''||uid||''' and retired_at is null','ok:>0'),
    ('anon','student_generated_meals','lecture front sous anon',
     'select id,starts_on,duration_days,retired_at,created_at,dishes from public.student_generated_meals where user_id = '''||uid||''' and retired_at is null','ok:0'),

    ('authenticated','weekly_reviews','lecture front — keelClient.ts:222',
     'select id,week_start_date,logging_coverage,core_adherence_pct,overall_adherence_pct,evaluable_days,flex_used,flex_allowance,outcomes from public.weekly_reviews where user_id = '''||uid||'''','ok:>0'),
    ('anon','weekly_reviews','lecture front sous anon',
     'select id,week_start_date,logging_coverage,core_adherence_pct,overall_adherence_pct,evaluable_days,flex_used,flex_allowance,outcomes from public.weekly_reviews where user_id = '''||uid||'''','ok:0'),

    ('authenticated','student_safety_constraints','lecture front — StudentConstraintsCard.tsx:69',
     'select id,kind,allergen_ref,substance_ref,medication_class,severity,declared_by,notes,created_at from public.student_safety_constraints where user_id = '''||uid||''' and status = ''active''','ok:>0'),
    ('anon','student_safety_constraints','lecture front sous anon',
     'select id,kind,allergen_ref,substance_ref,medication_class,severity,declared_by,notes,created_at from public.student_safety_constraints where user_id = '''||uid||''' and status = ''active''','denied'),

    ('authenticated','food_groups','lecture front — CoachProtocolPage.tsx:279',
     'select slug,class,label_i18n_key from public.food_groups','ok:>0'),
    ('anon','food_groups','lecture front sous anon — L0-a a révoqué',
     'select slug,class,label_i18n_key from public.food_groups','denied'),

    ('authenticated','substances','lecture du référentiel',
     'select slug,kind,label_i18n_key from public.substances','ok:>0'),
    ('anon','substances','lecture du référentiel sous anon',
     'select slug,kind,label_i18n_key from public.substances','ok:0'),
    ('authenticated','substance_limits','lecture du référentiel',
     'select substance_ref,ul_amount,ul_unit,per from public.substance_limits','ok:>0'),
    ('anon','substance_limits','lecture du référentiel sous anon',
     'select substance_ref,ul_amount,ul_unit,per from public.substance_limits','ok:0'),
    ('authenticated','substance_interactions','lecture du référentiel',
     'select substance_ref,medication_class,severity,note from public.substance_interactions','ok:>0'),
    ('anon','substance_interactions','lecture du référentiel sous anon',
     'select substance_ref,medication_class,severity,note from public.substance_interactions','ok:0'),

    -- ─── L'ÉCRITURE DU FRONT QUI DOIT SURVIVRE AU LOT ──────────────────────
    -- `profiles` est la seule des huit que le front écrit sous `authenticated`
    -- (9 appels `.update()` mesurés). La colonne est réaffectée à elle-même.
    ('authenticated','profiles','ÉCRITURE front — UserProfile.tsx:207',
     'update public.profiles set full_name = full_name where id = '''||uid||'''','ok:1'),

    -- ─── CE QU'ANON NE DOIT PLUS POUVOIR PRONONCER ────────────────────────
    -- ⛔ `denied` n'accepte QUE « permission denied for table ». Un refus de
    --    RLS, ou un silence à 0 ligne, comptent comme un ÉCHEC du contrôle.
    ('anon','profiles','insert',
     'insert into public.profiles(id) values (gen_random_uuid())','denied'),
    ('anon','profiles','update',
     'update public.profiles set full_name = full_name where id = '''||uid||'''','denied'),
    ('anon','profiles','delete',
     'delete from public.profiles where id = '''||uid||'''','denied'),
    ('anon','profiles','truncate','truncate public.profiles','denied'),

    ('anon','student_generated_meals','insert',
     'insert into public.student_generated_meals(user_id) values (gen_random_uuid())','denied'),
    ('anon','student_generated_meals','update',
     'update public.student_generated_meals set retired_at = retired_at where user_id = '''||uid||'''','denied'),
    ('anon','student_generated_meals','delete',
     'delete from public.student_generated_meals where user_id = '''||uid||'''','denied'),
    ('anon','student_generated_meals','truncate','truncate public.student_generated_meals','denied'),

    ('anon','weekly_reviews','insert',
     'insert into public.weekly_reviews(user_id) values (gen_random_uuid())','denied'),
    ('anon','weekly_reviews','update',
     'update public.weekly_reviews set user_id = user_id where user_id = '''||uid||'''','denied'),
    ('anon','weekly_reviews','delete',
     'delete from public.weekly_reviews where user_id = '''||uid||'''','denied'),
    ('anon','weekly_reviews','truncate','truncate public.weekly_reviews','denied'),

    ('anon','substances','insert',
     'insert into public.substances(slug) values (''s6_probe'')','denied'),
    ('anon','substances','update',
     'update public.substances set slug = slug where slug = ''s6_probe''','denied'),
    ('anon','substances','delete',
     'delete from public.substances where slug = ''s6_probe''','denied'),
    ('anon','substances','truncate','truncate public.substances','denied'),

    ('anon','substance_limits','insert',
     'insert into public.substance_limits(substance_ref) values (''s6_probe'')','denied'),
    ('anon','substance_limits','update',
     'update public.substance_limits set substance_ref = substance_ref where substance_ref = ''s6_probe''','denied'),
    ('anon','substance_limits','delete',
     'delete from public.substance_limits where substance_ref = ''s6_probe''','denied'),
    ('anon','substance_limits','truncate','truncate public.substance_limits','denied'),

    ('anon','substance_interactions','insert',
     'insert into public.substance_interactions(substance_ref) values (''s6_probe'')','denied'),
    ('anon','substance_interactions','update',
     'update public.substance_interactions set substance_ref = substance_ref where substance_ref = ''s6_probe''','denied'),
    ('anon','substance_interactions','delete',
     'delete from public.substance_interactions where substance_ref = ''s6_probe''','denied'),
    ('anon','substance_interactions','truncate','truncate public.substance_interactions','denied'),

    ('anon','student_safety_constraints','insert',
     'insert into public.student_safety_constraints(user_id) values (gen_random_uuid())','denied'),
    ('anon','student_safety_constraints','update',
     'update public.student_safety_constraints set user_id = user_id where user_id = '''||uid||'''','denied'),
    ('anon','student_safety_constraints','delete',
     'delete from public.student_safety_constraints where user_id = '''||uid||'''','denied'),
    ('anon','student_safety_constraints','truncate','truncate public.student_safety_constraints','denied'),

    ('anon','food_groups','insert',
     'insert into public.food_groups(slug) values (''s6_probe'')','denied'),
    ('anon','food_groups','update',
     'update public.food_groups set slug = slug where slug = ''s6_probe''','denied'),
    ('anon','food_groups','delete',
     'delete from public.food_groups where slug = ''s6_probe''','denied'),
    ('anon','food_groups','truncate','truncate public.food_groups','denied'),

    -- ─── LA RÉTRACTION : `authenticated` NE SUPPRIME PAS UNE CONTRAINTE ────
    -- Le modèle voulu est « superseded, never rewritten » (trigger
    -- `student_safety_constraints_retraction_only`, mesuré par S1b). Le
    -- `DELETE` accordé était un résidu SANS aucune policy DELETE.
    ('authenticated','student_safety_constraints','delete — résidu sans policy',
     'delete from public.student_safety_constraints where user_id = '''||uid||'''','denied'),

    -- ─── `TRUNCATE` ÉCHAPPE À LA RLS, Y COMPRIS POUR `authenticated` ───────
    ('authenticated','profiles','truncate','truncate public.profiles','denied'),
    ('authenticated','student_generated_meals','truncate','truncate public.student_generated_meals','denied'),
    ('authenticated','weekly_reviews','truncate','truncate public.weekly_reviews','denied'),
    ('authenticated','student_safety_constraints','truncate','truncate public.student_safety_constraints','denied'),
    ('authenticated','substances','truncate','truncate public.substances','denied'),
    ('authenticated','substance_limits','truncate','truncate public.substance_limits','denied'),
    ('authenticated','substance_interactions','truncate','truncate public.substance_interactions','denied'),
    ('authenticated','food_groups','truncate','truncate public.food_groups','denied')
  ) v(role_name, tab, geste, stmt, attendu)
loop
  -- ⛔ LA SEULE GARDE QUI REGARDE LE PRIVILÈGE AVANT D'AGIR. Un `truncate`
  -- autorisé RÉUSSIRAIT ; on ne le joue donc jamais dans cet état.
  if r.geste = 'truncate' then
    select has_table_privilege(r.role_name, 'public.' || r.tab, 'TRUNCATE')
      into a_le_droit;
    if a_le_droit then
      insert into s6_out(role_name, tab, geste, attendu, observe, ok)
      values (r.role_name, r.tab, r.geste, r.attendu,
              'PRIVILÈGE TRUNCATE PRÉSENT — commande NON JOUÉE (destructive)', false);
      continue;
    end if;
  end if;

  -- La session du rôle. Les claims ne sont posés que pour `authenticated` :
  -- sous `anon`, `auth.uid()` doit valoir NULL, comme dans un navigateur sans
  -- session.
  execute 'set local role ' || quote_ident(r.role_name);
  if r.role_name = 'authenticated' then
    execute 'set local request.jwt.claims = ' || quote_literal(claims);
  else
    execute 'set local request.jwt.claims = ''''';
  end if;

  begin
    execute r.stmt;
    get diagnostics n = row_count;
    obs := 'aucune erreur, ' || n || ' ligne(s)';
  exception when others then
    obs := sqlstate || ' ' || sqlerrm;
    n := -1;
  end;

  execute 'reset role';
  execute 'set local request.jwt.claims = ''''';

  verdict := case r.attendu
    when 'denied' then obs like '%permission denied for table%'
    when 'ok:1'   then n = 1
    when 'ok:0'   then n = 0
    when 'ok:>0'  then n > 0
    else false
  end;

  insert into s6_out(role_name, tab, geste, attendu, observe, ok)
  values (r.role_name, r.tab, r.geste, r.attendu, obs, verdict);
end loop;
end
$harness$;

\pset format aligned
select ord, role_name as role, tab, geste, attendu,
       case when ok then 'PASS' else 'FAIL' end as verdict, observe
from s6_out order by ord;

select count(*) filter (where ok) as pass,
       count(*) filter (where not ok) as fail,
       count(*) as total
from s6_out;

do $verdict$
declare bad bigint;
begin
  select count(*) into bad from s6_out where not ok;
  if bad > 0 then
    raise exception 'S6 HARNAIS ROUGE — % controle(s) en echec', bad;
  end if;
  raise notice 'S6 HARNAIS VERT — % controles', (select count(*) from s6_out);
end
$verdict$;

rollback;
SQL
