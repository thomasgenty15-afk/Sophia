-- ---------------------------------------------------------------------------
-- LE BŒUF QUE LE GÉNÉRATEUR ÉCRIT, ET QUE LE RÉFÉRENTIEL IGNORAIT
-- ---------------------------------------------------------------------------
--
-- Mesuré le 2026-09-04 en rejouant `resolveIngredient` sur les 925 refs et
-- 2 685 alias de la base : « bœuf », « bœuf à rôtir », « rôti de bœuf »,
-- « bœuf mijoté », « bœuf rôti » — TOUS non résolus. Le référentiel porte
-- pourtant 288 lignes `red_meat` et 78 alias « boeuf … » : ce sont les formes
-- LONGUES de CIQUAL (« boeuf basse cote crue », « boeuf boule de macreuse
-- rotie cuite au four »). Le modèle n'écrit jamais ça. Il écrit « bœuf à
-- rôtir », et le sas des inconnus le confirme (« boeuf emince » : 7 apparitions,
-- « boeuf a griller emince » : 3, « poulet roti » : 5).
--
-- Conséquence, mesurée : toute casserole au bœuf est `dishEnergy` incomplète
-- (`day_incomplete` sur l'ancre), et la densification s'arrête sur
-- `no_dense_target` dès qu'un item de bœuf est le seul autre item d'une boîte
-- — le cas exact de la première boîte réelle qu'elle a rencontrée.
--
-- ⛔ DES ALIAS VÉRIFIÉS, JAMAIS UNE RÈGLE. Les modificateurs que `candidateForms`
-- retire sont ANGLAIS (« roasted », « cooked », « minced ») : « rôti », « cuit »,
-- « émincé » ne réduisent rien. Une règle de grammaire française coûterait un
-- aliment faux pour tout le monde ; un alias coûte une ligne, relue ici.
--
-- ⚠️ CRU ET CUIT NE VONT PAS AU MÊME SLUG. L'état (`state`) fait la conversion
-- de masse ; l'ÉNERGIE, elle, est celle de la ligne : un rôti cru (topside,
-- 116 kcal, `meat_shrinks`) et un rôti cuit (`beef_roast_beef`, 117 kcal cuit,
-- `neutral`) ne sont pas la même ligne.
-- ---------------------------------------------------------------------------

