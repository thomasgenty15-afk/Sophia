-- ══════════════════════════════════════════════════════════════════════════
-- LES ALIMENTS QUE LE GÉNÉRATEUR ÉCRIT, ET QUE PERSONNE NE PÈSE — 2026-08-24
-- ══════════════════════════════════════════════════════════════════════════
--
-- Mesuré le 2026-08-23 sur DIX générations réelles (rapport:
-- `scratchpad/2026-08-23-EVAL-QUALITE/RAPPORT.md`): sept plans sur dix ne sont
-- mesurables qu'en PARTIE, et la cause est toujours la même — un terme que le
-- référentiel ne connaît pas. Un seul ingrédient non résolu fait tomber son
-- plat sous la porte des 80 % (`MIN_RESOLUTION_FOR_VERDICT`), et le plat entier
-- cesse de porter un chiffre.
--
-- Le cas le plus cher: `plan-F3`, trois bouches, trois jours. Sa SEULE source
-- de protéine est « 900 g dried green or brown lentils ». Le terme ne résout
-- pas ⇒ AUCUNE des neuf journées-bouche du plan ne porte d'énergie.
--
-- ⚠️ CE N'EST PAS UN DÉFAUT DE LECTURE DE QUANTITÉ. La ligne porte bien
-- `amount: 900, unit: "g", quantity_source: "structured"`. `grams_raw` est
-- `null` parce que `resolveIngredient` rend `null`, et pour aucune autre raison
-- (`meal_generation.ts`: « pas de `ref` ⇒ pas de grammes »).
--
-- ── LES CINQ ÉPREUVES, PASSÉES UNE PAR UNE ────────────────────────────────
-- Patron: `20260822113000_lot19b_les_alias_verifies.sql`. Chaque alias a été
-- vérifié sur l'export live du référentiel (923 lignes, 2 668 alias) :
--   ① la ligne visée existe;
--   ② l'alias n'est pas déjà en base;
--   ③ l'alias ne serait pas MORT (sa forme n'est pas elle-même un slug);
--   ④ on sait ce que la chaîne atteint AUJOURD'HUI — les sept rendent `—`;
--   ⑤ après ajout, la chaîne atteint bien la ligne visée.
--
-- ⛔ DEUX ALIMENTS N'ONT PAS D'ALIAS POSSIBLE: ils n'existent pas. Le lait
-- d'avoine et le yaourt de soja sont ÉCRITS PAR LE PRODUIT LUI-MÊME — le bloc
-- `FOOD_GROUP_DECLARATION_BLOCK` (`dietary_regime.ts`) enseigne au modèle, mot
-- pour mot, « Oat milk is a whole_grain drink, not dairy_yogurt » — et le
-- référentiel ne les porte pas. On demandait un aliment au modèle et on
-- refusait de le peser.
--
-- ⛔ CE QU'ON N'A PAS FAIT, ET POURQUOI. Une candidate « le terme sans son
-- DERNIER mot » aurait rattrapé « wholemeal tortilla wraps » toute seule. Elle
-- est REFUSÉE: elle transforme « chicken stock » en « chicken », c'est-à-dire
-- une erreur d'un facteur dix, dans le sens qui gonfle. Un alias vérifié coûte
-- une ligne; une règle de grammaire coûte un aliment faux, pour tout le monde,
-- définitivement.

-- ---------------------------------------------------------------------------
-- ① LES DEUX LIGNES QUI MANQUAIENT
-- ---------------------------------------------------------------------------
--
-- Valeurs pour 100 g / 100 ml, `manual` — l'ordre de grandeur des produits de
-- rayon non sucrés, calibré sur les voisines déjà en base (`soy_milk` 37,1 kcal
-- · 3,3 g, `plain_yogurt` 59 kcal · 3,5 g).
--
-- ⛔ `b12_source` ET `calcium_source` SONT `false`, ET C'EST DÉLIBÉRÉ. Ces
-- boissons sont SOUVENT enrichies, jamais TOUJOURS. Les marquer vraies ferait
-- croire à un plan végane qu'il couvre sa B12 — or `uncoverableSentinelsFor`
-- déclare précisément la B12 STRUCTURELLEMENT incouvrable pour un végane, et le
-- produit s'appuie dessus pour ne pas boucler sur un trou qu'aucune assiette ne
-- comble. `soy_milk`, déjà en base, porte le même `false` pour la même raison.
insert into public.food_composition_refs
  (slug, food_group_ref, label, source, energy_kcal, protein_g, carbs_g, fat_g,
   fiber_g, omega3_marine, iron_source, calcium_source, iodine_source,
   zinc_source, b12_source, folate_source, yield_class, atwater_discount,
   energy_dense, unit_grams, condiment_grams)
