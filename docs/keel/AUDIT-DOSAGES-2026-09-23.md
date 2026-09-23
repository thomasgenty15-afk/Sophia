# Audit des dosages des plans de repas

Rapport pour le propriétaire du produit, 23 septembre 2026. Contre-vérifié à la main après l'audit : moments par personne, contrôle des exclusions à 0, tofu au petit-déjeuner 13/20, seuil 140, rabotage après `day_kcal` (Thomas sur e0325544 : 2 919 / 3 097 / 3 120 / 3 267 / 2 816 kcal servies pour 100 % affichés), refus `no_direction` des 15 boîtes de Christèle, céréale écrite par le modèle 90–180 g secs par part (médiane 150).
Périmètre : les 4 derniers plans du foyer de test (Thomas, Christèle, Fabrice).
Tout a été fait en lecture seule. Aucun fichier du dépôt n'a été modifié, la base n'a reçu que des SELECT, et aucune génération n'a été lancée.

**Comment lire les chiffres.** Chaque nombre porte sa nature :
- **[mesuré]** : lu dans la base, ou renvoyé par la fonction `meal-energy-v1` ;
- **[calculé]** : obtenu par un script de l'audit à partir de données mesurées (le script est nommé) ;
- **[supposé]** : repère de nutritionniste extérieur au dépôt (GEMRCN, PNNS, Harvard, ADA…), à valider ;
- **[code]** : lu dans un fichier du dépôt (`fichier:ligne`, chemins sous `supabase/functions/`).

Les scripts et données cités sont dans le dossier de travail de la session, **hors du dépôt et temporaire** : `/private/tmp/claude-502/-Users-ahmedamara-Dev-Sophia-2/3adc57e5-c3d7-4057-90b5-0385df94337c/scratchpad/audit-dosages/` (chemins relatifs ci-dessous : `data/`, `sim/`, `verif_*`…).

Un mot revient partout : la **densité** d'un plat, c'est ses calories divisées par son poids (kcal par gramme). Pour apporter 700 kcal, un plat à 1,0 kcal/g pèse 700 g, et un plat à 1,4 kcal/g pèse 500 g.

---

## 1. En bref

- **Verdict.** La quantité de la journée est juste : chacun reçoit sa cible d'énergie à 1 % près (Thomas 3 206 kcal/j pour 3 276, Christèle 1 931 pour 1 944, Fabrice 1 805 pour 1 807) [mesuré]. Ce qui fait « bizarre », c'est la façon dont cette énergie est rangée dans les boîtes.
- **Cause 1 : un seul plat porte tout le repas.** Christèle et Fabrice mangent à 3 moments. Leur plat de midi porte 40 % de la journée (778 et 723 kcal), sans fruit, laitage ni pain à côté. Christèle : plat médian de 543 g contre ≈ 420 à 480 g pour un plat ordinaire [supposé]. Fruits : 64 et 60 g/j [mesuré].
- **Cause 2 : la recette commune est écrite pour Thomas.** Le plat partagé doit atteindre 140 kcal/100 g, soit 980 kcal ÷ 700 g. Thomas est donc à 700 g par construction (31 repas sur 40 à 690 g ou plus), avec 163 g de céréale sèche par repas [mesuré].
- **Cause 3 : aucune forme d'assiette selon l'objectif, et aucun plafond de féculent.** Le modèle écrit 150 g de céréale sèche par part (médiane), et le moteur sert à peu près la même proportion à tous. Fabrice, en perte de poids, a 33 % de féculent et 32 % de légumes, à 1,34 kcal/g comme les autres [mesuré].
- **Cause 4 : sur le plan que tu as commenté (e0325544).** Des plats dilués (frittata 0,98 kcal/g, dinde 0,87 kcal/g) remplissent l'assiette jusqu'au plafond. Un rabotage final retire ensuite jusqu'à 460 kcal/j à Thomas, alors que le compteur `day_kcal` affiche 100 % [mesuré].
- **Trois changements prioritaires :**
  - (1) un à-côté prévu, acheté et compté au déjeuner et au dîner (fruit, crudités, laitage ou pain), par un canal à part ;
  - (2) une forme d'assiette selon l'objectif, calculée par le moteur (`starch_side.ts`), y compris pour une personne seule ;
  - (3) une consigne avec une part de référence chiffrée (60 à 70 g de céréale sèche par part).
  
  Avant tout cela, un lot qui mesure juste. En parallèle, réparer les consignes du foyer qui ne tiennent pas : tofu le matin, œufs de Christèle, « très léger le matin ».

---

## 2. Ce qu'on a regardé

### 2.1 Les plans

| Plan | Créé le | Statut | Règle du « féculent à part » qui a tourné | Durée de génération |
|---|---|---|---|---|
| 0c02050d | 22/09 22:47 | brouillon | **ancienne** version, qui poursuivait le plafond de protéines (`to_ceiling` 3) : il ne sert pas à juger le code actuel | 116 s |
| 1e553ca1 | 22/09 23:19 | brouillon | règle d'énergie (version actuelle) | 151 s |
| e0325544 | 22/09 23:34 | brouillon, commenté par toi | règle d'énergie | 178 s |
| cc012345 | 23/09 00:30 | **adopté** | règle d'énergie | 209 s |

Sources [mesuré] : `student_meal_drafts.wall_ms` et `write_payload->'generated_from'->'household'->'portion_sizing'->'starch_side'->'outcomes'`.

Les 4 plans ont reçu la même consigne. Le prompt système est identique à l'octet près, et le message utilisateur est identique pour e0325544 et cc012345 [mesuré]. Chaque plan n'est qu'**un seul tirage** du modèle.

### 2.2 Les personnes

| | Thomas | Christèle | Fabrice |
|---|---|---|---|
| Corps | homme, 28 ans, 187 cm, 72 kg | femme, 55 ans, 169 cm, 58 kg | homme, 59 ans, 173 cm, 93 kg |
| Objectif | prise de muscle | maintien | perte de 0,8 kg/sem |
| Cible (plans étudiés) | 3 276 kcal/j (3 386 depuis le 23/09) | 1 944 kcal/j | 1 807 kcal/j (entretien 2 687 − 880) |
| Moments | 5, **déduits par le moteur** : il n'a rien déclaré (`household_members.eating_rhythm` NULL, index.ts:5055-5095) | 3 déclarés : petit-déjeuner, déjeuner, dîner | 3 déclarés |
| Appétit | non renseigné | non renseigné | « large » |
| Compte | titulaire | aucun (`user_id` NULL) | aucun |

Les notes du foyer sont stockées dans `student_goals.practical_constraints.retained_items` [mesuré] :
- **Christèle, 20/09** : « Le matin pour christème c'est plutot quelque chose de très léger… fruit, bol de muesli, mais genre lesoeufs ça lui convient pas ». Elle est enregistrée en trois lignes : `food.prefer` « fruit », `food.prefer` « bol de muesli », `food.exclude` « lesoeufs ».
- **Foyer, 21/09** : « Je veux pas de choses genre tofu, poissons au petit déjeuné ». Elle est enregistrée en **une seule** ligne `food.exclude`, avec le texte « tofu, poissons au petit déjeuné » et sans moment.

### 2.3 La méthode

1. **Les 220 boîtes.** J'ai relevé les grammes de chaque aliment et recalculé leur énergie avec la même arithmétique que le moteur (`data/build_plates.py`).
   - Contrôle : sur les 160 boîtes que `meal-energy-v1` renvoie (Thomas et Fabrice), l'écart maximal est de 0,5 kcal.
   - Christèle est refusée par cette fonction (motif `no_direction`, elle est en maintien). Ses chiffres sont donc **calculés**, pas mesurés par le produit.
2. **Ce que le modèle a écrit, comparé à ce que le moteur a servi.** Sortie brute (`llm_raw_response_events`) contre recette finale (`data/modele_vs_moteur/`).
3. **Lectures.** La chaîne de calcul dans le code, la consigne réellement envoyée (`consigne/`) et les journaux du serveur de fonctions (`chaine/logs_household.json`).
4. **Repères de nutritionniste** (`norms/`).
5. **Vérification.** Neuf causes candidates, chacune relue par deux vérificateurs indépendants (dossiers `verif_*`). Ensuite, un plan de correction simulé sur les recettes réelles (`sim/synthese/`), puis critiqué (`critique/`).

### 2.4 Les limites

- **Un seul tirage par plan, avec la même consigne.** La variation du modèle d'un tirage à l'autre n'est pas contrôlée. Mesurée ailleurs : de −23 % à +63 % sur la densité.
- **Énergie de Christèle** : calculée, pas mesurée par le produit.
- **Repères de portion** [supposé]. Le GEMRCN a été lu via deux sites qui le recopient, car la page officielle est derrière une vérification anti-robot. Les autres repères viennent de Harvard, de l'ADA et du PNNS.
- **`adjustPlanProportions` n'a pas été rejoué.** Il aurait fallu exécuter du code sous `supabase/functions`, ce qui était interdit pendant l'audit. Son rôle est déduit.
- **Gonflement du couscous complet.** Le moteur applique ×2,6, car `yield_factor` est vide. Si le vrai gonflement est de ×2,0 à 2,3, les grammes cuits affichés sont surestimés d'environ 15 %. Non mesuré.
- **Les chiffres « après » sont des calculs** sur les recettes réellement écrites, pas une vraie génération.

---

## 3. Ce que mangent réellement les trois personnes

### 3.1 Par moment

Moyenne sur 4 plans × 5 jours [mesuré, `data/analyse_plates.py`].

| Personne | Moment | Masse | Énergie | Part du jour | Densité |
|---|---|---|---|---|---|
| Thomas | petit-déjeuner | 492 g | 681 kcal | 21 % | 1,41 kcal/g |
| Thomas | collation matin | 275 g | 329 kcal | 10 % | 1,20 kcal/g |
| Thomas | déjeuner | 681 g | 962 kcal | 30 % | 1,43 kcal/g |
| Thomas | collation après-midi | 246 g | 329 kcal | 10 % | 1,38 kcal/g |
| Thomas | dîner | 691 g | 905 kcal | 28 % | 1,31 kcal/g |
| Christèle | petit-déjeuner / déjeuner / dîner | 350 / 568 / 517 g | 485 / 773 / 673 kcal | 25 / 40 / 35 % | 1,41 / 1,38 / 1,32 kcal/g |
| Fabrice | petit-déjeuner / déjeuner / dîner | 326 / 526 / 483 g | 452 / 720 / 632 kcal | 25 / 40 / 35 % | 1,41 / 1,38 / 1,34 kcal/g |

Pour 3 repas, la répartition 25 / 40 / 35 % est dans les repères français : petit-déjeuner 20–25 %, déjeuner 35–45 %, dîner 30–35 % [supposé]. **La répartition n'est pas fausse. Le problème, c'est qu'un seul plat porte chaque part.**

### 3.2 Déjeuners et dîners : ce qu'il y a dans l'assiette

Moyennes sur 40 repas par personne. Les repères entre crochets sont [supposé].

| | Thomas (prise) | Christèle (maintien) | Fabrice (perte) |
|---|---|---|---|
| Masse du plat, moyenne (médiane) | 686 g (700) | 543 g (543) | 505 g (500) |
| Repère de plat | [500–650 g, 700 au plus] | [350–500 g] | [450–600 g, dont la moitié de légumes] |
| Plats trop lourds | 37 sur 40 au-dessus de 650 g | 19 sur 40 au-dessus de 550 g | 7 sur 40 au-dessus de 550 g |
| Densité | 1,36 kcal/g | 1,33 kcal/g | 1,34 kcal/g (28 repas sur 40 au-dessus de 1,30) |
| Repère de densité | [1,4–1,8] | [1,1–1,4] | [0,8–1,1] |
| Céréale sèche, repas qui en contiennent (20 par personne) : moyenne (min–max) | **163 g** (110–194) | **115 g** (67–162) | 80 g (25–126) |
| Repère de céréale sèche | [90–120 g] | [50–70 g] | [35–50 g] |
| Légumes crus | 191 g (13 repas sur 40 sous 150 g) | 162 g (21 sous 150 g) | 173 g (16 sous 150 g ; 36 sous 250 g) |
| Part de la masse : légumes / féculents | 26 % / 45 % | 28 % / 42 % | **32 % / 33 %** |
| Repère de part de la masse | [25–35 % / 35–50 %] | [35–50 % / 25–35 %] | [≥ 50 % / ≤ 25 %] |
| Plats à moitié en légumes | 1 sur 40 | 1 sur 40 | 2 sur 40 |
| Énergie venant des féculents (hors légumineuses) | 49 % | 46 % | 38 % |

Sources [mesuré] : `data/plates.json`, `verif_R8/veg.py`.

**Sur les mêmes plats**, la casserole principale (viande et légumes) est presque la même pour les trois personnes : 274 g, 243 g et 293 g. Seul le féculent varie.

Exemple, e0325544, jeudi midi :

| | Poulet-légumes | Couscous cuit | Couscous sec |
|---|---|---|---|
| Thomas | 261 g | 439 g | 169 g |
| Christèle | 262 g | 372 g | 143 g |
| Fabrice | 264 g | 329 g | 127 g |

