-- ============================================================================
-- S5 ② — LA PURGE RGPD RÉCLAME LES DEUX TABLES DE SANTÉ DU FOYER
--
-- ── LE TROU, MESURÉ LE 2026-08-22 ─────────────────────────────────────────
--
-- `household_member_allergies` (8 lignes) et `household_food_restrictions`
-- (6) ne sont réclamées NI par l'export, NI par la purge, NI par le seul test
-- qui prétend garder le cycle de vie RGPD:
--
--     grep -c 'household_member_allergies\|household_food_restrictions' \
--       supabase/functions/account-export-v1/index.ts   →   0
--
-- Ce sont des données de SANTÉ, y compris de mineurs, y compris de bouches qui
-- n'ont jamais eu de compte. L'export est câblé dans le même lot; ce fichier
-- est la moitié PURGE.
--
-- ── L'ARBITRAGE, ET IL N'EST PAS CELUI DU CORPS ───────────────────────────
--
-- `keel_household_purge_user` a deux branches:
--
--   * « je pars avec ma place » (`departs_with_account`, non-maître) — la
--     ligne du foyer est SUPPRIMÉE. Les deux tables partent avec elle. La
--     cascade des FK le faisait déjà; les `delete` explicites sont ajoutés
--     pour la MÊME raison que celui du corps en 20260812220000: « ce que la
--     purge efface » doit se lire DANS la fonction, pas dans une clause de
--     contrainte qu'il faut aller chercher — et un test qui lit le corps de la
--     fonction ne voit que ce qui y est écrit.
--
--   * DÉTACHEMENT (la branche NOMINALE, D3) — la ligne reste, `user_id` passe
--     à NULL. ⛔ **LES DEUX TABLES RESTENT AUSSI, ET C'EST UNE DÉCISION, PAS
--     UN OUBLI.**
--
-- ⛔ POURQUOI L'ASYMÉTRIE AVEC LE CORPS EST JUSTE. Le corps PART dans les deux
-- branches (2026-08-12), et l'arbitrage était écrit ainsi: « le coût est une
-- part standard jusqu'à ce que le maître resaisisse — SÛR, et visible ».
-- L'état dégradé d'un corps effacé est donc SÛR. L'état dégradé d'une allergie
-- effacée ne l'est pas: la bouche reste à table, le foyer continue de cuisiner
-- pour elle, et `generate-household-meal-v1` fait l'UNION des allergies du
-- foyer — « une allergie d'un seul membre gouverne TOUTE la casserole ».
-- Effacer la ligne retirerait la ceinture EN SILENCE, et la casserole suivante
-- pourrait contenir l'allergène.
--
--     UN GESTE DE VIE PRIVÉE NE PEUT PAS PRODUIRE UNE RÉGRESSION DE SÉCURITÉ.
--
-- Et ce n'est pas un trou RGPD laissé ouvert: la décision n° 24 du plan
-- (2026-08-21) dit « A et B selon la bouche » — une bouche SANS compte n'a
-- aucun moyen d'exporter, **le maître les porte**. Après la purge, la personne
-- EST une bouche sans compte: sa ligne d'allergie relève exactement du même
-- régime que son prénom et sa date de naissance, gardés par D3. Ce qui
-- manquait n'était pas l'effacement, c'était de le DIRE — et l'export le dit
-- maintenant (`ce_qui_survit_a_la_suppression.champs_conserves`).
--
-- ── CE QUI DISPARAÎT QUAND MÊME, ET C'EST LE BON MORCEAU ──────────────────
--
-- `created_by` des deux tables est `on delete set null` vers `auth.users`.
-- La ligne survit donc SANS SON AUTEUR: le lien vers le compte supprimé est
-- rompu par la base, pas par cette fonction. C'est asserté plus bas — un
-- `revoke`/une cascade qu'on écrit sans l'asserter est le défaut que ce dépôt
-- vient de payer huit fois (`S6`).
-- ============================================================================

begin;

