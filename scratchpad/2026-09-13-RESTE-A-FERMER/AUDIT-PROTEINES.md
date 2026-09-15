# Audit de la chaîne protéique — tir réel N=2 du 2026-09-13

**Périmètre.** `scratchpad/2026-09-11-CLOTURE/fixtures/lot3-reel-n2.json`
(`request_id f6795fd8-bfcd-442f-a0bc-1d8c15dc3617`, plan
`ed593421-5bf7-4c82-ba0c-f8af3b6a4756`), sortie brute
`scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/gain-lot3r2-2026-09-13T17-02-19-343Z.json`
et son voisin `.prompts.txt` (3 appels archivés au caractère).
Lecture seule : aucun fichier de production ou de test n'a été touché, aucun appel
fournisseur émis.

---

## ⛔ AVERTISSEMENT DE MÉTHODE À LIRE AVANT LES CHIFFRES

**Les deux tours de réparation de ce tir ne sont pas des mesures.** Le banc n'a payé
qu'un seul appel réel (`appels_reels` : 1 entrée, `turn: 0`). Le drapeau utilisé était
`--premier-jet-reel` seul ; `banc-lot-F.ts:1332` pose
`realTurns: (turn) => (PREMIER_JET_REEL && turn === 0) || (REPARATION_REELLE > 0 && turn > 0)`
avec `REPARATION_REELLE = 0`. Les tours 1 et 2 ont donc reçu **la réponse en conserve**,
et cette conserve est le premier jet d'un AUTRE cas : le texte archivé en
`etapes.reparations[0]` et `[1]` est **identique octet pour octet** (sha256 des 28 876
caractères) au `premier_jet` de `scratchpad/2026-09-11-CLOTURE/fixtures/lot2-ref2-contrats.json`
(`request_id b06c9121-…`) — un plan entier de vendredi/samedi/dimanche avec agneau et
saumon, sans `base_version`.

Conséquence : `plan_repair_rejected:base_version_missing` (×2) et
`plan_repair_stop:calls_exhausted` sont des **artefacts de banc**, pas un défaut de la
boucle de réparation. Le journal le confirme : `envelope_counts: {units: 0,
preparations: 6, sessions: 0}` et `envelope_base_version: null` — exactement la forme de
la conserve. **Ne pas partir chasser la boucle de réparation à partir de ce tir.**

Tout ce qui suit porte donc sur **le premier jet, qui lui est réel**.

---

## 1. La table d'enquête

Deux bouches, deux dates, six cases chacune sur deux jours (mon = 2026-09-14,
tue = 2026-09-15). Aucun apport fixe déclaré, part couverte = 100 % dans les deux cas.

### 1.1 Max — `5024a399-e4f2-4bdf-91fc-0e5cf37e8ee5`, 178 cm / 62 kg / male / 28 ans, `muscle_gain`, appétit `average`, compte titulaire

