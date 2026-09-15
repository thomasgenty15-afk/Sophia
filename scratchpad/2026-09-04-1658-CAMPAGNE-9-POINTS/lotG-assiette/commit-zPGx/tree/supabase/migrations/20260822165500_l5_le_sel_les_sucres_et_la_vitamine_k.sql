-- ============================================================================
-- L5 — LE SEL, LES SUCRES ET LA VITAMINE K.
--
-- Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `L5`.
-- Mesure AVANT / APRÈS: `scripts/keel_l5_sel_sucres_vitamine_k_20260822.sh`.
-- Sortie AVANT archivée: `scratchpad/2026-08-22-L5-AVANT.txt` (16:49 CEST).
--
-- ⛔ CE QUE CETTE MIGRATION TOUCHE, ET RIEN D'AUTRE
-- ------------------------------------------------
-- QUATRE colonnes NEUVES sur `food_composition_refs`: `sodium_mg`,
-- `sugars_g`, `vitamin_k_ug`, et `micronutrient_source` qui porte leur
-- provenance. Elle écrit sur 226 lignes NOMMÉES une par une. Ni `energy_kcal`,
-- ni les macros, ni `yield_class`, ni `unit_grams`, ni `condiment_grams`, ni
-- un alias, ni une table neuve.
--
-- C'est une contrainte de PLAN et pas une pudeur: `L19b` (alias), `L-1`
-- (`unit_grams` + `unit_grams_source`) et `L-C` (`yield_class`, 57 lignes) ont
-- touché la MÊME table aujourd'hui, et le plan impose une seule migration de
-- référentiel à la fois. Ce fichier arrive quatrième et ne démêle rien.
--
-- ⛔ POURQUOI CE LOT — LE SEL EST LE SEUL NUTRIMENT OÙ LE PRODUIT FAIT
--    ACTIVEMENT DU MAL SANS LE VOIR
-- --------------------------------------------------------------------------
-- 9-10 g de sel par jour en France contre moins de 5 recommandés, et
-- `sodium_mg` n'existait même pas au référentiel. Un plan pouvait empiler
-- bouillon cube, feta, sauce soja et pain sans qu'aucun compteur ne bouge.
--
-- Et `vitamin_k_ug` n'est PAS optionnel. À masse constante, changer d'espèce
-- fait varier la K de DEUX ORDRES DE GRANDEUR — épinard 483 µg/100 g, kale
-- 705, courgette 5. Donc « varier les légumes » défait la garde warfarine
-- SANS CHANGER UN SEUL GRAMME. Les lots `L9bis` et `L38` poussent précisément
-- le volume végétal: sans cette colonne, ils déstabiliseraient un INR en
-- silence, et le produit n'aurait aucun moyen de le voir.
--
-- ⛔ L'ERREUR DE CATÉGORIE QUE CE FICHIER NE COMMET PAS
-- ----------------------------------------------------
-- `sodium_mg` est une valeur à MAXIMUM, PAS UN BESOIN. On ne dit JAMAIS
-- « vous êtes en dessous de votre besoin en sel ». La garde est structurelle
-- et vit dans `supabase/functions/_shared/keel/sodium_and_vitamin_k.ts`:
-- `SODIUM_VERDICTS` a exactement TROIS membres — `unknown`, `within`,
-- `above` — et `sodiumVerdict(0)` rend `within`. Il n'existe pas de `below`,
-- et le test asserte la LISTE, ce qui est la seule façon connue de ce dépôt
-- de tenir une absence.
--
-- ⚠️ La même erreur guette la vitamine D et la B12: ce sont des AS (apports
-- satisfaisants), ni RNP ni BNM — voir la porte G6. Cette migration ne les
-- porte pas; elle porte la forme qu'elles devront prendre.
--
-- ⛔ D'OÙ VIENNENT LES VALEURS, ET CE QU'ON NE PEUT PAS VÉRIFIER (lot `O9`)
-- -----------------------------------------------------------------------
-- Chaque ligne porte sa source dans `micronutrient_source`, sur le modèle de
-- `unit_grams_source` posé par `L-1` ce matin, et un CHECK interdit une valeur
-- sans source. Cinq familles, et ELLES NE SE VALENT PAS:
--
--   `interne:<slug>`  la valeur est recopiée d'une AUTRE ligne de CE
--                     référentiel pour le même objet. ⇒ SEULE FAMILLE
--                     RE-VÉRIFIABLE DEPUIS CE DÉPÔT, par un `select`.
--   `ciqual2020:<code>` la ligne porte un `ciqual_code` et la valeur est celle
--                     de la table ANSES CIQUAL 2020 pour ce code.
--   `ciqual2020:libelle` la ligne NE PORTE PAS de code: la valeur a été lue par
--                     NOM. Plus faible que la précédente, et dit comme tel.
--   `usda:<fdc>`      USDA FoodData Central, là où la vitamine K1 d'une épice
--                     séchée ou d'une herbe n'est pas publiée par CIQUAL.
--   `convention:<motif>` un MÉLANGE ou un produit non défini (herbes séchées,
--                     graines mélangées, sauce pimentée). La dérivation est
--                     écrite ligne par ligne plus bas, et la masse
--                     conventionnelle du condiment (0,2 à 5 g) BORNE l'erreur.
--   `nul:<motif>`     un zéro DÉFENDU, avec sa raison (le chlorure de sodium
--                     pur ne porte ni sucre ni vitamine K; l'eau non plus).
--
-- ⛔ CE QUE ÇA NE FAIT PAS, ET IL FAUT LE LIRE:
--    **689 des 923 lignes du référentiel se déclarent `ciqual` SANS
--    `ciqual_code`** (mesuré ci-dessus, 2026-08-22 16:49). Pour elles,
--    relire une valeur contre la table ANSES est IMPOSSIBLE depuis ce dépôt —
--    la table n'y est pas, et les fichiers d'import de `build_ciqual_migration.py`
--    (`/tmp/ciqual.xls`) n'existent plus. C'est le trou du lot `O9`. Ce
--    fichier NE LE CONTOURNE PAS: il le nomme, et `micronutrient_source` dit
--    pour chaque ligne d'où sa valeur vient RÉELLEMENT, y compris quand cette
--    provenance est faible.
--
--    Sur les 199 aliments que les plans ATTEIGNENT, 28 seulement sont dans ce
--    cas — la population atteinte est bien mieux tracée que le référentiel
--    entier.
--
-- ⛔ UNE ANOMALIE TROUVÉE EN CHEMIN, ÉCRITE ICI POUR QU'ELLE NE SE PERDE PAS
-- -------------------------------------------------------------------------
-- `pear` et `leek` portent le MÊME `ciqual_code` 20039. 20039 est le poireau.
-- ⇒ le code de `pear` est FAUX, et une vérification automatique contre CIQUAL
-- lui donnerait les valeurs du poireau. Les deux lignes sont donc sourcées
-- `ciqual2020:libelle` ici, JAMAIS par le code. C'est du ressort de `O9`/`L19c`;
-- cette migration ne corrige pas le code, elle refuse de s'y fier.
--
-- ⛔ LA DIRECTION DE L'ERREUR EST CHOISIE, ET ELLE N'EST PAS CELLE DE `L-1`
-- ------------------------------------------------------------------------
-- `L-1` a fixé « en cas d'ambiguïté, la LECTURE BASSE » pour `unit_grams`:
-- une masse surestimée fait peser au lieu de s'abstenir. Pour `vitamin_k_ug`
-- la direction est INVERSE, et c'est délibéré: une K sous-estimée rend
-- INVISIBLE le balancement d'une espèce à l'autre — exactement le mal que
-- cette colonne existe pour voir. ⇒ en cas d'ambiguïté sur la K, LECTURE
-- HAUTE. Trois lignes en dépendent et sont nommées: `romanesco…` (lue comme
-- un brocoli cuit et non comme un chou-fleur), `chicory` (lue comme une
-- chicorée à feuilles et non comme un endive belge), `mixed_leaves`.
-- Pour `sodium_mg` la lecture basse est gardée (`chilli_powder`: piment moulu
-- pur à 30 mg, et non un mélange salé à 1 640 mg) — un plafond franchi à tort
-- est un faux positif qui coûte la confiance, et à 0,5 g de masse
-- conventionnelle l'écart vaut 8 mg.
--
-- ⚠️ CE QUE CES VALEURS SONT, ET CE QU'ELLES NE SONT PAS
-- -----------------------------------------------------
-- Ce sont des ORDRES DE GRANDEUR de table de composition, pas des mesures de
-- cette assiette-là. La variabilité naturelle d'un aliment (variété, saison,
-- cuisson) est de l'ordre de ±20 %. C'est SUFFISANT pour ce que le produit
-- doit voir — 5 contre 483 µg de K, 3 contre 19 000 mg de sodium — et
-- INSUFFISANT pour être présenté comme une mesure. Aucun écran ne doit rendre
-- ces nombres avec une décimale de plus qu'ils n'en portent.
--
-- ⚠️ LA BASE DES 100 g EST CELLE DE `energy_kcal` SUR LA MÊME LIGNE
-- ----------------------------------------------------------------
-- `nutrientsOf` multiplie `gramsRaw` par `energy_kcal / 100`. Les trois
-- colonnes suivent EXACTEMENT la même base, ligne par ligne: une ligne dont
-- l'énergie est celle du produit SEC porte des valeurs SÈCHES
-- (`lentils_dry`), une ligne dont l'énergie est celle du produit CUIT porte
-- des valeurs CUITES (`lentils_cooked`, `spinach_water`). Mélanger les deux
-- ferait un facteur 3 sur une légumineuse, et c'est la cicatrice de `L-C`.
--
-- ⛔ CES COLONNES N'ONT AUCUN LECTEUR D'EXÉCUTION AUJOURD'HUI — fiche `L5-b`
-- -------------------------------------------------------------------------
-- `loadCompositionIndex` ne les charge pas et `CompositionRef` ne les porte
-- pas. C'est DÉLIBÉRÉ: `food_composition.ts` est un fichier modifié de +404
-- lignes appartenant au lot `L19b`, et y ajouter trois champs REQUIS ferait
-- rougir tous les constructeurs de test du dépôt, dans des fichiers que ce lot
-- n'a pas le droit de commiter. Le branchement appartient à `L9bis` / `L38`,
-- qui sont les lots qui en ont besoin. La fiche `L5-b` porte ce fait pour que
-- personne ne le redécouvre en croyant à une colonne vivante.
--
-- REJOUABLE: `add column if not exists`, puis des `update` à valeur littérale
-- gardés par `micronutrient_source is null`.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- ① LES QUATRE COLONNES
-- ---------------------------------------------------------------------------

