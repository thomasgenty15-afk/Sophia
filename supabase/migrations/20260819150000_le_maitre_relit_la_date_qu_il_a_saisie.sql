-- ============================================================================
-- LE MAÎTRE RELIT LA DATE DE NAISSANCE QU'IL A LUI-MÊME SAISIE
--
-- ── LE FAIT MESURÉ ─────────────────────────────────────────────────────────
-- Signalé le 2026-08-19: « pourquoi quand [la carte] est fermée il y a marqué
-- "Renseignée", autant l'afficher — parce que quand je déplie, elle ne s'affiche
-- pas non plus ». Il a raison sur les deux: la carte affichait un ÉTAT
-- (« renseignée ») là où elle pouvait afficher un FAIT, et le champ d'édition
-- restait vide, ce qui se lit comme une perte.
--
-- ── POURQUOI ELLE MANQUAIT, ET CE QUI ÉTAIT JUSTE DANS CETTE ABSENCE ───────
-- `keel_household_roster_for` ne rend JAMAIS la date d'une bouche, seulement un
-- état d'âge (`minor` / `adult` / `unknown`). La règle est écrite: « le foyer
-- doit savoir qu'il y a un enfant à table, pas son âge ». Elle protège une
-- bouche des AUTRES bouches — le roster est lisible par tout membre du foyer,
-- y compris un adolescent qui a réclamé son profil.
--
-- Ce qu'elle n'a jamais eu de raison de faire, c'est cacher la date au MAÎTRE,
-- qui est la personne qui l'a tapée. Cette fonction ouvre donc exactement cet
-- écart, et rien de plus.
--
-- ── ⛔ POURQUOI PAS UN `GRANT` SUR LA FONCTION QUI EXISTE DÉJÀ ─────────────
-- `keel_household_member_birth_date(uuid)` rend la même date, et la tentation
-- était de l'ouvrir à `authenticated`. Ç'aurait été une FUITE: son corps est un
-- `select` sur `member_id` SANS AUCUN CONTRÔLE DE PROPRIÉTÉ — elle est
-- `security definer` et réservée à `service_role` précisément pour ça. Ouverte,
-- n'importe quel compte lirait la date de naissance de n'importe quelle bouche
-- de n'importe quel foyer en devinant un uuid.
--
-- La nouvelle porte REFAIT la résolution (profil d'abord, fiche ensuite) et y
-- ajoute la seule chose qui manquait: « est-ce que l'appelant gouverne le foyer
-- de cette bouche ». Copier la résolution plutôt que d'appeler l'autre est
-- délibéré — un jour où l'une des deux changera, une différence se verra dans un
-- test plutôt que dans un plan.
-- ============================================================================

create or replace function public.keel_household_member_birth_date_for_owner(
  p_member uuid
)
returns date
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_household uuid;
  v_role text;
  v_target_household uuid;
  v_date date;
begin
  if v_user is null then
    return null;
  end if;

  select hm.household_id, hm.role into v_household, v_role
  from public.household_members hm
  where hm.user_id = v_user;

  -- ⛔ LE MAÎTRE, ET LUI SEUL. Un membre qui a réclamé son profil ne lit pas
  -- l'âge des autres: c'est très exactement ce que le roster refuse, et cette
  -- porte ne doit pas être le trou par lequel il rentre.
  if v_household is null or v_role <> 'owner' then
    return null;
  end if;

  select hm.household_id into v_target_household
  from public.household_members hm
  where hm.member_id = p_member;

  if v_target_household is distinct from v_household then
    return null;
  end if;

  -- La MÊME résolution que `keel_household_member_birth_date`: le profil
  -- d'abord (une bouche qui a un compte porte sa date là), la fiche ensuite, et
  -- un `keel_age_state` illisible n'écrase jamais une date valide.
  select coalesce(
    case when public.keel_age_state(p.birth_date) <> 'unknown' then p.birth_date end,
    case when public.keel_age_state(hm.birth_date) <> 'unknown' then hm.birth_date end
  )
  into v_date
  from public.household_members hm
  left join public.profiles p on p.id = hm.user_id
  where hm.member_id = p_member;

  return v_date;
end;
$function$;

comment on function public.keel_household_member_birth_date_for_owner(uuid) is
  'La date de naissance d''une bouche, RENDUE AU SEUL MAÎTRE de son foyer. '
  'Le roster ne la rend jamais (« le foyer doit savoir qu''il y a un enfant à '
  'table, pas son âge ») — cette porte ouvre l''écart que cette règle n''avait '
  'pas de raison de couvrir: la personne qui a saisi la date doit pouvoir la '
  'relire et la corriger. Rend NULL plutôt qu''un refus: l''appelant qui n''a '
  'pas le droit est indiscernable d''une bouche sans date, ce qui est la bonne '
  'réponse à une question qui ne le regarde pas.';

-- `revoke from public` NE RETIRE PAS `anon` — cicatrice 20260818200000.
revoke all on function public.keel_household_member_birth_date_for_owner(uuid)
  from public, anon;
grant execute on function public.keel_household_member_birth_date_for_owner(uuid)
  to authenticated;