| Étape | Donnée relevée |
|---|---|
| **Calcul amont** | Enveloppe `per_kg` (`meal_envelope.ts::envelopeCore`). `PROTEIN_FLOOR_G_PER_KG.muscle_gain = 1.6` × poids de référence 62 kg ⇒ **`proteinFloorG` = 99 g/jour**. `proteinPerMealG` = round(99/3) = **33 g**. Part de journée couverte = `coveredBudgetGrossKcal / dayTargetKcal` = 2912/2912 = **1,00** ⇒ plancher couvert **99 g** les deux jours (`applied_full_day`). Apports fixes : aucun (`fixedProteinG` null) ⇒ **99 g restent à composer**. Répartition au prorata de `composeKcal` (728 / 1164,8 / 1019,2) ⇒ **25 g au petit-déjeuner, 40 g au déjeuner, 35 g au dîner**. |
| **Message réellement envoyé** | **Deux nombres contradictoires pour la même case.** ① Carte de la bouche (`appel1.input.txt` l. 149, rendue par `proteinFragment`) : « *one serving here carries at least 25 g of protein in the breakfast dish, 40 g in the lunch dish, 35 g in the dinner dish, and no main dish under 33 g* ». ② Bloc « WHAT EACH PLATE HAS TO COME OUT AT » (l. 235-240, rendu par `slotContractSentence`), présenté comme « *the numbers the app will measure your recipes against… a dish outside them comes back to you* » : « *at least 33 g of protein* » sur **les six** lignes, plat et échelle identiques. L'identité de la personne est présente (« Max », lignes nominatives). L'échelle est dite : « *in one serving* », « *250 to 700 g cooked* » — donc **portion standard**, jamais lot entier. ③ Contradiction supplémentaire côté système : `appel1.instructions.txt` l. 47, « *Never write a figure for it. No grams of protein, no share of the plate, no target of any kind — you are choosing a food, not measuring a person.* » |
| **Réponse brute** | Petit-déjeuner : tofu 170 g + edamame 50 g + avoine 10 g + yaourt de soja 20 g. Déjeuner et dîner : le plat ne porte que tomate/citron + huile de colza, et **tire sa protéine d'une boîte par bouche** — `dishes[2..5].boxes[].items` : `max_box` = `{"term":"ham","amount":6,"unit":"unit","ref":"ham"}`, `lea_box` = `{"term":"tofu","amount":150,"unit":"g","ref":"tofu"}` (130 g au dîner). Les titres annoncent « *et garniture protéinée* ». **Aucun de ces items ne porte la clé `grams`.** Estimation avant finalisation, au référentiel du prompt (`ham 135 20 unit=30`) : 6 × 30 g = 180 g ⇒ **36 g de protéine**, soit très au-dessus des 25/40/35 demandés. |
| **Finalisation** | `dishes[2..5].boxes["max_box"]: item "ham" has no usable grams, dropped` puis `nothing to put in it, dropped` — **8 items sur 8 refusés** (`box_counts.boxes: {expected: 8, items: 0, items_refused: 8, refused: 8, delivery: "none_delivered"}`). Le moteur ré-autore ensuite 12 contenants déterministes (`portion_sizing.apply.boxes_authored: 12`) à partir du plat **désormais sans protéine**. Protéines servies après finalisation, par case (mon / tue) : petit-déjeuner **63,1 / 62,1 g**, déjeuner **16,3 / 17,2 g**, dîner **14,8 / 15,3 g**. Totaux **94,2 / 94,6 g**. |
| **Contrôle final** | `final_gate` : plancher **99 g**, mesuré **94 g** et **95 g**, cause `protein_floor_short`, **2 refus**, `blocking: 0`, livraison `deliverable_with_gaps`. **Égalité des entrées vérifiée** : le prompt de réparation écrit `protein_floor_g=99`, le brief amont écrit 25+40+35 = 100 (arrondis) et le contrôle écrit 99 — **même fonction, mêmes entrées, aucune divergence amont/aval pour Max**. |

**Ce que le total cache.** −5 % sur la journée est un chiffre rassurant et faux dans sa
forme : la case du petit-déjeuner sort à **2,5× la demande** (63 g pour 25) et les deux
repas principaux à **41 % et 42 %** de la leur (16 pour 40, 15 pour 35). Le contrôle de
la journée ne voit pas cette distribution, et **aucun contrôle du dépôt ne compare une
case à sa part du plancher** — le nombre par case existe (`ProteinSlotAsk.gramsPerServing`),
il part dans le prompt, et rien ne le relit.

### 1.2 Lea — `9b2a44f5-7226-41d8-9990-c736ddcf750c`, 164 cm / 58 kg / female / 32 ans, `fat_loss`, appétit `small`, **bouche sans compte**, régime `vegan`, allergie arachide

