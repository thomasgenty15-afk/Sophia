# Rapport de mesure des deux plans de campagne — 11 septembre 2026

Lot 0 du chantier « Fiabiliser les portions et préserver les recettes ».
Produit par `scripts/2026-09-11-mesure-grille.ts` sur les fixtures figées de
`scratchpad/2026-09-11-FIABILITE-RECETTES/fixtures/`.
Sortie brute complète : [`mesure-2026-09-11.txt`](mesure-2026-09-11.txt).

**Aucun appel modèle, aucune génération, aucune écriture en base.** L'instrument
tourne avec `--allow-read` et rien d'autre.

> ⛔ **Ce rapport ne dit rien de la saveur, de la texture ni de la faisabilité.**
> Aucune recette n'a été cuisinée, aucune dégustation n'a eu lieu. Les contraintes
> alimentaires ne sont pas non plus contrôlées : **aucune n'est déclarée** sur ces
> deux fixtures, et « zéro violation » y veut dire « on ne l'a pas essayé ».

---

## 0. La preuve de départ est reproduite

Le plan exige qu'elle le soit **avant** toute modification. Elle l'est, deux fois
et par deux chemins indépendants.

| preuve attendue | obtenu |
|---|---|
| 14 cases, 12 portions calculées, 11 énergies mesurables | **14 / 12 / 11** |
| dimanche PERTE ≈ 2 455,69 kcal | **2 455,69** (cible moteur 2 454 · **+0,07 %**) |
| dimanche GAIN ≈ 2 916,14 kcal | **2 916,14** (cible moteur 2 912 · **+0,14 %**) |
| contrefactuel petit-suisse = 546 kcal à quantités constantes | **546,00** |
| alertes d'achats par pluriel, nominatives | **8 / 8**, voir § 10 |

Le rejeu d'origine `scratchpad/2026-09-11-REVUE-CAMPAGNE/revue.ts` rend toujours
`resultats.json` **à l'octet près** (`diff` vide). L'instrument neuf, qui part de
fixtures différentes et passe par d'autres fonctions, retrouve les mêmes nombres.

> ⛔ **Ces nombres attestent l'ancien cas. Ce ne sont pas des cibles à imposer au
> moteur corrigé.** Le plan l'écrit, et cet instrument ne les cherche pas : il les
> trouve.

---

## 1. Bilan de livraison par requête

| | PERTE `1f8a8988` | GAIN `1eada05b` |
|---|---|---|
| requête | `f5a3dd19-…` | `ecaf04b2-…` |
| bouche | Paul · 178 cm · 88 kg · 36 ans · `fat_loss` 0,5 kg/sem | Max · 178 cm · 62 kg · 28 ans · `muscle_gain` 0,25 kg/sem |
| fenêtre | 2026-09-11 → 2026-09-13, prompt parti à **15 h 07 CEST** | idem, **15 h 09 CEST** |
| durée | 116 367 ms | 137 549 ms |
| appels modèle | 1 (+1 `composition_fill`) | 1 (+1 `composition_fill`) |
| réparations | 0 / 2 | 0 / 2 |
| `final_gate` | `ok=true` · 2 refus · **0 bloquant** | `ok=true` · 7 refus · **0 bloquant** |
| livré | oui | oui |

> ⛔ **`ok=true` ne certifie pas ce plan.** Le gate a reçu `energy: null` et
> `boxContract: null` ; son compteur interne dit lui-même `energy_mouths: 0` et
> `energy_unmeasured: 1`. Il n'a contrôlé ni les calories, ni les protéines, ni la
> présence d'une portion par case.

---

## 2. Les cinq dénominateurs

| | cases attendues | plats présents | portions calculées | portions mesurables | portions conformes |
|---|---|---|---|---|---|
| PERTE | 7 | 7 | **6** | 6 | 6 |
| GAIN | 7 | 7 | **6** | **5** | 5 |
| **total** | **14** | **14** | **12** | **11** | **11** |

Les marches, nommées :

