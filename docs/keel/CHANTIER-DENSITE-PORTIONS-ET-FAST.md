# Chantier — aligner génération, densité et portions, Fast d'abord

|  |  |
|---|---|
| **Ouvert le** | 2026-09-10 (nuit) |
| **Branche** | `ff-001-quotidien-du-coach` |
| **Point de départ** | `080eb19d` |
| **Mode** | exécution autonome ; les arbitrages sont pris ici et listés au § 7 |
| **Autorités du calcul** | [METHODE-GENERATION-DE-PLAN-SOLO.md](METHODE-GENERATION-DE-PLAN-SOLO.md) · [FICHE-RATTRAPAGE.md](FICHE-RATTRAPAGE.md) · [../SOCLE.md](../SOCLE.md) |
| **Règles d'agent** | [../../AGENTS.md](../../AGENTS.md) — aucun deploy, aucun secret, aucun SQL destructif |

> **Ce document est le plan, pas le journal.** Ce qui a été mesuré en le suivant
> s'écrit dans `scratchpad/2026-09-10-CHANTIER-DENSITE/JOURNAL.md`, et ce qui
> devient permanent remonte dans les autorités ci-dessus.

---

## 1. Ce que le chantier fait, en une phrase

Un plan doit servir à chaque bouche la quantité que **le moteur** a calculée, dans
une assiette humaine, sans qu'aucune relance du modèle ne puisse remplacer une
violation par une autre — et il doit le faire assez vite pour tenir dans le worker
edge.

Trois chaînes se rejoignent :

1. **une seule cible** par personne, lue pareil par l'écran, la lane solo et la
   lane foyer ;
2. **un couloir de densité** (minimum, maximum, préférence) dit au modèle **avant**
   la composition, et non plus un seul plancher ;
3. **un budget commun** de deux rattrapages, sous une échéance commune, avec le
   palier de service `fast` sur tous les appels de génération.

---

## 2. L'état mesuré au départ — ne pas le redécouvrir

### 2.1 Le transport et le modèle

| Fait | Où |
|---|---|
| `service_tier` existe **déjà**, mais **seulement par variable d'environnement** et **seulement sur la branche Responses** | `_shared/gemini.ts:21` (`openAiServiceTierFromEnv`), posé `:631-632` |
| La branche **Chat Completions ne le transmet pas** | `_shared/gemini.ts:685-745` |
| Les journaux relisent l'environnement au lieu de la valeur envoyée | `_shared/gemini.ts:1397,1456,1488,1533` |
| Modèle de composition : `gpt-5.6-luna` | `_shared/keel/generation_model.ts:KEEL_GENERATION_MODEL_DEFAULT` |
| Effort : `medium` (solo + relances), `high` (composition foyer) | `PLAN_REASONING_EFFORT`, `PLAN_COMPOSITION_REASONING_EFFORT` |
| Timeouts : 300 s (défaut) / 380 s (composition foyer) ; worker edge coupe à 400 s, Kong à 600 s | `PLAN_HTTP_TIMEOUT_MS`, `PLAN_COMPOSITION_HTTP_TIMEOUT_MS` |
| `GLOBAL_AI_MODEL=gpt-5.4-mini` en local — il ne doit **pas** atteindre les lanes de plan | `supabase/.env` |
| `MAX_RETRIES` par défaut **10** (ou 4 sur trace longue) : le transport peut rejouer un appel de composition sans que le budget le sache | `_shared/gemini.ts:1022-1030` |

### 2.2 La cible calorique — quatre constructions, pas deux

| # | Construction | Où | Qui la lit |
|---|---|---|---|
| **A** | centre = `dayTargetKcalOf(entretien, écart)`, demi-largeur = `entretien × (band.high − band.low)/2` | `meal_envelope.ts:659` (`bandAroundDayTarget`), appelé `:1393` dans `envelopeCore` | solo **et** foyer |
| **B** | `entretien × bornes de `ENERGY_BANDS[goal]`` | `meal_envelope.ts:541` (`goalEnergyBandOf`), appelé `meal_energy_shared.ts:271` | **l'écran** |
| **C** | `maintenanceRange` (poids × kcal/kg) puis `directedRange` | `energy_target.ts:392` / `:503`, appelés `meal_energy_shared.ts:153,243` | l'écran, en repli |
| **D** | enfant : `entretien × ENERGY_BANDS.maintenance` | `meal_envelope.ts:1875` | foyer |

**L'écart n'est pas cosmétique** : sur `fat_loss`, B applique −20 % de l'entretien
quel que soit le rythme réglé, là où A applique `executedPaceFor` plafonné à
500 kcal/j. Sur 3 000 kcal d'entretien : B centre à 2 400, A à 2 500.

### 2.3 L'appétit

- Il entre dans l'**entretien adulte** : `meal_envelope.ts:1099`
  (`bmr × facteur d'activité × appetiteFactorOf(...)`), table `APPETITE_FACTORS`
  `:431` = `{small:0,90 · average:1,00 · large:1,10}`.
- Il n'entre **plus** dans les grammes : `portion_sizing.ts:52`.
- Le repli `weight_shortcut` (`meal_envelope.ts:594`) **perd l'appétit en silence** :
  `maintenanceMidKcal` ne le prend pas en argument, et `basis` ne le dit pas.
- Chemin pédiatrique séparé : `childAppetiteFactor` `:1813`, appliqué `:1752`.

### 2.4 La densité