alter table public.food_composition_refs
  add column if not exists sodium_mg numeric,
  add column if not exists sugars_g numeric,
  add column if not exists vitamin_k_ug numeric,
  add column if not exists micronutrient_source text;

comment on column public.food_composition_refs.sodium_mg is
  'Sodium en mg pour 100 g, MÊME BASE que energy_kcal sur cette ligne. ⛔ VALEUR À MAXIMUM, PAS UN BESOIN: rien ne doit pouvoir formuler « il en manque » (voir _shared/keel/sodium_and_vitamin_k.ts, SODIUM_VERDICTS n''a pas de « below »).';
comment on column public.food_composition_refs.sugars_g is
  'Sucres TOTAUX en g pour 100 g, même base que energy_kcal. ⚠️ Ce ne sont PAS les sucres LIBRES: le sucre du fruit entier et du lait y sont comptés, et la recommandation « moins de 10 % de l''énergie » porte sur les sucres libres. Cette colonne ne peut donc pas répondre à cette question-là, et aucun compteur ne doit prétendre le contraire.';
comment on column public.food_composition_refs.vitamin_k_ug is
  'Vitamine K1 (phylloquinone) en µg pour 100 g, même base que energy_kcal. ⛔ Sert la STABILITÉ sous antivitamine K, jamais un niveau à atteindre: un plan qui pousse la K vers le bas est aussi faux qu''une garde absente.';
