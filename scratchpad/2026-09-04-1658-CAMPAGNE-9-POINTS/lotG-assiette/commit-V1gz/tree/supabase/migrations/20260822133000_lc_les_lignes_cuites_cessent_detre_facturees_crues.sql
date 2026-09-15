-- ============================================================================
-- L-C — LES LIGNES CUITES LUES COMME DU CRU.
--
-- Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `L-C`.
-- Prédicat, liste publiée et mesures: `scripts/keel_lc_lignes_cuites_20260822.ts`.
-- Directions écrites AVANT cet `update`:
--   `scratchpad/2026-08-22-L-C-DIRECTIONS-avant-update.txt`.
--
-- ⛔ CE QUE CETTE MIGRATION TOUCHE, ET RIEN D'AUTRE
-- ------------------------------------------------
-- `food_composition_refs.yield_class`, sur 57 lignes NOMMÉES une par une.
-- Ni `energy_kcal`, ni les macros, ni `unit_grams`, ni `condiment_grams`, ni
-- un alias, ni une colonne neuve, ni une table neuve.
--
-- C'est une contrainte de PLAN et pas une pudeur: `L19b` (alias) et `L-1`
-- (`unit_grams` + `unit_grams_source`) ont touché la MÊME table ce matin, et
-- le plan impose une seule migration de référentiel à la fois. Ce fichier
-- arrive derrière les deux et ne démêle rien.
--
-- ⛔ LA PRÉMISSE DE LA FICHE EST À MOITIÉ RENVERSÉE, ET C'EST LE CŒUR DU LOT
-- -------------------------------------------------------------------------
-- La fiche lisait « 131 lignes à libellé cuit, 130 en `neutral` » comme 130
-- défauts. **Ce sont 134 lignes JUSTES**, et l'`update` qui les aurait
-- « corrigées » aurait fabriqué l'erreur qu'elle croyait retirer.
--
-- La règle se dérive du code, pas d'un avis. `nutrientsOf` multiplie
-- `gramsRaw` par `energy_kcal / 100`. Donc:
--
--     `yield_class` NON NEUTRE n'est juste QUE si `energy_kcal` est la
--     densité de l'aliment DANS UN AUTRE ÉTAT que celui qui arrive dans
--     l'assiette — une céréale/légumineuse SÈCHE qui boit son eau, ou une
--     chair/un légume CRU qui la perd.
--
-- `Beef, braised` porte 240 kcal/100 g **cuits**; l'assiette déclare des
-- grammes de bœuf braisé; `gramsRaw` doit donc valoir ces grammes tels quels.
-- Lui poser `meat_shrinks` ferait 200 g → 285,7 g → **686 kcal au lieu de
-- 480**. La fiche annonçait « vers le haut pour une viande braisée »: c'est
-- exactement le mouvement à NE PAS faire, et il est écrit ici pour que
-- personne ne le refasse.
--
-- Deux raisons indépendantes tiennent la même conclusion:
--   · `neutral` est la SEULE classe qui accepte un `state` absent
--     (`stateMattersFor`), et 3 903 des 10 453 lignes du corpus n'en portent
--     pas. Passer ces 134 en non-neutre les ferait toutes s'abstenir.
--   · le lot 30 a bâti sa grille de prix SUR cette neutralité:
--     `cooked_label_dry_input` est défini comme « libellé cuit ET
--     `yield_class` vaut 1,0 ». Les faire bouger casserait 111 prix en
--     silence, dans une table que personne ne relit.
--
-- LE DÉFAUT RÉEL EST L'IMAGE MIROIR: une ligne DÉJÀ CUITE qui porte une
-- classe non neutre. Le rendement s'y applique deux fois.
--
-- ⛔ AUCUN RAPPROCHEMENT AUTOMATIQUE — MESURÉ PAR LE LOT 30
-- --------------------------------------------------------
-- 12 lignes cuites ne portent aucun mot-clé de cuisson (« Noodles »,
-- « Mashed potatoes », « Bread, home-made ») et ont dû être lues une par une.
-- Les 57 slugs ci-dessous sont écrits en toutes lettres pour cette raison; le
-- regex de `keel_lc_lignes_cuites_20260822.ts` n'est pas la source de la
-- liste, c'est le FILET qui refuse (`rc=1`) qu'une ligne attrapable reste
-- sans décision.
--
-- ⚠️ CE QU'ON NE PEUT PAS VÉRIFIER, ET IL FAUT LE DIRE
-- ----------------------------------------------------
-- 689 des 923 lignes se déclarent `ciqual` SANS `ciqual_code`, dont 185 des
-- 206 lignes décidées ici (lot `O9`). Pour elles, remonter à la source est
-- IMPOSSIBLE. C'est aussi pourquoi cette migration ne touche AUCUNE valeur
-- nutritionnelle: re-baser 134 × 5 colonnes par un facteur générique sur des
-- lignes invérifiables serait un nombre inventé sur la grandeur que tout le
-- produit lit.
--
-- CE QUI EST FAIT, EN TROIS BLOCS
-- ------------------------------
--   ⓐ la garde D'ENTRÉE: les 57 lignes portent-elles bien la classe que la
--      mesure AVANT a relevée ? Sinon un voisin les a bougées, et on s'arrête.
--   ⓑ l'`update`, classe par classe, chaque slug nommé.
--   ⓒ les gardes de SORTIE: les 57 sont `neutral`, les 15 sèches n'ont PAS
--      bougé, la distribution finale des six classes est exacte, et plus
--      aucune ligne à libellé cuit n'est non neutre.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- ⓐ LA GARDE D'ENTRÉE
--
-- ⛔ Elle existe parce que TROIS lots ont touché cette table aujourd'hui. Si
-- `yield_class` a déjà bougé sur une de ces 57 lignes, ce n'est pas ce lot qui
-- l'a fait, et écraser en silence serait la façon la plus discrète de perdre
-- le travail de quelqu'un d'autre.
-- ---------------------------------------------------------------------------