create or replace function public.keel_household_purge_user(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_target record;
begin
  if p_user is null then
    return jsonb_build_object('ok', true, 'action', 'none');
  end if;

  select hm.member_id, hm.role, hm.household_id, hm.departs_with_account
    into v_target
  from public.household_members hm
  where hm.user_id = p_user;

  if v_target.member_id is null then
    return jsonb_build_object('ok', true, 'action', 'none');
  end if;

  -- LE MAÎTRE N'EST JAMAIS SUPPRIMÉ, même s'il a coché: `keel_household_set_
  -- departure` refuse déjà de poser l'intention sur lui, et cette seconde
  -- vérification couvre une ligne écrite avant ce lot ou par un chemin futur.
  if v_target.departs_with_account and v_target.role <> 'owner' then
    -- La cascade des FK emporte déjà le corps, les allergies et les règles de
    -- maison; les `delete` explicites sont là pour que « ce que la purge
    -- efface » se lise dans la fonction et pas dans une clause de contrainte
    -- qu'il faut aller chercher.
    delete from public.household_member_allergies where member_id = v_target.member_id;
    delete from public.household_food_restrictions where member_id = v_target.member_id;
    delete from public.household_member_bodies where member_id = v_target.member_id;
    delete from public.household_members where member_id = v_target.member_id;
    return jsonb_build_object(
      'ok', true, 'action', 'removed',
      'member_id', v_target.member_id, 'household_id', v_target.household_id);
  end if;

  delete from public.household_member_bodies where member_id = v_target.member_id;

  -- ⛔ ICI, ON N'EFFACE **PAS** `household_member_allergies` NI
  -- `household_food_restrictions`, ET C'EST ÉCRIT EXPRÈS.
  -- La bouche reste à table (D3). Effacer son allergie retirerait la ceinture
  -- de sécurité du foyer en silence — voir l'en-tête. Ce qui disparaît, c'est
  -- l'AUTEUR: `created_by` est `on delete set null` vers `auth.users`, donc la
  -- ligne survit détachée du compte supprimé.

  update public.household_members
     set user_id = null,
         departs_with_account = false
   where member_id = v_target.member_id;

  return jsonb_build_object(
    'ok', true, 'action', 'detached',
    'member_id', v_target.member_id, 'household_id', v_target.household_id);
end;
$function$;

comment on function public.keel_household_purge_user(uuid) is
  'Ce que la purge RGPD fait du FOYER d''un compte effacé: sa ligne est '
  'DÉTACHÉE (D3) — elle reste une bouche du foyer — sauf si la personne a '
  'coché « retirer aussi ma place », auquel cas elle part AVEC ses allergies '
  'et les règles de maison qui la visent. SON CORPS PART DANS LES DEUX CAS '
  '(2026-08-12). SES ALLERGIES, NON (2026-08-22, S5): la bouche reste à '
  'table, le foyer cuisine encore pour elle, et l''union de sécurité de '
  'generate-household-meal-v1 lit cette table — les effacer retirerait la '
  'ceinture en silence. Un geste de vie privée ne peut pas produire une '
  'régression de sécurité. L''auteur, lui, part: created_by est on delete set '
  'null. Appelée AVANT purge_auth_user. Réservée au SERVEUR.';

revoke all privileges on function public.keel_household_purge_user(uuid)
  from public, anon, authenticated;
grant execute on function public.keel_household_purge_user(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- LE CONTRÔLE — LES DEUX BRANCHES REJOUÉES, PUIS ANNULÉES
-- ---------------------------------------------------------------------------
--
-- Relire la fonction prouverait qu'elle a été écrite. On monte deux foyers, on
-- pose une allergie et une règle de maison sur chaque bouche, et on rejoue les
-- deux branches — celle qui EFFACE et celle qui GARDE. Une seule des deux
-- suffirait à laisser passer très exactement l'erreur qu'on veut interdire.

do $$
declare
  v_user_a uuid;
  v_user_b uuid;
  v_house_a uuid;
  v_house_b uuid;
  v_owner_a uuid;
  v_kid uuid;
  v_owner_b uuid;
  v_res jsonb;
  v_rows int;
begin
  select id into v_user_a from auth.users
   where public.keel_household_of(id) is null
   order by created_at limit 1;
  select id into v_user_b from auth.users
   where id <> v_user_a and public.keel_household_of(id) is null
   order by created_at limit 1;
  if v_user_a is null or v_user_b is null then
    raise notice 'purge/allergies: pas assez de comptes libres, contrôle sauté';
    return;
  end if;

  -- ---- BRANCHE 1: « je pars avec ma place » --------------------------------
  insert into public.households (name, created_by)
  values ('__qa_s5_a__', v_user_a) returning id into v_house_a;
  insert into public.household_members
    (household_id, user_id, role, first_name, birth_date)
  values (v_house_a, v_user_a, 'owner', 'OwnerA', '1990-01-01')
  returning member_id into v_owner_a;
  insert into public.household_members
    (household_id, user_id, role, first_name, birth_date, departs_with_account)
  values (v_house_a, v_user_b, 'member', 'Kid', current_date - interval '8 years', true)
  returning member_id into v_kid;

  insert into public.household_member_allergies
    (household_id, member_id, label, created_by)
  values (v_house_a, v_kid, '__qa_arachide__', v_user_a);
  insert into public.household_food_restrictions
    (household_id, member_id, label, created_by)
  values (v_house_a, v_kid, '__qa_nutella__', v_user_a);

  v_res := public.keel_household_purge_user(v_user_b);
  if v_res ->> 'action' <> 'removed' then
    raise exception 'purge/allergies: branche 1 attendue « removed », obtenue %',
      v_res ->> 'action';
  end if;
  select count(*) into v_rows
  from public.household_member_allergies where member_id = v_kid;
  if v_rows <> 0 then
    raise exception
      'purge/allergies: % allergie(s) survivent à une bouche SUPPRIMÉE — '
      'donnée de santé conservée hors de tout titulaire', v_rows;
  end if;
  select count(*) into v_rows
  from public.household_food_restrictions where member_id = v_kid;
  if v_rows <> 0 then
    raise exception
      'purge/restrictions: % règle(s) survivent à une bouche SUPPRIMÉE', v_rows;
  end if;

  -- ---- BRANCHE 2: le détachement, la branche NOMINALE ----------------------
  --
  -- ⛔ LE CAS QUI PASSE DE L'AUTRE CÔTÉ. Il assert que les lignes RESTENT: si
  -- quelqu'un « répare » un jour la branche 2 en y ajoutant les deux `delete`
  -- par symétrie avec le corps, c'est ici que ça se verra — et la phrase
  -- d'export `ce_qui_survit_a_la_suppression` deviendra fausse au même instant.
  insert into public.households (name, created_by)
  values ('__qa_s5_b__', v_user_a) returning id into v_house_b;
  insert into public.household_members
    (household_id, user_id, role, first_name, birth_date)
  values (v_house_b, v_user_b, 'owner', 'OwnerB', '1988-05-05')
  returning member_id into v_owner_b;

  insert into public.household_member_allergies
    (household_id, member_id, label, created_by)
  values (v_house_b, v_owner_b, '__qa_lait__', v_user_b);
  insert into public.household_food_restrictions
    (household_id, member_id, label, created_by)
  values (v_house_b, v_owner_b, '__qa_soda__', v_user_b);

  v_res := public.keel_household_purge_user(v_user_b);
  if v_res ->> 'action' <> 'detached' then
    raise exception 'purge/allergies: branche 2 attendue « detached », obtenue %',
      v_res ->> 'action';
  end if;
  select count(*) into v_rows
  from public.household_member_allergies where member_id = v_owner_b;
  if v_rows <> 1 then
    raise exception
      'purge/allergies: l''allergie d''une bouche DÉTACHÉE a disparu (% ligne) '
      '— le foyer cuisinera pour elle sans savoir ce qui la rend malade', v_rows;
  end if;
  select count(*) into v_rows
  from public.household_food_restrictions where member_id = v_owner_b;
  if v_rows <> 1 then
    raise exception
      'purge/restrictions: la règle de maison d''une bouche DÉTACHÉE a '
      'disparu (% ligne)', v_rows;
  end if;

  -- ---- ET L'AUTEUR PART, LUI ---------------------------------------------
  -- `created_by` est `on delete set null`: la ligne survit SANS le compte.
  -- Asserté sur le CATALOGUE et non en supprimant un compte réel — supprimer
  -- une ligne `auth.users` ici serait une suppression de données.
  select count(*) into v_rows
  from pg_constraint
  where conname in ('household_member_allergies_created_by_fkey',
                    'household_food_restrictions_created_by_fkey')
    and confdeltype = 'n';           -- 'n' = SET NULL
  if v_rows <> 2 then
    raise exception
      'purge/allergies: % FK sur 2 en « set null » — une ligne survivrait en '
      'nommant un compte supprimé, ou la suppression du compte échouerait',
      v_rows;
  end if;

  raise notice
    'keel_household_purge_user: branche « removed » efface les 2 tables, '
    'branche « detached » les GARDE, created_by en set null sur les deux';
  raise exception using errcode = 'triggered_action_exception', message = '__qa_rollback__';
exception
  when triggered_action_exception then
    if sqlerrm <> '__qa_rollback__' then raise; end if;
end $$;

commit;