[mesuré ; la part d'une casserole se calcule sur sa masse prête de 1 227 g.] L'hypothèse de départ de 180 / 155 / 135 g secs surestimait.

### 3.3 La journée

| | Thomas | Christèle | Fabrice |
|---|---|---|---|
| Énergie servie ÷ cible [mesuré] | 3 206 ÷ 3 276. Sur e0325544 : 3 044, et 2 816 le dimanche | 1 931 ÷ 1 944 | 1 805 ÷ 1 807 |
| Masse du jour [mesuré] | 2 385 g | 1 436 g | 1 335 g |
| Journée type du nutritionniste [calculé, `norms/day_examples.py`] | 2 391 g | 1 720 g | 1 878 g |
| Fruits par jour [mesuré] | 231 g | **64 g** (moins de 100 g 17 jours sur 20) | **60 g** (18 jours sur 20) |
| Laitages par jour [mesuré] | — | 98 g | 91 g |
| Protéines par jour [mesuré] | 175 g (2,43 g/kg) | **116 g (2,0 g/kg)** | 115 g (1,23 g/kg) |
| Repère de protéines [supposé] | 1,6–2,2 g/kg (115–158 g) | 1,0–1,2 g/kg (58–70 g) | 1,2–1,6 g/kg du poids ajusté (95–127 g) |
| Fibres [mesuré] | 63 g/j (45 à 89), repère ≈ 47 g [supposé] | — | — |

**Sur une journée entière, la masse n'est pas trop grosse.** Christèle et Fabrice mangent même moins lourd qu'une journée type. C'est chaque assiette qui est trop grosse : toute la journée tient dans 3 boîtes, et le féculent y occupe la place du fruit, du laitage et des légumes.

### 3.4 Petits-déjeuners et collations

**Masses [mesuré].**
- Thomas : 492 g pour 681 kcal. 16 petits-déjeuners sur 20 dépassent 450 g, et 14 de ces 16 ont une densité normale (1,28 à 1,59 kcal/g) : c'est l'énergie (683 kcal) qui les rend lourds.
- Christèle : médiane 341 g. Fabrice : médiane 317 g.
- Seules 2 boîtes sur 20 dépassent 400 g, dans les deux cas pour les deux mêmes plats de e0325544 :
  - la **frittata** (0,98 kcal/g), servie **683 / 486 / 461 g**. Le modèle l'avait écrite pour « 2 parts » avec 1,82 kg d'ingrédients crus, dont 600 g de tomate et 400 g de pomme de terre ;
  - l'**omelette** (1,03 kcal/g), servie 642 / 458 / 425 g.

**Contenu [calculé, `verif_R9/recalc.py`].**
- 17 jours sur 20 ont une protéine « de plat » : tofu ou tempeh 13 fois, œufs 4 fois.
- **45 % de l'énergie vient des lipides.** Répartition des points : tofu et tempeh 14, yaourt « à la grecque » entier 12, oléagineux 7, avoine 5, œufs 3, huile 3.
- Fruit : 53 à 79 g.

**Collations de Thomas.** 275 g et 246 g, 329 kcal chacune. C'est au bas de la fourchette de 300 à 500 kcal pour une prise de muscle [supposé].

### 3.5 Les assiettes qui font « bizarre » [mesuré]

**72 assiettes sur 220** remplissent au moins un de ces critères : céréale sèche au-dessus de 120 g, féculent au-dessus de 50 % de la masse, légumes sous 100 g, petit-déjeuner au-dessus de 450 g, etc. Les pires :

- **Thomas, cc012345, jeudi, dimanche et lundi soir :** 186 g de céréale sèche (484 g cuits), 67 g de protéine cuite, 117 g de légumes.
- **Thomas, cc012345, vendredi midi, « Poulet sur tartine » :** 274 g de pain complet pour environ 56 g de poulet. Christèle en reçoit 196 g.
- **Christèle, 0c02050d, vendredi midi** (ancienne règle) : 132 g de couscous sec, 39 g de dinde cuite, 72 g de légumes.
- **Fabrice, e0325544, lundi midi :** 152 g de pain et 152 g de haricots blancs, soit deux féculents complets.
- **e0325544, dîners de dinde du dimanche et du lundi :** Thomas reçoit 609 kcal au lieu de 955. Pendant ce temps, Christèle et Fabrice ont 680 et 696 g d'un plat à 0,87 kcal/g.

---

## 4. Les causes, une par une

### Vue d'ensemble

| # | Cause | Statut | Qui est touché | Poids |
|---|---|---|---|---|
| C1 | Un seul plat porte tout le repas (3 moments, rien à côté) | confirmée en partie | Christèle (masse), fruits de tous | principale pour Christèle |
| C2 | La densité demandée au plat commun met Thomas à 700 g par construction | confirmée en partie | Thomas | principale pour Thomas |
| C3 | Une seule composition pour toute la table ; aucune forme d'assiette selon l'objectif | confirmée en partie | Fabrice surtout | principale pour Fabrice |
| C4 | Recette écrite sans taille de part ni plafond de féculent | confirmée en partie | tous | moyenne |
| C5 | La consigne vise « la plus grande assiette » ; les plats dilués ne sont pas corrigés | confirmée en partie, limitée à e0325544 | tous sur e0325544 | forte sur ce plan seulement |
| C6 | Le rabotage final retire de l'énergie sans le dire | confirmée en partie | Thomas | forte sur e0325544, faible ailleurs |
| C7 | L'ajusteur de proportions déforme la recette commune | confirmée en partie, 2 plans sur 4 | Christèle | nulle sur le plan adopté |
| C8 | Légumes sous le minimum, jamais vérifiés dans les boîtes | confirmée en partie | tous | un manque, pas un excès |
| C9 | Protéines : teneur commune tirée vers le haut, petit-déjeuner « de plat » | confirmée en partie | Christèle, Thomas | moyenne |

Aucune cause n'a été entièrement réfutée. Mais plusieurs affirmations de départ se sont révélées fausses ; chaque section les signale.

### C1. Un seul plat porte tout le repas

**Ce qui se passe.**
- Le moteur répartit la journée de Christèle et de Fabrice en 25 / 40 / 35 % :
  - poids des moments : `SLOT_DAY_WEIGHT`, mouth_anchor.ts:719-729 ;
  - ramenés aux seuls moments déclarés : mouth_anchor.ts:491-555.
- Il sert exactement cette énergie dans **une seule boîte**.
- Depuis le 2026-09-10, rien n'est réservé au pain, au fromage ou au dessert (mouth_anchor.ts:456-470 ; index.ts:3522 ne lit plus `takes_*`).
- Le modèle compose un seul plat par case : 55 cases sur 55 [mesuré].

**Preuve.**
- `member_portions.eating_slots` vaut petit-déjeuner, déjeuner, dîner pour les deux, dans les 4 plans [mesuré].
- Énergie servie : 485 / 773 / 673 kcal pour Christèle, 452 / 720 / 632 kcal pour Fabrice.
- Le plat de Christèle a une densité normale (1,33 kcal/g). Le surplus de masse vient donc de l'énergie mise dans le plat.
- Il fait +65 à +123 g de plus qu'un plat ordinaire, selon le repère : 420 g (plat seul d'un repas complet) ou 478 g (journée type) [supposé].

**Ce qui a été corrigé pendant la vérification.**
- La répartition 25 / 40 / 35 % **n'est pas fausse** : elle est dans les repères.
- **Fabrice n'a pas des plats trop lourds** : 505 g, sous son repère de 550 g. Son problème est la densité et la composition (C3). Mais dès qu'on voudra lui donner plus de légumes, il faudra sortir de l'énergie de son plat : 723 kcal à 1,0 kcal/g pèsent 723 g, au-dessus du plafond de 700 g.
- **Le petit-déjeuner n'est pas trop gros à cause de sa part** (médianes 341 et 317 g).
- **Le manque de fruits ne vient pas de la part du jour.** Il vient de l'absence de dessert composé, et cela vaut pour tout le monde : les déjeuners et dîners contiennent 1 à 9 g de fruit par jour, Thomas compris.
- **`relaxSharedForTable` n'est pas en cause** pour eux. `shared_table_relax.refused` est vide sur les 4 plans, et leurs cibles restent sous le seuil de 980 kcal.
- **Cocher aujourd'hui « petit-déjeuner léger » pour Christèle ferait l'inverse de ce qu'on veut** [calculé, mouth_anchor.ts:537] :

  | Christèle | Aujourd'hui | Avec « petit-déjeuner léger » coché |
  |---|---|---|
  | Petit-déjeuner | 486 kcal | 324 kcal |
  | Déjeuner | 778 kcal | 864 kcal |
  | Dîner | 680 kcal | 756 kcal |

  Les parts sont recalculées sur les moments déclarés, donc l'énergie retirée du matin part dans les deux autres plats : environ +60 g par plat.
- **Historique.** Avant le 2026-09-10, 58 % du déjeuner et du dîner étaient réservés quand la question des à-côtés restait sans réponse (`UNANSWERED_EXTRAS_SHARE`, commit fa422747). Les plats étaient alors trop petits. La bonne réponse est entre les deux : **de la nourriture prévue et servie à côté**, pas une réserve cachée.

**Effet chiffré [calculé].** Si 150 à 250 kcal par repas passent dans un dessert composé (fruit et laitage), le plat de Christèle passe de 543 g à 430 puis 355 g (calcul : 543 − énergie déplacée ÷ 1,33).

### C2. Thomas à 700 g par construction

**Ce qui se passe.**
- **Énergie de ses repas.** Déjeuner = 3 276 × 0,40 ÷ 1,20 = 1 092 kcal. Il est ramené à 980 kcal par le report vers ses collations, dont le seuil est `SHARED_TABLE_MAX_ASK_PER_100G` = 140 (slot_nutrition_contract.ts:357) : 140 kcal/100 g × 700 g = 980. Dîner : 955 kcal.
- **Densité demandée.** Au plat partagé, on demande « le plancher le plus haut de la table » (household_portions.ts:1466-1476). C'est celui de Thomas : 980 ÷ 700 = 140 au déjeuner, 956 ÷ 700 = 137 au dîner. Les 4 consignes portent « Shared dish 140-250, aim 140 » [mesuré].
- **Conséquence.** Un plat qui obéit met Thomas à 700 g pile. Un plat moins dense le met aussi à 700 g, mais lui retire de l'énergie (C6).

**Preuve** (déjeuners et dîners de Thomas, par plan) [mesuré] :

| Plan | Densité | Masse moyenne | Énergie moyenne | Énergie perdue |
|---|---|---|---|---|
| 0c02050d | 1,42 kcal/g | 680 g | 967 kcal | aucune |
| 1e553ca1 | 1,335 kcal/g | 700 g | 934 kcal | journées à 3 082–3 276 kcal |
| e0325544 | 1,22 kcal/g | 700 g | 854 kcal | journées à 2 816–3 267 kcal |
| cc012345 (adopté) | 1,47 kcal/g | 665 g | 977 kcal | aucune |

**Céréale.** 163 g sèche en moyenne (de 110 à 194 g), 19 repas sur 20 au-dessus de 120 g, et la céréale cuite fait 61 % de l'assiette. Elle vient surtout de la recette du modèle, qui écrit 132 g secs par part en moyenne. La règle du féculent à part (`starch_side.ts`) n'en ajoute que 16 à 27 g.

**Ce qui a été corrigé pendant la vérification.**
- **« L'excès vient entièrement d'une densité trop basse »** n'est pas une mesure. C'est un effet du repère supposé (600 g à 1,6 kcal/g). À 1,4 kcal/g, la valeur que le code traite comme la plus haute d'un plat ordinaire, l'excès est nul. **La vraie cause est l'énergie donnée aux deux repas partagés : 1 935 kcal, soit 59 % de sa journée.**
- **Maximum de céréale :** 194 g, pas 206 (les 206 g étaient du pain).
- **Les 274 g de pain** (cc012345, vendredi midi) ne sont pas un cas de plafond : l'assiette pèse 453 g à 2,16 kcal/g. C'est le surplus d'énergie qui a été mis dans le pain.
- **Nouveau curseur (3 386 kcal).** Déjeuner 1 129 et dîner 988 kcal, tous deux ramenés à 980, et 156 kcal passent aux collations (360 kcal chacune). À densité moyenne, la perte au rabotage passe de ≈ 62 à ≈ 86 kcal/j. Les 110 kcal ajoutées n'en perdent donc qu'environ 24 [calculé, `degres_liberte/relache.py`].
- **Densifier la recette commune à 1,5–1,6 kcal/g est exclu.** Le code l'a refusé à dessein : à 161 kcal/100 g, le modèle mettait 30 ml d'huile et 85 g de parmesan par part (slot_nutrition_contract.ts:340-349).
- **La carte de Thomas se contredit** : « aim 475 g » et « aim 154 kcal/100 g ». Or 980 kcal dans 475 g demanderaient 206 kcal/100 g.

### C3. Une seule composition pour toute la table

**Ce qui se passe.**
- **Un seul coefficient par casserole.** Le moteur multiplie chaque casserole par un seul coefficient par personne (portion_sizing.ts:942). Sur 34 casseroles, 26 ont exactement le même facteur sur toutes leurs lignes, et les autres ne diffèrent que par l'arrondi [mesuré].
- **Une seule variation de composition possible.** C'est le partage entre casserole principale et casserole de féculent, sur les repas partagés à deux casseroles (`splitStarchSide`, starch_side.ts:343-447). Ce partage **ne lit pas l'objectif** :
  - au-dessus de la personne du milieu de la table, le surplus d'énergie va au féculent (starch_side.ts:384) ;
  - sous le plancher de protéines, la personne reçoit plus de casserole principale (branche `to_floor`, starch_side.ts:386-396).
- **Légumes et viande sont liés.** Les légumes sont dans la même casserole que la viande : plus de légumes veut dire plus de viande.