comment on column public.food_composition_refs.micronutrient_source is
  'La provenance des trois colonnes ci-dessus, UNE par ligne parce que les trois valeurs viennent de la même ligne de table. Familles: interne: (seule re-vérifiable ici, par select) · ciqual2020:<code> · ciqual2020:libelle · usda:<fdc> · convention:<motif> · nul:<motif>.';

-- ⛔ AUCUNE DES TROIS N'EST NÉGATIVE. Un sodium négatif est un bug qui se lit
-- comme une valeur.
alter table public.food_composition_refs
  drop constraint if exists food_composition_refs_sodium_mg_check;
alter table public.food_composition_refs
  add constraint food_composition_refs_sodium_mg_check
  check (sodium_mg is null or sodium_mg >= 0);

alter table public.food_composition_refs
  drop constraint if exists food_composition_refs_sugars_g_check;
alter table public.food_composition_refs
  add constraint food_composition_refs_sugars_g_check
  check (sugars_g is null or (sugars_g >= 0 and sugars_g <= 100));

alter table public.food_composition_refs
  drop constraint if exists food_composition_refs_vitamin_k_ug_check;
alter table public.food_composition_refs
  add constraint food_composition_refs_vitamin_k_ug_check
  check (vitamin_k_ug is null or vitamin_k_ug >= 0);

-- ⛔ UNE VALEUR SANS SOURCE EST INTERDITE — c'est la forme de
-- `food_composition_refs_unit_grams_is_sourced_check`, posée par `L-1` ce
-- matin pour exactement cette raison: un nombre sans provenance est
-- indiscernable d'un nombre inventé six mois plus tard, et ce référentiel a
-- déjà payé « 450 g venait de "one plate's worth" ».
alter table public.food_composition_refs
  drop constraint if exists food_composition_refs_micronutrient_is_sourced_check;
alter table public.food_composition_refs
  add constraint food_composition_refs_micronutrient_is_sourced_check
  check (
    (sodium_mg is null and sugars_g is null and vitamin_k_ug is null)
    or micronutrient_source is not null
  );

-- ⛔ LA SOURCE APPARTIENT À UNE FAMILLE FERMÉE. Une septième famille inventée
-- en passant rendrait la colonne aussi muette que son absence.
alter table public.food_composition_refs
  drop constraint if exists food_composition_refs_micronutrient_source_family_check;
alter table public.food_composition_refs
  add constraint food_composition_refs_micronutrient_source_family_check
  check (
    micronutrient_source is null
    or micronutrient_source ~ '^(interne|ciqual2020|usda|convention|nul):[a-z0-9_\/]+$'
  );

-- ---------------------------------------------------------------------------
-- ② LES 199 ALIMENTS QUE LES PLANS ATTEIGNENT
--
-- La liste vient de la mesure, pas d'une intuition:
-- `bash scripts/keel_l5_sel_sucres_vitamine_k_20260822.sh --complet`, section
-- ④, exécutée le 2026-08-22 à 16:49 CEST sur 193 plans. 199 slugs, comptés
-- par le résolveur de production APRÈS pliage des préparations.
--
-- ⚠️ Le seuil de la fiche porte sur CETTE population — « couverture des trois
-- colonnes sur les aliments réellement atteints ≥ 90 % » — et il est mesuré
-- sur DEUX dénominateurs (corpus entier / population vivante), §⑨ n° 50.
-- ---------------------------------------------------------------------------

update public.food_composition_refs r
set sodium_mg = v.sodium_mg,
    sugars_g = v.sugars_g,
    vitamin_k_ug = v.vitamin_k_ug,
    micronutrient_source = v.src
