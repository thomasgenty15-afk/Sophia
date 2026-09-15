-- ===========================================================================
-- LE CORPS D'UN FOYER ÉTAIT LISIBLE SANS COMPTE.
--
-- ── LE DÉFAUT, MESURÉ LE 2026-08-18 ────────────────────────────────────────
-- `keel_household_bodies_for(uuid)` rend, pour un foyer: prénom, taille,
-- poids, sexe, âge, et depuis ce matin le niveau d'activité de chaque bouche —
-- y compris celles des ENFANTS. Elle était exécutable par `anon`:
--
--   has_function_privilege('anon', 'keel_household_bodies_for(uuid)', 'execute')
--     -> t
--
-- Avec la seule clé publique et un identifiant de foyer, un appelant NON
-- AUTHENTIFIÉ récupérait donc le corps de toute une famille. Ses deux voisines
-- posées le même jour (`keel_household_member_bodies`,
-- `keel_household_set_member_body`) rendaient `f`: le défaut est isolé, et
-- c'est ce contraste qui le nomme.
--
-- ── LA CAUSE EST UNE CICATRICE DÉJÀ ÉCRITE DANS CE DÉPÔT ───────────────────
-- `20260818100000:472` fait:
--
--   revoke all on function public.keel_household_bodies_for(uuid) from public;
--
-- **`revoke ... from public` NE RETIRE PAS `anon`.** `PUBLIC` est le
-- pseudo-rôle qui porte le défaut d'octroi; `anon` est un rôle NOMMÉ, à qui
-- Supabase a concédé le privilège séparément. Retirer l'un laisse l'autre
-- debout, et le résultat se lit comme une porte fermée dans le fichier.
--
-- ⚠️ ET LA MIGRATION QUI L'A RÉPARÉ NOMMAIT DÉJÀ LE PIÈGE. Le lot L0
-- (`20260818160000`) écrit correctement `from public, anon` sur SES deux
-- fonctions — parce que son auteur connaissait la cicatrice. Personne n'a
-- appliqué la même ligne à la fonction dont ces deux-là dépendent. Une garde
-- posée sur les objets neufs et pas sur l'objet ancien qu'ils prolongent est
-- la forme la plus courante de ce défaut ici.
--
-- ── CE QUE CETTE MIGRATION NE FAIT PAS ─────────────────────────────────────
-- Elle ne touche ni la signature, ni le corps, ni `security invoker/definer`,
-- ni les octrois à `authenticated` et `service_role`, qui sont les appelants
-- légitimes. Un seul privilège change, sur un seul rôle.
--
-- RÉVERSIBILITÉ — une ligne, et il faudrait une très bonne raison:
--   grant execute on function public.keel_household_bodies_for(uuid) to anon;
-- ===========================================================================

begin;

revoke all on function public.keel_household_bodies_for(uuid) from anon;

-- ---------------------------------------------------------------------------
-- CONTRÔLE — on lit le privilège, on n'inspecte pas le texte de la commande.
--
-- Les trois fonctions du foyer sont vérifiées ENSEMBLE: c'est le contraste
-- entre elles qui a révélé le défaut, et c'est lui qui doit rester vrai. Le
-- cas PASSANT est vérifié aussi — une garde qui retirerait le privilège à
-- `authenticated` fermerait l'écran du foyer tout en ayant l'air de marcher.
-- ---------------------------------------------------------------------------
do $$
declare
  fn text;
  anon_can boolean;
  auth_can boolean;
  leaks int := 0;
begin
  foreach fn in array array[
    'public.keel_household_bodies_for(uuid)',
    'public.keel_household_member_bodies()',
    'public.keel_household_set_member_body(uuid,numeric,numeric,text,text)'
  ] loop
    select has_function_privilege('anon', fn, 'execute'),
           has_function_privilege('authenticated', fn, 'execute')
      into anon_can, auth_can;

    if anon_can then
      leaks := leaks + 1;
      raise warning 'revoke_left_anon: % est encore exécutable par anon', fn;
    end if;

    if not auth_can then
      raise exception
        'revoke_left_anon: % n''est plus exécutable par authenticated — '
        'la garde a fermé la porte des appelants légitimes', fn;
    end if;
  end loop;

  if leaks > 0 then
    raise exception
      'revoke_left_anon: % fonction(s) du foyer encore ouvertes à anon', leaks;
  end if;

  raise notice
    'revoke_left_anon: 3 fonctions du foyer — anon: aucune, authenticated: les trois';
end;
$$;

commit;