do $$
declare
  ecart text;
begin
  select string_agg(v.slug || ' (base=' || r.yield_class || ', attendu=' || v.attendu || ')', ', ')
    into ecart
  from (values
    ('black_white_pudding_sauteed',         'meat_shrinks'),  -- 246 · Black or white pudding (blood sausage), sautéed (average)
    ('bread_flour_bread_preparation',       'grain_absorbs'),  -- 256 · Bread, home-made, with flour for home-made bread preparation
    ('carrots_puree',                       'veg_shrinks'),  -- 31.5 · Carrots, puree
    ('carrots_puree_cream',                 'veg_shrinks'),  -- 44.4 · Carrots, puree with cream
    ('country_style_bread',                 'grain_absorbs'),  -- 240 · Country-style bread, home-made (with flour for bread making machine)
    ('mashed_potatoes',                     'veg_shrinks'),  -- 91.8 · Mashed potatoes (average)
    ('noodles',                             'grain_absorbs'),  -- 104.0 · Noodles
    ('potato_puree_flakes_reconstituted',   'veg_shrinks'),  -- 97.9 · Potato puree, made from flakes, reconstituted with whole milk, with added fat
    ('potato_puree_milk_butter',            'veg_shrinks'),  -- 88.8 · Potato puree, with milk and butter, unsalted
    ('toasted_bread',                       'grain_absorbs'),  -- 317 · Toasted bread, home-made
    ('vegetables_mashed',                   'veg_shrinks'),  -- 61.8 · Vegetables (3-4 types), mashed
    ('english_muffin_wholewheat_flour',     'grain_absorbs'),  -- 217 · English muffin, wholewheat flour, prepacked
    ('english_muffin',                      'grain_absorbs'),  -- 228 · English muffin, prepacked
    ('bread_wholemeal_integral_bread',      'grain_absorbs'),  -- 244 · Bread, wholemeal or integral bread (made with flour type 150)
    ('bran_grain_bread',                    'grain_absorbs'),  -- 249 · Bran grain bread
    ('country_style_bread_french',          'grain_absorbs'),  -- 253 · Country-style bread, French bread (baguette or ball)
    ('brear_t55_t110_flour',                'grain_absorbs'),  -- 257 · Brear (baguette or ball), made with type T55-T110 flour
    ('rye_bread_wheat',                     'grain_absorbs'),  -- 260 · Rye bread, and wheat
    ('bread_french_bread_yeast',            'grain_absorbs'),  -- 261 · Bread, French bread (baguette or ball), with yeast
    ('bread_gluten_free',                   'grain_absorbs'),  -- 261 · Bread, gluten free
    ('sandwich_loaf_wholemeal',             'grain_absorbs'),  -- 262 · Sandwich loaf, wholemeal
    ('brown_bread_french_bread',            'grain_absorbs'),  -- 265 · Brown bread, French bread (baguette or ball), with flour type 80 or 110
    ('bread_french_bread_ball',             'grain_absorbs'),  -- 266 · Bread, French bread, ball, 400g
    ('bread_french_bread_multigrain',       'grain_absorbs'),  -- 269 · Bread, French bread, (baguette or ball), multigrain, from bakery
    ('sandwich_loaf_crust_less',            'grain_absorbs'),  -- 271 · Sandwich loaf, crust less, prepacked
    ('panini_bread',                        'grain_absorbs'),  -- 272 · Panini bread
    ('sandwich_loaf_multigrain',            'grain_absorbs'),  -- 274 · Sandwich loaf, multigrain
    ('bread',                               'grain_absorbs'),  -- 276 · Bread (average)
    ('sandwich_loaf',                       'grain_absorbs'),  -- 278 · Sandwich loaf
    ('sandwich_loaf_bran_grain',            'grain_absorbs'),  -- 278 · Sandwich loaf, bran grain
    ('bread_french_bread_salt',             'grain_absorbs'),  -- 279 · Bread, French bread, without salt
    ('rolls_hamburger_hotdog_wholemeal',    'grain_absorbs'),  -- 285 · Rolls for hamburger/hotdog (buns), wholemeal, prepacked
    ('bread_french_bread_baguette',         'grain_absorbs'),  -- 287 · Bread, French bread, baguette
    ('rolls_hamburger_hotdog',              'grain_absorbs'),  -- 293 · Rolls for hamburger/hotdog (buns), prepacked
    ('brioche_sandwich_bread',              'grain_absorbs'),  -- 309 · Brioche sandwich bread, prepacked
    ('corn_tortilla_wrap_be',               'grain_absorbs'),  -- 313 · Corn tortilla wrap, to be filled
    ('wheat_tortilla_wrap_be',              'grain_absorbs'),  -- 327 · Wheat tortilla wrap, to be filled
    ('bretzel',                             'grain_absorbs'),  -- 330 · Bretzel
    ('breadcrumbs',                         'grain_absorbs'),  -- 374 · Breadcrumbs
    ('croutons_spreads',                    'grain_absorbs'),  -- 374 · Croutons, for spreads
    ('puffed_rice_textured_bread',          'grain_absorbs'),  -- 385 · Puffed rice textured bread, wholemeal
    ('rusk_wholemeal_rich_fibre',           'grain_absorbs'),  -- 393 · Rusk, wholemeal or rich in fibre
    ('puffed_cereals_textured_bread',       'grain_absorbs'),  -- 394 · Puffed cereals textured bread
    ('swedish_toast_linseeds',              'grain_absorbs'),  -- 396 · Swedish toast, with linseeds
    ('rusk_multigrain',                     'grain_absorbs'),  -- 398 · Rusk, multigrain
    ('wheat_swedish_toast_wholemeal',       'grain_absorbs'),  -- 398 · Wheat swedish toast, wholemeal
    ('swedish_toast_fruits',                'grain_absorbs'),  -- 401 · Swedish toast, with fruits
    ('wheat_swedish_toast',                 'grain_absorbs'),  -- 402 · Wheat swedish toast
    ('rusk_slice_wheat',                    'grain_absorbs'),  -- 404 · Rusk, slice, wheat
    ('rusk',                                'grain_absorbs'),  -- 409 · Rusk
    ('rusk_w_eggs',                         'grain_absorbs'),  -- 417 · Rusk, w eggs
    ('rusk_eggs',                           'grain_absorbs'),  -- 419 · Rusk with eggs, sliced, prepacked
    ('rusk_slice_multigrain',               'grain_absorbs'),  -- 419 · Rusk , slice, multigrain
    ('grissini_bread_stick',                'grain_absorbs'),  -- 433 · Grissini or bread stick
    ('wheat_crackers',                      'grain_absorbs'),  -- 450 · Wheat crackers
    ('crouton_garlic_herbs_onions',         'grain_absorbs'),  -- 492 · Crouton with garlic, herbs or onions, prepacked
    ('croutons',                            'grain_absorbs')  -- 495 · Croutons, plain, prepacked
  ) as v(slug, attendu)
  join public.food_composition_refs r on r.slug = v.slug
  where r.yield_class <> v.attendu;

  if ecart is not null then
    raise exception 'L-C: yield_class deja deplace par un autre lot: %', ecart;
  end if;

  -- ⛔ Et le miroir: un slug de la liste qui n'existerait plus. Une liste qui
  -- nomme un absent est une liste qui a l'air complete et ne l'est pas.
  select string_agg(v.slug, ', ') into ecart
  from (values
    ('black_white_pudding_sauteed',         'meat_shrinks'),  -- 246 · Black or white pudding (blood sausage), sautéed (average)
    ('bread_flour_bread_preparation',       'grain_absorbs'),  -- 256 · Bread, home-made, with flour for home-made bread preparation
    ('carrots_puree',                       'veg_shrinks'),  -- 31.5 · Carrots, puree
    ('carrots_puree_cream',                 'veg_shrinks'),  -- 44.4 · Carrots, puree with cream
    ('country_style_bread',                 'grain_absorbs'),  -- 240 · Country-style bread, home-made (with flour for bread making machine)
    ('mashed_potatoes',                     'veg_shrinks'),  -- 91.8 · Mashed potatoes (average)
    ('noodles',                             'grain_absorbs'),  -- 104.0 · Noodles
    ('potato_puree_flakes_reconstituted',   'veg_shrinks'),  -- 97.9 · Potato puree, made from flakes, reconstituted with whole milk, with added fat
    ('potato_puree_milk_butter',            'veg_shrinks'),  -- 88.8 · Potato puree, with milk and butter, unsalted
    ('toasted_bread',                       'grain_absorbs'),  -- 317 · Toasted bread, home-made
    ('vegetables_mashed',                   'veg_shrinks'),  -- 61.8 · Vegetables (3-4 types), mashed
    ('english_muffin_wholewheat_flour',     'grain_absorbs'),  -- 217 · English muffin, wholewheat flour, prepacked
    ('english_muffin',                      'grain_absorbs'),  -- 228 · English muffin, prepacked
    ('bread_wholemeal_integral_bread',      'grain_absorbs'),  -- 244 · Bread, wholemeal or integral bread (made with flour type 150)
    ('bran_grain_bread',                    'grain_absorbs'),  -- 249 · Bran grain bread
    ('country_style_bread_french',          'grain_absorbs'),  -- 253 · Country-style bread, French bread (baguette or ball)
    ('brear_t55_t110_flour',                'grain_absorbs'),  -- 257 · Brear (baguette or ball), made with type T55-T110 flour
    ('rye_bread_wheat',                     'grain_absorbs'),  -- 260 · Rye bread, and wheat
    ('bread_french_bread_yeast',            'grain_absorbs'),  -- 261 · Bread, French bread (baguette or ball), with yeast
    ('bread_gluten_free',                   'grain_absorbs'),  -- 261 · Bread, gluten free
    ('sandwich_loaf_wholemeal',             'grain_absorbs'),  -- 262 · Sandwich loaf, wholemeal
    ('brown_bread_french_bread',            'grain_absorbs'),  -- 265 · Brown bread, French bread (baguette or ball), with flour type 80 or 110
    ('bread_french_bread_ball',             'grain_absorbs'),  -- 266 · Bread, French bread, ball, 400g
    ('bread_french_bread_multigrain',       'grain_absorbs'),  -- 269 · Bread, French bread, (baguette or ball), multigrain, from bakery
    ('sandwich_loaf_crust_less',            'grain_absorbs'),  -- 271 · Sandwich loaf, crust less, prepacked
    ('panini_bread',                        'grain_absorbs'),  -- 272 · Panini bread
    ('sandwich_loaf_multigrain',            'grain_absorbs'),  -- 274 · Sandwich loaf, multigrain
    ('bread',                               'grain_absorbs'),  -- 276 · Bread (average)
    ('sandwich_loaf',                       'grain_absorbs'),  -- 278 · Sandwich loaf
    ('sandwich_loaf_bran_grain',            'grain_absorbs'),  -- 278 · Sandwich loaf, bran grain
    ('bread_french_bread_salt',             'grain_absorbs'),  -- 279 · Bread, French bread, without salt
    ('rolls_hamburger_hotdog_wholemeal',    'grain_absorbs'),  -- 285 · Rolls for hamburger/hotdog (buns), wholemeal, prepacked
    ('bread_french_bread_baguette',         'grain_absorbs'),  -- 287 · Bread, French bread, baguette
    ('rolls_hamburger_hotdog',              'grain_absorbs'),  -- 293 · Rolls for hamburger/hotdog (buns), prepacked
    ('brioche_sandwich_bread',              'grain_absorbs'),  -- 309 · Brioche sandwich bread, prepacked
    ('corn_tortilla_wrap_be',               'grain_absorbs'),  -- 313 · Corn tortilla wrap, to be filled
    ('wheat_tortilla_wrap_be',              'grain_absorbs'),  -- 327 · Wheat tortilla wrap, to be filled
    ('bretzel',                             'grain_absorbs'),  -- 330 · Bretzel
    ('breadcrumbs',                         'grain_absorbs'),  -- 374 · Breadcrumbs
    ('croutons_spreads',                    'grain_absorbs'),  -- 374 · Croutons, for spreads
    ('puffed_rice_textured_bread',          'grain_absorbs'),  -- 385 · Puffed rice textured bread, wholemeal
    ('rusk_wholemeal_rich_fibre',           'grain_absorbs'),  -- 393 · Rusk, wholemeal or rich in fibre
    ('puffed_cereals_textured_bread',       'grain_absorbs'),  -- 394 · Puffed cereals textured bread
    ('swedish_toast_linseeds',              'grain_absorbs'),  -- 396 · Swedish toast, with linseeds
    ('rusk_multigrain',                     'grain_absorbs'),  -- 398 · Rusk, multigrain
    ('wheat_swedish_toast_wholemeal',       'grain_absorbs'),  -- 398 · Wheat swedish toast, wholemeal
    ('swedish_toast_fruits',                'grain_absorbs'),  -- 401 · Swedish toast, with fruits
    ('wheat_swedish_toast',                 'grain_absorbs'),  -- 402 · Wheat swedish toast
    ('rusk_slice_wheat',                    'grain_absorbs'),  -- 404 · Rusk, slice, wheat
    ('rusk',                                'grain_absorbs'),  -- 409 · Rusk
    ('rusk_w_eggs',                         'grain_absorbs'),  -- 417 · Rusk, w eggs
    ('rusk_eggs',                           'grain_absorbs'),  -- 419 · Rusk with eggs, sliced, prepacked
    ('rusk_slice_multigrain',               'grain_absorbs'),  -- 419 · Rusk , slice, multigrain
    ('grissini_bread_stick',                'grain_absorbs'),  -- 433 · Grissini or bread stick
    ('wheat_crackers',                      'grain_absorbs'),  -- 450 · Wheat crackers
    ('crouton_garlic_herbs_onions',         'grain_absorbs'),  -- 492 · Crouton with garlic, herbs or onions, prepacked
    ('croutons',                            'grain_absorbs')  -- 495 · Croutons, plain, prepacked
  ) as v(slug, attendu)
  where not exists (select 1 from public.food_composition_refs r where r.slug = v.slug);

  if ecart is not null then
    raise exception 'L-C: slug absent du referentiel: %', ecart;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- ⓑ L'`UPDATE` — CLASSE B: la ligne est CUITE et porte une classe non neutre