- `REPAIR_DENSITY_HEADROOM = 1.10` — `portion_sizing.ts:1370`, cinq usages :
  `:1423`, `:1434`, `:1626`, `:1651` (réparations) et **`:2224`** (`requiredDensityFor`,
  qui n'est **pas** une réparation : c'est la densité annoncée d'entrée).
- Plafond de demande `MAX_ASKABLE_DENSITY_PER_100G = 250` — `portion_sizing.ts:2076`,
  mord `:2222`, compté `:2253`.
- Bornes de masse `PLATE_MASS_BOUNDS_G` — `portion_sizing.ts:337` (adulte repas
  250/700 g, collation 80/300 ; ado 250/650 ; enfant 150/450 ; petit 100/300).
- `plateBoundsFor` `:489` porte **deux** plafonds : `max` (dérivé de la part kcal,
  borne le service) et `physicalMax` (la table seule, contre laquelle
  `requiredDensityFor` calcule — sinon la question serait circulaire).
- Planchers du prompt : `NORMAL_DISH_MIN_KCAL_PER_100G = 100`,
  `LIGHT_DISH_MIN_KCAL_PER_100G = 60` — `household_meal_generation.ts:767,778`.
- `density_check` : demandé au modèle (`meal_generation.ts:3252`), lu et borné
  (`:7895`), **jamais décisionnel** — pure télémétrie
  (`generate-household-meal-v1/index.ts:11138`).
- ⛔ **Mesuré** : sur 40 densités demandées puis mesurées, l'écart consigne↔recette
  va de **−23 % à +63 %**, médiane +3,1 %. Le centre est bon, la **dispersion** coûte.
  Une marge ne répare pas une dispersion.

### 2.5 Les relances, et leurs budgets aujourd'hui

| Relance | Budget | Où |
|---|---|---|
| exclusion (allergie / interdit) | 1 | `generate-household-meal-v1/index.ts:7237` |
| régime alimentaire | 1 | `:7574` |
| bouches non nourries | 1 | `:7750` |
| ancre protéique (solo) | 1 | `generate-meal-v1/index.ts:2934` |
| densité, par plat | `REPAIR_CALLS_PER_DISH = 2` | `portion_sizing.ts:1327` |
| densité, par plan | `REPAIR_MAX_DISHES_PER_PLAN = 4` | `portion_sizing.ts` |
| plat dédié / complément | `DEDICATED_REPAIR_MAX_PER_PLAN = 4` | `portion_sizing.ts` |

**Aucun compteur commun. Aucune échéance commune.** Et le transport peut rejouer
par-dessus (`MAX_RETRIES`).

### 2.6 Ce qui laisse passer une substitution d'allergène

`generate-household-meal-v1/index.ts:10177-10179` :

```ts
const bitesAfterRepair = bitesOf(meal as never).length;
const bitAdded = bitesAfterRepair > bitesBeforeRepair;
```

C'est une **comparaison de cardinaux**. Et `dishBitesExclusion` rend **au plus une
morsure par plat** (`food_exclusion_belt.ts:328-343`), donc `bitesOf(...).length`
compte des **plats mordus**. Trois cas passent :

1. substitution dans le même plat (arachide retirée, gluten ajouté) : 1 → 1 ;
2. substitution entre plats : 1 → 1 ;
3. aggravation d'un plat déjà mordu : toujours 1.

Et deux choses ne sont **pas** recalculées après la réparation de densité :
`meal.regime_belt`, et les tableaux par plat `dish.regimeBites` /
`dish.exclusionBites` — `spliceReworkableUnits` (`retry_merge.ts:604`) clone la
base et n'écrase que `ingredients` / `title` / `method`.

### 2.7 Le solo ne dimensionne pas

`generate-meal-v1/index.ts:3455` calcule `soloShare` par `slotPlanTargets` et le
journalise avec **`applied_to_grams: 0`** (`:3487`). Le commentaire `:3409` le dit :
« Le branchement qui manque est `scaleFactorsFor`, et il appartient à un lot à part. »
Le solo dimensionne encore par **bande journalière** (`portion_scaling.ts:129`,
`MIN_SCALE = 0,75`), ce qui ne peut retirer qu'un quart — mesuré insuffisant sur
trois plans de perte de poids sur trois (`scratchpad/2026-09-09-CAMPAGNE-PLANS/RAPPORT.md`).

---

## 3. Lot 0 — Fast, routage et budget d'exécution

> **Il passe en premier, avant tout banc de génération.**

### 3.1 Le palier de service, par appel

- `GenerateWithGeminiMeta` reçoit `serviceTier?: OpenAIServiceTier`.
- Un résolveur unique : **paramètre explicite valide** → **`KEEL_OPENAI_SERVICE_TIER`**
  → **rien envoyé**. Une valeur hors liste se **compte** (`rejected`), elle ne
  devient jamais « pas de palier » en silence.
- Il est transmis dans **les deux** branches : Responses (`payload.service_tier`)
  et Chat Completions (idem).
- Les journaux citent la valeur **résolue**, pas l'environnement relu.
- `generation_model.ts` porte `PLAN_SERVICE_TIER = "fast"`, et **seules** les lanes
  de génération le passent. Le chat, la mémoire, les flows gardent leur configuration.
- ⛔ « high fast » n'est pas un identifiant de modèle. Le modèle reste `gpt-5.6-luna`.

| Appel | Modèle | Effort | Palier |
|---|---|---|---|
| composition solo | `keelGenerationModel()` | `PLAN_REASONING_EFFORT` (`medium`) | `fast` |
| composition foyer | `keelGenerationModel()` | `PLAN_COMPOSITION_REASONING_EFFORT` (`high`) | `fast` |
| **rattrapages, les deux lanes** | `keelGenerationModel()` | **`PLAN_REPAIR_REASONING_EFFORT` (`high`)** | `fast` |
| autres appels OpenAI de la génération | inchangés | inchangés | `fast` |

### 3.2 Le budget commun

- **Un compteur par requête**, `PLAN_MODEL_REPAIR_BUDGET = 2`, consommé par
  **toute** tentative de recomposition adressée au modèle après la génération
  initiale : exclusions, régime, bouches non nourries, densité, protéines,
  plat dédié / complément.
- **Ordre de priorité quand le budget est court** : sécurité d'abord (exclusion,
  régime), puis densité, puis protéines. Les défauts réparables d'un même passage
  sont **regroupés dans une seule instruction**.
- **Les contrôles déterministes continuent de tourner** même à budget nul :
  `applyHouseRuleLock` rend toujours 422 sur une règle de maison violée, et
  `clampToBounds` rabote toujours en écrivant `unmet_kcal`.
- **Les tentatives cachées du transport sont imputées** : les appels de composition
  passent `maxRetries: 1` et le compteur lit ce que le transport a réellement tenté.
- **Une échéance commune** portée par la requête. Chaque timeout individuel vaut
  `min(son plafond, temps restant − RESERVE)` avec
  **`PLAN_TAIL_RESERVE_MS = 30_000`** pour la mesure finale, les ceintures et
  l'écriture. Aucun rattrapage ne part si le reste ne suffit pas :
  `repair_budget_exhausted` ou `time_budget_exhausted` est écrit, et la **dernière
  version utilisable** est servie.
- ⛔ **Aucune version utilisable ⇒ erreur.** Une version portant un allergène
  interdit n'est **jamais** un repli.

---

## 4. Lots fonctionnels

### Lot A — intégrité, mesure et protections