| Étape | Donnée relevée |
|---|---|
| **Calcul amont** | **Aucun plancher n'est produit.** `keel.household_meal.protein_brief` : `{mouths: 2, named: 1, slots: 3, silent: {protected: 1}}`. L'enveloppe de Lea est `per_portion` (dégradée) ⇒ `dayFloorG: null` ⇒ `proteinFloorAllocation` répond `protected` ⇒ `proteinBriefFor` ne produit **aucune ligne**. Part couverte, apports fixes, plancher restant : **non calculés**. |
| **Message réellement envoyé** | **Rien.** Sa carte (`appel1.input.txt` l. 152-155) porte `diet: vegan` et le couloir de densité, **et pas une ligne protéique**. Ses six lignes du bloc « WHAT EACH PLATE HAS TO COME OUT AT » (l. 241-246) portent kcal + masse + densité et **s'arrêtent là** — `proteinMinG` est `null` parce que `index.ts:7575` ne sort un nombre que si `env.mode === "per_kg"`. Son identité est présente ; l'échelle est dite (« in one serving ») ; **le nombre est absent**. |
| **Réponse brute** | Même plats partagés que Max, + `lea_box` tofu 150 g (déjeuner) / 130 g (dîner). Estimation avant finalisation (`tofu 164 14.9`) : **22,4 g** et **19,4 g** de protéine. |
| **Finalisation** | `item "tofu" has no usable grams, dropped` × 4, puis boîtes vidées. Protéines servies : petit-déjeuner **33,6 / 33,1 g**, déjeuner **8,7 / 9,2 g**, dîner **7,9 / 8,1 g**. Totaux **50,2 / 50,4 g**. |
| **Contrôle final** | **Le produit s'abstient** : `final_gate.counters.checked` = `{protein_days: 2, protein_protected: 2, protein_unmeasured: 0}`. Les 2 refus `protein_floor_short` sont ceux de Max ; **aucun ne porte sur Lea**. L'instrument de mesure, lui, annonce 116 g/jour et −57 % — voir § 4, c'est une **divergence de l'instrument**, pas du produit. Vérification d'égalité amont/aval : **cohérente** (les deux s'abstiennent pour la même raison), et **fausse dans les deux sens** : une bouche adulte de 58 kg sort à 50 g de protéine par jour sans qu'aucun chiffre ne soit ni dit ni vérifié. |

### 1.3 Ce qui a remplacé la protéine, chiffré

Les deux casseroles partagées, calculées sur le référentiel imprimé dans le prompt :

| Pot | Composition (lot de 2 portions) | kcal | g cuits | protéine | densité | **part de l'huile de colza dans les kcal** |
|---|---|---|---|---|---|---|
| `prep_lunch_base` | 405 g pâtes complètes + 315 g poivron + **190 ml huile de colza** | 3 222 | 1 527 | 50,3 g | 211 | **53 %** |
| `prep_dinner_base` | 337 g couscous complet + 449 g tomate + **169 ml huile de colza** | 2 769 | 1 494 | 44,5 g | 185 | **55 %** |

L'énergie de la case a donc été atteinte **par la matière grasse**, dans le couloir de
densité et dans les bornes de masse, avec toutes les cases déclarées conformes sur
l'énergie (12/12) et sur la masse (12/12). C'est l'échappatoire que le plan n'a pas
nommée : `PROTEIN_CONSEQUENCE` (`plan_protein_brief.ts:302-310`) interdit « *servir une
assiette plus grosse* » et « *empiler de la viande* » — **pas** « *remplir les calories
avec de l'huile* ».

---

## 2. Classement des six défauts

`plan_repair_pass` : `{defects: 6, repairable: 6, by_kind: {protein: 6},
by_source: {gate: 2, upstream: 4}}`.