--
-- Le lot 30 les avait deja classees `cooked_label_dry_input` ou
-- `cooked_label_yield_absorbed`; ce fichier ne re-decide rien, il applique.
--
-- DIRECTIONS, ecrites avant (elles ne vont pas dans le meme sens):
--   `noodles` et les trois pains          ⬆ ×2,60  (200 g: 80 → 208 kcal)
--   les six purees (`veg_shrinks` 0,90)   ⬇ ×0,90  (200 g: 204 → 184 kcal)
--   le boudin poele (`meat_shrinks` 0,70) ⬇ ×0,70  (100 g: 351 → 246 kcal)
-- ---------------------------------------------------------------------------

update public.food_composition_refs
   set yield_class = 'neutral'
 where slug in (
    'black_white_pudding_sauteed',            -- 246 · Black or white pudding (blood sausage), sautéed (average)
    'bread_flour_bread_preparation',          -- 256 · Bread, home-made, with flour for home-made bread preparation
    'carrots_puree',                          -- 31.5 · Carrots, puree
    'carrots_puree_cream',                    -- 44.4 · Carrots, puree with cream
    'country_style_bread',                    -- 240 · Country-style bread, home-made (with flour for bread making machine)
    'mashed_potatoes',                        -- 91.8 · Mashed potatoes (average)
    'noodles',                                -- 104.0 · Noodles
    'potato_puree_flakes_reconstituted',      -- 97.9 · Potato puree, made from flakes, reconstituted with whole milk, with added fat
    'potato_puree_milk_butter',               -- 88.8 · Potato puree, with milk and butter, unsalted
    'toasted_bread',                          -- 317 · Toasted bread, home-made
    'vegetables_mashed'                       -- 61.8 · Vegetables (3-4 types), mashed
);