**Preuve.**
- **Fabrice a la composition d'une assiette ordinaire, pas d'une assiette de perte** : 33 % de féculent, 32 % de légumes, et la moitié de légumes dans seulement 2 repas sur 40.
- **Même densité pour toute la table**, à 0,05 kcal/g près [mesuré] :

  | Plan | Thomas | Christèle | Fabrice |
  |---|---|---|---|
  | 0c02050d | 1,42 | 1,41 | 1,46 |
  | 1e553ca1 | 1,33 | 1,33 | 1,33 |
  | e0325544 | 1,19 | 1,20 | 1,19 |
  | cc012345 | 1,46 | 1,45 | 1,44 |

- **Le plafond de densité pour la perte n'agit sur rien.** `DENSITY_CEILING_FAT_LOSS` = 1,3 (meal_envelope.ts:849) n'est lu que par `verdictFor` (meal_verdict.ts:698), qui n'a aucun appelant hors des tests. index.ts:15352 le dit : « La lane foyer ne calcule PAS verdictFor ».
- **La consigne de perte ne peut pas s'appliquer à un plat commun.** La fiche de Fabrice dit « vegetables first (half the plate) » (household_prompt_v34.ts:233). Mais le bloc de recette interdit toute portion propre à une personne (household_meal_generation.ts:852).
- **Même sur les plats à son nom** (cc012345, samedi et dimanche), le modèle a écrit les proportions de Christèle.

**Ce qui a été corrigé pendant la vérification.**
- **« L'objectif ne change jamais l'assiette » est faux.** Le plancher de protéines dépend de l'objectif. Il a changé la composition de Fabrice sur 15 de ses 22 repas à deux casseroles (3 plans récents) : féculent 48 → 39 % de la masse, céréale sèche 109 → 85 g. C'est un effet de bord du besoin en protéines, pas une règle d'assiette. Les jours où le reste de sa journée couvre déjà son plancher, Fabrice reçoit exactement la recette de Christèle : 1e553ca1, jeudi, 60 % de féculent chez les deux.
- **Christèle reçoit la recette du modèle telle quelle**, sur toutes les lignes finales : elle est la personne du milieu.
- **Le calcul « et si » d'une branche « perte » était surestimé d'un facteur 2.** Dans les bornes actuelles (casserole principale au plus ×1,5, féculent au moins ×0,4 de la part uniforme) :
  - céréale 80 → 66 à 71 g ;
  - légumes crus 175 → 200 g ;
  - masse 508 → 503 g ;
  - énergie égale ;
  - bloquée dans 9 cases sur 28.
  
  Descendre vers 45 g demande d'élargir ces bornes, pour la perte seulement (lot 2).

**Contrainte logique.** À énergie égale, « moins de féculent, plus de légumes » **n'allège pas l'assiette**. La casserole principale, avec son huile et son fromage, est presque aussi dense que la céréale : masse 508 → 503 g. Pour alléger aussi l'assiette, il faut C1, c'est-à-dire sortir de l'énergie du plat.

### C4. Une recette écrite sans taille de part ni plafond de féculent

**Ce qui se passe.**
- **Ce que la consigne chiffre.** Viande 100–150 g crue, gras 5–15 ml d'huile ou 15–30 g de fromage, légumes au moins 150 g (visée 200), laitages 250 g/j (household_meal_generation.ts:880-937).
- **Ce qu'elle ne chiffre pas.** Ni le féculent, ni l'énergie d'une « part ». Le féculent est donc le seul poste libre pour compléter l'énergie.
- **Trois phrases poussent vers le féculent :**
  - « Reach the density with the starch » (household_meal_generation.ts:881). C'est arithmétiquement impossible : une céréale cuite fait 1,29 à 1,35 kcal/g, sous 1,40 ;
  - « more starch » (:1023-1024) ;
  - la même idée dans `DENSITY_CONSEQUENCE` (household_portions.ts:1571-1576).
- **Une seule forme pour tous.** Le prompt système demande « roughly a third of the plate » de féculent, pour tout le monde (meal_generation.ts:3508).

**Preuve** [mesuré et calculé, `data/modele_vs_moteur/brut_contre_final.json`] :
- **Céréale écrite par le modèle :** 150 g secs par part en médiane (de 90 à 180 g, 11 casseroles), et 180 g sur cc012345.
- **Pain :** 120 à 130 g par part.
- **Énergie d'une part écrite :** 851 kcal en médiane (de 497 à 1 161). Ramenée à un repas de 700 kcal, cela fait 103 g de céréale sèche (de 63 à 133), soit 1,3 à 1,7 fois le repère de 60–80 g.
- **Huile et fromage :** 6 casseroles portent à la fois 15 ml d'huile et 30 g de parmesan par part, plus 2 plats à la feta. La consigne dit « never both at full size ».

**Ce qui a été corrigé pendant la vérification.**
- **Le lien « densité de 140 → trop de féculent » n'est pas démontré.** Dans 13 plats à céréale sur 21, le reste de l'assiette est plus dense que la céréale : ajouter de la céréale y fait baisser la densité. Ce que la densité de 140 impose vraiment :
  - l'huile et le fromage au maximum ;
  - le pain comme féculent du midi ;
  - des légumes limités au minimum (≈ 6 % de l'énergie).
- **Part propre de cette cause dans la céréale de Christèle : ≈ +15 g sec par repas.** Le reste vient de l'énergie de son repas (C1) : à 780 kcal et 45 % d'énergie en féculent (repère), un repas contient déjà ≈ 102 g de céréale sèche.
- **Les grammes écrits par le modèle n'arrivent jamais tels quels dans l'assiette. Seules ses proportions arrivent** : le moteur remet chaque part à la cible (énergie servie ÷ cible = 1,00 en médiane) [mesuré]. Écrire 60 g de couscous au lieu de 120 g, sans rien changer d'autre, aurait donné pour la même énergie plus de viande et plus de légumes, donc des assiettes plus lourdes. **Il faut agir sur les proportions et la densité demandée, pas sur les grammes seuls.**

### C5. La consigne vise la plus grande assiette ; les plats dilués ne sont pas corrigés

**Ce qui se passe.**
- **Le plafond de masse** vaut énergie ÷ 1,0 kcal/g, borné à 700 g, puis multiplié par l'appétit (portion_sizing.ts:654-664).
- **La consigne demande la grande assiette :**
  - « we ask for the bigger plate » (household_portions.ts:1267) ;
  - « the largest plate each person's bounds allow » (household_prompt_v34.ts:525) ;
  - au petit-déjeuner partagé, « aim 100 kcal/100 g », c'est-à-dire 100 % du plafond de Thomas.
- **Le plancher de 100 kcal/100 g par plat** est écrit dans la consigne (household_meal_generation.ts:783), mais rien ne refuse un plat en dessous.
- **La réparation « densifier » existe, mais n'a jamais été envoyée** : `repairs.asked` = 0 sur les 4 plans, alors que `would_ask` = 2, 8, 11 et 2 [mesuré].

**Preuve** [mesuré]. Les 4 plats de repas sous 1,1 kcal/g sont tous dans e0325544 :

| Plat | Densité | Thomas | Christèle | Fabrice |
|---|---|---|---|---|
| Frittata | 0,98 kcal/g | 683 g | 486 g | 461 g |
| Omelette | 1,03 kcal/g | 642 g | 458 g | 425 g |
| Dîners de dinde (2) | 0,87 kcal/g | 700 g | 680 g | 696 g |

Christèle, déjeuner, pour la même énergie (776 kcal) : 601 g sur e0325544 contre 537 g sur cc012345.

**Ce qui a été corrigé pendant la vérification.**
- **Ce n'est pas la cause principale en moyenne.** Remonter à 1,3 kcal/g toutes les boîtes plus diluées retirerait 2 035 g sur 92 702 g servis, soit 2,2 %. Là-dessus, 1 707 g viennent de e0325544 et 87 g de cc012345 [calculé, `verif_R5/boxes.py`].
- **Le plafond de masse a tenu** (`final.verdicts.over_max` = 0). Mais c'est l'énergie de Thomas qui a payé (C6).
- **L'appétit « large » de Fabrice** lui donne un plafond de 1,1 g par kcal, alors qu'il est la personne en perte. Il fait aussi descendre de 110 à 100 la visée du petit-déjeuner de toute la table.
- **La carte de Thomas porte trois cibles différentes pour le même petit-déjeuner :** 466 g, 110 kcal/100 g (soit 621 g) et 100 kcal/100 g (soit 683 g).

### C6. Le rabotage final retire de l'énergie sans le dire

**Ce qui se passe.**
1. **À la table, chacun reçoit d'abord 100 % de sa cible**, sans limite de poids (`bounds_applied: false`, index.ts:14185).
2. **Ensuite, `fitPortionsToBounds` retire ce qui dépasse le plafond de chaque assiette** (index.ts:16856 ; portion_boundary.ts:230-400) :
   - il coupe d'abord l'élément le plus lourd ;
   - il peut descendre chaque élément jusqu'à 50 % de sa masse, ou 70 % pour un légume (box_densify.ts:171-176) ;
   - aucune limite ni compensation en énergie.
3. **`day_kcal` est calculé avant** (index.ts:10115 et 10870-10891) et n'est jamais recalculé. Les compteurs du rabotage ne vont qu'au journal.

**Preuve** [mesuré].
- **Assiettes rabotées :** 26 assiettes pour 1 826 g, soit 2, 6, 16 et 2 selon le plan.
- **Thomas sur e0325544 :**
  - énergie par jour : 2 919 / 3 097 / 3 120 / 3 267 / 2 816 kcal, soit 3 044 en moyenne (−232 kcal/j) pour une cible de 3 276 ;
  - `day_kcal` affiche pourtant 100 % ;
  - dîner de dinde : 956 → 609 kcal ;
  - prise réelle ≈ 0,14 kg/sem au lieu de 0,35 [calculé, à 7 700 kcal par kg].
- **Sur les autres plans :** −1, −66 et +17 kcal/j. Moyenne sur les 4 plans : −70 kcal/j.

**Ce qui a été corrigé pendant la vérification.**
- **Toutes les assiettes rabotées ne sont pas à Thomas :** 21 à Thomas, 3 à Christèle, 2 à Fabrice.
- **Énergie retirée sur e0325544 seul :** environ 1 400 kcal. Thomas 1 174 et Fabrice 46 sont mesurés ; Christèle ≈ 176 est estimé.
- **« La part de féculent monte » est l'exception** : ce n'est vrai que pour les dîners de dinde (32 → 47 %). Dans 11 des 14 assiettes de Thomas qu'on peut lire, l'élément le plus lourd était le féculent que la règle du féculent à part venait de gonfler. **Ces deux règles s'annulent : le surplus d'énergie de Thomas est mis dans le féculent, puis retiré par le rabotage.**
- **Dans les dîners de dinde, Thomas finit avec moins de dinde que Fabrice** (144 g crus contre 182 g), alors que Thomas est en prise de muscle et Fabrice en perte.
- **Le rabotage n'est pas totalement invisible** : `served_over_max` = 16 puis `final.verdicts.over_max` = 0. En revanche, **aucun compteur ne donne les kcal retirées**.

### C7. L'ajusteur de proportions déforme la recette commune

**Ce qui se passe.**
- **Ce que fait l'ajusteur.** `adjustPlanProportions` (index.ts:13508 ; proportion_adjust.ts) réécrit les casseroles communes par pas de 5 g, pour rapprocher chaque assiette de sa fourchette de densité.
- **Qui décide.** Toutes les assiettes d'un même plat ont la même composition. Là où seul Thomas est hors fourchette, c'est donc lui qui décide pour toute la table.
- **Quand la réécriture est gardée.** Dès qu'une ligne a changé (index.ts:13520).

**Preuve**, sur e0325544 [mesuré et calculé] :
- 181 pas, 17 lignes réécrites, 18 assiettes hors fourchette avant comme après.
- Bœuf-chou multiplié par 0,75, orge par 1,42.
- Gain pour Thomas : la densité de son assiette passe de 119 à 123 kcal/100 g, alors qu'il lui en faut ≈ 156. Cela fait au plus +35 kcal.
- En échange, Christèle reçoit 244 g de plat principal et 387 g d'orge, au lieu d'environ 356 et 299 g : −31 % de plat principal, +29 % d'orge, soit +33 g de céréale sèche.

**Ce qui a été corrigé pendant la vérification.**
- **L'ajusteur n'agit que sur 2 plans sur 4** (e0325544 et 1e553ca1). Il ne fait **rien** sur cc012345, le plan adopté.
- **Il n'ajoute pas toujours du féculent.** Sur 1e553ca1, les pommes de terre passent à ×0,50 et la dinde à ×1,12 : le féculent tombe de 49 à 30 % pour tout le monde. Le jeudi midi de e0325544, il n'a pas ajouté de couscous : il a réduit la casserole poulet-légumes à ×0,75.
- **Il corrige un peu.** Chaque pas réduit l'écart, sans jamais le fermer.
- **Mécanisme déduit, non rejoué.**

### C8. Légumes sous le minimum, jamais vérifiés dans les boîtes

**Ce qui se passe.**
- **Le minimum porte sur une « part » qui n'a pas d'énergie fixée.** La consigne demande au moins 150 g de légumes crus par part, visée 200 (household_meal_generation.ts:891 et 936-937). Mais la part écrite par le modèle fait entre 497 et 1 161 kcal.
- **La formule de la boîte.** Les légumes d'une boîte valent : légumes par part × (énergie de la personne ÷ énergie de la part). Plus la part écrite est riche, moins chacun reçoit de légumes.
- **Thomas reçoit les légumes de la personne du milieu.** Au-dessus d'elle, il reçoit sa casserole principale, donc ses légumes aussi.
- **Personne ne corrige.** `foodQualityOf` (plan_food_quality.ts:417) compte les boîtes sous le minimum, ne corrige rien, et aucun lecteur n'utilise ce compte.

**Preuve** [mesuré].
- **50 boîtes-repas sur 120 sont sous 150 g crus** : Christèle 21, Fabrice 16, Thomas 13. Par plan : 19, 18, 2 et 11, soit exactement le compteur du produit.
- **Minimums :** 76 g (Christèle), 84 g (Fabrice), 95 g (Thomas).
- **19 plats principaux sur 40** sont écrits pile à 150 g par part.
- **Écrire plus ne suffit pas :** cc012345 écrit 200 g, mais pour des parts d'environ 1 100 kcal, et sert donc 109 à 130 g.

**Ce qui a été corrigé pendant la vérification.**
- **Le rabotage n'est pas en cause** : le plan le plus raboté (e0325544) n'a que 2 boîtes sous le minimum.
- **Les seuils sont en grammes crus**, pas cuits.
- **Le sens est bon pour Fabrice, pas la quantité.** Il a déjà le plus de légumes pour 100 kcal (25,8 g, contre 22,7 pour Christèle et 20,9 pour Thomas). Mais il est à 173 g crus en moyenne, et sous 250 g dans 36 repas sur 40.

**Effet.** Il manque 60 à 90 g crus par repas pour atteindre 250 g. C'est peu d'énergie (10 à 45 kcal), mais beaucoup de volume et de satiété.

### C9. Protéines : teneur commune tirée vers le haut, petit-déjeuner « de plat »

**Ce qui se passe.**
- **Sur une case partagée, la teneur en protéines suit le plancher le plus exigeant :** 6,0 g pour 100 kcal, fixé par Fabrice (108 g pour 1 805 kcal). Code : `sharedProteinCaps`, plan_protein_brief.ts:271-278. Compteur `floor_wins_cells` = 15 sur 15 [mesuré].
- **Chacun reçoit ensuite cette recette à sa propre énergie.**
- **Le plafond de protéines n'est qu'une mesure** (protein_ceiling_adjust.ts:145) : il ne corrige rien.

**Preuve** [mesuré].
- **Christèle :** 116 g/j, soit 2,0 g/kg et 166 % de son plancher de 70 g ; 45 g par repas principal.
- **Thomas :** 175 g/j, pour un plafond de 144 g.
- **Fabrice :** 115 g/j. Sur cc012345, il tombe à 107 g/j et passe 3 jours sur 5 sous 108 g (le moteur le signale lui-même).

**Ce qui a été corrigé pendant la vérification.**
- **Les 108 g de Fabrice sont le plancher du maintien, pas celui de la perte.**
  - Calcul : 1,2 g/kg × 89,8 kg, son poids plafonné à un IMC de 30. Le plancher de la perte serait 1,4 g/kg, soit 126 g.
  - Pourquoi : Fabrice n'a pas de compte. Sa fiche passe par `maintenanceEnvelopeFromBody`, qui écrit « maintenance » en dur (meal_envelope.ts:1808-1832 ; household_composition.ts:145-157).
  - Résultat : **son énergie suit la perte, ses protéines suivent le maintien.**
- **Cette règle n'est pas la cause principale de l'excès.** Le modèle écrit environ 6 g pour 100 kcal même quand on lui demande 4,2. Plan d896e07d du 21/09 : 5,95 servis, et Christèle à 118 g/j. L'excès vient de trois choses :
  - une seule recette, dimensionnée à l'énergie de chacun ;
  - « une protéine entière à chaque repas principal » ;
  - 100 à 150 g de viande par part.
- **Au petit-déjeuner, Thomas pousse autant que Fabrice.** Son plancher par repas (38 g, soit 5,55 g pour 100 kcal à 683 kcal) pèse autant que celui de Fabrice.
- **Le même « at least 38 g of protein » est imprimé sur les collations de Thomas** (329 kcal), alors que sa carte dit 12 à 14 g (index.ts:8617-8638). Le modèle suit la carte : 14 g.
- **L'huile et le parmesan ne viennent pas du plancher de protéines** (l'huile n'en contient pas). Ils viennent de la densité demandée pour Thomas (C2).
- **Petit-déjeuner avec une protéine « de plat » : 17 jours sur 20, et non 13** (13 tofu ou tempeh, plus 4 œufs).

### Ce qui n'est pas en cause

**Les cibles d'énergie.** Elles sont dans les fourchettes calculées indépendamment (Mifflin-St Jeor × niveau d'activité EFSA) :

