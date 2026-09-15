-- S6 — LES GRANTS PAR DÉFAUT · 1/8 · `substances`
--
-- POURQUOI. `alter default privileges` de Supabase accorde `arwdDxtm` — TOUT —
-- à `anon`, `authenticated` et `service_role` sur CHAQUE table neuve du schéma
-- `public` (mesuré le 2026-08-22 : `pg_default_acl`, objtype `r`). Aucune
-- migration de ce dépôt n'a jamais repris ces droits sur les huit tables que la
-- revue sécurité a listées. `substances` est la première, et la moins risquée :
-- c'est un référentiel, il n'a qu'une policy, en `SELECT`.
--
-- ⛔ CE QUE LA MESURE A MONTRÉ, ET QUI N'EST PAS DANS LA FICHE. Le trou n'était
--    pas `insert` — la RLS le refusait déjà. Le trou était :
--      · `update`/`delete` sous `anon` → AUCUNE ERREUR, 0 ligne. La RLS filtre
--        en silence : le jour où une policy `USING (true)` apparaît, la table
--        est ouverte, et rien n'aura changé du côté des droits.
--      · `truncate` sous `anon` → ⛔ **ÉCHAPPE À LA RLS**. Le privilège était
--        accordé. La commande n'a JAMAIS été jouée dans cet état (elle aurait
--        réussi) ; c'est le vrai trou, et c'est celui que `L0-a` avait déjà
--        mesuré sur `food_groups`.
--
-- LA FORME DU REVOKE. `revoke all privileges` PUIS `grant` de ce qu'une policy
-- utilise, et pas une liste de privilèges nommés. Deux raisons, toutes deux
-- mesurées :
--   ① `revoke ... from public` NE SUFFIT PAS : il laisse `anon` en place. La
--      vérification se fait par `has_table_privilege('anon', …)`, jamais par
--      l'absence d'un `grant`.
--   ② ⛔ UNE LISTE NOMMÉE LAISSE DERRIÈRE ELLE CE QU'ELLE NE CONNAÎT PAS. La
--      migration `20260822013500` (`L0-a`) a révoqué
--      `insert, update, delete, truncate, references, trigger` sur
--      `food_groups` — et `anon` y garde `MAINTAIN` (PG 17), soit le droit de
--      poser un `VACUUM FULL`/`CLUSTER` et son verrou exclusif. `revoke all`
--      couvre aussi les privilèges que la liste ne connaissait pas encore.
--
-- CE QUE `authenticated` GARDE : `select`, et rien d'autre — c'est exactement
-- ce dont `substances_read` se sert.

revoke all privileges on table public.substances from anon, authenticated;

grant select on table public.substances to anon, authenticated;

-- La vérification vit DANS la migration : une porte qui ne peut pas rougir
-- n'est pas une porte.
do $verif$
begin
  if has_table_privilege('anon', 'public.substances', 'INSERT')
     or has_table_privilege('anon', 'public.substances', 'UPDATE')
     or has_table_privilege('anon', 'public.substances', 'DELETE')
     or has_table_privilege('anon', 'public.substances', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.substances', 'INSERT')
     or has_table_privilege('authenticated', 'public.substances', 'UPDATE')
     or has_table_privilege('authenticated', 'public.substances', 'DELETE')
     or has_table_privilege('authenticated', 'public.substances', 'TRUNCATE')
  then
    raise exception 'S6/substances : un droit d''écriture subsiste';
  end if;
  if not has_table_privilege('authenticated', 'public.substances', 'SELECT') then
    raise exception 'S6/substances : la lecture de `authenticated` a été emportée';
  end if;
end
$verif$;