from (values
  ('olive_oil',                                        0.6,     0.0,     60.2, 'ciqual2020:17270'),
  ('salt',                                           38758,     0.0,      0.0, 'nul:chlorure_de_sodium_pur'),
  ('lemon',                                              3,     2.5,      0.0, 'ciqual2020:13009'),
  ('courgette',                                          4,     2.0,      5.0, 'ciqual2020:20020'),
  ('black_pepper',                                      20,     0.6,    163.7, 'usda:02030'),
  ('tomato',                                             5,     2.6,      7.9, 'ciqual2020:20047'),
  ('bell_pepper',                                        3,     3.9,      4.9, 'ciqual2020:20085'),
  ('paprika',                                           34,    10.3,     80.3, 'usda:02028'),
  ('onion',                                              3,     4.5,      0.4, 'ciqual2020:20034'),
  ('water',                                              5,     0.0,      0.0, 'nul:eau'),
  ('garlic',                                            17,     1.0,      1.7, 'ciqual2020:11000'),
  ('chicken_thigh',                                     84,     0.0,      2.4, 'ciqual2020:36024'),
  ('red_onion',                                          3,     4.5,      0.4, 'interne:onion'),
  ('cucumber',                                           3,     1.7,     16.4, 'ciqual2020:20210'),
  ('oats',                                               5,     1.0,      2.0, 'ciqual2020:9311'),
  ('cumin',                                            168,     2.3,      5.4, 'usda:02014'),
  ('white_rice',                                         2,     0.1,      0.1, 'ciqual2020:9100'),
  ('potato',                                             6,     0.9,      2.0, 'ciqual2020:4023'),
  ('greek_yogurt',                                      45,     4.0,      0.3, 'ciqual2020:19860'),
  ('tinned_tomatoes',                                   90,     3.0,      3.0, 'ciqual2020:20048'),
  ('spinach',                                           65,     0.4,    482.9, 'ciqual2020:20059'),
  ('wholemeal_bread',                                  480,     2.5,      4.0, 'ciqual2020:7111'),
  ('lentils_dry',                                        6,     2.0,      5.0, 'ciqual2020:20504'),
  ('herbs_parsley',                                     33,     0.9,   1640.0, 'usda:11297'),
  ('couscous',                                           6,     0.6,      0.1, 'ciqual2020:9610'),
  ('whole_eggs',                                       130,     0.4,      0.3, 'ciqual2020:22000'),
  ('dried_herbs',                                       40,     2.0,    600.0, 'convention:melange_herbes_sechees'),
  ('chickpeas_tinned',                                 240,     0.8,      4.0, 'ciqual2020:20532'),
  ('aubergine',                                          2,     2.4,      3.5, 'ciqual2020:20053'),
  ('carrot',                                            55,     5.0,     13.2, 'ciqual2020:20009'),
  ('lettuce',                                           10,     0.8,    126.3, 'ciqual2020:20031'),
  ('green_beans',                                        3,     1.6,     43.0, 'ciqual2020:20061'),
  ('herbs_thyme',                                       55,     1.7,   1714.5, 'usda:02042'),
  ('peach',                                              2,     8.0,      2.6, 'ciqual2020:13195'),
  ('plain_yogurt',                                      50,     4.5,      0.2, 'ciqual2020:libelle'),
  ('tofu',                                               8,     0.6,      2.4, 'ciqual2020:20912'),
  ('honey',                                              4,    80.0,      0.0, 'ciqual2020:31008'),
  ('butter',                                            11,     0.6,      7.0, 'ciqual2020:16400'),
  ('quinoa',                                             5,     1.6,      1.1, 'ciqual2020:9340'),
  ('white_beans',                                        5,     0.4,      3.9, 'ciqual2020:20511'),
  ('chilli_powder',                                     30,     7.2,     80.3, 'convention:piment_moulu_pur'),
  ('tuna_tinned',                                      320,     0.0,      0.4, 'ciqual2020:26039'),
  ('stock_cube',                                     19000,     2.0,      1.0, 'ciqual2020:11001'),
  ('salmon',                                            60,     0.0,      0.5, 'ciqual2020:26036'),
  ('bread',                                            490,     3.0,      1.0, 'ciqual2020:libelle'),
  ('mixed_berries',                                      2,     6.0,     15.0, 'convention:melange_baies'),
  ('feta',                                            1120,     1.0,      1.8, 'ciqual2020:12066'),
  ('herbs_mint',                                        31,     0.0,    200.0, 'convention:herbe_verte_fraiche'),
  ('vegetable_stock',                                  120,     0.3,      0.5, 'convention:bouillon_liquide_reduit_en_sel'),
  ('mixed_vegetables',                                  25,     3.0,     25.0, 'convention:melange_legumes_surgeles'),
  ('white_pasta',                                        6,     2.7,      0.1, 'ciqual2020:9810'),
  ('cinnamon',                                          10,     2.2,     31.2, 'usda:02010'),
  ('cooked_rice',                                        2,     0.1,      0.0, 'ciqual2020:9104'),
  ('beef_chuck',                                        60,     0.0,      1.2, 'ciqual2020:libelle'),
  ('lime',                                               2,     1.7,      0.6, 'ciqual2020:13067'),
  ('herbs_basil',                                        4,     0.3,    414.8, 'usda:02044'),
  ('passata',                                           20,     4.5,      5.0, 'ciqual2020:20170'),
  ('tortilla_wrap',                                    570,     2.5,      1.0, 'ciqual2020:libelle'),
  ('couscous_wholemeal',                                 6,     1.0,      0.9, 'ciqual2020:libelle'),
  ('black_beans',                                        5,     0.3,      3.6, 'ciqual2020:libelle'),
  ('pumpkin_seeds',                                      7,     1.3,      7.3, 'usda:12016'),
  ('skyr',                                              40,     4.0,      0.1, 'ciqual2020:libelle'),
  ('sweet_potato',                                      55,     4.2,      1.8, 'ciqual2020:4101'),
  ('spring_onion',                                      16,     2.3,    207.0, 'usda:11291'),
  ('brown_rice',                                         4,     0.7,      1.9, 'ciqual2020:9102'),
  ('egg',                                              130,     0.4,      0.3, 'interne:whole_eggs'),
  ('herbs_dill',                                        61,     0.0,     60.0, 'convention:herbe_verte_fraiche'),
  ('granola',                                           40,    20.0,      2.0, 'ciqual2020:32004'),
  ('almonds',                                            1,     4.4,      0.0, 'ciqual2020:15000'),
  ('celery',                                            80,     1.8,     29.3, 'ciqual2020:20023'),
  ('broccoli',                                          33,     1.7,    102.0, 'ciqual2020:20057'),
  ('walnuts',                                            2,     2.6,      2.7, 'ciqual2020:15023'),
  ('sweetcorn',                                         15,     3.2,      0.3, 'ciqual2020:20066'),
  ('kidney_beans',                                     240,     0.6,      8.4, 'ciqual2020:20524'),
  ('milk_semi',                                         44,     4.8,      0.2, 'ciqual2020:libelle'),
  ('vinegar',                                            5,     0.4,      0.0, 'ciqual2020:11018'),
  ('tomato_puree',                                      60,    12.0,      9.8, 'ciqual2020:20068'),
  ('turkey_mince',                                      70,     0.0,      1.5, 'ciqual2020:36301'),
  ('rocket',                                            27,     2.1,    108.6, 'ciqual2020:20217'),
  ('chicken_breast',                                    65,     0.0,      1.5, 'ciqual2020:36017'),
  ('herbs_coriander',                                   46,     0.9,    310.0, 'usda:11165'),
  ('cottage_cheese',                                   350,     2.6,      0.2, 'ciqual2020:libelle'),
  ('coconut_milk',                                      15,     3.3,      0.1, 'ciqual2020:18041'),
  ('beef_mince',                                        70,     0.0,      1.5, 'ciqual2020:6250'),
  ('avocado',                                            7,     0.7,     21.0, 'ciqual2020:13004'),
  ('soy_sauce',                                       5500,     1.7,      0.0, 'ciqual2020:11104'),
  ('curry_paste',                                     2000,     8.0,     15.0, 'convention:pate_de_curry'),
  ('mustard',                                         1900,     3.0,      1.8, 'ciqual2020:11013'),
  ('herbs_bay_leaf',                                    23,     0.0,    400.0, 'convention:feuille_verte_sechee'),
  ('parmesan',                                        1600,     0.0,      1.7, 'ciqual2020:12120'),
  ('corn_tortilla_wrap_be',                             45,     1.2,      0.2, 'ciqual2020:libelle'),
  ('apple',                                              1,    10.4,      2.2, 'ciqual2020:13050'),
  ('hummus',                                           380,     0.3,      8.0, 'ciqual2020:25621'),
  ('breadcrumbs',                                      700,     3.0,      1.0, 'ciqual2020:libelle'),
  ('plum',                                               0,     9.9,      6.4, 'ciqual2020:libelle'),
  ('apricot_pitted',                                     1,     9.2,      3.3, 'ciqual2020:libelle'),
  ('mayonnaise',                                       700,     1.5,    163.0, 'usda:04025'),
  ('cod',                                               75,     0.0,      0.1, 'ciqual2020:26043'),
  ('turmeric',                                          27,     3.2,     13.4, 'usda:02043'),
  ('blueberries',                                        1,     7.3,     19.3, 'ciqual2020:13028'),
  ('wholewheat_pasta',                                   8,     2.7,      1.9, 'ciqual2020:9870'),
  ('melon',                                             16,     8.2,      2.5, 'ciqual2020:13742'),
  ('green_peas',                                         5,     5.7,     24.8, 'ciqual2020:20037'),
  ('lemon_wedge',                                        3,     2.5,      0.0, 'interne:lemon'),
  ('pita_wholemeal',                                   500,     2.0,      2.0, 'ciqual2020:libelle'),
  ('sunflower_seeds',                                    9,     2.6,      0.0, 'ciqual2020:15011'),
  ('lentils_cooked',                                     2,     1.8,      1.7, 'ciqual2020:20505'),
  ('strawberries',                                       1,     4.9,      2.2, 'ciqual2020:13014'),
  ('pear',                                               2,     9.8,      4.4, 'ciqual2020:libelle'),
  ('cheddar',                                          620,     0.1,      2.4, 'ciqual2020:12726'),
  ('jam',                                               20,    60.0,      1.0, 'ciqual2020:31040'),
  ('tortilla_wholemeal',                               550,     2.5,      2.0, 'ciqual2020:libelle'),
  ('turkey_breast',                                     60,     0.0,      1.0, 'ciqual2020:36304'),
  ('toasted_bread',                                    540,     3.3,      1.1, 'ciqual2020:libelle'),
  ('rapeseed_oil',                                       0,     0.0,     71.3, 'ciqual2020:17130'),
  ('banana',                                             1,    15.5,      0.5, 'ciqual2020:13005'),
  ('baked_beans',                                      380,     5.0,      4.0, 'ciqual2020:libelle'),
  ('bulgur',                                            12,     0.4,      1.9, 'ciqual2020:9690'),
  ('prune',                                              2,    38.0,     59.5, 'ciqual2020:libelle'),
  ('herbs_chives',                                       3,     1.9,    212.7, 'usda:11156'),
  ('sesame_oil',                                         0,     0.0,     13.6, 'ciqual2020:17400'),
  ('raisin',                                            11,    59.2,      3.5, 'ciqual2020:libelle'),
  ('pita_bread',                                       520,     1.6,      0.5, 'ciqual2020:libelle'),
  ('raspberries',                                        1,     4.4,      7.8, 'ciqual2020:13015'),
  ('mushroom',                                           5,     1.0,      0.0, 'ciqual2020:20056'),
  ('hot_sauce',                                       1500,     1.5,      5.0, 'convention:sauce_pimentee'),
  ('mixed_seeds',                                       15,     2.0,      3.0, 'convention:melange_graines'),
  ('polenta',                                            7,     0.6,      0.3, 'ciqual2020:9614'),
  ('peanut_butter',                                    430,     6.0,      0.3, 'ciqual2020:15202'),
  ('corn_cake',                                         25,     0.4,      0.1, 'ciqual2020:libelle'),
  ('sausage',                                          800,     1.0,      1.0, 'ciqual2020:30110'),
  ('yoghurt',                                           50,     4.5,      0.2, 'interne:plain_yogurt'),
  ('bulgur_wheat',                                      12,     0.4,      1.9, 'interne:bulgur'),
  ('goat_cheese',                                      800,     1.0,      1.8, 'ciqual2020:21800'),
  ('chickpeas_dry',                                     24,    10.7,      9.0, 'ciqual2020:20516'),
  ('tempeh',                                             9,     2.7,      0.0, 'ciqual2020:20917'),
  ('sunflower_oil',                                      0,     0.0,      5.4, 'ciqual2020:17440'),
  ('celery_stalk',                                      80,     1.8,     29.3, 'interne:celery'),
  ('bread_french_bread_baguette',                      600,     2.6,      0.5, 'ciqual2020:libelle'),
  ('maple_syrup',                                       12,    60.0,      0.0, 'ciqual2020:31034'),
  ('vinaigrette',                                     1300,     3.0,     60.0, 'convention:vinaigrette_a_l_huile'),
  ('beef_steak',                                        55,     0.0,      1.2, 'ciqual2020:6201'),
  ('chia_seeds',                                        16,     0.0,      0.0, 'ciqual2020:15047'),
  ('fig',                                                1,    16.3,      4.7, 'ciqual2020:libelle'),
  ('ham',                                             1100,     0.5,      1.0, 'ciqual2020:28803'),
  ('beef_braising',                                     60,     0.0,      1.2, 'ciqual2020:6270'),
  ('wine',                                               5,     0.6,      0.0, 'ciqual2020:5214'),
  ('fennel',                                            52,     3.9,     62.8, 'ciqual2020:20028'),
  ('poppy_seeds',                                       26,     3.0,      0.0, 'ciqual2020:libelle'),
  ('coconut_yogurt',                                    15,     2.0,      0.1, 'ciqual2020:libelle'),
  ('cauliflower',                                       30,     1.9,     15.5, 'ciqual2020:20016'),
  ('radish',                                            39,     1.9,      1.3, 'ciqual2020:20089'),
  ('red_cabbage',                                       27,     3.8,     38.2, 'ciqual2020:20014'),
  ('pork_chop',                                         55,     0.0,      0.0, 'ciqual2020:28100'),
  ('lamb',                                              70,     0.0,      3.6, 'ciqual2020:21502'),
  ('creme_fraiche',                                     30,     2.8,      3.0, 'ciqual2020:libelle'),
  ('raisins',                                           11,    59.2,      3.5, 'interne:raisin'),
  ('tahini',                                            30,     0.5,      0.0, 'ciqual2020:15203'),
  ('salsa',                                            450,     4.0,      6.0, 'convention:salsa_de_tomate'),
  ('hazelnuts',                                          0,     4.3,     14.2, 'ciqual2020:15004'),
  ('grapes',                                             2,    15.5,     14.6, 'ciqual2020:13112'),
  ('olives',                                          1560,     0.5,      1.4, 'ciqual2020:13186'),
  ('sunflower_seed_butter',                            380,     3.0,      1.5, 'convention:puree_de_graines'),
  ('sweet_pepper_green',                                 3,     2.4,      7.4, 'ciqual2020:libelle'),
  ('beef_stewing_meat',                                 60,     0.0,      1.2, 'interne:beef_braising'),
  ('yellow_onion',                                       3,     4.5,      0.4, 'interne:onion'),
  ('apple_compote',                                      3,    20.0,      1.0, 'ciqual2020:libelle'),
  ('kale',                                              38,     2.3,    704.8, 'ciqual2020:20218'),
  ('sardines',                                         350,     0.0,      2.6, 'ciqual2020:26034'),
  ('pork_loin',                                         50,     0.0,      0.0, 'ciqual2020:28204'),
  ('turkey_ham_slices',                                950,     1.0,      1.0, 'ciqual2020:libelle'),
  ('lamb_shoulder',                                     70,     0.0,      3.6, 'interne:lamb'),
  ('flaxseed',                                          30,     1.6,      4.3, 'ciqual2020:15034'),
  ('fromage_blanc',                                     45,     4.2,      0.3, 'ciqual2020:19646'),
  ('rye_bread',                                        560,     3.0,      1.2, 'ciqual2020:7125'),
  ('leek',                                              20,     3.9,     47.0, 'ciqual2020:libelle'),
  ('mozzarella',                                       400,     1.0,      2.3, 'ciqual2020:19590'),
  ('halloumi',                                        1200,     1.0,      2.0, 'convention:fromage_en_saumure'),
  ('sesame_seeds',                                      11,     0.3,      0.0, 'ciqual2020:15010'),
  ('prawns',                                           250,     0.0,      0.1, 'ciqual2020:10007'),
  ('mixed_nuts',                                         5,     4.0,      5.0, 'convention:melange_fruits_a_coque'),
  ('pak_choi',                                          65,     1.2,     45.5, 'ciqual2020:20167'),
  ('white_bread',                                      490,     3.4,      0.4, 'ciqual2020:7112'),
  ('barley',                                            12,     0.8,      2.2, 'ciqual2020:9321'),
  ('noodles_wholewheat',                                 8,     2.7,      1.9, 'interne:wholewheat_pasta'),
  ('noodles',                                            5,     0.6,      0.1, 'ciqual2020:25183'),
  ('crispbread_rye',                                   450,     1.0,      2.0, 'ciqual2020:libelle'),
  ('tomato_cherry',                                      5,     2.6,      7.9, 'interne:tomato'),
  ('shallot',                                           12,     7.9,      0.8, 'ciqual2020:libelle'),
  ('peanuts',                                           18,     4.7,      0.0, 'ciqual2020:15001'),
  ('pork_filet_mignon',                                 50,     0.0,      0.0, 'interne:pork_loin'),
  ('blackberry',                                         1,     4.9,     19.8, 'ciqual2020:libelle'),
  ('egg_hard',                                         130,     0.4,      0.3, 'interne:whole_eggs'),
  ('pesto',                                            800,     3.0,    100.0, 'convention:pesto_basilic_huile'),
  ('beef_sirloin_steak',                                55,     0.0,      1.2, 'interne:beef_steak'),
  ('orange',                                             0,     8.5,      0.0, 'ciqual2020:13034'),
  ('cherry_pitted',                                      0,    12.8,      2.1, 'ciqual2020:libelle'),
  ('buckwheat',                                          1,     0.0,      7.0, 'ciqual2020:9380'),
  ('mixed_leaves',                                      15,     1.0,    130.0, 'convention:melange_jeunes_pousses')
) as v(slug, sodium_mg, sugars_g, vitamin_k_ug, src)
where r.slug = v.slug
  and r.micronutrient_source is null;

