-- LOT 0-B — LES TERMES QUE LE GÉNÉRATEUR ÉCRIT VRAIMENT
--
-- ── CE QUE CETTE MIGRATION RÉPARE ─────────────────────────────────────────
-- Sur les 1 204 plats de foyer en base, 455 seulement portent une énergie
-- calculable. 304 d'entre eux sont bloqués par un terme que
-- `food_composition_refs` ne connaît pas — 112 termes distincts.
--
-- ── LA MÉTHODE, ET POURQUOI ELLE N'EST PAS CELLE DE LA DERNIÈRE FOIS ──────
-- Deux campagnes précédentes ont conclu « le référentiel est trop pauvre » et
-- importé 689 aliments d'un coup, en réponse à un compteur qui mesurait autre
-- chose (`coverage` compte les termes CONNUS, `resolved` les termes PESÉS —
-- 69 % contre 96 % sur la même assiette). Ici, chaque ligne et chaque alias
-- vient d'une liste de termes RÉELLEMENT inconnus, obtenue en rejouant
-- `resolveIngredients` sur l'index vivant, classée par nombre de plats, et
-- chacun porte son compte. Rien n'est ajouté « au cas où ».
--
-- ⚠️ `student_generated_meals.dishes[].ingredients[].grams_raw` est FIGÉ à la
-- génération : il dit l'état du référentiel du jour de ce plan-là. Une requête
-- SQL dessus rend une worklist à moitié périmée (`cucumber`, `red onion`,
-- `courgettes` y sont, et se pèsent parfaitement aujourd'hui). La mesure passe
-- donc par un rejeu, jamais par `grams_raw`.
--
-- ── LES TROIS FAMILLES, COMPTÉES SÉPARÉMENT ──────────────────────────────
--   ① 45 ALIAS vers une ligne existante — le geste le moins cher et le plus
--      sûr : il ne crée aucun nombre.
--   ② 10 LIGNES neuves, chacune réclamée par des plats réels.
--   ③ 26 COMPOSÉS DU PRODUIT écartés (`braised beef`, `roasted vegetables`,
--      `lentil tomato sauce`, `shakshuka base`…). Ce sont des PLATS de
--      reprise, pas des aliments : leur énergie vit dans leurs casseroles et
--      se récupère par `foldPreparationsIntoDishes`, pas par une ligne de
--      référentiel. Une ligne « braised beef » ferait double emploi avec la
--      casserole qu'elle recopie. Ils appartiennent au LOT 1.
--
-- ── CE QUI RESTE BLOQUÉ EXPRÈS, ET POURQUOI ──────────────────────────────
--   `pepper` (×16) — poivre (330 kcal/100 g) ou poivron (26) ? L'écart est
--      d'un facteur 13 et le terme ne le tranche pas. Mesuré : l'alias ne
--      débloquerait AUCUN plat à lui seul (les 16 plats portent tous un autre
--      obstacle). Un alias faux, pour zéro plat gagné : on laisse bloqué.
--   `sourdough bread` (×10) — écrit « 1 unit » deux fois et « 8 unit » deux
--      fois dans les mêmes plans. Une tranche pèse 35 g, une miche 800 g. Un
--      facteur 20 sur un aliment à 278 kcal/100 g est pire que l'abstention
--      qu'il remplacerait. Le terme relève du LOT 0-A (le prompt doit exiger
--      un gramme), pas du référentiel.
--   `cheese` (×2), `greens` (×3), `seasonal berries`, `muffin cases` — un
--      « cheese » générique couvre 98 (cottage) à 406 kcal (parmesan) ; le
--      référentiel porte exprès cheddar, feta, parmesan, mozzarella, chèvre
--      et halloumi séparément plutôt qu'une moyenne. « muffin cases » n'est
--      pas un aliment.
--   `comte or emmental cheese` — l'alternative disqualifie (AMBIGUITY_MARKERS
--      dans `food_composition.ts`). C'est le comportement voulu, et il doit
--      survivre à cette migration.
--   `smoked mackerel`, `sea bass fillets`, `trout fillets`, `egg noodles` —
--      1 à 3 plats chacun, et chacun demande soit un poids de filet, soit une
--      valeur (maquereau fumé ~305 vs cru 194) que je ne peux pas tirer d'une
--      ligne existante sans me tromper de 35 %.
--
-- ⛔ Aucun `energy_dense` existant n'est modifié. Aucune valeur n'est touchée
--    sur une ligne déjà là : seules deux colonnes `unit_grams` VIDES sont
--    remplies (`where unit_grams is null`), et une convention de poids de
--    pièce est écrite COMME une convention, pas comme une mesure.