1. **`uses` orphelines** — après toute suppression ou remplacement d'une préparation,
   `dish.uses`, `cooking_sessions.preparationIds` et la liste de courses sont
   balayés ensemble (le nettoyage existe `index.ts:12718` ; il doit courir **aussi**
   après la réparation de densité).
2. **Rejeu des exclusions par identité.** Une violation est
   `(personne, terme exclu, recette ou préparation)`. On compare des **ensembles**,
   pas des cardinaux. **Toute violation nouvelle fait refuser la réparation**, même
   si une autre a disparu. Rejeu sur chaque proposition réparée **après fusion**,
   puis sur le **payload final**.
3. **`regime_belt` et les tableaux par plat sont recalculés** après
   `spliceReworkableUnits`, sinon ils décrivent le plan d'avant.
4. **Mesure par les fonctions de production.** `resolveIngredients`,
   `foldPreparationsIntoDishes`, `standardPortionOf`, `nutrientsOf`. Aucun calcul
   d'énergie par facteur quand la mesure est insuffisante.
5. **Un trou de mesure déclenche une réparation** dans le budget commun, puis
   `unmeasurable` s'il persiste. `UNMEASURABLE_PORTION_FACTOR = 1` (servir la
   recette brute) reste le dernier recours, compté.
6. **Un seul état final.** Plats, préparations, boîtes, courses et métadonnées se
   construisent depuis le même objet, après toutes les modifications. Le
   « recollage » `index.ts:13252` reste, et se **mesure**.

### Lot B — cible quotidienne et budgets par créneau

Créer un **résultat interne partagé** — appelons-le l'ancre du jour — qui porte :
`method` (l'équation retenue), `maintenanceKcal`, `executedDelta` (avec son
`clampedBy`), `dayTargetKcal`, `band` et les portes appliquées.

- Il réutilise `adultMaintenanceKcal`, `executedPaceFor`, `dayTargetKcalOf`,
  `bandAroundDayTarget` et leurs gardes.
- **Le facteur d'appétit sort de l'entretien adulte** (`meal_envelope.ts:1099`) et
  de ses appels indirects ; le chemin pédiatrique (`:1752`) est **conservé**.
- Les réglages explicites de portion (`withPortionCran`, `mouth_anchor.ts:1168`)
  s'appliquent **une seule fois**, dans l'assemblage commun.
- **L'écran, le solo et le foyer consomment ce même résultat.** La construction B
  (`goalEnergyBandOf` dans `meal_energy_shared.ts:271`) disparaît comme source de
  bande. Les replis autorisés, leur `basis` et la distinction calcul / affichage /
  journal restent.

Puis, par créneau, `slotPlanTargets` inchangé dans sa formule :

```
Bᵢ = cible du jour × poids du créneau / somme des poids des créneaux déclarés
Eᵢ = max(0, Bᵢ − apports fixes prévus)
```