- PERTE `sat/lunch` — plat présent (« Bœuf à l'oignon, pita complète… »), **aucune
  boîte, aucune portion**.
- GAIN `fri/dinner` — plat présent (« Agneau, pita complète, tahini et tomate »),
  **aucune boîte, aucune portion**.
- GAIN `sat/breakfast` — boîte de 523 g présente, **énergie illisible**
  (`dish_incomplete`).

Les deux premières sont des `pita complète`, la troisième un `petits-suisses`.
**Les trois marches descendues du plan tiennent à trois identités alimentaires
perdues** — voir § 3 et la section « pour les lots suivants ».

Cases attendues : déduites de la demande (3 jours × 3 moments = 9 cases de grille,
moins 2 retirées à 15 h locales), pas des plats produits. Le compteur du moteur
confirme : `cells: 9 · spent_cells: 2 · non_empty: 7`.

---

## 3. Contrôle 3 — ingrédients comptabilisés, quatre états

| état | PERTE | GAIN |
|---|---|---|
| ① référence vérifiée | 46 | 47 |
| ② estimation de groupe | 0 | 0 |
| ③ en attente de validation | **1** — `whole_wheat_pita_bread` | 0 |
| ④ ingrédient non mesurable | 0 | **2** — `petits suisses nature`, `pita complete` |
| **lignes** | **47** | **49** |

Champ `ref` écrit par le modèle : **41 / 47** (PERTE) et **49 / 49** (GAIN).

> ⛔ **Ce taux n'est pas un taux de vérification, et le plan GAIN le prouve tout
> seul : 49 `ref` sur 49 lignes, et deux ingrédients non mesurables.** Le lecteur
> qui mesure (`plan_energy_read.ts::readIngredient`) ne transmet pas `ref` ; la
> mesure repart du terme en clair. Le rapport du 2026-09-11 au matin a écrit
> « 100 % vérifié » à partir de ce compteur. C'était faux.

Provenances comptées à part (elles restent dans les sommes) : PERTE pèse `sel` et
`poivre noir` **par convention de condiment** ; aucune ligne n'est pesée par la
prose ; aucun faux ami ne mord sur ces deux plans.

### Les trois index

| | PERTE | GAIN |
|---|---|---|
| index historique | 943 lignes · 2 727 alias · 4 faux amis (`fr`) | idem |
| index de génération | **920 / 943** composables — 23 refusées | idem |
| index de relecture | `asked 1 · kept 1` | `asked 2 · kept 1` |
| témoin `keel.meal_energy.reading_index` | `asked 1 · kept 1` ✅ | `asked 2 · kept 1` ✅ |

L'index de relecture est **celui du chemin testé**, prouvé par le témoin du
moteur. Les règles diffèrent bien : la porte de validation vaut à la composition
(23 lignes retirées du catalogue), pas à la relecture.

> ⚠️ **Le sas d'aujourd'hui n'est pas celui du run.** Le tir GAIN a écrit deux
> lignes de sas (`sas_written: 2`) dont le tir PERTE, antérieur de deux minutes,
> n'a pas pu profiter. Une relecture d'aujourd'hui résout donc `pita complète`
> côté PERTE, alors que le run l'avait compté `unknown_ingredient`. **La portion
> manquante, elle, reste manquante.**

---

## 4. Contrôle 1 — calories du créneau

Tolérance **±10 % par repas**. Source : le plan, § lot E. **Critère annoncé, non
branché** dans le moteur.

### PERTE

| date | créneau | cible (dimensionnement) | cible (prompt) | mesuré | écart | état |
|---|---|---|---|---|---|---|
| 2026-09-11 | dinner | 858,90 | **2 454,00** | 859,09 | +0,02 % | ✅ |
| 2026-09-12 | breakfast | 613,50 | 613,50 | 613,42 | −0,01 % | ✅ |
| 2026-09-12 | lunch | 981,60 | 981,60 | — | — | ⚪ aucune portion calculée |
| 2026-09-12 | dinner | 858,90 | 858,90 | 858,67 | −0,03 % | ✅ |
| 2026-09-13 | breakfast | 613,50 | 613,50 | 614,00 | +0,08 % | ✅ |
| 2026-09-13 | lunch | 981,60 | 981,60 | 982,19 | +0,06 % | ✅ |
| 2026-09-13 | dinner | 858,90 | 858,90 | 859,50 | +0,07 % | ✅ |

### GAIN

| date | créneau | cible (dimensionnement) | cible (prompt) | mesuré | écart | état |
|---|---|---|---|---|---|---|
| 2026-09-11 | dinner | 1 019,20 | **2 912,00** | — | — | ⚪ aucune portion calculée |
| 2026-09-12 | breakfast | 728,00 | 728,00 | — | — | ⚪ non mesurable (`dish_incomplete`) |
| 2026-09-12 | lunch | 1 164,80 | 1 164,80 | 1 161,88 | −0,25 % | ✅ |
| 2026-09-12 | dinner | 1 019,20 | 1 019,20 | 1 018,88 | −0,03 % | ✅ |
| 2026-09-13 | breakfast | 728,00 | 728,00 | 727,00 | −0,14 % | ✅ |
| 2026-09-13 | lunch | 1 164,80 | 1 164,80 | 1 164,44 | −0,03 % | ✅ |
| 2026-09-13 | dinner | 1 019,20 | 1 019,20 | 1 024,71 | +0,54 % | ✅ |

> ⛔ **Deux cibles pour la même case, mesurées.** Le vendredi, la case
> `PERTE / 2026-09-11 / dinner` vaut **858,90 kcal** pour le dimensionnement et
> **2 454,00 kcal** pour le couloir envoyé au modèle — un facteur **2,86**. Même
> chose côté GAIN : **1 019,20** contre **2 912,00**. C'est le défaut du lot B,
> avec ses deux lignes :
> `slotPlanTargets` avec le **rythme entier** au dénominateur
> (`generate-household-meal-v1/index.ts:11987`) contre `slotPlanTargets` avec **les
> moments de ce jour-là** (`portion_sizing.ts:3222`).

---

## 5. Contrôle 2 — grammage de l'assiette, par personne

Toutes les portions mesurées tiennent dans leurs bornes (`plateBoundsFor` sur la
cible de dimensionnement). 11 portions sur 11 mesurables ; les deux cases sans
boîte n'ont rien à peser.

| | PERTE | GAIN |
|---|---|---|
| dans les bornes | 6 / 6 | 5 / 5 |
| hors bornes | 0 | 0 |
| non mesurable | 1 (`sat/lunch`) | 2 (`fri/dinner`, `sat/breakfast`) |

Extrêmes observés : 352 g (PERTE `sat/dinner`, bornes 250–700) et 697 g
(GAIN `sun/lunch`, bornes 250–700).

---

## 6. Contrôle 5 — cohérence de la journée

Tolérance **±5 %** sur le **périmètre couvert**.

| plan | date | cases | mesurables | budget couvert | cible du jour | servi | écart | état |
|---|---|---|---|---|---|---|---|---|
| PERTE | 2026-09-11 | 1 | 1 | 858,90 | 2 454,00 | 859,09 | +0,02 % | ✅ |
| PERTE | 2026-09-12 | 3 | 2 | 2 454,00 | 2 454,00 | 1 472,09 | — | ⚪ 1 portion non mesurée sur 3 |
| PERTE | 2026-09-13 | 3 | 3 | 2 454,00 | 2 454,00 | **2 455,69** | **+0,07 %** | ✅ |
| GAIN | 2026-09-11 | 1 | 0 | 1 019,20 | 2 912,00 | — | — | ⚪ 1 portion non mesurée sur 1 |
| GAIN | 2026-09-12 | 3 | 2 | 2 912,00 | 2 912,00 | 2 180,76 | — | ⚪ 1 portion non mesurée sur 3 |
| GAIN | 2026-09-13 | 3 | 3 | 2 912,00 | 2 912,00 | **2 916,14** | **+0,14 %** | ✅ |

**La somme vient des mêmes portions que le contrôle 1.** Aucune part
conventionnelle n'entre ici. Le vendredi partiel est comparé à son **budget
couvert** (la part de dîner dans le rythme entier), pas à la journée : un plan
partiel ne doit pas la journée entière.

Une journée à trou reste **non mesurable**, pas « en écart » : PERTE samedi sort à
1 472,09 kcal contre 2 454 couverts, mais ce −40 % décrirait une mesure absente,
pas de la nourriture absente.

---

## 7. Contrôle 6 — densité calorique

La consigne refaite hors ligne par `requiredDensityFor` → `densityFragment` est
présente **caractère pour caractère** dans le prompt archivé, pour les deux plans.
Un poids modifié de 20 kg change la phrase et elle n'est alors plus dans le
prompt : la reconstruction dépend bien des entrées figées.

> PERTE : `up to 245 kcal per 100 g at breakfast (aim 110, not 142), 141 to 250 at
> lunch (aim 154, not 207), 250 at dinner — its share does not fit the plate`
>
> GAIN : `104 to 250 kcal per 100 g at breakfast (aim 114, not 153), 167 to 250 at
> lunch (aim 183, not 245), 250 at dinner — its share does not fit the plate`

| plan | date | créneau | couloir du **jour** | couloir **transmis** | mesuré | état |
|---|---|---|---|---|---|---|
| PERTE | 2026-09-11 | dinner | [250–250] ⛔ | [250–250] ⛔ | 241 | ⚪ couloir impossible |
| PERTE | 2026-09-12 | breakfast | [100–245] aim 110 | [100–245] aim 110 | 111 | ✅ |
| PERTE | 2026-09-12 | lunch | [141–250] aim 154 | [141–250] aim 154 | — | ⚪ |
| PERTE | 2026-09-12 | dinner | **[123–250] aim 135** | **[250–250] ⛔** | 244 | ⚪ couloir impossible |
| PERTE | 2026-09-13 | breakfast | [100–245] aim 110 | [100–245] aim 110 | 111 | ✅ |
| PERTE | 2026-09-13 | lunch | [141–250] aim 154 | [141–250] aim 154 | 146 | ✅ |
| PERTE | 2026-09-13 | dinner | **[123–250] aim 135** | **[250–250] ⛔** | 241 | ⚪ couloir impossible |
| GAIN | 2026-09-11 | dinner | [250–250] ⛔ | [250–250] ⛔ | — | ⚪ |
| GAIN | 2026-09-12 | breakfast | [104–250] aim 114 | [104–250] aim 114 | — | ⚪ |
| GAIN | 2026-09-12 | lunch | [167–250] aim 183 | [167–250] aim 183 | 168 | ✅ |
| GAIN | 2026-09-12 | dinner | **[146–250] aim 160** | **[250–250] ⛔** | 247 | ⚪ couloir impossible |
| GAIN | 2026-09-13 | breakfast | [104–250] aim 114 | [104–250] aim 114 | 126 | ✅ |
| GAIN | 2026-09-13 | lunch | [167–250] aim 183 | [167–250] aim 183 | 167 | ✅ |
| GAIN | 2026-09-13 | dinner | **[146–250] aim 160** | **[250–250] ⛔** | 228 | ⚪ couloir impossible |

> ⛔ **Le vendredi partiel impose son couloir aux dîners du samedi et du dimanche,
> et le chiffre le dit.** Pris seuls, ces dîners tiennent : visée **135**
> (PERTE) et **160** (GAIN), couloirs [123–250] et [146–250]. Ce qui est parti au
> modèle est **250**, avec la mention « ta part ne tient pas dans l'assiette ».
> Les densités servies — 244, 241, 247, 228 — sont collées au plafond de ce
> couloir-là, pas à la visée de leur jour.
>
> Les deux couloirs sortent de la **même fonction**, appelée sur une grille d'un
> jour puis sur la grille entière. L'écart est le repliement par **nom de moment**
> que `requiredDensityFor` fait en interne : il n'existe aucune clé de date.

---

## 8. Contrôle 8 — protéines

Plancher applicable, par `envelopeFor` + `envelopeDirectionFor` (fonctions de
production, entrées figées) : **176 g/jour** pour Paul, **99 g/jour · 33 g/repas**
pour Max. Sur une fenêtre partielle, il est réparti au prorata du **budget
couvert / cible du jour**.

| plan | date | part couverte | plancher couvert | mesuré | état |
|---|---|---|---|---|---|
| PERTE | 2026-09-11 | 35 % | 62 g | 61,5 g | ❌ −1 % |
| PERTE | 2026-09-12 | 100 % | 176 g | — | ⚪ une portion manque |
| PERTE | 2026-09-13 | 100 % | 176 g | **126,1 g** | ❌ **−28 %** |
| GAIN | 2026-09-11 | 35 % | 35 g | — | ⚪ une portion manque |
| GAIN | 2026-09-12 | 100 % | 99 g | — | ⚪ une portion manque |
| GAIN | 2026-09-13 | 100 % | 99 g | 108,5 g | ✅ |

> ⛔ **Ce verdict n'est pas celui du produit.** Aucune garde du dépôt ne compare
> ces grammes à ce plancher sur ce chemin — c'est une **exigence non satisfaite**
> (lot E), pas un sujet non applicable. Le rapport du matin avait classé les
> protéines « non applicables » ; la seule journée complète et mesurable de Paul
> est à **−28 % de son plancher**.

---

## 9. Contrôle 9 — cohérence recette ↔ stockage

Comparaison par **égalité de chaînes** entre la `quantity` persistée et celle de
la **réponse brute archivée**. Aucun mot n'est interprété.

| | PERTE | GAIN |
|---|---|---|
| lignes rapprochées | 47 / 47 | 49 / 49 |
| nombre inchangé | 12 | 4 |
| nombre changé, **prose réécrite** | 6 | 10 |
| nombre changé, **prose PÉRIMÉE** | **29** | **35** |

**64 lignes sur 96 affichent une quantité qui n'est plus celle du calcul.** Les
deux exemples nommés par la revue sont retrouvés, et ils ne sont pas des cas
isolés :

| ligne | le calcul emploie | la personne lit | facteur |
|---|---|---|---|
| PERTE `prep_chicken` · cuisses de poulet | **458,66 g** | « 360 g de cuisses de poulet désossées » | ×1,274 |
| GAIN `prep_lentils` · huile d'olive | **0,770 c. à s.** | « 2 cuillères à soupe d'huile d'olive » | ×0,385 |
| GAIN `sun/dinner` · tahini | **38,52 g** | « 100 g de tahini » | ×0,385 |
| GAIN `sun/breakfast` · yaourt grec | **303,33 g** | « 200 g de yaourt grec nature » | ×1,517 |

Sur la même préparation `prep_lentils`, le texte des **lentilles** a suivi (60 g)
et celui de l'**huile** est resté ancien : ce n'est donc même plus une différence
de taille globale du lot, c'est un **rapport de recette** faux d'un facteur 2,6.

La prose est lisible par le lecteur du produit sur **0 / 47** (PERTE) et **6 / 49**
(GAIN) lignes : `readQuantityFromProse` refuse exprès les chaînes composites. Le
défaut ne peut donc pas se réparer par une relecture du texte — la donnée
structurée doit faire autorité et la prose être régénérée depuis elle (lot C).

> ⚠️ **Le texte de MÉTHODE n'est pas contrôlé du tout.** Trou nommé du lot C.

### Contrefactuel d'identité

`petit_suisse_cream_cheese` rebranché, **quantités inchangées** :

- GAIN `sat/breakfast` : `dish_incomplete` → **546,00 kcal · 35,8 g de protéine**,
  contre une cible de **728 kcal** — soit **−25 %**.
- PERTE : **aucune portion ne bouge**. C'est le témoin : ce plan ne porte pas
  cette référence.

---

## 10. Contrôle 10 — réparations, achats, livraison

Réparations : **0 demandée, 0 utilisée** sur les deux plans (budget 2).
Appels modèle réels : 1 composition + 1 `composition_fill` par plan.

Alertes de courses rejouées — **8, nominatives, identiques à la revue** :

- PERTE : `ingredient_not_bought` **citron**, **tomate**.
- GAIN : `ingredient_not_bought` **carotte**, **citron**, **oignon**,
  **pita complète**, **pomme de terre**, **tomate** ;
  `unclassified_perishable` **petits-suisses nature**.

> ⚠️ Ces alertes comparent des **mots** (`normalizePantryTerm` / `covers`), pas des
> identités alimentaires : un singulier contre un pluriel suffit à en produire une.
> Elles ne vérifient **pas** la suffisance des quantités achetées. La septième
> alerte GAIN est une **classification absente**, pas un achat absent.

---

## Prouvé / échoue / non mesurable

### ✅ Prouvé (9)

1. PERTE — 7 cases attendues, 7 plats, 6 portions calculées, 6 mesurables, 6 conformes à ±10 %.
2. PERTE — la consigne de densité refaite est identique au prompt archivé.
3. PERTE — 2026-09-11 : 859,09 kcal contre 858,90 couverts (+0,02 %).
4. PERTE — 2026-09-13 : **2 455,69** kcal contre 2 454,00 couverts (+0,07 %).
5. GAIN — 7 cases attendues, 7 plats, 6 portions calculées, 5 mesurables, 5 conformes à ±10 %.
6. GAIN — la consigne de densité refaite est identique au prompt archivé.
7. GAIN — 2026-09-13 : **2 916,14** kcal contre 2 912,00 couverts (+0,14 %).
8. GAIN — 2026-09-13 : 108,5 g de protéine, plancher couvert 99 g.
9. GAIN — contrefactuel `petit_suisse_cream_cheese` : `dish_incomplete` → **546,00 kcal** à quantités constantes.

### ❌ Échoue (69)

- **3 cases livrées sans portion mesurable** : PERTE `sat/lunch` (aucune boîte),
  GAIN `fri/dinner` (aucune boîte), GAIN `sat/breakfast` (`dish_incomplete`).
- **64 lignes de quantité affichée périmée** (29 PERTE, 35 GAIN) — détail § 9.
- **2 journées sous le plancher protéique couvert** : PERTE 2026-09-11 (−1 %) et
  PERTE 2026-09-13 (**−28 %**).

### ⚪ Non mesurable (16)

- 3 journées à trou (PERTE 2026-09-12 ; GAIN 2026-09-11 et 2026-09-12).
- 3 protéines de journée non mesurables, pour la même raison.
- **6 dîners dont le couloir transmis est déclaré impossible** alors que le
  couloir de leur propre date est tenable.
- Contraintes alimentaires : **aucune déclarée** sur ces fixtures — le contrôle
  n'a rien à prouver ici.
- Goût, texture, faisabilité : **aucune dégustation, aucun test de cuisine**.

---

## Pour les lots suivants — défauts moteur révélés, avec leur preuve

Le lot 0 ne touche à aucun module de `supabase/functions/`. Ce qui suit est ce que
l'instrument a **mesuré**, pas ce qu'il a corrigé.

### Lot A — l'identité alimentaire

**A1. `readIngredient` ne transmet pas `ref`.**
`supabase/functions/_shared/keel/plan_energy_read.ts:42-78` construit un
`CompositionInput` avec `term`, `amount`, `unit`, `state`, `quantity` — et rien
d'autre. Toute la mesure repart donc du libellé en clair.
*Preuve :* GAIN porte `ref` sur **49 lignes sur 49** et compte **2 ingrédients
non mesurables**.

**A2. `1 unit` de `pita_wholemeal` perd ses 60 g.**
Le référentiel porte `pita_wholemeal` avec `unit_grams = 60` (`manual`,
`verifie`). Le modèle a écrit cette référence. Mais le libellé `pita complète`
n'a **aucun alias** — la table porte `pita complet` (masculin) et
`pitas completes` (pluriel), pas `pita complete` — et la ligne retombe sur le sas,
dont la vue `food_composition_pending_by_form` **n'a pas de colonne `unit_grams`**.
Résultat : ligne résolue, non pesée, plat incomplet, **aucune boîte**.
*Preuve :* GAIN `fri/dinner` — plat présent, 0 portion. PERTE `sat/lunch` — même
aliment écrit en `60 g`, la portion manque aussi (la référence a été comptée
inconnue au moment du run).
⚠️ **Ajouter un alias `pita complete` fermerait ce cas et laisserait le défaut
structurel entier.** C'est la phrase de la revue, et la mesure la confirme.

**A3. Le petit-suisse coûte 25 % de sa case.**
Contrefactuel à quantités constantes : `dish_incomplete` → **546,00 kcal** contre
une cible de **728**. La ligne PERTE, témoin, ne bouge pas.

**A4. Une ligne résolue par le sas est `a_verifier`, et personne ne le voit.**
PERTE compte 1 ligne `en attente de validation` (`whole_wheat_pita_bread`,
remplie par modèle à 258 kcal/100 g). Elle entre dans toutes les sommes ; aucun
compteur du moteur ne la distingue d'une ligne ANSES.

### Lot B — le contrat par personne, date et créneau

**B1. Deux cibles pour la même case, facteur 2,86.**
- `generate-household-meal-v1/index.ts:11987-11993` (`measureDish`, bouche
  unique) appelle `slotPlanTargets` avec
  `wholeSlots = [...(declaredSlots|composedSlots), ...composedSlots]` — **le
  rythme entier**, identique tous les jours. Même écriture au site N ≥ 2,
  lignes **8210-8216**.
- `portion_sizing.ts:3222` (`requiredDensityFor`) appelle la même fonction avec
  `wholeSlots = whole` — **les moments de CE jour-là**.

*Preuve :* case `PERTE / 2026-09-11 / dinner` → **858,90 kcal** pour le
dimensionnement, **2 454,00 kcal** pour le couloir du prompt. GAIN : **1 019,20**
contre **2 912,00**.

**B2. Le vendredi partiel impose son couloir aux autres jours.**
`requiredDensityFor` replie ses couloirs dans `best: Map<slot, DensityCorridor>`
(`portion_sizing.ts:3121`, écrit ligne **3283**) : la clé est le **nom du
moment**, il n'y
a **aucune clé de date**. Le dîner d'un jour à une seule case écrase les dîners
des jours complets par `mergeCorridors`.

*Preuve, par la même fonction appelée sur une grille d'un jour :*

| dîner | couloir de sa date | couloir transmis |
|---|---|---|
| PERTE sam./dim. | [123–250] aim **135** | [250–250] **`above_askable_cap`** |
| GAIN sam./dim. | [146–250] aim **160** | [250–250] **`above_askable_cap`** |

Les densités servies sont 244, 241, 247, 228 — collées au plafond du couloir
transmis. Retirer le vendredi de la grille suffit à ramener le dîner PERTE de
**250** à **123**, et à faire disparaître `above_askable_cap`.

**B3. La grille n'est jamais persistée avec ses clés.**
`keel.household_meal.cells` ne publie que des comptes (`cells: 9`,
`spent_cells: 2`, `non_empty: 7`) ; `keel.household_meal.portion_sizing` ne
publie que `density.by_slot`, c'est-à-dire le **minimum par nom de moment**. Rien
ne permet, à la relecture, de savoir quelles cases ont été demandées. Le lot 0 a
dû dériver les deux cases retirées de l'heure locale.

### Lot C — la quantité finale

**C1. 64 lignes sur 96 affichent une quantité qui n'est plus celle du calcul.**
29 sur PERTE, 35 sur GAIN. Facteurs observés de **×0,385** à **×1,517**. Détail
au § 9. Exemple non ambigu : `prep_lentils`, le grammage des lentilles a été
resynchronisé et celui de l'huile non — le rapport huile/lentilles affiché est
**2,6 fois** celui du calcul.

**C2. Le lecteur du produit ne peut pas réparer ça.**
`readQuantityFromProse` ne lit **0 / 47** (PERTE) et **6 / 49** (GAIN) de ces
proses : il refuse exprès les chaînes composites. La prose doit être **régénérée
depuis la donnée structurée finale**, pas relue.

### Lot E — le contrôle du plan livrable

**E1. Le gate certifie ce qu'il n'a pas regardé.**
`ok=true` sur les deux plans, `blocking: 0`, avec `energy: null`,
`boxContract: null`, `energy_mouths: 0` et `energy_unmeasured: 1` dans ses propres
compteurs. Deux cases livrées **sans aucune portion** passent.

**E2. Le plancher protéique n'est comparé à rien.**
`envelopeFor` rend **176 g/jour** pour Paul et **99 g/jour** pour Max. La seule
journée complète et mesurable de Paul est à **126,1 g**, soit **−28 %**. Aucune
garde ne le voit.

**E3. Les 8 alertes d'achats sont des comparaisons de mots.**
`final_plan_gate.ts` ~1320-1384 (`normalizePantryTerm` / `covers`). Les 8 se
reproduisent nominativement, et 7 sont des singulier/pluriel. La suffisance des
quantités n'est contrôlée nulle part.

---

## Ce que ce rapport ne dit pas

- Il ne mesure **pas** un taux de réussite : deux plans disent ce qui s'est passé
  deux fois.
- Il ne compare **pas** de durées : aucun témoin à charge égale n'existe.
- Il ne certifie **aucune** sécurité alimentaire : la matière manque.
- Il n'établit **aucune** qualité gustative, et aucun compteur ne le pourra.