| Entretien | Mon calcul | Le produit |
|---|---|---|
| Thomas | 2 806 – 3 069 kcal | 2 891 |
| Christèle | 1 860 – 2 040 kcal | 1 944 |
| Fabrice | 2 496 – 2 754 kcal | 2 687 |

Une réserve : l'entretien de Fabrice est pris en haut de sa fourchette (niveau d'activité 1,56), et son déficit est au maximum (−880 kcal, 33 % de l'entretien, 0,86 % de son poids par semaine). Avec un niveau de 1,5, sa cible baisserait d'environ 105 kcal/j.

**La répartition entre moments.** Sur 3 moments comme sur 5, elle est dans les repères.

**La taille absolue des parts écrites par le modèle** : voir C4.

**Le levier d'appétit.** Depuis le 2026-09-10, il ne change plus l'énergie (`void args.appetite`, meal_envelope.ts:1257). Il ne fait que multiplier le plafond de masse par 0,9, 1,0 ou 1,1. Passer Fabrice de « large » à « petit » :
- ramènerait ses plafonds de 700 à 630 g, de 695 à 569 g et de 497 à 407 g ;
- raboterait 4 boîtes sur 60, soit ≈ 15 kcal/j perdues sans le dire ;
- rendrait le petit-déjeuner partagé plus dense pour les trois (plancher 100 → 112).

Le seul levier d'énergie est le cran du bilan : ±5 % par cran, ±10 % au plus (mouth_anchor.ts:1220). `NOMENCLATURE-MEMOIRE.md` dit encore le contraire.

**Le plafond de 700 g à lui seul.** Le baisser sans sortir d'énergie du plat demanderait 163 kcal/100 g à Thomas (980 ÷ 600), ou lui retirerait de l'énergie.

---

## 5. Le regard du nutritionniste

### Thomas (prise de muscle, 3 386 kcal/j)
- **Quantité.** Juste sur la journée, sauf sur e0325544 (−232 kcal/j).
- **Proportion.** Plats trop gros (686 g, médiane 700) et trop féculents : 163 g de céréale sèche, 45 % de la masse, 61 % sur les repas à céréale. Une grande portion de sportif, c'est 90 à 120 g secs [supposé].
- **Protéines.** 175 g/j (2,43 g/kg) : au-dessus du maximum utile (2,2 g/kg). Sans risque, mais inutile.
- **Fibres.** 63 g/j, jusqu'à 89 g : c'est beaucoup à finir. Toutes les céréales sont complètes. Un professionnel en mettrait une partie en raffiné pour lui.
- **Collations.** 329 kcal, au bas de la fourchette de 300 à 500 kcal.
- **Ce qu'un professionnel servirait au déjeuner** [calculé, `dieteticien/assiettes_types.py`] :
  - un plat de 560 à 650 g (100 g de couscous sec, 150 g de poulet cru, 200 g de légumes, 15 g d'huile ; ≈ 690 kcal) ;
  - à côté : 60 g de pain, un fruit et du fromage blanc (≈ 325 kcal).
  
  L'énergie en plus passe par les collations et des aliments denses à côté, pas par un plat plus gros.

### Christèle (maintien, 1 944 kcal/j, 55 ans)
- **Quantité.** La journée est juste. L'assiette est trop grosse (543 g contre ≈ 450 g), parce qu'elle porte tout le repas.
- **Proportion.** Elle reçoit la recette du modèle telle quelle :
  - 115 g de céréale sèche les jours de céréale (repère : 50 à 70 g) ;
  - 42 % de féculent en masse ;
  - légumes sous 150 g crus dans 21 repas sur 40.
- **Fruits et laitages.** 64 g de fruits et 98 g de laitages par jour. À 55 ans, le calcium compte. Il n'a pas été mesuré : le référentiel n'a pas de colonne calcium.
- **Protéines.** 116 g/j, le double de son besoin (1,0 à 1,2 g/kg).
- **Petit-déjeuner.** Elle a demandé « très léger, fruit, muesli, pas d'œufs ». Elle reçoit 485 kcal et 350 g, avec du tofu ou des œufs (107 g d'aliment protéique en moyenne), dont des œufs 4 fois sur e0325544.
- **Ce qu'un professionnel servirait :**
  - au déjeuner (778 kcal) : un plat d'environ 490 g (≈ 507 kcal), plus un fruit de 150 g, un yaourt nature et 40 g de pain (≈ 250 kcal) ;
  - au petit-déjeuner : 50 g de muesli, un yaourt et une pomme (≈ 390 kcal, 335 g).

### Fabrice (perte de poids, 1 807 kcal/j, 59 ans)
- **Quantité.** Juste, mais la cible est au maximum de ce qu'on conseille (déficit de 33 %).
- **Proportion : c'est là que le bât blesse.**
  - Sa boîte a une masse normale (505 g), mais la même densité que celle de Thomas : 1,34 kcal/g, alors qu'on conseille au plus 1,1.
  - 33 % de féculent et 32 % de légumes ; la moitié de légumes dans 2 repas sur 40 seulement.
  - Il a moins de féculent que les autres (80 g secs), mais uniquement grâce au plancher de protéines. C'est encore 1,6 à 2 fois le repère d'une perte (35 à 50 g).
- **Protéines.** 115 g/j (1,23 g/kg). En perte, à 59 ans, on vise 1,2 à 1,6 g/kg du poids ajusté, soit 95 à 127 g [supposé] : il est au bas de la fourchette. Le code prévoit 126 g, mais ne les lui applique pas (C9).
- **Fruits.** 60 g/j.
- **Appétit « large ».** Le levier actuel ne lui donne pas un plat plus volumineux et plus vert. Il ne fait qu'élargir son plafond.
- **Ce qu'un professionnel servirait au déjeuner** (723 kcal) :
  - un plat d'environ 550 g à 0,93 kcal/g (54 % de légumes, 24 % de féculent, 48 g de protéines) ;
  - un fruit, un yaourt et 25 g de pain à côté (≈ 211 kcal).
- **Attention au changement brutal.** Il passerait d'environ 430 g à environ 990 g de fruits et légumes par jour. Les fibres doivent monter progressivement, sur 1 à 2 semaines.

### Pour les trois
- **Les petits-déjeuners sont salés et gras** : 45 % de l'énergie vient des lipides, parce qu'ils doivent « porter une protéine entière ». Un petit-déjeuner français, c'est une céréale ou du pain, un laitage et un fruit, pour 200 à 350 g.
- **Le « yaourt grec » du référentiel est un yaourt à la grecque entier** : 3,3 g de protéines et 9,2 g de lipides pour 100 g. Le modèle le prend pour une source de protéines.
- **Il manque un vrai fruit et un vrai laitage aux repas.**

---

## 6. Les contraintes en place et comment elles interagissent

### 6.1 Inventaire

| Contrainte | Valeur | Où | Effet sur les portions |
|---|---|---|---|
| Curseur de rythme = contrat (23/09) | perte ≤ 0,8 kg/sem ; prise ≤ 0,5 kg/sem ; ≤ 1 % du poids ; déficit ≤ 880 kcal ; plancher 1 500 kcal (homme) / 1 200 (femme) | weight_pace.ts:166, 202 ; meal_envelope.ts:144 | fixe l'énergie. Toute correction doit garder l'énergie de la journée |
| Les moments déclarés font loi | aucun moment ajouté ; moments déduits seulement si rien n'est déclaré | FF-060 §0 ; index.ts:5055-5095 | **gonfle** : sans collation, chaque repas porte plus |
| Aucune réserve hors plan (10/09) | seuls les apports fixes déclarés sont retirés | mouth_anchor.ts:456-470 ; index.ts:3522 | **gonfle** : le plat porte 100 % du repas |
| Poids des moments | 0,25 / 0,10 / 0,40 / 0,10 / 0,35 ; moment léger 0,15 / 0,25 / 0,20 | mouth_anchor.ts:425, 719 | neutre, mais un moment « léger » déplace l'énergie vers les autres |
| Plafond de masse | énergie ÷ 1,0 ; ≤ 700 g (repas), ≤ 300 g (collation) ; × appétit | portion_sizing.ts:416-420, 654-664 | laisse passer une assiette à 1 g par kcal |
| Visée « grande assiette » (A15) | visée = plancher × 1,10 ; case partagée = plancher le plus haut | portion_sizing.ts:823 ; household_portions.ts:1267, 1466-1492 | **gonfle** |
| Report vers les repas pris seul | 140 kcal/100 g × plafond | slot_nutrition_contract.ts:357 | fixe la densité demandée au plat de Thomas : **met Thomas à 700 g**, pousse vers l'huile et le fromage |
| Plancher de densité d'un plat | 100 kcal/100 g (60 si léger), sans refus | household_meal_generation.ts:783, 794 | **freine** « plus de légumes » |
| « vegetables ON TOP, never instead » | — | meal_generation.ts:3507-3511 | **bloque** le remplacement du féculent par des légumes |
| Règles de recette | viande 100–150 g crue ; légumes ≥ 150 g (visée 200) ; gras 5–15 ml ou 15–30 g de fromage ; laitages ≤ 250 g/j | household_meal_generation.ts:880-937 | le féculent reste le seul poste libre : **gonfle** le féculent |
| Jamais de portion pour une personne nommée | — | household_meal_generation.ts:852 | **bloque** toute assiette « perte » écrite par le modèle sur un plat commun |
| Plancher de protéines | 1,4 perte / 1,2 maintien / 1,6 prise g/kg ; IMC plafonné à 30 | meal_envelope.ts:761-780 | seul mécanisme qui retire du féculent à Fabrice ; fixe la teneur en protéines de la table |
| Plafond de protéines = mesure (22/09) | 2,0 g/kg | protein_ceiling_adjust.ts:145 | ne corrige rien (voulu) |
| Féculent à part (lot C, 22/09) | casserole principale ×0,75–1,5 ; féculent ×0,4–1,75 ; référence = personne du milieu | starch_side.ts:266, 282-285 | **gonfle** le féculent de Thomas ; neutre pour les autres |
| Ajusteur de proportions | légumes ≥ 70 % ; protéine ≤ 150 % ; autres ≤ 200 % ; huile 0,75–1,25 | proportion_adjust.ts:112-131 | déforme la recette commune (C7) |
| Rabotage | élément le plus lourd d'abord ; planchers de 50 % et 70 % | portion_boundary.ts:369 ; box_densify.ts:171 | retire de l'énergie sans le dire (C6) |
| Réparations par le modèle | 2 au plus, 65 à 114 s chacune | `PLAN_MODEL_REPAIR_BUDGET` | favorise les corrections calculées par le moteur |
| Boîtes v4 | gramme pesé seulement en perte ou en prise ; bac commun en maintien ; jamais de kcal sur un bac ; casserole = somme des boîtes | BOITES-PAR-REPAS.md ; index.ts:16332 | un à-côté doit se compter en unités |
| Appétit | ×0,9 / 1,0 / 1,1 sur les bornes de masse seulement (A8) | meal_envelope.ts:1257 ; portion_sizing.ts:655-664 | ne règle pas la portion |
| Durée de génération | 116 à 209 s sur les 4 plans ; sur 16 plans du foyer en 8 jours : médiane 160 s, 90 % sous 212 s, maximum 271 s [mesuré, `student_meal_drafts.wall_ms`] | — | tout ajout au prompt coûte. Le chiffre de 59–144 s qui circule est périmé |

### 6.2 Les interactions qui produisent les assiettes « bizarres »

1. **3 moments + aucune réserve + un plat par case → le plat porte tout le repas.** Aucune règle ne peut l'alléger sans retirer d'énergie. Le seul mécanisme qui sort de l'énergie d'une case partagée (le report à 140) ne l'envoie que vers un repas pris seul, et Christèle et Fabrice n'en ont aucun.
2. **Plancher le plus haut de la table + report à 140 → la recette commune est écrite pour Thomas.**
   - Une céréale cuite (1,29 à 1,35 kcal/g) ne peut pas atteindre 1,40 kcal/g : seuls l'huile, le fromage ou le pain y arrivent.
   - D'où l'huile et le parmesan au maximum (6 casseroles) et le pain à 180 g par part (cc012345).
   - Ces plats denses sont ensuite servis tels quels à Fabrice.
3. **Le féculent à part et le rabotage s'annulent chez Thomas.**
   - La première règle met son surplus d'énergie dans le féculent, qui devient l'élément le plus lourd.
   - Le rabotage le coupe donc en premier, et la prise de Thomas disparaît (−232 kcal/j sur e0325544).
   - `day_kcal`, calculé avant, affiche 100 %.
4. **Le plancher de protéines de Fabrice est le seul chemin vers « moins de féculent ».** Il ne fonctionne que par accident. Quand le reste de la journée couvre déjà son plancher, Fabrice reçoit la recette de Christèle.
5. **À énergie égale, plus de légumes veut dire une assiette plus lourde.** Un plat de perte à 1,0 kcal/g qui porte 723 kcal pèse 723 g. On ne peut donner à Fabrice « la moitié de légumes » qu'en sortant de l'énergie du plat, ou en acceptant une assiette d'environ 600 g.
6. **Un moment « léger » + un recalcul des parts → le midi et le soir grossissent.** Et la note « très léger » de Christèle, bien enregistrée en base, n'a jamais été traduite en réglage.
7. **Les exclusions sont enregistrées, mais le contrôle ne regarde rien.** Le contrôle ne lit que les boîtes écrites par le modèle, et depuis la version v4 il n'en écrit aucune (lot 4).

### 6.3 Ce qu'il ne faut pas refaire (déjà tenté, puis retiré)

- « paume et poing » ;
- un poids d'assiette chiffré (« 600–750 g ») ;
- l'appétit qui change les calories ;
- l'huile comme levier de densité ;
- les réparations de densité par le modèle ;
- les rapports 0,6 / 2,5, et la masse traitée comme un veto ;
- la poursuite du plafond de protéines ;
- densifier la recette commune à 1,5–1,6 kcal/g ;
- `member_deltas` ;
- la réserve non servie de 58 % (les plats devenaient trop petits) ;
- une troisième formulation de note pour faire bouger des grammes ;
- se contenter de remonter les chiffres de la consigne : le moteur remet chaque part à l'échelle, donc cc012345 écrit 200 g de légumes par part et en sert quand même 11 boîtes sous 150 g.

---

## 7. Les recommandations, en lots

### 7.1 Vue d'ensemble

| Lot | Contenu | Effort | Dépend de | Décision à prendre | Effet |
|---|---|---|---|---|---|
| 0 | Mesurer juste | petit à moyen | — | non | aucun sur les assiettes. Préalable à toute mesure |
| 1 | Un à-côté prévu au déjeuner et au dîner | gros | 0 | **oui (Q1, Q9)** | le plus fort |
| 2 | La forme de l'assiette suit l'objectif | petit à moyen | 1 (réglé avec lui) | non | fort pour Fabrice |
| 3 | Demander au modèle une assiette ordinaire | moyen | 1, 2 | **oui (Q2, Q3, Q4)** | fort, mais dépend de la fidélité du modèle |
| 4 | Les consignes du foyer qui ne tiennent pas | moyen | — (peut partir tout de suite) | Q4, Q5, Q6 | exclusions, matin léger, protéines |
| 5 | Rabotage et ajusteur : ne plus déformer sans le dire | petit à moyen | 0 | non | faible sur le plan adopté |
| 6 | Conditionnel : plafond de féculent de la grosse assiette | moyen | mesure après les lots 1 à 3 | oui | à décider sur mesure |

### 7.2 Avant → après, en chiffres

Chaque colonne a sa propre base de calcul :
- **Aujourd'hui** : mesuré sur les 4 plans (`data/plates.json`).
- **Lots 1 et 2, recettes actuelles** : calculé en rejouant le partage du féculent à part sur les recettes réellement écrites des 3 plans récents, Thomas à 3 386 kcal (`sim/synthese/plan_retenu.py`, scénario « Lot1+2 »). Le rejeu retrouve 58 lignes sur 60 du journal.
- **Lots 1, 2 et 3b, gabarit de recette** : calculé sur une semaine type de 10 déjeuners et dîners (6 à la céréale, 2 à la pomme de terre, 2 au pain), avec le gabarit de recette du lot 3b, fromage à 15 g, sans le lot 3c (`critique/gabarit.py`). La médiane de Thomas sans le lot 3c est recalculée à partir des mêmes lignes.

| Mesure (déjeuners et dîners, sauf mention) | Aujourd'hui [mesuré] | Lots 1 et 2, recettes actuelles [calculé] | Lots 1, 2 et 3b, gabarit [calculé] |
|---|---|---|---|
| Plat de Thomas | moyenne 686 g, médiane 700 | moyenne 591, médiane 580 | médiane ≈ 615 (430 à 700) |
| Plat de Christèle | moyenne 543, médiane 543 | moyenne 414, médiane 419 | médiane ≈ 433 (323 à 567¹) |
| Plat de Fabrice | moyenne 505, médiane 500 | moyenne 402, médiane 383 | médiane ≈ 416 (354 à 488) |
| Céréale sèche, repas qui en contiennent : T / C / F | médiane 166 / 114 / 82 g (max 194 / 162 / 126) | médiane 120 / 65 / 45 g (max 178 / 101 / 67) | ≈ 100–136 / 57–69 / 45–46 g² |
| Part de l'énergie du plat venant du féculent (repas à deux casseroles) : T / C / F | 0,57 / 0,48 / 0,39³ | 0,54 / 0,41 / **0,28** | ≈ 0,49–0,55 / 0,39 / 0,30 |
| Légumes crus dans le plat : T / C / F | 191 / 162 / 173 g | 175 / 144 / 163 g | ≈ 200 / 167–201 / ≈ 200 g |
| Crudités à côté | 0 | 100 / 100 / 150 g | 100 / 100 / 150 g |
| Fruits par jour | 231 / 64 / 60 g | 541 / 364 / 360 g | pareil |
| Protéines par jour | 175 / 116 / 115 g | 166 / 106 / 115 g | à mesurer (la casserole principale du gabarit porte 37 g par part) |
| Jours de Fabrice sous 108 g de protéines | 3 sur 5 (cc012345) | 4 sur 15 | à mesurer ; objectif 0 |
| Énergie servie par jour | 3 206 (3 044 sur e0325544) / 1 931 / 1 805 | 3 358 (cible 3 386) / 1 914 / 1 799 | pareil par construction |
| Énergie de Thomas perdue au rabotage | ≈ 70 kcal/j en moyenne, 232 sur e0325544 | ≈ 14 kcal/j⁴ | 0 à la céréale ou au pain ; 11 à 200 kcal par repas à la pomme de terre → pas de pomme de terre à sa table |
| Masse de la journée | 2 385 / 1 436 / 1 335 g | 2 760 / 1 838 / 1 861 g | proche |
| **Repas complet au déjeuner (plat + à-côté)** | 686 / 543 / 505 g | ≈ 900 / 789 / 827 g | ≈ 925 / 808 / 841 g |

¹ 567 g est un déjeuner à la pomme de terre. Le gabarit réserve la pomme de terre aux tables sans personne en prise de muscle.
² Calcul à partir des parts d'énergie du féculent (couscous à 345 kcal/100 g secs) :
- Christèle reçoit la part écrite ajustée à son énergie : 57 à 69 g.
- Fabrice : 30 % de 516 à 528 kcal, soit 45 à 46 g.
- Thomas : 49 à 55 % de 714 à 856 kcal, soit 101 à 136 g.

³ Code actuel rejoué sur les 3 plans récents (même définition que les colonnes suivantes).
⁴ Le script compte deux fois une partie du rabotage des plats à une seule préparation (relevé par la critique). À ±10 kcal près.

**Ce que ce tableau dit.**
- **Le plat maigrit, et la journée gagne un fruit, des crudités et un laitage**, comme dans un repas ordinaire.
- **Christèle et Fabrice arrivent à environ 1,85 kg par jour.** C'est proche des journées types du nutritionniste (1 720 et 1 878 g, [supposé]).
- **Mais le repas complet devient plus lourd que le plat d'aujourd'hui** : ≈ 810 g contre 543 pour Christèle.
  - Le volume ajouté est surtout fait de crudités et de fruits, qui apportent peu d'énergie : 150 g de crudités ≈ 36 kcal.
  - C'est ce qu'il faut pour la satiété de Fabrice.
  - En revanche, si l'à-côté arrivait dans la même boîte, l'impression « trop gros » empirerait. **Il doit être présenté à part.** C'est la question Q1.
- **Le lot 3c** (seuil de report à 116 au lieu de 140) ne change que Thomas : son plat du midi à la céréale passe de 669 à 635 g, et ses collations de 282 à 304 kcal. Il est présenté à part, car optionnel.

### Lot 0 : mesurer juste (préalable)

**Changements.**
- **`day_kcal.per_mouth[].served` recalculé sur les boîtes finales.**
  - Quand : **après** `fitPortionsToBounds` (index.ts:16856) et `finalPortionCheck` (index.ts:16977).
  - Comment : avec `boxNutritionByItems` (mouth_energy.ts), le même calcul que `meal-energy-v1`.
  - L'ancien chiffre est gardé sous `served_before_bounds`, et on ajoute `shaved_kcal` par personne et par jour.
- **Compteurs du rabotage enregistrés dans le plan.** `shaved`, `grams_shaved` et le nouveau `kcal_shaved` vont dans `generated_from.household.portion_boundary`. Aujourd'hui, ils ne vont qu'au journal.
- **Nouveau `generated_from.household.plate_load`, par personne**, pour les plats du midi et du soir :
  - masse médiane et maximale ;
  - nombre de plats au-dessus de 550 g ;
  - céréale sèche, médiane et maximale ;
  - légumes crus, médiane et nombre de boîtes sous 150 g ;
  - part d'énergie du féculent ;
  - fruits par jour ;
  - masse du repas complet, à-côté compris.
  
  C'est la seule façon de mesurer Christèle, puisque `meal-energy-v1` refuse ses boîtes.
- **Nouveau `generated_from.food_quality.recipe_shape`**, calculé en lisant la recette et non un champ déclaré par le modèle :
  - céréale sèche et légumes par part écrite (casserole ÷ `servings_made`) ;
  - casseroles où l'huile et le fromage sont tous deux au maximum ;
  - plats sous 100 kcal/100 g ;
  - tofu ou poisson au petit-déjeuner.

**Causes traitées.** C6 (perte d'énergie invisible), et le trou de mesure sur Christèle.

**Avant → après.** Rien ne change dans les assiettes. Mais sur e0325544, Thomas passerait de 3 276 kcal affichées (100 %) à 2 919 / 3 097 / 3 120 / 3 267 / 2 816, soit 93 % en moyenne [mesuré].

**Contraintes respectées.**
- La règle du 22/09 « le total affiché = la somme des boîtes » devient vraie aussi dans le plan enregistré.
- Aucun champ n'est ajouté au modèle, et aucune calorie n'apparaît sur un bac commun.

**Comment on le mesure.**
- **Test de la fonction qui recompose l'énergie servie à partir des boîtes**, avec :
  - un cas qui passe ;
  - un cas raboté ;
  - une modification volontaire de la constante, qui doit faire échouer le test.
- **Sur une vraie génération**, `served` égale la somme des boîtes de `meal-energy-v1` à 1 % près.

### Lot 1 : un à-côté prévu au déjeuner et au dîner

**Changements.**

**1. Un module pur `_shared/keel/planned_sides.ts` (`plannedSidesFor`).** Il puise dans une **liste fermée de slugs** de `food_composition_refs`, sans matcher maison. Les slugs sont à vérifier en base.
- Fruits : au moins 4 en rotation selon les jours de courses (pomme, poire, orange, clémentine, kiwi, banane), et non 10 pommes par semaine.
- Crudités qui se gardent ou se préparent sans découpe à l'avance : radis, tomate, concombre, carotte.
- Laitages : yaourt nature, skyr, fromage blanc.
- Pains : pain complet, baguette.

**2. Contenu par objectif.**

| Objectif | Midi | Soir |
|---|---|---|
| Perte (Fabrice) | crudités 150 g + fruit 150 g + skyr ou fromage blanc 125 g (≈ 195 kcal, 15 g de protéines) | crudités 150 g + fruit 150 g (≈ 116 kcal) |
| Maintien (Christèle) | crudités 100 g + fruit 150 g + yaourt nature 125 g (≈ 175 kcal) | crudités 100 g + fruit 150 g + 30 g de pain complet (≈ 180 kcal) |
| Prise (Thomas) | 60 g de pain + fruit 150 g + crudités 100 g (≈ 270 kcal) | pareil |

Réglages associés :
- **Thomas.** Quand le féculent du plat est déjà une céréale ou du pain, on remplace son pain par un dessert dense (fromage blanc et flocons, ou fruits secs).
- **Fabrice.**
  - Le laitage du petit-déjeuner est décompté, pour rester sous 250 g de laitages par jour, et on alterne skyr et fromage blanc.
  - Les crudités sont introduites sur 1 à 2 semaines.
- **Plafond de l'à-côté : 30 % de l'énergie du moment au plus.** Au-delà, on retire d'abord le pain, puis le laitage. C'est l'équivalent de `COMPOSED_DISH_MIN_MEAL_SHARE` = 0,30, retiré le 10/09. Sans ce plafond, pour un moment léger ou un enfant, l'à-côté pourrait dépasser la moitié du repas.
- **Défauts pour les cas non couverts.**
  - Mineur : fruit et laitage, sans pain, à la taille de sa tranche d'âge.
  - Personne sans objectif : le défaut du maintien.
- **Appétit.** Il règle les crudités : grand 150 g, moyen ou inconnu 100 g, petit 0 g (100 g en perte).

**3. Où l'à-côté s'applique.** Au déjeuner et au dîner, **déclarés ou déduits** (`m.eatingSlots` après déduction), puisque ceux de Thomas sont déduits. La déduction elle-même repose sur 32,4 kcal par kg (eating_structure.ts:25), qui suppose que le plat porte tout le repas : il faut décider si ce calcul tient compte de l'à-côté.

**4. Par quel canal.** Un **canal à part**, `plannedSidesBySlot` (personne → moment → énergie et protéines), qui n'est **jamais** un `FixedIntake`.
- Ce qu'il fait :
  - il est retiré de la cible dans `slotPlanTargets`, à côté de `slotFixedKcal` (mouth_anchor.ts:541) ;
  - il est ajouté à `fixedProteinG` pour `dayProteinFloors` ;
  - le chemin à une personne le reçoit par sa propre entrée ;
  - il ne touche ni `byMouth`, ni `intakes`, ni la section du prompt consacrée aux apports fixes.
- Pourquoi pas le canal des apports fixes :
  - le prompt plafonne ces apports à 8 lignes (`MAX_FIXED_INTAKES` = 8, fixed_intakes.ts:81). Or 3 personnes × 2 repas × 3 à 4 aliments font 18 à 24 lignes : les vraies déclarations sauteraient ;
  - `fixedIntakeLoad.byMouth > 0` sert aussi à décider si on compose le shaker de Thomas (index.ts:5673 et 5709 ; eating_structure.ts:240). Compté comme un apport fixe, l'à-côté ferait disparaître ce shaker ;
  - le chemin à une personne lit la liste plafonnée (index.ts:14271) : l'à-côté y prendrait tout le budget.

**5. Les interrupteurs : `household_member_habits.slots[].extras`** (migration 20260901120000), plutôt que les booléens `takes_*`.
- Clé absente : le défaut de l'objectif.
- `[]` : pas d'à-côté, et son énergie revient au plat.
- Une liste : ces aliments-là.

Ce champ existe déjà par moment, il est contrôlé en base, et il distingue « pas renseigné » de « rien à côté ». On peut récupérer `extrasOf` et `EXTRA_PORTION` dans l'historique git (en-tête de meal_extras.ts). Qui écrit ce champ est une question (Q9).

**6. Dans les boîtes.**
- Les lignes de l'à-côté sont marquées `side: true`.
- Elles sont **exclues** de la borne d'assiette (`fitPortionsToBounds`, `finalPortionCheck`, verdicts de `plateBoundsFor`).
- Elles sont **comptées** dans l'énergie du jour (lot 0) et par `meal-energy-v1`.
- À l'écran : une ligne « à côté », non pesée, séparée du plat.
- Dans la liste de courses : en unités (1 pomme, 1 yaourt, 2 tranches).

**7. Consigne.** Une ligne sur chaque carte : « servi à côté par l'app : … ; ne compose pour elle ni dessert ni pain ». Le budget de 250 g/j de laitages annoncé au modèle est réduit du laitage de l'à-côté.

**8. Fiche de la personne (`MouthFormDialog.tsx`).** On remet la question « Un dessert, un fruit ou un yaourt ? » (la clé `household.mouth.takes_dessert` existe) et celle du pain, branchées sur `slots[].extras`.

**9. Compteur `generated_from.household.planned_sides`.** Il donne : personnes, cases, kcal, répartition par objectif, retraits par interrupteur, retraits par exclusion, laitages réduits, et **masse que le plat aurait eue sans l'à-côté, dans la même génération**.

**Causes traitées.** C1 surtout, C8 (par les crudités), et en partie C2 et C6 : le plat partagé de Thomas passe de 980 à ≈ 856 kcal au déjeuner et à ≈ 714 au dîner.

**Avant → après, lot 1 seul** [calculé, `sim/synthese/plan_retenu_out.txt`].

| | Plat | Autre changement | Céréale sèche (médiane) | Fruits par jour |
|---|---|---|---|---|
| Christèle | 546 → 411 g | plats au-dessus de 550 g : 17 → 0 sur 30 | 111 → 82 g | 67 → 364 g |
| Fabrice | 516 → 398 g | — | 94 → 72 g | 62 → 360 g |
| Thomas | 687 → 589 g | plats au-dessus de 650 g : 29 → 8 sur 30 ; énergie servie 3 216 → 3 358 kcal ; perte au rabotage 114 → 14 kcal/j | 165 → 139 g | — |

**Revers.** Les légumes **dans le plat** baissent : Christèle 175 → 131 g, Fabrice 185 → 146 g, Thomas 206 → 159 g. Les crudités les compensent, et c'est pour cela que le lot 2 suit immédiatement.

**Contraintes respectées.**
- **Curseur = contrat.** Plat + à-côté = cible du moment ; l'énergie de la journée ne bouge pas.
- **Plancher de protéines.** Les protéines de l'à-côté entrent dans le reste de la journée.
- **Bornes de masse.** Inchangées ; elles portent sur le plat seul.
- **Moments déclarés.** Aucun moment n'est ajouté.
- **« Jamais de portion pour une personne nommée ».** Respecté : c'est le moteur qui compose l'à-côté.
- **Laitages ≤ 250 g/j.** Tenu, par la réduction du budget.
- **Boîtes v4.** L'à-côté se compte en unités, sans calories sur un bac.
- **Appels au modèle.** Aucun n'est ajouté.
- **Décision du 10/09.** Ce n'est pas une réserve cachée : c'est de la nourriture prévue, achetée, affichée et comptée. Mais le repas n'est plus à 100 % dans le plat, ce qui contredit « There is no starter: the dish is the unit » (household_meal_generation.ts:941). → **Q1**.

**Comment on le mesure.**
- **Tests :**
  - `plannedSidesFor` par objectif, appétit, `extras` et exclusion, avec un cas qui passe et un cas refusé ;
  - `slotPlanTargets` : cible moins l'à-côté ;
  - `shakeDecisionFor` rend le même état avec et sans à-côté ;
  - `interleaveUnderCeiling` rend les mêmes lignes, et `dropped` reste à 0 sur le foyer de test ;
  - un moment léger, et un enfant de 4 à 10 ans.
- **Critères de la génération réelle :** voir la grille du §7.3.

### Lot 2 : la forme de l'assiette suit l'objectif

**Changements** (starch_side.ts).

**1. L'objectif entre dans le partage.**
- `splitStarchSide(…, goal)` reçoit l'objectif (nul pour un mineur, passé à index.ts:10634 depuis `bucketOf`, index.ts:10043-10052).
- Nouvelle constante `STARCH_KCAL_SHARE_MAX = { fat_loss: 0.30, maintenance: 0.45 }` : part maximale de l'énergie de l'assiette venant du féculent.
- Elle s'applique aussi à la personne du milieu et en dessous, là où le partage est aujourd'hui « uniforme ».

**2. Une bande basse**, pour qu'une assiette de perte garde un vrai féculent : `STARCH_KCAL_SHARE_MIN` = **le plus petit de 0,20 et de la part de féculent de la recette**. Sans ce « plus petit », une recette déjà pauvre en féculent recevrait plus de féculent que prévu : 1e553ca1, pommes de terre, part 0,18 dans la recette → 0,20 servie à Fabrice.

**3. Des bornes élargies, pour la perte seulement.** `MAIN_FACTOR_MAX_RATIO` passe de 1,5 à 2,0 et `SIDE_FACTOR_MIN_RATIO` de 0,4 à 0,25 (starch_side.ts:283-284). Le plancher de protéines et la borne de masse sont inchangés.

**4. Deux nouvelles issues**, `goal_shape` et `share_floor`, dans `STARCH_SPLIT_OUTCOMES`.

**5. La grosse assiette garde au moins la casserole principale de la personne du milieu.** Au-dessus de la personne du milieu, la part de casserole principale est **au moins** celle que cette personne reçoit après sa propre forme d'objectif, sans le plafond actuel. La simulation appliquait par erreur un plafond : Thomas y recevait moins de légumes que Christèle (e0325544, jeudi midi : 186 contre 207 g). À recalculer.

**6. Aussi pour une personne seule.** `shadowSizing` s'arrête dès qu'il y a moins de deux personnes à table (index.ts:10036, `off("single_mouth")`). Le partage du féculent ne tourne donc jamais pour une personne seule. Or c'est l'entrée du produit, et la page d'accueil parle de perte de poids. → Appliquer le même module sur le chemin à une personne (index.ts:14213 et suivantes) quand le plat a deux casseroles.

**Causes traitées.** C3, C8 (légumes dans le plat), et en partie C4.

**Avant → après** (lots 1 + 2 comparés au lot 1 seul) [calculé, `sim/synthese/plan_retenu_dist.txt`].

| | Céréale sèche (médiane) | Part d'énergie du féculent | Légumes dans le plat | Autre |
|---|---|---|---|---|
| Fabrice | 72 → **45 g** (min 20 → 29, max 88 → 67) | 0,38 → **0,28** | 146 → 163 g | protéines 110 → 115 g/j |
| Christèle | 82 → 65 g | 0,48 → 0,41 | 131 → 144 g | — |
| Thomas | 139 → 120 g | — | 159 → 175 g | — |

L'énergie de chaque case reste identique, par construction.

**Pourquoi pas plus fort.**
- Bornes élargies **et** plancher de protéines à 126 g : la céréale médiane de Fabrice tombe à 22 g, avec des cases à 13 g. Une cuillère de couscous, c'est exactement l'effet « bizarre » qu'on cherche à éviter (`sim/synthese/bornes_out.txt`).
- Bornes actuelles (1,5 / 0,4) : médiane 52 g, mais 4 cases sur 16 sous 35 g, et une part de féculent médiane de 0,35.

**Contraintes respectées.**
- Énergie de chaque case inchangée.
- Plancher de protéines gardé.
- Plafond de protéines : il reste une mesure.
- Bornes de masse tenues.
- Pour la prise de muscle, la règle du féculent à part est inchangée.
- Aucune réparation par le modèle.
- « Vegetables ON TOP » n'est pas touché.
- L'échec des anciens rapports 0,6 / 2,5 ne se répète pas : les bornes ne s'ouvrent que pour la perte, dans le sens de plus de casserole principale, et entre deux limites (20 à 30 % de l'énergie).

**Comment on le mesure.**
- **Tests :**
  - perte sous la personne du milieu → `goal_shape`, avec une part au plus de 0,30 ;
  - cas `share_floor` ;
  - recette à moins de 20 % de féculent : le partage ne doit pas en ajouter ;
  - objectif nul → comportement actuel ;
  - cas d'une personne seule ;
  - une modification volontaire de 0,30 en 0,45 doit faire échouer un test écrit avec la valeur en toutes lettres.
- **Génération réelle :** dans le même plan, enregistrer l'assiette « uniforme » à côté de l'assiette servie. Critères : grille du §7.3.

**Risques.**
- Plus de casserole principale veut dire aussi plus de viande et d'huile : environ 12 g d'huile par assiette pour Fabrice. Le gabarit du lot 3b (10 ml par part) corrige cela.
- Les plats à une seule préparation (salades, pitas : 12 sur 40) échappent à la règle.

### Lot 3 : demander au modèle une assiette ordinaire

Les deux parties partent ensemble, et la visée (3a) **s'aligne sur** le gabarit (3b).

**3b. Le gabarit de recette** (`standardRecipeBlock`). Une part = l'assiette de la personne du milieu.

*Déjeuner et dîner, par part.*
- **Casserole principale :**
  - 110 à 130 g de protéine maigre crue ;
  - 180 à 200 g de légumes crus ;
  - 10 ml d'huile ;
  - au plus 15 g de fromage.
- **Casserole de féculent** (la clé `separable_side` est dans la même phrase), « never more » :
  - 60 à 70 g de céréale sèche ;
  - **ou** 220 à 250 g de pomme de terre crue, seulement si personne à table n'est en prise de muscle (sinon Thomas bute sur 700 g et perd 112 à 200 kcal au rabotage) ;
  - **ou** 80 à 90 g de pain.
- Le modèle vérifie en divisant chaque casserole par `servings_made`.

*Phrases à retirer ou à remplacer.*
- **À retirer :**
  - « Reach the density with the starch » (household_meal_generation.ts:881-882) ;
  - la phrase sur l'énergie qui viendrait du féculent (:914-916) ;
  - « SMALLEST serving… 150 g… aim 200 g » (:936-937), puisque le modèle ne connaît pas les facteurs de chacun.
- **À remplacer :** « more starch » (:1023-1024) devient « less cooking water, legumes in the main pot or 10 g more cheese; never more starch than the template, never fewer vegetables ». Même correction dans `DENSITY_CONSEQUENCE` (household_portions.ts:1571-1576).
- **À ajouter :** « never more than the recipe template gives », à meal_generation.ts:3507-3511.

*Petit-déjeuner, par part.*
- 50 à 60 g de flocons ou de muesli, ou 70 g de pain complet et 10 g de beurre ;
- 125 g de skyr ou de fromage blanc, ou 200 ml de lait ;
- 1 fruit de 100 à 120 g ;
- 15 à 20 g d'oléagineux ;
- œufs : 2 au plus par part, jamais pour une carte qui les exclut ;
- la phrase « a frittata with 300 g of tomato per serving is not a breakfast » ;
- nommer le skyr et le fromage blanc comme sources de protéines, jamais le « yaourt grec » ;
- sur la carte de Christèle : « fruit + muesli ».

*Carte prise de muscle* (household_prompt_v34.ts:238-241) : un gabarit de collation dense (au moins 170 kcal/100 g, « a shake alone does not carry it »).

**3a. La visée, alignée sur le gabarit.**
- **Visée imprimée d'une case partagée = densité du gabarit pour le féculent de la case**, et non un calcul à part. Environ 126 kcal/100 g avec la céréale, 106 avec la pomme de terre, 155 avec le pain [calculé, `critique/gabarit_out.txt`]. Sinon, on réintroduit deux cibles pour une même recette.
- **Borne basse = le plus grand du plancher commun et de cette visée.** On accepte de dépasser 140 si le plancher l'exige, par exemple pour un gros mangeur seul.
- **Avec le lot 1, le plancher commun tombe de lui-même** : le plat partagé de Thomas passe à 856 kcal, soit 856 ÷ 700 = 122 au déjeuner, et à 714 ÷ 700 = 102 au dîner [calculé].
- **Phrases retirées :**
  - « we ask for the bigger plate » (household_portions.ts:1267) ;
  - « as LOW as… the largest plate each person's bounds allow » (household_prompt_v34.ts:520-525).
- **Une seule visée par carte**, et l'appétit ne compte plus dans la visée d'un plat partagé.

**3c, optionnel (Q3).** `SHARED_TABLE_MAX_ASK_PER_100G` passe de 140 à 116. Effet faible dans ce foyer : plat de midi de Thomas 669 → 635 g, collations 282 → 304 kcal. C'est une marge pour de plus gros mangeurs.

**Causes traitées.** C4, C5, C8 (légumes dans le plat), C2 (densité demandée), et en partie C9 (petit-déjeuner).

**Avant → après** [calculé, `critique/gabarit.py`].

*Densité du gabarit.*
- Casserole principale : 1,225 kcal/g avec 15 g de fromage, pour 37 g de protéines par part.
- Part complète avec couscous : 1,26 kcal/g.

*Médianes de la semaine type.*

| | Fromage à 15 g | Sans fromage |
|---|---|---|
| Thomas | ≈ 615 g (≈ 598 avec 3c) | ≈ 605 à 650 g |
| Christèle | ≈ 433 g | ≈ 428 à 464 g |
| Fabrice | ≈ 416 g | ≈ 456 à 461 g |

*Petits-déjeuners, si le modèle suit.* 683 / 486 / 452 g → environ 492 / 350 / 326 g. La frittata à 0,98 kcal/g n'est plus demandée.

**Contraintes respectées.**
- Gras en filet, jamais les deux au maximum.
- Viande entre 100 et 150 g.
- Légumes au moins 150 g.
- Plancher de 100 kcal/100 g inchangé.
- Ce n'est pas un retour du « 600–750 g » : c'est une proportion dans une part que le moteur remet à l'échelle, jamais un poids d'assiette.
- Le lot renverse la règle du 21/09 (la visée d'une case partagée prend le plancher le plus haut) et l'arbitrage A15 (on vise la grande assiette). → **Q2**

**Comment on le mesure.**
- **Tests** qui lisent le texte de la consigne. La phrase du gabarit doit contenir, **ensemble**, la promesse et la clé de schéma.
- **Compteurs `recipe_shape` (lot 0)**, sur 3 tirages :
  - céréale sèche par part écrite : médiane au plus de 75 g (aujourd'hui 150) ;
  - légumes par part : médiane au moins de 180 g ;
  - casseroles avec l'huile et le fromage tous deux au maximum : 0 (aujourd'hui 6) ;
  - plats sous 100 kcal/100 g : 0 ;
  - petits-déjeuners : au plus 400 g pour Christèle et Fabrice, au plus 520 g pour Thomas.

**Risques.**
- La fidélité du modèle. Il faut 3 tirages avant de conclure.
- La durée de génération, déjà de 116 à 209 s sur ces plans.

### Lot 4 : les consignes du foyer qui ne tiennent pas (peut partir tout de suite)

**a) Le contrôle des exclusions ne regarde rien, et la cause est identifiée.**
- **Ce qui ne marche pas :**
  - `exclusionBelt.checked` n'est compté que dans la boucle des boîtes **écrites par le modèle** (meal_generation.ts:8961-8993) ;
  - en v4, le modèle n'en écrit aucune (`with_box` = 0), d'où `checked` = 0 sur les 4 plans [mesuré] ;
  - `bitesOf` (index.ts:10953-10980) ne prend les termes propres à chaque personne que pour un plat sans boîte attribuée ;
  - le contrôle du régime est compté dans la même boucle (meal_generation.ts:8920). Il est probablement aveugle de la même façon pour un végétarien.
- → **Juger chaque personne sur les boîtes construites par le moteur** (ses aliments et les casseroles qu'ils citent), après leur construction, avec ses propres termes et les deux contrôles : exclusions et régime. Prévoir un cas qui doit être bloqué et un cas qui doit passer.

**b) Les notes enregistrées sont inutilisables.**
- **« tofu, poissons au petit déjeuné »** est stocké en **une seule** chaîne, sans moment. Même avec un contrôle qui marche, rien ne peut la reconnaître. Et la consigne l'affiche sans « ONLY AT breakfast », donc comme une exclusion de toute la journée.
  - Tofu servi : 13 petits-déjeuners sur 20, plus 2 repas (0c02050d dimanche soir, cc012345 dimanche midi), soit **15 repas** si l'exclusion vaut pour toute la journée [mesuré].
- **« lesoeufs »** ne correspond à aucun aliment.
- → **À l'écriture d'une note :**
  - la rapprocher de `food_composition_aliases` avec le résolveur existant, sans matcher maison ;
  - la découper en éléments (tofu, poisson) ;
  - reconnaître le moment malgré la faute (« déjeuné ») ;
  - si elle ne se résout pas, la redemander : « Tu voulais dire : œufs ? ».
- → **Retraiter aussi les lignes déjà stockées.**

**c) Le « très léger le matin » de Christèle n'a jamais été appliqué.**
- **Ce qui est en base :** la note, datée du 20/09 (§2.2). Mais `eating_rhythm.size` est nul et `household_member_habits.slots` est vide [mesuré].
- **Deux problèmes :**
  - rien ne traduit « très léger » en réglage ;
  - « fruit » et « muesli » arrivent au modèle comme un indice pour « sa boîte » (retained_items_routing.ts:460-464), alors qu'il n'a pas le droit d'écrire une boîte (household_meal_generation.ts:852).
- → **Traduire un `food.prefer` sur le petit-déjeuner qui dit « léger » en *proposition* de moment léger**, à valider par la personne qui gouverne le foyer.
- → **Rediriger les indices vers le gabarit du petit-déjeuner** de sa carte.
- Avec le lot 1, l'énergie retirée du matin doit aller à l'à-côté du midi et du soir, pas à leurs plats. → **Q6**

**d) La réparation finale ne connaît pas le foyer.** `final_repair` doit recevoir les fiches, les notes, les contrats et `standardRecipeBlock`.
- Sur cc012345, elle a réécrit 12 boîtes : sardines et 3 tranches de pain, tofu au déjeuner, 200 g de yaourt pour tout le monde.
- Sur e0325544, elle a resservi des œufs à Christèle.

**e) Protéines des collations.** `proteinMinG` (index.ts:8617) ne s'applique plus qu'au petit-déjeuner, au déjeuner et au dîner.