-- ---------------------------------------------------------------------------
-- ⓑ L'`UPDATE` — CLASSE C: le produit de panification n'absorbe rien
--
-- ⛔ LE PAIN NE BOIT PAS D'EAU. La farine l'a bue a la boulangerie, et le
-- referentiel porte le pain FINI (217 a 495 kcal/100 g). Six pains etaient
-- deja `neutral` (`white_bread`, `wholemeal_bread`, `rye_bread`, `pita_bread`,
-- `naan_bread`, `bagel`) et cinq ne l'etaient pas: la famille se contredisait
-- elle-meme. Une tranche de 35 g ecrite `state: "cooked"` etait comptee
-- 13,5 g, soit 37 kcal au lieu de 97.
--
-- Aucune de ces 46 lignes ne porte de mot-cle de cuisson: aucun `grep` ne les
-- trouve, elles ont ete lues une par une.
--
-- TROIS EFFETS, ET ILS NE VONT PAS DANS LE MEME SENS:
--   ① `state: "cooked"` ⬆ ×2,6 sur l'energie du pain;
--   ② `state` absent    ⬆ de l'ABSTENTION vers un chiffre (`gramsRawOf`
--      rendait `null`, donc le plat entier s'eteignait);
--   ③ `state: "raw"`    l'energie du pain est INCHANGEE, mais celle du PLAT
--      BAISSE s'il est frit: `nutrientsOf` impute 12 % d'huile sur
--      `cookedWeight`, qui multiplie par `YIELD_FACTORS[yieldClass]`. Un pain
--      en `grain_absorbs` gonflait la masse cuite du plat de ×2,6, donc
--      l'imputation d'huile avec elle. Chemin qui ne passe PAS par
--      `gramsRawOf` — mesure: 7 plats sur 750, −0,19 % sur le corpus entier.
-- ---------------------------------------------------------------------------

