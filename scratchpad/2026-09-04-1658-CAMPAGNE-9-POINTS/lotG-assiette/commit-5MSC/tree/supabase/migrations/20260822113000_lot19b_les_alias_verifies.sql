-- ===========================================================================
-- LOT L19b — LE FRANÇAIS CESSE D'ATTEINDRE UN AUTRE ALIMENT QUE CELUI QU'ON A
-- ÉCRIT.  Trois gestes sur `food_composition_aliases`, et RIEN d'autre.
--
--   ② 19 alias MORTS et CONTRADICTOIRES sont RETIRÉS.
--   ③ 9 alias existants sont CORRIGÉS (ils pointent sur la mauvaise ligne).
--   ③ 86 alias vérifiés sont AJOUTÉS.
--
-- ⛔ AUCUNE VALEUR DE COMPOSITION N'EST ÉCRITE ICI. Pas une kcal, pas un
-- gramme, pas un groupe. Ce fichier ne fait que dire QUEL NOM désigne QUELLE
-- LIGNE déjà présente au référentiel.
--
-- ⛔ ET ON N'EN LIVRE PAS 4 800. Le lot 19 a mesuré qu'il faudrait ~4 800
-- alias pour porter chaque aliment à huit formulations. On en livre 86, et
-- SEULEMENT ceux qui ont passé les cinq épreuves automatiques, parce que
-- « un alias plausible non vérifié est un alias faux pas encore découvert »,
-- et qu'un alias faux remplace un aliment par un autre, pour tout le monde,
-- définitivement — en ayant l'air d'une donnée, pas d'un bug.
--
-- ---------------------------------------------------------------------------
-- ② LES 19 ALIAS MORTS ET CONTRADICTOIRES — pourquoi les RETIRER
-- ---------------------------------------------------------------------------
-- `resolveIngredient` (food_composition.ts) interroge `bySlug` AVANT `byAlias`,
-- forme par forme. Un alias dont le texte normalisé est LUI-MÊME un slug ne se
-- déclenche donc JAMAIS: le slug gagne, toujours.
--
-- Mesuré le 2026-08-22 sur les 2 601 alias en base: **210 sont morts** de cette
-- façon. 191 sont inoffensifs — ils désignent la ligne que leur propre forme
-- capture, ils sont seulement redondants. **19 désignent AUTRE CHOSE.** Pour
-- ces 19, la table porte DEUX vérités pour un même mot, et c'est toujours
-- celle de `bySlug` qui sort:
--
--     « red onion »       dit `onion` (38,4)   → capture `red_onion` (36,3)
--     « vegetable stock » dit `stock_cube` (240) → capture `vegetable_stock` (4)
--     « lamb chop »       dit `lamb` (128)     → capture `lamb_chop` (273)
--
-- ⚠️ CE RETRAIT NE CHANGE AUCUNE RÉSOLUTION, AUJOURD'HUI. C'est le point: il
-- retire une AFFIRMATION FAUSSE, pas un comportement. Dans les 19 cas, la
-- ligne réellement atteinte est la ligne EXACTE du nom — c'est la déclaration
-- de l'alias qui était fausse. La laisser en base, c'est laisser une bombe à
-- retardement: le jour où quelqu'un inverse l'ordre de consultation « pour
-- que les alias curés gagnent », 19 aliments changent d'un coup, en silence,
-- et le diff qui l'aurait montré n'existe pas.
--
-- ---------------------------------------------------------------------------
-- ⛔ CE QUE CETTE MIGRATION NE RÉPARE PAS, ET NE PEUT PAS RÉPARER
-- ---------------------------------------------------------------------------
-- `prune` (×5 occurrences) et `pate` sont IRRÉPARABLES PAR UN ALIAS, pour la
-- raison exacte ci-dessus: leur forme française est déjà un SLUG anglais.
--
--     « prune » en français = un pruneau… mais le slug `prune` porte la PRUNE
--       SÉCHÉE anglaise. Le français `prune` (le fruit frais, `plum`) ne peut
--       PAS être aliasé: `bySlug` capturerait toujours `prune` en premier.
--     « pate » (la pâte à tartiner / la pâte de curry) contre le slug `pate`
--       (Paté (average), red_meat, 325 kcal).
--
-- Un alias ne peut RIEN pour eux. **Seul un renommage de slug répare**, et un
-- renommage de slug est un autre lot (`O8`) parce qu'il demande les trois
-- épreuves d'absence — code, `prosrc`, vues. On ne les touche pas ici.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- ② LES 19 RETRAITS
--
-- Le couple (alias, slug) est nommé EN ENTIER dans le `where`: si une autre
-- session a déjà corrigé l'un d'eux, la ligne n'est pas touchée et le compte
-- final le dira.
-- ---------------------------------------------------------------------------
with morts (alias, slug) as (values
  -- capture par bySlug: beef_chuck (Beef, chuck, raw, red_meat, 144) — la ligne EXACTE du morceau
  ('beef chuck', 'beef_braising'),
  -- capture par bySlug: blueberry (Blueberry, raw, berries, 57.7) — meme aliment, ligne au singulier
  ('blueberry', 'blueberries'),
  -- capture par bySlug: bread (Bread (average), refined_grain, 276) — la ligne de MOYENNE, que le generique anglais doit atteindre
  ('bread', 'white_bread'),
  -- capture par bySlug: egg (Egg, raw, eggs, 140) — meme aliment, meme energie
  ('egg', 'whole_eggs'),
  -- capture par bySlug: garden_peas (Garden peas, canned, drained, non_starchy_veg, 81.5) — la ligne qui porte ce nom
  ('garden peas', 'green_peas'),
  -- capture par bySlug: lamb_chop (Lamb, chop, raw (average), red_meat, 273) — 273 contre 128 kcal: l alias declarait la moyenne de l agneau
  ('lamb chop', 'lamb'),
  -- capture par bySlug: lamb_leg (Lamb, leg, raw, red_meat, 128) — la ligne EXACTE du morceau
  ('lamb leg', 'lamb'),
  -- capture par bySlug: mixed_leaves (Mixed salad leaves, leafy_greens, 17) — un melange n est pas de la laitue
  ('mixed leaves', 'lettuce'),
  -- capture par bySlug: mixed_vegetables (Mixed vegetables, frozen, raw, non_starchy_veg, 65.1) — l alias declarait la ligne des POIS
  ('mixed vegetables', 'peas_frozen'),
  -- capture par bySlug: pancetta (Pancetta, dried, red_meat, 342) — 342 contre 275 kcal
  ('pancetta', 'bacon'),
  -- capture par bySlug: pita_bread (Pita bread, refined_grain, 275) — un pain pita n est pas du pain de mie
  ('pita bread', 'white_bread'),
  -- capture par bySlug: pumpkin (Pumpkin, roasted/baked, non_starchy_veg, 30.2) — le potiron n est pas la courge butternut
  ('pumpkin', 'butternut_squash'),
  -- capture par bySlug: raspberry (Raspberry, raw, berries, 49.2) — meme aliment, ligne au singulier
  ('raspberry', 'raspberries'),
  -- capture par bySlug: red_onion (Red onion, raw, non_starchy_veg, 36.3) — l oignon ROUGE a sa ligne
  ('red onion', 'onion'),
  -- capture par bySlug: strawberry (Strawberry, raw, berries, 38.6) — meme aliment, ligne au singulier
  ('strawberry', 'strawberries'),
  -- capture par bySlug: turkey_escalope (Turkey, escalope, raw, poultry, 109) — groupe poultry, pas lean_protein
  ('turkey escalope', 'turkey_breast'),
  -- capture par bySlug: vegetable_stock (Vegetable stock (low salt), sauce_dressing, 4) — ⛔ 4 contre 240 kcal: le CUBE sec contre le BOUILLON liquide
  ('vegetable stock', 'stock_cube'),
  -- capture par bySlug: white_cabbage (White cabbage, raw, cruciferous_veg, 36.5) — la ligne EXACTE
  ('white cabbage', 'cabbage'),
  -- capture par bySlug: yoghurt (Yoghurt, plain (average), dairy_yogurt, 56.8) — la ligne de MOYENNE des yaourts
  ('yoghurt', 'plain_yogurt')
)
delete from public.food_composition_aliases a
using morts m
where a.alias = m.alias and a.slug = m.slug;

