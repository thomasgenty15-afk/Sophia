-- ============================================================================
-- LE FOYER QU'ON A COMMENCÉ PAR ERREUR SE DÉFAIT
--
-- ── LE FAIT MESURÉ QUI COMMANDE CE LOT ─────────────────────────────────────
--
-- Signalé sur un compte réel le 2026-08-19, à l'étape 2 de l'entonnoir. La
-- personne appuie sur « Continuer », l'écran enregistre la fiche du brouillon
-- (décision du 2026-08-15 — « une fiche remplie n'est pas une fiche à jeter »),
-- et elle se retrouve avec une bouche qu'elle ne voulait pas. Ses mots:
-- « je ne peux même pas la retirer et faire continuer ».
--
-- Elle a raison, et c'était un cul-de-sac COMPLET, vérifié des deux côtés:
--
--   · la branche de l'entonnoir se dérive en `max(2, nb_bouches)`
--     (`api/onboarding.ts`), donc une fois le foyer créé elle reste « à deux »
--     POUR TOUJOURS, même à une seule bouche;
--   · l'étape 2 refuse alors d'avancer sur `missing_mouths` tant qu'il n'y a
--     pas au moins une autre bouche — retirer celle qu'on vient d'ajouter
--     rebloque donc l'étape;
--   · la tuile « Juste moi » de l'étape 1 est grisée dès qu'un foyer existe,
--     sans un mot pour dire pourquoi;
--   · et le commentaire qui justifiait ce verrou affirmait que le geste de
--     sortie « vit sur /app/household ». C'ÉTAIT FAUX: cette page ne sait
--     retirer que des MEMBRES, `keel_household_remove_member` refuse le maître
--     (`cannot_remove_owner`), et aucune fonction ne défaisait un foyer.
--
-- Autrement dit: répondre « on est deux » à la première question était
-- irréversible dans tout le produit. Un refus qui ne dit pas ce qui le lèverait
-- n'est pas un refus, c'est un mur — et celui-là n'avait même pas de porte
-- ailleurs.
--
-- ── CE QUE CETTE PORTE FAIT, ET SURTOUT CE QU'ELLE NE FAIT PAS ─────────────
--
-- ⚠️ ELLE NE DÉFAIT QU'UN FOYER OÙ LE MAÎTRE EST SEUL (`not_alone`). C'est la
-- raison EXACTE que le verrou de l'écran donnait pour exister — « ce serait
-- effacer des bouches, leurs allergies et leurs portions sur un clic
-- d'entonnoir ». Cette raison tient quand il y a des bouches; elle ne tient
-- plus quand il n'y en a aucune. On ouvre donc précisément là où l'argument
-- s'arrête, et pas d'un pouce plus loin: pour dissoudre, on retire d'abord les
-- autres bouches une par une, chacune derrière sa propre confirmation.
--
-- ⚠️ ET PAS NON PLUS UN FOYER QUI A DÉJÀ COMPOSÉ (`household_has_plans`).
-- `student_generated_meals.household_id` porte une clé étrangère SANS cascade
-- (`ON DELETE NO ACTION`): la suppression échouerait en 23503, c'est-à-dire par
-- un code d'erreur Postgres remonté brut à l'écran. Un foyer qui a composé
-- n'est de toute façon plus « un foyer commencé et pas rempli » — c'est un
-- foyer qui a servi, et son historique n'est pas à jeter sur un clic.
--
-- ⚠️ CE QUI PART AVEC LE FOYER EST DIT À L'ÉCRAN AVANT LE CLIC. Les cascades
-- emportent la ligne de bouche du maître et ce qui y est clé: son corps
-- (`household_member_bodies`), ses habitudes (`household_member_habits`), ses
-- dégoûts (`household_food_restrictions`), ses allergies de foyer
-- (`household_member_allergies`), ses invitations. Son PROFIL, sa ligne
-- `student_goals` et ses contraintes de sécurité (`student_safety_constraints`,
-- clées sur `user_id`) ne bougent pas — c'est précisément ce dont la lane
-- individuelle a besoin, et c'est ce qui rend le retour au solo non
-- destructeur pour la personne elle-même.
-- ============================================================================

create or replace function public.keel_household_dissolve()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_member uuid;
  v_household uuid;
  v_role text;
  v_others bigint;
  v_plans bigint;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select hm.member_id, hm.household_id, hm.role
    into v_member, v_household, v_role
  from public.household_members hm
  where hm.user_id = v_user;

  if v_household is null then
    return jsonb_build_object('ok', false, 'reason', 'no_household');
  end if;
  if v_role <> 'owner' then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  -- ON COMPTE PAR `member_id`, PAS PAR `user_id`. Une bouche sans compte porte
  -- `user_id is null`, et `null <> v_user` ne rend PAS `true` en SQL: compter
  -- sur cette colonne aurait rendu « il est seul » sur un foyer plein
  -- d'enfants, c'est-à-dire ouvert la suppression exactement là où elle est
  -- interdite.
  select count(*) into v_others
  from public.household_members hm
  where hm.household_id = v_household
    and hm.member_id <> v_member;

  if v_others > 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_alone', 'others', v_others);
  end if;

  select count(*) into v_plans
  from public.student_generated_meals m
  where m.household_id = v_household;

  if v_plans > 0 then
    return jsonb_build_object('ok', false, 'reason', 'household_has_plans');
  end if;

  delete from public.households where id = v_household;
  return jsonb_build_object('ok', true);
end;
$function$;

comment on function public.keel_household_dissolve() is
  'Défait le foyer du maître appelant, et SEULEMENT s''il y est seul et qu''il '
  'n''a jamais composé. C''est la sortie de la branche « on est deux » de '
  'l''entonnoir, qui était sans retour: la branche se dérive du nombre de '
  'bouches, donc rien d''autre ne pouvait ramener quelqu''un au solo. Refuse '
  'par motif nommé: not_authenticated, no_household, not_owner, not_alone, '
  'household_has_plans.';

-- `revoke from public` NE RETIRE PAS `anon`: il a son propre GRANT implicite,
-- et le dépôt a déjà payé cette cicatrice (migration 20260818200000).
revoke all on function public.keel_household_dissolve() from public, anon;
grant execute on function public.keel_household_dissolve() to authenticated;
