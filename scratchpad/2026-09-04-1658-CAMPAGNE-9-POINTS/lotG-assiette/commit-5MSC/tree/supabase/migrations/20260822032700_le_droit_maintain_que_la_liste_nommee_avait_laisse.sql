-- S6 — LES GRANTS PAR DÉFAUT · 8/8 · `food_groups`, et ce qu'une liste nommée
-- laisse derrière elle
--
-- ⛔ CETTE MIGRATION N'EXISTAIT PAS DANS LA FICHE. Elle vient d'une mesure.
--
-- `L0-a` a traité `food_groups` le 2026-08-22 (`20260822013500`), et le geste
-- était juste : `anon` y passe de sept droits à zéro. Sauf que la forme du
-- geste était une LISTE NOMMÉE :
--
--     revoke insert, update, delete, truncate, references, trigger
--       on public.food_groups from anon, authenticated;
--     revoke select on public.food_groups from anon;
--
-- Six privilèges nommés. PostgreSQL 17 en compte SEPT. Mesuré le 2026-08-22 à
-- 03:14 sur `pg_class.relacl` :
--
--     food_groups | anon=m/postgres, authenticated=rm/postgres
--
-- `m`, c'est `MAINTAIN` — arrivé avec PG 17, absent de toutes les listes
-- écrites avant lui. Il autorise `VACUUM`, `ANALYZE`, `CLUSTER`, `REINDEX`,
-- `REFRESH MATERIALIZED VIEW`. Il n'écrit pas une ligne de donnée, et c'est
-- pour ça qu'il est facile à ne pas voir : ce qu'il donne à un rôle NON
-- AUTHENTIFIÉ, c'est le droit de poser un `VACUUM FULL` ou un `CLUSTER`, donc
-- un verrou ACCESS EXCLUSIVE sur la table, à volonté.
--
-- ⛔ LA LEÇON EST PLUS LARGE QUE CETTE TABLE, ET C'EST POURQUOI LES SEPT AUTRES
--    MIGRATIONS DE `S6` SONT ÉCRITES EN `revoke all privileges` PUIS `grant` :
--    une énumération ne peut pas reprendre ce qu'elle ne connaît pas encore.
--    Elle a l'air complète le jour où on l'écrit, et elle se périme sans rien
--    dire — exactement comme la liste écrite à la main du test RGPD, qui ne
--    rougit jamais quand une table s'ajoute.
--
-- ⚠️ `MAINTAIN` n'est PAS nommé ici non plus : `revoke all privileges` le
--    couvre, et couvrira aussi le huitième privilège que PG 18 ajoutera.

revoke all privileges on table public.food_groups from anon, authenticated;

grant select on table public.food_groups to authenticated;

do $verif$
begin
  -- `anon` : plus rien du tout sur cette table — c'était déjà la direction de
  -- `L0-a`, elle est maintenant VRAIE au bit près.
  if has_table_privilege('anon', 'public.food_groups', 'SELECT')
     or has_table_privilege('anon', 'public.food_groups', 'INSERT')
     or has_table_privilege('anon', 'public.food_groups', 'UPDATE')
     or has_table_privilege('anon', 'public.food_groups', 'DELETE')
     or has_table_privilege('anon', 'public.food_groups', 'TRUNCATE')
     or has_table_privilege('anon', 'public.food_groups', 'MAINTAIN')
  then
    raise exception 'S6/food_groups : anon garde un droit';
  end if;

  if has_table_privilege('authenticated', 'public.food_groups', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.food_groups', 'MAINTAIN')
  then
    raise exception 'S6/food_groups : authenticated garde un droit de maintenance';
  end if;

  -- La lecture des 30 groupes par `CoachProtocolPage.tsx:279` et
  -- `CoachMealsPage.tsx:142`, et la fenêtre crue par groupe que `L0-a` vient
  -- d'y poser.
  if not has_table_privilege('authenticated', 'public.food_groups', 'SELECT') then
    raise exception 'S6/food_groups : la lecture de `authenticated` a été emportée';
  end if;
end
$verif$;