**f) Lignes du contrat.** slot_contract_brief.ts:64-72 doit regrouper les lignes par personne et par moment, comme son commentaire l'annonce. Aujourd'hui la liste est coupée à 32 lignes : 25 pour Thomas, 7 pour Fabrice, **0 pour Christèle**.

**g) Direction du plan.** « Which way this plan leans » (household_meal_generation.ts:754-760) doit donner la direction de chaque personne. Aujourd'hui, il annonce « bigger » à une table où quelqu'un veut perdre du poids.

**h) Plancher de protéines d'une personne sans compte.** Aujourd'hui, c'est celui du maintien, même en perte. → **Q5**

**Avant → après.**
- Violations de notes (tofu, poisson, œufs) : 15 repas et 4 petits-déjeuners → 0.
- Lignes de contrat pour Christèle : 0 → 15.

**Comment on le mesure.** Sur une génération réelle :
- `checked` supérieur à 0 **pour chaque personne** ;
- une recherche de tofu, de poisson et d'œufs dans les boîtes des personnes concernées ne trouve rien.

**Risques.**
- La réparation grossit d'environ 3 Ko.
- Un contrôle réparé peut se mettre à refuser des plans : d'où l'obligation d'un cas qui passe.

### Lot 5 : rabotage et ajusteur, ne plus déformer sans le dire