| # | Défaut | Catégorie | Preuve |
|---|---|---|---|
| 1-2 | `protein_floor_short` Max mon et tue (94/99 et 95/99) | **quantité ou référence perdue au parsing** | Les 8 items de boîte du premier jet sont refusés pour absence de la clé `grams` (`issues` du run, 8 lignes `has no usable grams, dropped`). Le jambon écrit par le modèle vaut ~36 g de protéine par repas — l'ordre de grandeur exact du manque. |
| 3-6 | `protein_source_missing` sur `dishes[2..5]` (les 4 repas principaux) | **quantité ou référence perdue au parsing** (cause) + **effet de la finalisation** (manifestation) | Le premier jet **porte** une source protéique dans chacun de ces quatre repas, en `boxes[].items`. Le compteur du moteur le dit lui-même : `swap: {strictest: "vegan", bound_mouths: 1, free_mouths: 1, cells_checked: 4, cells_carrying: 0, cells_swap_absent: 4, flagrant: true, absent_cells: ["mon/lunch","mon/dinner","tue/lunch","tue/dinner"]}`. |
| — | Lea, 50 g/jour, **jamais compté** | **donnée absente du prompt** (et absente du contrôle) | `protein_brief silent: {protected: 1}` ; `final_gate protein_protected: 2` ; aucune ligne protéique sur sa carte ni sur ses six lignes de contrat. |
| — | Max, 63 g au petit-déjeuner pour 25 demandés et 16 g au déjeuner pour 40 | **cible ambiguë ou contradictoire** (contributif, non prouvé suffisant) | Carte = 25/40/35 ; bloc « mesuré par l'app » = 33/33/33 ; système = « *never write a figure for it* ». Le total servi (94,2) est à 5 % de 3 × 33 = 99. |
| — | « plancher applicable 116 g/jour » pour Lea | **mesure erronée** (l'instrument, pas le produit) | `scripts/2026-09-11-mesure-grille.ts:1430-1445` appelle `envelopeFor` en passant `latestWeight: {value: b.weightKg}` — un champ que la production ne remplit **pas** pour une bouche sans compte. Elle obtient donc `per_kg` + `fat_loss` (2,0 g/kg ⇒ 116 g) là où la production obtient `per_portion`. |

⚠️ **Les deux pièges du plan, appliqués ici.**
*Une consigne présente n'est pas une preuve qu'elle a été satisfaite* : les 25/40/35 de
Max **sont** dans le prompt archivé, au caractère, et 4 cases sur 6 ne les tiennent pas.
*Un déficit final n'est pas une preuve que la consigne était bonne* : le déficit de Lea
n'a **aucune** consigne derrière lui, et celui de Max a deux consignes qui se contredisent.

---

## 3. Le premier maillon fautif

### 3.1 Pour les six défauts comptés : le contrat des items de boîte

> **`supabase/functions/_shared/keel/household_meal_generation.ts:2458`**
> ```ts
> const boxSchema = input.sizingPath === "portion_v1"
>   ? []
>   : boxSchemaBlock(input.members, weighedPortionMembers(input.members));
> ```
> avec, juste au-dessus, le commentaire qui l'assume :
> « ⛔ AUCUN SCHÉMA DE BOÎTE SOUS `portion_v1`. Le moteur les autore (lot 4) ; en demander
> au modèle ferait écrire une sortie qu'on jette. »

Ce tir tourne en `sizing_path: "portion_v1"` (`keel.household_meal.portion_sizing`). Le
schéma de boîte — **le seul endroit du prompt où la clé `grams` est nommée**
(`household_meal_generation.ts:1561-1567` : `"items": [{ "preparation_id": …, "term": …,
"grams": <whole grams of READY food> }]`) — n'est donc **pas servi**.

Mais le bloc de régime, lui, **ordonne toujours** d'écrire dans cette clé :

> **`supabase/functions/_shared/keel/household_diet.ts:472-477`**
> « *The one component that line refuses is served PER BOX: a second entry in that dish's
> "boxes", with its own "items" — never a portion_note, never a dish of its own.* »

Preuve dans le prompt archivé : cette phrase est présente (`appel1.input.txt` l. 438) ;
`grep -n "grams" appel1.input.txt` ne rend **aucune** ligne décrivant un item de boîte, et
le `== OUTPUT JSON SCHEMA ==` (`appel1.instructions.txt` l. 337-381) **ne contient pas la
clé `boxes`**. Le modèle a donc écrit ses items dans la seule forme d'item que le schéma
lui enseigne — celle d'un ingrédient : `{term, quantity, amount, unit, state, part, ref,
group}`.

Le lecteur, lui, n'accepte qu'une clé :

> **`supabase/functions/_shared/keel/meal_generation.ts:8624-8632`**
> ```ts
> const rawGrams = Number(it.grams);
> if (!Number.isFinite(rawGrams) || rawGrams <= 0) {
>   boxItemsRefused++;
>   issues.push(`${where}: item ${JSON.stringify(term)} has no usable grams, dropped`);
>   continue;
> }
> ```
> Il ne lit ni `amount`, ni `unit`, ni `ref` + poids unitaire — alors que le prompt donne
> `ham 135 20 unit=30`, c'est-à-dire de quoi convertir « 6 unités » en 180 g.

**La chaîne, en clair :** on ordonne au modèle de mettre la protéine divergente dans
`boxes[].items` → on lui retire le schéma qui dit comment écrire un item → il écrit la
forme ingrédient → le lecteur exige `grams` → **8 items sur 8 tombent** → les 4 repas
principaux perdent leur ancre protéique → le moteur ré-autore des contenants à partir d'un
plat qui n'en a plus → la garde finale refuse deux journées et on livre avec trous.

C'est la cicatrice « la promesse et la clé de schéma doivent se toucher », dans sa forme
la plus dure : **la clé est nommée, sa forme ne l'est plus.**

### 3.2 Pour Lea : un maillon encore plus en amont

> **`supabase/functions/_shared/keel/meal_envelope.ts:1324` et `:1334`**
> ```ts
> const weightKg = body?.latestWeight?.value ?? null;
> …
> if (restrictionFlag || !body || !weightKg) return DEGRADED_ENVELOPE;
> ```

Une bouche **sans compte** reçoit son corps par la fiche, et ce corps porte son poids dans
`declaredWeightKg`, **jamais** dans `latestWeight` :

> **`supabase/functions/_shared/keel/household_bodies.ts:341-360`**
> ```ts
> byMember.set(entry.member.memberId, {
>   heightCm: fiche.h, ageBand: null, gender: fiche.g,
>   latestWeight: null,          // ← « AUCUNE PESÉE DATÉE : une fiche n'est pas une série »
>   declaredWeightKg: fiche.w,   // ← 58 kg vivent ici
>   restrictionFlag: false, activityLevel: null,
> });
> ```

Le générateur passe malgré tout cet objet à `envelopeFor` :

> **`supabase/functions/generate-household-meal-v1/index.ts:3934-3946`**
> `gatedGoal === null || m.body === null ? null : envelopeFor(gatedGoal, m.body, m.body.ageBand, …)`

`envelopeFor` voit `latestWeight` nul ⇒ rend `DEGRADED_ENVELOPE` (`per_portion`). Et
comme cette enveloppe n'est **pas** `null`, la porte de repli ne s'ouvre jamais :

> **`supabase/functions/_shared/keel/household_composition.ts:145-158`**
> ```ts
> if (args.accountEnvelope !== null) return args.accountEnvelope;   // ← s'arrête ici
> if (args.lineBody === null) return null;
> if (args.ageState === "adult") return maintenanceEnvelopeFromBody(args.lineBody);
> ```

`maintenanceEnvelopeFromBody` — la fonction écrite **exactement pour cette population**
(son en-tête le dit : « pour les appelants dont le corps ne peut PAS acheter d'objectif :
une bouche de foyer sans compte ») — n'est donc jamais atteinte. Elle aurait rendu
`per_kg` avec `PROTEIN_FLOOR_G_PER_KG.maintenance = 1.6` × 58 = **93 g/jour**.

Effet mesuré : la bouche est classée `protected` par le brief **et** par la garde finale.
Une abstention prévue pour le plancher TCA et le mineur couvre ici une bouche adulte sans
compte — c'est-à-dire, dans un foyer, **la population la plus nombreuse**. Le fichier
prévient d'ailleurs contre la confusion inverse
(`final_plan_audit.ts:960-966` : « `protected` n'est pas `no_body` ») ; le cas d'ici est un
troisième état que personne ne nomme : *legitimement calculable, arbitrairement dégradé*.

---

## 4. Comparaison avec les deux tirs qui passent

| Tir | Bouches | Régimes | Protéine servie / plancher | Où vit la protéine dans la réponse |
|---|---|---|---|---|
| **N=1 réel** (`lot3-reel-n1`) | 1 (Paul, `fat_loss`, 176 g/j) | un seul | mon **206,1** / 160 ✅ · tue **204,1** / 160 ✅ | `dishes[].ingredients` — 58/68/80 g et 54/72/77 g par case |
| **N=2 déterministe** (`lot2-ref2-c0`, réponse en conserve) | 2 (Max 99 g/j, Lea 116 g/j) | pas de divergence de régime dans la réponse servie | Max **221,6** / 99 ✅ · Lea **118,0** / 116 ✅ | `dishes[].ingredients` — Max 58/86/78, Lea 31/46/41 |
| **N=2 réel** (`lot3-reel-n2`) | 2 (Max 99 g/j ; Lea **sans plancher**) | **vegan (Lea) + libre (Max)** | Max **94,2** / 99 ❌ · Lea **50,2** / — | `dishes[].boxes[].items` — **tous refusés** |

**Ce qui diffère exactement — et c'est une seule chose :** la présence de **deux régimes
différents à la même table**. C'est ce qui déclenche le bloc `household_diet.ts` et son
ordre « la protéine divergente part par boîte », et c'est le seul chemin où la protéine
quitte `dishes[].ingredients` pour `dishes[].boxes[].items` — la seule structure dont le
schéma a été retiré du prompt et dont le lecteur exige une clé que le modèle n'a jamais
vue.

Ni N=1 (une bouche, donc aucune divergence possible) ni N=2 déterministe (conserve écrite
avant ce chemin) n'empruntent ce couloir. **Les deux tirs « qui passent » ne prouvent donc
rien sur ce défaut : ils ne l'atteignent pas.**

Corollaire opérationnel : la seule fixture de la campagne qui exerce ce chemin est
celle-ci. Un banc qui ne porte pas **deux régimes opposés** sur la même table est aveugle
au défaut principal de ce rapport.

---

## 5. Ce qu'il faudrait ajouter — proposition de texte, non appliquée

> ⛔ **Le maillon principal n'est pas la composition de la réponse.** Le modèle a composé
> une source protéique dans chacun des quatre repas concernés. Ajouter du texte au brief
> ne récupérera pas un gramme tant que les items de boîte tombent au parsing. Les propositions
> ci-dessous sont donc classées, et la première n'est **pas** une proposition de prompt.

### P0 — la réparation de structure (à faire d'abord, hors brief)

Deux moitiés d'un même contrat, à remettre en face l'une de l'autre. Trois formes
possibles, aucune tranchée ici :
1. reservir la moitié schéma (`boxSchemaBlock`) quand `household_diet.ts` ordonne une
   boîte, même sous `portion_v1` ;
2. ou faire lire `amount` + `unit` (+ `ref.unitGrams`) au lecteur de
   `meal_generation.ts:8624`, comme le fait déjà `resolveCompositionLine` pour les
   ingrédients ;
3. ou déplacer la divergence de régime hors des boîtes, vers une clé dont le schéma est
   servi.

Dans les trois cas, un **compteur nominatif** est nécessaire : un item refusé est
aujourd'hui une ligne d'`issues` parmi trente, et `swap.flagrant: true` était déjà vrai
sans que rien ne s'arrête.

### P1 — la contrainte protéique de la PART SERVIE, à côté des trois autres

Aujourd'hui, `slotContractSentence` (`slot_contract_brief.ts:127`) reçoit
`proteinMinG = env.proteinPerMealG` (`index.ts:7575`), c'est-à-dire **un seul nombre plat
pour toutes les cases**, et `null` hors `muscle_gain`/`60_plus`. Le nombre par case existe
déjà et part ailleurs : `ProteinSlotAsk.gramsPerServing` (25/40/35 ici). Proposition :
**faire lire à `proteinMinG` la part de la case calculée par `proteinBriefFor`**, et
garder `proteinPerMealG` comme plancher *additionnel* quand il existe.

Ligne rendue, telle qu'elle sortirait (aucune autre partie de la phrase ne bouge) :

```
  · Max, mon lunch: 1165 kcal in one serving · 250 to 700 g cooked (aim 475) ·
    167 to 250 kcal per 100 g (aim 183) · at least 40 g of protein (never under 33)
  · Lea, mon lunch: 620 kcal in one serving · 225 to 558 g cooked (aim 392) ·
    112 to 250 kcal per 100 g (aim 122) · at least 37 g of protein
