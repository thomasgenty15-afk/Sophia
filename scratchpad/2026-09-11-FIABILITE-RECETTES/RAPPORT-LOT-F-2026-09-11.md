# Lot F — prouver les branchements et mesurer le résultat

Chantier : `docs/keel/PLAN-FIABILITE-ET-EQUILIBRE-RECETTES-2026-09-11.md`, section « Lot F »
et « Critère de fin ». Socle : `scratchpad/2026-09-11-FIABILITE-RECETTES/SOCLE.md`.
Les rapports des lots 0, A, B, C, E et leurs sorties d'instrument ne sont **pas** modifiés.

> ⛔ **CE RAPPORT NE DIT RIEN DU GOÛT.** Aucune recette n'a été cuisinée, aucune
> dégustation n'a eu lieu. Les fiches du § 7 sont des grammes et des rapports ; la
> **validation gustative reste explicitement à faire, par un humain**.
>
> ⛔ Et il ne dit pas « premier jet parfait », ni « tous les ingrédients vérifiés »,
> ni « aucune perte de saveur ». Ce qui suit distingue partout ce qui est **prouvé**, ce qui
> **échoue** et ce qui n'a **pas été mesuré**.

---

## 0. Les arbitrages — la partie à lire en premier

| question | décision | raison, avec ses nombres |
|---|---|---|
| Comment tenir « adaptateur fournisseur contrôlé au niveau transport » **sans** exposer un interrupteur aux requêtes de production ? | **Rien n'est ajouté sous `supabase/functions/**`.** Le banc capture `Deno.serve` (sans ouvrir de port), remplace `globalThis.fetch` **dans son propre processus**, puis importe le VRAI handler et l'appelle avec un `Request`. | Une branche capable de servir une réponse en conserve depuis une requête HTTP ordinaire serait pire que l'absence de banc — c'est la garde dure du plan. Ici le chemin qui sert la conserve n'existe **que** dans le processus du banc : Kong et `functions serve` n'y ont aucun accès. Et l'adaptateur **jette** sur toute sortie réseau hors pile locale : 0 sortie refusée sur 5 lancements, donc 0 dépense accidentelle. |
| Pourquoi ne pas se servir de `MEGA_TEST_MODE` ? | **Posé à `0` explicitement.** | C'est un stub de **disponibilité** : il rend `MEGA_TEST_STUB: <200 premiers caractères>`, que le parseur de plan rejette. Il prouve que la fonction répond sans clé ; il ne prouve **rien** du parcours de composition. |
| La réponse archivée a 7 plats, la grille du soir en a 6. Forcer, ou retailler ? | **Les deux, dans cet ordre, et le premier tir est une preuve.** Envoyée telle quelle → **422 `mouth_unfed`** sur `sun/dinner`. Puis retaillée : le plat du vendredi retiré, sa séance de cuisine **déplacée** au samedi. | La fixture ne fige pas l'heure. À 15 h 07 la grille avait 7 cases (`fri/dinner` + 2 jours) ; à 19 h 42 le vendredi tombe entier (`spent_first_day_dropped: fri (shopping_cutoff)`). Le 422 n'est pas un incident à taire : c'est la mesure que **l'heure locale décide de la grille**. Le retaillage ne touche **aucun gramme, aucun ingrédient, aucune méthode**. |
| Un tir réel se compare-t-il à l'avant en durée ? | **Non. Durée absolue et charge, rien d'autre.** | « Sans témoin équivalent, publier la durée absolue et la charge ; ne pas attribuer un pourcentage de gain au chantier. » Les six tirs font **6 cases** ; les deux tirs du matin en faisaient **7**, avec une autre heure locale. Aucun pourcentage n'est publié, et l'instrument refuse d'en imprimer un. |
| Le plafond de 600 s de Kong local pardonne-t-il une durée ? | **Non, il la révèle.** Chaque tir est comparé à **150 000 ms**, le plafond de l'hébergé. | « Séparer limite locale configurée et limite réellement vérifiée de la cible de déploiement. » Trois tirs sur six seraient **coupés en production**. |
| Un tir de campagne échoué se relance-t-il ? | **Non.** Le tir n° 5 est mort **avant tout appel modèle**, sur une faute du **harnais** (`keel_household_set_member_rhythm → has_account`). Corrigé, relancé **une fois**, et c'est écrit ici. | « Ne pas relancer en silence les échecs. » Un provisionnement qui casse avant le modèle n'est pas un tir ; le relancer en le **disant** n'est pas un silence. Aucun tir ayant atteint le modèle n'a été rejoué. |
| L'instrument du lot 0 : le réutiliser ou en écrire un second ? | **Le réutiliser.** `analyse-lot-F.ts` fabrique un contexte pour un plan neuf et appelle `mesurerUnPlan` / `rendre`. | « Ne pas recoder les équations dans le script du banc. » Deux instruments = deux jeux de définitions, et ils divergent au premier arrondi. |
| Les plans du banc se relisent-ils par l'écran ? | **Oui, et par un test du dépôt**, pas par une lecture à l'œil. Trois plans écrits ce soir sont recopiés en fixture front et remontés dans les **vrais composants**. | « Aller jusqu'à la sérialisation, l'écriture de fixtures et leur relecture par les lecteurs API/UI. » Un test qui lirait le scratchpad mourrait au premier ménage ; la fixture est dans `src/`. |
| Le rouge front supplémentaire de `planRefusals` : le laisser ou le fermer ? | **Fermé.** `plan_not_deliverable` a désormais ses mots, en français et en anglais. | Il est arrivé avec le lot E, qui a posé le refus 422 côté serveur et n'a touché aucun fichier de `frontend/`. Le laisser aurait fait finir ce chantier à **3 rouges front** au lieu de 2 — et surtout, le jour où la branche s'arme, la personne lirait un mur muet. |
| `Number(null)` vaut zéro dans `readIngredients` : réparer ici ? | **Oui, une ligne.** | Le commentaire au-dessus disait déjà la bonne règle (« `null` ET JAMAIS ZÉRO ») et le code faisait l'inverse. Mesuré sur les plans du banc : 6 lignes sur 43. L'écran n'en souffrait pas, mais tout lecteur qui **somme** ces `amount` comptait une pincée pour une mesure. |
| `retry_merge.ts` jette 6 lignes de courses par pluriel : réparer ? | **Non — nommé, pas réparé.** | C'est un défaut **neuf**, trouvé par ce lot, dans un fichier qu'aucun lot de ce chantier ne possède. Le réparer demande une identité alimentaire dans un module **pur** qui n'a pas d'index. Et l'audit du lot E le **voit** déjà : c'est la démonstration que le contrôle marche. Détail au § 8. |

---

## 1. ① Hors ligne — les deux réponses archivées rejouées par les fonctions de production

**Commande :**

```bash
deno run --allow-read scripts/2026-09-11-mesure-grille.ts \
  scratchpad/2026-09-11-FIABILITE-RECETTES/fixtures
```