- **Le solo branche ses vrais créneaux légers et ses apports fixes** (il passe
  aujourd'hui `lightSlots: []` et `slotFixedKcal: null`, `generate-meal-v1:3459`).
- Le **dénominateur reste la journée entière** en génération partielle.
- Un créneau extérieur, déjà pris ou verrouillé **ne devient pas du budget** à
  redistribuer sur les repas maison.
- Trois cas distincts, jamais confondus : cible absente · créneau couvert
  (`fixedCovered = 0`) · apport fixe excédentaire (`fixedCovered > 0`).
- Le chantier extras du 2026-09-10 est **vérifié, pas réimplémenté** : `MEAL_EXTRAS`
  et `COMPOSED_DISH_MIN_MEAL_SHARE` sont morts et le restent.

### Lot C — bornes et couloir de densité

Les tables d'âge restent des **conventions produit**. Pour un adulte, un créneau
dont l'énergie à composer `E > 0` :

```
ρ    = 1,0 kcal/g normalement ; 0,6 pour un créneau léger
bmin = min(E / 1,35 ; minimum de la table)
bmax = min(E / ρ    ; maximum de la table)

A       = 0,90 petit appétit · 1,00 moyen ou non renseigné · 1,10 grand
Gmax    = min(A × bmax ; maximum de la table)
Gmin    = min(A × bmin ; Gmax)
Gpréf   = clamp(A × (bmin + bmax) / 2 ; Gmin ; Gmax)

Dmin  = 100 × E / Gmax
Dmax  = 100 × E / Gmin
Dpréf = 100 × E / Gpréf
```

- **Pas de facteur de masse sur un mineur.**
- Valeurs **non arrondies** jusqu'au dimensionnement final.
- Intersection avec le plafond de demande de 250 kcal/100 g. **Intersection vide ⇒
  incompatibilité nommée**, jamais un minimum tronqué en silence.
- Le plafond individuel tient : un repas léger à 588 kcal avec un maximum de 700 g
  demande **au moins 84 kcal/100 g**, et 60 ne suffit pas.
- `REPAIR_DENSITY_HEADROOM` : sur un couloir, on **vise la préférence projetée dans
  l'intervalle** ; toute marge reste **intérieure** au couloir. La constante ne
  survit que sur les chemins legacy qui n'ont pas de couloir.
- Les verdicts de densité contradictoires sur un plat couvert sont **remplacés** par
  le couloir. Aucun plancher générique ne le contredit.

**Redistribution.** Projeter les budgets initiaux, selon les poids existants, sur les
capacités des créneaux modifiables, avec saturation progressive. La **somme est
conservée** ; un créneau léger **ne monte jamais** au-dessus de son budget initial.
Bornes et couloirs sont recalculés. Aucune allocation valable ⇒ on garde les budgets
initiaux et le conflit part à la réparation.

**Plat partagé.** Couloir = **intersection** des couloirs de ses mangeurs et de ses
occurrences. Vide ⇒ adaptation de composition ou complément ciblé
(`splitPlateWithComplement`). ⛔ **Jamais une moyenne des besoins.**

### Lot D — prompt, protéines et dimensionnement

- Les types de densité portent `min`, `max`, `preferred` et l'`incompatibility`,
  par (jour, créneau) ou par groupe de recette.
- Le couloir est transmis **dès la composition initiale** et à chaque rattrapage.
- Dans `standardRecipeBlock` : on remplace **seulement** les consignes de seuil
  devenues contradictoires. ⛔ **CIQUAL, la masse cuite, les préparations et la
  méthode de calcul restent mot pour mot** — elles ont été écrites contre une
  dispersion mesurée.
- `density_check` vérifie **les deux côtés** de l'intervalle. Il reste une
  **déclaration du modèle**, jamais la mesure qui fait foi.
- La densité porte sur **cuit et servi**. Énergie et rendements dans des états
  cohérents ; l'eau absorbée n'est jamais comptée deux fois.
- ⛔ **Aucun poids corporel, aucune cible calorique ou protéique personnelle** dans
  ces consignes. La garde du prompt (`standard_recipe_prompt_test.ts:412`) refuse
  tout `kcal` non suivi de `per 100 g` — elle reste armée.

Après mesure indépendante :

```
facteur        = calories à composer / kcal de la recette standard
grammes servis = grammes cuits de la recette standard × facteur
```

- Ce calcul **atteint les quantités enregistrées, y compris en solo** : le facteur
  énergétique global du solo est remplacé sur le nouveau chemin.
- On réutilise les applicateurs du foyer (`applySizing`, `sizeDishForEaters`,
  `resolveBoxFactors`), jamais une seconde implémentation.
- Planchers protéiques existants (`PROTEIN_FLOOR_G_PER_KG`), mesurés sur les parts
  théoriques, **préparations pliées et apports fixes compris**. Une génération
  partielle ne reçoit pas le besoin protéique de la journée entière.
- Correction **déterministe** quand elle reste compatible avec calories, masse et
  identité de recette ; sinon recomposition qualitative, dans le budget commun.
- Toute modification ultérieure (ancien facteur, plafond d'ingrédient,
  réconciliation) **entraîne une nouvelle mesure**.
- Après les rattrapages : bornes finales sur les portions calculables, écarts réels
  conservés, arrondi vers une quantité **représentable dans les bornes**.

---

## 5. Validation, dans cet ordre

### Étape 1 — configuration et déterministe (avant tout banc)

- Payloads Responses **et** Chat Completions : modèle, effort, `service_tier`.
- Tous les appels de génération, **rattrapages indirects compris**.
- Un appel **hors** génération garde sa configuration.
- Compteur global, temps restant, annulation, livraison de la dernière version
  utilisable.
- **Une réparation qui remplace une violation par une autre, à nombre constant**,
  est refusée ; idem pour une violation introduite par une préparation ou un
  complément.
- Propriétés : conservation des budgets ; identité écran / solo / foyer ;
  compatibilité densité ↔ grammes.
- Couverture : appétits, repas légers, portions d'enfant, journée partielle,
  apports fixes couvrants, couloirs vides et étroits, plats partagés, ingrédients
  inconnus, rendements.
- Jusqu'au **payload d'écriture**, modèle et stockage simulés.
- `bash scripts/agent-gate.sh` (deno keel + vitest + typecheck + eslint).

### Étape 2 — petit banc de latence : **quatre requêtes séquentielles**

1. solo simple · 2. solo plusieurs jours · 3. foyer simple · 4. foyer partagé
représentatif.

Configurations Fast réelles, vrais prompts avec couloir. Le chemin des deux
réparations se vérifie **en simulé** ; on ne provoque pas une réponse dangereuse
dans un banc réel.

Par requête, on mesure : modèle / effort / palier **réellement obtenus** ; durée de
chaque appel ; nombre de tentatives ; parsing ; résolution ; contrôles ; écriture ;
durée totale ; taille de réponse ; jetons ; et en cas de **546**, le motif exact
(CPU, mémoire, durée, indéterminé).

⛔ **Arrêt de l'élargissement au premier 546 ou au premier dépassement d'échéance.**
On corrige la cause nommée, on rejoue le cas. On **n'augmente pas** les limites du
runtime pour verdir le banc. Quatre points ne font pas un p95 : on rapporte les
durées individuelles et le maximum.

### Étape 3 — rejeu et campagne élargie

- Rejeu des archives avec les fonctions de production et un **référentiel figé et
  identifié**. Versions séparées, cas non mesurables séparés.
- Élargissement progressif jusqu'à **12 scénarios × 2 générations, petit banc
  inclus** : au plus 24 compositions initiales et 48 rattrapages.
- **Une requête de plan à la fois.**
- Profil d'exécution hors limites ⇒ on continue hors ligne et on déclare la
  validation edge **bloquée**. Fast ne « résout » rien par décret.
- Aucune écriture chez un utilisateur réel. Accès fournisseur absent ⇒ banc **prêt à
  lancer** et validation explicitement **non effectuée**.

### Acceptation

| Critère | Seuil |
|---|---|
| concordance écran / solo / foyer, entrées identiques | ≤ 1 kcal |
| grammes calculables dans les bornes après arrondi | 100 % |
| énergie par créneau | ± 10 % |
| énergie sur la journée couverte | ± 5 %, bande commune et protections respectées |
| protéines | plancher applicable atteint pour le statut `conformant` |
| écarts, abstentions, échecs de mesure correctement classés | 100 % |
| exclusion nouvelle acceptée | **0** |
| cas dimensionnables conformes après rattrapages | **objectif ≥ 90 %** — un taux inférieur se rapporte, il ne se masque pas |

---

## 6. Traçabilité et livraison

Quatre statuts distincts, **indépendants de la livraison** :
`conformant` · `residual_gap` · `unmeasurable` · `not_applicable`.

⛔ **Livré ne veut pas dire conforme.**

On trace : bornes calculées / dépassées / imposées ; densités demandées / déclarées /
mesurées ; écarts finaux ; modèles ; paliers ; réparations ; durées. Les portes de
journalisation sont respectées — un rapport individuel complet se fait sur **fixture
synthétique**.

Les métadonnées JSON et les contrats d'API existants sont conservés autant que
possible. On n'ajoute que l'information interne nécessaire. **Aucun schéma SQL neuf
n'est requis par défaut.**

Puis : l'UI d'appétit et de repas léger, `docs/SOCLE.md` (la chaîne courte
réellement implémentée), et les commentaires ou tests qui épinglent un comportement
remplacé.

---

## 7. Registre des arbitrages

> Rempli au fil de l'exécution. Chaque ligne dit **ce qui a été tranché**, **pourquoi**,
> et **ce que ça coûte**.

### Lot 0 — Fast, routage et budget

**A1 · L'effort des rattrapages passe à `high`.**
Le brief le demande ; le commentaire de `generation_model.ts` le déconseillait, mesure à
l'appui (2026-09-08 : une relance relit un plan déjà tranché, `high` y triplait le coût).
Ce qui a changé : les rattrapages **n'ont plus de suivant**. Le budget commun leur retire le
droit de rater, et le surcoût unitaire se paie sur **deux** appels au lieu de dix.
*Coût :* 2 à 3× la latence d'un rattrapage. À remesurer — si le banc montre qu'ils
atterrissent aussi bien à `medium`, la ligne redescend.

**A2 · Le repli de modèle n'est pas coupé, il est redirigé vers `gpt-5.6-sol`.**
`pickFallbackChainForAttempt` (`_shared/gemini.ts:869`) construisait, pour `gpt-5.6-luna`,
la chaîne `["gpt-5.6-luna", "gpt-5.4-mini", "gpt-5.4-nano"]` — alors que l'en-tête de
`generation_model.ts` affirmait qu'il n'y avait **pas** de repli. Le repli n° 2 est très
exactement le modèle que le banc du 2026-08-11 mesure comme le seul des cinq à servir des
aliments interdits, et il partait sans que rien ne le dise.
Couper le repli (`disableFallbackChain`) ferait d'un 429 un échec dur pour toute la requête.
On occupe donc les deux emplacements avec le repli propre mesuré : la chaîne devient
`["gpt-5.6-luna", "gpt-5.6-sol"]`.
*Coût :* `sol` est plus lent que `luna` ; un repli se paiera en latence, pas en assiettes.

**A3 · `maxRetries: 1` sur tous les appels de plan.**
Sans lui, le défaut est **10** (`_shared/gemini.ts:1021`) — la branche à 4 exige un
`requestId` contenant `:tools:`, ce que les lanes ne font pas. Multiplié par la chaîne, la
borne haute d'un seul appel logique était de **trente** appels HTTP à leur plein timeout.
Avec A2, elle tombe à **deux**.
*Coût :* un 429 transitoire consomme le repli au lieu d'être réessayé sur le même modèle.

**A4 · Le budget commun est de deux, mais il est RÉSERVÉ PAR PRIORITÉ.**
C'est l'arbitrage le plus important du lot. Le pipeline du foyer appelle, dans cet ordre :
`protéine → exclusion → échange → séparation → non-nourris → densité → plat dédié`. Un
compteur partagé **naïf** aurait donc donné les deux slots aux deux premiers venus, et la
réparation de **densité** — celle qui a fait passer le foyer `cinq` de 6 assiettes dans les
bornes à 12 sur 15 — ne serait **jamais** repartie. On aurait « réparé » le budget en
supprimant le rattrapage qui marche.
La table `PLAN_REPAIR_RESERVED_AFTER` dit, pour chaque rattrapage, combien de slots réservés
lui succèdent ; il n'est accordé que s'il en reste assez après lui. Deux classes sont
réservées : **sécurité** (`exclusion_retry`) et **densité** (`density_repair`,
`dedicated_repair`, et côté solo `composition_retry`).
*Pourquoi deux et pas trois :* trois classes réservées ne tiennent pas dans deux slots —
réserver aussi la livraison ferait refuser la **sécurité** (`0 + 2 < 2` est faux), soit
l'inverse exact du but. La livraison (`unfed_retry`, `empty_slots_retry`) passe donc en
débordement, sur le slot que la sécurité n'a pas pris.

**A5 · Conséquence assumée : trois rattrapages ne partent plus jamais à budget 2.**
`protein_anchor_retry`, `swap_retry`, `preference_split_retry`. Le plancher protéique reste
mesuré, dit dans le constat et corrigé déterministement quand c'est possible ; ce qui
disparaît est l'appel modèle qui le redemandait.
*Coût :* si le banc montre que la protéine décroche sans lui, il faudra soit remonter le
budget, soit fondre sa demande dans l'instruction de densité (le brief le prévoit :
« regrouper les défauts réparables dans chaque instruction »).

