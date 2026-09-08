-- KEEL — UNE PHRASE DÉPLACE L'APPÉTIT D'UN CRAN (2026-09-08).
--
-- Autorité produit: `docs/keel/RETOURS-ET-BILAN-CE-QUE-CA-CHANGE.md`.
-- Classifieur: `_shared/keel/draft_note_classify.ts`, tiroir ④ (`PortionMove`).
-- Jetons: `_shared/keel/tokens.ts` (`APPETITE_LEVELS`).
-- Facteurs: `_shared/keel/meal_envelope.ts` (`APPETITE_FACTORS`, ±10 %).
--
-- ══════════════════════════════════════════════════════════════════════════
-- ⛔ POURQUOI UNE SECONDE FONCTION, ET PAS UN PARAMÈTRE DE PLUS SUR L'AUTRE
-- ══════════════════════════════════════════════════════════════════════════
--
-- `keel_household_set_member_body` lit `auth.uid()`. Sous `service_role`,
-- `auth.uid()` est **NULL** — c'est une cicatrice déjà payée plusieurs fois
-- dans ce dépôt (les RPC de sécurité par bouche, réparées par des variantes
-- `_for` le 2026-09-05). La lane qui classe une note de brouillon tourne avec
-- l'admin: elle ne peut donc pas appeler l'autre, et un appel silencieusement
-- refusé (`not_authenticated`) ressemble trait pour trait à « la personne
-- n'avait rien demandé ».
--
-- ⛔ ET ELLE EST ÉTROITE — UN SEUL CHAMP. L'autre fonction exige le corps
-- ENTIER (`body_incomplete` si la taille ou le poids manque) parce qu'elle sert
-- un formulaire. Déplacer un appétit par elle imposerait de relire puis de
-- réécrire taille, poids, sexe et activité — c'est-à-dire de risquer d'écraser
-- quatre faits pour en bouger un. Ici on ne touche QUE `appetite`.
--
-- ══════════════════════════════════════════════════════════════════════════
-- ⛔ LE CRAN EST CALCULÉ ICI, ET L'APPELANT NE DIT QUE LA DIRECTION
-- ══════════════════════════════════════════════════════════════════════════
--
-- C'est la même règle que le classifieur applique au modèle: **une phrase porte
-- une direction, jamais une amplitude**. Laisser l'appelant poser la valeur
-- finale rouvrirait la porte à un saut de deux crans depuis une seule phrase.
--
-- L'échelle, et elle est fermée:  small ──── average ──── large
--                                 −10 %        0 %        +10 %
--
-- ⚠️ L'ABSENCE DE RÉPONSE EST LE NEUTRE, mais elle n'est PAS `average`. Une
-- fiche muette (`appetite is null`) qui reçoit un « moins » descend à `small`;
-- la même qui reçoit un « plus » monte à `large`. C'est `APPETITE_FACTORS` qui
-- le dit: l'absence vaut ×1,00, donc elle se comporte comme le milieu.
--
-- ⛔ ET LE BOUT DE L'ÉCHELLE SE DIT (`at_floor` / `at_ceiling`), il ne se tait
-- pas. Une bouche déjà à `small` qui reçoit un second « moins » ne bouge plus:
-- l'appelant DOIT pouvoir le dire à la personne plutôt que de lui laisser
-- croire que sa phrase a été appliquée. « Un plan inchangé avec une phrase
-- claire vaut mieux qu'un plan refait de travers. »

