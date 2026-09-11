-- ============================================================================
-- LOT 8 · FAMILLE ② AUTORISATION — LA MOITIÉ QUI NE SE PROUVE QU'EN BASE.
--
-- L'autre moitié est `lot8_autorisation_test.ts`: la DÉCISION d'admission, sur
-- le vrai module. Ici on éprouve ce qu'aucun module pur ne peut porter:
--
--   ① la RLS HISTORIQUE APRÈS RATTACHEMENT — un plan composé avant que la
--      personne rejoigne un foyer, et un plan composé par le maître avant
--      qu'elle arrive: qui lit quoi, et qui ne lit plus rien après le départ;
--   ② les IDENTIFIANTS FALSIFIÉS — `write_student_meal_plan` avec un
--      `p_replaces` qui appartient à quelqu'un d'autre;
--   ③ les APPELS DIRECTS — ce qu'un jeton `authenticated` peut appeler, et ce
--      qu'il ne peut pas, y compris l'écriture directe dans la table des plans;
--   ④ la PERTE puis le RETOUR du droit — les lignes EXACTES que lit
--      l'admission, avant l'invitation, après, et après le départ.
--
--   docker cp supabase/functions/_shared/keel/lot8_autorisation_test.sql \
--     supabase_db_Sophia_2:/tmp/t.sql && \
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f /tmp/t.sql
--
-- ⚠️ Transaction ROLLBACK: la base ressort intacte. Aucun compte réel.
--
-- ⚠️ POUR ÉPROUVER LA RLS IL FAUT VRAIMENT CHANGER DE RÔLE POSTGRES — une
-- politique ne s'applique pas au superutilisateur. Le changement est fait
-- DANS un bloc `do`, par `set local role`, et `reset role` revient avant toute
-- écriture dans la table temporaire. Ce n'est PAS `set_config('role', …)`, qui
-- ne trompe que `auth.role()` et rendrait `t_probe` inaccessible.
-- ============================================================================

begin;

create temporary table t_probe(name text, ok boolean, detail text) on commit drop;