insert into public.food_composition_aliases (alias, slug, note) values
  -- ── LE BŒUF ──────────────────────────────────────────────────────────────
  ('boeuf', 'beef_braising',
   '2026-09-04 : la forme nue, crue. « Braising beef » est la moyenne CIQUAL d''une viande de bœuf crue à mijoter (144 kcal, 21,2 g) — l''ordre de grandeur d''un bœuf sans découpe nommée.'),
  ('boeuf a rotir', 'beef_topside',
   '2026-09-04 (première boîte réelle de la densification) : le rôti cru, pièce classique de tende de tranche (« topside, raw », 116 kcal).'),
  ('roti de boeuf', 'beef_topside',
   '2026-09-04 : même pièce, l''ordre des mots inversé.'),
  ('boeuf roti', 'beef_roast_beef',
   '2026-09-04 : la forme CUITE écrite sur une boîte (« roast beef, roasted/baked », 117 kcal cuit, rendement neutre).'),
  ('boeuf mijote', 'beef',
   '2026-09-04 : cuit longuement, comme « boeuf braise » qui pointe déjà sur cette ligne (« Beef, braised »).'),
  ('boeuf emince', 'beef_rump_steak',
   '2026-09-04 (sas, 7 apparitions) : des lanières crues d''une pièce maigre à cuisson rapide (« rump steak, raw », 114 kcal).'),
  ('boeuf a griller emince', 'beef_rump_steak',
   '2026-09-04 (sas, 3 apparitions) : la même chose, avec le mode de cuisson dans le nom.'),
  ('emince de boeuf', 'beef_rump_steak',
   '2026-09-04 : l''ordre des mots inversé.'),
  -- ── LE POULET ────────────────────────────────────────────────────────────
  ('poulet', 'chicken_free_range_meat',
   '2026-09-04 : la forme nue, crue — chair et peau (« free-range, meat and skin, raw », 135 kcal). « blanc de poulet » et « escalope de poulet » existaient déjà ; pas le mot seul.'),
  ('poulet roti', 'chicken_free_range_meat',
   '2026-09-04 (sas, 5 apparitions) : la forme écrite sur une boîte. Aucune ligne « poulet rôti entier cuit » en base ; la ligne crue avec `state: cooked` fait la conversion de masse.'),
  -- ── LE POISSON BLANC ──────────────────────────────────────────────────────
  ('filets de poisson blanc', 'cod',
   '2026-09-04 (sas, 4 apparitions) : le cabillaud est le poisson blanc de référence (77,6 kcal, 18,1 g) ; colin et lieu sont à ± 5 kcal.'),
  ('poisson blanc', 'cod',
   '2026-09-04 : la forme nue.'),
  -- ── LA TOMATE ─────────────────────────────────────────────────────────────
  ('tomate concassee', 'tomato_pulp',
   '2026-09-04 (sas, 7 apparitions) : « tomates concassees » pointait déjà sur `tinned_tomatoes` ; le singulier manquait. La pulpe en boîte (26 kcal) est la même chose sans peau.'),
  ('passata de tomate', 'tomato_pulp',
   '2026-09-04 (sas, 4 apparitions) : la passata est une pulpe tamisée, même densité (≈ 26–30 kcal).'),
  ('passata de tomates', 'tomato_pulp',
   '2026-09-04 (sas, 3 apparitions) : le pluriel.'),
  -- ── LE RESTE DU HAUT DU SAS, quand une ligne existe VRAIMENT ─────────────
  ('compote de pommes sans sucre', 'apple_compote_reduced_sugar',
   '2026-09-04 (sas, 5 apparitions) : la ligne « reduced sugar » (65 kcal) est la plus proche d''une compote sans sucre ajouté (≈ 50–60 kcal) ; la ligne pleine (102 kcal) surestimerait d''un tiers.'),
  ('fromage frais', 'soft_cheese_around_6',
   '2026-09-04 (sas, 4 apparitions) : « Drained soft fresh cheese, around 6% fat » (84 kcal) est la ligne CIQUAL du fromage frais nature.')
on conflict (alias) do nothing;

-- ⛔ PAS « tofu soyeux » → `tofu` : le tofu ferme fait 164 kcal, le soyeux ~55.
-- Le résoudre au ferme tripleraient son énergie. Il reste au sas, à créer.
-- ⛔ PAS « salsa de tomates » (13 apparitions) ni « galettes de ble complet »
-- (11) : aucune ligne ne les porte ; un faux appariement serait pire qu'une
-- abstention comptée.

-- ---------------------------------------------------------------------------
-- LA CONTRE-LECTURE — relue depuis la base, jamais supposée
-- ---------------------------------------------------------------------------
do $$
declare v_alias int;
begin
  select count(*) into v_alias
    from public.food_composition_aliases a
    join public.food_composition_refs r on r.slug = a.slug
   where a.alias in ('boeuf', 'boeuf a rotir', 'roti de boeuf', 'boeuf roti',
                     'boeuf mijote', 'boeuf emince', 'boeuf a griller emince',
                     'emince de boeuf', 'poulet', 'poulet roti',
                     'filets de poisson blanc', 'poisson blanc',
                     'tomate concassee', 'passata de tomate', 'passata de tomates',
                     'compote de pommes sans sucre', 'fromage frais');
  if v_alias <> 17 then
    raise exception 'les dix-sept alias ne pointent pas tous vers une ligne vivante (%)', v_alias;
  end if;
end $$;

-- Les lignes du sas que ces alias ferment sont marquées, pas effacées : le
-- compte d''apparitions reste l''histoire de ce que le produit a écrit.
update public.food_composition_pending
   set status = 'promoted', promoted_at = now(), review_reason = null
 where status = 'pending'
   and term in ('boeuf emince', 'boeuf a griller emince', 'poulet roti',
                'filets de poisson blanc', 'tomate concassee',
                'passata de tomate', 'passata de tomates',
                'compote de pommes sans sucre', 'fromage frais');