-- ---------------------------------------------------------------------------
-- ③ LES 27 LIGNES QUE LES PLANS N'ATTEIGNENT PAS ENCORE — ET POURQUOI ELLES
--    ENTRENT QUAND MÊME
--
-- ⛔ CE BLOC EST LA MOITIÉ DU LOT QUE LA FICHE NE DEMANDAIT PAS, ET SANS LUI
-- LA LISTE FERMÉE NE FERME RIEN. `L9bis` et `L38` poussent le VOLUME VÉGÉTAL:
-- ils feront entrer dans les plans exactement les espèces que le corpus
-- d'aujourd'hui n'a jamais servies — bette (830 µg/100 g), cresson (250),
-- chou de Bruxelles (177), mâche (140). Une liste « fermée » qui ne couvre que
-- ce qui a DÉJÀ été servi serait ouverte le jour même où ces lots livrent.
--
-- Le périmètre est donc DÉTERMINISTE et pas lexical: les groupes
-- `leafy_greens` et `cruciferous_veg` EN ENTIER (38 lignes, dont 18 déjà au
-- bloc ②), plus les sept lignes voisines qu'un lecteur chercherait au même
-- endroit (asperges, chicorée, poireau cuit, chou chinois, mélange chou-carotte).
-- La garde ③a du script rougit si une ligne de ces deux groupes reste sans K.
-- ---------------------------------------------------------------------------