-- ---------------------------------------------------------------------------
-- ③a LES 9 CORRECTIONS — un alias en base pointe sur une ligne qui n'est pas
-- celle qu'il désigne. Ce sont des UPDATE, pas des INSERT.
--
-- ⚠️ `baguette` → `bread_french_bread_baguette` ÉCHANGE UNE ERREUR CONTRE UNE
-- ABSTENTION: la ligne visée n'a pas d'`unit_grams`, donc « 1 baguette » ne
-- pèsera plus rien au lieu de peser 35 g (une TRANCHE de pain de mie). C'est
-- l'arbitrage du module — s'abstenir plutôt que rendre un nombre faux — et il
-- est CHOISI ici, pas subi.
-- ---------------------------------------------------------------------------
with corrections (alias, ancien, nouveau) as (values
  ('oignon rouge', 'onion', 'red_onion'),
  ('semoule complete', 'couscous', 'couscous_wholemeal'),
  ('wrap', 'white_bread', 'tortilla_wrap'),
  ('tortilla', 'white_bread', 'tortilla_wrap'),
  ('pitta', 'white_bread', 'pita_bread'),
  ('toast', 'white_bread', 'toasted_bread'),
  ('baguette', 'white_bread', 'bread_french_bread_baguette'),
  ('crusty baguette', 'white_bread', 'bread_french_bread_baguette'),
  ('pain', 'white_bread', 'bread')
)
update public.food_composition_aliases a
   set slug = c.nouveau,
       note = coalesce(a.note || ' · ', '') ||
              'L19b 2026-08-22: pointait sur ' || c.ancien || ', qui n''est pas cet aliment.'
  from corrections c
 where a.alias = c.alias and a.slug = c.ancien;