create or replace function public.keel_household_set_member_appetite_for(
  p_user uuid,
  p_member uuid,
  p_direction text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_household uuid;
  v_role text;
  v_target uuid;
  v_direction text := nullif(btrim(coalesce(p_direction, '')), '');
  v_current text;
  v_next text;
begin
  if p_user is null then
    return jsonb_build_object('ok', false, 'reason', 'no_user');
  end if;
  if v_direction is null or v_direction not in ('down', 'up') then
    -- Un sens illisible n'est PAS un demi-sens: on ne devine pas « moins ».
    return jsonb_build_object('ok', false, 'reason', 'bad_direction');
  end if;

  -- ⛔ LES MÊMES TROIS GARDES QUE L'AUTRE FONCTION, DANS LE MÊME ORDRE. Le seul
  -- changement est d'où vient l'utilisateur: en paramètre, pas de `auth.uid()`.
  select hm.household_id, hm.role into v_household, v_role
  from public.household_members hm
  where hm.user_id = p_user;

  if v_household is null then
    return jsonb_build_object('ok', false, 'reason', 'no_household');
  end if;
  if v_role <> 'owner' then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  select hm.member_id into v_target
  from public.household_members hm
  where hm.member_id = p_member and hm.household_id = v_household;

  if v_target is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;

  select b.appetite into v_current
  from public.household_member_bodies b
  where b.member_id = v_target;

  -- ⚠️ UNE FICHE SANS CORPS N'EST PAS UNE FICHE À `average`. On n'INSÈRE pas
  -- une ligne de corps ici: le corps est un tout-ou-rien (taille, poids, sexe),
  -- et en fabriquer une moitié pour y poser un appétit apprendrait au moteur
  -- qu'il existe un corps qui n'a jamais été saisi.
  if not exists (
    select 1 from public.household_member_bodies b where b.member_id = v_target
  ) then
    return jsonb_build_object('ok', false, 'reason', 'no_body');
  end if;

  v_current := nullif(btrim(coalesce(v_current, '')), '');
  if v_current is not null and v_current not in ('small', 'average', 'large') then
    -- Une valeur hors échelle ne se « corrige » pas en la remplaçant: on ne
    -- sait pas de quel cran elle venait. Même règle que `noBaseline` au bilan.
    return jsonb_build_object('ok', false, 'reason', 'off_scale');
  end if;

  -- L'absence se comporte comme le milieu (`APPETITE_FACTORS` rend ×1,00).
  v_current := coalesce(v_current, 'average');

  if v_direction = 'down' then
    if v_current = 'small' then
      return jsonb_build_object(
        'ok', false, 'reason', 'at_floor', 'appetite', v_current
      );
    end if;
    v_next := case v_current when 'large' then 'average' else 'small' end;
  else
    if v_current = 'large' then
      return jsonb_build_object(
        'ok', false, 'reason', 'at_ceiling', 'appetite', v_current
      );
    end if;
    v_next := case v_current when 'small' then 'average' else 'large' end;
  end if;

  update public.household_member_bodies b
  set appetite = v_next,
      -- ⛔ LE DRAPEAU GOUVERNE, PAS LE NULL DE VALEUR — la règle de la migration
      -- qui a créé ces deux colonnes. Une phrase EST une réponse: taire le
      -- drapeau ferait reposer la question à quelqu'un qui vient d'y répondre.
      appetite_asked_at = now()
  where b.member_id = v_target;

  return jsonb_build_object(
    'ok', true,
    'member_id', v_target,
    'previous', v_current,
    'appetite', v_next
  );
end;
$function$;

comment on function public.keel_household_set_member_appetite_for(uuid, uuid, text) is
  'Déplace `household_member_bodies.appetite` d''UN cran pour une bouche, sur '
  'la direction lue dans une phrase de brouillon. Variante `_for` — `p_user` '
  'explicite — parce que `auth.uid()` est NULL sous service_role et que la lane '
  'qui classe les notes tourne avec l''admin. Rend `at_floor` / `at_ceiling` '
  'quand l''échelle est au bout: l''appelant doit pouvoir le DIRE.';

-- ⛔ AUCUN DROIT À `anon` NI À `authenticated`. Cette variante contourne
-- `auth.uid()`: l'exposer à un jeton de navigateur laisserait n'importe qui
-- passer le `p_user` de quelqu'un d'autre. Le formulaire garde l'autre
-- fonction, qui lit l'utilisateur du jeton. ⚠️ `revoke from public` ne suffit
-- pas: les privilèges par défaut de ce projet accordent tout à
-- `authenticated` sur ce qui est créé, et il faut le retirer nommément.
revoke all on function public.keel_household_set_member_appetite_for(uuid, uuid, text)
  from public;
revoke all on function public.keel_household_set_member_appetite_for(uuid, uuid, text)
  from anon;
revoke all on function public.keel_household_set_member_appetite_for(uuid, uuid, text)
  from authenticated;
grant execute on function public.keel_household_set_member_appetite_for(uuid, uuid, text)
  to service_role;