**A6 · L'échéance est 380 s, la queue réservée 30 s.**
Deux commentaires du dépôt se contredisent sur Kong (600 s patché contre « 150 s en
hébergé »), et le patch local est un script perdu à chaque recréation du conteneur. Le seul
plafond vrai partout est celui du worker edge : **400 s**. Les trente dernières secondes
sont réservées à ce qui vient **après** le dernier appel modèle — mesure finale, ceintures,
verrou de maison, écriture. Un plan réparé et non écrit ne vaut rien.
Un rattrapage ne part pas s'il reste moins de `PLAN_REPAIR_MIN_MS = 40 s` : la nuit du
2026-08-19 a compté **137 abandons** — des réponses entières, facturées, jamais lues.

**A7 · Le palier est demandé par appel, et un paramètre invalide ne retombe PAS sur l'environnement.**
`KEEL_OPENAI_SERVICE_TIER` est global à l'isolat : le poser mettrait le chat, la mémoire et
les flows sur le même palier pour un besoin qui n'existe que sur deux fonctions. L'ordre est
donc **appel → environnement → rien**. Une valeur d'appel hors liste se **compte**
(`rejected`) et ne retombe pas sur l'environnement : sinon la demande paraîtrait honorée
alors qu'une variable posée pour une autre raison l'aurait absorbée.
Le champ part désormais dans **les deux** branches d'API ; il n'était posé que sur
`/v1/responses`, donc basculer `OPENAI_USE_RESPONSES_API=0` faisait perdre le palier sans
rien dire — et un banc « Fast » y aurait mesuré une latence ordinaire.


### Lot B — cible quotidienne et budgets

**A8 · L'appétit sort de l'entretien adulte et va sur les bornes de masse. C'est un renversement.**
La veille encore, `portion_sizing.ts` écrivait le contraire (« `APPETITE_FACTORS` ne transite
plus par ici ») et `one_target_per_person_test.ts` en faisait un contrat (« l'appétit bouge la
cible ET le plafond de grammes »). La raison invoquée était juste — deux couches qui
dimensionnent font un double comptage — mais elle avait été appliquée à la mauvaise couche.

> ⛔ **Avoir bon appétit ne fait pas dépenser 10 % de plus.**

Posé sur l'entretien, l'appétit ajoutait des **calories** : il annulait une part du déficit de
quelqu'un qui perd du poids parce qu'il aime manger, sans que rien ne le nomme. Il décrit un
**volume d'assiette**, pas une dépense. Il vit donc sur `Gmin`/`Gmax`/`Gpréf`
(`plateBoundsFor`), à énergie **constante** : même cible, servie plus dense à petit appétit,
plus volumineuse à grand appétit.
*Coût :* deux tests ont été **renversés**, pas ajustés — leur motif est réécrit sur place.
Le chemin pédiatrique garde le sien (`childAppetiteFactor`, `Math.max(1, …)`) : un enfant qui
mange peu ne doit pas voir sa cible baisser.