begin;

-- ───────────────────────────────────────────────────────────────────────────
-- ① LES DIX LIGNES QUI MANQUAIENT VRAIMENT
-- ───────────────────────────────────────────────────────────────────────────
--
-- `source = 'manual'` pour les dix, comme les 30 lignes manuelles déjà en
-- place (Bagel, Pita bread, Tortilla wrap, Rye crispbread…). Écrire
-- `'ciqual'` sans pouvoir citer un `alim_code` vérifié ferait passer une
-- valeur d'ordre de grandeur pour une entrée de table officielle — c'est
-- exactement le genre de nombre qui a l'air d'une mesure. Les valeurs
-- ci-dessous sont des ordres de grandeur assumés, calés sur les voisins DÉJÀ
-- au référentiel, et la bande d'erreur acceptée par le design (±10-15 %) les
-- couvre.

insert into public.food_composition_refs
  (slug, food_group_ref, label, source, energy_kcal, protein_g, carbs_g, fat_g,
   fiber_g, omega3_marine, iron_source, calcium_source, iodine_source,
   zinc_source, b12_source, folate_source, yield_class, atwater_discount,
   energy_dense, unit_grams)
values
  -- `plums` ×18 plats. ⚠️ LE PIÈGE : `prune` EXISTE au référentiel, à
  -- 229 kcal/100 g, et son alias est « pruneau sec » — c'est le pruneau SÉCHÉ.
  -- Y renvoyer « plums » ferait un facteur 5 sur un fruit frais. La prune
  -- fraîche est un fruit à noyau, dans la même bande que ses voisins déjà
  -- présents : abricot 45,9 · pêche 46,3 · cerise 55,7.
  -- unit_grams 60 : CONVENTION, cohérente avec la famille des fruits à pièce
  -- déjà conventionnée ici (figue 50 · kiwi 80 · citron 60 · pêche 130).
  ('plum','other_fruit','Plum, raw','manual',46,0.6,10.0,0.2,1.6,
   false,false,false,false,false,false,false,'neutral',1,false,60),

  -- `lemon wedge` / `lemon wedges` ×16 plats, tous écrits « n unit ».
  -- Composition = celle de `lemon` (même aliment, ligne CIQUAL 27,6 kcal).
  -- Ce qui change est le POIDS DE LA PIÈCE : `lemon` porte déjà 60 g, qui est
  -- le citron ENTIER. Un quartier n'est pas un citron. unit_grams 10 :
  -- CONVENTION, 1/6 du citron de 60 g déjà au référentiel. L'enjeu
  -- énergétique est nul (2,8 kcal contre 17) ; l'enjeu est de ne pas écrire
  -- six fois la masse réelle dans un module qui pèse des assiettes.
  ('lemon_wedge','citrus','Lemon wedge','manual',27.6,0.4,1.6,0.3,2.8,
   false,false,false,false,false,false,false,'neutral',1,false,10),

  -- `hot sauce` ×9 plats, écrits en cuillères (1 tsp = 5 g). Bande réelle des
  -- sauces pimentées : 20 (tabasco) à 95 (sriracha) kcal/100 g. À 5 g, l'écart
  -- entre les deux bouts vaut 4 kcal — la valeur médiane est sans enjeu ici,
  -- ce qui manquait était la RÉSOLUTION. Calée entre `salsa` (36) et
  -- `ketchup` (99), déjà au référentiel.
  ('hot_sauce','sauce_dressing','Hot sauce (chilli)','manual',45,1.0,8.0,0.5,1.0,
   false,false,false,false,false,false,false,'neutral',1,false,null),

  -- `mixed seeds` ×9 plats. Mélange courant tournesol/courge/lin/sésame ;
  -- ses quatre composants sont au référentiel entre 491 et 638 kcal.
  -- `atwater_discount` 1,0 : la décote Novotny porte sur les fruits à coque
  -- ENTIERS, pas sur les graines — les quatre lignes de graines déjà
  -- présentes portent toutes 1,0. `energy_dense` true, comme elles.
  ('mixed_seeds','nuts_seeds','Mixed seeds','manual',580,22.0,12.0,47.0,10.0,
   false,true,false,false,true,false,false,'neutral',1,true,null),

  -- `poppy seeds` ×2 plats. Même famille, mêmes conventions.
  ('poppy_seeds','nuts_seeds','Poppy seeds','manual',525,18.0,4.0,42.0,20.0,
   false,true,true,false,true,false,false,'neutral',1,true,null),

  -- `sunflower seed butter` ×3 plats, en cuillères. Purée de graines : la
  -- structure cellulaire est détruite, donc `atwater_discount` 1,0 comme
  -- `peanut_butter` et `tahini`, et non 0,72.
  ('sunflower_seed_butter','nuts_seeds','Sunflower seed butter','manual',617,20.0,14.0,55.0,6.0,
   false,true,false,false,true,false,false,'neutral',1,true,null),

  -- `corn cakes` ×8 plats, tous « 3 unit » et tous SANS `state`.
  -- ⚠️ `yield_class` DOIT être `neutral` : une galette soufflée est prête à
  -- manger, et surtout `gramsRawOf` refuse un `state` absent dès que la classe
  -- a un rendement ≠ 1,0. La mettre en `grain_absorbs` (comme la ligne CIQUAL
  -- `puffed_cereals_textured_bread`) laisserait les 8 plats bloqués.
  -- unit_grams 10 : CONVENTION, celle que `crispbread_rye` porte déjà pour la
  -- même forme de produit. `energy_dense` false, comme `crispbread_rye` (340)
  -- : le drapeau existe pour empêcher qu'une omission déplace une assiette de
  -- dizaines de pour cent ; une galette de 10 g ne le peut pas.
  ('corn_cake','refined_grain','Corn cake (puffed)','manual',385,7.0,78.0,3.0,3.0,
   false,false,false,false,false,false,false,'neutral',1,false,10),

  -- `coconut yoghurt` ×4 plats, écrits « 60 g » et SANS `state` → `neutral`.
  -- Spécialité végétale à la coco, nature : le gras de coco la place très
  -- au-dessus d'un yaourt de lait (`plain_yogurt` 59) et sous le lait de coco
  -- (`coconut_milk` 188), tous deux déjà au référentiel.
  ('coconut_yogurt','dairy_yogurt','Coconut yogurt, plain','manual',140,1.5,6.0,12.0,1.0,
   false,false,false,false,false,false,false,'neutral',1,false,null),

  -- `dill` ×13 et `chives` ×8. LES DEUX MEMBRES MANQUANTS D'UNE FAMILLE DÉJÀ
  -- FERMÉE au référentiel : basilic, coriandre, menthe, persil, thym y sont,
  -- l'aneth et la ciboulette non.
  -- ⚠️ HONNÊTETÉ DU COMPTE : ces deux lignes débloquent ZÉRO plat aujourd'hui.
  -- Le générateur écrit « dill » et « chives » SANS quantité (12 fois sur 13
  -- pour l'aneth) ; une fois résolus, ils passent d'« inconnu » à « non pesé »
  -- et le plat reste bloqué. Elles sont la PRÉCONDITION du lot 0-C : une
  -- classe de condiments à masse conventionnelle ne peut pas s'appliquer à un
  -- terme que le référentiel ne reconnaît pas.
  ('herbs_dill','leafy_greens','Dill','manual',43,3.5,3.0,1.1,2.8,
   false,true,false,false,false,false,true,'neutral',1,false,null),
  ('herbs_chives','leafy_greens','Chives','manual',30,3.0,1.8,0.7,2.5,
   false,true,false,false,false,false,true,'neutral',1,false,null)
on conflict (slug) do nothing;

-- ───────────────────────────────────────────────────────────────────────────
-- ② LES DEUX POIDS DE PIÈCE QUI MANQUAIENT SUR DES LIGNES EXISTANTES
-- ───────────────────────────────────────────────────────────────────────────
--
-- `where unit_grams is null` : cette migration REMPLIT un vide, elle ne
-- réécrit jamais une valeur posée. Les deux sont des CONVENTIONS, du même
-- genre que les 66 déjà en place (citron 60 · œuf 55 · pain 35 · brocoli 300).

-- `corn tortillas` ×22 plats, tous « 2 unit » ou « 4 unit ». Sans poids de
-- pièce, l'alias ci-dessous les ferait passer d'« inconnu » à « non pesé »
-- sans rien débloquer. 30 g = la tortilla de maïs de 15 cm, le format
-- standard ; les tortillas de BLÉ du référentiel portent déjà 60 g, et la
-- galette de maïs est nettement plus petite qu'elles.
update public.food_composition_refs
   set unit_grams = 30
 where slug = 'corn_tortilla_wrap_be' and unit_grams is null;

-- `apricots` ×10 plats, tous « n unit ». Un abricot moyen pèse ~55 g entier,
-- ~50 g dénoyauté — et la ligne visée est « Apricot, pitted, raw ». Cohérent
-- avec la famille déjà conventionnée (figue 50 · kiwi 80 · clémentine 80).
update public.food_composition_refs
   set unit_grams = 50
 where slug = 'apricot_pitted' and unit_grams is null;

-- ───────────────────────────────────────────────────────────────────────────
-- ③ LES ALIAS — 45 clés, aucune valeur créée
-- ───────────────────────────────────────────────────────────────────────────
--
-- ⚠️ POURQUOI TANT DE FORMES PLURIELLES EN CLAIR. `candidateForms` réduit le
-- pluriel anglais par `replace(/e?s$/, "")` sur le DERNIER mot : « aubergines »
-- donne « aubergin » et non « aubergine », « cherries » donne « cherri »,
-- « nectarines » donne « nectarin ». La réduction est donc muette sur tous les
-- singuliers terminés par « e ». Je n'y touche PAS — c'est le matcher partagé,
-- et le corriger depuis ce lot changerait le comportement de tout le
-- référentiel sans mesure. J'écris la forme EXACTE observée dans les plans.
--
-- `on conflict do nothing` : la table d'alias a l'alias en clé primaire, et
-- cette migration doit rester ré-appliquable (`db reset` est interdit ici).

insert into public.food_composition_aliases (alias, slug, note) values
  -- ── les plus gros gains ────────────────────────────────────────────────
  ('corn tortilla','corn_tortilla_wrap_be','LOT 0-B: 22 plats de foyer'),
  ('corn tortillas','corn_tortilla_wrap_be','LOT 0-B: forme exacte des plans'),
  ('blackcurrant jam','jam','LOT 0-B: 13 plats; la ligne Jam est la moyenne des confitures'),
  ('apricot','apricot_pitted','LOT 0-B: 10 plats'),
  ('apricots','apricot_pitted','LOT 0-B: forme exacte des plans'),
  ('red wine vinegar','vinegar','LOT 0-B: 6 plats; cf. balsamic/cider vinegar deja aliases'),
  ('dill','herbs_dill','LOT 0-B: le slug suit la famille herbs_*'),
  ('chives','herbs_chives','LOT 0-B: le slug suit la famille herbs_*'),
  ('coconut yoghurt','coconut_yogurt','LOT 0-B: orthographe britannique'),

  -- ── pains plats et wraps : la piece EST le produit, pas une tranche ────
  -- (a distinguer de `sourdough bread`, laisse bloque : 1 unit ou 8 unit,
  --  tranche ou miche, facteur 20. Ici le facteur va de 60 a 90 g.)
  ('flatbread','pita_bread','LOT 0-B: 5 plats; pain plat a la piece'),
  ('flatbreads','pita_bread','LOT 0-B: forme exacte des plans'),
  ('wholemeal flatbread','pita_wholemeal','LOT 0-B: 2 plats'),
  ('wholewheat wrap','tortilla_wholemeal','LOT 0-B: cf. wholewheat tortilla deja alias'),
  ('wholewheat wraps','tortilla_wholemeal','LOT 0-B: forme exacte des plans'),
  ('whole wheat wrap','tortilla_wholemeal','LOT 0-B'),
  ('whole wheat wraps','tortilla_wholemeal','LOT 0-B: forme exacte des plans'),
  ('pitta bread','pita_bread','LOT 0-B: orthographe britannique'),
  ('pitta breads','pita_bread','LOT 0-B: forme exacte des plans'),
  ('wholewheat pita','pita_wholemeal','LOT 0-B: cf. wholegrain pita deja alias'),
  ('wholewheat pitas','pita_wholemeal','LOT 0-B: forme exacte des plans'),
  ('crusty baguette','white_bread','LOT 0-B: 2 plats en grammes; cf. baguette deja alias'),
  ('wholegrain baguette','wholemeal_bread','LOT 0-B: 1 plat en grammes'),
  ('wholegrain baguettes','wholemeal_bread','LOT 0-B: forme exacte des plans'),
  ('whole grain bread','wholemeal_bread','LOT 0-B: cf. wholemeal bread deja alias'),

  -- ── feculents et legumineuses, tous ecrits en grammes ──────────────────
  ('dry pasta','white_pasta','LOT 0-B: 3 plats; "dry" nest pas un modificateur reconnu'),
  ('short pasta','white_pasta','LOT 0-B: 3 plats'),
  ('arborio rice','white_rice','LOT 0-B: cf. basmati rice deja alias'),
  ('dry lentils','lentils_dry','LOT 0-B: cf. dried lentils deja alias'),
  ('oat flour','oats','LOT 0-B: moudre ne change pas la composition'),

  -- ── fruits et legumes ──────────────────────────────────────────────────
  ('nectarines','peach','LOT 0-B: cf. nectarine deja alias; le pluriel ne se reduit pas'),
  ('cherries','cherry_pitted','LOT 0-B: le pluriel ne se reduit pas'),
  ('blackberries','blackberry','LOT 0-B: le pluriel ne se reduit pas'),
  ('british strawberries','strawberries','LOT 0-B: "british" nest pas un modificateur'),
  ('aubergines','aubergine','LOT 0-B: le pluriel ne se reduit pas'),
  ('broccoli floret','broccoli','LOT 0-B'),
  ('broccoli florets','broccoli','LOT 0-B: forme exacte des plans'),
  ('broccoli head','broccoli','LOT 0-B: broccoli porte deja 300 g de piece'),
  ('green salad','lettuce','LOT 0-B: cf. salade verte deja alias'),
  ('bagged salad','mixed_leaves','LOT 0-B'),
  ('apple sauce','apple_compote','LOT 0-B: cf. compote de pomme deja alias'),
  ('applesauce','apple_compote','LOT 0-B: sans espace'),
  ('ripe tomato','tomato','LOT 0-B: "ripe" nest pas un modificateur'),
  ('cherry vine tomatoes','tomato_cherry','LOT 0-B'),

  -- ── proteines, toutes ecrites en grammes ou avec une piece deja au ref ─
  ('white fish fillet','cod','LOT 0-B: 3 plats; le cabillaud represente white_fish et porte deja 130 g de filet'),
  ('white fish fillets','cod','LOT 0-B: forme exacte des plans'),
  ('sirloin steak','beef_sirloin_steak','LOT 0-B'),
  ('pork medallions','pork_filet_mignon','LOT 0-B: le medaillon se taille dans le filet'),
  ('turkey slices','turkey_ham_slices','LOT 0-B: cf. turkey cooked ham in slices'),
  ('soft goat cheese','goat_cheese','LOT 0-B: la ligne Goat cheese est le chevre frais (103 kcal)'),
  ('toasted almonds','almonds','LOT 0-B: "toasted" nest pas un modificateur reconnu')
on conflict (alias) do nothing;

commit;