-- ══════════════════════════════════════════════════════════════════════════
-- LE DÉCOR — un maître qui a déjà composé, et une personne qui a déjà composé
-- ══════════════════════════════════════════════════════════════════════════

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data,
                        created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000501',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'lot8.maitre@keeltest.dev', '{"full_name":"Max Maitre"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000502',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'lot8.alice@keeltest.dev', '{"full_name":"Alice Avant"}'::jsonb, now(), now());

update public.profiles set country = 'FR'
 where id in ('00000000-0000-4000-8000-000000000501',
              '00000000-0000-4000-8000-000000000502');

create temporary table t_h as select
  public.keel_household_of('00000000-0000-4000-8000-000000000501') as hm,
  public.keel_household_of('00000000-0000-4000-8000-000000000502') as ha;

-- ⚠️ TROIS PLANS ÉCRITS PAR LA VRAIE RPC. Un `insert` à la main choisirait
-- lui-même `household_id` et `plan_kind` — c'est-à-dire exactement les deux
-- colonnes dont dépend la politique qu'on éprouve.
create temporary table t_plans as
select
  (select meal_id from public.write_student_meal_plan(
      '00000000-0000-4000-8000-000000000501'::uuid, 'prepare_next',
      current_date + 70, 2::smallint,
      jsonb_build_object('plan_kind','household',
                         'household_id',(select hm from t_h),'mode','to_shop'))) as p_foyer_avant,
  (select meal_id from public.write_student_meal_plan(
      '00000000-0000-4000-8000-000000000501'::uuid, 'prepare_next',
      current_date + 70, 2::smallint,
      jsonb_build_object('plan_kind','personal',
                         'household_id',(select hm from t_h),'mode','to_shop'))) as p_perso_maitre,
  (select meal_id from public.write_student_meal_plan(
      '00000000-0000-4000-8000-000000000502'::uuid, 'prepare_next',
      current_date + 70, 2::smallint,
      jsonb_build_object('plan_kind','household',
                         'household_id',(select ha from t_h),'mode','to_shop'))) as p_alice;

insert into t_probe select '⓪ prémisse: trois plans écrits, deux foyers distincts',
  (select p_foyer_avant is not null and p_perso_maitre is not null
          and p_alice is not null from t_plans)
  and (select hm is distinct from ha from t_h),
  (select format('foyer_avant=%s perso=%s alice=%s', p_foyer_avant, p_perso_maitre, p_alice)
     from t_plans);

-- Une bouche libre chez le maître, et l'invitation qui la vise.
insert into public.household_members (member_id, household_id, user_id, role, first_name)
values ('00000000-0000-4000-8000-0000000005a2', (select hm from t_h), null, 'member', 'Alice');

insert into public.household_invitations
  (household_id, email, token_hash, invited_by, expires_at, member_id)
values ((select hm from t_h), 'lot8.alice@keeltest.dev',
        public.coach_invite_token_hash('jeton-lot8-alice'),
        '00000000-0000-4000-8000-000000000501', now() + interval '7 days',
        '00000000-0000-4000-8000-0000000005a2');

-- ══════════════════════════════════════════════════════════════════════════
-- ④ LES LIGNES QUE L'ADMISSION LIT — avant, pendant, après
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⛔ CE QUE CETTE SECTION ÉPROUVE N'EST PAS LE VERDICT — il l'est dans
-- `generation_context_test.ts`, sur le vrai résolveur. C'est L'ENTRÉE du
-- verdict: la requête que fait le générateur
-- (`select household_id, role, member_id from household_members where user_id`)
-- rend-elle vraiment `owner` avant, `member` après l'invitation, `owner` après
-- le départ ? Sans ce chaînon, la décision est juste sur des lignes inventées.

insert into t_probe select '④ AVANT: Alice est maître de son propre foyer',
  (select hm2.role from public.household_members hm2
    where hm2.user_id = '00000000-0000-4000-8000-000000000502') = 'owner'
  and (select hm2.household_id from public.household_members hm2
        where hm2.user_id = '00000000-0000-4000-8000-000000000502') = (select ha from t_h),
  (select format('%s @ %s', hm2.role, hm2.household_id) from public.household_members hm2
    where hm2.user_id = '00000000-0000-4000-8000-000000000502');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000502","role":"authenticated"}', true);
create temporary table t_join as
  select public.keel_household_join('jeton-lot8-alice', 'FR') as r;
insert into t_probe select '④ Alice rejoint le foyer du maître',
  coalesce((r->>'ok')::boolean, false), r::text from t_join;

-- ⛔ LE DROIT SE PERD ICI, ET IL SE PERD PAR UNE SEULE COLONNE. C'est ce que
-- `resolveGenerationAdmission` lit pour rendre `not_owner`.
insert into t_probe select '④ APRÈS: Alice est `member`, plus `owner`',
  (select hm2.role from public.household_members hm2
    where hm2.user_id = '00000000-0000-4000-8000-000000000502') = 'member'
  and (select hm2.household_id from public.household_members hm2
        where hm2.user_id = '00000000-0000-4000-8000-000000000502') = (select hm from t_h),
  (select format('%s @ %s', hm2.role, hm2.household_id) from public.household_members hm2
    where hm2.user_id = '00000000-0000-4000-8000-000000000502');

-- ══════════════════════════════════════════════════════════════════════════
-- ① LA RLS HISTORIQUE APRÈS RATTACHEMENT
-- ══════════════════════════════════════════════════════════════════════════
--
-- Deux politiques de lecture, et elles ne disent pas la même chose:
--   · `student_generated_meals_owner_read`     — `user_id = auth.uid()`
--   · `student_generated_meals_household_read` — même foyer, ET
--     (`plan_kind = 'household'` OU le lecteur est maître de ce foyer)
--
-- Ce qui se joue: Alice vient d'entrer chez le maître. Son historique à elle
-- pointe encore sur SON ancien foyer (conservé, il porte le plan). Celui du
-- maître, lui, pointe sur le foyer où elle vient d'entrer.

create temporary table t_rls(nom text, lecteur uuid, plan uuid, attendu boolean)
  on commit drop;
grant select on t_rls to authenticated;

insert into t_rls
select 'Alice lit SON plan d''avant (elle en est l''auteur)',
       '00000000-0000-4000-8000-000000000502'::uuid, p_alice, true from t_plans
union all
select '⛔ le maître NE LIT PAS le plan d''avant d''Alice',
       '00000000-0000-4000-8000-000000000501'::uuid, p_alice, false from t_plans
union all
select '⛔ Alice NE LIT PAS le plan PERSONNEL du maître',
       '00000000-0000-4000-8000-000000000502'::uuid, p_perso_maitre, false from t_plans
union all
select '⚠️ Alice LIT le plan de FOYER composé avant son arrivée',
       '00000000-0000-4000-8000-000000000502'::uuid, p_foyer_avant, true from t_plans
union all
select 'le maître lit ses deux plans (le foyer)',
       '00000000-0000-4000-8000-000000000501'::uuid, p_foyer_avant, true from t_plans
union all
select 'le maître lit ses deux plans (le personnel)',
       '00000000-0000-4000-8000-000000000501'::uuid, p_perso_maitre, true from t_plans;

-- ⚠️ LE HARNAIS. `set local role` change vraiment `current_user` — sans quoi la
-- politique ne s'applique pas et toutes les lignes seraient lues. `reset role`
-- revient AVANT d'écrire dans `t_probe`.
do $$
declare r record; v integer;
begin
  for r in select * from t_rls loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', r.lecteur, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into v from public.student_generated_meals where id = r.plan;
    reset role;
    insert into t_probe values (
      '① ' || r.nom,
      (v = 1) = r.attendu,
      format('lu=%s attendu=%s', v, case when r.attendu then 1 else 0 end));
  end loop;
end $$;

-- ⚠️ LE HARNAIS LUI-MÊME DOIT ÊTRE PROUVÉ ARMÉ. Une politique qui ne
-- s'applique pas rendrait TOUT lisible, et les quatre cas « attendu = true »
-- passeraient pendant que les deux « false » rougiraient — mais une erreur de
-- rôle qui rendrait TOUT illisible ferait exactement l'inverse et ressemblerait
-- à une RLS parfaite. Un lecteur SANS jeton ne doit rien lire du tout.
do $$
declare v integer;
begin
  perform set_config('request.jwt.claims', '', true);
  set local role authenticated;
  select count(*) into v from public.student_generated_meals;
  reset role;
  insert into t_probe values ('① sans jeton, la table ne rend RIEN', v = 0,
    format('lignes=%s', v));
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- ② LES IDENTIFIANTS FALSIFIÉS
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⛔ `write_student_meal_plan` NE LIT PAS `auth.uid()`: elle reçoit
-- `p_user_id`. C'est l'appelant edge qui le tient du JWT — et c'est pour ça
-- qu'elle est `service_role` seulement (§ ③). Ce qui reste éprouvable ici,
-- c'est la garde qui tient MÊME quand `p_user_id` est juste: on ne remplace
-- que SA propre ligne, vivante, et de la même nature.

do $$
begin
  perform public.write_student_meal_plan(
    '00000000-0000-4000-8000-000000000502'::uuid, 'replace_current',
    current_date + 70, 2::smallint,
    jsonb_build_object('plan_kind','household',
                       'household_id',(select hm from t_h),'mode','to_shop'),
    (select p_foyer_avant from t_plans));
  insert into t_probe values (
    '② remplacer le plan D''AUTRUI: refusé', false,
    'la ligne du maître a été retirée par Alice');
exception when others then
  insert into t_probe values (
    '② remplacer le plan D''AUTRUI: refusé',
    sqlerrm like 'plan_not_replaceable%', sqlerrm);
end $$;

-- ⚠️ ET LA NATURE COMPTE AUSSI: nommer son propre plan de foyer en disant
-- `personal` ne le remplace pas. Sans cette moitié, un appelant pourrait
-- retirer sa fenêtre commune en croyant toucher sa fenêtre privée.
do $$
begin
  perform public.write_student_meal_plan(
    '00000000-0000-4000-8000-000000000501'::uuid, 'replace_current',
    current_date + 70, 2::smallint,
    jsonb_build_object('plan_kind','personal',
                       'household_id',(select hm from t_h),'mode','to_shop'),
    (select p_foyer_avant from t_plans));
  insert into t_probe values (
    '② remplacer en changeant la NATURE: refusé', false,
    'un plan de foyer a été retiré par un remplacement personnel');
exception when others then
  insert into t_probe values (
    '② remplacer en changeant la NATURE: refusé',
    sqlerrm like 'plan_not_replaceable%', sqlerrm);
end $$;

-- ⚠️ LA MOITIÉ QUI PASSE. Sans elle, `plan_not_replaceable` ressemblerait à un
-- refus qui mord tout le monde — c'est-à-dire à un remplacement cassé.
create temporary table t_remp as
  select w.meal_id, w.retired_plan_id
  from public.write_student_meal_plan(
    '00000000-0000-4000-8000-000000000502'::uuid, 'replace_current',
    current_date + 70, 2::smallint,
    jsonb_build_object('plan_kind','household',
                       'household_id',(select ha from t_h),'mode','to_shop'),
    (select p_alice from t_plans)) w;

insert into t_probe select '② remplacer SON plan vivant: accepté, et l''ancien est retiré',
  (select retired_plan_id from t_remp) = (select p_alice from t_plans)
  and (select retired_at is not null from public.student_generated_meals
        where id = (select p_alice from t_plans)),
  (select format('neuf=%s retiré=%s', meal_id, retired_plan_id) from t_remp);

-- Et rejouer le MÊME remplacement une seconde fois ne passe plus: la ligne
-- n'est plus vivante. C'est la garde de concurrence, celle qui empêche deux
-- onglets de retirer deux fois la même fenêtre.
do $$
begin
  perform public.write_student_meal_plan(
    '00000000-0000-4000-8000-000000000502'::uuid, 'replace_current',
    current_date + 70, 2::smallint,
    jsonb_build_object('plan_kind','household',
                       'household_id',(select ha from t_h),'mode','to_shop'),
    (select p_alice from t_plans));
  insert into t_probe values (
    '② rejouer un remplacement déjà fait: refusé', false,
    'la même ligne a été retirée deux fois');
exception when others then
  insert into t_probe values (
    '② rejouer un remplacement déjà fait: refusé',
    sqlerrm like 'plan_not_replaceable%', sqlerrm);
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- ③ LES APPELS DIRECTS
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⛔ CE QUI SE JOUE: si un jeton `authenticated` peut appeler la RPC
-- d'écriture, la garde de rôle des fonctions edge ne garde rien — il suffit de
-- passer à côté. La liste est NOMMÉE des deux côtés: ce qui doit être fermé, et
-- ce qui doit rester ouvert parce que la fonction porte son propre garde.

insert into t_probe
select '③ fermée à `authenticated`: ' || nom,
       not has_function_privilege('authenticated', oid, 'execute'),
       format('privilège=%s', has_function_privilege('authenticated', oid, 'execute'))
from (
  select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as nom, p.oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('write_student_meal_plan',
                      'keel__ensure_personal_household',
                      'keel_backfill_personal_households',
                      'keel_household_roster_for',
                      'keel_household_is_covered')
) f;

-- ⚠️ ET CE QUI RESTE OUVERT, EXPRÈS. Sans cette moitié, « tout est fermé »
-- serait aussi le symptôme d'un `revoke` trop large qui casse le produit.
insert into t_probe
select '③ ouverte à `authenticated` (garde interne): ' || nom,
       has_function_privilege('authenticated', oid, 'execute'),
       format('privilège=%s', has_function_privilege('authenticated', oid, 'execute'))
from (
  select p.proname as nom, p.oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('keel_ensure_personal_household', 'keel_household_join',
                      'keel_household_create', 'keel_household_dissolve',
                      'keel_household_detach_member', 'keel_household_remove_member')
) f;

-- L'ÉCRITURE DIRECTE DANS LA TABLE DES PLANS, SOUS UN JETON D'UTILISATEUR.
-- ⛔ C'est l'autre porte de derrière: écrire la ligne soi-même contournerait
-- toute la fonction edge, gel et rôle compris.
do $$
declare v_ha uuid := (select ha from t_h);
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000502","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.student_generated_meals
    (user_id, starts_on, duration_days, scope, mode, plan_kind, household_id)
  values ('00000000-0000-4000-8000-000000000502', current_date + 120, 1, 'day',
          'to_shop', 'household', v_ha);
  reset role;
  insert into t_probe values ('③ écriture directe dans la table: REFUSÉE',
    false, 'un jeton `authenticated` a écrit un plan lui-même');
exception when others then
  reset role;
  insert into t_probe values ('③ écriture directe dans la table: REFUSÉE',
    true, sqlerrm);
end $$;

-- ⛔ ET LA SECONDE CEINTURE, PARCE QUE LA PREMIÈRE EST UN PRIVILÈGE.
-- Le refus ci-dessus est `permission denied`: c'est le `revoke` qui mord, pas
-- la RLS. Or ce dépôt a déjà mesuré que Supabase donne `all` à `authenticated`
-- sur toute table NEUVE — un jour où quelqu'un re-`grant` par confort, il ne
-- resterait que l'absence de politique d'écriture. On la nomme donc ici: des
-- politiques de LECTURE, et ZÉRO d'écriture.
insert into t_probe select
  '③ aucune politique d''ÉCRITURE sur la table des plans',
  count(*) filter (where polcmd <> 'r') = 0
  and count(*) filter (where polcmd = 'r') > 0,
  format('lecture=%s écriture=%s',
         count(*) filter (where polcmd = 'r'),
         count(*) filter (where polcmd <> 'r'))
from pg_policy where polrelid = 'public.student_generated_meals'::regclass;

-- ══════════════════════════════════════════════════════════════════════════
-- ④ bis · LE RETOUR DU DROIT APRÈS LE DÉPART
-- ══════════════════════════════════════════════════════════════════════════

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000501","role":"authenticated"}', true);
create temporary table t_sortie as
  select public.keel_household_remove_member(
    '00000000-0000-4000-8000-0000000005a2') as r;

insert into t_probe select '④ le maître retire Alice',
  coalesce((r->>'ok')::boolean, false), r::text from t_sortie;

insert into t_probe select '④ RETOUR: Alice est de nouveau `owner`, ailleurs',
  (select hm2.role from public.household_members hm2
    where hm2.user_id = '00000000-0000-4000-8000-000000000502') = 'owner'
  and (select hm2.household_id from public.household_members hm2
        where hm2.user_id = '00000000-0000-4000-8000-000000000502')
      is distinct from (select hm from t_h),
  (select format('%s @ %s', hm2.role, hm2.household_id) from public.household_members hm2
    where hm2.user_id = '00000000-0000-4000-8000-000000000502');

-- ⛔ ET LA LECTURE SE REFERME AVEC LE DROIT. Un plan de foyer qu'elle lisait
-- hier redevient invisible: la politique lit `keel_household_of(auth.uid())`,
-- pas une trace de passage.
delete from t_rls;
insert into t_rls
select '⛔ après le départ, Alice NE LIT PLUS le plan du foyer',
       '00000000-0000-4000-8000-000000000502'::uuid, p_foyer_avant, false from t_plans
union all
select 'mais elle lit TOUJOURS son propre historique',
       '00000000-0000-4000-8000-000000000502'::uuid, p_alice, true from t_plans;

do $$
declare r record; v integer;
begin
  for r in select * from t_rls loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', r.lecteur, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into v from public.student_generated_meals where id = r.plan;
    reset role;
    insert into t_probe values (
      '④ ' || r.nom,
      (v = 1) = r.attendu,
      format('lu=%s attendu=%s', v, case when r.attendu then 1 else 0 end));
  end loop;
end $$;

-- ── LE VERDICT ─────────────────────────────────────────────────────────────
select case when ok then '  OK  ' else ' ÉCHEC' end as verdict, name, detail
from t_probe order by name;

do $$ declare n integer; begin
  select count(*) into n from t_probe where not ok;
  if n > 0 then raise exception 'LOT 8 · autorisation · % cas en échec', n; end if;
  raise notice 'LOT 8 · autorisation (base): tous les cas passent';
end $$;

rollback;