**A9 · L'écran consomme le résultat du moteur, et deux de ses trois portes tombent.**
`dayEnergyFor` (`meal_envelope.ts`) est la construction **A**, extraite d'`envelopeCore` et
appelée par les deux. La construction **B** (`goalEnergyBandOf`) cesse d'être une source de
bande.
Les portes ② (condition déclarée) et ③ (plancher d'énergie) deviennent **sans objet**, et
c'est le changement de source qui les retire, pas un relâchement : ② existait parce que
`goalEnergyBandOf` ignorait l'écart — `dayEnergyFor` le prend en **entrée**, et
`executedForReading` le met à zéro sous condition ; ③ vit désormais **dans** `dayEnergyFor`.
La porte ① (pesée absente ou absurde) reste : c'est la seule qui portait sur la donnée.
*Coût :* plus de monde reçoit l'équation du corps à l'écran. C'est l'effet voulu, et c'est un
changement d'affichage réel.

**A10 · Aligner le dénominateur du rythme sur celui de la cible — ÉCRIT, PUIS RETIRÉ.**
`estimatedMaintenanceFor` (`weight_pace.ts`) appelle `estimatedMaintenanceKcal` — l'équation
seule, qui rend `null` sans taille ni bande d'âge — alors que la cible passe par
`adultMaintenanceKcal`, qui a un repli au poids.
**Conséquence réelle, et elle n'est pas refermée** : sur une fiche sans taille, la personne
reçoit une cible (par le raccourci) et un écart `null` ⇒ `gap: 0`. Son objectif est annulé
**sans motif** ; elle lit « perdre 0,5 kg par semaine » et mange son entretien.
L'alignement a été implémenté, puis **reverti le même soir** : il contredit une décision datée
que le pavé de la fonction énonce — « `null`, jamais un repli, quand le corps ne suffit pas » —
et que **quatre tests** tiennent (`un corps sans poids n'a PAS de plafond de secours`,
`pas de corps, pas d'entretien — jamais un repli`, `un MINEUR reçoit l'équation pédiatrique`,
`un corps qu'on ne sait pas estimer ne rend AUCUN rythme exécuté`).
⛔ **Renverser une décision datée sur un défaut voisin demande son propriétaire.** La sortie
propre est de **nommer** le cas (un motif d'ancre distinct de `no_pace`), pas de deviner un
écart. Le commentaire de la fonction porte désormais le constat, pour qu'il ne se
redécouvre pas.

**A12 · La lane solo lit enfin ses vrais créneaux légers et ses vrais apports fixes.**
`lightSlots: []` et `slotFixedKcal: null` étaient écrits **en dur**. Un dîner marqué « léger » à
l'écran pesait son poids plein, un shaker déclaré n'était retranché de rien — alors que les deux
fonctionnaient sur la lane du foyer. `loadOwnMouthBody` charge maintenant les moments légers par
la **même RPC et le même parseur** que le foyer (`keel_household_habits_for`,
`parseMemberLight`).
*Limite nommée :* l'apport fixe du solo est calculé sur le **premier jour** de la fenêtre. Un
apport qui ne tombe pas tous les jours (`intakeHappensOn`) est donc approximé sur ce chemin ;
la répartition par jour appartient au chemin `portion_v1`.

### Lot C/D — couloir de densité

**A11 · Le couloir remplace `REPAIR_DENSITY_HEADROOM`, et la marge devient intérieure.**
Mesuré sur 40 densités demandées puis pesées : l'écart consigne↔recette va de **−23 % à +63 %**,
médiane **+3,1 %**. Le centre était bon ; c'est la **dispersion** qui coûtait — et on ne corrige
pas une dispersion en poussant la cible de 10 %.
La consigne dit maintenant `Dmin`, `Dmax` et une visée `Dpréf` **à l'intérieur**. La constante
survit sur les chemins legacy qui n'ont pas de couloir.

**A13 · La ligne du prompt dit une bande, et l'arrondi est dirigé.**
` — dishes served here: 182 to 240 kcal per 100 g at lunch (aim 205), …`
Le plancher monte (`ceil`), le plafond descend (`floor`) : l'inverse élargirait la consigne d'un
kcal de chaque côté à chaque tour, et elle finirait par ne plus rien exiger.
⛔ **La forme reste la garde.** « dishes served here » décrit une casserole ; « <prénom> needs »
décrirait quelqu'un. Les bornes s'écrivent « A to B kcal per 100 g », jamais « A kcal to B kcal » —
sans quoi le test qui refuse tout `kcal` non suivi de `per 100 g` mordrait à juste titre.

**A15 · La visée n'est PAS le milieu du couloir — le brief donne `Dpréférée = 100 × E / Gpréféré`, et ce nombre est intenable.**
C'est le seul endroit où ce chantier s'écarte de la formule écrite, et la mesure est la raison.
Sur un déjeuner de 1 120 kcal, `Gpréf` vaut 475 g, donc la visée **236 kcal/100 g**. Or les plats
réels mesurés par ce dépôt vivent entre **113 et 156** ; un gratin fait 180, des lasagnes 150. On
aurait redemandé exactement ce que `MAX_ASKABLE_DENSITY_PER_100G` existe pour empêcher — et ce
qui a déjà été mesuré : **389 demandés au dîner, 126,7 rendus**, la consigne ignorée sur toute la
ligne.
Et le milieu se trompe de **direction** : quand la masse plafonne, on veut la **grande** assiette
— moins dense, plus facile à composer — et c'est `Dmin` qui la décrit.
Ce qui reste utile d'une marge est d'éloigner de la borne : `Dpréf = Dmin × 1,10`, **projeté dans
le couloir**. Elle éloigne toujours de la borne d'où l'on vient : `min × 1,10` en densifiant,
`max ÷ 1,10` en allégeant — prendre la même des deux côtés demanderait à un plat déjà trop dense
de l'être encore plus.
*Contrôle :* sur le cas historique (1 200 kcal, plafond 700 g) la visée retombe sur **189**, la
valeur exacte que les tests épinglaient avant le chantier ; côté « alléger », sur **72**. La
formule change, les nombres tenus ne bougent pas.
*Ce que ça coûte :* `bounds.preferred` (une **masse**) garde le milieu du brief, et diverge donc
de `preferredPer100G` (une **densité**). Les deux répondent à deux questions différentes, et le
code le dit à l'endroit où ils se séparent.

**A14 · Un plat partagé prend l'INTERSECTION des couloirs de ses mangeurs, jamais leur moyenne.**
Plancher = le plus haut des planchers, plafond = le plus bas des plafonds. Intersection vide ⇒
on garde le plancher et on remonte le plafond sur lui : le plancher est ce qui empêche quelqu'un
d'avoir une assiette de 1 100 g. Le conflit se lit alors à `min === max`, et le complément
(`splitPlateWithComplement`) est la sortie prévue.


---

## 7 bis. L'état au matin du 2026-09-10 — ce qui est fait, ce qui est mesuré

### Livré et vert

| Lot | Ce qui a bougé |
|---|---|
| **0 · Fast** | `serviceTier` par appel dans `GenerateWithGeminiMeta` ; résolveur `appel → env → rien` ; le champ part dans **les deux** branches d'API ; les quatre sites de journal citent la valeur résolue **et son origine**. |
| **0 · routage** | `planCallMeta` (`plan_budget.ts`) construit la méta des **treize** appels de plan : modèle, effort selon la nature, palier `fast`, `maxRetries: 1`, repli borné à `gpt-5.6-sol`. Un test de câblage compte les appels et les constructeurs. |
| **0 · budget** | `createPlanBudget` : échéance 380 s, réserve de queue 30 s, deux rattrapages, réserve de priorité par table, motifs fermés. Les **onze** gardes de relance passent par `planRepairGranted`. Le résumé part sur la ligne écrite (`generated_from.plan_budget`). |
| **A · exclusions** | Comparaison **par identité** `(jour, moment, plat, terme, règle)` au lieu de cardinaux ; rejeu de la ceinture sur le **payload final**, compté (`exclusion_belt.final_bites`). |
| **B · cible** | `dayEnergyFor` extrait d'`envelopeCore` et consommé par l'**écran**, le solo et le foyer ; l'appétit sort de l'entretien adulte ; le solo lit ses **vrais** créneaux légers et apports fixes. |
| **C · couloir** | `plateBoundsFor` rend `min`/`max`/`preferred` avec ρ = 0,6 sur un moment léger et l'appétit sur la masse ; `densityCorridorFor` rend le couloir et nomme l'incompatibilité ; les réparations visent **dans** le couloir, par direction. |
| **D · prompt** | La ligne de carte dit une bande et une visée ; `density_check` se vérifie **des deux côtés** ; CIQUAL, la masse cuite et la méthode de calcul sont **intactes**. |

**Étape 1** — `deno test _shared/keel/` : **6 308 verts, 2 rouges** (14 min 10 s).
Les deux rouges sont nommés plus bas et prouvés **antérieurs** à ce chantier.
Le premier passage de ce lot en portait **10** : les huit autres étaient des tests
qui **épinglaient un comportement remplacé**, et ils ont été **réécrits sur place,
avec leur motif** — jamais supprimés, jamais tolérés.
Côté front : **2 530 tests, 2 507 verts, 3 rouges**, aucun dans un fichier que ce
chantier touche.

**Les deux typechecks du gate sont propres :**
`deno check` sur les cinq points d'entrée (dont les **deux lanes de plan**) — aucune
erreur ; `tsc -b --noEmit` sur le front — `rc=0`, aucune sortie.

⚠️ **Le troisième — `tsc -p tsconfig.test.json` — porte 75 erreurs, dont quatre
fichiers HORS de `scripts/.tsc-test-red-baseline`** :
`plan/myShareTickPosition` (4), `lib/rhythmPrefill` (2), `pages/setupDraftWiring` (1),
`components/groceryRunsOffer` (1). Deux de ces fichiers sont **non suivis** par git,
un est modifié : même origine que les rouges ci-dessus. Deux lignes de la liste
ont par ailleurs **baissé** (`meCardSheet` 10 → 9, `planGridEatingOut` 1 → 0), ce
que le gate signale à chaque passage — à abaisser quand cette part sera commitée.

**Étape 2** — quatre requêtes réelles, séquentielles, toutes **HTTP 200** :
`scratchpad/2026-09-10-BANC-FAST/RAPPORT.md`.

| cas | mur | composition | rattrapage | palier |
|---|---|---|---|---|
| S1 solo 3 j | 57,4 s | 32,7 s | `empty_slots_retry` 16,3 s | `fast` (source **call**) → `priority` |
| S5 solo 6 j | 55,1 s | 45,4 s | — | idem |
| F1 foyer 4, 2 j | 187,6 s | 63,8 s | `dedicated_repair` 81,6 s | idem |
| F3 extrêmes, 2 j | 219,2 s | 120,8 s | `dedicated_repair` 89,1 s | idem |

⛔ **Le 546 existe, et sa cause est NOMMÉE : `CPU time hard limit reached`.**
Pas le mur. Il est **antérieur au chantier** — la campagne du même matin, avant la
première ligne de ce lot, porte deux `WORKER_LIMIT` sur quatre tirs. Les limites du
runtime n'ont **pas** été relevées.

### ⛔ Ce qui reste ouvert, nommé

1. **Étape 3 — LANCÉE, ET À MOITIÉ BLOQUÉE.** 10 scénarios × 2 générations = **20
   générations séquentielles**, 80 minutes, sur un référentiel figé et identifié
   (`scratchpad/2026-09-10-CAMPAGNE-ELARGIE/`, `ref/EMPREINTE.txt` : 943 lignes,
   sha256 en tête du rapport).
   **12/20 abouties.** Les 8 autres finissent en `546 WORKER_LIMIT`, motif lu et
   toujours le même : `CPU time hard limit reached`. Solo **8/10**, foyer
   **4/10** — et l'échec grandit avec l'avancement : `F1` passe en 107 s au
   début, `F3` échoue en 55 s **sans un seul appel modèle** plus tard.
   `policy = "per_worker"` réutilise le worker d'une requête à l'autre : deux
   plans de foyer à la suite partagent un budget CPU prévu pour un.
   ⛔ **La limite n'a pas été relevée.** Ce que ça coûte : les six générations de
   `F3` et `F4` manquent — les deux foyers les plus durs. Leur validation edge
   est **bloquée**, pas réussie. Le rejeu propre est un redémarrage du runtime
   **avant chaque** foyer.

   **Ce que les 12 abouties disent :**
   - **32 jours-bouches sur 62 sont `unmeasurable`** — le référentiel figé ne sait
     pas peser des libellés produit anglais (`sweet peppers`, `mature cheddar`,
     `wholemeal spaghetti`, `certified gluten free oats`…). Antérieur à ce
     chantier, mais ça **plafonne ce que la campagne peut prouver** : le taux de
     conformité repose sur **onze** jours-bouches, pas soixante-deux.
   - conformité ±5 % : **27,3 % (3/11)** — ⛔ sous le seuil de 90 %, et sur une
     base trop petite pour trancher.
   - assiettes dans les bornes (foyer) : médiane **100 %**.
   - **exclusion nouvelle sur le payload final : 0** ✅
   - **62 jours-bouches, tous classés** ✅
   - durée maximale **255,2 s**, sous l'échéance de 380 s ✅
   - ✅ **là où la mesure est possible, le dimensionnement est exact** : `F5`,
     Maya, `1935/1934` puis `1934/1934` — 0,1 % et 0,0 %.
   - ⚠️ le cas visé (`S2`, déficit contraint) passe de **2 359 kcal de moyenne
     pour une bande à 1 900** (campagne du 2026-09-09) à **1 902** en génération 2,
     verdict produit `within` — mais la génération 1 sort à 2 347 avec un jour à
     3 148. Deux tirs, deux réponses : c'est la **dispersion du modèle**, pas le
     moteur.
   - ✅ la réserve de priorité a mordu **en réel** :
     `rattrapage refusé: protein_anchor_retry — repair_reserved`.
   - ⛔ le verdict du produit juge toujours la **moyenne de fenêtre**, pas la
     dispersion : `S1·1` sort `within` avec un jour à **+15,4 %**.
2. **L'objectif d'une fiche sans taille est annulé sans motif.** `estimatedMaintenanceFor`
   rend `null` là où `adultMaintenanceKcal` rend un raccourci nommé : la personne
   reçoit une cible et un écart `0`. **L'alignement a été écrit puis RETIRÉ** — il
   contredit une décision datée (« `null`, jamais un repli ») que quatre tests
   énoncent. La sortie propre est de **nommer** le cas, pas de deviner un écart ;
   c'est une décision de produit.
3. **La réserve de priorité n'a pas été éprouvée en réel.** Aucun des quatre tirs
   n'a demandé deux rattrapages. Tenue par les tests déterministes seulement.
4. **Le solo ne dimensionne toujours pas.** Le couloir et les parts par créneau
   l'atteignent ; `applySizing` reste sur la lane du foyer, et `chooseGenerator`
   envoie un compte seul sur `generate-meal-v1`. C'est le périmètre nommé de
   `METHODE-GENERATION-DE-PLAN-SOLO.md`, pas un oubli.
5. **L'apport fixe du solo est calculé sur le premier jour de la fenêtre.** Un
   apport qui ne tombe pas tous les jours est approximé sur ce chemin.

### ⚠️ Deux rouges qui ne sont PAS de ce chantier — mesurés, pas supposés

Les deux viennent de travail **non commité** présent dans l'arbre au début de la
nuit. On les nomme, on ne les répare pas à la place de qui les a écrits.

| Test | Ce qui le fait rougir | Preuve que ce n'est pas ce lot |
|---|---|---|
| `household_merge_quota_test.ts` — « AUCUNE PORTE DE SORTIE ENTRE LA RÉCLAMATION ET LA DÉPENSE » | 5 sorties entre la réclamation de quota et l'appel modèle, au lieu d'une. Les quatre en trop sont le bloc d'**édition de case** (`draft_not_found`, `draft_not_done`, `draft_mismatch`, `draft_has_no_source`). | Même mesure sur `HEAD` : **1**. Sur l'arbre : **5**. Aucun de ces quatre `return` n'est de ce chantier. |
| `cooking_style_brief_test.ts` — « le style DÉRIVE la difficulté et la variété » | `[keel/cooking_plan] maxFridgeDays est REQUIS et >= 1: undefined` | `maxFridgeDays` **n'existe pas** dans `cooking_plan.ts` à `HEAD`. |

**Côté front, trois rouges de la même origine** — `npm exec vitest run` :
**2 530 tests, 2 507 verts, 3 rouges**, aucun dans un fichier que ce chantier
touche (il n'en touche aucun) :

| Test | Ce qui le fait rougir |
|---|---|
| `src/edge/coverage-guard.int.test.ts` | 57 déclencheurs de base contre 56 dans la liste connue — une migration neuve non acquittée. |
| `src/keel/i18n/energyBasis.int.test.ts` | « l'inventaire des clés qui écrivent un kcal est CLOS » : 21 clés vues, 16 listées. |
| `src/keel/api/mouthProfileReaders.int.test.ts` | `<ActivitySessionsCard>` a disparu de la page qui la montait. |

⚠️ `scripts/.vitest-red-baseline` est **vide** depuis le 2026-09-04, et c'est son
état normal : le gate échoue donc sur ces trois-là. Ils ne s'ajoutent pas à la
liste ici — leur cause est du travail en vol, et une tolérance écrite pour un vol
a la durée de vie d'un vol.

Un troisième rouge de la même famille **a** été réparé, parce que ce lot passait
exactement dessus : le schéma JSON demande `"density_check": <kcal per 100 g>`, et
la garde du registre de régime refusait le mot « kcal » hors de sa section. La
réparation est **de forme, pas de vocabulaire** — on masque `kcal per 100 g`
(une densité est une propriété du plat) et on garde une contre-épreuve qui prouve
qu'un `kcal` **nu** mord toujours. Retirer « calorie » du lexique aurait désarmé la
garde pour toute la prose du produit.
---

## 8. Ce que ce chantier ne fait pas

- Il ne **déploie** rien, ne pose aucun secret, ne lance aucun SQL destructif
  (`AGENTS.md`).
- Il ne **reroute** pas un compte seul vers la lane du foyer : `chooseGenerator`
  (`frontend/src/keel/api/planRouting.ts`) reste une **décision produit**, nommée
  dans `METHODE-GENERATION-DE-PLAN-SOLO.md`.
- Il ne **supprime** aucun chemin legacy : le chemin d'avant est **précédé**, jamais
  remplacé, et chaque coupe reste d'un caractère.
- Il ne **relève** pas les limites du runtime edge pour faire passer un banc.