values
  -- ⚠️ `whole_grain` ET PAS `dairy_yogurt`: c'est le groupe que le prompt du
  -- produit ENSEIGNE au modèle. Deux classements pour un même aliment feraient
  -- diverger la ceinture de régime et la borne de groupe.
  ('oat_milk', 'whole_grain', 'Oat drink, unsweetened', 'manual',
   45, 0.3, 6.7, 1.5, 0.8, false, false, false, false, false, false, false,
   'neutral', 1, false, null, null),
  -- `tofu_tempeh`, comme `soy_milk` déjà en base: c'est le même règne et la
  -- même ancre protéique végétale.
  ('soy_yogurt', 'tofu_tempeh', 'Soy yoghurt, plain', 'manual',
   50, 4.0, 2.0, 2.5, 0.5, false, false, false, false, false, false, false,
   'neutral', 1, false, null, null)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- ② LES SEPT ALIAS — chacun écrit tel que le modèle l'a produit
-- ---------------------------------------------------------------------------
--
-- ⚠️ Sans accent, comme les 2 668 déjà en base: le résolveur normalise de toute
-- façon, mais deux conventions dans une même table finissent par diverger.
--
-- `on conflict do nothing`: si une session parallèle a posé le même nom, on ne
-- lui vole pas sa ligne.
insert into public.food_composition_aliases (alias, slug, note) values
  ('brown lentils', 'lentils_dry',
   '2026-08-24: « green lentils » atteint la ligne, « brown lentils » non — mesure sur plan-F3, ou les lentilles etaient la SEULE proteine des trois jours.'),
  -- ⛔ LA CHAÎNE ENTIÈRE, ALTERNATIVE COMPRISE, ET C'EST VOULU.
  -- `resolveIngredient` refuse toute alternative par défaut, et la règle
  -- générique (« toutes les branches doivent résoudre ET s'accorder ») ne sauve
  -- pas celle-ci: « green » n'est pas un aliment, donc une branche reste
  -- inconnue, donc le refus tient — et c'est le bon défaut.
  -- Cet alias est la porte ① de `resolveAlternative`: un humain a lu la chaîne
  -- et décidé qu'elle désigne les lentilles sèches. Une décision prise à la
  -- main bat un refus générique; c'est la même hiérarchie que partout.
  ('green or brown lentils', 'lentils_dry',
   '2026-08-24: alias CURE de la chaine entiere. La regle generique refuse (« green » n''est pas un aliment) ; les deux lentilles sont la meme ligne, donc l''alternative ne porte aucune difference.'),
  ('british berries', 'mixed_berries',
   '2026-08-24: mesure sur plan-S2. « british » n''est pas un modificateur (refus date du 2026-08-19), donc la forme qualifiee rate la ligne generique.'),
  ('seasonal berries', 'mixed_berries',
   '2026-08-24: meme forme, mesuree sur plan-S1apres. Le modele qualifie les fruits rouges par la saison ou par le pays.'),
  ('wholemeal tortilla wraps', 'tortilla_wholemeal',
   '2026-08-24: « wholemeal tortilla » et « wholemeal wrap » atteignent la ligne, la forme COMPOSEE au pluriel non — aucune regle ne retire un mot final non pluriel.'),
  ('ready to eat smoked tofu', 'tofu',
   '2026-08-24: « smoked tofu » atteint la ligne ; aucune regle ne coupe une TETE de terme, et « ready to eat » n''est pas un modificateur.'),
  ('unsweetened soy yoghurt', 'soy_yogurt',
   '2026-08-24: la ligne est creee par cette meme migration. « unsweetened » n''est pas un modificateur, donc la forme qualifiee doit avoir son alias.')
on conflict (alias) do nothing;

-- ---------------------------------------------------------------------------
-- ③ LA CONTRE-LECTURE — le lot se contrôle lui-même
-- ---------------------------------------------------------------------------
--
-- ⛔ ON RELIT LA BASE, ON N'AFFIRME PAS CE QU'ON CROIT AVOIR POSÉ. Un script
-- qui déclare l'état qu'il vient d'écrire est exactement ce qui fait ressembler
-- un lot désarmé à un lot qui marche.
do $$
declare
  v_refs int;
  v_alias int;
begin
  select count(*) into v_refs
    from public.food_composition_refs where slug in ('oat_milk', 'soy_yogurt');
  select count(*) into v_alias
    from public.food_composition_aliases a
    join public.food_composition_refs r on r.slug = a.slug
   where a.alias in ('brown lentils', 'green or brown lentils',
                     'british berries', 'seasonal berries',
                     'wholemeal tortilla wraps', 'ready to eat smoked tofu',
                     'unsweetened soy yoghurt');
  if v_refs <> 2 then
    raise exception 'les deux lignes manquantes ne sont pas en base (%)', v_refs;
  end if;
  -- La jointure est ce qui compte: un alias dont le slug n'existe pas est JETÉ
  -- par `buildCompositionIndex` (« un "résolu" qui ne résout rien »).
  if v_alias <> 7 then
    raise exception 'les sept alias ne pointent pas tous vers une ligne vivante (%)', v_alias;
  end if;
end $$;