update public.food_composition_refs r
set sodium_mg = v.sodium_mg,
    sugars_g = v.sugars_g,
    vitamin_k_ug = v.vitamin_k_ug,
    micronutrient_source = v.src
from (values
  ('broccoli_water_crunchy',                            20,     1.4,    141.1, 'ciqual2020:libelle'),
  ('broccoli_water_tender',                             20,     1.4,    141.1, 'ciqual2020:libelle'),
  ('brussels_sprouts',                                  25,     2.2,    177.0, 'ciqual2020:libelle'),
  ('brussels_sprout_water',                             21,     2.2,    140.3, 'ciqual2020:libelle'),
  ('cabbage',                                           18,     3.2,     76.0, 'ciqual2020:libelle'),
  ('green_cabbage_water',                               20,     2.0,    108.7, 'ciqual2020:libelle'),
  ('white_cabbage',                                     18,     3.8,     76.0, 'ciqual2020:libelle'),
  ('white_cabbage_water',                               20,     2.5,     68.0, 'ciqual2020:libelle'),
  ('radish_black',                                      39,     1.9,      1.3, 'interne:radish'),
  ('romanesco_cauliflower_romanesco_broccoli',          20,     2.0,    141.1, 'convention:lecture_haute_brassica_cuit'),
  ('turnip_water',                                      30,     3.0,      0.2, 'ciqual2020:libelle'),
  ('lamb_s_lettuce',                                     4,     0.8,    140.0, 'ciqual2020:libelle'),
  ('lettuce_oak_leaf',                                  10,     0.8,    126.3, 'interne:lettuce'),
  ('lettuce_sucrine',                                   10,     0.8,    126.3, 'interne:lettuce'),
  ('lettuce_var_batavia',                               10,     0.8,    126.3, 'interne:lettuce'),
  ('spinach_water',                                     70,     0.4,    493.6, 'ciqual2020:libelle'),
  ('spinach_young_leaves',                              65,     0.4,    482.9, 'interne:spinach'),
  ('swiss_chard',                                      213,     1.1,    830.0, 'usda:11147'),
  ('swiss_chard_leaf_stalk',                           179,     1.1,    327.3, 'usda:11148'),
  ('watercress',                                        41,     0.2,    250.0, 'ciqual2020:libelle'),
  ('asparagus',                                          2,     1.9,     41.6, 'ciqual2020:libelle'),
  ('asparagus_green_water',                             14,     1.3,     50.6, 'ciqual2020:libelle'),
  ('asparagus_white_water',                             14,     1.3,     30.0, 'convention:asperge_blanche'),
  ('chicory',                                           22,     1.0,    297.6, 'convention:lecture_haute_chicoree'),
  ('chinese_cabbageor_bok_choi',                        65,     1.2,     45.5, 'interne:pak_choi'),
  ('coleslaw_mix',                                      25,     4.0,     70.0, 'convention:melange_chou_carotte'),
  ('leek_water',                                        20,     2.9,     25.9, 'ciqual2020:libelle')
) as v(slug, sodium_mg, sugars_g, vitamin_k_ug, src)
where r.slug = v.slug
  and r.micronutrient_source is null;