**Changements.**
- **a) Ordre du rabotage selon l'objectif** (`planShave`, portion_boundary.ts:369-400) :
  - en perte ou en maintien, le féculent d'abord, jusqu'à son plancher ;
  - en prise, l'élément le **moins dense** d'abord, pour perdre le moins d'énergie possible par gramme coupé ;
  - le plancher des légumes (70 %) est gardé.
- **b) L'énergie retirée est comptée** (lot 0).
- **c) Ajusteur.** Quand on construit les fourchettes passées à `adjustPlanProportions` (index.ts:13478-13506), on ignore la ligne d'une personne si le plat est servi en deux casseroles et que son facteur dépasse celui de la personne du milieu : son surplus est déjà porté par le féculent à part. Nouveau compteur `proportion_adjust.skipped_split_rows`.

**Causes traitées.** C6, C7.

**Avant → après** [calculé].
- **Dîners de dinde de Thomas (e0325544) :**
  - aujourd'hui : 370 g de dinde-légumes et 330 g de pommes de terre, soit 47 % de féculent et 144 g de dinde crue ;
  - avec le nouvel ordre : ≈ 527 g et 173 g, soit 25 % de féculent et ≈ 205 g de dinde crue, pour la même énergie (≈ 610 kcal).
  
  Ici, les deux ordres donnent le même résultat, car les pommes de terre sont à la fois le féculent et l'élément le moins dense.