update public.food_composition_refs
   set yield_class = 'neutral'
 where slug in (
    'english_muffin_wholewheat_flour',        -- 217 · English muffin, wholewheat flour, prepacked
    'english_muffin',                         -- 228 · English muffin, prepacked
    'bread_wholemeal_integral_bread',         -- 244 · Bread, wholemeal or integral bread (made with flour type 150)
    'bran_grain_bread',                       -- 249 · Bran grain bread
    'country_style_bread_french',             -- 253 · Country-style bread, French bread (baguette or ball)
    'brear_t55_t110_flour',                   -- 257 · Brear (baguette or ball), made with type T55-T110 flour
    'rye_bread_wheat',                        -- 260 · Rye bread, and wheat
    'bread_french_bread_yeast',               -- 261 · Bread, French bread (baguette or ball), with yeast
    'bread_gluten_free',                      -- 261 · Bread, gluten free
    'sandwich_loaf_wholemeal',                -- 262 · Sandwich loaf, wholemeal
    'brown_bread_french_bread',               -- 265 · Brown bread, French bread (baguette or ball), with flour type 80 or 110
    'bread_french_bread_ball',                -- 266 · Bread, French bread, ball, 400g
    'bread_french_bread_multigrain',          -- 269 · Bread, French bread, (baguette or ball), multigrain, from bakery
    'sandwich_loaf_crust_less',               -- 271 · Sandwich loaf, crust less, prepacked
    'panini_bread',                           -- 272 · Panini bread
    'sandwich_loaf_multigrain',               -- 274 · Sandwich loaf, multigrain
    'bread',                                  -- 276 · Bread (average)
    'sandwich_loaf',                          -- 278 · Sandwich loaf
    'sandwich_loaf_bran_grain',               -- 278 · Sandwich loaf, bran grain
    'bread_french_bread_salt',                -- 279 · Bread, French bread, without salt
    'rolls_hamburger_hotdog_wholemeal',       -- 285 · Rolls for hamburger/hotdog (buns), wholemeal, prepacked
    'bread_french_bread_baguette',            -- 287 · Bread, French bread, baguette
    'rolls_hamburger_hotdog',                 -- 293 · Rolls for hamburger/hotdog (buns), prepacked
    'brioche_sandwich_bread',                 -- 309 · Brioche sandwich bread, prepacked
    'corn_tortilla_wrap_be',                  -- 313 · Corn tortilla wrap, to be filled
    'wheat_tortilla_wrap_be',                 -- 327 · Wheat tortilla wrap, to be filled
    'bretzel',                                -- 330 · Bretzel
    'breadcrumbs',                            -- 374 · Breadcrumbs
    'croutons_spreads',                       -- 374 · Croutons, for spreads
    'puffed_rice_textured_bread',             -- 385 · Puffed rice textured bread, wholemeal
    'rusk_wholemeal_rich_fibre',              -- 393 · Rusk, wholemeal or rich in fibre
    'puffed_cereals_textured_bread',          -- 394 · Puffed cereals textured bread
    'swedish_toast_linseeds',                 -- 396 · Swedish toast, with linseeds
    'rusk_multigrain',                        -- 398 · Rusk, multigrain
    'wheat_swedish_toast_wholemeal',          -- 398 · Wheat swedish toast, wholemeal
    'swedish_toast_fruits',                   -- 401 · Swedish toast, with fruits
    'wheat_swedish_toast',                    -- 402 · Wheat swedish toast
    'rusk_slice_wheat',                       -- 404 · Rusk, slice, wheat
    'rusk',                                   -- 409 · Rusk
    'rusk_w_eggs',                            -- 417 · Rusk, w eggs
    'rusk_eggs',                              -- 419 · Rusk with eggs, sliced, prepacked
    'rusk_slice_multigrain',                  -- 419 · Rusk , slice, multigrain
    'grissini_bread_stick',                   -- 433 · Grissini or bread stick
    'wheat_crackers',                         -- 450 · Wheat crackers
    'crouton_garlic_herbs_onions',            -- 492 · Crouton with garlic, herbs or onions, prepacked
    'croutons'                                -- 495 · Croutons, plain, prepacked
);