-- ---------------------------------------------------------------------------
-- ④ LES 22 LIGNES `convention:` — LEUR DÉRIVATION, UNE PAR UNE
--
-- ⛔ UNE CONVENTION NON ÉCRITE EST UN NOMBRE INVENTÉ. Le dépôt a déjà la
-- forme (`condimentMassFor` est « une CONVENTION avouée »); ce qui la rend
-- tenable, c'est que la dérivation ET la borne de l'erreur soient lisibles.
--
--   dried_herbs            K 600 — ordre de grandeur des herbes séchées
--                          (origan 622, basilic 1715, thym 1714, persil 1360).
--                          Le mélange exact est indéfini. BORNE: masse
--                          conventionnelle 0,5 g ⇒ 3 µg servis, contre une
--                          journée à ~150 µg. Un facteur 3 d'erreur pèse 6 µg.
--   chilli_powder          Na 30 — LECTURE BASSE assumée: « chilli powder »
--                          désigne soit le piment moulu PUR (Na 30) soit un
--                          mélange salé de style tex-mex (Na 1 640). BORNE:
--                          0,5 g ⇒ l'écart entre les deux lectures vaut 8 mg.
--   herbs_mint,            K 200 et 60 — herbes vertes fraîches dont CIQUAL ne
--   herbs_dill             publie pas la K1. Ordre de grandeur pris entre la
--                          ciboulette (213) et le persil (1 640). BORNE: masse
--                          conventionnelle 5 g ⇒ 10 et 3 µg servis.
--   herbs_bay_leaf         K 400 — feuille verte SÉCHÉE. BORNE: 0,2 g ⇒ 0,8 µg.
--   mixed_berries          moyenne fraise/framboise/myrtille/mûre du bloc ②.
--   mixed_vegetables       mélange surgelé (carotte, petit pois, haricot, maïs):
--                          moyenne pondérée à parts égales des quatre lignes.
--   mixed_seeds,           mélanges de graines / fruits à coque: moyenne des
--   mixed_nuts             lignes correspondantes du bloc ②.
--   mixed_leaves           K 130 — mesclun: laitue 126, roquette 109, mâche 140.
--   coleslaw_mix           chou blanc 76 + carotte 13, à parts égales ⇒ 70 (arrondi
--                          par la LECTURE HAUTE de la K, voir l'en-tête).
--   romanesco…             K 141,1 — LECTURE HAUTE: lu comme un brocoli cuit et
--                          non comme un chou-fleur cuit (14). Le romanesco est
--                          botaniquement un chou-fleur; la lecture haute est
--                          choisie parce qu'une K sous-estimée rend le
--                          balancement d'espèce INVISIBLE.
--   chicory                K 297,6 — LECTURE HAUTE: chicorée à FEUILLES et non
--                          endive belge (29). Même raison.
--   asparagus_white_water  K 30 — l'asperge blanche pousse sans lumière et
--                          porte donc moins de K1 que la verte (50,6).
--   vegetable_stock        Na 120 — bouillon LIQUIDE « réduit en sel »: un
--                          bouillon ordinaire est à ~250 mg/100 ml.
--   curry_paste            Na 2 000 — pâte de curry du commerce; la variabilité
--                          entre marques est d'un facteur 2.
--   hot_sauce, salsa       sauces du commerce: sodium dominant, K négligeable.
--   vinaigrette, pesto     K portée par l'HUILE et le basilic, pas par la
--                          recette: colza 71, olive 60, basilic 415.
--   sunflower_seed_butter  purée de graines: sodium ajouté variable.
--   halloumi               fromage EN SAUMURE: Na du même ordre que la feta.
--
-- ⛔ CE QUI N'ENTRE PAS, ET SON MOTIF — une liste de refus muette est une
--    liste qu'on refait
-- ---------------------------------------------------------------------------
-- Les ~697 autres lignes du référentiel restent à `null` sur les quatre
-- colonnes, DÉLIBÉRÉMENT:
--
--   · elles ne sont atteintes par AUCUN plan du corpus (193 plans), et
--   · elles n'appartiennent ni à `leafy_greens` ni à `cruciferous_veg`, donc
--     elles ne portent pas le risque que `L9bis`/`L38` vont réveiller.
--
-- Écrire 697 × 3 valeurs à la main serait inventer à l'échelle, sans qu'aucun
-- compteur ne puisse en voir la fausseté. `null` veut dire « on ne sait pas »,
-- et `sumPer100g` S'ABSTIENT dès qu'une ligne servie est à `null` — donc une
-- journée qui touche un de ces aliments rend `null`, jamais une somme
-- partielle. C'est visible, et c'est la worklist du prochain lot.
--
-- ⛔ CE QUI N'ENTRE PAS NON PLUS, ET C'EST UN REFUS DE PLUS: les colonnes ne
-- sont branchées sur AUCUN lecteur d'exécution (fiche `L5-b`). Poser ici un
-- champ dans `CompositionRef` ferait rougir les constructeurs de test de six
-- sessions voisines, dans des fichiers que ce lot n'a pas le droit de commiter.


commit;