```

(37 g = part de la case si Lea recevait son plancher de maintenance de 93 g — voir P3.)

### P2 — nommer la troisième échappatoire, celle que ce tir a prise

`PROTEIN_CONSEQUENCE` (`plan_protein_brief.ts:302-310`) ferme deux sorties : l'assiette
plus grosse, et la viande empilée. Ce tir en a pris une troisième — **remplir l'énergie
avec de la matière grasse** (53 % et 55 % des kcal des deux casseroles). Deux lignes à
ajouter au bloc existant, sans toucher au reste :

```
And do NOT reach the calories with added fat instead: oil, butter or cream are the
cheapest way to hit an energy figure and they carry no protein at all. If a pot's
calories come mostly from the fat poured into it, the dish has no anchor — rebalance
towards the food that carries the protein, at the same cooked weight.
```

Cette phrase **n'augmente ni la viande ni le volume** : elle demande un rééquilibrage à
masse cuite et à énergie constantes, ce que le bloc réclame déjà pour la densité.

### P3 — donner un plancher à une bouche sans compte (correctif d'enveloppe, pas de brief)

Lea n'a **aucun** plancher, ni dans le prompt ni dans la garde. Le correctif juste est de
laisser `mouthEnvelope` atteindre `maintenanceEnvelopeFromBody` — 1,6 g/kg, soit 93 g/jour,
**jamais** les 2,0 g/kg de son objectif `fat_loss` : une fiche sans série de pesées ne peut
pas acheter un objectif, c'est écrit dans l'en-tête de la fonction. Ce n'est pas un
abaissement de plancher : c'est passer de **rien** à **93 g**.

⚠️ Aucune de ces propositions ne demande qu'une **préparation partagée** porte la valeur
personnelle de chaque consommateur. La contrainte de P1 porte sur **la part servie** —
c'est déjà la forme de `proteinFragment` (« *one serving here carries at least…* ») et de
la ligne de densité. Une casserole commune reste une casserole commune ; ce sont les
boîtes qui divergent, ce qui est le modèle déjà écrit dans `household_diet.ts`.

---

## 6. ⛔ Ce que je ne sais pas trancher

1. **L'ampleur exacte de ce que le parsing a coûté.** Mes contrefactuels (36 g de jambon
   pour Max, 22,4 g / 19,4 g de tofu pour Lea) sont calculés **avant** tout
   re-dimensionnement. Or 180 g de jambon = 243 kcal sur une case déjà à sa cible : le
   dimensionnement aurait re-taillé l'assiette, donc le gain réel est inférieur. Je peux
   affirmer l'ordre de grandeur (« la boîte perdue est du même ordre que le manque »), pas
   le chiffre final. **Le seul moyen de le savoir est un rejeu réel avec les items acceptés.**
2. **Si le lecteur doit accepter `amount`/`unit`, ou si le prompt doit reservir `grams`.**
   Les deux referment le trou ; ils n'ont pas le même coût ni les mêmes effets de bord
   (un item en unités demande une résolution de poids unitaire au parsing, qui n'existe pas
   aujourd'hui à cet endroit).
3. **Si les 25/40/35 auraient suffi.** Le prompt les portait, et 4 cases sur 6 ne les ont
   pas tenues — mais ces mêmes 4 cases avaient leur protéine ailleurs, dans la boîte. Je ne
   peux donc **pas** dire si la contradiction 25/40/35 vs 33/33/33 a un effet propre : elle
   est plausible (94,2 ≈ 3 × 33), elle n'est pas démontrée. **Le journal du contrefactuel
   manque : aucun compteur ne dit quel des deux nombres le modèle a visé.**
4. **Si l'instruction système « *Never write a figure for it* » nuit.** Elle contredit
   littéralement le message utilisateur sur le même sujet. Je ne sais pas laquelle des deux
   le modèle a suivie, et rien dans ce tir ne permet de le séparer.
5. **Si `restrictionFlag` a un rôle pour Lea.** Non, ici : `household_bodies.ts:359` pose
   `restrictionFlag: false` pour une bouche sans compte. C'est bien `!weightKg` seul qui
   déclenche la dégradation. Mais je n'ai pas vérifié le cas d'une bouche **avec** compte et
   sans pesée, qui prend le même chemin pour une autre raison.
6. **Si le défaut est neuf.** Le chemin « deux régimes à la même table » n'est exercé par
   aucune autre fixture de la campagne que j'ai mesurée. Je ne sais pas depuis quand il est
   cassé, ni s'il l'a jamais marché.

---

## Annexe — commandes de rejeu (lecture seule, gratuites)

```bash
deno run --allow-read scratchpad/2026-09-11-FIABILITE-RECETTES/analyse-lot-F.ts \
  scratchpad/2026-09-11-CLOTURE/fixtures/lot3-reel-n2.json      # § 8 = protéines
deno run --allow-read scratchpad/2026-09-11-FIABILITE-RECETTES/analyse-lot-F.ts \
  scratchpad/2026-09-11-CLOTURE/fixtures/lot3-reel-n1.json      # le tir qui passe
deno run --allow-read scratchpad/2026-09-11-FIABILITE-RECETTES/analyse-lot-F.ts \
  scratchpad/2026-09-11-CLOTURE/fixtures/lot2-ref2-c0.json      # N=2 déterministe
```

Le détail par case (protéine servie case par case, absent du rendu de l'instrument) a été
obtenu en appelant `mesurerUnPlan(fx, ligne, {rang})` pour chaque bouche et en lisant
`cases[].portion.proteineG` — aucune équation recodée.
