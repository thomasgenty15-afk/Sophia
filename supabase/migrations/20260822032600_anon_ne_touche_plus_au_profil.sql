-- S6 — LES GRANTS PAR DÉFAUT · 7/8 · `profiles`
--
-- ⛔ LA PIRE DES HUIT, ET ELLE EST TRAITÉE EN DERNIER EXPRÈS. Les six
--    précédentes ont prouvé que le geste ne casse rien ; celle-ci est la seule
--    que le front ÉCRIT sous `authenticated`, et elle porte `birth_date` —
--    l'entrée de la porte mineur que `S3` vient de fermer le 2026-08-22.
--
-- ⛔ LE CHAÎNAGE QU'IL FAUT VOIR EN ENTIER. `S3` a rebranché l'escalade
--    « mineur » et fermé son entrée manquante. Cette garde lit `birth_date`.
--    Or `anon` portait `UPDATE` sur `profiles` : le paramètre qui décide si
--    une bouche est mineure était modifiable par un rôle NON AUTHENTIFIÉ.
--    La RLS s'y opposait — mais EN SILENCE, en rendant « 0 ligne » et aucune
--    erreur. Et les policies de cette table sont `TO public`, donc elles
--    s'appliquent aux DEUX rôles ; il n'y a pas de « policy pour anon » à
--    corriger, il n'y a que le droit à reprendre.
--
--        profiles | Users own profiles       | ALL    | auth.uid() = id
--        profiles | rls_profiles_select_self | SELECT | auth.uid() = id
--        profiles | rls_profiles_insert_self | INSERT | (with check) auth.uid() = id
--        profiles | rls_profiles_update_self | UPDATE | auth.uid() = id
--
-- CE QUE `authenticated` GARDE, ET POURQUOI. `select, insert, update, delete`
-- — parce que la policy `Users own profiles` est en clause `ALL` et couvre
-- littéralement les quatre. Le front écrit cette table à NEUF endroits, tous
-- des `.update()` (`UserProfile.tsx:207` et `:281`, `chat.ts:355` et `:392`,
-- `household.ts:1253` (`birth_date`), `uiLanguage.ts:62`, `onboarding.ts:1936`,
-- `mealEnergy.ts:587`, `JoinPage.tsx:259`, `StudentWeekPlanPage.tsx:1816`).
-- Emporter l'`update` de `authenticated`, c'est casser le changement de nom,
-- de langue, de fuseau, la coupure du proactif et la saisie de la date de
-- naissance — d'un coup.
--
-- ⚠️ CE QUE CE LOT NE TRANCHE PAS, ET QUI RESTE OUVERT. Le `DELETE` de
--    `authenticated` est CONSERVÉ parce qu'une policy l'autorise, pas parce
--    qu'un appelant s'en sert : aucun code du dépôt ne supprime une ligne
--    `profiles` sous l'identité de l'élève — la suppression de compte passe
--    par `account-deletion-v1` et `purge-deleted-accounts`, en `service_role`.
--    Une clause `ALL` écrite pour la lecture et l'écriture accorde donc, par
--    effet de bord, un chemin de suppression hors du parcours RGPD. Ce n'est
--    pas un `grant` à reprendre — c'est une POLICY à réécrire, et une policy
--    n'est pas réversible par un `grant`. Fiche `S6-a`.
--
-- CE QUI PART POUR LES DEUX RÔLES : `truncate` (il échappe à la RLS et vidait
-- 1 313 profils), `references`, `trigger`, et `maintain` — ce dernier étant
-- celui qu'une liste de privilèges nommés laisse toujours derrière elle.

revoke all privileges on table public.profiles from anon, authenticated;

grant select on table public.profiles to anon;
grant select, insert, update, delete on table public.profiles to authenticated;

do $verif$
begin
  -- ⛔ LE CŒUR DU LOT : `anon` n'écrit plus rien sur la table qui porte
  -- `birth_date`.
  if has_table_privilege('anon', 'public.profiles', 'INSERT')
     or has_table_privilege('anon', 'public.profiles', 'UPDATE')
     or has_table_privilege('anon', 'public.profiles', 'DELETE')
     or has_table_privilege('anon', 'public.profiles', 'TRUNCATE')
  then
    raise exception 'S6/profiles : anon garde un droit d''écriture';
  end if;

  -- `TRUNCATE` échappe à la RLS : aucune policy ne peut le retenir.
  if has_table_privilege('authenticated', 'public.profiles', 'TRUNCATE') then
    raise exception 'S6/profiles : authenticated peut encore vider la table';
  end if;

  -- LE CAS QUI PASSE, et sans lui ce lot n'est pas prouvé : les neuf écritures
  -- du front continuent d'exister.
  if not (has_table_privilege('authenticated', 'public.profiles', 'SELECT')
          and has_table_privilege('authenticated', 'public.profiles', 'INSERT')
          and has_table_privilege('authenticated', 'public.profiles', 'UPDATE'))
  then
    raise exception 'S6/profiles : une écriture du front a été emportée';
  end if;
end
$verif$;
