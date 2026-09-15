-- LES ALIAS DE CUISINE ANGLAISE — ce que CIQUAL nomme autrement.
--
-- ── COMMENT ILS ONT ÉTÉ TROUVÉS ────────────────────────────────────────────
-- L'import CIQUAL (migration 20260812090000) a porté le référentiel de 222 à
-- 911 aliments. Rejoué sur les trente termes qui échouaient en run réel: 83 %
-- se résolvent. Les échecs restants ne sont PAS des trous de données — les
-- aliments existent (`oats`, `mixed_berries`, `paprika`) — mais CIQUAL les
-- nomme dans une forme que personne n'écrit en cuisine.
--
-- « Rolled oats » est le cas exemplaire: tout le monde l'écrit ainsi, CIQUAL
-- dit « Oats ». Un alias, pas une ligne de plus.
--
-- Ce qui reste volontairement non résolu:
--   · « salt and black pepper » — DEUX aliments dans un terme. Le résoudre à
--     l'un des deux serait la devinette que `resolveIngredient` interdit.
--   · les épices en pincée — sans quantité structurée, elles ne pèsent rien
--     dans le calcul de toute façon.

begin;

insert into public.food_composition_aliases (alias, slug) values
  -- céréales du petit-déjeuner
  ('rolled oats', 'oats'),
  ('porridge oats', 'oats'),
  ('jumbo oats', 'oats'),
  ('oat flakes', 'oats'),
  ('flocons d avoine', 'oats'),
  -- fruits rouges, tels qu'on les achète
  ('frozen mixed berries', 'mixed_berries'),
  ('mixed frozen berries', 'mixed_berries'),
  ('berries', 'mixed_berries'),
  ('fruits rouges', 'mixed_berries'),
  ('fruits rouges surgeles', 'mixed_berries'),
  -- épices nommées par leur préparation
  ('smoked paprika', 'paprika'),
  ('sweet paprika', 'paprika'),
  ('paprika fume', 'paprika')
on conflict (alias) do nothing;

do $$
declare orphans text;
begin
  select string_agg(a.alias, ', ') into orphans
    from public.food_composition_aliases a
    left join public.food_composition_refs r on r.slug = a.slug
   where r.slug is null;
  if orphans is not null then
    raise exception 'alias orphelins: %', left(orphans, 200);
  end if;
end;
$$;

commit;