- **Christèle, e0325544 :** 244 g de plat principal et 387 g d'orge → environ 355 g et 300 g.
- **Après les lots 1 à 3, le rabotage devient rare** : 2 plats sur 30 pour Thomas.

**Contraintes respectées.**
- Planchers de chaque aliment gardés.
- Casserole = somme des boîtes.
- Aucune réparation par le modèle.

### Lot 6 : conditionnel, plafond de féculent de la grosse assiette

**Condition de départ.** Ce lot ne part que si, après les lots 1 à 3 et 3 tirages, la céréale sèche médiane de Thomas dépasse 120 g, ou si plus d'un quart de ses plats dépassent 150 g.

**Mécanisme.**
- Le féculent de la grosse assiette est plafonné à 120 g de céréale sèche, 350 g de pomme de terre crue ou 150 g de pain.
- Le surplus part en pain à côté, par le canal du lot 1.

### 7.3 La grille d'acceptation (après les lots 0 à 3)

Seuils recalculés avec le gabarit de recette, en gardant une marge pour le cas « sans fromage ».

| Mesure | Aujourd'hui [mesuré] | Seuil |
|---|---|---|
| Plat médian midi et soir, T / C / F | 700 / 543 / 500 g | ≤ 650 / ≤ 470 / ≤ 470 g |
| Plats au-dessus de 550 g (C, F) | C 19 sur 40, F 7 sur 40 | au plus 1 sur 10 |
| Céréale sèche médiane, repas qui en contiennent, T / C / F | 166 / 114 / 82 g | ≤ 130 / ≤ 75 / 40 à 60 g |
| Part d'énergie du féculent, Fabrice (repas à deux casseroles) | 0,39 | ≤ 0,32 |
| Légumes crus par repas, plat + crudités, T / C / F | 191 / 162 / 173 g | ≥ 270 / ≥ 260 / ≥ 320 g |
| Fruits par jour | 231 / 64 / 60 g | ≥ 250 g chacun |
| **Jours sous le plancher de protéines** | Fabrice 3 sur 5 (cc012345) | **0 pour chaque personne** |
| Énergie servie ÷ cible, chaque jour, après rabotage | jusqu'à 86 % (e0325544) | ≥ 97 % |
| Petits-déjeuners au-dessus de 400 g (C, F) | 4 sur 40 | 0 |
| Violations de notes (tofu, poisson, œufs) | 15 repas, plus 4 petits-déjeuners avec des œufs | 0 |
| Laitages frais au-dessus de 250 g/j | à compter | 0 |
| Masse du repas complet au déjeuner (plat + à-côté) | 686 / 543 / 505 g | affichée à part. Si le propriétaire la juge trop lourde, on réduit d'abord les crudités |
| Durée de génération, 90 % des tirages | 116 à 209 s sur les 4 plans | sous la limite réelle du serveur de fonctions (à vérifier), avec une relance au plus |