Sortie : identique **à l'octet** à `mesure-lot-D-2026-09-11.txt`. L'instrument du lot 0,
avec le code de ce soir, reproduit exactement l'état que le lot D a laissé — donc rien
n'a bougé sous les lots pendant que j'écrivais.

**Avant / après par étape**, sur les deux plans archivés :

| étape | avant le chantier (lot 0) | après (aujourd'hui) | où c'est prouvé |
|---|---|---|---|
| identité alimentaire | PERTE 46 vérifiées + **1 en attente** ; GAIN 47 + **2 non mesurables** | PERTE **47 / 0** ; GAIN **49 / 0** | `mesure-lot-A` → `mesure-lot-D`, § 3 |
| portions mesurables | **11 / 14** | **12 / 14** (GAIN `sat/breakfast` : `dish_incomplete` → **546,00 kcal**) | § 2 de l'instrument |
| cible d'une case | **deux cibles**, facteur **2,86** (858,90 vs 2 454,00) | **une seule**, comparée case par case | § 1, colonne « archive » conservée |
| couloir de densité transmis | 6 dîners à **[250–250] `above_askable_cap`** | **[123–250] visée 135** (PERTE), **[146–250] visée 160** (GAIN) | § 6, colonne « couloir ARCHIVE » conservée |
| prose de recette | **64 lignes sur 96** périmées | **0** après `finalizeQuantityProse` (sur une **copie** ; la base n'est pas réécrite) | § 9 |
| alertes d'achats | **8 faux positifs** de pluriel | **0** ; un vrai sous-achat révélé (tomate, −10,5 %) | § 10, colonne « ARCHIVE » conservée |

⛔ **Et le piège, qui reste imprimé.** Les 6 dîners « rentrent » dans leur couloir **sans
qu'un gramme ait bougé** : c'est le couloir qui s'est élargi. L'instrument l'écrit à chaque
passage — 241 servis pour une visée de 135, ×1,79. Ce que ça prouve, c'est que le couloir
transmis est réparé ; ce que ça ne prouve pas, c'est l'obéissance du modèle. **C'est la
campagne du § 6 qui l'a mesurée, et elle l'a mesurée à 135.**

---

## 2. ② Intégration sans dépense modèle — la partie qui n'existait pas

### 2.1 Ce qui a été construit

| fichier | rôle |
|---|---|
| `scratchpad/…/transport-lot-F.ts` | l'adaptateur : `installControlledTransport` (fetch), `captureServeHandler` (`Deno.serve` sans port), `cannedFromFixtures`, `retaillerReponse`. |
| `scratchpad/…/banc-lot-F.ts` | le banc : environnement, provisionnement **par les RPC du produit**, appel du vrai handler, relecture de la ligne écrite, écriture d'une fixture de sortie. |
| `scratchpad/…/analyse-lot-F.ts` | la grille du lot 0, appliquée à un plan neuf. |

**Commande :**

```bash
deno run --allow-read --allow-env --allow-net --allow-sys --allow-write=scratchpad \
  scratchpad/2026-09-11-FIABILITE-RECETTES/banc-lot-F.ts <perte|gain> --retaille [--compte=X] [--duo] [--secondaire]
```

### 2.2 Ce que le parcours traverse, et ce qu'il rend

Cinq lancements, tous à **0 sortie réseau refusée** (donc **0 appel modèle facturé**) :

| lancement | réponse envoyée | statut | plan écrit | appels fournisseur interceptés |
|---|---|---|---|---|
| PERTE, réponse **telle quelle** | 7 plats | **422 `mouth_unfed`** | — | 2 (composition + `unfed_retry`) |
| PERTE, retaillée | 6 plats | **200** | `8f749960…` | 1 |
| PERTE, retaillée (compte b) | 6 plats | **200** | `9a95b94a…` | 1 |
| GAIN, retaillée | 6 plats | **200** | `5aa1a1f6…`* | 3 (composition + relance + `composition_fill`) |
| PERTE **foyer de deux** + compte secondaire | 6 plats | **200** | `49ee82ab…` | 2 |

\* les identifiants exacts des sorties conservées sont dans `sorties-lot-F/`.

Le parcours va bien **jusqu'au bout** : parseur → identités → contrat par case → bornes et
couloirs → structure culinaire → ajustement → dimensionnement → finalisation des quantités →
audit et porte finale → **écriture en base** → relecture. Preuves, sur `perte-c` :

```
cases 6 · plats 6 · portions 6 · mesurables 6 · conformes 6/6   (archive : 7/7/6/6/6)
références       43 vérifiées / 43 lignes · 0 en attente · 0 non mesurable
prose            43 rapprochées · 37 réécrites · 0 PÉRIMÉE
porte finale     ok=true · refus 3 · bloquants 0
                 delivery = deliverable_with_gaps
                 unevaluated = [title_promises_missing_preparation, mouth_energy_short]
                 incomplete  = [shopping_quantity ×3, mouth_energy ×1]
                 causes      = [cell_energy_off ×2, protein_floor_short ×1]
dénominateurs    portion_cells 6 · measured_cells 6 · measured_days 2 · protein_days 2
```

⛔ **Un appel modèle en moins, et il se voit.** L'archive de PERTE avait besoin d'un
`composition_fill` (le sas appelé pour « pita complete »). Le même contenu, rejoué
aujourd'hui, n'en demande **aucun** : l'identifiant `pita_wholemeal` suffit. C'est le lot A,
mesuré de bout en bout, sur le chemin réel.

### 2.3 Foyer de deux, et compte secondaire

Un seul lancement rend les deux :

```
2e bouche : Lea · 164 cm · 58 kg · femme · sédentaire · appétit small
compte secondaire → 403 « not_owner »
porte finale : mouth_cells 12 · portion_cells 12 · measured_cells 12 · protein_days 4
              deux contenants par plat, de grammages DIFFÉRENTS (352 vs 472 g, 253 vs 341 g…)
```

**Une préparation partagée est attribuée à chacun de ses consommateurs**, avec sa part à
elle. Et **le compte secondaire reste refusé à la génération** — exigence ③ du plan.

### 2.4 Ce que ce banc ne prouve pas

- **Aucune latence de modèle réel.** Les 800 ms mesurées sont le handler **sans** le
  fournisseur. Elles ne se comparent à aucune durée de campagne, et l'instrument le dit.
- **La branche de refus 422 `plan_not_deliverable` n'a toujours pas été atteinte.** Sous
  `FINAL_GATE_POLICY_LOT_1`, `bloquantes` reste vide. Le 422 observé au premier lancement est
  `mouth_unfed`, une **autre** porte, plus ancienne.
- **Les `member_portions` du modèle sont rejetées** (`portion_for_unknown_member` ×6) : le
  plan archivé nomme la bouche de `camp.perte`, pas celle du compte du banc. Les portions
  sont donc **ré-autorées** par le chemin déterministe (`portion_standard_recipe`). Ce n'est
  pas un défaut du moteur ; c'est une limite de fidélité du rejeu, et elle est nommée.

---

## 3. ③ UI — ce que l'écran rend, sur des plans écrits ce soir

**Commande :**

```bash
cd frontend && npx vitest --config vitest.config.ts run src/keel/lib/relectureLotF.int.test.ts
```

**8 épreuves vertes.** Fixture : `frontend/src/keel/lib/__fixtures__/lot-f-plans.json` — les
**trois lignes `student_generated_meals` écrites par le vrai handler**, recopiées au
caractère (PERTE solo, GAIN solo, PERTE foyer de deux).

| exigence du plan ③ | verdict | preuve |
|---|---|---|
| ouvrir un plan corrigé, ses recettes, ses portions et ses courses | ✅ | `SessionPreparation` monté, HTML lu ; `readDishes` / `readPreparations` / `readShopping` |
| **recharger** | ✅ | aller-retour `jsonb` (`JSON.parse(JSON.stringify(payload))`) **avant** chaque rendu |
| une personne **et** un foyer de deux | ✅ | trois plans, dont `duo` (`servings: 2`, 2 contenants par plat) |
| quantités **structurées** transportées | ✅ | `amount`, `unit`, `state`, `grams_raw`, `ref` sur **toutes** les lignes pesées ; état de lecture `structured` |
| quantités **rendues** = quantités calculées | ✅ | le HTML contient `ingredientQuantityText(ing)` au centième, sur > 5 lignes vérifiées, prémisse épinglée |
| **cru / prêt** séparés | ✅ | casserole en `state: raw` et `grams_raw` ; contenant en `grams` **nus** ; sur le duo, les deux contenants d'un même plat n'ont pas le même grammage — aucune somme ne peut se confondre avec le lot |
| **états d'écart** lisibles à l'écran | ⚪ **non fait** | le contrat serveur existe (`issues[] = final_gate_delivery:*`, corps 422 avec `refusals`/`unevaluated`/`incomplete`) ; **aucun écran ne le lit**. C'est la demande **C-E3** du lot E, toujours ouverte. Ce lot a posé **les mots** du refus, pas la surface. |
| un compte secondaire reste refusé | ✅ | `403 not_owner`, mesuré par le banc (§ 2.3) |

⛔ **Et une absence est épinglée, exprès** : `shopping_list[]` n'a **ni `amount`, ni `unit`,
ni `ref`**. Le test le vérifie. Tant que c'est vrai, l'écran ne peut rien dériver de ces
lignes et le contrôle de suffisance rend « incomplet ». C'est la demande **C-E1** du lot E.

### Le défaut trouvé ici, et réparé

`frontend/src/keel/api/mealGeneration.ts::readIngredients` faisait `Number(i.amount)`.
`Number(null) === 0`, et `0` passe `Number.isFinite` : une ligne de condiment
(`amount: null`, « une pincée de sel ») ressortait à **zéro** — « n'en mets pas », une
affirmation — au lieu d'**inconnu**. **6 lignes sur 43** (PERTE) et **6 sur 68** (foyer).
Le commentaire juste au-dessus disait déjà la bonne règle. Corrigé par `typeof`, épinglé par
le test (`expect(amount).toBeNull()` sur les condiments).

---

## 4. ④ Contrôles du dépôt

| commande | résultat | comparaison |
|---|---|---|
| `deno test --allow-read --allow-env supabase/functions/_shared/keel/` | **6 667 passed · 3 failed · 2 ignored** | **les trois rouges du socle**, aux mêmes lignes |
| `deno check supabase/functions/generate-household-meal-v1/index.ts` | **Check** (exit 0) | — |
| `deno check supabase/functions/meal-energy-v1/index.ts` | **Check** (exit 0) | — |
| `deno check` des trois scripts du lot F | **Check** (exit 0) | — |
| `deno run --allow-read scripts/2026-09-11-mesure-grille.ts …/fixtures` | exit 0, sortie identique à `mesure-lot-D` | — |
| `cd frontend && npx tsc -b --force` | exit **0** | — |
| `cd frontend && npx vitest --config vitest.config.ts run` | **2 failed · 2 551 passed · 20 skipped (163 fichiers)** | **les deux rouges du socle** ; **+8 tests** |
| `cd frontend && npm run build` | ✓ built, 2 pages prérendues | — |

Les **3 rouges Deno** : `cooking_style_brief_test.ts:70`, `household_freeze_test.ts:286`,
`household_merge_quota_test.ts:190`. Aucun n'est touché par ce lot.

Les **2 rouges front** : `mouthProfileReaders.int.test.ts:154` (cherche un
`<ActivitySessionsCard>` pas encore posé) et `energyBasis.int.test.ts:188` (inventaire de clés
`student_progress.journal.*`, travail d'une session voisine). Aucun n'est touché par ce lot.

> ⚠️ **Il y avait un TROISIÈME rouge front en arrivant, et il n'est nommé nulle part.**
> `planRefusals.int.test.ts:194` échouait sur `plan_not_deliverable` : le lot E a posé ce
> refus côté serveur sans toucher `frontend/`, et son rapport ne mentionne aucun lancement de
> `vitest`. **Il est fermé ici** (copie fr + en), et la suite front repasse à 2 rouges.
>
> ⚠️ **Et une erreur préexistante nommée par le lot E a disparu d'elle-même** :
> `meal_pdf_locale_test.ts:46` (qui l'obligeait à `--no-check`) typecheck aujourd'hui. La
> suite Deno tourne **sans** `--no-check`.

---

## 5. ⑤ La petite campagne réelle — six tirs, un par lancement

**Commande, une fois par tir :**

```bash
deno run --allow-read --allow-env --allow-net --allow-write=scratchpad \
  scratchpad/2026-09-11-FIABILITE-RECETTES/campagne-lot-F.ts <1..6>
```

Par Kong, par `functions serve`, **modèle réellement appelé**. Aucun `DELETE` : un compte de
fixture par tir (`lotf.camp<N>@keeltest.dev`), `intent: prepare_next` pour une fenêtre neuve.
Les deux plans de la campagne du matin (`1f8a8988`, `1eada05b`) ne sont ni lus en écriture ni
touchés.

### Le nombre de cases, annoncé avant chaque tir

`3 jours × 3 moments = 9` ; les tirs partent entre **19 h 59** et **20 h 13** locales, donc le
premier jour tombe entier (`spent_first_day_dropped: fri (shopping_cutoff)`) ⇒ **6 cases**
annoncées, **6 obtenues** partout. Pour le tir n° 6 : **6 cases × 2 bouches = 12 parts**
annoncées, **12** obtenues.

> ⛔ **Le tir n° 1 du plan demandait « une fenêtre commençant l'après-midi ». Ce n'est pas ce
> qui a été mesuré, et c'est dit.** À 20 h, l'après-midi est passée : la coupure de courses
> retire le premier jour entier. Les six tirs portent donc tous « deux journées entières ».
> Rejouer une fenêtre d'après-midi demande de tirer entre 12 h et ~17 h.

### Les six tirs

| tir | cas | statut | durée | ≤ 150 s hébergé | cases | plats | portions | mesur. | conformes ±10 % |
|---|---|---|---|---|---|---|---|---|---|
| 1 | PERTE, appétit moyen | 200 | **207 357 ms** | ⛔ **+57 357 ms** | 6 | 6 | 6 | 6 | **6 / 6** |
| 2 | GAIN, appétit moyen | 200 | **206 261 ms** | ⛔ **+56 261 ms** | 6 | 6 | **5** | 5 | **5 / 5** |
| 3 | PERTE, **grand appétit** | 200 | **104 221 ms** | ✅ | 6 | 6 | 6 | 6 | **6 / 6** |
| 4 | GAIN, **petit appétit** | 200 | **175 023 ms** | ⛔ **+25 023 ms** | 6 | 6 | 6 | 6 | **6 / 6** |
| 5 | PERTE, rythme déclaré + apport fixe | 200 | **134 101 ms** | ✅ | 6 | 6 | 6 | 6 | **6 / 6** |
| 6 | **Foyer de deux** + allergie réelle | 200 | **106 733 ms** | ✅ | 6 (**12 parts**) | 6 | **12** | 12 | **6 / 6** * |

\* l'instrument de mesure reconstruit **une** bouche ; les 12 parts sont attestées par les
compteurs du moteur (`mouth_cells 12 · portion_cells 12 · measured_cells 12 · protein_days 4`).

**Durées : 104 221 · 106 733 · 134 101 · 175 023 · 206 261 · 207 357 ms** à **6 cases** et
1 ou 2 bouches. Médiane ≈ 155 s ; **trois tirs sur six dépasseraient le plafond de
l'hébergé**. ⛔ **Aucun pourcentage de gain n'est publié** : il n'existe aucun témoin à même
nombre de cases, même horaire et mêmes réglages fournisseur.

### Le tableau demandé par le plan, par run

```text
────────────────────────────────────────────────────────────────────────────
TIR 1 · PERTE · appétit moyen · 2026-09-11 19:59 Europe/Paris
versions   code = arbre de travail du 2026-09-11 20 h (lots 0→E + lot F)
           modèle gpt-5.6-luna · palier fast · maxRetries 1 · repli gpt-5.6-sol
           catalogue 943 lignes · 920 composables · prompt meal.en.v32 + household.v33
           contrat de calcul : adulte, restriction clear, coach maison (no_position)
étapes     réponse brute (26 996 car.) → ajustement `not_found_within_limits`
           (14 mouvements, 2 défauts avant, 2 après, 0 dégradé) → réparation 1/2
           → payload relu
cases      attendues 6 / plats 6 / portions 6 / mesurables 6 / conformes 6
nutrition  613,50→613,00 · 981,60→981,62 · 858,90→859,38 (12/09)
           613,50→613,00 · 981,60→980,77 · 858,90→858,38 (13/09)
           journées : 2 454,01 (+0,00 %) et 2 452,15 (−0,08 %) — les deux ✅
références 41 résolues par identifiant / 41 lignes · 0 historique · 0 refusée
           · 0 non mesurable
recettes   composants culinaires déclarés par le modèle : 3 à 6 par plat
           lignes verrouillées par le contrat : 15 · unités sous contrat : 5
           rapports préservés à ≤ 0,2 pt (arrondi) sur les préparations non réparées
quantités  41 lignes rapprochées · 41 réécrites · 0 PÉRIMÉE
           15 lignes en unité dénombrable, **15 fractionnaires** (2,13 hauts de cuisse…)
contrôles  protéines 101,3 g et 100,5 g pour un plancher de 176 g ⇒ −42 % et −43 %
           achats : 4 `not_bought` (citron, oignon, pita complète, tomate)
                    3 `short` (feta 80/115,7 · huile 90/132,9 · noix 35/37,4)
                    7 contrôles incomplets
           restrictions : aucune déclarée ⇒ NON CONTRÔLÉ, pas « conforme »
coût       2 transmissions fournisseur · 1 réparation sur 2 · 207 357 ms
           échéance 380 000 ms, utilisable 142 693 ms, réserve 30 000 ms
livraison  deliverable_with_gaps — ok=true, 9 refus, 0 bloquant
           causes : ingredient_short_bought, ingredient_not_bought, protein_floor_short
────────────────────────────────────────────────────────────────────────────
TIR 2 · GAIN · appétit moyen · 20:03
étapes     réponse brute (21 923 car.) → ajustement `nothing_to_do`
           → réparation 1/2 → payload relu
cases      6 / 6 / **5** / 5 / 5      ⛔ `sun/dinner` : plat présent, AUCUNE portion
nutrition  728,00→728,00 · 1 164,80→1 164,83 · 1 019,20→1 019,32 (12/09) ✅
           728,00→724,82 · 1 164,80→1 164,09 · `sun/dinner` non mesurable (13/09)
           journée 12/09 : 2 912,15 (+0,01 %) ✅ · 13/09 NON MESURABLE (1 trou sur 3)
références 42 / 43 lignes · **1 non mesurable : « pita complete »**
           champ `ref` écrit par le modèle : **20 / 43**
recettes   ajusteur : 0 mouvement · 22 lignes verrouillées par le contrat · 4 unités sous contrat
quantités  43 rapprochées · 38 réécrites · 0 PÉRIMÉE
contrôles  protéines 177,0 g (✅) et journée non mesurable
           achats : 1 `not_bought` — **« eau »**, 219 g requis (faux positif : personne
                    n'achète l'eau du robinet) · 4 incomplets
coût       2 transmissions · 1 réparation sur 2 · 206 261 ms
livraison  deliverable_with_gaps — 2 refus, 0 bloquant
           causes : ingredient_not_bought, **cell_without_portion**
────────────────────────────────────────────────────────────────────────────
TIR 3 · PERTE · GRAND APPÉTIT · 20:06
cases      6 / 6 / 6 / 6 / 6
nutrition  journées 2 452,74 (−0,05 %) et 2 452,55 (−0,06 %) ✅
densité    dîners 133 et 125 pour une visée de 135 ✅ ; petits-déj **94** et **99**
           pour un plancher de 100 ⇒ 2 cases HORS COULOIR (−6 % et −1 %)
références 42 / 42 · 0 en attente · 0 non mesurable
recettes   ajusteur `nothing_to_do` — le premier jet était DÉJÀ dans le couloir
           17 lignes verrouillées · 4 unités sous contrat
quantités  42 rapprochées · 41 réécrites · **1 PÉRIMÉE** — `sun/lunch` « 2 pitas complets »
           pour 2,00 unit calculés, ×1,001 : c'est l'ARRONDI, pas un écart lisible
contrôles  protéines 134,6 g et 144,6 g pour 176 g ⇒ −24 % et −18 %
           achats : 0 manque, 6 incomplets
coût       **1 transmission** · **0 réparation** · 104 221 ms ✅ sous le plafond hébergé
livraison  deliverable_with_gaps — 2 refus, 0 bloquant · cause : protein_floor_short
────────────────────────────────────────────────────────────────────────────
TIR 4 · GAIN · PETIT APPÉTIT · 20:08
cases      6 / 6 / 6 / 6 / 6
nutrition  journées 2 910,80 (−0,04 %) et 2 910,57 (−0,05 %) ✅
densité    6 / 6 dans le couloir (122 · 193 · 203 · 128 · 191 · 171)
références 33 / 33 · 0 en attente · 0 non mesurable
quantités  33 rapprochées · 32 réécrites · 0 PÉRIMÉE
contrôles  protéines 130,2 g et 179,3 g pour 99 g ⇒ ✅ ✅
           achats : 4 `not_bought` (pêche, tomate, thon en boîte, eau) · 3 incomplets
coût       2 transmissions · 1 réparation sur 2 · 175 023 ms ⛔ +25 023 ms
livraison  deliverable_with_gaps — 4 refus, 0 bloquant · cause : ingredient_not_bought
────────────────────────────────────────────────────────────────────────────
TIR 5 · PERTE · rythme déclaré (déjeuner « small ») + apport fixe 200 g · 20:13
           ⚠️ PREMIER LANCEMENT MORT AVANT LE MODÈLE (faute du harnais, § 0)
cases      6 / 6 / 6 / 6 / 6
nutrition  journées 2 452,39 (−0,07 %) et 2 453,51 (−0,02 %) ✅
           ⛔ cibles de créneau IDENTIQUES à un tir sans rien de déclaré
           (613,50 / 981,60 / 858,90) — voir le défaut ⑤ du § 8
densité    6 / 6 dans le couloir
références 47 / 47 · 0 en attente · 0 non mesurable
recettes   ajusteur `closed` : **2 défauts fermés**, 15 mouvements, **0 consommateur dégradé**,
           4 lignes réécrites, 20 lignes verrouillées par le contrat
quantités  47 rapprochées · 43 réécrites · 0 PÉRIMÉE
contrôles  protéines 107,3 g et 122,8 g pour 176 g ⇒ −39 % et −30 %
           achats : 1 `short` (tomate 640/698,3) · 5 incomplets
coût       **1 transmission** · **0 réparation** · 134 101 ms ✅
livraison  deliverable_with_gaps — 3 refus, 0 bloquant
────────────────────────────────────────────────────────────────────────────
TIR 6 · FOYER DE DEUX · besoins différents · allergie RÉELLE « arachide » · 20:11
cases      6 cases × 2 bouches = **12 parts annoncées, 12 obtenues**
           mouth_cells 12 · portion_cells 12 · measured_cells 12 · protein_days 4
nutrition  journées (titulaire) 2 452,82 (−0,05 %) et 2 452,99 (−0,04 %) ✅
densité    6 / 6 dans le couloir (133 · 148 · 136 · 127 · 165 · 130)
références 33 / 33 · 0 en attente · 0 non mesurable
recettes   ajusteur `nothing_to_do` · 5 lignes verrouillées · **8 unités sous contrat**
quantités  33 rapprochées · 33 réécrites · 0 PÉRIMÉE
contrôles  ⛔ **L'ALLERGIE EST BIEN ARRIVÉE AU PROMPT**, sous ses DEUX libellés :
             « - Lea: peanut — allergy, severity=medical (declared by student) »
             « - Lea: arachide — allergy, severity=medical (declared by student) »
           Aucun des 24 termes du plan n'est une arachide ni un dérivé.
           ⚠️ Mais aucun compteur du run ne dit que la ceinture a été ARMÉE :
             `exclusion_belt` n'a pas été journalisée, `regime_belt.mouths = 0`.
             « Pas violée » est donc établi ; « la ceinture tient » ne l'est pas.
           protéines (titulaire) 120,4 g (−32 %) puis 185,9 g (✅) pour 176 g
           achats : 1 `short` (pêche 260/364,1) · 2 incomplets
coût       **1 transmission** · **0 réparation** · 106 733 ms ✅
livraison  deliverable_with_gaps — 3 refus, 0 bloquant
────────────────────────────────────────────────────────────────────────────
```

### Conformité, publiée en trois colonnes séparées

Le plan l'exige : « La conformité au premier jet, après ajustement et après réparation se
publie **séparément**. »

| tir | premier jet (ajusteur : défauts de densité AVANT) | après ajustement déterministe | après réparation modèle |
|---|---|---|---|
| 1 | **2** hors couloir | **2** (`not_found_within_limits`) | **0** (1 réparation) |
| 2 | **1** | **1** (`nothing_to_do`, 1 non mesurable) | **0** hors couloir, mais **1 case sans portion** (1 réparation) |
| 3 | **0** | **0** (`nothing_to_do`) | — (0 réparation) |
| 4 | non relevé séparément | — | 0 hors couloir (1 réparation) |
| 5 | **2** | **0** (`closed`, 15 mouvements, 0 dégradé) | — (0 réparation) |
| 6 | **0** | **0** (`nothing_to_do`) | — (0 réparation) |

⛔ **Six tirs ne font pas un taux.** Ils disent ce qui s'est passé six fois, un soir, sur une
pile locale, avec un catalogue et un modèle donnés. Ils ne constituent **pas** une estimation
fiable du taux de réussite général.

---

## 6. Ce que la campagne prouve, et qui n'était pas prouvable avant

### 6.1 La consigne de densité réparée change le plat servi

C'est le seul résultat que le lot B disait ne pas pouvoir revendiquer (« aucun effet de
prompt n'est mesuré, et aucun n'est revendiqué »).

| | dîners de la campagne du matin | dîners des six tirs de ce soir |
|---|---|---|
| couloir transmis | **[250–250]**, `above_askable_cap` | **[123–250] visée 135** (PERTE) · **[146–250] visée 160** (GAIN) |
| densité servie | **241 · 244 · 247 · 228** (collés au plafond) | **135 · 132 · 133 · 125 · 125 · 138 · 136 · 130** (PERTE) · **166 · 203 · 171** (GAIN) |
| écart à la visée | **×1,78 à ×1,81** | **×0,93 à ×1,27** |

Les dîners PERTE de ce soir sont **à la visée**, pas au plafond. Sur 36 cases de densité
mesurées, **34 sont dans leur couloir** ; les deux qui n'y sont pas sont des
**petits-déjeuners du tir 3 à 94 et 99** pour un plancher de 100 — c'est-à-dire **trop peu
denses**, le défaut inverse de celui du matin.

### 6.2 Une case sans portion est enfin **vue**

Tir 2, `sun/dinner` : plat présent, aucune portion. La porte finale rend
`cell_without_portion: 1` avec `portion_cells: 6` en dénominateur. Dans l'archive du matin,
**deux** cases identiques étaient passées avec `ok=true` et `blocking: 0` sans qu'aucun
compteur ne les voie.

⛔ **Et le plan est quand même parti.** Sous `FINAL_GATE_POLICY_LOT_1`, `cell_without_portion`
compte comme refus **non bloquant**. Sous `FINAL_GATE_POLICY_LOT_4` — **écrite, non branchée**
— il aurait rendu **422 `plan_not_deliverable`**.

### 6.3 La chaîne complète d'un défaut, tracée de bout en bout

Toujours le tir 2 :

```
le modèle n'écrit `ref` que sur 20 lignes sur 43
   → « pita complete » n'a ni identifiant ni alias
      → 1 ingrédient NON MESURABLE
         → `sun/dinner` n'a pas de boîte : 5 portions sur 6
            → la porte rend `cell_without_portion`
               → livraison « deliverable_with_gaps », plan écrit
```

⛔ **Le lot A n'a pas réparé le chemin par le libellé ; il a réparé le chemin par
l'identifiant.** Quand le modèle omet `ref`, le défaut du 2026-09-11 revient à
l'identique. C'est un **défaut de prompt**, pas de moteur, et il n'est pas fermé.

### 6.4 L'audit d'achats par identité trouve de vrais manques

Les 8 faux positifs de pluriel ont disparu. Ce qui sort à la place est mesuré, nommé et
chiffré : `citron` 104,7 g requis et **rien acheté** ; `feta` 80 g achetés pour 115,7 requis.
Et **deux faux positifs neufs** sont à nommer : **`eau`** (tirs 2 et 4) — 219 g et 287 g
« requis », alors que l'eau du robinet n'est pas une ligne de courses. L'audit a besoin d'une
classe « non achetable ».

---

## 7. ⑥ Vérification culinaire — les fiches, et ce qu'elles montrent

**Commande :**

```bash
deno run --allow-read scratchpad/2026-09-11-FIABILITE-RECETTES/fiches-lot-F.ts \
  scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/<tir>.json
```

> ⛔ **« L'agent fournit les fiches et la grille ; il ne prétend ni avoir cuisiné ni avoir
> prouvé la saveur avec un score modèle. »** C'est le plan, mot pour mot, et c'est vrai ici :
> **aucune de ces recettes n'a été cuisinée, aucune n'a été goûtée.** Les tests automatiques
> de ce lot sont terminés ; **la validation gustative reste à faire.**

### 7.1 Les trois recettes représentatives demandées

| type demandé | recette retenue | tir |
|---|---|---|
| **sauce avec accompagnement** | `sun/dinner` — « Lentilles, pita, laitue et **sauce au tahini** » (yaourt + citron + tahini, servie **à côté** de la pita) | 2 |
| **assemblage au tahini / fromage** | `sat/lunch` — « Poulet, tortilla, laitue, tomate et **feta** » (feta 21,9 % de la masse fraîche) | 2 |
| **préparation à liant ou liquide lié** | `prep_lentils` — « Lentilles mijotées à la carotte » (mijoté épais, eau absorbée) | 1 et 2 |

### 7.2 Les proportions, avant et après, ramenées à 100 %

**Sur les tirs SANS réparation modèle (3, 5, 6)** — c'est là que la comparaison mesure
l'ajusteur déterministe et lui seul :

| préparation | avant | après | écart |
|---|---|---|---|
| tir 6 · ragoût (oignon / carotte / tomate) | 13,5 / 18,9 / 27,0 % | 13,4 / 18,8 / 27,2 % | **≤ 0,2 pt** |
| tir 1 · `prep_barley` (orge / persil) | 95,2 / 4,8 % | 95,1 / 4,9 % | **≤ 0,2 pt** |
| tir 1 · `prep_chicken` (poulet / poivrons / ail / oignon) | 28,6 / 28,6 / 28,6 / 14,3 % | identiques | **0** |

⛔ **Et une exception, qui n'est PAS l'ajusteur.** Tir 2, `prep_lentils` : lentilles
**36,7 % → 47,0 %**, oignon / poivron / carotte **18,3 % → 11,8 %** chacun. Le journal du run
dit `proportion_adjust: outcome "nothing_to_do", moves 0, rewritten 0` : **l'ajusteur n'a
rien bougé.** Ce déplacement vient de la **réparation modèle**, c'est-à-dire d'une
recomposition — ce que le plan autorise explicitement (« Tout changement de recette ou de
méthode appartient à la recomposition modèle »).

⚠️ **Limite de mon instrument, nommée** : `fiches-lot-F.ts` compare le payload final à la
**PREMIÈRE** réponse du modèle. Sur les tirs 1, 2 et 4 (qui ont une réparation), la colonne
« AVANT » n'est donc pas le premier jet de la recette finale. Une comparaison propre de
l'ajusteur seul demande les tirs 3, 5 et 6 — et c'est ce que le tableau ci-dessus utilise.

### 7.3 Faisabilité — ce qui se lit sur les fiches servies

**① Les unités dénombrables sont fractionnaires, et c'est le défaut le plus visible.**

Mesuré sur les six tirs : **37 lignes sur 239** portent un `amount` fractionnaire en unité
dénombrable — **37 des 39 lignes dénombrables**. Ce que la personne lit :

```
· 2,13 hauts de cuisse de poulet      · 3,76 œufs entiers
· 2,13 poivrons                       · 5,10 œufs entiers
· 1,06 oignon                         · 2,23 tranches de pain complet
· 2,72 gousses d'ail                  · 1,86 pains pita complets
```

On ne casse pas 3,76 œufs et on n'achète pas 2,13 hauts de cuisse. C'est le défaut **C4**,
nommé par le lot C : `unitsOfPlan` verrouille bien ces lignes pour l'**ajusteur**
(`counted_unit`), mais `scaleIngredients` (`portion_sizing.ts`) ne lit pas ce verrou et les
multiplie quand même. **`renderQuantity` ne fait que rendre le défaut LISIBLE** ; il ne le
crée pas, et il serait pire de rendre « 2 » pour un calcul à 2,13.

**② Cinq lignes sur 239 sont rendues sans unité ni nom** — toutes des citrons écrits en
lettres par le modèle (« un demi-citron ») que le moteur a redimensionnés :

```
· 0,68        · 0,58        · 0,46        · 0,56        · 0,45
```

C'est l'arbitrage **C5** du lot C, assumé : remplacer le seul nombre écrirait « 0,68 g de
citron » pour 0,68 **citron**. L'écran affiche le terme (« citron ») à côté, donc l'aliment
n'est pas perdu — mais la ligne reste bizarre à lire. La réparation est côté **contrat** :
demander au modèle un `amount`/`unit` sur ces lignes-là.

**③ 115 lignes sur 239 perdent la queue descriptive** (« 100 g d'orge » → « 135 g »). ⚠️ **Ce
n'est PAS une perte d'information** : `SessionPreparation` et `DishCard` rendent le `term`
dans une balise voisine — la personne lit « orge — 135 g ». C'est une redondance perdue, pas
un aliment perdu, et le distinguer importe : les confondre ferait publier un défaut à 48 %
qui n'existe pas.

**④ Hydratation, équipement, assemblage** — lus sur les méthodes servies, rien d'anormal
relevé : « Cuire l'orge dans l'eau jusqu'à tendreté », « Cuire les lentilles … jusqu'à obtenir
un mijoté épais », « Mélanger le yaourt, le citron et le tahini, puis servir avec la pita ».
Les temps (35 à 50 min, dont 5 à 20 min de mains) sont cohérents avec les aliments.
⛔ **Cette lecture n'est pas une dégustation.**

---

## 8. Les écarts encore ouverts — nommés, chiffrés, non réparés

| n° | défaut | où | mesure |
|---|---|---|---|
| ① | **Une réparation jette les lignes de courses au pluriel.** `retry_merge.ts` ~331 filtre `meal.shopping_list` sur `normalizePantryTerm(l.term)` ∈ termes d'ingrédients. « citrons » ≠ « citron » ⇒ la ligne **disparaît**, et le message dit pourtant « kept, not guessed ». | `_shared/keel/retry_merge.ts` | **6 lignes sur 26** perdues sur un run du banc (`oignons`, `carottes`, `tomates`, `citrons`, `pommes de terre`, `pitas complètes`) ; `splice.shopping_pruned: 6`. L'audit du lot E les rattrape en 5 `ingredient_not_bought`. **C'est la même racine que les 8 faux positifs du matin, un cran plus grave.** |
| ② | **Le plancher protéique n'est toujours comparé à rien qui bloque.** La porte le **compte** désormais (`protein_floor_short`), mais la livraison reste `deliverable_with_gaps`. | `final_plan_gate.ts` sous `LOT_1` | **4 tirs sur 6** sortent sous le plancher : −42 / −43 % (tir 1), −24 / −18 % (tir 3), −39 / −30 % (tir 5), −32 % (tir 6, jour 1). |
| ③ | **`FINAL_GATE_POLICY_LOT_4` reste non branchée**, donc la branche **422 `plan_not_deliverable` est inatteignable**. | handler, bloc de la garde finale | Elle aurait refusé le tir 2 (`cell_without_portion`). Dénominateur réel de la campagne : **1 tir sur 6**. |
| ④ | **Un apport fixe déclaré par la RPC du foyer n'est jamais lu pour un titulaire.** `keel_household_set_member_fixed_intakes` **accepte** l'écriture sur la bouche d'un compte et écrit `household_members.fixed_intakes` ; `household_fixed_intakes.ts` ne lit cette colonne **que si `!mouth.userId`**, sinon il lit `student_goals.practical_constraints.fixed_intakes`. **Écrivain sans lecteur.** | `_shared/keel/household_fixed_intakes.ts` ~243 vs la RPC | Tir 5 : la ligne est en base (`[{slot:breakfast, amount:200, food_ref:greek_yogurt}]`), le journal `keel.household_meal.fixed_intakes` **ne sort pas**, le prompt ne mentionne pas le yaourt, et le petit-déjeuner garde **613,50 kcal** — la cible d'un tir sans apport fixe. ⚠️ La RPC du **rythme**, elle, refuse `has_account` : **les deux RPC sœurs ne se comportent pas pareil.** |
| ⑤ | **Le « repas léger » ne se déclare pas par la taille du rythme.** Mon tir 5 a posé `size: "small"` sur le déjeuner ; `cells.light = 0` et les cibles n'ont pas bougé. Le moment léger vient des **habitudes** (`household_member_habits`), pas de `eating_rhythm[].size`. | harnais du lot F | Faute de harnais, nommée : **le tir 5 ne mesure donc PAS le repas léger.** Ce cas reste à tirer. |
| ⑥ | **L'eau est comptée comme un achat manquant.** | `final_plan_audit.ts` | 2 tirs sur 6, 219 g et 287 g « requis ». L'audit a besoin d'une classe « non achetable ». |
| ⑦ | **Les unités dénombrables sont multipliées en fractions.** (défaut C4) | `portion_sizing.ts::scaleIngredients` | **37 lignes sur 239**, 5 tirs sur 6. |
| ⑧ | **Aucune surface ne lit les écarts.** `issues[] = final_gate_delivery:*` et le corps 422 existent ; **rien dans `frontend/` ne les affiche.** Ce lot a posé les **mots** du refus, pas l'écran. | demande **C-E3** du lot E | 6 tirs sur 6 sont sortis `deliverable_with_gaps` et **la personne n'en voit rien**. |
| ⑨ | **Les lignes de courses n'ont ni identité ni quantité structurée.** | `meal_generation.ts::mealShoppingPayload` | demande **C-E1**. Conséquence mesurée : **2 à 20 contrôles de suffisance « incomplets » par tir**. |
| ⑩ | **La durée dépasse le plafond de l'hébergé une fois sur deux.** | hors périmètre de ce chantier (§ 5 du plan) | 207 / 206 / 175 s contre 150 s. Charge identique (6 cases). |

---

## 9. Les tests de sortie du lot, un par un

| exigence du plan « Lot F » | verdict | preuve |
|---|---|---|
| ① rejouer les deux réponses archivées, contexte et référentiel figés, fonctions de production | ✅ | § 1 ; sortie identique à `mesure-lot-D` à l'octet |
| ① capturer avant / après **à chaque étape** | ✅ | § 1, tableau à six lignes, avec les colonnes « archive » conservées par les lots B et E |
| ① ne pas recoder les équations | ✅ | `analyse-lot-F.ts` **importe** `mesurerUnPlan` / `rendre` du lot 0 |
| ② adaptateur fournisseur contrôlé au niveau transport, sur une pile de test | ✅ | § 2 ; `installControlledTransport` + `captureServeHandler` |
| ② **aucun interrupteur de contournement exposé aux requêtes de production** | ✅ | rien n'est écrit sous `supabase/functions/**` ; aucun port n'est ouvert ; l'adaptateur vit dans le processus du banc |
| ② aller jusqu'à la sérialisation, l'écriture de fixtures, la relecture API/UI | ✅ | ligne `student_generated_meals` écrite, recopiée en fixture front, relue par `readDishes`/`readPreparations`/`readShopping` |
| ③ ouvrir un plan corrigé, recettes / portions / courses, **recharger** | ✅ | § 3, 8 épreuves vertes sur le HTML rendu |
| ③ une personne **et** un foyer de deux | ✅ | § 2.3 et § 3 |
| ③ quantités structurées / rendues, cru / cuit | ✅ | § 3 |
| ③ **états d'écart** | ⚪ **non fait** | contrat serveur prêt, **aucune surface** — défaut ⑧ |
| ③ un compte secondaire reste refusé | ✅ | `403 not_owner` |
| ④ tests Deno des modules et consommateurs, typecheck du handler, tests UI, build | ✅ | § 4 ; 3 rouges Deno et 2 rouges front, **les rouges du socle** |
| ④ documenter séparément une erreur préexistante | ✅ | § 4, encadré : le 3ᵉ rouge front venait du lot E, il est **fermé** ; `meal_pdf_locale_test` n'échoue plus |
| ⑤ six tirs séquentiels au maximum | ✅ | **6 tirs**, un par lancement |
| ⑤ contextes horodatés | ✅ | chaque sortie porte `lance_le`, `jour_local`, `heure_locale` |
| ⑤ nombre de cases annoncé **à l'avance** | ✅ | imprimé avant l'appel, avec sa dérivation |
| ⑤ ne pas relancer en silence les échecs | ✅ | un seul relancement, **avant tout appel modèle**, sur une faute de harnais, écrit au § 0 et au § 8 ⑤ |
| ⑤ le tableau demandé, pour chaque run | ✅ | § 5, bloc `text` |
| ⑤ durée : témoin équivalent ou durée absolue | ✅ | **aucun pourcentage publié** ; durées absolues et charge |
| ⑤ séparer limite locale et limite de la cible de déploiement | ✅ | 600 000 ms local vs **150 000 ms** hébergé, comparés tir par tir |
| ⑤ conformité premier jet / après ajustement / après réparation, **séparément** | ✅ | § 5, tableau à trois colonnes |
| ⑥ trois recettes représentatives, fiches avant/après à même taille de portion | ✅ | § 7.1 et 7.2 |
| ⑥ fiches réellement proposées | ✅ | § 7.3, avec les nombres |
| ⑥ faisabilité vérifiée d'abord | ✅ | § 7.3 ④ |
| ⑥ **ne pas prétendre avoir cuisiné ni prouvé la saveur** | ✅ | écrit trois fois, dont en tête de ce rapport |

---

## 10. Fichiers créés ou modifiés

### Produit

| fichier | ce qui change |
|---|---|
| `frontend/src/keel/api/mealGeneration.ts` | `readIngredients` : `Number(null)` ne vaut plus zéro. `typeof i.amount === "number"` et `typeof i.grams_raw === "number"`. Une pincée redevient **inconnue**. |
| `frontend/src/keel/copy/planRefusals.ts` | `plan_not_deliverable` entre dans `EDGE_REFUSAL_KEYS`. |
| `frontend/src/keel/i18n/fr.ts` · `en.ts` | `plan.refusal.plan_not_deliverable` — « Ton plan actuel est intact ». Parité vérifiée. |

### Tests et fixtures

| fichier | ce qui change |
|---|---|
| `frontend/src/keel/lib/relectureLotF.int.test.ts` | **créé** — 8 épreuves sur les plans écrits par le banc. |
| `frontend/src/keel/lib/__fixtures__/lot-f-plans.json` | **créé** — trois lignes `student_generated_meals` écrites ce soir, recopiées au caractère. |

### Banc, instruments et preuves (scratchpad)

| fichier | rôle |
|---|---|
| `transport-lot-F.ts` | **créé** — l'adaptateur de transport, la capture de `Deno.serve`, le retaillage. |
| `banc-lot-F.ts` | **créé** — le banc d'intégration sans dépense. |
| `campagne-lot-F.ts` | **créé** — les six tirs réels. |
| `analyse-lot-F.ts` | **créé** — la grille du lot 0 sur un plan neuf. |
| `fiches-lot-F.ts` | **créé** — les fiches avant/après à même taille de portion. |
| `rattraper-reponse-brute.ts` | **créé** — recopie la réponse brute d'un tir (tirs 1 et 2 seulement). |
| `sorties-lot-F/*.json` | **créés** — 5 sorties de banc + 6 sorties de campagne, avec journal, réponse brute et ligne écrite. |
| `RAPPORT-LOT-F-2026-09-11.md` | ce fichier. |

### Documents du dépôt

| fichier | ce qui change |
|---|---|
| `docs/keel/mesure.md` | ce que la campagne du lot F a mesuré, et les quatre règles qu'elle ajoute. |
| `docs/keel/CAMPAGNE-DEUX-SOLO-2026-09-11.md` | **second correctif, daté 2026-09-11 20 h**, ajouté **sous** celui de 16 h, qui n'est pas touché. |
| `docs/SOCLE.md` | le chemin **réellement branché**, en une ligne. |
| `scratchpad/…/NON-BRANCHE.md` | mis à jour : ce qui est branché, ce qui ne l'est pas. |

⛔ **Non touchés, exprès** : `RAPPORT-MESURE-2026-09-11.md`, `mesure-2026-09-11.txt`, les
rapports et sorties des lots A / B / C / E, `fixtures/*`, `scratchpad/2026-09-11-REVUE-CAMPAGNE/*`,
et **tout `supabase/functions/**`** — aucun fichier du moteur n'est modifié par ce lot.

---

## 11. Commandes réservées à l'humain

**Aucune migration, aucun déploiement, aucun secret, aucune écriture de configuration.**
Ce lot n'a besoin d'aucune commande bloquée par le hook.

Deux choses restent à la main de l'humain, et ce ne sont pas des commandes bloquées :

1. **La dégustation.** Trois recettes sont prêtes au § 7.1 ; il faut les cuisiner.
2. **Un tir en début d'après-midi** pour mesurer le cas n° 1 du plan tel qu'il est écrit
   (« fenêtre commençant l'après-midi ») :

   ```bash
   deno run --allow-read --allow-env --allow-net --allow-write=scratchpad \
     scratchpad/2026-09-11-FIABILITE-RECETTES/campagne-lot-F.ts 1
   ```

   ⚠️ Ce tir **dépense**. Il annonce lui-même 9 cases s'il part avant midi.

---

## 12. Ce que ce rapport ne dit pas

- Il ne dit **pas** « aucune perte de saveur » : aucune recette n'a été cuisinée.
- Il ne dit **pas** « tous les ingrédients vérifiés » : sur le tir 2, un ingrédient est resté
  non mesurable et a coûté une portion.
- Il ne dit **pas** « premier jet parfait » : deux tirs sur six sont partis avec des défauts
  de densité que l'ajusteur n'a pas pu fermer dans ses limites culinaires.
- Il ne dit **pas** que la ceinture d'allergie tient : elle n'a pas été **violée** sur le tir
  n° 6, et aucun compteur de ce run ne montre qu'elle a été **armée**.
- Il ne mesure **pas** un taux de réussite : six tirs disent ce qui s'est passé six fois.
- Il ne compare **aucune** durée à un avant : il n'existe pas de témoin à charge égale.