-- ---------------------------------------------------------------------------
-- ⓒ LES GARDES DE SORTIE
-- ---------------------------------------------------------------------------

do $$
declare
  manquant text;
  n integer;
  distribution text;
begin
  -- ① les 57 lignes decidees sont `neutral`
  select string_agg(v.slug, ', ') into manquant
  from (values
    ('black_white_pudding_sauteed',         'meat_shrinks'),  -- 246 · Black or white pudding (blood sausage), sautéed (average)
    ('bread_flour_bread_preparation',       'grain_absorbs'),  -- 256 · Bread, home-made, with flour for home-made bread preparation
    ('carrots_puree',                       'veg_shrinks'),  -- 31.5 · Carrots, puree
    ('carrots_puree_cream',                 'veg_shrinks'),  -- 44.4 · Carrots, puree with cream
    ('country_style_bread',                 'grain_absorbs'),  -- 240 · Country-style bread, home-made (with flour for bread making machine)
    ('mashed_potatoes',                     'veg_shrinks'),  -- 91.8 · Mashed potatoes (average)
    ('noodles',                             'grain_absorbs'),  -- 104.0 · Noodles
    ('potato_puree_flakes_reconstituted',   'veg_shrinks'),  -- 97.9 · Potato puree, made from flakes, reconstituted with whole milk, with added fat
    ('potato_puree_milk_butter',            'veg_shrinks'),  -- 88.8 · Potato puree, with milk and butter, unsalted
    ('toasted_bread',                       'grain_absorbs'),  -- 317 · Toasted bread, home-made
    ('vegetables_mashed',                   'veg_shrinks'),  -- 61.8 · Vegetables (3-4 types), mashed
    ('english_muffin_wholewheat_flour',     'grain_absorbs'),  -- 217 · English muffin, wholewheat flour, prepacked
    ('english_muffin',                      'grain_absorbs'),  -- 228 · English muffin, prepacked
    ('bread_wholemeal_integral_bread',      'grain_absorbs'),  -- 244 · Bread, wholemeal or integral bread (made with flour type 150)
    ('bran_grain_bread',                    'grain_absorbs'),  -- 249 · Bran grain bread
    ('country_style_bread_french',          'grain_absorbs'),  -- 253 · Country-style bread, French bread (baguette or ball)
    ('brear_t55_t110_flour',                'grain_absorbs'),  -- 257 · Brear (baguette or ball), made with type T55-T110 flour
    ('rye_bread_wheat',                     'grain_absorbs'),  -- 260 · Rye bread, and wheat
    ('bread_french_bread_yeast',            'grain_absorbs'),  -- 261 · Bread, French bread (baguette or ball), with yeast
    ('bread_gluten_free',                   'grain_absorbs'),  -- 261 · Bread, gluten free
    ('sandwich_loaf_wholemeal',             'grain_absorbs'),  -- 262 · Sandwich loaf, wholemeal
    ('brown_bread_french_bread',            'grain_absorbs'),  -- 265 · Brown bread, French bread (baguette or ball), with flour type 80 or 110
    ('bread_french_bread_ball',             'grain_absorbs'),  -- 266 · Bread, French bread, ball, 400g
    ('bread_french_bread_multigrain',       'grain_absorbs'),  -- 269 · Bread, French bread, (baguette or ball), multigrain, from bakery
    ('sandwich_loaf_crust_less',            'grain_absorbs'),  -- 271 · Sandwich loaf, crust less, prepacked
    ('panini_bread',                        'grain_absorbs'),  -- 272 · Panini bread
    ('sandwich_loaf_multigrain',            'grain_absorbs'),  -- 274 · Sandwich loaf, multigrain
    ('bread',                               'grain_absorbs'),  -- 276 · Bread (average)
    ('sandwich_loaf',                       'grain_absorbs'),  -- 278 · Sandwich loaf
    ('sandwich_loaf_bran_grain',            'grain_absorbs'),  -- 278 · Sandwich loaf, bran grain
    ('bread_french_bread_salt',             'grain_absorbs'),  -- 279 · Bread, French bread, without salt
    ('rolls_hamburger_hotdog_wholemeal',    'grain_absorbs'),  -- 285 · Rolls for hamburger/hotdog (buns), wholemeal, prepacked
    ('bread_french_bread_baguette',         'grain_absorbs'),  -- 287 · Bread, French bread, baguette
    ('rolls_hamburger_hotdog',              'grain_absorbs'),  -- 293 · Rolls for hamburger/hotdog (buns), prepacked
    ('brioche_sandwich_bread',              'grain_absorbs'),  -- 309 · Brioche sandwich bread, prepacked
    ('corn_tortilla_wrap_be',               'grain_absorbs'),  -- 313 · Corn tortilla wrap, to be filled
    ('wheat_tortilla_wrap_be',              'grain_absorbs'),  -- 327 · Wheat tortilla wrap, to be filled
    ('bretzel',                             'grain_absorbs'),  -- 330 · Bretzel
    ('breadcrumbs',                         'grain_absorbs'),  -- 374 · Breadcrumbs
    ('croutons_spreads',                    'grain_absorbs'),  -- 374 · Croutons, for spreads
    ('puffed_rice_textured_bread',          'grain_absorbs'),  -- 385 · Puffed rice textured bread, wholemeal
    ('rusk_wholemeal_rich_fibre',           'grain_absorbs'),  -- 393 · Rusk, wholemeal or rich in fibre
    ('puffed_cereals_textured_bread',       'grain_absorbs'),  -- 394 · Puffed cereals textured bread
    ('swedish_toast_linseeds',              'grain_absorbs'),  -- 396 · Swedish toast, with linseeds
    ('rusk_multigrain',                     'grain_absorbs'),  -- 398 · Rusk, multigrain
    ('wheat_swedish_toast_wholemeal',       'grain_absorbs'),  -- 398 · Wheat swedish toast, wholemeal
    ('swedish_toast_fruits',                'grain_absorbs'),  -- 401 · Swedish toast, with fruits
    ('wheat_swedish_toast',                 'grain_absorbs'),  -- 402 · Wheat swedish toast
    ('rusk_slice_wheat',                    'grain_absorbs'),  -- 404 · Rusk, slice, wheat
    ('rusk',                                'grain_absorbs'),  -- 409 · Rusk
    ('rusk_w_eggs',                         'grain_absorbs'),  -- 417 · Rusk, w eggs
    ('rusk_eggs',                           'grain_absorbs'),  -- 419 · Rusk with eggs, sliced, prepacked
    ('rusk_slice_multigrain',               'grain_absorbs'),  -- 419 · Rusk , slice, multigrain
    ('grissini_bread_stick',                'grain_absorbs'),  -- 433 · Grissini or bread stick
    ('wheat_crackers',                      'grain_absorbs'),  -- 450 · Wheat crackers
    ('crouton_garlic_herbs_onions',         'grain_absorbs'),  -- 492 · Crouton with garlic, herbs or onions, prepacked
    ('croutons',                            'grain_absorbs')  -- 495 · Croutons, plain, prepacked
  ) as v(slug, attendu)
  join public.food_composition_refs r on r.slug = v.slug
  where r.yield_class <> 'neutral';

  if manquant is not null then
    raise exception 'L-C: encore non neutre apres migration: %', manquant;
  end if;

  -- ② ⛔ LA CONTRE-EPREUVE: les quinze SECHES n'ont PAS bouge. Si le lot les
  -- emportait « par symetrie », 200 g de riz cuit se compteraient 704 kcal au
  -- lieu de 271 — l'erreur exactement inverse, et invisible.
  select string_agg(v.slug || ' (base=' || r.yield_class || ')', ', ') into manquant
  from (values
    ('lentils_dry',                         'legume_absorbs'),  -- 331.3 · Lentils (dry)
    ('white_pasta',                         'grain_absorbs'),  -- 336.0 · Pasta
    ('couscous_wholemeal',                  'grain_absorbs'),  -- 345 · Wholemeal couscous
    ('barley',                              'grain_absorbs'),  -- 346.0 · Barley
    ('bulgur_wheat',                        'grain_absorbs'),  -- 347 · Bulgur wheat
    ('brown_rice',                          'grain_absorbs'),  -- 350.0 · Brown rice
    ('noodles_wholewheat',                  'grain_absorbs'),  -- 350 · Wholewheat noodles
    ('polenta',                             'grain_absorbs'),  -- 350.0 · Polenta
    ('bulgur',                              'grain_absorbs'),  -- 351.0 · Bulgur
    ('chickpeas_dry',                       'legume_absorbs'),  -- 351.2 · Chickpeas (dry)
    ('couscous',                            'grain_absorbs'),  -- 352.0 · Couscous
    ('white_rice',                          'grain_absorbs'),  -- 352.0 · White rice
    ('wholewheat_pasta',                    'grain_absorbs'),  -- 353.0 · Wholewheat pasta
    ('buckwheat',                           'grain_absorbs'),  -- 356.0 · Buckwheat
    ('quinoa',                              'grain_absorbs')  -- 358.0 · Quinoa
  ) as v(slug, attendu)
  join public.food_composition_refs r on r.slug = v.slug
  where r.yield_class <> v.attendu;

  if manquant is not null then
    raise exception 'L-C: une cereale ou legumineuse SECHE a ete emportee: %', manquant;
  end if;

  -- ③ la distribution finale des six classes, exacte. Elle attrape toute
  -- ligne qu'un `where` trop large aurait emportee — le mode d'echec d'un
  -- `update` en masse est de toucher UNE ligne de trop, jamais zero.
  select string_agg(yield_class || '=' || c, ' ' order by yield_class)
    into distribution
  from (select yield_class, count(*) c from public.food_composition_refs group by 1) t;

  if distribution <> 'fish_shrinks=13 grain_absorbs=13 legume_absorbs=2 meat_shrinks=289 neutral=528 veg_shrinks=78' then
    raise exception 'L-C: distribution finale inattendue: %', distribution;
  end if;

  -- ④ LE SEUIL ① DE LA FICHE, EN BASE: plus aucune ligne a libelle cuit n'est
  -- non neutre. Le regex est le MEME que celui du script, recopie ici a
  -- dessein: si les deux divergeaient un jour, l'un des deux rougirait.
  select count(*) into n
    from public.food_composition_refs
   where yield_class <> 'neutral'
     and label ~* '(braised|boiled|cooked|grilled|pan-fried|deep-fried|fried|roasted|baked|saut(e|é)ed|reheated|steamed|toasted|pur(e|é)e|mashed|rehydrated|infused)';

  if n <> 0 then
    raise exception 'L-C: % ligne(s) a libelle cuit encore non neutre(s)', n;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- ⑥ CE QUI N'EST PAS TOUCHE, ET POURQUOI