-- ---------------------------------------------------------------------------
-- ③b LES 86 AJOUTS — chacun a passé les CINQ épreuves de
-- `scratchpad/2026-08-22-1120-L19b-mesure/09-verifier-propositions.ts`,
-- rejouées le 2026-08-22 à 11:28 CEST: **86 lues, 86 retenues, 0 écartée**.
--
--   ① la ligne visée existe au référentiel;
--   ② l'alias n'est pas déjà en base;
--   ③ l'alias ne serait pas MORT (sa forme n'est pas elle-même un slug);
--   ④ on sait ce que la chaîne atteint AUJOURD'HUI;
--   ⑤ après ajout, la chaîne atteint bien la ligne visée.
--
-- ⚠️ Les alias sont écrits SANS ACCENT, comme les 2 601 déjà en base: le
-- résolveur normalise de toute façon, mais deux conventions dans une même
-- table finissent par diverger.
--
-- `on conflict do nothing`: si une session parallèle a posé le même nom, on ne
-- lui vole pas sa ligne — et le test de ce lot compte les 86, il ne les
-- suppose pas.
-- ---------------------------------------------------------------------------
insert into public.food_composition_aliases (alias, slug, note) values
  ('pain naan', 'naan_bread', 'L19b: Le nom français du pain naan. " naan bread " atteint la ligne par son slug ; aucune forme française ne l''atteint.'),
  ('naan', 'naan_bread', 'L19b: Forme nue, écrite dans les deux langues. Rate aujourd''hui : le slug est `naan_bread`, la réduction ne coupe pas " bread ".'),
  ('sauce piquante', 'hot_sauce', 'L19b: Nom français usuel de la sauce piquante au piment. Le libellé " Hot sauce (chilli) " nomme exactement cet objet.'),
  ('sauce pimentee', 'hot_sauce', 'L19b: Seconde formulation française courante, même objet.'),
  ('chilli sauce', 'hot_sauce', 'L19b: Forme anglaise courante absente : seul " hot sauce " atteint la ligne.'),
  ('graines melangees', 'mixed_seeds', 'L19b: Traduction directe de " Mixed seeds ". Aucune forme française n''atteint la ligne.'),
  ('melange de graines', 'mixed_seeds', 'L19b: Seconde formulation française du même produit de rayon.'),
  ('seed mix', 'mixed_seeds', 'L19b: Forme anglaise courante absente.'),
  ('graines de pavot', 'poppy_seeds', 'L19b: Traduction directe de " Poppy seeds ". Aucune forme française.'),
  ('curcuma', 'turmeric', 'L19b: Nom français du curcuma. " Turmeric, ground " est la même épice ; le corpus l''écrit 6 fois en anglais.'),
  ('curcuma moulu', 'turmeric', 'L19b: Le libellé dit " ground " : la forme française qualifiée doit atteindre la même ligne.'),
  ('puree de graines de tournesol', 'sunflower_seed_butter', 'L19b: Nom français du produit ; " Sunflower seed butter " n''a aucune forme française.'),
  ('beurre de graines de tournesol', 'sunflower_seed_butter', 'L19b: Calque français courant sur les étiquettes, même produit.'),
  ('pate de campagne', 'pate', 'L19b: Le libellé est " Paté (average) " : la moyenne des pâtés couvre le pâté de campagne.'),
  ('pate de foie', 'pate', 'L19b: Même ligne de moyenne, autre formulation française courante.'),
  ('liver pate', 'pate', 'L19b: Forme anglaise courante absente : seul " pate " nu atteint la ligne.'),
  ('loaf of bread', 'bread', 'L19b: " Bread (average) " est la ligne générique ; " loaf " n''y mène pas.'),
  ('bread loaf', 'bread', 'L19b: Forme écrite telle quelle dans les listes de courses du corpus (" white bread loaf ", " bread loaf ").'),
  ('braised beef', 'beef_braising', 'L19b: 11 occurrences. La ligne " Braising beef " est exactement ce morceau ; " braised " n''est pas un modificateur, la forme complète rate.'),
  ('chicken thigh meat', 'chicken_thigh', 'L19b: 10 occurrences via " cooked chicken thigh meat ". " meat " n''est pas un modificateur ; la tête reste hors index.'),
  ('chicken thigh fillets', 'chicken_thigh', 'L19b: Même coupe, formulation de rayon britannique ; rate aujourd''hui.'),
  ('lamb mince', 'lamb', 'L19b: 4 occurrences. Aucune ligne d''agneau haché n''existe ; " Lamb " (128 kcal, cru) est la ligne honnête pour de l''agneau haché cru.'),
  ('tuna tins', 'tuna_tinned', 'L19b: 5 occurrences. Désigne le thon en conserve ; le conditionnement ne change pas l''aliment.'),
  ('tuna cans', 'tuna_tinned', 'L19b: 1 occurrence, même objet, orthographe américaine.'),
  ('italian herbs', 'dried_herbs', 'L19b: 2 occurrences. " Dried mixed herbs " est la ligne de mélange d''herbes sèches.'),
  ('crackers', 'wheat_crackers', 'L19b: 1 occurrence nue. " Wheat crackers " est la seule ligne de cracker du référentiel.'),
  ('mixed greens', 'lettuce', 'L19b: 2 occurrences. " mixed salad leaves " atteint déjà `lettuce` 68 fois : même objet, autre formulation.'),
  ('mixed salad greens', 'lettuce', 'L19b: 2 occurrences, formulation américaine de la même chose.'),
  ('lettuce leaves', 'lettuce', 'L19b: 2 occurrences. Les feuilles de laitue sont de la laitue.'),
  ('salad greens', 'lettuce', 'L19b: Formulation courante du même produit de rayon.'),
  ('pommes de terre nouvelles', 'potato', 'L19b: 1 occurrence, dans le seul plan français du corpus. " new potatoes " atteint déjà `potato` 60 fois.'),
  ('melange de legumes', 'mixed_vegetables', 'L19b: Nom français de " Mixed vegetables, frozen, raw ". Aucune forme française n''atteint la ligne.'),
  ('pain blanc', 'white_bread', 'L19b: Traduction directe de " White bread ".'),
  ('herbes sechees', 'dried_herbs', 'L19b: Traduction directe de " Dried mixed herbs ".'),
  ('herbes seches', 'dried_herbs', 'L19b: Variante d''accord, très fréquemment écrite.'),
  ('cube de bouillon', 'stock_cube', 'L19b: Nom français du cube de bouillon ; le libellé " Stock " (240 kcal) est bien le cube déshydraté.'),
  ('tortilla de mais', 'corn_tortilla_wrap_be', 'L19b: Traduction directe de " Corn tortilla wrap, to be filled ".'),
  ('tortillas de mais', 'corn_tortilla_wrap_be', 'L19b: Le pluriel français ne se dérive pas ici (le -s tombe mais " tortilla de mais " n''existe pas encore).'),
  ('aneth', 'herbs_dill', 'L19b: Nom français de l''aneth. " dill " atteint la ligne, " aneth " n''atteint rien.'),
  ('quartier de citron', 'lemon_wedge', 'L19b: Traduction directe de " Lemon wedge " ; la ligne porte un `unit_grams`, donc elle pèse.'),
  ('quartiers de citron', 'lemon_wedge', 'L19b: Pluriel français, écrit tel quel dans une recette.'),
  ('feuille de laurier', 'herbs_bay_leaf', 'L19b: Traduction directe de " Bay leaf, dried ".'),
  ('feuilles de laurier', 'herbs_bay_leaf', 'L19b: Pluriel français.'),
  ('laurier', 'herbs_bay_leaf', 'L19b: Forme nue, la plus fréquente dans une recette française.'),
  ('paleron de boeuf', 'beef_chuck', 'L19b: " Beef, chuck, raw " est le paleron. Aujourd''hui la forme nue " paleron " tombe sur `beef_braising` (même énergie, autre ligne).'),
  ('ciboulette', 'herbs_chives', 'L19b: Nom français de la ciboulette.'),
  ('galette de mais', 'corn_cake', 'L19b: Traduction de " Corn cake (puffed) ".'),
  ('galettes de mais', 'corn_cake', 'L19b: Pluriel français.'),
  ('melange de fruits secs', 'mixed_nuts', 'L19b: Nom français de " Mixed nuts ".'),
  ('fruits secs melanges', 'mixed_nuts', 'L19b: Seconde formulation, même produit.'),
  ('yaourt de coco', 'coconut_yogurt', 'L19b: Nom français de " Coconut yogurt, plain ".'),
  ('yaourt au lait de coco', 'coconut_yogurt', 'L19b: Formulation d''étiquette, même produit.'),
  ('tomates en conserve', 'tinned_tomatoes', 'L19b: Sans cet alias, " en conserve " est coupé comme un CONDITIONNEMENT et la tête " tomates " tombe sur la tomate FRAÎCHE.'),
  ('pain pita complet', 'pita_wholemeal', 'L19b: Sans cet alias, `complet` est retiré comme modificateur et la forme tombe sur `pita_bread` (raffiné). Le GROUPE change.'),
  ('pita complet', 'pita_wholemeal', 'L19b: Même raison, forme courte.'),
  ('tortilla complete', 'tortilla_wholemeal', 'L19b: Sans cet alias, `complet` est retiré et la forme tombe sur `white_bread`. Le GROUPE change.'),
  ('tortillas completes', 'tortilla_wholemeal', 'L19b: Même raison, au pluriel.'),
  ('couscous complet', 'couscous_wholemeal', 'L19b: Sans cet alias, `complet` est retiré et la forme tombe sur `couscous` (raffiné). Le GROUPE change.'),
  ('piment moulu', 'chilli_powder', 'L19b: Sans cet alias, la forme tombe sur `chilli` (piment FRAIS, 44,5 kcal) au lieu de la poudre (282 kcal) : ×6,3 d''énergie.'),
  ('ground chilli', 'chilli_powder', 'L19b: Même erreur côté anglais, mesurée : " ground chilli " tombe sur le piment frais.'),
  ('sel fin', 'salt', 'L19b: Formulation française courante ; " sel " nu atteint la ligne, " sel fin " non.'),
  ('pain de ble complet', 'wholemeal_bread', 'L19b: Formulation française complète de " Wholemeal bread ".'),
  ('paprika doux', 'paprika', 'L19b: " paprika fume " atteint la ligne, " paprika doux " non : même épice.'),
  ('persil plat', 'herbs_parsley', 'L19b: Le persil plat est du persil ; la forme qualifiée rate.'),
  ('melange de fruits rouges', 'mixed_berries', 'L19b: Nom français de " Mixed berries ".'),
  ('viande hachee de dinde', 'turkey_mince', 'L19b: Formulation française complète de " Turkey mince " (" dinde hachee " atteint déjà la ligne).'),
  ('viande hachee de boeuf', 'beef_mince', 'L19b: Formulation française complète de " Beef mince (5%) " (" boeuf hache " atteint déjà la ligne).'),
  ('sauce de soja', 'soy_sauce', 'L19b: Variante française de " sauce soja ", qui atteint déjà la ligne.'),
  ('puree de cacahuete', 'peanut_butter', 'L19b: Nom français du beurre de cacahuète sans sucre ajouté ; même produit.'),
  ('cerneaux de noix', 'walnuts', 'L19b: Les cerneaux sont la partie comestible de la noix ; " Walnuts " est la ligne.'),
  ('coulis de tomates', 'passata', 'L19b: Le singulier " coulis de tomate " atteint la ligne, le pluriel non.'),
  ('galette de ble', 'tortilla_wrap', 'L19b: Nom français de la tortilla de blé (" Tortilla wrap (wheat) ").'),
  ('galettes de ble', 'tortilla_wrap', 'L19b: Pluriel français.'),
  ('filet de cabillaud', 'cod', 'L19b: Formulation française usuelle ; " cabillaud " nu atteint la ligne, la forme qualifiée non.'),
  ('filets de cabillaud', 'cod', 'L19b: Pluriel français de la même forme.'),
  ('pates au ble complet', 'wholewheat_pasta', 'L19b: Formulation française complète ; " pates completes " atteint déjà la ligne.'),
  ('confiture de cassis', 'jam', 'L19b: Le corpus écrit " blackcurrant jam " 13 fois et atteint `jam` (moyenne des confitures) ; la forme française doit y arriver aussi.'),
  ('bifteck', 'beef_steak', 'L19b: Synonyme français de " steak de boeuf ", qui atteint déjà la ligne.'),
  ('cafe noir', 'coffee', 'L19b: " black coffee " atteint la ligne 6 fois ; sa traduction non.'),
  ('garbanzo beans', 'chickpeas_tinned', 'L19b: Nom américain du pois chiche ; " chickpeas " atteint déjà la ligne.'),
  ('oatmeal', 'oats', 'L19b: Nom américain des flocons d''avoine ; " rolled oats " atteint déjà la ligne.'),
  ('capsicum', 'bell_pepper', 'L19b: Nom australien du poivron ; " bell pepper " atteint déjà la ligne.'),
  ('pepitas', 'pumpkin_seeds', 'L19b: Nom courant des graines de courge décortiquées.'),
  ('sieved tomatoes', 'passata', 'L19b: Définition même de la passata, écrite en anglais de cuisine.'),
  ('canned plum tomatoes', 'tinned_tomatoes', 'L19b: Sans cet alias la forme tombe sur la tomate FRAÎCHE : " plum tomatoes " réduit à " tomatoes ".'),
  ('panko breadcrumbs', 'breadcrumbs', 'L19b: Le panko est de la chapelure ; la ligne " Breadcrumbs " est la seule du référentiel.')
on conflict (alias) do nothing;

commit;