Si les protéines de Fabrice restent sous son plancher avec le gabarit (37 g par part dans la seule casserole principale), l'à-côté du soir en perte prend un fromage blanc à la place du fruit, dans la limite des 250 g de laitages.

### 7.4 La génération réelle, commune à tous les lots

1. **Prérequis.** Le lot 0 est en place. Redémarrer le serveur local de fonctions, parce que les fichiers `_shared` modifiés ne sont pas rechargés, et lancer le script Kong. Le déploiement (`supabase functions deploy`) est à lancer **par toi**.
2. **Trois plans par état** : lot 1, puis lots 1 et 2, puis lots 1 à 3. Même foyer, mêmes réglages que cc012345 (5 jours, 3 sessions, 2 courses), lancés depuis `/app/plan`.
3. **Plus deux cas** : une personne seule en perte de poids, et un foyer avec un enfant.
4. **Extraction** avec les scripts de l'audit (`data/build_plates.py`, `meal-energy-v1`) et les nouveaux compteurs. Comparaison avec cc012345 (adopté) et e0325544 (commenté).
5. **Dans le même plan, enregistrer ce qui se serait passé sans le changement** : plat sans à-côté, assiette uniforme sans forme d'objectif. On mesure ainsi l'effet du moteur sans la variation d'un tirage à l'autre.

---

## 8. Questions à trancher

**Q1 (bloque le lot 1). L'app ajoute-t-elle elle-même un à-côté prévu, acheté et compté à chaque déjeuner et dîner ?** Cela revient en partie sur le 10/09 et sur « the dish is the unit ». Voici ce que chacun verrait en recettes actuelles (lots 1 et 2) [calculé] :

| | Aujourd'hui : plat seul | Plat | À côté (présenté à part, non pesé) | Repas complet |
|---|---|---|---|---|
| Christèle, déjeuner | 543 g | 414 g | crudités 100 g, pomme, yaourt nature (375 g) | ≈ 789 g |
| Christèle, dîner | 543 g | 414 g | crudités 100 g, pomme, 30 g de pain (280 g) | ≈ 694 g |
| Fabrice, déjeuner | 505 g | 402 g | crudités 150 g, pomme, skyr (425 g) | ≈ 827 g |
| Fabrice, dîner | 505 g | 402 g | crudités 150 g, pomme (300 g) | ≈ 702 g |
| Thomas, déjeuner et dîner | 686 g | 591 g | 60 g de pain, pomme, crudités 100 g (310 g) | ≈ 900 g |

Autrement dit : l'assiette maigrit, et le repas gagne un fruit, des crudités et un laitage, comme un repas ordinaire. Mais le repas complet pèse plus lourd que le plat d'aujourd'hui.

Une variante plus légère : crudités à 100 g pour tout le monde, et au plus deux éléments par repas. C'est environ 100 à 150 g de moins par repas, pour presque la même énergie, puisque les crudités en apportent très peu.

Ma recommandation : l'à-côté **pour tout le monde**, y compris Thomas, puisque c'est lui qui a le plat de 700 g. Sans crudités, ses légumes tombent à 346 g/j au lieu de 542.

**Q2 (bloque le lot 3a). Faut-il viser l'assiette ordinaire de la personne du milieu** (la densité du gabarit) plutôt que « la plus grande assiette que les bornes autorisent » ? Cela renverse la règle du 21/09 et l'arbitrage A15.

**Q3 (lot 3c, optionnel). Faut-il baisser le seuil de report de 140 à 116 ?** L'effet est faible ici : −34 g sur le plat de midi de Thomas, collations de 282 à 304 kcal. C'est une marge de sécurité pour de plus gros mangeurs.

**Q4. Le tofu.**
- La note du foyer visait-elle **tous les repas** ou **le petit-déjeuner seulement** ?
- Pour tout le monde : faut-il l'interdire au petit-déjeuner dans le gabarit général, ou seulement quand une note le demande ?
- Quelle quantité ? Aujourd'hui 165 à 195 g servis sur 1e553ca1, alors que la consigne dit « a little tofu ».

**Q5. Quel plancher de protéines pour Fabrice ?**
- Aujourd'hui, 108 g : celui du maintien, appliqué parce qu'il n'a pas de compte, alors que son énergie suit la perte.
- La règle de perte du code donnerait 126 g.
- L'imposer dans le partage fait tomber sa céréale à 32 g en médiane, pour +1 g de protéines par jour. Je ne le recommande pas.
- Si tu veux 126 g, il faut un laitage de plus dans son à-côté, dans la limite de 250 g de laitages par jour.

**Q6. Le matin léger de Christèle.** Sa note existe en base depuis le 20/09. Faut-il la transformer en *proposition* de moment léger, validée par la personne qui gouverne le foyer ? Et l'énergie retirée du matin doit-elle aller à l'à-côté du midi et du soir, plutôt qu'à leurs plats ? Aujourd'hui, cocher « léger » alourdirait ses plats d'environ 60 g.

**Q7. Des phrases à l'écran ?**
- Une phrase quand une personne reçoit moins de 95 % de sa cible un jour donné.
- Une phrase sous le curseur qui décrit la journée visée.
- Un avertissement à partir de 0,5 % du poids par semaine. Thomas est à 0,45 kg/sem, soit 0,62 % de son poids, au-dessus du repère courant de 0,25 à 0,5 % [supposé].

Toute phrase qui parle de calories ou de rythme de poids doit passer la garde TCA (troubles du comportement alimentaire) et la règle à trois états de la direction.

**Q8. Âge exact ou milieu de la tranche pour l'entretien ?** L'âge exact donnerait −32, −24 et −53 kcal/j. Surtout, Fabrice perdra d'un coup environ 115 kcal/j le 26/07/2027, le jour de ses 60 ans [calculé, non revérifié].

**Q9. Qui écrit les interrupteurs de l'à-côté (`slots[].extras`) ?** D'après la règle du foyer, une personne qui a réclamé son profil n'a pas le droit de « composer, ajouter, retirer ou restreindre ». Faut-il réserver ce champ à la personne qui gouverne le foyer (`SELF_SHEET_FIELDS`, frontend/src/keel/lib/mouthForm.ts:1283) ?

**Q10. Les céréales de Thomas.** Faut-il passer une partie de ses céréales en raffiné, pour ramener ses fibres d'environ 63 g/j vers le repère d'environ 47 g ? Aujourd'hui, toutes les céréales sont complètes pour tout le monde.

---

## 9. Autres problèmes vus en passant (hors portions)

**Référentiel d'aliments** (`food_composition_refs` et `food_composition_aliases`) [mesuré] :
- `greek_yogurt` : 113 kcal, 3,3 g de protéines et 9,2 g de lipides pour 100 g. C'est un yaourt à la grecque entier, pas un yaourt grec égoutté.
- `walnuts` pointe vers « Noix, fraîche » (378 kcal/100 g). La noix sèche fait environ 700 kcal/100 g (valeur de mémoire, à vérifier).
- `goat_cheese` pointe vers « Chevreau, cru » (de la viande, 103 kcal), et les alias « chevre » et « fromage de chevre » aussi.
- « sel » est rattaché à `dried_herbs`.
- Les « Pâtes complètes » de 1e553ca1 sont lues comme des pâtes blanches.
- Le couscous complet n'a pas de `yield_factor` propre.

Un aliment dont l'énergie est sous-comptée est servi en plus grande quantité pour atteindre la cible.

**Énergie des plats sans casserole.** Elle est calculée sur la recette, pas sur les grammes de la boîte [calculé, `data/fresh_check.py`] :
- 35 lignes diffèrent de plus de 2 g, surtout les pitas comptées à l'unité (60 g pièce) ;
- 7 boîtes s'écartent de plus de 5 % ;
- pire cas : e0325544, jeudi soir, Thomas, 890 kcal affichées pour 696 kcal réellement dans la boîte.

**Casseroles de céréale jamais entièrement servies.** 5 à 7 % de la masse cuite ne va dans aucune boîte : par exemple, sur le couscous de e0325544, 1 140 g servis sur 1 227 g. Les courses sont donc gonflées d'autant [mesuré].

**Boîtes v4 non tenues.** Christèle, en maintien, reçoit des boîtes à son nom au lieu d'un bac commun. Et `meal-energy-v1` refuse ses boîtes (`no_direction`) : sa journée n'est mesurée par aucun outil du produit.

**Compteur `day_kcal`.** Il affiche 100 % pendant que le rabotage retire de l'énergie (lot 0).

**Complément de référentiel par `final_repair_fill`.** Il a proposé des classes de cuisson douteuses : boisson à l'avoine en « grain_absorbs », beurre de cacahuète en « legume_absorbs ». Aucun effet mesuré sur ces plans.

**Contradictions dans la consigne.**
- « for THAT many people », « You cook for ONE student » et « No calories » (meal_generation.ts:3478, 3494, 3696-3698), contre « every dish is written for ONE » et des dizaines de chiffres en kcal dans le même message.
- Sur cc012345, le mercredi est déclaré jour de cuisine sans repas, mais le calendrier dit « wed breakfast: 3 eat », et la consigne annonce 6 plats dédiés au lieu de 5.

**Documents en retard sur le code.** `NOMENCLATURE-MEMOIRE.md` (tableau du 21/09) et une mémoire de session disent qu'une note d'appétit touche l'énergie de la journée. Le code dit le contraire depuis le 10/09.

**`MEAL_MAX_GRAMS_PER_KG`** (mouth_anchor.ts:244). D'après les notes de décision, cette constante existe encore et fonctionne à l'envers : elle est plus large pour un corps plus lourd. Non revérifié dans cet audit.

**Durée de génération.** Le chiffre de 59–144 s qui circule est périmé. Sur les 16 plans du foyer des 8 derniers jours : médiane 160 s, 90 % sous 212 s, maximum 271 s [mesuré]. Depuis le 15/09, la génération répond tout de suite et compose en arrière-plan. La vraie limite est donc la durée maximale du serveur de fonctions, avec la relance unique de `keel-relaunch-meal-drafts`, et non plus Kong.

**Plan 0c02050d.** Il a tourné avec l'ancienne règle du féculent à part. Elle produit des inversions : Christèle y reçoit plus de couscous (132 g secs) et plus de pommes de terre (391 g) que Thomas. Ce plan ne doit pas servir à juger le code actuel.

---

*Fichiers de travail, tous dans le dossier temporaire `/private/tmp/claude-502/-Users-ahmedamara-Dev-Sophia-2/3adc57e5-c3d7-4057-90b5-0385df94337c/scratchpad/audit-dosages/` (hors du dépôt) :*
- *données : `data/` ;*
- *code et journaux : `chaine/` ;*
- *consigne : `consigne/` ;*
- *repères : `norms/` ;*
- *causes : `causes/` ;*
- *regard du nutritionniste : `dieteticien/` ;*
- *contraintes : `degres_liberte/`, `contraintes/` ;*
- *vérifications : `verif_*/` et `r9/` ;*
- *simulations : `sim/` ;*
- *critique : `critique/`.*