--    ⛔ LA MOITIE QUI SE PERD SI ON NE L'ECRIT PAS
-- ---------------------------------------------------------------------------
--
--   `energy_kcal` et les macros
--       ⛔ AUCUNE VALEUR NUTRITIONNELLE. Re-baser les 134 lignes de classe A
--       en « pour 100 g crus » les rendrait justes sur un `state: "raw"` —
--       mais il faudrait multiplier 134 × 5 colonnes par un facteur GENERIQUE
--       sur des lignes dont 185/206 n'ont pas de `ciqual_code`. Le defaut
--       residuel est nomme et compte (fiche `L-C-a`), pas maquille.
--
--   la charcuterie en `meat_shrinks` (salami, rillettes, pates, jambons secs,
--   mortadelle, coppa...) ⚠️ MEME DEFAUT, AUTRE POPULATION: 290 lignes en
--       `meat_shrinks`, dont 119 ne disent PAS « raw » dans leur libelle. Un
--       saucisson ne retrecit jamais dans l'assiette. Les toucher demande la
--       meme lecture une par une, et le plan impose une seule migration de
--       referentiel a la fois. Fiche `L-C-b`.
--
--   les legumes MANGES CRUS en `veg_shrinks` (laitue, concombre, tomate,
--   avocat, champignons) ⚠️ 84 lignes, dont 37 ne disent pas « raw ». Ils sont
--       gates derriere un `state` qu'une salade ne portera jamais. Fiche
--       `L-C-b`.
--
--   `potato_flakes` · `potato_flakes_milk_cream` · `shiitake_mushroom` (seche)
--   · `tapioca` ⚠️ en `veg_shrinks` alors qu'ils REHYDRATENT: le facteur y est
--       faux dans l'autre sens (0,9 au lieu de > 1). Aucun facteur defendable
--       ne sort d'une lecture de libelle. Fiche `L-C-b`.
--
--   `potato_crisps_*` · `rostis_potatoes_cake` · `tomato_oil` — produits finis
--       en `veg_shrinks`, hors du classement du lot 30. Fiche `L-C-b`.
--
--   `noodles_wholewheat` (350 kcal, SEC) reste `grain_absorbs` alors que
--       `noodles` (104, CUIT) devient `neutral`. Chacune est juste chez elle;
--       le couple reste un piege de NOMMAGE, et il appartient a `L19c`.
-- ---------------------------------------------------------------------------

commit;
