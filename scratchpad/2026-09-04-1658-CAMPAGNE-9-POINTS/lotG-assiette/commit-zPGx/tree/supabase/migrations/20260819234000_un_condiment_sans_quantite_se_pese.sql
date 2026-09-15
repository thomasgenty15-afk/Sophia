-- ============================================================================
-- LOT 0-C — UN CONDIMENT SANS QUANTITÉ SE PÈSE, IL NE S'IGNORE PAS.
--
-- LE DÉFAUT, MESURÉ
-- -----------------
-- Sur les 1 204 plats de foyer en base, résolus APRÈS `foldPreparationsIntoDishes`
-- (la seule mesure qui fasse foi), 485 seulement rendent une énergie. Les
-- bloqueurs dominants ne sont pas des aliments:
--
--     × 217  salt          × 68  parsley      × 25  mint
--     × 103  black pepper  × 29  water        × 21  sel · × 21  poivre
--
-- Le générateur les écrit SANS quantité, et il a raison de le faire: le prompt
-- (lot 0-A) dit en toutes lettres qu'« une pincée reste une pincée », parce
-- qu'exiger un chiffre partout ferait inventer des nombres. Chacun de ces termes
-- est pourtant RÉSOLU — le référentiel les connaît — et simplement jamais pesé,
-- donc `dishEnergy` s'abstient sur le plat entier.
--
-- PESER, PAS IGNORER — ET C'EST TOUT L'ARBITRAGE
-- ----------------------------------------------
-- Une pincée de sel PESÉE à 0,5 g rend 0 kcal et un plat calculable. La même
-- pincée IGNORÉE rendrait aussi un plat calculable, mais par une règle
-- d'abstention relâchée — et cette règle-là laisserait passer, mesuré sur ce
-- même corpus, du riz cuit (145 kcal/100 g), des pois chiches, du thon et du
-- pain complet sur 38 plats. On pèse.
--
-- LA RÈGLE D'ADMISSION, ÉCRITE ET VÉRIFIÉE PAR LA BASE
-- ---------------------------------------------------
-- Ce qui sépare le poivre du riz n'est pas la densité (le poivre est à
-- 330 kcal/100 g, le riz à 145) — c'est la MASSE PLAUSIBLE. Une ligne rejoint la
-- classe si, et seulement si:
--
--   ① `condiment_grams` > 0 et <= 5 g          — une masse d'assaisonnement;
--   ② `energy_dense` = false                   — aucune matière grasse, aucun
--        fruit à coque, aucun sucrant ne peut entrer, JAMAIS, quelle que soit
--        la masse qu'on voudrait lui écrire;
--   ③ à TROIS FOIS sa masse conventionnelle — la main généreuse — la ligne
--        porte encore <= 10 kcal.
--
-- Les trois sont un CHECK, pas une intention. Le plafond de 10 kcal se dérive:
-- sur les 485 plats aujourd'hui calculables, le 5e centile est à 269 kcal et la
-- médiane à 1 086 kcal (le pliage rend des plats à l'échelle de la casserole).
-- 10 kcal y valent 3,7 % et 0,9 % — soit, dans le pire cas, moins de la moitié
-- de la bande d'erreur de ±10-15 % que le référentiel assume déjà pour lui-même
-- (cf. le commentaire de `ML_TO_G` dans `food_composition.ts`). Un condiment
-- pesé par convention au lieu d'être mesuré ne peut donc pas sortir un plat de
-- la tolérance qui était déjà supposée.
--
-- CE QUE LA RÈGLE REFUSE, ET C'EST LÀ QU'ELLE SE PROUVE
-- ----------------------------------------------------
--   garlic       111 kcal · ×39 plats bloqués. LE cas limite du lot: une gousse
--                pèse 5 g et la ligne porte déjà `unit_grams = 5`, donc elle
--                passe la borne ①. Elle échoue la ③: une recette de foyer
--                demande couramment trois gousses, soit 15 g = 16,6 kcal. L'ail
--                est un ALIMENT qu'on mange, pas un assaisonnement qu'on
--                saupoudre. REFUSÉ par la règle, pas par le goût.
--   lemon         27,6 kcal, `unit_grams` 60 g · ×36. Un citron entier est un
--                fruit: 60 g > 5 g. Refusé deux fois.
--   stock_cube   240 kcal · un cube pèse ~10 g. Refusé par ①.
--   vinegar       22,6 kcal · un filet fait 15 ml. Refusé par ①. C'est un
--                condiment, et il reste dehors: sa masse plausible n'est pas une
--                masse d'assaisonnement. Il bloque 0 plat aujourd'hui.
--   soy_sauce · mustard · ketchup · hot_sauce · curry_paste — des sauces qu'on
--                sert à la cuillère, pas qu'on pince. Refusées par ① ou ③.
--   olive_oil · toutes les huiles, purées d'oléagineux, mayonnaise, pesto,
--                vinaigrette — `energy_dense = true`. Refusées par ②, et c'est
--                la contre-épreuve du lot: une huile sans quantité DOIT
--                continuer à éteindre son plat (`unweighedEnergyDense`).
--
-- LA CLASSE EST BILINGUE SANS UNE SEULE LIGNE DE PLUS
-- ---------------------------------------------------
-- L'appartenance est portée par le SLUG, pas par une chaîne. `sel` (×21) et
-- `poivre` (×21) sont déjà des alias de `salt` et `black_pepper`, `ail` de
-- `garlic`: ils traversent le résolveur partagé et arrivent sur la même ligne.
-- Aucun matcher maison n'est écrit — le dépôt a mesuré 12 faux positifs sur 12
-- avec un matcher artisanal (« lait » se trouve dans « laitue »).
--
-- POURQUOI PAS `food_group_ref`
-- -----------------------------
-- Parce qu'il ne dit pas ça. `sauce_dressing` contient le sel et le poivre AVEC
-- la vinaigrette, la mayonnaise et le ketchup; les herbes fraîches sont rangées
-- en `leafy_greens` avec la laitue et les épinards. Le groupe décrit un rôle
-- nutritionnel, pas une masse d'emploi.
-- ============================================================================

alter table public.food_composition_refs
  add column if not exists condiment_grams numeric;

-- La règle d'admission, EXÉCUTABLE. Une ligne hors classe ne peut pas être
-- glissée dedans plus tard « pour faire monter la couverture »: la base refuse.
alter table public.food_composition_refs
  drop constraint if exists food_composition_refs_condiment_is_a_seasoning_check;

alter table public.food_composition_refs
  add constraint food_composition_refs_condiment_is_a_seasoning_check check (
    condiment_grams is null
    or (
      condiment_grams > 0
      and condiment_grams <= 5              -- ① CONDIMENT_MAX_GRAMS
      and energy_dense = false              -- ② aucune classe dense, jamais
      and condiment_grams * 3 * energy_kcal <= 10 * 100  -- ③ 3× la convention <= 10 kcal
    )
  );

comment on column public.food_composition_refs.condiment_grams is
  'FF-038 / lot 0-C: la MASSE CONVENTIONNELLE d''un condiment, en grammes, '
  'appliquée quand le générateur l''écrit sans quantité structurée. NULL '
  'partout ailleurs, et c''est le cas de 906 lignes sur 923. Ce n''est PAS une '
  'mesure: c''est une convention avouée (une pincée, un brin, une petite '
  'poignée). Le CHECK qui l''accompagne est la règle d''admission de la classe: '
  '<= 5 g, jamais energy_dense, et <= 10 kcal à trois fois cette masse. Sans '
  'elle, `dishEnergy` s''abstient sur le plat entier parce que quelqu''un a '
  'écrit « salt » — ce que le prompt lui demande explicitement de faire.';

-- ── ① LA PINCÉE — assaisonnements SECS, dosés à la pincée ────────────────────
-- 0,5 g. Dérivation: une pincée de cuisine vaut 1/8 de cuillère à café; la
-- cuillère à café du module fait 5 ml (`TSP_ML`), donc 0,625 ml, soit ~0,6 g à
-- la densité par défaut du module (`ML_TO_G = 1,0`). Arrondi à 0,5 g — le même
-- ordre de grandeur que les deux conventions DÉJÀ posées au référentiel:
-- `herbs_thyme` porte 1 g pour un brin et `herbs_bay_leaf` 0,2 g pour une
-- feuille.
--
-- La famille est FERMÉE: ce sont les 7 assaisonnements secs moulus de
-- `sauce_dressing` (tout le groupe sauf les sauces, les pâtes et les corps
-- gras), plus le sel. En admettre six sur huit aurait été le geste arbitraire.
update public.food_composition_refs as r
set condiment_grams = v.grams
from (values
  ('salt', 0.5),           -- 0 kcal: pesé ou pas, il ne déplace rien. Mais tant
                           -- qu'il n'est pas PESÉ, il éteint 217 plats.
  ('black_pepper', 0.5),   -- 330 kcal/100 g, et parfaitement anodin à 0,5 g
  ('cumin', 0.5),          -- 427 kcal/100 g — le plus dense de la classe
  ('paprika', 0.5),
  ('turmeric', 0.5),
  ('cinnamon', 0.5),
  ('chilli_powder', 0.5),
  ('dried_herbs', 0.5)     -- herbes séchées en mélange
) as v(slug, grams)
where r.slug = v.slug and r.condiment_grams is null;

-- ── ② LES HERBES SÉCHÉES EN FEUILLE — leur propre `unit_grams` ───────────────
-- Ces deux lignes portent DÉJÀ le poids d'« une »: un brin de thym, une feuille
-- de laurier. La convention est donc écrite: c'est celle du référentiel, pas une
-- seconde. On ne pose pas un nombre à côté d'un nombre.
update public.food_composition_refs as r
set condiment_grams = r.unit_grams
where r.slug in ('herbs_thyme', 'herbs_bay_leaf')
  and r.unit_grams is not null
  and r.condiment_grams is null;

-- ── ③ LES HERBES FRAÎCHES — la petite poignée ────────────────────────────────
-- 5 g. Dérivation: une herbe fraîche s'écrit « a handful of parsley » et sert de
-- garniture. `herbs_thyme` pose déjà 1 g pour UN brin; une garniture en fait
-- quelques-uns. 5 g est aussi la borne haute de la classe (`CONDIMENT_MAX_GRAMS`),
-- ce qui est cohérent: c'est le condiment le plus lourd qu'on admette.
--
-- La famille est FERMÉE et complète: ce sont les 6 herbes fraîches en feuille du
-- référentiel. Les deux dernières (`herbs_dill`, `herbs_chives`) ont été ajoutées
-- par le lot 0-B EXPRÈS comme précondition de celui-ci — une classe ne peut pas
-- s'appliquer à un terme que le référentiel ne reconnaît pas.
--
-- Le contrôle ③ mord ici: la menthe, à 57,6 kcal/100 g, vaut 8,6 kcal à 15 g.
-- C'est le membre le plus coûteux de la classe, et il reste sous le plafond.
update public.food_composition_refs as r
set condiment_grams = v.grams
from (values
  ('herbs_parsley', 5),
  ('herbs_mint', 5),
  ('herbs_basil', 5),
  ('herbs_coriander', 5),
  ('herbs_dill', 5),
  ('herbs_chives', 5)
) as v(slug, grams)
where r.slug = v.slug and r.condiment_grams is null;

-- ── ④ L'EAU — le cas le plus absurde de la liste ─────────────────────────────
-- 29 plats s'abstenaient parce qu'une casserole mentionnait de l'eau. Zéro
-- kcal, à n'importe quelle masse.
--
-- 1 g, et le petit nombre est DÉLIBÉRÉ. L'eau n'apporte aucune énergie
-- directement, mais toute masse résolue entre dans le poids cuit que
-- `nutrientsOf` utilise pour imputer l'huile de friture (12 % du poids cuit,
-- 9 kcal/g). Une convention à « une tasse » ferait donc apparaître ~108 kcal
-- d'huile fantôme sur un plat frit. La convention la plus petite est la seule
-- qui ne puisse fuir nulle part.
update public.food_composition_refs as r
set condiment_grams = 1
where r.slug = 'water' and r.condiment_grams is null;
