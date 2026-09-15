# Plan de mise en œuvre — composition de repas pour un foyer

**2026-08-21.** Construit sur trois documents de design, huit cas déroulés, quatre
rapports de lot, et **six inventaires du code et de la base vivante** menés en
parallèle (calcul · référentiel · mémoire · foyer · sécurité · front).

> **Ce plan ne suppose rien.** Chaque chiffre qu'il porte a été mesuré le
> 2026-08-21 sur `supabase_db_Sophia_2`, ou vient d'un rapport de lot cité par sa
> ligne. Quand une mesure manque, c'est écrit.

---

## ⛔ AVANT TOUT — LA DÉCOUVERTE QUI RÉORGANISE LE PLAN

**Le moteur de calcul par bouche n'a jamais tourné dans cette base.**

```
dishes[].boxes  présent sur    0 plan / 180        (absent des 1 821 plats)
box_sizing.anchor présent sur  0 plan / 46 porteurs de box_sizing
dernière génération            2026-08-19 10:18
```

`mouthDayEnergy` rend `[]` dès que `dish.boxes.length === 0` (`mouth_energy.ts:217`),
et `householdAnchors` est sous `if (composition)` (`generate-household-meal-v1/index.ts:5292`).
Or `index.ts:5717` écrit `box_sizing.anchor` **inconditionnellement** depuis le lot
d'ancrage : son absence sur les 46 plans porteurs prouve qu'ils datent tous d'avant.

⇒ **`anchorFactorFor`, `composedDishShare`, `dayCoverageOf` et `MEAL_MAX_GRAMS_PER_KG`
n'ont produit aucune mesure.** Le plafond physique retombe même sur `Infinity`
(`physicalMax` a `day.maxMealGrams` au dénominateur, nul sans boîtes).

**Ce n'est pas un lot de construction : c'est un lot de RUN.** `mealDishesPayload`
écrit bien `dishes[].boxes` aujourd'hui (`meal_generation.ts:6606`) et le lecteur
front `readBoxes()` le lit (`api/mealGeneration.ts:1054`). Le code de la v4 est là,
sur le disque, et **personne ne l'a exécuté**. Le premier geste du plan n'est donc
pas d'écrire du code — c'est de **générer un plan**.

---

## 1. CE QUI EST DÉJÀ FAIT — ET N'A PLUS À ÊTRE PLANIFIÉ

| lot | ce qui est réellement livré | ce qui reste |
|---|---|---|
| **Lot 18** — sas des inconnus | ✅ **Vraiment livré** : 3 migrations appliquées et enregistrées, `composition_fill.ts` + `_io.ts`, **les deux lanes câblées**, 4 compteurs, vue `composition_fill_weekly`, 28 tests Deno + 11 SQL + parité TS↔SQL | ⛔ **jamais exécuté** (sas à 0 ligne) · ⛔ **repli désarmé** (voir §2) · ⛔ **non commité** · aucun cron de promotion |
| **Lot 19** — parité FR/EN | ⚠️ **Ce n'est pas un lot, c'est une MESURE.** Rapport + 2 TSV. Écart FR/EN chiffré à **17,3 points** (EN 150/150, FR 124/150), mécanisme identifié (les 923 slugs sont anglais, `bySlug` passe avant `byAlias` : l'anglais a deux portes, le français une) | ⛔ **zéro alias appliqué** — les 86 propositions sont absentes de la base · `complet` toujours dans `PREPARATION_MODIFIERS` · `wrap`/`pitta`/`toast` pointent toujours sur `white_bread` |
| **Lot 30** — grille de prix | ✅ Grille FR/US en sas : **923 lignes** (917 FR, 860 US), bandes log par groupe, pièges cru/cuit et partie comestible traités **sur le prix** | ⛔ **0 ligne promue**, **0 lecteur** — `food_composition_refs` porte 0 prix · pas de prix saisonnier · l'**énergie** des 131 lignes cuites reste fausse |
| **La convention des condiments** (lot 0-C) | ✅ Livrée, et c'est le seul mécanisme qui ait fait monter le taux : elle **double** la journée calculable foyer (9,1 % → 23,4 %) | — |
| **`keelGenerationModel()` sur la lane foyer** | ✅ **Réparé le 2026-08-19** (`index.ts:4323` et `4547`), avec la cause enfin nommée : timeout HTTP par défaut à 110 s contre une médiane mesurée à 164 s | ⚠️ **lu, jamais observé** — aucun plan composé depuis. `generated_from` ne porte aucune clé `model` |
| **M1 (le chat n'écrit plus)** | ⚠️ **À moitié fait, par accident.** `classifyAndPersistConversation` a **zéro appelant** (7 occurrences, toutes dans son propre test). Le renvoi de sizing EST câblé (`router/run.ts:6473` → `:2835`) et tenu par un test anti-commentaires | ⛔ `declare_safety_constraint` **écrit toujours** (68 lignes) — le §2.8 du design n'est pas tenu · aucun bouton de navigation vers une section |

⚠️ **Rien de tout ça n'est commité.** Les 13 migrations du 2026-08-20/21 sont
appliquées à la base locale **partagée** et enregistrées au registre, mais
`NON-SUIVI` par git — comme `composition_fill.ts` et ses tests. Disque et registre
sont en revanche parfaitement alignés : **227 fichiers, 227 versions enregistrées,
zéro doublon de version, zéro migration en attente.**

---

## 2. LES TROIS LOTS QUI DÉBLOQUENT LE PLUS

### ① `V0-D` — le run réel sur la fixture obligatoire

Il ne change pas une ligne de code. Il **rend jugeables** neuf lots qui sont
aujourd'hui invérifiables : la boîte v4, l'ancrage, les compteurs du lot 18, la
ceinture de régime à plusieurs bouches, le modèle de génération, le verrou de lane,
le taux de journées calculables en français, le filtre v4 de `portion_note`, et la
règle des boîtes par groupe. **Neuf lots dépendent d'un seul geste qui ne coûte
qu'une génération.**

### ② `L6′` — la boîte v4 atteint la base ET l'écran

Racine du graphe de calcul. Sans `dishes[].boxes` persisté : pas de
`mouthDayEnergy`, pas d'ancrage, pas de facteur par bouche, pas de plafond
physique, pas de mesure avant/après en grammes, et **aucune boîte à l'écran sur
les 102 plans foyer**. Le code existe ; ce lot est *« faire, puis réparer ce que le
run casse »*, pas *« construire »*.

### ③ `L17 + L-1` — la PESÉE, pas la résolution

Le goulot a changé de nature et les documents ne le savent pas encore :

```
pourquoi un plat s'abstient (1 821 plats, mesure lot 18)
    missing_quantity      533     <- résolu, mais aucune quantité convertible
    unknown_ingredient    444     <- ce que le lot 18 a fermé (444 -> 27)
    no_ingredients        144
après le lot 18 : missing_quantity monte à 866  (les plats débloqués y retombent)
```

Et la mesure indépendante de A2 sur 9 810 lignes le confirme :

| | RÉSOLU | **PESÉ** | résolu **et** pesé |
|---|---:|---:|---:|
| foyer | 89,2 % | **87,6 %** | 80,1 % |
| solo | 89,3 % | **11,2 %** | **7,8 %** |

**La résolution est identique dans les deux lanes. C'est la pesée qui s'effondre.**
Le référentiel n'est plus le problème principal — et tout lot qui déplace des
grammes a une portée proportionnelle au taux de journées calculables.

---

## 3. LE LOT LE PLUS DANGEREUX

### `L11` — la mort de `composedDishShare`

`COMPOSED_DISH_MEAL_SHARE = 0,42` (`mouth_anchor.ts:207`). Le retirer multiplie la
cible de chaque plat par **1 ÷ 0,42 = ×2,38**.

Quatre raisons qui en font le lot le plus dangereux du dossier, et elles s'empilent :

1. **Il n'y a aucun « avant ».** La chaîne n'a jamais tourné (§0). On ne peut pas
   comparer un grammage à celui d'hier — il n'existe pas.
2. **Le repli gouverne la population.** Les trois cases de structure sont tranchées
   sur **2 fiches sur 43** : `composedDishShare` rend 0,42 pour **41 fiches sur 43**.
   Ce n'est pas un cas limite, c'est le cas nominal.
3. **Aucune ceinture ne le rattrape.** `MEAL_MAX_GRAMS_PER_KG` retombe sur `Infinity`
   sans boîtes, et `ANCHOR_FACTOR_MAX = 3,00` laisse passer ×2,38 sans mordre.
4. **La lane foyer n'a pas de second essai** (`DESIGN §3.1`) : ni vérification, ni
   mesure, ni relance. Un doublement de portion y sort tel quel, dans l'assiette.

⇒ **Il ne se livre jamais seul.** Il exige `L22` (les six moments) et `L25` (le
forfait fromage/dessert) dans le même lot — sinon on retire une convention à 42 %
sans la remplacer par un compte, et on sur-sert de tout ce que le fromage et le
dessert portaient.

**Deuxième au classement, pour une raison différente : `L0` (la conservation
devient un refus).** Il ne casse pas un calcul, il **détruit l'unité de valeur du
produit** — un refus dur à 48 h plafonne chaque session à deux jours de repas, donc
trois à quatre sessions par semaine au lieu d'une. Le temps gagné est ce que le
produit vend.

**Troisième : `S2` (la ceinture de sortie couvre `strict`).** Une garde cassée
bloque tout et ressemble à une garde qui marche. Elle exige un cas qui PASSE autant
qu'un cas qui MORD.

---
---

# PARTIE 1 — L'ÉTAT DES LIEUX, MESURÉ

## 1.1 Les entrées du moteur sont vides — et c'est le fait le plus sous-estimé

| entrée | remplie | total | ce qui gouverne à la place |
|---|---:|---:|---|
| `day_activity` **ou** `sport_frequency` | **1** | 88 bouches | `ACTIVITY_FACTOR = 1,5`, source `assumed` |
| `target_pace_kg_per_week` | **4** | 88 | `DEFAULT_PACE_KG_PER_WEEK = 0,25` |
| `eating_rhythm` | **20** | 88 | `declaredSlots: []` ⇒ **couverture = 1** pour 68 bouches |
| les trois cases `takes_dessert/cheese/bread` | **2** | 43 fiches de corps | `COMPOSED_DISH_MEAL_SHARE = 0,42` |
| `meal_structure_asked_at` posé | **2** | 43 | — |
| `appetite` déclaré | **2** | 43 | `×1,00` |
| `birth_date` sur `profiles` | **119** | 1 312 (**91 % NULL**) | `weekPlanAgeGate` **passe** sur `absent` |

⛔ **Conséquence de méthode : les lots qui règlent une constante (1, 16, 22, 37, 38)
agissent sur un REPLI, pas sur une réponse.** Le lot 16 n'est pas « corriger le
repli d'activité » : **le repli EST le produit**, à 87 bouches sur 88.

Et le repli d'activité se trompe **vers le bas** — +3 % sur un sédentaire (1,45),
**−42 %** sur un métier physique à 5 séances (2,13). Le corriger « vers le bas »
aggraverait le seul cas qui casse.

## 1.2 Le corpus de mesure est presque entièrement fictif

```
auth.users                                        1 320
  dont comptes de test (@keeltest.dev, @test.dev, qa-*, laneb-*)   1 311
  dont comptes non-test                                                9
porteurs d'une clé de mémoire (retained_items / retained_next_plan
  / food_preferences)                                                 12
  ... dont comptes non-test                                            0
```

⛔ **Aucun compte réel ne porte une seule ligne de mémoire.** Les chiffres du
`DESIGN-MEMOIRE` (2 lignes ici, 10 là) ne mesurent pas un produit sous-utilisé :
ils mesurent des fixtures QA. Toute conclusion du type « le magasin structuré est
presque vide, donc l'ancien gagne » est une lecture de banc, pas de terrain.

⚠️ **Une seule exception, et elle est le signal le plus fort du dossier** :
`cooking_session_states` est à **0 absolu** — tous comptes confondus, QA compris.
Le seul retour qui **détruit** des repas au lieu d'ajuster des préférences n'a
jamais été répondu par personne, pas même par un banc.

## 1.3 La nomenclature des documents ne correspond pas au schéma

| nommé dans les documents | réalité |
|---|---|
| tables `retained_*` | **clés jsonb** de `student_goals.practical_constraints` |
| `plan_feedback` | la table s'appelle `meal_plan_feedback` |
| `draft_note_*`, `food_preference*` | **n'existent qu'en code**, jamais en table |
| `household_composition`, `household_portions`, `household_diet` | **des MODULES** `_shared/keel/*.ts`, pas des tables |
| `household_mouths` | **n'existe pas** — 2 occurrences, toutes dans `scratchpad/` |
| `member_portions` | une **colonne jsonb** de `student_generated_meals`, lisible par tout le foyer |

⇒ Tout lot qui promet « une migration sur `retained_items` » est mal écrit. Ce plan
nomme les objets réels.

## 1.4 Ce qui est écrit, testé, et n'a aucun appelant

| module / garde | fichier | appelants réels (hors tests et commentaires) |
|---|---|---:|
| `canEmitMouthEnergy` — *« un kcal ne sort que pour la bouche qui le demande »* | `energy_gate.ts:528` | **0** |
| `escalateMinorStudent` — 409 + alerte coach | `student_body_io.ts:452` | **0** (son appelant `generate-week-plan-v1` a été retiré) |
| `portionAnchorFor` / `portionAnchorPromptLine` | `portion_anchor.ts:105,153` | **0** |
| `scaleFactorsFor` / `scaleIngredients` / `isScalableUnit` | `portion_scaling.ts` | **0** |
| `unmetDemand` / `neededPotFactor` | `pot_demand.ts:88,168` | **0** |
| `AnchorFactor.raw` (le résidu, entrée annoncée du lot 3) | `mouth_anchor.ts:478` | **produit, jamais lu** |
| `trunkSentinelGaps` | `household_composition.ts` | **0** |
| `classifyAndPersistConversation` | `conversation_retained_io.ts:202` | **0** |
| `constraintsForPrompt` | — | **0** — mort par archivage de `generate-week-plan-v1` |
| `promote_pending_food_compositions()` / `promote_pending_food_prices()` | migrations | **0** — et 0 job sur les 22 crons |
| lecture des prix (6 colonnes + 3 vues) | — | **0** |

⚠️ **`householdAppetite` est un cas à part** : 1 appelant réel (`index.ts:5378`),
mais journalisé avec `steering: false`. **Mesuré, jamais branché** — le commentaire
`:5364` le dit lui-même.

## 1.5 L'état des cinq décisions du design foyer

| | décision | état mesuré dans le code |
|---|---|---|
| **D1** | le curseur de cuisine, **4 réponses** | ⚠️ **PARTIEL et divergent** — `COOKING_SHAPES` n'a que **3** jetons ; la 4ᵉ réponse est un `null`. Le curseur a **plafonné 8 fois** en base |
| **D2** | le curseur ne décide jamais de la sécurité | ✅ **tourne** — `capCookingShape` est un plafond, jamais un ordre |
| **D3** | la hiérarchie inter-bouches, 5 rangs, en récence | ⛔ **n'existe pas** — `PRECEDENCE_BLOCK` est injecté à `:3617`, **pas en dernière position** sur la lane foyer, et ne nomme aucun objet du foyer |
| **D4** | aucun objectif de poids sur un enfant | ⛔ **LE CODE A TRANCHÉ L'INVERSE** le 2026-08-18 : *« un mineur porte les six blocs, comme les autres »*. `keel_household_set_member_target` n'a aucune garde d'âge. **2 bouches mineures portent déjà `fat_loss`/`muscle_gain` en base** |
| **D5** | le maître génère, les autres sont informés | ⚠️ partiel — le tuyau d'avis existe (18 plans), la règle « sujet foyer / sujet bouche » n'a aucune implémentation nommée |

Et sur les **23 identifiants** nommés dans les 166 conflits du registre :
**20 ont zéro occurrence** dans le code, 3 sont partiels, **aucun n'est pleinement
tranché**.

## 1.6 Ce que la sécurité tient — et ce qu'elle ne tient pas

**Ce qui est solide, et il faut le dire :**

- **Le plancher TCA est fail-closed sur le chiffre, et c'est prouvé.**
  `energySafetyGates` lève sur une entrée `undefined` (*« an absent gate is a
  disarmed gate »*), lève sur un `restrictionFlag` non booléen, et le `if` du
  plancher ne prend **aucun `&&`**. Aucun chemin ne fait valoir `undefined` pour
  « pas de plancher ».
- **Aucun prénom comme clé** : `member_id` en uuid sur **340/340** entrées.
- **Aucune kcal dans `member_portions`** : 0 sur 340.
- **Aucun matcher maison sur le moteur allergène** : lookarounds sur
  `[a-z0-9]`, suffixe `s`/`es` seulement, paires `celeriac`/`celery` appariées à la
  main. « lait » ne mord pas dans « laitue ».
- La lane **foyer** rend un **503** quand elle ne peut pas lire les contraintes —
  *« we will not cook without them »*.

**Ce qui ne tient pas, mesuré :**

| trou | mesure |
|---|---|
| ⛔ **La ligature tue le plancher d'allergie** — `safety_constraint_floor.ts` porte sa **propre** `normalize()`, qui n'a **pas** reçu le repli de ligatures du 2026-08-19. `"allergique aux œufs"` → `"ufs"` → **aucun match** ; `"oeufs"` → match. Locale par défaut : **`fr-FR`** | 1 ligne de code, 0 test |
| ⛔ **La ceinture de sortie ne couvre que `severity='medical'`** | **6 contraintes ACTIVES** non vérifiées en sortie (1 `allergy/strict` mustard, 5 `intolerance/strict`) |
| ⛔ **La lane SOLO est fail-OPEN sur la lecture des contraintes** — `catch { console.warn }` puis on compose sans ceinture | asymétrie avec le 503 de la lane foyer |
| ⛔ **La garde du plan « mineur » est morte** + son entrée manque | `escalateMinorStudent` : 0 appelant · `birth_date` NULL sur **1 193/1 312** |
| ⛔ **Aucune règle alimentaire de grossesse** — le jeton est reconnu et le plancher branché, mais `conditionRef` est **exclu** de `safetyConstraintTokens` (et c'est justifié : l'armer sur `diabetes` a bâillonné un message d'urgence en run réel) | **0 ligne** `condition_ref` en base |
| ⛔ **Contamination croisée : RIEN** | 2 occurrences dans tout le dépôt, aucune fonctionnelle |
| ⛔ **`MAX_FRIDGE_DAYS` pousse un `issue`, ne rejette rien** — et `issues[]` n'est persisté nulle part | **impossible de compter** les violations |
| ⛔ **`household_member_allergies` et `household_food_restrictions` ne sont pas réclamées par le lifecycle RGPD** | ni export, ni suppression, ni test |
| ⛔ **Grants Supabase par défaut jamais révoqués** — `anon` a S/I/U/D sur `profiles`, `student_generated_meals`, `weekly_reviews`, `substances*` | `profiles` porte `birth_date`, l'entrée de la porte mineur, et sa policy est `TO public` avec une clause `ALL` |
| ⚠️ **181 `portion_note` sur 340 portent un GRAMMAGE par bouche** — Roxane 394 g, Zoe 344 g, Lubna 384 g sur le même plat — lisible par tout le foyer | la lettre de la règle tient (0 kcal), **l'esprit non** |

---
---

# PARTIE 2 — LE GRAPHE

## 2.1 Les quatre racines, et ce qui pend dessous

```
RACINE A — LA BOÎTE PERSISTÉE  (dishes[].boxes)
│   0 plan sur 180. Le code l'écrit, personne ne l'a exécuté.
│
├─► mouthDayEnergy ─► householdAnchors ─► anchorFactorFor
│     └─► toute la chaîne « cible ÷ livré », par bouche
├─► MEAL_MAX_GRAMS_PER_KG   (son dénominateur maxMealGrams est nul sans boîtes)
├─► composedDishShare · dayCoverageOf
├─► le filtre v4 de portion_note   (dish.boxes.length === 0 est TOUJOURS vrai)
├─► readBoxes() côté écran         (aucune boîte rendue sur 102 plans foyer)
└─► SizableShare = {memberId, grams} ─► il n'y a nulle part où écrire une VARIANTE

    ⇒ bloque : L9bis · L11 · L13 · L20 · L22 · L26 · L38
               et TOUTE mesure avant/après exprimée en grammes


RACINE B — LA JOURNÉE CALCULABLE  (gouvernée par la PESÉE, pas la résolution)
│   solo 7,8 % résolu-et-pesé · foyer 80,1 %
│   la porte est BINAIRE : zéro terme non résolu ET zéro terme non pesé
│
├─◄ L-1  unit_grams          (72 lignes sur 923 = 7,8 %)
├─◄ L17  abstention pesée     ─── PORTE G2 ───► FOOD_GROUP_DECLARATION_BLOCK
├─◄ L19b alias + `complet`    (0 des 86 propositions appliquée)
├─◄ L-C  les 131 lignes cuites lues comme du cru
└─◄ le PROMPT               (missing_quantity vient du modèle qui n'écrit pas de quantité)

    ⇒ gouverne la PORTÉE de tout lot qui déplace un gramme.
      Livrer L9bis seul ne changerait le comportement que de ~8 % des journées solo.


RACINE C — LES ENTRÉES DU CORPS
│   activité 1/88 · pace 4/88 · rythme 20/88 · structure 2/43
│
└─► L16 · L22 · L11 · L1 · L37 · L38 agissent tous sur un REPLI

    ⇒ un lot qui règle une constante que personne ne remplit
      n'a pas la portée qu'il annonce.


RACINE D — LA SÉCURITÉ  (indépendante des trois autres)
│   ne dépend de rien, ne bloque aucun calcul
└─► bloque le PILOTE PAYANT, et rien d'autre
```

## 2.2 Les chaînes qui ne se coupent pas

**Chaîne du gramme** — l'ordre est contraignant, il n'est pas thématique :

```
V0-D run réel ─► L6′ la boîte en base
                    └─► L22 les six moments ─┐
                    └─► L25 le forfait ──────┤
                                             ├─► L11 composedDishShare meurt
                                             │     (les trois dans le MÊME lot)
                                             └─► L9bis+20 la porte densité/protéine
                                                   └─► L38 la cible suit l'objectif
                                                   └─► L13 la correction par rôle
```

⛔ **`L22` doit précéder tout rattachement d'apport fixe.** Rattacher le shaker à
l'après-midi ne fait rien tant que l'après-midi pèse zéro — et **ça ressemble à un
lot qui marche**. L'ordre est écrit dans le design (§5.4 ③) ; il est repris ici
parce que c'est le piège le plus facile à répéter.

⛔ **`L11` et `L22` sont UNE SEULE PORTE** : une occasion couverte par une habitude
résolue **sort du dénominateur** et **ne se soustrait pas en plus**. Séparées, elles
arment un double comptage.

**Chaîne de la variante** :

```
L6′ boîtes ─► items[] par boîte ─► L26 la variante par bouche
                                     └─► L21 le dégoût porteur d'apport
                                           (exige le 3e état d'un nutriment,
                                            « impossible à couvrir », inexistant)
```

**Chaîne du budget** :

```
L30 grille en sas (fait) ─► L30b promotion + lecteur ─► Σ q×prix APRÈS le facteur
                                                          └─ exige L6′ (les grammes réels)
                                                          └─► L32 la saison
```

⛔ Le budget est **la seule porte de degré 1** du produit : elle se juge sur les
grammes réels, jamais sur la composition. La capacité des appareils, l'autre
candidate, a été **écartée** le 2026-08-21.

## 2.3 Les doublons — deux lots qui touchent la même ligne

| lots | la ligne partagée | ce qu'il faut faire |
|---|---|---|
| **L9bis · L38** | `DENSITY_CEILING_FAT_LOSS = 1,3` · `DENSITY_CEILING_DEFAULT = 1,8` (`meal_envelope.ts:551-552`) | ⛔ **Ne pas fusionner.** L'un **refuse** (plancher universel `D ≥ 0,8`), l'autre **oriente** (cible, et elle s'inverse en prise). Livrer dans cet ordre, dans deux commits nommés |
| **L11 · L22 · L25** | `mouth_anchor.ts` — `COMPOSED_DISH_MEAL_SHARE:207`, `SLOT_DAY_WEIGHT:399`, `MEAL_COMPONENT_KCAL:261` | ⛔ **Un seul lot.** Trois constantes voisines, un seul dénominateur |
| **L20 · L9bis** | la porte de composition | ✅ **Déjà fusionnés par décision** — densité et protéine sont deux rapports invariants d'échelle, une porte, **deux critères, deux PORTÉES** (densité par repas, protéine par jour) |
| **L1 · L37** | `weight_pace.ts` / `meal_envelope.ts`, constantes de plafond | Séparables, mais ⛔ **ne PAS aligner `MAX_DAILY_DEFICIT_KCAL = 500` par symétrie** quand on relève `MAX_SURPLUS_FRACTION` : le plancher TCA n'a pas de miroir |
| **S2 · L21** | la ceinture de sortie (`safety_constraints.ts:580`) | S2 étend la sévérité couverte, L21 ajoute une exigence positive. S2 d'abord |
| **L17 · L18** | le repli par bornes de groupe | L18 est livré mais **son repli est mort** ; L17 le ressuscite. Même porte G2 |

## 2.4 Un doublon de constante, réel et non testé

```
TARGET_WEIGHT_KG_MIN = 25   TARGET_WEIGHT_KG_MAX = 400
   weight_pace.ts:588-589      (redéclarées)
   energy_target.ts:213-214    (source annoncée)
   weekly_flow.ts:92-93        (WEIGHT_KG_MIN/MAX, troisième porteur)
```

`weight_pace.ts:583-586` porte le commentaire *« recopiées ici, elles se mettraient
à diverger ; importées, elles restent le même refus »* — **et le fichier ne les
importe pas.** Il n'a que trois imports, aucun vers `energy_target.ts`. Aucun test
ne compare les trois paires, contrairement à `DAY_ACTIVITY_BASE` ↔ `ACTIVITY_FACTORS`
qui, elles, sont verrouillées par `meal_envelope_test.ts:917-918`.

⇒ C'est exactement le mode d'échec « deux copies d'un même nombre divergent, et
c'est celle qu'on regarde le moins qui garde l'ancienne ». **Lot `X1`.**

## 2.5 Les tests qui ne peuvent pas rougir

`mouth_anchor_test.ts` (35 tests) **importe** les constantes qu'il vérifie et
recalcule l'attendu avec elles :

```ts
:212  assertEquals(got.factor, (target * COMPOSED_DISH_MEAL_SHARE) / delivered)
:244  assertEquals(tiny.factor, ANCHOR_FACTOR_MAX)
:486  assert(biggestServed <= MEAL_MAX_GRAMS_PER_KG * kg + 1)
```

**Changer `0,42` en `1,0` ne rougit rien.** Aucun `assertEquals(<CONSTANTE>,
<littéral>)` dans le fichier. Par contraste, deux constantes du dépôt SONT épinglées
(`BOX_SUM_TOLERANCE_RATIO === 1.1`, `DEFAULT_PACE_KG_PER_WEEK === 0.25`).

⇒ **Aucun lot qui change une de ces six constantes n'est livrable tant que sa
valeur n'est pas épinglée par un littéral.** C'est une pré-condition de `L11`,
`L9bis` et `L1`, pas un raffinement. **Lot `X2`.**

---

## 2.6 LES PORTES — elles ne sont pas des lots, et rien ne les remplace

> ⚠️ **Aucune n'est tranchée dans ce plan.** Les trancher en passant est le défaut
> que le document interdit explicitement. Chacune porte **ce qu'elle bloque** et
> **ce qu'il faut pour la lever**.

| | porte | ce qu'elle bloque | ce qu'il faut pour la lever |
|---|---|---|---|
| **P0** | ⛔ **Qualification juridique.** On calcule un déficit **nominatif**, un rythme en kg/semaine et une prescription de portions pour des **tiers sans compte** — les bouches d'un foyer — en France | `L6′` (la boîte nominative), `L24`, et **le pilote payant**. C'est le seul trou qui peut annuler le produit entier plutôt que d'en dégrader une partie | un avis juridique. **Coût de conseil, pas un lot** |
| **P1** | **Les questions du corps** : anticoagulants oraux, côlon irritable, grossesse/allaitement, GLP-1 | `L9bis` et `L38` (la densité pousse le volume végétal, donc la vitamine K et les fibres), `L0bis` | une décision produit sur ce qu'on ose demander, puis un écran |
| **G2** | **Le bloc de déclaration de groupe devient-il inconditionnel ?** Aujourd'hui `FOOD_GROUP_DECLARATION_BLOCK` ne voyage qu'avec la ligne de régime ; mesuré : **0 ligne d'ingrédient sur 9 810** porte un `group` | le **repli** de `L18` (mort aujourd'hui) et la borne par groupe de `L17` | renverse une décision documentée (*« un élève sans régime reçoit un prompt byte-identique »*) **tenue par un test**. Décision produit |
| **G3** | **La juridiction de la conservation** : 48 h (FSA) ou 72 h ? | `L0`, `L29`, `L34` | une décision produit. ⚠️ 48 h **change l'unité de valeur** : 3-4 sessions/semaine au lieu d'1-2 |
| **G4** | **D4 — l'objectif de poids sur un mineur.** Le design dit « le champ disparaît » ; le code a tranché l'inverse le 2026-08-18, et 2 mineurs en portent un | `S4` | rouvrir la décision du 2026-08-18 **en la nommant**, pas la contourner |
| **G5** | **Le grammage par bouche dans `member_portions`** — 181/340 lignes, lisible par tout le foyer, permet de classer les besoins des colocataires | `L26`, la v4, et la lecture même de la boîte | trancher : le gramme sort de la note et vit **dans la boîte** (qui a son propre destinataire), ou il reste et on assume |
| **G6** | **RNP ou BNM ?** Un plan se compare à la RNP ; l'adéquation d'un individu se juge au BNM | `L15` (fréquence sentinelle) — le choix change **tous** les verdicts de couverture | une décision, avec sa source écrite |
| **G7** | **Un moteur ou deux ?** Les deux lanes portent deux implémentations de `cible ÷ livré` qui ne partagent rien | `L13`, et le coût de tout lot qui touche les grammes (×2) | une décision d'architecture |
| **G8** | **`pepper`** — poivre (330 kcal) ou poivron (26) ? **98 occurrences = 21 % de tous les ratés de résolution** | une part de `L19b` | ⛔ **ne se résout pas par un alias** : trancher à l'écriture du prompt, ou laisser non résolu. Le deviner est très exactement ce que `resolveIngredient` interdit |

---
---

# PARTIE 3 — LES VAGUES

Chaque vague se termine par une **vérification en conditions réelles** — un run
persisté, pas une suite de tests. Le dépôt a mesuré que des chemins entiers
semblent vivants sans avoir jamais tourné ; c'est le seul contrôle qui l'attrape.

| vague | ce qu'elle fait | change une assiette ? | se termine par |
|---|---|---|---|
| **0** | geler, honorer les compteurs, **et générer un plan** | non | un plan foyer de 4 bouches **persisté**, boîtes lisibles à l'écran |
| **1** | la **sécurité** — elle ne dépend d'aucune autre vague et peut courir en parallèle | non | chaque garde a un cas qui **MORD** et un cas qui **PASSE**, sur la fixture |
| **2** | la **journée devient calculable** | oui (indirectement : plus de journées entrent dans le calcul) | le taux de journées calculables remesuré **dans les deux langues** |
| **3** | les **entrées du corps** cessent d'être des replis | oui | la répartition `crossed`/`legacy`/`assumed` remesurée |
| **4** | les **grammes bougent** — chaque lot avec sa direction nommée d'avance | **oui, fortement** | grammes avant/après **par bouche**, sur la même fixture |
| **5** | le **foyer pluriel** — enfin exercé | oui | l'union de deux régimes déclarés mord pour la première fois |
| **6** | ce qui **se dit**, et ce qu'on **retient** | partiellement | un plan qui nomme son compromis |

⚠️ **Les vagues 0 et 1 sont parallélisables entre elles. Les vagues 2 → 5 ne le
sont pas** : chacune est le dénominateur de la mesure de la suivante.

---

## LA FIXTURE OBLIGATOIRE — elle sert à toutes les vagues

> Un **foyer de 4 bouches** : un **végane**, un **mineur**, une **allergie
> médicale**, **deux objectifs opposés** (une perte, une prise), et une **absence
> partielle** (une bouche absente 2 jours sur 5).

**Pourquoi elle est obligatoire, et pourquoi ce contenu-là exactement :**

| élément | ce qu'il exerce | ce qui est aujourd'hui à zéro |
|---|---|---|
| **4 bouches** | l'union des interdits, le groupage des contenants, la hiérarchie D3 | 96 plans foyer sur 102 sont à plus d'une bouche, mais la ceinture de régime n'a **jamais** vu plus d'une bouche à régime déclaré |
| **1 végane** | `strictestRegimeAt`, `regimeCapsProtein`, `dietDiverges` — et **R5 ne s'arme QUE pour un végane** (`ANIMAL_PROTEIN_ANCHORS` = 7 groupes, tous exclus par `vegan` seul) | 13 plans à ceinture, **0 refus**, **0 à plusieurs bouches** |
| **1 mineur** | `weekPlanAgeGate`, `ageState === "unknown"` ferme le grammage, la porte D4/G4 | 2 mineurs portent déjà un objectif en base |
| **1 allergie `medical`** | le verrou de sortie, et la **contamination croisée** qui n'existe pas | 7 lignes `household_member_allergies` |
| **2 objectifs opposés** | `laneMode` / `per_portion`, le verrou de lane du cas 09 | `laneMode` est calculé et **n'apparaît nulle part** dans `index.ts` |
| **1 absence partielle** | `resolveWindowPresence`, l'occasion **estimée** | — |

⛔ **Elle doit être composée en `intent: commit`, pas en `draft`** — le registre le
demande explicitement (conflit 3.1 n°4), et `draft` ne persiste pas `generated_from`.

⚠️ **Deux pièges de préparation, déjà payés dans ce dépôt :**
1. **Redémarrer `functions serve` avant le run** — le runtime edge sert un cache
   périmé des modules `_shared` ; un fichier **modifié** n'est pas rechargé.
2. **Ne jamais viser un compte sans mot de passe.** Nommer une fixture existante et
   vérifier qu'on peut s'y connecter.
3. Le harnais QA a un **plafond de 3 sièges d'essai** : le 4ᵉ élève plante le run.
   Une fixture à 4 bouches doit donc utiliser des **bouches sans compte**, ce qui
   est de toute façon le cas nominal du produit.

---
---

# VAGUE 0 — GELER, HONORER LES COMPTEURS, ET GÉNÉRER

## V0-A — le travail qui tourne entre dans le dépôt

| | |
|---|---|
| **quoi** | Rien ne change pour l'utilisateur. Le code qui tourne aujourd'hui sur la base locale partagée devient reproductible depuis un `git clone`. |
| **pourquoi** | Mesuré : **13 migrations du 2026-08-20/21 sont appliquées et enregistrées mais `NON-SUIVI` par git**, dont les 3 du lot 18 et les 2 du lot 30. `composition_fill.ts`, `composition_fill_io.ts` et leurs tests sont `??`. Côté front, **`lib/mouthVoice.ts` et `lib/habitSlots.ts` ne sont pas commités et sont importés par `MouthFormDialog`** — l'écran central du produit ne compile pas depuis un checkout propre. |
| **dépend de** | rien |
| **bloque** | **tout** — un plan bâti sur du code non versionné n'est pas exécutable par quelqu'un d'autre, ce qui est la définition d'échec de ce plan |
| **fichiers** | `supabase/migrations/20260820*.sql` (8) · `20260821*.sql` (5) · `supabase/functions/_shared/keel/composition_fill{,_io,_test}.ts` · `composition_pending_test.sql` · `composition_band_parity_test.ts` · `frontend/src/keel/lib/mouthVoice.ts` · `frontend/src/keel/lib/habitSlots.ts` · `frontend/src/keel/components/HouseholdTraditionsCard.tsx` · 8 fichiers `*.int.test.ts` non suivis |
| **migration** | non — les migrations existent déjà et sont appliquées ; ce lot les **versionne** |
| **mesure AVANT** | `git status --porcelain \| awk '{print $1}' \| sort \| uniq -c` → **141 `??`, 168 `M`, 2 `D`, 2 `RM`**. `for f in supabase/migrations/2026082*.sql; do git ls-files --error-unmatch $f; done` → **13 échecs** |
| **direction** | les 13 migrations et les 3 fichiers `_shared/keel/composition_fill*` passent à `COMMITE`. Le compte de `??` baisse d'au moins 16. ⛔ **Le compte de `M` ne doit PAS baisser** : `en.ts`, `fr.ts`, `catalog.ts` et les fichiers d'autres sessions restent modifiés et non commités |
| **mesure APRÈS** | `git ls-files --error-unmatch` réussit sur les 13 migrations et les 5 fichiers de code. Seuil : **18/18** |
| **armé par** | un `git stash list` vide et un `git clone` dans un répertoire tiers où `frontend/node_modules/.bin/tsc -b --force tsconfig.app.json` **passe** — c'est la preuve que `mouthVoice.ts` et `habitSlots.ts` sont bien là |
| **coût** | **un petit lot** — mais il exige de trier 141 fichiers non suivis appartenant à plusieurs sessions |
| **risque** | ⛔ **`git stash` est interdit** : dépôt partagé, il emporte les fichiers d'autres sessions. ⛔ Commiter `en.ts`/`fr.ts`/`catalog.ts`/`planRefusals.ts` est interdit. Le tri se fait fichier par fichier, jamais par `git add -A` |

## V0-B — les compteurs cessent de mentir

| | |
|---|---|
| **quoi** | La vue qui pilote le lot 18 arrête d'afficher un succès parfait sur des plans qui n'ont jamais été mesurés. |
| **pourquoi** | Mesuré : **180 plans sur 180 portent `composition_energy_sources = '{}'` et `composition_unknowns = 0`** — les valeurs **par défaut** de la migration, sur des plans tous antérieurs à elle. `composition_fill_weekly` affiche donc `unknowns_median = 0` sur les 6 semaines. C'est très exactement *« un lot désarmé ressemble à un lot qui marche »*, et le rapport du lot 18 §4 annonçait le symptôme sans voir qu'il était déjà là. |
| **dépend de** | rien |
| **bloque** | `V0-D` (le run n'a pas de tableau de bord lisible), `L17`, `L18b`, et toute mesure du taux d'inconnus |
| **fichiers** | nouvelle migration : `alter table student_generated_meals alter column composition_energy_sources drop default, alter column composition_unknowns drop default` **+** `update ... set ... = null where <antérieur au lot>` **+** `create or replace view composition_fill_weekly` avec `where composition_unknowns is not null` |
| **migration** | **oui** — pas de table neuve, donc pas de `revoke` ; `student_generated_meals` est déjà exportée par `account-export-v1` et purgée par la cascade de `profiles`. ⚠️ `create or replace view` **perd `security_invoker`** : le repasser explicitement dans la même migration |
| **mesure AVANT** | `select composition_energy_sources::text, composition_unknowns, count(*) from student_generated_meals group by 1,2` → **une seule ligne : `{}`, `0`, `180`** |
| **direction** | la vue passe de « 6 semaines à médiane 0 » à **« aucune ligne »**. ⛔ **Un tableau de bord vide est le bon résultat** : il dit « rien n'a été mesuré », ce que le 0 disait faussement |
| **mesure APRÈS** | `select count(*) from composition_fill_weekly` → **0** avant le run, **≥ 1 avec une médiane non nulle** après `V0-D` |
| **armé par** | le test SQL qui vérifie que `composition_unknowns` accepte `null` et que la vue l'exclut ; plus une ligne `select reloptions from pg_class where relname='composition_fill_weekly'` qui contient `security_invoker=true` |
| **coût** | **une petite migration** |
| **risque** | rendre la colonne nullable relâche une contrainte : vérifier qu'aucun lecteur ne fait `composition_unknowns > 0` sans garde de nullité |

## V0-C — la fixture obligatoire

| | |
|---|---|
| **quoi** | Un foyer de 4 bouches existe en base, reproductible par un script, et sert de dénominateur à toutes les mesures du plan. |
| **pourquoi** | Mesuré : **la ceinture de régime a tourné sur 13 plans, toujours avec UNE seule bouche à régime déclaré, et n'a jamais refusé**. **`cooking_session_states` est à 0 absolu.** **`condition_ref` est à 0.** **`laneMode` n'apparaît nulle part dans le générateur.** Tout ce que les trois documents décrivent du foyer pluriel est du code **lu**, jamais du comportement **observé**. |
| **dépend de** | `V0-A` (sinon la fixture s'appuie sur du code non versionné) |
| **bloque** | `V0-D`, et la vérification de fin de **chaque** vague |
| **fichiers** | `scripts/` — un script SQL + une amorce d'appel edge. ⚠️ Utiliser des **bouches sans compte** (`household_members` + `household_member_bodies`), jamais 4 comptes : le harnais QA plafonne à 3 sièges d'essai |
| **migration** | non |
| **mesure AVANT** | `select count(*) from households h where (select count(*) from household_members m where m.household_id=h.id) >= 4` → **7 foyers**, mais **0** qui porte simultanément végane + mineur + allergie `medical` + deux objectifs opposés |
| **direction** | exactement **1** foyer remplit les six conditions |
| **mesure APRÈS** | une requête unique qui vérifie les six conditions rend **1 ligne**. Seuil : elle doit rendre 1 après un `psql -f` sur une base fraîche |
| **armé par** | le script est **rejouable** — le relancer deux fois ne crée pas deux foyers (clé naturelle sur le nom du foyer) |
| **coût** | **un petit lot** |
| **risque** | une fixture qui diverge du produit réel mesure autre chose. Chaque champ doit être posé par la **même RPC** que l'écran (`keel_household_add_member`, `keel_household_set_member_body`, `keel_household_add_allergy`), jamais par un `insert` direct |

## V0-D — ⛔ LE RUN RÉEL

| | |
|---|---|
| **quoi** | On génère un plan pour la fixture, en `intent: commit`, et on regarde ce qui arrive en base et à l'écran. |
| **pourquoi** | **Neuf mécanismes n'ont jamais produit une ligne** : `dishes[].boxes` (0/180), `box_sizing.anchor` (0/46), le sas du lot 18 (0), ses 4 compteurs (défauts), la ceinture de régime à plusieurs bouches (0/13), `condition_ref` (0), `cooking_session_states` (0), `laneMode` (invisible), et le modèle de génération réparé le 2026-08-19 (aucun plan depuis). Aucun lot en aval n'est jugeable avant ça. |
| **dépend de** | `V0-A`, `V0-B`, `V0-C` |
| **bloque** | ⛔ **L6′, L9bis, L11, L13, L17, L18b, L20, L22, L26, L38** — et toute mesure avant/après en grammes |
| **fichiers** | aucun, si le run passe. **Le lot EST ce que le run casse.** |
| **migration** | non |
| **mesure AVANT** | `dishes[].boxes` : **0 plan / 180** · `box_sizing.anchor` : **0 / 46** · `food_composition_pending` : **0 ligne** · `composition_fill_weekly` : **0 ligne après V0-B** · `regime_belt` à `mouths > 1` : **0 / 13** |
| **direction** | ⚠️ **La direction attendue est écrite d'avance, et elle n'est pas « ça marche »** : on s'attend à ce que le run **échoue ou sorte incomplet**, et à ce que l'écart nomme les lots réels. Précisément : les boîtes apparaissent (le code les écrit), l'ancrage rend probablement `day_incomplete` (la journée n'est pas calculable à 8 % en solo / 80 % en foyer), et la ceinture de régime mord **pour la première fois** |
| **mesure APRÈS** | **au moins un plan** avec `dishes[].boxes` non vide · `box_sizing.anchor` présent · `composition_fill_weekly` rendant une ligne à médiane **> 0** · `regime_belt.mouths ≥ 2` · les boîtes **visibles à l'écran** (`readBoxes()` rend un tableau non vide) |
| **armé par** | ⛔ Ce n'est pas un test : c'est **une ligne en base**. `select id, jsonb_array_length(dishes->0->'boxes') from student_generated_meals order by created_at desc limit 1` rend un entier **≥ 1** |
| **coût** | **un lot** — le run coûte une génération ; ce qu'il révèle coûte ce qu'il coûte, et **c'est le but** |
| **risque** | ⛔ **Redémarrer `functions serve` avant** — le runtime sert un cache périmé des `_shared`, et un fichier modifié n'est pas rechargé. ⛔ Si un **401 « Invalid JWT »** apparaît, le seul geste autorisé est `./scripts/check-local-jwt-alg.sh` puis lire `docs/keel/JWT-HS256.md` — ne jamais passer une fonction en `verify_jwt = false`. ⚠️ La lane foyer n'a **qu'une relance** et **aucune vérification** : un run raté n'est pas rattrapé, il faut le relire à la main |

## V0-E — le tableau de bord de départ

| | |
|---|---|
| **quoi** | Dix compteurs, une requête, une valeur d'aujourd'hui. C'est le « avant » de toutes les vagues suivantes. |
| **pourquoi** | Plusieurs lots sont **injugeables sans état de départ** — le design le dit et ne le pose nulle part. Et le patron du dépôt (`ANCHOR_REASONS`) est explicite : **toutes** les populations sont comptées, y compris celles qui passent. *« Un compteur qui ne nomme que les refus ne distingue pas la porte qui a laissé passer de la porte qui n'a pas tourné. »* |
| **dépend de** | `V0-B` (sinon deux compteurs mentent) |
| **bloque** | l'évaluation de **toutes** les vagues |
| **fichiers** | `scripts/` — un fichier SQL unique, rejouable, versionné, dont la sortie est datée |
| **migration** | non (des requêtes, pas des objets) |
| **mesure AVANT** | *(voir le tableau ci-dessous — chaque ligne porte sa valeur du 2026-08-21)* |
| **direction** | aucune : c'est la mesure elle-même |
| **mesure APRÈS** | le même fichier, relancé à la fin de chaque vague, dont la sortie est archivée à côté du plan |
| **armé par** | le fichier est **exécuté** en fin de vague, et sa sortie est comparée ligne à ligne. Un compteur qu'on ne relance pas n'est pas un compteur |
| **coût** | **un petit lot** |
| **risque** | ⛔ **Trois pièges de mesure déjà payés** : jamais `grams_raw` en base (**figé à la génération** — la migration `20260819223000:17` le dit) ; toujours **après pliage** (le taux DESCEND : 37,8 % → 28,6 %) ; `coverage` et non `resolved.length` (96 % contre 69 % sur la même assiette) |

### Les dix compteurs, et leur valeur au 2026-08-21

| # | compteur | dénominateur | **valeur aujourd'hui** |
|---|---|---|---|
| 1 | plans portant `dishes[].boxes` | plans | **0 / 180** |
| 2 | journées calculables, **par lane et par langue** | journées composées | foyer **27,9 %** · solo **13,2 %** *(lot 18)* — la coupe **par langue n'a jamais été faite** |
| 3 | lignes d'ingrédient **résolues et pesées** | lignes | foyer **80,1 %** · solo **7,8 %** |
| 4 | motifs d'abstention `missing_quantity` / `unknown` / `no_ingredients` | plats | **533 / 444 / 144** sur 1 821 |
| 5 | inconnus par plan (médiane) | plans | **0** *(défaut, pas mesure — voir V0-B)* |
| 6 | répartition `crossed` / `legacy` / `assumed` du facteur d'activité | bouches | **1 / ? / 87** — la coupe `legacy` reste à écrire |
| 7 | plans dont la ceinture de régime a vu **> 1 bouche** | plans à ceinture | **0 / 13** |
| 8 | `portion_note` portant un grammage | entrées `member_portions` | **181 / 340** |
| 9 | contraintes actives **non couvertes** par le verrou de sortie | contraintes actives | **6 / 58** |
| 10 | bouches sans `birth_date` | bouches · profils | **25 / 88** · **1 193 / 1 312** |

---
---

# VAGUE 1 — LA SÉCURITÉ

> Cette vague ne dépend d'aucune autre et **court en parallèle de la vague 0**.
> Elle ne change aucune assiette. Elle bloque le pilote payant, et rien d'autre.

## S1 — la ligature tue le plancher d'allergie

| | |
|---|---|
| **quoi** | Quelqu'un qui écrit *« je suis allergique aux œufs »* déclenche le plancher déterministe, comme celui qui écrit *« oeufs »*. |
| **pourquoi** | ⛔ **Mesuré en exécutant la fonction** : `safety_constraint_floor.ts` porte sa **propre** `normalize()` (l. 62-78) qui n'a **pas** reçu le repli de ligatures du 2026-08-19, présent dans `allergen_catalog.ts:211-215` et `allergenSlug.ts:105-109`. `"allergique aux œufs"` → `"allergique aux ufs"` → **aucun match, plancher muet**. La locale par défaut du produit est **`fr-FR`**. Le plancher retombe alors sur le tirage du dispatcher — très exactement le défaut qu'il a été écrit pour fermer. |
| **dépend de** | rien |
| **bloque** | `S2` (inutile d'étendre une ceinture dont l'intake est sourd), et le pilote payant |
| **fichiers** | `supabase/functions/_shared/keel/safety_constraint_floor.ts:62-78` (`normalize`) — déplier `œ→oe`, `æ→ae`, exactement comme `allergen_catalog.ts:211-215`. ⛔ **Ne PAS fusionner les deux modules** : le découplage est délibéré et documenté |
| **migration** | non |
| **mesure AVANT** | un test qui appelle la fonction sur les 6 formes de surface × 2 graphies (ligature / digramme) → **les 6 formes à ligature échouent** |
| **direction** | 6/6 passent. ⚠️ **Aucune régression sur le digramme** : les formes `oeufs` doivent continuer de mordre |
| **mesure APRÈS** | 12/12. Plus un balayage du catalogue : toute forme de surface contenant `œ` ou `æ` a un test |
| **armé par** | ⛔ **La garde a besoin d'un cas qui PASSE autant que d'un cas qui MORD** : le test doit contenir une phrase sans allergie qui **ne** déclenche pas le plancher. Sans lui, une garde cassée bloquerait tout et ressemblerait à une garde qui marche |
| **coût** | **une constante** — quelques lignes |
| **risque** | ⛔ **Jamais `unicode_escape`** pour insérer ces caractères : mojibake que ni `tsc` ni la parité n'attrapent. Éditer par numéro de ligne, en UTF-8 |

> ⚠️ **Trouvé au même endroit, et il faut le nommer sans le corriger en passant** :
> `"je suis allergique aux fruits de mer"` ne mord pas non plus — `fruits de mer`
> n'est pas une forme de surface de `shellfish`. Et la base contient **2 lignes
> `allergen_ref = 'fruits_de_mer'`**, dont **une ACTIVE** écrite le 2026-08-04,
> avant que l'alias n'existe. Ajouter la forme de surface est légitime ; **migrer la
> ligne existante est une écriture sur une contrainte de sécurité** et demande une
> décision. Lot **S1b**, gardé à part.

## S2 — la ceinture de sortie couvre `strict`, pas seulement `medical`

| | |
|---|---|
| **quoi** | Une intolérance déclarée `strict` est vérifiée sur les aliments réellement nommés par le modèle, comme une allergie médicale. |
| **pourquoi** | Mesuré : `safety_constraints.ts:580` fait `if (constraint.severity !== "medical") continue;`. **6 contraintes ACTIVES ne sont vérifiées en sortie par rien** — 1 `allergy/strict` (mustard) et 5 `intolerance/strict` (`lactose`, `dairy`, `gluten`, `fructose`, `fruits_de_mer`). Le design le pose lui-même comme la ligne qui décide : *« une préférence est une consigne de prompt sans contrôle en sortie »*. |
| **dépend de** | `S1` |
| **bloque** | `L21` (le dégoût porteur d'apport pose une exigence positive : elle a besoin d'une ceinture qui vérifie) |
| **fichiers** | `supabase/functions/_shared/keel/safety_constraints.ts:580` — élargir à `severity ∈ {medical, strict}` ; `safety_constraints.ts:525` (`safetyConstraintTokens`) ⛔ **ne PAS y ajouter `conditionRef`** (armer sur `diabetes` a bâillonné un message d'urgence en run réel — c'est écrit) |
| **migration** | non |
| **mesure AVANT** | `select severity, count(*) from student_safety_constraints where retracted_at is null group by 1` → `medical 42`, **`strict 18`**, `preference 9`. Contraintes actives hors couverture : **6** |
| **direction** | les 6 entrent sous la ceinture. ⛔ **Et le taux de refus va MONTER** — c'est l'effet recherché, pas une régression. Il faut donc un compteur avant/après, sinon le lot ressemble à une panne |
| **mesure APRÈS** | contraintes actives non couvertes : **0**. Et un compteur `blocked_by_severity{medical,strict}` **persisté** — aujourd'hui `blocked_medical_constraint` n'est écrit qu'en `console.error`, **jamais en base**, donc personne ne sait combien de fois la ceinture a mordu |
| **armé par** | le compteur persisté ci-dessus, **plus** un cas qui PASSE : un plan sans contrainte doit sortir byte-identique |
| **coût** | **un petit lot** |
| **risque** | ⛔ Une ceinture élargie **sans mesure de son taux de refus** peut faire échouer des plans en silence sur une lane (foyer) qui n'a **aucun second essai**. Le compteur n'est pas optionnel |

## S3 — le mineur : rebrancher l'escalade, et fermer l'entrée manquante

| | |
|---|---|
| **quoi** | Un mineur ne traverse plus la porte du chiffre parce que sa date de naissance est absente. |
| **pourquoi** | Deux défauts empilés. ① `escalateMinorStudent` (`student_body_io.ts:452`) a **0 appelant de production** — son seul appelant historique, `generate-week-plan-v1`, a été retiré du dépôt. Il a mordu **une fois, le 2026-08-12 22:53**, jamais depuis. ② `weekPlanAgeGate` **PASSE** sur `status === "absent"` (`{allowed:true, reason:"unknown_birth_date"}`), et **1 193 profils sur 1 312 (91 %) ont `birth_date` NULL**. |
| **dépend de** | rien |
| **bloque** | le pilote payant |
| **fichiers** | `_shared/keel/student_age.ts:199-208` (`weekPlanAgeGate`) · `_shared/keel/student_body_io.ts:452` (`escalateMinorStudent`) · le point de rebranchement est `generate-meal-v1/index.ts` (le successeur de la lane retirée) |
| **migration** | non |
| **mesure AVANT** | `birth_date` NULL : **1 193 / 1 312 profils**, **25 / 88 bouches**. `contract_change_requests` avec `reason_code='minor_student'` : **1**, datée du 2026-08-12 |
| **direction** | ⚠️ **La direction n'est PAS « fermer sur `absent` »**, et c'est le piège. Fermer ferait échouer 91 % des comptes de cette base. La direction est : `absent` ⇒ **le chiffre ne sort pas** (c'est déjà ce que fait le foyer avec `ageState === "unknown"` ⇒ `noSizing("age_unknown")`), **et le plan continue**. La porte du chiffre se ferme, la porte du plan reste ouverte |
| **mesure APRÈS** | un compteur `age_gate{minor, adult, absent}` sur chaque décision — **les trois populations comptées**, y compris celle qui passe. `escalateMinorStudent` a **≥ 1 appelant réel** prouvé par un grep sans commentaires ni tests |
| **armé par** | un test qui **mute** : passer `birth_date` de NULL à une date de mineur doit changer la sortie. Et le compteur `absent` doit être **non nul** dès le premier run (c'est 91 % de la base) |
| **coût** | **un lot** |
| **risque** | ⛔ Fermer sur `absent` au lieu de suspendre le chiffre **bloquerait tout et ressemblerait à une garde qui marche**. Une garde a besoin d'un cas qui passe |

## S4 — la porte d'écriture d'un objectif sur un mineur *(gardé par G4)*

| | |
|---|---|
| **quoi** | Poser un poids visé ou un rythme sur une bouche mineure est refusé par un littéral nommé, à l'écriture. |
| **pourquoi** | Mesuré : `keel_household_set_member_target` refuse sur `not_authenticated`, `no_household`, `not_owner`, `not_a_member`, `target_incomplete`, `bad_target_weight`, `bad_pace`, `target_needs_direction` — **pas un mot sur `birth_date`**. C'est la seule des quatre surfaces du mineur sans garde en base, et **2 bouches mineures portent déjà `fat_loss`/`muscle_gain`**. |
| **dépend de** | ⛔ **PORTE G4** — le design (D4) dit « le champ disparaît du front » ; le code a tranché **l'inverse** le 2026-08-18 (*« un mineur porte les six blocs, comme les autres »*). Ce lot ne se livre pas avant que la contradiction soit rouverte **en la nommant** |
| **bloque** | rien techniquement ; il ferme une surface |
| **fichiers** | la fonction SQL `keel_household_set_member_target` — ajouter `target_not_for_minor` · `frontend/src/keel/components/MouthFormDialog.tsx:102` (le commentaire du renversement) |
| **migration** | **oui** — `create or replace function`, pas de table neuve |
| **mesure AVANT** | `select count(*) from household_members where goal in ('fat_loss','muscle_gain') and birth_date > current_date - interval '18 years'` → **2** |
| **direction** | l'écriture est refusée à l'avenir. ⚠️ **Les 2 lignes existantes ne se corrigent pas par cette migration** — les migrer est une décision produit à part |
| **mesure APRÈS** | la même requête reste à **2** (le passé), et un appel de test rend `target_not_for_minor`. Seuil : le littéral apparaît dans la liste des refus |
| **armé par** | un cas SQL qui MORD (bouche mineure) et un cas qui PASSE (bouche majeure), dans une transaction `rollback` |
| **coût** | **une petite migration** — mais **la porte G4 coûte une décision** |
| **risque** | ⛔ Retirer le champ du front sans fermer la base laisse passer un import, une API ou un futur écran. Fermer la base sans rouvrir D4 met le code et le design en contradiction écrite dans deux endroits |

## S5 — les tables d'allergie du foyer entrent au lifecycle RGPD

| | |
|---|---|
| **quoi** | Les allergies et les aliments interdits d'un foyer sortent avec l'export du compte, et partent avec sa suppression. |
| **pourquoi** | Mesuré : **`household_member_allergies` (7 lignes) et `household_food_restrictions` (6 lignes) ne sont réclamées ni par `account-export-v1`, ni par la suppression, ni par `keel_gdpr_lifecycle_test.ts`.** Ce sont des données de santé. La règle du dépôt exige la réclamation **dans la même migration** que la table ; ces deux-là y ont échappé. |
| **dépend de** | rien |
| **bloque** | le pilote payant |
| **fichiers** | `supabase/functions/account-export-v1/index.ts` (voisinage de la l. 934/983 où le foyer est déjà exporté) · `keel_household_purge_user` · `supabase/functions/keel_gdpr_lifecycle_test.ts` |
| **migration** | **oui** pour la purge (fonction SQL) ; l'export est du code |
| **mesure AVANT** | `grep -c 'household_member_allergies\|household_food_restrictions' supabase/functions/account-export-v1/index.ts` → **0** |
| **direction** | les deux tables apparaissent dans l'export et dans la purge |
| **mesure APRÈS** | un export réel sur la fixture contient les deux tableaux ; une purge réelle les vide. Seuil : **2/2 dans les deux sens** |
| **armé par** | ⛔ **Le test du lifecycle est écrit pour rougir sur une table neuve non réclamée.** S'il ne rougit pas aujourd'hui sur ces deux tables, **c'est le test qu'il faut réparer d'abord** — sinon on ferme deux trous et on laisse la porte ouverte pour le suivant |
| **coût** | **un petit lot** |
| **risque** | l'export d'un membre du foyer par le titulaire expose des données de santé d'un tiers. ⚠️ **La granularité est une décision** : exporte-t-on les allergies des autres bouches dans l'export du maître ? Elle touche P0 |

## S6 — les grants Supabase par défaut, jamais révoqués

| | |
|---|---|
| **quoi** | `anon` cesse d'avoir tous les droits sur les tables qui portent des données personnelles. |
| **pourquoi** | Mesuré via `has_table_privilege` : **`anon` a `SELECT/INSERT/UPDATE/DELETE`** sur `profiles`, `student_generated_meals`, `weekly_reviews`, `substances`, `substance_limits`, `substance_interactions`. Et **`food_groups` va jusqu'à `anon` en S/I/U/D**, `food_items` jusqu'à `authenticated`. `profiles` est le pire : il porte **`birth_date`, l'entrée de la porte mineur**, et ses policies sont écrites `TO public` (donc évaluées pour `anon`) avec une clause `ALL`. |
| **dépend de** | rien |
| **bloque** | le pilote payant |
| **fichiers** | une migration de `revoke` ciblée. ⚠️ `student_safety_constraints` accorde **`DELETE` à `authenticated` sans aucune policy DELETE** : le grant est un résidu, et le modèle voulu est la **rétraction** (trigger `student_safety_constraints_retraction_only`) |
| **migration** | **oui** — `revoke` seulement, aucune table neuve |
| **mesure AVANT** | une requête `has_table_privilege` sur les 8 tables × 2 rôles × 4 droits → **24 droits de trop** |
| **direction** | ⛔ **Ce n'est PAS « tout révoquer »** — RLS est active et des policies dépendent des grants. La direction est : `anon` perd `INSERT/UPDATE/DELETE` partout ; `authenticated` garde ce dont une policy se sert. **`revoke from public` laisse `anon` en place** — vérifier chaque fois avec `has_table_privilege('anon', ...)`, jamais avec l'absence d'un `grant` |
| **mesure APRÈS** | la même requête rend **0 droit d'écriture pour `anon`**. Et le front continue de fonctionner : les 673 tests vitest et un run réel |
| **armé par** | la requête `has_table_privilege` versionnée dans `V0-E`, relancée à chaque vague |
| **coût** | **un lot** — le tri est délicat, chaque révocation doit être éprouvée contre les policies |
| **risque** | ⛔ **Le plus gros risque de régression du plan** : révoquer un droit dont une policy dépend casse une lecture, en silence, et le symptôme apparaît à l'écran, pas dans un test. Ne pas grouper : une table par commit, un run après chacune. ⚠️ `TRUNCATE` échappe à RLS — le vérifier explicitement |

### Fin de vague 1 — vérification en conditions réelles

Sur la fixture, et pas en test : une déclaration d'allergie **avec ligature** écrit
une ligne ; une intolérance `strict` **fait refuser** un plat qui la nomme ; un
export de compte contient les allergies du foyer ; une purge les retire ; `anon`
n'écrit plus nulle part ; et **un plan sans aucune contrainte sort byte-identique à
avant** — c'est le cas qui PASSE, et sans lui aucune de ces gardes n'est prouvée.

---
---

# VAGUE 2 — LA JOURNÉE DEVIENT CALCULABLE

> C'est la vague qui **donne sa portée** à tout ce qui suit. Livrer un lot de
> grammes avant elle, c'est changer le comportement de 8 % des journées solo.

## L19b — appliquer ce que le lot 19 a mesuré

| | |
|---|---|
| **quoi** | Le français cesse d'atteindre un autre aliment que celui qu'on a écrit. |
| **pourquoi** | Trois défauts mesurés et **non corrigés**. ① `complet/complete/complets/completes` est toujours dans `PREPARATION_MODIFIERS` (`food_composition.ts:384-387`), entré le 2026-08-20 « par symétrie » avec `whole` — mais `whole` est protégé en anglais (`wholemeal` est **un seul mot**) et `complet` ne l'est pas : `pain complet grillé` (**7 occurrences réelles**) atteint `white_bread`, **`whole_grain` bascule en `refined_grain` en silence**. **38 réductions latentes changent l'aliment.** ② **19 alias morts** dont le texte est lui-même un **autre slug** — `bySlug` gagne toujours, ils ne se déclencheront jamais (`red onion` dit `onion` et capture `red_onion` : l'un des deux est faux). ③ Les **86 alias vérifiés** du lot 19 sont **absents de la base**. |
| **dépend de** | rien |
| **bloque** | `L17` (une abstention pesée sur un aliment mal résolu pèse le mauvais aliment), la mesure #2 de `V0-E` en français |
| **fichiers** | `_shared/keel/food_composition.ts:384-387` (retirer les 4 formes de `PREPARATION_MODIFIERS`) · une migration d'alias construite depuis `scratchpad/2026-08-21-0111-LOT19-PROPOSITIONS-ALIAS.tsv` (86) et `…-CORRECTIONS-ALIAS.tsv` (9) |
| **migration** | **oui** — `insert`/`update` sur `food_composition_aliases` (table existante, déjà `revoke`d : `anon`/`authenticated` = `f/f/f/f/f`, vérifié) |
| **mesure AVANT** | `pain complet grillé` → `white_bread` (refined, 278 kcal) · `wrap` → `white_bread` dont `unit_grams = 35 g` **une tranche**, donc « 2 wraps » pèse **70 g au lieu de 120** (20 occurrences réelles) · 86 alias absents · **19 alias morts** |
| **direction** | ⬆️ le taux de résolution **français** monte ; le taux **anglais** ne bouge pas (il est déjà à 150/150 sur l'épreuve des noms nus). ⚠️ **Le taux global peut ne PAS bouger** — le corpus vivant ne porte qu'**un** plan français. C'est pourquoi la mesure d'après est une épreuve construite, pas le corpus |
| **mesure APRÈS** | rejouer l'épreuve des **150 paires de noms nus** de `2026-08-21-0111-LOT19-mesure/nom-nu.txt` : FR passe de **124/150 (82,7 %)** à **≥ 145/150**, EN reste à **150/150**. Écart FR/EN : de **17,3 points** à **≤ 4 points** |
| **armé par** | les **cinq épreuves automatiques** du lot 19 (`09-verifier-propositions.ts`) : la ligne visée existe · l'alias n'existe pas déjà · **il n'est pas mort** (une forme qui est aussi un slug ne se déclencherait jamais) · on sait ce qu'il déplace · après ajout il atteint bien la ligne visée. ⛔ **Elles ont déjà écarté 3 propositions et révélé un alias existant FAUX** — elles ne sont pas décoratives |
| **coût** | **un lot** — les 86 sont vérifiés ; ⛔ **on ne livre PAS les 4 800 qu'il faudrait pour atteindre 8 formulations/aliment** : *« un alias plausible non vérifié est un alias faux pas encore découvert »* |
| **risque** | ⛔ **Un mauvais alias remplace un aliment par un autre, pour tout le monde, définitivement — et ça ne ressemble pas à un bug, ça ressemble à une donnée.** ⚠️ Deux faux amis restent **irréparables par un alias** : `prune` (le slug est le fruit SEC, 229 kcal ; la prune fraîche fait 46 — **×5**) et `pate` (le slug est le PÂTÉ, 325 kcal, groupe `red_meat`). **Seul un renommage de slug répare**, et c'est un lot à part |

## L-1 — `unit_grams` sur les lignes que les plans atteignent vraiment

| | |
|---|---|
| **quoi** | Un aliment écrit sans quantité structurée cesse d'éteindre le calcul de tout son plat. |
| **pourquoi** | `unit_grams` est posé sur **72 lignes sur 923 (7,8 %)**. Un aliment **connu sans masse d'usage éteint le calcul du plat entier** — la porte est binaire (`plan_energy.ts:232-238` : zéro terme non résolu **et** zéro terme non pesé). Mesuré : `missing_quantity` est le **premier** motif d'abstention (533 plats), devant l'inconnu (444), et il **monte à 866** une fois le lot 18 livré. Les vingt premiers termes sont des aliments que le référentiel connaît **parfaitement** : `olive oil` ×242, `garlic` ×167, `pepper` ×149, `lemon` ×138, `onion` ×105. |
| **dépend de** | `L19b` (poser `unit_grams` sur une ligne qu'un alias va déplacer est du travail perdu) |
| **bloque** | `L17` et toute la vague 4 |
| **fichiers** | une migration d'`update` sur `food_composition_refs.unit_grams`, **ciblée sur les lignes que les plans vivants atteignent** — pas les 923 |
| **migration** | **oui** — table existante |
| **mesure AVANT** | `unit_grams` non nul : **72 / 923**. `condiment_grams` : **17 / 923**. Lignes résolues et **non pesées** malgré la convention des condiments : **2 523 / 9 810 (25,7 %)** |
| **direction** | ⬆️ les journées calculables montent. ⚠️ **La direction n'est PAS symétrique entre les lanes** : le foyer est déjà à 87,6 % de pesée, le solo à **11,2 %**. Le gain sera très majoritairement **solo** — et une part vient de trois générations de prompt mortes (`meal.en.v1_doctrine`, `v2_batch`, `v3_preparations`, qui écrivent **100 %** de leurs ingrédients sans `amount` ni `unit`). **Mesurer sur les plans du 2026-08-12 ou après**, où le solo remonte à 58,3 % |
| **mesure APRÈS** | lignes résolues et non pesées : de **25,7 %** à **≤ 15 %**. Journées calculables solo (plans récents) : de 58,3 % vers **≥ 70 %** |
| **armé par** | le compteur #3 de `V0-E`, coupé **par lane** et **par génération de prompt** — sinon le gain d'un corpus qui se renouvelle se confond avec le gain du lot |
| **coût** | **un lot** — une valeur par ligne, sur ~200 lignes atteintes |
| **risque** | ⚠️ Une masse d'usage fausse **pèse** au lieu de s'abstenir : l'erreur passe de « je ne sais pas » à « je crois savoir ». C'est le sens le plus difficile à détecter. Les valeurs doivent porter leur source, comme les prix du lot 30 |

## L17 — l'abstention se PÈSE au lieu de compter *(gardé par G2)*

| | |
|---|---|
| **quoi** | Un ingrédient dont on ignore la masse ne fait plus tomber la journée s'il ne peut pas peser lourd. |
| **pourquoi** | La règle : *« on s'abstient quand l'énergie NON RÉSOLUE dépasse une part de la cible (~5 %). Jamais parce qu'un ingrédient manque. »* Le groupe déclaré **borne** même un inconnu : 12 g de « légume » vaut 1 à 12 kcal (0,4 % d'une journée) ; 130 g de « viande » vaut 105 à 962 (jusqu'à 34 %). Le dépôt connaît déjà ce gain à moitié — *« la porte s'abstenait sur du sel »*, 69 % → 96 %. |
| **dépend de** | `L19b`, `L-1`, et ⛔ **PORTE G2** |
| **bloque** | toute la vague 4 (c'est elle qui donne sa portée aux lots de grammes) |
| **fichiers** | `_shared/keel/plan_energy.ts:225-238` (`dishEnergy`, la porte binaire) · `_shared/keel/food_composition.ts` (les bandes par groupe existent déjà : `food_composition_group_bands`, 24 groupes bornés) |
| **migration** | non — les bandes sont déjà en base (lot 18) |
| **mesure AVANT** | plats s'abstenant : **1 821** au total, dont `missing_quantity` **533** et `unknown_ingredient` **444**. ⛔ **Et `food_group_ref` déclaré sur une ligne d'ingrédient : 0 sur 9 810** — la borne par groupe n'a **aucune entrée** aujourd'hui |
| **direction** | ⬆️ journées calculables. ⚠️ **Direction NÉGATIVE attendue sur un second compteur, et il faut l'écrire d'avance** : le résidu non résolu **entre** dans le calcul comme une borne, donc la part d'énergie « venant d'une borne » monte de 0 à quelque chose. Elle doit être **comptée séparément** (`group_bounds`, le cinquième seau du lot 18) et **ne jamais être fondue** dans `model` — un point de rupture ressemblerait à un fonctionnement |
| **mesure APRÈS** | journées calculables foyer de **27,9 %** vers **≥ 45 %** ; solo de **13,2 %** vers **≥ 30 %**. Et `share_group_bounds` **non nul** dans `composition_fill_weekly` |
| **armé par** | `composition_fill_weekly.share_group_bounds` — le compteur existe déjà, il ne s'est jamais rempli. ⛔ Plus un test qui **mute le seuil** : passer 5 % à 0 % doit faire retomber le taux à sa valeur d'avant |
| **coût** | **un lot** |
| **risque** | ⛔ **Sans la porte G2, ce lot est désarmé et ressemble à un lot qui marche.** La borne par groupe exige un `food_group_ref` déclaré sur la ligne d'ingrédient ; il y en a **0 sur 9 810**, parce que `FOOD_GROUP_DECLARATION_BLOCK` ne voyage qu'avec la ligne de régime — et `dietary_regime.ts` écrit noir sur blanc pourquoi, avec **un test qui tient la promesse d'un prompt byte-identique**. C'est le geste n°1, et c'est une **décision produit**, pas un effet de bord |

## L18b — armer le repli du lot 18, et lancer sa promotion

| | |
|---|---|
| **quoi** | Le sas des inconnus se remplit, et les lignes vues trois fois entrent au référentiel. |
| **pourquoi** | Le lot 18 est livré et câblé sur les deux lanes — et **son sas est à 0 ligne**, ses 4 compteurs portent leurs valeurs par défaut, `promote_pending_food_compositions()` a **0 appelant sur les 22 crons**, et son **repli est structurellement mort** (voir G2). |
| **dépend de** | `V0-D` (le run), `L17` (le repli partagé), **PORTE G2** |
| **bloque** | rien — il consolide |
| **fichiers** | `_shared/keel/composition_fill_io.ts` · la promotion : ⛔ **le cron demande `supabase secrets`/`config push`, interdits.** Le plan **donne la commande, il ne la lance pas** |
| **migration** | non |
| **mesure AVANT** | `food_composition_pending` : **0 ligne**. `composition_fill_weekly` : 6 semaines, `unknowns_median = 0` partout, `share_*` **NULL** |
| **direction** | ⬇️ `unknowns_median` doit **baisser semaine après semaine**. ⛔ **S'il ne baisse pas, la table ne se remplit pas et on paie un appel de plus pour rien** — c'est le seul chiffre qui dise si le lot réussit |
| **mesure APRÈS** | `food_composition_pending` **> 0** après le run · `unknowns_median` en baisse sur deux semaines consécutives |
| **armé par** | `composition_fill_weekly`, une fois `V0-B` livré. Et la règle structurelle du lot 18 : `withFilledRefs` ne fait qu'un `bySlug.set`, **`byAlias` est le même objet en sortie qu'en entrée** (assertion d'identité dans le test) |
| **coût** | **un petit lot** |
| **risque** | ⛔ **Aliment NEUF, jamais un alias vers un existant** — `laitue` → `lait`, 12 faux positifs sur 12. C'est tenu structurellement aujourd'hui ; **ne pas le relâcher**. ⚠️ La promotion se lance à la main tant qu'il n'y a pas de cron : `select * from promote_pending_food_compositions(3, true);` puis `(3, false)` |

## L-C — les 131 lignes cuites lues comme du cru

| | |
|---|---|
| **quoi** | Une ligne dont le libellé dit « braisé » cesse d'être facturée comme si elle était crue. |
| **pourquoi** | Mesuré : **131 lignes sur 923** portent un libellé d'état cuit ; **130 ont `yield_class = 'neutral'`**, donc `YIELD_FACTORS.neutral = 1.0` et `gramsRawOf` **ne reconvertit rien**. `Beef, braised` porte **240 kcal/100 g cuits** dans une table que le runtime lit comme du cru. Le lot 30 a **réparé le prix** de ces lignes et l'a écrit : *« le prix est réparé, la calorie non »*. Le cas inverse existe aussi : `noodles` à **104 kcal** en `grain_absorbs` compte une portion **×3,3 trop légère**, et **bloque** l'alias `egg noodles` (11 occurrences). |
| **dépend de** | `L19b` (les deux touchent le référentiel ; une seule migration de référentiel à la fois) |
| **bloque** | la justesse de toute la vague 4 |
| **fichiers** | migration d'`update` sur `food_composition_refs` — reprendre le **classement déjà fait par le lot 30** : 101 `cooked_label_dry_input`, 28 `as_purchased`, 1 à rendement non neutre, **+ 12 lignes re-basées qu'aucun `grep` ne trouvait** (« Carrots, puree », « Mashed potatoes », « Noodles », « Bread, home-made ») |
| **migration** | **oui** |
| **mesure AVANT** | 131 lignes à libellé cuit, **130 en `neutral`**, énergie moyenne **135 kcal/100 g**. `noodles` = 104 kcal en `grain_absorbs` |
| **direction** | ⚠️ **Le sens de la correction dépend de la ligne** — vers le haut pour une viande braisée facturée cuite, vers le bas pour des nouilles. **Il n'y a donc pas UNE direction** : il y a une direction **par classe**, et elle doit être écrite classe par classe avant l'`update` |
| **mesure APRÈS** | 0 ligne à libellé cuit en `yield_class = 'neutral'` sans traitement explicite. Et l'énergie d'un plat de référence (200 g de bœuf braisé) recalculée à la main **avant** et **après** |
| **armé par** | ⛔ **Le lot 30 a mesuré que l'automatisation rate** : 12 lignes n'ont **aucun mot-clé de cuisson** dans leur libellé et ont dû être lues une par une. **Aucun rapprochement automatique**, un test qui liste les 131 et refuse qu'une ligne y entre sans décision |
| **coût** | **un lot** — 143 décisions à la main, mais le lot 30 en a déjà fait le classement |
| **risque** | ⚠️ **689 lignes sur 923 se déclarent `source='ciqual'` sans `ciqual_code` ni `ciqual_name`** : pour elles, « vérifier contre la source » est **impossible**. Reconstituer les codes de l'import est le préalable de toute correction en masse — c'est un lot à part, plus gros que celui-ci |

### Fin de vague 2 — vérification en conditions réelles

Un run sur la fixture **en français** et un **en anglais**, et le compteur #2 de
`V0-E` coupé par langue. ⛔ **C'est la première fois que ce chiffre existe** — le
lot 19 le nomme comme sa mesure manquante n°1 (*« dix générations en fr-FR, foyer
et solo ; rien d'autre ne la remplace »*), parce qu'il n'y a **qu'un seul plan
français** dans tout le corpus.

---
---

# VAGUE 3 — LES ENTRÉES DU MOTEUR EXISTENT

> Un moteur dont les entrées sont vides ne se règle pas : on règle son repli. Cette
> vague fait exister ce que la vague 4 va lire.

## L6′ — la boîte v4 atteint la base ET l'écran

| | |
|---|---|
| **quoi** | Un plan de foyer rend enfin des contenants à l'écran, et chaque bouche voit le sien. |
| **pourquoi** | Mesuré : **`dishes[].boxes` absent des 1 821 plats des 180 plans**. Les 56 plans qui portent des boîtes les portent sous `preparations[].boxes`, **l'ancien emplacement**, que le lecteur front **refuse explicitement** d'aller chercher (`api/mealGeneration.ts:1029` : *« ces plans-là n'ont pas de table de pesée, et l'écran se tait »*). ⇒ **Aucun des 102 plans foyer ne rend une seule boîte.** `docs/keel/BOITES-PAR-REPAS.md` dit lui-même en tête que la v3 n'a jamais été construite ; la mesure va plus loin : **la v4 non plus n'a laissé aucune trace lisible**. |
| **dépend de** | `V0-D` — ⛔ **ce lot est CE QUE LE RUN CASSE.** Son contenu exact n'est pas connaissable avant |
| **bloque** | ⛔ `L9bis` · `L11★` · `L13` · `L20` · `L26` · `L38` · le filtre v4 de `portion_note` · toute mesure en grammes |
| **fichiers** | `_shared/keel/meal_generation.ts:6606` (`mealDishesPayload`, écrit déjà `boxes`) · `_shared/keel/household_portions.ts:2790` (`sizeBoxesFromTarget`) · `frontend/src/keel/api/mealGeneration.ts:1054` (`readBoxes`) · `frontend/src/keel/lib/planDaySlots.ts:321` · `frontend/src/keel/components/plan/BoxTable.tsx` |
| **migration** | probablement non ; ⚠️ **à confirmer après le run** — le journal `generated_from.household.boxes` dit `boxes: 12/20/32` sur 51 plans, mais **je n'ai pas retrouvé où ces contenants ont été écrits**. Il y a un écart journal/persistance non fermé |
| **mesure AVANT** | `dishes[].boxes` : **0 / 180** · `dishes[].box` (repli v2) : **0 / 180** · `preparations[].boxes` : **56 / 180** · journal `boxes` : **51 plans** · boîtes rendues à l'écran : **0** |
| **direction** | ⬆️ le plan de la fixture porte `dishes[].boxes` avec `items[]` et `member_ids[]`. ⚠️ **Le nombre attendu n'est pas 3** : c'est **3 PAR REPAS** — `boîtes = Σ sur chaque repas (groupes présents)`. Sur 5 jours × 2 repas cuisinés, **30 contenants**, pas 3. Le cas 08 §5③ le nomme ; l'écrire d'avance évite de lire un succès comme une explosion |
| **mesure APRÈS** | ≥ 1 plan avec `jsonb_array_length(dishes->0->'boxes') ≥ 1` · `readBoxes()` rend un tableau non vide · le filtre de `portion_note` **retire enfin des lignes** (aujourd'hui : 0 sur 340) |
| **armé par** | la ligne en base **et** un test front qui monte `BoxTable` avec `context="dish"` : ⛔ **il ne doit afficher AUCUN gramme** (le contenant EST la portion) ; `context="session"` en affiche, alignés en `tabular-nums`. `context` est **requis, jamais optionnel** — un défaut remettrait des grammes sur toute carte dont l'appelant oublie la prop |
| **coût** | ⚠️ **inconnu avant le run.** Entre « un petit lot » (le code marche, il n'a jamais tourné) et « un lot » (le run révèle un écart journal/persistance) |
| **risque** | ⛔ **PORTE P0** — la boîte nominative est très exactement ce que la qualification juridique garde. ⛔ **PORTE G5** — 181/340 `portion_note` portent déjà un grammage par bouche lisible par tout le foyer ; faire exister la boîte **sans** trancher G5 laisse le gramme à deux endroits, dont un qui n'a pas de destinataire |

## X2 — épingler les six constantes d'ancrage

| | |
|---|---|
| **quoi** | Changer une constante d'ancrage fait rougir un test. |
| **pourquoi** | Mesuré : les **35 tests** de `mouth_anchor_test.ts` **importent** les constantes qu'ils vérifient et recalculent l'attendu avec elles (`:212`, `:244`, `:249`, `:486`, `:369`, `:463`, `:508`, `:545`, `:560`, `:588`, `:610`). **Changer `COMPOSED_DISH_MEAL_SHARE` de 0,42 à 1,0 ne rougit rien.** Aucun `assertEquals(<CONSTANTE>, <littéral>)` dans le fichier. Le dépôt sait le faire : `meal_boxes_test.ts:841` épingle `BOX_SUM_TOLERANCE_RATIO === 1.1`. |
| **dépend de** | rien |
| **bloque** | ⛔ `L11★`, `L9bis`, `L1`, `L37`, `L38` — **aucun lot qui change une de ces constantes n'est livrable avant** |
| **fichiers** | `_shared/keel/mouth_anchor_test.ts` — ajouter six `assertEquals(<CONSTANTE>, <littéral>)` pour `ANCHOR_FACTOR_MIN` (0,60), `ANCHOR_FACTOR_MAX` (3,00), `MEAL_MAX_GRAMS_PER_KG` (8), `COMPOSED_DISH_MEAL_SHARE` (0,42), `COMPOSED_DISH_KCAL` (300), `SLOT_DAY_WEIGHT` |
| **migration** | non |
| **mesure AVANT** | muter chaque constante et relancer `deno test _shared/keel/mouth_anchor_test.ts` → **6 mutations sur 6 restent vertes** |
| **direction** | 6 mutations sur 6 rougissent |
| **mesure APRÈS** | ⛔ **La preuve est une MUTATION, pas un run vert.** Un test qu'on n'a pas vu rougir n'est pas un test |
| **armé par** | le journal de mutation, archivé à côté du plan : constante · valeur mutée · test qui rougit |
| **coût** | **une constante** — quelques lignes |
| **risque** | aucun. C'est le lot au meilleur rapport du plan |

## X1 — la constante déclarée trois fois

| | |
|---|---|
| **quoi** | Le refus d'un poids visé aberrant est le même partout. |
| **pourquoi** | `TARGET_WEIGHT_KG_MIN = 25` / `MAX = 400` est déclaré dans **`weight_pace.ts:588-589`**, **`energy_target.ts:213-214`**, et une troisième fois sous `WEIGHT_KG_MIN/MAX` dans **`weekly_flow.ts:92-93`**. `weight_pace.ts:583-586` porte le commentaire *« importées, elles restent le même refus »* — **et le fichier ne les importe pas** : il n'a que trois imports, aucun vers `energy_target.ts`. **Aucun test ne compare les trois paires.** |
| **dépend de** | rien |
| **bloque** | rien — mais c'est une bombe à retardement |
| **fichiers** | `_shared/keel/weight_pace.ts:588-589` (importer au lieu de redéclarer) · `_shared/keel/weekly_flow.ts:92-93` |
| **migration** | non |
| **mesure AVANT** | 3 déclarations, 0 test de cohérence. Valeurs **identiques aujourd'hui** — donc le défaut est **invisible** |
| **direction** | 1 déclaration, 2 imports. Aucun changement de comportement |
| **mesure APRÈS** | `grep -c 'TARGET_WEIGHT_KG_MIN\s*=' supabase/functions/_shared/keel/` → **1** |
| **armé par** | ⚠️ Si l'import est impossible (cycle de modules), le patron du dépôt existe déjà : `energy_target_test.ts:239` **lit le fichier du front** et refuse la divergence. Le reproduire |
| **coût** | **une constante** |
| **risque** | un cycle d'import. Le cas échéant, le test de divergence suffit |

## L16 — le repli d'activité n'est pas un cas limite, c'est le produit

| | |
|---|---|
| **quoi** | On sait combien de bouches sont dimensionnées sur une hypothèse plutôt que sur une réponse. |
| **pourquoi** | Mesuré : **1 bouche sur 88** porte un `day_activity` ou un `sport_frequency`. Les deux axes croisés sont **livrés** (`crossedActivityFactor`, dérivé de FAO/WHO/UNU 2004) et **personne ne les remplit**. Le repli `ACTIVITY_FACTOR = 1,5` se trompe **vers le bas** : +3 % sur un sédentaire (1,45), **−42 %** sur un métier physique à 5 séances (2,13). Et l'écran **demande** l'activité mais **ne retient jamais dessus** — `own_activity_level` est absent de `canGenerateMisses`, donc ses phrases de blocage sont **inatteignables**. |
| **dépend de** | rien |
| **bloque** | `L11★` et toute la vague 4 : un facteur d'activité faux déplace la cible avant tout le reste |
| **fichiers** | `_shared/keel/meal_envelope.ts:135` (`ACTIVITY_FACTOR`), `:236` (`DAY_ACTIVITY_BASE`), `:286` (`crossedActivityFactor`) · `frontend/src/keel/pages/SetupPage.tsx` (`peopleStepBlockers`) |
| **migration** | non |
| **mesure AVANT** | source du facteur : `crossed` **1** · `assumed` **87** · `legacy` **la coupe reste à écrire** (`ACTIVITY_FACTORS` à 4 valeurs vit encore à côté de `DAY_ACTIVITY_BASE` à 3) |
| **direction** | ⚠️ **La direction n'est PAS « corriger la valeur du repli ».** C'est ① **mesurer** la répartition `crossed`/`legacy`/`assumed`, ② décider si l'activité **retient** l'entonnoir. ⛔ Corriger 1,5 « vers le bas » aggraverait le seul cas qui casse |
| **mesure APRÈS** | la répartition existe et est journalisée sur chaque plan. Puis, **et seulement si l'écran retient** : `crossed` **≥ 50 %** des bouches nouvelles |
| **armé par** | le compteur #6 de `V0-E`, avec ses **trois** populations comptées — y compris celle qui passe |
| **coût** | **un petit lot** pour la mesure · **un écran** si l'activité doit retenir |
| **risque** | ⛔ Faire retenir l'entonnoir sur l'activité **ferme le couloir d'entrée** à des comptes qui passent aujourd'hui. La décision du 2026-08-19 (allergies, régime et moments ne retiennent plus) allait dans l'autre sens, **avec un arbitrage écrit**. Le renverser demande de le nommer |

## E1 — les trois cases de structure n'atteignent pas la lane solo

| | |
|---|---|
| **quoi** | Un compte solo cesse de répondre à trois questions qui ne changent rien. |
| **pourquoi** | Mesuré : `takes_dessert` / `takes_cheese` / `takes_bread` sont écrits en base par les deux chemins, mais lus **uniquement** par `generate-household-meal-v1/index.ts:1990`. **Zéro occurrence dans `generate-meal-v1`.** Or ce sont exactement les trois cases dont `composedDishShare` dépend — et elles ne sont tranchées que sur **2 fiches sur 43**. |
| **dépend de** | rien |
| **bloque** | `L11★` — retirer le 0,42 sans que la lane solo lise les cases remplace un repli par un autre |
| **fichiers** | `supabase/functions/generate-meal-v1/index.ts` (brancher la lecture, sur le patron de `generate-household-meal-v1:1990`) · `_shared/keel/mouth_anchor.ts:319` (`mealStructureState`) |
| **migration** | non |
| **mesure AVANT** | `grep -c 'takes_dessert' supabase/functions/generate-meal-v1/` → **0**. Fiches à trois cases tranchées : **2 / 43** |
| **direction** | la lane solo lit les cases. ⚠️ **Le taux de 2/43 ne bouge pas** : ce lot rend la question utile, il ne la fait pas remplir |
| **mesure APRÈS** | le compteur `meal_structure` (déjà écrit côté foyer, `index.ts:5279`) apparaît **aussi** sur les plans solo |
| **armé par** | l'histogramme `meal_structure` sur un plan solo de la fixture |
| **coût** | **un petit lot** |
| **risque** | ⚠️ Si `E1` est livré et que `L11★` ne l'est pas, la lane solo se met à appliquer 0,42 là où elle ne l'appliquait pas — **un changement de grammes non intentionnel**. Les deux se livrent dans le même train, ou `E1` attend |

### Fin de vague 3 — vérification en conditions réelles

Un run sur la fixture qui rend des boîtes **visibles**, un `box_sizing.anchor`
**présent**, et les six mutations de `X2` qui **rougissent**. ⛔ Tant que ces trois
choses ne sont pas vraies, **aucun lot de la vague 4 ne se livre** : on ne peut pas
mesurer un déplacement de grammes sur un moteur qui s'abstient.

---
---

# VAGUE 4 — LES GRAMMES BOUGENT

> Chaque lot de cette vague porte une **direction écrite d'avance**. Un lot qui
> change des grammes sans mesure préalable n'est pas exécutable, et écrire la
> direction **après** avoir vu le résultat n'est pas une mesure, c'est une
> justification.

## L11★ — les six moments, le forfait, et la mort de `composedDishShare`

> ⛔ **UN SEUL LOT.** Le design les numérote 22, 25 et 11 ; ils touchent trois
> constantes **voisines du même fichier** et **un seul dénominateur**. Séparés, ils
> arment un double comptage — c'est écrit au §2.6 du design, et c'est le piège que
> ce plan refuse de répéter.

| | |
|---|---|
| **quoi** | La journée cesse d'être découpée en trois moments sur six, le fromage et le dessert sont **comptés sans être prescrits**, et l'assiette cesse de ne porter que 42 % du repas. |
| **pourquoi** | Trois défauts qui se tiennent. ① `EATING_OCCASIONS` porte **six** moments, `SLOT_DAY_WEIGHT` n'en pèse que **trois** — un shaker l'après-midi apporte de l'énergie en comptant pour zéro, donc **un facteur trop petit, systématiquement, dans le sens qui sous-nourrit**. ② `COMPOSED_DISH_MEAL_SHARE = 0,42` fait croire au moteur que l'assiette porte moins de la moitié du repas : **1 100 kcal au lieu de 2 600** sur la journée du cas travaillé. ③ Sans forfait, retirer le 0,42 **prescrirait** un dessert à quelqu'un qui a seulement dit qu'il en mangeait — la ligne produit que la décision du 2026-08-21 a refermée. |
| **dépend de** | `V0-D`, `L6′` (sans boîtes, rien de tout ça ne s'exécute), `X2` (sinon aucun test ne rougit), `L16`, `E1`, `L17` (pour la portée) |
| **bloque** | `L9bis`, `L12`, `L13`, `L38` |
| **fichiers** | `_shared/keel/mouth_anchor.ts:399` (`SLOT_DAY_WEIGHT` → 6 poids + une `nature`), `:207` (`COMPOSED_DISH_MEAL_SHARE`), `:261` (`MEAL_COMPONENT_KCAL = {dessert:120, cheese:120, bread:80}`), `:349` (`composedDishShare`), `:418` (`dayCoverageOf`) · le bloc de prompt qui porte la **nature** du moment |
| **migration** | non |
| **mesure AVANT** | `composedDishShare` rend **0,42 pour 41 fiches sur 43** · `SLOT_DAY_WEIGHT` = `{breakfast:0.25, lunch:0.40, dinner:0.35}` · ⛔ **et la valeur d'aujourd'hui des grammes servis est INCONNUE** — la chaîne n'a jamais tourné. **Le « avant » est donc le run de `V0-D`, pas la base** |
| **direction** | ⬆️ **les grammes montent, d'un facteur proche de ×2,4 sur les fiches muettes**, et c'est l'effet recherché. ⚠️ **Propriété de non-régression à tester** : le cas à trois moments déclarés doit retomber sur les valeurs actuelles — `0,22/0,82 = 0,268` · `0,32/0,82 = 0,390` · `0,28/0,82 = 0,341`, contre 0,25 / 0,40 / 0,35 aujourd'hui. **Le changement ne déplace quasiment rien pour la majorité** : c'est ce qui le rend livrable |
| **mesure APRÈS** | grammes servis par bouche sur la fixture, avant/après, **plat par plat**. Et le facteur d'ancrage : il doit **s'éloigner** de `ANCHOR_FACTOR_MAX`, pas s'y coller. ⛔ **Si les trois bouches sortent toutes exactement au plafond, le lot a reproduit le défaut qu'il corrige** — c'est ce qui est arrivé au run réel précédent (trois bouches-jours, toutes à ×1,600 exactement) |
| **armé par** | ① les six mutations de `X2` ; ② un compteur des **six** moments avec leur nature ; ③ ⛔ **la règle anti-double-comptage** : une occasion couverte par une habitude résolue **sort du dénominateur** de `dayCoverageOf` et **ne se soustrait pas en plus**. Un test qui pose un shaker à 16 h 30 et vérifie qu'il n'est retiré **qu'une fois** |
| **coût** | **un lot** — trois constantes, un dénominateur, un bloc de prompt |
| **risque** | ⛔ **Le lot le plus dangereux du plan** (§3). Un doublement de portion, sur une lane sans vérification ni second essai, sans ceinture (`MEAL_MAX_GRAMS_PER_KG` retombe sur `Infinity`), et sans « avant » auquel comparer. ⚠️ **La NATURE du moment est aussi importante que son poids** : sans elle, le modèle composera des choux de Bruxelles à 16 h, et le grammage aura beau être juste, personne ne le mangera |

## L9bis — une porte, deux critères, deux portées

| | |
|---|---|
| **quoi** | Un plat trop dilué est refusé et recomposé ; une journée trop pauvre en protéines aussi. |
| **pourquoi** | ⛔ **La borne actuelle ne refuse pas : elle rabote.** `physicalMax` plafonne le **facteur**, il ne rejette pas le plat — la soupe de 2 508 g n'est pas renvoyée au modèle, elle est **servie plus petite, sous la cible. La personne est sous-nourrie, en silence.** Et `MEAL_MAX_GRAMS_PER_KG = 8` suit le **poids total** : 880 g pour 110 kg, 584 g pour 73 kg. **L'estomac ne grossit pas avec la masse grasse — la règle est la plus permissive exactement là où on voudrait qu'elle serre.** Côté protéine : `grep 'per_1000\|proteinDensity\|protein_per_kcal'` dans `_shared/keel` → **0 résultat**, et `PROTEIN_FLOOR_G_PER_KG` a **3 lecteurs dont 2 sans appelant**. |
| **dépend de** | `L6′`, `X2`, `L11★`, `L17` (portée), **PORTE P1** |
| **bloque** | `L38`, `L13`, `L21` |
| **fichiers** | `_shared/keel/mouth_anchor.ts:169` (retirer `MEAL_MAX_GRAMS_PER_KG`), `:671` (remplacer le terme `physicalMax`) · une porte de composition nouvelle · `_shared/keel/protein_anchor.ts` (**mesurer d'abord s'il mord**) |
| **migration** | non |
| **mesure AVANT** | ⛔ **`protein_anchor.ts` mord-il, ou est-ce un lecteur sans écrivain ? Personne ne l'a mesuré.** C'est la première chose à faire, avant d'écrire une ligne. Puis : combien de plats de la fixture sont sous `0,8 kcal/g` ; combien de journées sous `37 g/1 000 kcal` |
| **direction** | ⬇️ le nombre de plats servis « plus petits que la cible » tombe à **0** — ils sont refusés et recomposés, pas rabotés. ⬆️ le nombre de recompositions monte (c'est le coût assumé). ⚠️ **Le plancher de densité n'a besoin d'AUCUNE donnée de corps** : il ferme au passage le trou de `physicalMax = Infinity` quand `weightKg = 0` |
| **mesure APRÈS** | plats servis sous la cible sans refus : **0**. Compteur de recomposition **non nul**. ⛔ **Deux portées, pas une** : densité `≥ 0,8 kcal/g` jugée **par repas** (une assiette de 2,5 kg ne se rattrape pas le lendemain) ; protéine `≥ 37 g/1 000 kcal` jugée **par jour** (un petit-déjeuner sucré tombe toujours sous le seuil et un dîner riche le rattrape). Écrire « la porte juge le repas » armerait le second au mauvais étage |
| **armé par** | un compteur des refus **et** des passages, plus un test qui compose une soupe de 2 kg et vérifie qu'elle est **refusée**, pas rabotée |
| **coût** | **un lot** |
| **risque** | ⛔ **La lane foyer n'a AUCUN second essai** : un refus n'y est rattrapé par personne. Livrer la porte côté foyer sans une relance, c'est transformer un plat médiocre en absence de plat. ⚠️ Le verdict protéique **ne peut pas se fermer à la génération** dès qu'une occasion **estimée** existe : il a deux moments, provisoire puis définitif — sans quoi il rend un vert qui ne veut rien dire |

## L1 — le poids de référence protéique est plafonné *(sans jamais nommer l'IMC)*

| | |
|---|---|
| **quoi** | Une personne corpulente cesse de recevoir une cible protéique calculée sur son poids total. |
| **pourquoi** | Le plancher `2,0 g/kg` descend de Helms 2014, qui parle en **masse maigre**. La même règle donne 2,35 g/kg de masse maigre à quelqu'un de mince (le plancher de la source) et **3,33 à quelqu'un de corpulent** — au-dessus de son plafond. Plafonner le **poids de référence** referme **~72 % du biais** (220 g → 173 g, soit 3,33 → 2,62 g/kg de masse maigre) et c'est **une ligne de code**. |
| **dépend de** | `X2` |
| **bloque** | rien |
| **fichiers** | `_shared/keel/meal_envelope.ts` — `PROTEIN_FLOOR_G_PER_KG`, `SENIOR_PROTEIN_FLOOR_G_PER_KG` |
| **migration** | non |
| **mesure AVANT** | ⛔ **La porte n'existe pas.** `PROTEIN_FLOOR_G_PER_KG` n'est indexé que sur l'objectif ; le seul modificateur est le senior, et il **élève**. Les fiches 01 à 07 écrivent *« IMC 21,1, donc pas de plafond »* comme si une porte était franchie : **elle n'existe pas**, et le cas 08 §0 ② le corrige |
| **direction** | ⬇️ la cible protéique baisse **chez les corps corpulents uniquement**, et ne bouge pas ailleurs |
| **mesure APRÈS** | sur trois corps témoins (mince, moyen, corpulent), la cible protéique avant/après. Seuil : elle ne bouge que sur le troisième |
| **armé par** | un test à trois corps, avec la valeur attendue **en littéral** |
| **coût** | **une constante** — c'est le correctif au meilleur rapport du dossier |
| **risque** | ⛔ **L'IMC est BANNI en toutes lettres dans ce dépôt** — *« no BMI, no category, no target »*, et `"bmi"` figure dans la liste des termes interdits **et dans le validateur de lexique**. Le plafond doit donc être écrit comme un **poids de référence** (`min(poids, 30 × taille²)`), **sans jamais nommer l'indice**, ni en code, ni en commentaire visible, ni à l'écran. ⚠️ **Un arbitrage reste ouvert et il faut le trancher dans ce lot** : appliqué à un senior corpulent, le plafond **fait DESCENDRE** sa cible — 1,60 m / 90 kg, ≥ 60 ans : 108 g sans plafond, **92 g avec, soit −16 g/j sur la population même pour laquelle la source recommande le plafond**. Deux réponses se défendent ; **seul le silence ne se défend pas** |

## L37 — le plafond de surplus descend au niveau de l'avertissement

| | |
|---|---|
| **quoi** | Quelqu'un qui veut prendre 0,35 kg par semaine peut le demander. |
| **pourquoi** | Mesuré sur le cas 08 : `MAX_SURPLUS_FRACTION = 0,10` bloque à **0,29 kg/sem** pendant que `PACE_WARNINGS.surplus_becomes_fat` — celui qui dit quelque chose de vrai — n'alerte qu'à **0,5**. **Le produit interdit 42 % en dessous de sa propre ligne de danger**, et quelqu'un qui lit les deux ne comprend pas. Et le surplus prescrit (+315 kcal/j) fait **la taille d'un des boutons de réglage** et **la moitié de la barre d'erreur** de l'estimation (±580 kcal/j). |
| **dépend de** | `X2` |
| **bloque** | rien |
| **fichiers** | `_shared/keel/meal_envelope.ts` (`MAX_SURPLUS_FRACTION`) · le CHECK `household_members_target_pace_range_check` en base |
| **migration** | **oui** si le CHECK borne à l'ancienne valeur |
| **mesure AVANT** | bouches avec un `target_pace` réglé : **4 / 88**. Rythme exécuté vs demandé : `clampedBy: 'surplus_band'` sur le cas 08 |
| **direction** | 0,35 devient un choix normal ; l'avertissement se déclenche en approchant de 0,5 |
| **mesure APRÈS** | un compteur `clampedBy` avec ses populations. Contre-épreuve : 0,5 kg/sem = 550 kcal/j = **+17,4 %** de l'entretien du cas travaillé, dans la fourchette +10 à +20 % couramment retenue |
| **armé par** | ⚠️ **Rien à changer côté écran** — `paceControlFor` prend déjà `max: ceiling.maxKgPerWeek` et rabat la valeur dessus. C'est ce qui rend le lot petit, **et c'est aussi ce qui le rend invisible** : sans compteur, on ne saura pas s'il a pris |
| **coût** | **une constante** |
| **risque** | ⛔ **NE PAS aligner `MAX_DAILY_DEFICIT_KCAL = 500` par symétrie.** Trop manger et pas assez manger ne portent pas le même risque : **le plancher TCA n'a pas de miroir.** Un futur lecteur trouvera les deux constantes côte à côte et voudra les aligner — **c'est la faute à ne pas commettre**, et elle est écrite ici pour ça. ⚠️ Séparément : `muscle_gain` porte une limite d'**accrétion musculaire** légitime, mais quelqu'un en **sous-poids** qui doit reprendre de la masse n'est pas dans ce cas. **Deux objectifs vivent sous un seul jeton** |

## L38 — la cible de densité suit l'objectif

| | |
|---|---|
| **quoi** | Quelqu'un qui veut prendre du poids cesse de recevoir 900 g de nourriture de plus pour la même énergie. |
| **pourquoi** | Mesuré sur le cas 06 : la journée pèse **2 577 g** dont **1,1 kg au déjeuner, dans une gamelle**. À 1,24 kcal/g, 3 537 kcal pèsent **2 852 g/jour** ; à 1,8, **1 965 g**. **900 g d'écart pour la même énergie.** La cible basse a été posée pour la **perte** ; appliquée à une **prise**, elle travaille contre l'objectif — *ce qui empêche les gens de prendre du poids, c'est presque toujours qu'ils n'arrivent pas à manger assez*. |
| **dépend de** | `L9bis` (le plancher d'abord, la cible ensuite), **PORTE P1** |
| **bloque** | rien |
| **fichiers** | `_shared/keel/meal_envelope.ts:551-552` (`DENSITY_CEILING_FAT_LOSS = 1,3`, `DENSITY_CEILING_DEFAULT = 1,8`) — **il manque la CIBLE**, et son sens s'inverse |
| **migration** | non |
| **mesure AVANT** | deux **plafonds**, aucune **cible**. Densité livrée par objectif, sur la fixture |
| **direction** | perte ⬇️ densité basse · maintien neutre · **prise ⬆️ densité haute**. ⛔ **Ne pas confondre avec le plancher de `L9bis`** : l'un **refuse** et vaut pour tout le monde, l'autre **oriente** et s'inverse |
| **mesure APRÈS** | poids de la journée composée, par objectif, avant/après. Seuil : la bouche en prise voit son volume baisser d'au moins 500 g/j à énergie constante |
| **armé par** | un compteur de la densité **visée** et de la densité **livrée**, par objectif |
| **coût** | **un petit lot** |
| **risque** | ⚠️ **La règle 5 du §1 du design (« on vise une densité basse, le levier le plus puissant ») doit gagner sa condition** : elle est vraie **en perte** et fausse en prise. Laissée sans condition, elle sera relue comme universelle. ⛔ **Et le levier de Klos ne s'applique PAS à une bouche boîtée** : chez elle l'énergie est épinglée et le poids est libre, donc baisser la densité ne retire aucune kcal — elle achète du **volume**. L'effet mesuré (−223 kcal) ne vaut que pour les bouches du **plat commun**, en *ad libitum*. C'est un renversement produit, pas un détail : **le levier le mieux prouvé du dossier sert la majorité du foyer, pas la bouche à objectif** |

## L4 — le groupe déclaré d'un apport fixe

| | |
|---|---|
| **quoi** | Une Danette cesse d'être comptée comme de la protéine maigre. |
| **pourquoi** | Un apport `nutrition: "declared"` est **forcé** dans `foodGroupRef: "lean_protein"`. Le commentaire du code le dit lui-même : *« le jour où des apports déclarés NON protéiques apparaissent, ce champ doit venir de la déclaration, pas d'ici. »* Une tartine ou un dessert, **c'est ce jour-là**. |
| **dépend de** | `L11★` (le forfait fromage/dessert crée précisément ces apports non protéiques) |
| **bloque** | la justesse du critère protéique de `L9bis` |
| **fichiers** | le type `FixedIntake` et `augmentedIndexFor(base, intakes)` dans `_shared/keel/food_composition.ts` |
| **migration** | ⚠️ **oui si** la déclaration doit porter un groupe — à confirmer sur le schéma de `fixed_intakes` |
| **mesure AVANT** | apports déclarés en base, par groupe → **tous en `lean_protein`** |
| **direction** | la distribution s'étale ; l'ancre protéique des plans concernés **baisse** |
| **mesure APRÈS** | part des apports déclarés en `lean_protein` : de **100 %** à la part réelle |
| **armé par** | un test qui déclare un dessert et vérifie que la cible protéique du plan **ne monte pas** |
| **coût** | **un petit lot** |
| **risque** | ⚠️ **Tout compte protéique est faux tant que les apports fixes sont invisibles** — le shaker de 15 g n'entre nulle part. Un contrôle qui ne les voit pas se trompe de 15 g **dans le sens qui refuse à tort** |

## L12 — le terme de perte cumulée

| | |
|---|---|
| **quoi** | Plus quelqu'un perd, moins le produit relève sa cible en silence. |
| **pourquoi** | À l'équilibre, chaque kilo perdu abaisse l'entretien d'environ **22 à 24 kcal/j** (Hall 2011, règle de **population**, pas prédiction individuelle). Mifflin × PAL n'en capture qu'environ **65 %** (le terme `10 × poids`, multiplié par le PAL, rend 14 à 16 kcal/j/kg). ⇒ il manque **−6 à −10 kcal/j par kilo déjà perdu**. Sans lui, **le produit ralentit lui-même la perte qu'il pilote, en silence** — puisqu'aucun chiffre n'est affiché. |
| **dépend de** | `L11★` · ⛔ **et le stockage du POIDS DE DÉPART**, à côté du poids courant |
| **bloque** | rien |
| **fichiers** | `_shared/keel/meal_envelope.ts:808` (`estimatedMaintenanceKcal`) · `body_measure_series` / `student_body_measures` pour le poids de départ |
| **migration** | ⚠️ **à vérifier** — le poids de départ existe-t-il dans le modèle de données ? |
| **mesure AVANT** | combien de bouches ont **plus d'une** pesée ? (le terme est nul sans historique) |
| **direction** | ⬇️ la cible d'entretien baisse, proportionnellement au poids déjà perdu |
| **mesure APRÈS** | l'entretien avant/après sur une bouche à 3 pesées décroissantes |
| **armé par** | un test à deux poids (départ, courant) et une valeur attendue en littéral |
| **coût** | **une requête en solo** · **un lot côté foyer** (exige la propagation d'une pesée, qui **n'existe pas** : aucun trigger sur `student_body_measures`, et aucun écrivain ne propage vers `household_member_bodies.weight_kg`) |
| **risque** | ⛔ **Exige un plancher ABSOLU.** Le terme fait descendre l'estimation, donc **le plancher relatif descend avec elle**. `ENERGY_FLOOR_KCAL` (1500 H / 1200 F / 1350) existe et est armé, **mais il ne garde que le POIDS VISÉ à la saisie, jamais la cible quotidienne d'un plan déjà accepté**. ⛔ **Et l'ordre est contraignant** : une pesée déclenche à la fois le recalcul de la cible **et** l'évaluation du plancher TCA. **Si la cible est recalculée en premier, une perte rapide produit une cible plus basse avant que la garde ne s'arme. Le plancher passe devant** |

### Fin de vague 4 — vérification en conditions réelles

Deux runs sur la **même** fixture, avant et après le train, et un tableau des
**grammes servis par bouche et par plat**. ⛔ Trois contrôles qui refusent le train :
un facteur d'ancrage collé à `ANCHOR_FACTOR_MAX` sur toutes les bouches · un plat
servi **sous** la cible sans refus · un compteur de recomposition resté à zéro.

---
---

# VAGUE 5 — LE FOYER PLURIEL, ENFIN EXERCÉ

> ⛔ **Rien de cette vague n'existe aujourd'hui.** Sur les 23 identifiants nommés
> par le registre des 166 conflits, **20 ont zéro occurrence** dans le code. Et
> l'union de deux régimes déclarés **n'a jamais tourné** : 13 plans à ceinture,
> **tous à une seule bouche**, **zéro refus**.

## L26 — la variante de plat par bouche

| | |
|---|---|
| **quoi** | Une bouche qui ne peut pas manger un composant reçoit **sa version du plat**, pas un second plat. |
| **pourquoi** | ⛔ **La forme actuelle ne peut même pas l'exprimer** : `SizableShare = { memberId: string; grams: number }`. **Un identifiant et un scalaire. Aucun ingrédient, aucun groupe.** Une part n'est qu'un facteur posé sur un plat commun — il n'y a **nulle part où écrire « la version de cette bouche contient autre chose »**. |
| **dépend de** | ⛔ `L6′` — `boxes[]` avec ses `items[]` est **le seul endroit** où une variante peut vivre · **PORTE G5** |
| **bloque** | `L21` |
| **fichiers** | `_shared/keel/household_portions.ts:2790` (`sizeBoxesFromTarget`), les types `SizableShare` / `SizableMeal` · `docs/keel/BOITES-PAR-REPAS.md` |
| **migration** | ⚠️ à confirmer — `meal_composition_verdicts` porte `user_id + meal_id` **sans `member_id`** : N lignes sont insérables mais rien ne dirait de quelle bouche chacune parle |
| **mesure AVANT** | plans avec une divergence de régime : **36** · plats dédiés attribués : **28** · variantes exprimées : **0** (la forme ne le permet pas) |
| **direction** | une bouche reçoit une boîte dont les `items[]` diffèrent, **sans seconde cuisson** quand le porteur de la différence s'ajoute **au dressage** |
| **mesure APRÈS** | sur la fixture, la bouche végane reçoit une boîte dont les items diffèrent, et son facteur est calculé **contre SA variante** |
| **armé par** | ⛔ **Le « livré » doit se calculer PAR VARIANTE.** Le moteur le calcule aujourd'hui **une fois par plat** ; si les deux versions partagent le même dénominateur, **celle qui diverge sort fausse — dans le sens qui sous-nourrit exactement la bouche qu'on cherchait à protéger.** Un test avec deux variantes de densités différentes |
| **coût** | **un lot** |
| **risque** | ⚠️ Le coût réel dépend d'**où** la différence se trouve : **au dressage** (l'huile d'algue versée sur une portion) = quasi nul, 8 bouches coûtent 8 gestes ; **cuit dans la base** = une vraie seconde préparation, et c'est là que le temps de session mord. ⚠️ Et l'échange n'est **pas neutre en énergie** : saumon 130 g (260 kcal) → poulet 120 g + huile d'algue 3 g (225 kcal) = **−35 kcal**. `cible ÷ livré` le rattrape **si et seulement si** le livré est par variante |

## L21 — un dégoût qui porte un apport n'est pas une préférence

| | |
|---|---|
| **quoi** | Retirer le poisson pour une personne cesse de retirer l'oméga-3 marin de toute la table sans le dire. |
| **pourquoi** | `SPEC-REGIME-PAR-BOUCHE` porte le bon geste sous **R5**, mais **R3** de la même spec écrit *« un régime n'est PAS une préférence »* — et un dégoût **est** une préférence. Il ne déclenche donc aucune divergence : il retire l'aliment **pour tout le monde**, ou il ne fait rien. **Les deux issues sont mauvaises, et dans les deux cas l'apport que le poisson portait disparaît en silence.** |
| **dépend de** | `L26`, `S2` |
| **bloque** | rien |
| **fichiers** | le moteur, **avant** l'appel modèle : relever les **7 drapeaux** de l'aliment refusé (`omega3_marine`, `iron_source`, `calcium_source`, `iodine_source`, `zinc_source`, `b12_source`, `folate_source`), interroger le référentiel, poser une **exigence positive** dans le prompt |
| **migration** | non |
| **mesure AVANT** | dégoûts déclarés : `household_food_restrictions` **6 lignes** · drapeaux tombés à zéro sur un plan : **rien ne le mesure** |
| **direction** | un compteur `sentinels_lost` apparaît, non nul ; puis il **baisse** à mesure que les substitutions tombent juste |
| **mesure APRÈS** | trois issues comptées **dans cet ordre** : **substituer** (un aliment accepté portant les mêmes drapeaux) · sinon **diverger** · sinon **marquer INATTEIGNABLE**. Le troisième état doit être **non nul** — s'il ne l'est jamais, c'est qu'il n'est pas armé |
| **armé par** | ⛔ **Le test est MÉCANIQUE, pas une opinion** : retirer un aliment retire ses drapeaux ; **si un drapeau tombe à zéro sur le plan entier, la divergence est obligatoire.** ⛔ Et **la substitution se décide AVANT le modèle** — le moteur nomme l'**exigence**, jamais l'aliment, et tend une liste courte. La porte de sortie **vérifie**, elle ne répare pas : réparer après coup coûte une régénération entière |
| **coût** | **un lot** |
| **risque** | ⛔ **« Re-router sur des noix » est FAUX**, et l'erreur a déjà été commise. La colonne s'appelle `omega3_marine` et le mot compte : le poisson porte EPA/DHA, les noix portent de l'**ALA**, que le corps convertit en EPA à ~5 % et en DHA à **moins de 1 %**. Le seul vrai substitut alimentaire est **l'huile d'algue**. **Un substitut doit porter le MÊME drapeau, pas un drapeau qui lui ressemble.** ⚠️ Exige le **3ᵉ état** d'un nutriment (« impossible à couvrir dans ce que cette personne accepte »), qui **n'existe pas** : aujourd'hui « pas encore » et « jamais » rendent exactement le même silence |

## C1 — la contamination croisée

| | |
|---|---|
| **quoi** | Quand une bouche porte une contrainte médicale et qu'un plat dédié existe dans le même repas, la consigne dit de ne pas partager la poêle. |
| **pourquoi** | ⛔ **Aucune règle nulle part dans le dépôt.** Deux occurrences en tout, toutes deux non fonctionnelles (un commentaire de justification, une chaîne de test). Pour un produit qui sert des allergies `medical` à une **casserole partagée**, c'est le trou le plus large de la sécurité : le foyer cuisine des plats différents pour des bouches différentes et **rien ne parle de planches, d'ustensiles, d'huile de friture ou d'ordre de préparation**. |
| **dépend de** | `L26` (il faut qu'un plat dédié existe pour que la règle ait un objet) |
| **bloque** | le pilote payant |
| **fichiers** | un bloc de prompt **en position de récence**, armé par la prémisse `severity='medical'` ET l'existence d'un contenant séparé dans le même repas |
| **migration** | non |
| **mesure AVANT** | **0** occurrence fonctionnelle · `household_member_allergies` : **7 lignes**, dont peanut ×2, pistachio ×2, sesame |
| **direction** | le bloc apparaît sur les plans qui remplissent les **deux** prémisses, et **sur eux seulement** |
| **mesure APRÈS** | un compteur `cross_contact_block{emitted, skipped}` — **les deux populations**, sinon on ne distingue pas « la règle n'a pas eu lieu d'être » de « la règle n'a pas tourné » |
| **armé par** | ⛔ **Une règle qui ne vit que dans un prompt régresse en réel et personne ne le voit.** Ce lot est donc **une consigne + un compteur**, jamais une consigne seule. Le compteur est ce qui le rend falsifiable |
| **coût** | **un petit lot** pour la consigne · ⚠️ **la vérification en sortie est un chantier** — on ne peut pas prouver depuis un JSON qu'une poêle a été lavée |
| **risque** | ⚠️ **C'est le seul sujet du moteur où une erreur ne fait pas un plan médiocre : elle rend malade.** Et c'est une consigne non vérifiable — il faut donc l'écrire **et** dire qu'elle n'est pas garantie, plutôt que de laisser croire qu'elle l'est |

## D3′ — la hiérarchie inter-bouches est lue par le modèle

| | |
|---|---|
| **quoi** | Quand deux bouches demandent des choses contraires, le plan applique un rang écrit, et le même à chaque fois. |
| **pourquoi** | Mesuré : **D3 n'existe pas.** `PRECEDENCE_BLOCK` (`meal_generation.ts:1831`) est injecté à `:3617`, **pas en dernière position** sur la lane foyer — il est enterré sous quatorze blocs — et **il ne nomme aucun objet du foyer**. Or *« la contrainte la plus proche de la fin est lue comme la plus contraignante »*. |
| **dépend de** | `L6′` (les contenants donnent les objets à arbitrer) |
| **bloque** | `L8`, `L35` |
| **fichiers** | `_shared/keel/meal_generation.ts:1831` (`PRECEDENCE_BLOCK`) · `_shared/keel/household_meal_generation.ts:1668` (`buildHouseholdPromptBlocks`) |
| **migration** | non |
| **mesure AVANT** | position du `PRECEDENCE_BLOCK` dans le message foyer assemblé : **enterré**. Objets du foyer nommés dedans : **0** |
| **direction** | le bloc passe **en dernière position** du message foyer assemblé, **avant le seul bloc de langue**, et nomme les cinq rangs |
| **mesure APRÈS** | l'ordre des blocs, vérifié sur un prompt capturé. ⚠️ ⛔ **Capturer le prompt AVANT toute réécriture en mode JSON** — le dépôt a déjà archivé une version de 25 caractères parce que la capture était placée après |
| **armé par** | un test d'ordre des blocs qui **rougit** si un bloc est inséré après. ⚠️ **Deux invariants de fin à ne pas casser** : `PRECEDENCE_BLOCK` en queue du message utilisateur, **et le suffixe foyer reste le dernier** |
| **coût** | **un petit lot** |
| **risque** | ⛔ **Un lot qui ne vit que dans un prompt n'a aucune preuve d'exécution.** Il lui faut un compteur de sortie : le modèle déclare quel rang il a appliqué, et **un compteur obligatoire** — sinon un lot désarmé ressemble à un lot qui marche |

## L8 — le verdict foyer, en OBSERVATION seulement

| | |
|---|---|
| **quoi** | Le moteur écrit ce qu'il pense d'une assiette de foyer. Il n'agit pas dessus. |
| **pourquoi** | Mesuré : la lane foyer n'a **aucun** des trois — `verdictFor`, `assessCoverage`, `correctionPlanFor` ne sont **pas importés**. La lane solo a les trois et **deux relances** ; la lane foyer en a **une** et aucune vérification. **Le cas le plus compliqué du produit est celui qui n'est pas vérifié du tout.** |
| **dépend de** | `L6′`, `D3′` |
| **bloque** | `L13` |
| **fichiers** | `generate-household-meal-v1/index.ts` — **cinq entrées manquantes, nommées** : `envelope` (existe par bouche mais **n'est pas conservée** ; à capturer avant `resolveHousehold`) · `uncoverableSentinels` (`strictestRegime` est calculé, `uncoverableSentinelsFor` n'est **jamais appelé**) · `fixedIntakeInputs` (chargés, pas projetés) · `offAxes` (`offAxesFor` pas importé) · `friedMethod` (`isFriedMethod` pas importé) |
| **migration** | ⚠️ **oui, probablement** — `meal_composition_verdicts` porte `user_id + meal_id` **sans `member_id`** |
| **mesure AVANT** | `meal_composition_verdicts` : **10 lignes**, RLS active, **0 policy**, **0 grant** · verdicts foyer : **0** |
| **direction** | des lignes de verdict apparaissent pour les plans foyer. ⛔ **Aucune correction n'est appliquée** — c'est le point du lot |
| **mesure APRÈS** | ≥ 1 verdict par bouche sur la fixture. Et la distribution des verdicts, qui devient l'entrée de `L13` |
| **armé par** | ✅ **Le pliage et le prorata sont déjà faits côté foyer** : `mouthDayEnergy` appelle `foldPreparationsIntoDishes` **avec exactement la même projection** que la lane solo. C'est ce qui rend ce lot moins cher qu'il n'en a l'air |
| **coût** | **un lot** |
| **risque** | ⛔ **Vérifier ne veut pas dire corriger.** Poser une boucle de correction dans un dîner de famille demande de trancher **avant** : **qui voit le verdict**, et **est-ce qu'une personne protégée peut voir sa portion bouger à cause de la cible de quelqu'un d'autre.** C'est la question ouverte n°2 du design, et elle n'est **pas** tranchée ici |

## D1′ — le curseur de cuisine a quatre réponses, pas trois

| | |
|---|---|
| **quoi** | « Une cuisson, des plats un peu différents » devient une réponse que le moteur sait lire. |
| **pourquoi** | Mesuré : `COOKING_SHAPES` n'a que **3** jetons — `one_dish`, `one_session`, `separate_sessions`. La 4ᵉ réponse du design (« laisse le plan décider ») est un **`null`**, pas un jeton. Or c'est le jeton intermédiaire qui porte la distinction technique qui compte : une différence **au dressage** passe à l'échelle (8 bouches = 8 gestes), une différence **cuite dans la base** est une cuisson de plus. Le curseur a **plafonné 8 fois** en base, et il est demandé sur **20 plans journalisés sur 52**. |
| **dépend de** | `L26` (sans variante, l'intermédiaire n'a rien à autoriser) |
| **bloque** | rien |
| **fichiers** | `_shared/keel/household_portions.ts:625` (`COOKING_SHAPES`), `:632-655` (`capCookingShape`) · l'écran du curseur |
| **migration** | **oui** si le jeton est contraint en base — ⛔ **R6 du contrat : pas de valeur d'énumération sans une branche d'évaluateur nommée** |
| **mesure AVANT** | 3 jetons + un `null` · `capped: true` sur **8** plans · curseur demandé sur **20/52** |
| **direction** | le 4ᵉ état devient explicite ; le `null` cesse d'être une réponse |
| **mesure APRÈS** | la distribution des 4 jetons sur les plans nouveaux, et `capped` ventilé par jeton |
| **armé par** | ⛔ **R1 du contrat : les jetons sont en ASCII anglais, y compris dans le jsonb.** Et une branche d'évaluateur nommée pour le nouveau jeton, sinon `R6` refuse |
| **coût** | **un petit lot** |
| **risque** | ⚠️ **Il ne s'affiche qu'à partir de DEUX bouches** — servi à quelqu'un qui vit seul, il pose une question dont il est la seule réponse possible. Même famille de défaut que les jours de cuisine |

### Fin de vague 5 — vérification en conditions réelles

⛔ **Le seul contrôle qui compte : l'union de deux régimes déclarés MORD pour la
première fois.** Aujourd'hui `regime_belt` : **13 plans, tous à une bouche, zéro
refus** — alors que **deux foyers portent chacun ≥ 2 régimes distincts et ont
généré 11 plans chacun**. La ceinture a **vu** ces foyers et n'a compté qu'une
bouche. Tant que ce compteur reste à zéro, cette vague n'est pas livrée, quel que
soit l'état des tests.

---
---

# VAGUE 6 — CE QUI SE DIT, ET CE QU'ON RETIENT

## L0★ — la conservation : le cuit, le cru, et les jours de cuisine *(gardé par G3)*

> ⛔ **UN SEUL LOT.** Le design les numérote 0, 29, 34 et 28. Ils portent **la même
> horloge** : ce qui se garde, combien de temps, et donc quand on cuisine et quand
> on fait les courses. Livrés séparément, ils se contredisent.

| | |
|---|---|
| **quoi** | Le plan cesse de faire manger un plat qui n'est plus bon, et de faire acheter de la volaille quatre jours avant de la cuire. |
| **pourquoi** | ⛔ **C'est le seul sujet du moteur où une erreur ne fait pas un plan médiocre : elle rend malade.** Trois défauts. ① `MAX_FRIDGE_DAYS = 3` appliqué en `> 3` — **cuit dimanche, mangé mercredi : ça passe** — et **ce n'est pas un refus, c'est un constat** : le code pousse un `issue`, il ne jette pas le plat. ② **Il y a DEUX fenêtres de conservation et elles se CHAÎNENT** : `achat →[fenêtre CRUE]→ cuisson →[fenêtre CUITE]→ dernière portion`. `MAX_FRIDGE_DAYS` ne couvre que la seconde ; **la première n'a aucune constante, aucune colonne, aucun lecteur**. Mesuré sur le cas 04 : le poulet de la session 2 attend **3 jours cru** puis 1 jour cuit — **or une volaille fraîche tient 1 à 2 jours, pas 3. Le plan était déclaré valide et il ne l'est pas.** ③ L'écran demande « les jours où tu cuisines », une question qui **n'a pas de réponse libre** : il faut toujours cuisiner le premier jour, et re-cuisiner dès que la conservation expire. |
| **dépend de** | ⛔ **PORTE G3** (48 h FSA ou 72 h ?) |
| **bloque** | `L35` (le plan ne peut pas dire un compromis de calendrier qu'il ne calcule pas) |
| **fichiers** | `_shared/keel/meal_generation.ts:1880` (`MAX_FRIDGE_DAYS`), `:6082` (la comparaison `cookOn`↔`dish.day`) · une colonne **par GROUPE** pour la fenêtre crue · l'écran des jours de cuisine |
| **migration** | **oui** — une valeur de fenêtre crue **par groupe** sur `food_groups` (30 lignes), pas par aliment. ⚠️ Table existante ; ⛔ mais `food_groups` donne aujourd'hui **S/I/U/D à `anon` ET `authenticated`** (voir `S6`) : la migration doit **révoquer d'abord** |
| **mesure AVANT** | `MAX_FRIDGE_DAYS = 3`, appliqué en `> 3` · fenêtre crue : **aucune constante, aucune colonne** · violations comptées : ⛔ **impossible — `issues[]` n'est persisté nulle part** |
| **direction** | ⬇️ le nombre de plats hors fenêtre tombe à **0** (ils sont refusés, pas signalés) · ⬆️ le nombre de sessions de cuisine monte · ⬆️ le nombre de passages aux courses monte, **sans congélateur** |
| **mesure APRÈS** | *(① commencer par PERSISTER `issues[]`, sinon il n'y a pas de « avant »)*. Puis : plats hors fenêtre **0** · sessions par plan de 5 jours : **2**, aux jours 1 et 4 · listes de courses **scindées** quand `has_freezer = false` |
| **armé par** | ⛔ **Une porte de SÉCURITÉ, donc fail-closed** — comme la conservation du cuit. Un test par groupe : poisson ~1 j · volaille et viande hachée ~2 j · viande en pièce ~3 j · légumes frais ~7 j · œufs, secs et conserves ~très long |
| **coût** | **un chantier** — c'est le plus gros lot du plan après le référentiel |
| **risque** | ⛔ **UN REFUS DUR À 48 H CHANGE L'UNITÉ DE VALEUR DU PRODUIT** : il plafonne chaque session à **deux jours de repas**, soit trois à quatre sessions par semaine au lieu d'une ou deux — **il détruit le temps gagné, qui est ce que le produit vend.** La pièce qui réconcilie une horloge courte avec une cuisson hebdomadaire est **la CONGÉLATION**, et elle est aujourd'hui **dans le PROMPT, donc non garantie**. ✅ Bonne nouvelle : le correctif est à moitié écrit — le **portionnement au refroidissement** (la casserole répartie en contenants le jour de la cuisson, chacun réchauffé une seule fois) **est exactement notre protocole de boîtes**. Il faut l'imposer et le dire, pas l'inventer. ⚠️ **La fenêtre ne s'applique qu'aux occasions CUISINÉES À L'AVANCE** : sur 5 jours, **5 des 15 occasions sortent du problème** (petit-déjeuner assemblé le matin, shaker, forfait) — sans cet attribut, on compte 15 au lieu de 10 |

## L35 — le plan DIT ce qu'il n'a pas respecté

| | |
|---|---|
| **quoi** | Quand le produit sacrifie quelque chose, il le nomme. |
| **pourquoi** | La tension prix/santé **ne se résout pas** — les calories les moins chères sont les plus denses, exactement celles que la cible de densité évite. *« Un compromis nommé est un service ; un compromis silencieux est une faute qui retombe sur l'utilisateur. »* ✅ **Et le module existe** : `plan_rationale.ts` est déterministe, assemblé backend, rend des phrases finies, et **chaque phrase est armée par une prémisse** (`addedCookDays: []` ne produit pas « aucun jour ajouté », il ne produit **rien**). ⛔ **Mais son vocabulaire ne couvre que le CALENDRIER** — il ne sait rien dire d'un souhait écarté, d'un budget dépassé, d'une cible manquée, d'un drapeau inatteignable, ni d'une tradition adaptée. |
| **dépend de** | `L0★`, `D3′`, `L9bis`, `L21`, `L30b` (chacun fournit une prémisse) |
| **bloque** | rien |
| **fichiers** | `_shared/keel/plan_rationale.ts` — **extension de vocabulaire, pas module neuf** · plus un **champ de sortie dédié** côté modèle |
| **migration** | non |
| **mesure AVANT** | gabarits de phrase existants : calendrier seulement · champ `trade_off` côté modèle : **0 occurrence dans le code** |
| **direction** | ⬆️ le nombre de plans portant au moins une phrase de compromis. ⚠️ Il ne doit **pas** atteindre 100 % : une phrase sur un plan sans compromis serait une invention |
| **mesure APRÈS** | un compteur par **famille de prémisse**, avec les deux populations (armée / non armée) |
| **armé par** | ⛔ **DEUX gardes sur la moitié du modèle, et elles suffisent.** ① **La phrase doit être FALSIFIABLE contre le plan** : s'il écrit « j'ai remplacé le foie gras par du canard », le moteur vérifie que le foie gras est absent et le canard présent — **une affirmation qu'on ne peut pas confronter au JSON ne s'affiche pas**. ② **Aucun nombre qui vise une personne** : le dépôt a mesuré la fuite — sur un run réel, le modèle a recopié un facteur dans le texte visible, *« Zoé : 0,85 de la part de Marc »*, **lu à voix haute à table** |
| **coût** | **un lot** |
| **risque** | ⛔ **La règle juste est « personne n'explique la décision d'un autre ».** Le défaut d'origine de `plan_rationale.ts` était de demander au **modèle** d'expliquer un jour ajouté par le **moteur** — une décision qu'il n'avait pas prise et dont il n'avait pas les données. **C'est là que l'invention arrive, et nulle part ailleurs.** ⚠️ Le champ déclaré par le modèle tombe sous la règle générale : **un compteur obligatoire**, sinon un lot désarmé ressemble à un lot qui marche |

## L24 — le nombre ne s'affiche que pour une bouche à objectif

| | |
|---|---|
| **quoi** | Une recommandation en kcal existe toujours ; elle ne sort à l'écran que pour quelqu'un qui a posé un objectif de poids. |
| **pourquoi** | ⛔ **C'est la SEULE exception à « on ne lui montre jamais un chiffre », et elle doit être nommée comme telle.** Afficher une cible calorique à quelqu'un qui n'a jamais demandé à changer de poids **transforme le produit en application de comptage pour des gens qui n'en voulaient pas**. C'est la même règle que la boîte pesée v4, appliquée à une autre surface : chez la bouche à objectif le gramme est une **prescription**, chez les autres c'est une **quantité de récipient**. |
| **dépend de** | `L23` (l'occasion estimée), **PORTE P0** |
| **bloque** | rien |
| **fichiers** | ⛔ **`canEmitMouthEnergy` (`energy_gate.ts:528`) EXISTE, est testée, et a ZÉRO appelant de production.** Ce lot est d'abord un **branchement**, pas une écriture |
| **migration** | non |
| **mesure AVANT** | `canEmitMouthEnergy` : **0 appelant** · `profiles.energy_display_enabled` : `not null default false` — le chiffre est **déjà opt-in** · bouches avec un objectif : **30 / 88** |
| **direction** | la porte est branchée. Le nombre de surfaces qui peuvent émettre un kcal par bouche passe de « non gardé » à « gardé » |
| **mesure APRÈS** | `grep` sans commentaires ni tests → **≥ 1 appelant réel**. Et un compteur des deux populations (émis / retenu) |
| **armé par** | ⛔ **Elle passe le plancher TCA comme tout le reste, et un refus de la porte la retire — pas seulement l'objectif.** Un test qui lève le plancher et vérifie que le chiffre disparaît |
| **coût** | **un petit lot** |
| **risque** | ⚠️ **Un mineur ne reçoit jamais un nombre qui le vise** — et le cas 08 §5② montre le chemin par lequel il en reçoit un : *« `member_ids` EST LA CLÉ DE LECTURE. Un seul id ⇒ c'est une portion. »* Un mineur seul dans son contenant **récupère un chiffre** par la branche individuelle. La porte doit lire l'**âge**, pas seulement le nombre d'ids |

## L30b — le budget devient un constat avant d'être une contrainte

| | |
|---|---|
| **quoi** | Le plan sait ce qu'il coûte. |
| **pourquoi** | Le lot 30 a livré **923 lignes de prix en sas** (917 FR, 860 US), avec les pièges cru/cuit et partie comestible traités. Mais : **0 promue, 0 lecteur**, et `food_composition_refs` porte **0 prix**. *« Le budget reste exactement aussi invérifiable qu'avant. »* |
| **dépend de** | `L6′` (le budget est **de degré 1** : il se juge sur les grammes réels, **après** le facteur — c'est **la seule porte post-facteur** du produit, la capacité des appareils ayant été écartée) |
| **bloque** | `L32` (la saison), `L35` |
| **fichiers** | `promote_pending_food_prices()` (écrite, **0 appelant**) · un lecteur `Σ q × prix` après `sizeBoxesFromTarget` |
| **migration** | non — la promotion est une fonction déjà en base |
| **mesure AVANT** | `food_price_pending` : **923** · promues : **0** · lecteurs : **0** · `price_eur_per_100g_fr` non nul : **0 / 923** |
| **direction** | ⬆️ le coût estimé d'un plan existe. ⛔ **Il ne contraint rien à ce stade** — un constat d'abord, une contrainte ensuite |
| **mesure APRÈS** | coût estimé du plan de la fixture, en €/1 000 kcal, à comparer aux **2,47 €/1 000 kcal** du cas 05. ⚠️ **Périmètre étroit** : le budget couvre **le panier du PLAN**, pas les courses de la personne — shaker, pain, fromage et dessert **dehors** |
| **armé par** | les 3 vues du lot 30 (`food_price_coverage`, `food_price_out_of_band`, `food_price_fx_smell`), aujourd'hui **sans aucun lecteur** |
| **coût** | **un lot** pour le lecteur · le **chantier** (la grille) est déjà fait |
| **risque** | ⚠️ **La tension ne se résout pas** : les calories les moins chères sont les plus denses. À 4 €/jour il faudrait descendre à **1,48 €/1 000 kcal** contre 2,47. ⛔ Ce n'est pas un défaut d'implémentation, c'est le prix de la nourriture — **le travail du produit est de faire au mieux et de DIRE ce qu'il a sacrifié** (`L35`). ⚠️ Et la grille n'a **aucune saisonnalité** : la tomate passe de 2,80 € l'été à 5,50 € l'hiver, ±35 % que la grille ne porte pas |

## Les lots de mémoire — M8, M3, M2, M1b, M7

> ⚠️ **Une correction de cadrage vaut pour les cinq.** Le `DESIGN-MEMOIRE` mesure
> « 2 lignes ici, 10 là » et en conclut que le magasin structuré est vide. **Mesuré :
> sur 1 320 comptes, 1 311 sont des comptes de test, et les 12 porteurs d'une clé de
> mémoire sont TOUS des comptes de test. Aucun compte réel ne porte une ligne de
> mémoire.** Ces cinq lots ne réparent donc pas un produit sous-utilisé : ils
> construisent sur un banc. **Leur priorité est basse, sauf M8.**

| lot | quoi · pourquoi (mesuré) | dépend de · bloque | armé par | coût · risque |
|---|---|---|---|---|
| **M8** | Faire répondre « as-tu cuisiné ? ». ⛔ `cooking_session_states` est à **0 ABSOLU** — tous comptes confondus, **QA compris**. C'est le seul retour qui **détruit** des repas au lieu d'ajuster des préférences, et **150 plans portent au moins une session de cuisine**. La question n'est posée que depuis `accident_tap.ts:301`, **après** un premier tap « accident » : un chemin de second ordre | dépend de rien · bloque la justesse de tout retour | **la première ligne en base**. `loadSessionStates` et `loadSkippedDishIndexes` sont **armés en production et ne rendent jamais rien** | **un lot** · ⚠️ sans lui, **le plan annonce des plats jamais cuisinés** |
| **M3** | Les indices (rapidité, compétence, variété, portions), **un par PERSONNE**. ⟳ `portion.adjust` **en est déjà un** : `PORTION_ANSWER_ADJUST` porte 5 crans, `PORTION_ADJUST_STEP` en fait une fraction de bande — **il lui manque d'être CUMULÉ dans une position au lieu d'être appliqué une fois** | dépend de rien · bloque rien | ⛔ **bornés ET visibles** — un indice qui dérive sans borne rend les plans triviaux ; un indice invisible ne se corrige qu'en attendant cinq plans | **un lot** · ⚠️ « combien d'indices, et lesquels » est une **question ouverte**, pas une mesure |
| **M2** | Le centre de notifications. `KnownAboutYouCard` + `StudentKnownPage` existent, route `/app/about-you`, avec source et date par ligne. ⛔ **Mais la phrase source n'est stockée nulle part** — seul l'`id` du `memory_item` l'est | dépend de rien · bloque `M5` | ⛔ **Sans la citation, « Défaire » est un pari.** La citation exige une jointure vers `memory_items.content_text`, écrite dans **aucun** chemin de notification | **un lot** · — |
| **M1b** | Le chat n'écrit **jamais**, pas même une allergie. ⛔ **`declare_safety_constraint` écrit toujours** (68 lignes) — le §2.8 du design n'est pas tenu. Le remplacer par un bouton de **NAVIGATION** | dépend de `S1` · bloque rien | ⛔ **PORTE produit, et le design la tranche déjà** : *« une règle avec une exception n'est pas une règle que l'utilisateur peut apprendre »* · *« un bouton d'écriture n'a aucun point d'arrêt naturel »* | **un lot** · ⛔ **C'est le seul endroit où ce design RECULE** : quelqu'un qui déclare une allergie dans le chat et ne suit jamais la redirection **n'est pas protégé**. La formulation est la garde : ⛔ **jamais « je le note »** — c'est exactement la phrase qui a coûté cher ici, `student_safety_constraints` avec six lecteurs armés et zéro écrivain pendant qu'une anaphylaxie recevait *« Noted, I'll keep it in mind »* |
| **M7** | Un compteur sur le repli de sécurité : combien de fois une phrase qui **ressemblait** à de la sécurité a fini classée en préférence | dépend de rien · bloque rien | il existe des compteurs de refus (`forbiddenProducer`, `malformed`, `notDurable`) mais **aucun** ne compte ça | **un petit lot** · ⛔ **le dépôt a déjà payé ce prix une fois sur cette table** |

⛔ **`M6` (« la question vaut révocation ») est MÉCANIQUEMENT IMPOSSIBLE aujourd'hui**
et ne peut pas être planifié tel quel : `sophia-brain` **ne lit ni
`practical_constraints` ni `retained_items`** — zéro fichier. Le chat ne peut ni
citer une règle, ni la lever. Le préalable est un lot à part : **donner au chat une
lecture du magasin**, ce qu'aucun des trois documents ne pose.

⚠️ **Et un magasin de mémoire parallèle échappe aux trois documents** :
`user_profile_facts`, **11 880 lignes** — plus gros que tous les autres réunis, lu
et écrit par `sophia-brain/profile_facts.ts` et `context/loader.ts`. **Il n'a été
audité par personne.** Il mérite sa propre passe **avant** M2/M3/M5, sinon on
construira un centre de notifications qui ne montre pas le plus gros magasin.

---
---

# PARTIE 4 — LES LOTS QUI NE SONT PAS DANS LES VAGUES

## 4.1 Ceux qui s'annulent, se fusionnent ou sont écartés

| lot du design | ce qu'il devient ici | pourquoi |
|---|---|---|
| **Lot 2** (les 6 moments) | ⇒ **absorbé dans `L11★`** | le design le remplace lui-même par le lot 22 |
| **Lot 9** (`D = max(1,1 ; E/(8W))`) | ⇒ **réécrit en `L9bis`** | la formule fait dépendre la densité prescrite du **poids** : elle prescrirait **1,72 kcal/g au grand gabarit**, c'est-à-dire **moins de légumes à celui qui mange le plus**. Le défaut n'est pas la valeur du plafond, c'est **son indexation** — une ceinture de satiété ne peut pas être proportionnelle à la masse grasse |
| **Lot 20** (piloter la protéine) | ⇒ **fusionné dans `L9bis`** | le rapport protéine÷énergie est **invariant d'échelle**, exactement comme la densité : multiplier toutes les lignes par `f` ne le déplace pas. **Aucun facteur ne peut le corriger — ni un, ni deux, ni quatre. C'est de l'algèbre** |
| **Lot 22, 25** | ⇒ **absorbés dans `L11★`** | trois constantes voisines, un seul dénominateur |
| **Lot 27** (capacité des appareils) | ⛔ **ÉCARTÉ** — décision du propriétaire, 2026-08-21 | modéliser chaque appareil est un puits sans fond. ⚠️ **Le coût est accepté et il faut l'écrire** : le temps de cuisson annoncé est **faux dès qu'un appareil à panier entre en jeu**, d'un facteur qui **croît avec le nombre de portions** (×4 sur le cas 04). **Ce qui survit** : ne pas afficher un temps non vérifié — soit **pour une portion**, avec le nombre de portions à côté, soit rien |
| **Lot 31** (durée de session) | ⇒ **une consigne**, pas un lot | la parallélisation est **écartée exprès** : la dispersion réelle (expérience, organisation, matériel) **écrase** ce qu'un modèle gagnerait. ⚠️ `timeAllowsASecondDish` existe déjà et **gate la divergence R5** — ce n'est pas un champ neuf, c'est un champ à un seul lecteur |
| **Lot 3** (retirer la date d'arrivée) | ⇒ **à faire, coût = un écran** | notre erreur d'estimation (**±580 kcal/j**) est **plus grande que notre plafond de déficit** (500). Ça n'invalide pas le calcul — il donne la bonne direction — mais ça **interdit toute promesse de calendrier** |
| **D4** | ⇒ ⛔ **PORTE G4**, pas un lot | le code a tranché **l'inverse** le 2026-08-18 |
| **Lot 15** (fréquence sentinelle) | ⇒ **reporté**, gardé par **G6** | RNP ou BNM change **tous** les verdicts de couverture. ⚠️ L'abstention sous 7 jours est **CORRECTE** et ne se répare pas en baissant le seuil |
| **Lot 13** (correction par rôle) | ⇒ **reporté**, gardé par **G7** | ⛔ **Quatre obstacles nommés**, dont : `SizableShare` **ne porte aucun ingrédient** ; la matière est **dans la casserole**, partagée ; l'étape 4 **rabote toute la boîte au même ratio** pour préserver le rapport entre parts ; et **la granularité n'est pas tranchée** (l'ancrage produit un facteur par **jour**, `sizeBoxesFromTarget` en prend un par **plan**) |
| **Lot 5** (`sodium_mg`, `sugars_g`, `vitamin_k_ug`) | ⇒ **à faire en vague 2**, coût = un import | ⛔ **Le sel est le seul nutriment où le produit fait activement du mal sans le voir** : 9-10 g/j en France contre < 5 recommandés, et `sodium_mg` **n'existe même pas** au référentiel. ⚠️ `vitamin_k_ug` n'est **pas optionnel** : à masse constante, changer d'espèce fait varier K de **deux ordres de grandeur** (épinard ≈ 480 µg/100 g, courgette ≈ 5) — donc « varier les légumes » **défait la garde warfarine sans changer un seul gramme** |

## 4.2 ⛔ Les lots ORPHELINS — décidés, nommés, et sans numéro nulle part

> Ceux-ci sont écrits dans un document d'autorité et **n'apparaissent dans aucune
> liste de lots**. Sans cette section, ils se perdent.

| # | ce qui est décidé | où c'est écrit | pourquoi ça n'a pas de lot |
|---|---|---|---|
| **O1** | ⛔ **Compter les 42 % de compensation** d'une portion réduite — une boîte réduite de 200 kcal n'en retire que **~115** (Robinson 2023, 14 études, 85 effets ; effet **curvilinéaire**, une très grosse portion de départ rend ~33 % de moins) | `ETAT-DE-LART` partie 4, item 6 | **Zéro occurrence de « compensation » ou « Robinson » dans le design du calcul.** ⚠️ **Et attention au piège de lecture** : ce 42 % **n'a rien à voir** avec le `composedDishShare` de 0,42. Deux nombres identiques, deux sujets sans rapport |
| **O2** | **La rampe fibres sur deux ou trois plans** — nos deux recommandations prioritaires poussent les fibres de ~20 à ~35 g/j **d'un coup**, et les symptômes digestifs se lisent *« le plan ne me va pas »*, c'est-à-dire **une attaque directe sur l'adhérence** | design §2.9, étape 2 des quatre gestes | nommée comme une **étape**, jamais comme un lot numéroté. ⛔ **Et l'ordre des quatre gestes n'est pas commutatif** ; les gains de « baisser la densité » et « varier les légumes » **ne s'additionnent pas** — le +48 g de variété est une **partie** du volume, pas un supplément |
| **O3** | **La perte vitaminique à la cuisson** — `folate_source` est calculé sur du **cru** et ment sur la cuisson (44-49 % restants après ébullition), puis **une seconde fois** sur 3 jours de conservation | `ETAT-DE-LART` trou n°10 | aucun lot |
| **O4** | **L'alcool n'est jamais demandé** — il est **dans le référentiel** (bière, vin, groupe `alcohol`, alias) et jamais collecté. Deuxième poste le plus dense après l'huile ; *« un verre de vin le soir »* non résolu = **500 à 900 kcal/semaine invisibles**. Et c'est le **premier candidat d'explication** quand le poids ne suit pas | design §2.5 | le design dit lui-même qu'il *« appartient à l'entonnoir, pas au moteur »* et **ne lui donne pas de numéro** |
| **O5** | **La bande d'âge PÉDIATRIQUE** — `MemberAgeState` ne connaît que `minor`, donc **un enfant de 8 mois est la même chose qu'un ado de 17 ans**, alors que les bornes de plausibilité **admettent explicitement un nourrisson** (50 cm / 3 kg). Et la garde « mineur » ne porte que sur les **chiffres**, jamais sur les **aliments** : ni miel avant un an, ni formes à risque d'étouffement | design §2.11, `ETAT-DE-LART` trou n°7 | `AgeBand` porte bien `60_plus`, armé — **le trou est EN BAS**, et il n'a pas de lot. ⚠️ Mesuré : **29 bouches mineures** en base |
| **O6** | **Les GLP-1** — zéro occurrence de `GLP-1|sémaglutide|tirzépatide`. **L'une des plus grandes populations en perte de poids des pays visés**, et elle casse **trois** hypothèses du moteur d'un coup | design §2.11 ③ | le design le place en **porte P1** ; ⚠️ **le geste minimal est une case qui fait TROIS choses** — désactiver le rythme (le prescripteur pilote), **exempter d'`observed_below_floor`** (un apport très bas sous GLP-1 est l'effet attendu du traitement, pas un signal de restriction), et **SUSPENDRE le plafond de poids de référence** (ici la perte de masse maigre est le risque principal, donc le plancher doit **monter**). Une case qui n'en ferait qu'une **contredirait les deux autres** |
| **O7** | ⛔ **`observed_below_floor` — l'alarme la plus précoce, et elle n'existe nulle part.** *« Quand le déclaré est très en dessous du plancher, on n'ouvre aucun déficit — c'est le signal le plus précoce d'une restriction en cours »* | design §2.1 | nommé comme un **compteur** au §3.4, jamais comme un lot. **Dénominateur : les bouches avec un déclaré ET un corps** |
| **O8** | **Les faux amis de SLUG** — `prune` (le slug est le fruit SEC, 229 kcal ; la prune fraîche fait 46, **×5**) et `pate` (le slug est le PÂTÉ, 325 kcal, groupe `red_meat`). ⛔ **Irréparables par un alias** : `bySlug` gagne toujours | lot 19 §3.4 ② | **seul un renommage de slug répare** — et renommer un slug touche les alias, les plans persistés et les vues. C'est un lot à part |
| **O9** | **689 lignes `source='ciqual'` sans `ciqual_code` ni `ciqual_name`** (75 % de la table) — pour elles, *« vérifier contre la ligne CIQUAL réelle »* est **impossible** | lot 19 §6-G | c'est **le préalable de toute génération d'alias en masse** et de toute correction de valeur, et il n'a pas de lot |
| **O10** | **La granularité de l'ancrage n'est pas tranchée** : l'ancrage produit un facteur **par jour**, `sizeBoxesFromTarget` en prend un **par plan** (« on retient le plus proche de 1 ») | design §3.3 ① | un désaccord de granularité **silencieux** entre deux modules voisins |

## 4.3 Les lots du harnais

| lot | quoi | pourquoi (mesuré) | coût |
|---|---|---|---|
| **H1** | `agent-gate` lance **vitest** | Mesuré : `scripts/agent-gate.sh` lance `deno test`, `tsc -b`, `deno check` et `eslint` — **aucun vitest**. Les 44 fichiers front (673 tests) passent **quand on les lance à la main**, jamais dans le gate. **Un rouge front passe le commit** | **une constante** |
| **H2** | Les fichiers de test sont **typechecked** | `tsconfig.app.json` exclut `**/*.test.*` : **0 des 44 fichiers de test n'est typechecké**. Une clé dupliquée (`onTarget`, `setupMouthsStep.int.test.ts:367`) est **déjà passée à travers** | **un petit lot** |
| **H3** | `CookingCapacityCard` reçoit sa **propre** garde de chargement | `practicalConstraints: Record<string, unknown>` — **pas nullable, aucune porte** — et deux `useState` figés au montage avec des **défauts positifs** (`"normal"`, `"some"`) qui **écraseraient au Save**. Sauvée aujourd'hui par un seul appelant discipliné. ⛔ Le dépôt écrit lui-même la règle contraire : *« une garde qui dépend uniquement de la discipline de l'appelant n'est pas une garde »* | **un petit lot** |
| **H4** | Le refus du chemin `self` de `MouthFormDialog` se pose **à côté du geste** | Les trois occurrences connues sont fermées, avec la règle écrite. ⚠️ **Une 4ᵉ est latente** : `SetupPage.tsx:2895`, la fermeture de la fenêtre écrit ; sur le chemin `member` le refus va dans `mouthFailure` (à côté), sur le chemin **`self`** il part dans le **bandeau du haut**, alors qu'on vient de fermer une modale au milieu de l'écran | **une constante** |
| **H5** | `ProgressPage.tsx` : router ou supprimer | Existe, **0 import réel**. Cohérent avec les namespaces i18n `progress` (36 clés) et `attack` (65 clés) marqués **orphelins, pas dettes** | **une constante** |

---
---

# PARTIE 5 — LES QUESTIONS QUI RESTENT OUVERTES

> ⛔ **Aucune n'est tranchée dans ce plan.** Chacune est une **porte** (§2.6) ou une
> question du design qu'il serait malhonnête de résoudre en passant. Elles sont
> listées ici pour que personne ne croie qu'elles ont été traitées.

**Reprises des documents, et toujours ouvertes :**

1. **P0 — le périmètre juridique.** On calcule un déficit **nominatif**, un rythme
   en kg/semaine et une date d'arrivée pour des personnes **qui n'ont pas de
   compte** — les bouches d'un foyer, dont le corps est saisi par le maître. Est-ce
   du conseil diététique réservé en France ? **À faire qualifier avant le pilote
   payant.**
2. **Un moteur, ou deux ?** Les deux lanes portent **deux implémentations** de
   `cible ÷ livré` qui ne partagent rien.
3. **Le conflit de casserole.** Une bouche à objectif partage un plat avec une
   bouche protégée. **Faire grossir la casserole change la part de la seconde.**
   Qui gagne, et **voit-elle sa portion bouger à cause de la cible d'un autre ?**
4. **Ce que voit une personne quand son plancher se lève** — une boîte qui
   disparaît d'une table où celles des autres restent est **une soustraction
   lisible à table**.
5. **Régénérer est gratuit** — aucun plafond sur la composition. Avec une
   correction plus fine, **régénérer jusqu'à obtenir la plus petite assiette devient
   productif**.
6. **Le critère d'acceptation côté utilisateur.** Le produit n'affiche aucun
   chiffre : la seule preuve visible d'un bon dimensionnement est **une part que la
   personne reconnaît comme la sienne**. Rien ne mesure ça.
7. **RNP ou BNM ?** *(porte G6)*
8. **Les seuils du curseur de cuisine** — « 1 + 1 » et « autant que demandé » sont
   une **proposition**. Combien de préparations un foyer accepte-t-il réellement ?
   **À mesurer, pas à décider.**
9. **Le champ `tradeoff`** — l'arbitrage annoncé par le modèle est aujourd'hui
   **effacé par la passe « commentaire »**. Il lui faut un champ à lui, hors du
   `why`, avec son compteur.
10. **Combien d'indices de mémoire, et lesquels ?** Quatre est une proposition, pas
    une mesure. Et : un cran par retour, ou pondéré par la force de la réponse ?
11. **Les titres de plats du bilan** (`never_again`, `make_again`) restent ambigus :
    « dhal de lentilles rouges » refusé, c'est **les lentilles, le curry, la
    texture, ou juste ce soir-là** ?
12. **La personne qui ne suit jamais la redirection du chat** — le seul endroit où
    le design de la mémoire **recule**. À mesurer avant de conclure.

**Ouvertes par CE plan, et elles sont neuves :**

13. **G2 — le bloc de déclaration de groupe devient-il inconditionnel ?** Renverse
    une décision documentée **tenue par un test d'identité d'octets**. Sans elle,
    `L17` et le repli de `L18` sont désarmés.
14. **G3 — la juridiction de la conservation** : 48 h ou 72 h ? ⛔ **48 h change
    l'unité de valeur du produit.**
15. **G4 — l'objectif de poids sur un mineur.** Le design dit une chose, le code a
    tranché l'inverse **le 2026-08-18**, et **2 bouches mineures en portent un**.
16. **G5 — le grammage par bouche dans `member_portions`.** **181 lignes sur 340**
    portent un gramme dimensionné sur le corps, lisible par tout le foyer, qui
    permet de **classer les besoins des colocataires**. La lettre de la règle tient
    (0 kcal, 0 prénom en clé) ; **l'esprit non**. Le retirer casse la lecture de la
    boîte ; le garder assume un fait de corps public.
17. **G8 — `pepper`** : poivre ou poivron ? **98 occurrences = 21 % de tous les
    ratés de résolution.** ⛔ Ne se résout **pas** par un alias.
18. **`user_profile_facts` — 11 880 lignes, un magasin de mémoire que les trois
    documents ignorent.** Qui l'écrit, qui le lit, et que devient-il quand M1-M8
    posent « le champ est le dénominateur » ?
19. **La granularité de l'ancrage** — un facteur par jour contre un facteur par
    plan *(O10)*. Deux modules voisins en désaccord silencieux.
20. **Le corpus de mesure est un banc.** 1 311 comptes de test sur 1 320. **Toutes**
    les mesures de ce plan portent dessus. À quel moment décide-t-on qu'une mesure
    sur un banc ne suffit plus ?

---
---

# PARTIE 6 — CE QUE JE N'AI PAS PU VÉRIFIER

> Écrit ici pour que personne ne prenne une lecture pour une mesure.

| # | ce qui n'est pas vérifié | ce qu'il faudrait pour le faire |
|---|---|---|
| 1 | ⛔ **Le comportement réel de la chaîne d'ancrage.** Aucun plan en base ne porte `dishes[].boxes` : je ne peux pas dire si `anchorFactorFor` rendrait `anchored`, `day_incomplete` ou `clamped`. Le « trois bouches-jours toutes exactement au plafond » vient d'un run réel **non conservé en base** | **`V0-D`** — c'est précisément pour ça qu'il est le premier lot |
| 2 | **Le modèle réellement utilisé sur un run.** `keelGenerationModel()` est appelé (`:4323`, `:4547`), mais `generated_from` ne porte **aucune clé `model`** : la réparation du 2026-08-19 est **lue, jamais observée** | un run, **et** persister le nom du modèle |
| 3 | **L'écart journal/persistance des boîtes.** Le journal dit `boxes: 12/20/32` sur **51 plans**, mais ces contenants ne sont ni dans `dishes[].boxes` (0) ni sous une clé de `dishes` ; les 56 `preparations[].boxes` **ne recouvrent pas exactement** les 51 | relire le chemin d'écriture, ou un run qui tranche |
| 4 | **Le vrai taux de résolution avec le résolveur de production.** Mes mesures SQL (89,2 %) sont en **égalité exacte**, sans les réductions de `candidateForms` : c'est un **plancher**. Les 95,3 % / 96,0 % viennent des lots 18-19, qui ont importé le module | exécuter `food_composition.ts` sous Deno sur le corpus |
| 5 | ⛔ **La JUSTESSE des résolutions.** 95,3 % dit « une ligne a été trouvée », **pas « la bonne »**. Le taux d'erreur silencieuse est **non nul** (6,0 % des noms français tombent sur un autre aliment) et **la même mesure côté anglais n'a jamais été faite** | relire à la main les 531 chaînes résolues du corpus |
| 6 | **Le taux de journées calculables PAR LANGUE.** Il n'a **jamais** été mesuré, et le corpus ne porte **qu'un seul plan français** | dix générations en `fr-FR`, foyer et solo. **Rien d'autre ne le remplace** |
| 7 | **Si `protein_anchor.ts` mord**, ou s'il est un lecteur sans écrivain. **Personne ne l'a mesuré** | un compteur, avant d'écrire une ligne de `L9bis` |
| 8 | **Le verrou de lane (`per_portion`).** `householdLaneMode` est calculé dans `resolveHousehold`, et ni `laneMode` ni `per_portion` n'apparaît dans `generate-household-meal-v1/index.ts`, ni dans `generated_from.household`. **Je ne peux ni prouver ni réfuter qu'il a déjà basculé** — c'est le trou du cas 09, signalé comme le plus urgent | le journaliser, puis la fixture |
| 9 | **Combien de plans ont violé la conservation.** `issues[]` **n'est persisté nulle part** : le compteur n'existe pas | persister `issues[]` **avant** de toucher `MAX_FRIDGE_DAYS` |
| 10 | **Combien de fois le verrou de sortie médical a mordu.** `blocked_medical_constraint` n'est écrit qu'en `console.error`, **jamais en base**. Les **8** `restriction_signal` et le **1** `minor_student` sont les **seuls** compteurs de morsure persistés du dépôt | persister les refus de ceinture |
| 11 | **Le comportement RLS à l'exécution.** Les privilèges sont mesurés par `has_table_privilege` ; **aucune requête n'a été exécutée sous `anon` ou `authenticated`** pour confirmer que les `USING` neutralisent les grants larges | une session de test par rôle |
| 12 | **Si cette base locale reflète la production.** 1 312 profils dont **91 % sans `birth_date`** ressemble à un dump réel, mais **1 311 comptes sur 1 320 sont des comptes de test**. Le ratio de la porte mineur est **à reconfirmer en prod** | une mesure en prod, en lecture seule |
| 13 | **Ce que les 102 plans foyer représentent.** 47 le 2026-08-12 et 32 le 2026-08-19 sur **15 foyers** : le profil ressemble à des **runs de banc**, pas à du trafic. **Aucune colonne ne distingue les deux** | une colonne d'origine, ou une mesure en prod |
| 14 | **Les 14 entrées « le modèle arbitre » et une partie des 109 « le moteur tranche »** du registre : je n'ai grepé que les **23 identifiants explicitement nommés**. Les entrées dont la règle est une phrase de prompt **n'ont pas d'ancre greppable** — comptées **non vérifiées**, pas absentes | une relecture ligne à ligne du registre |
| 15 | **Aucun test n'a été lancé côté serveur** (`deno test` sur `_shared/keel/`), ni `eslint`. Seuls **`tsc -b`** (vert) et **vitest** (44 fichiers, 673 tests, verts) ont tourné | lancer le gate complet |
| 16 | **Aucun rendu navigateur.** Tout le front est lu sur le disque ou passé par `renderToStaticMarkup`. ⚠️ Et `vitest.config.ts` tourne en `environment: "node"` et n'inclut que `*.int.test.ts` : **un `.tsx` ne serait jamais collecté**, et un composant à portail (`Modal`) ne peut pas être monté | un run navigateur sur la fixture |
| 17 | **Les edge functions déployées** correspondent-elles au dépôt ? Tout le raisonnement porte sur **le code source de l'arbre de travail**, qui porte 313 fichiers modifiés | comparer au déployé |

---
---

# ANNEXE — LES CONTRAINTES DURES, RAPPELÉES POUR L'EXÉCUTANT

**Migrations**
```bash
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -f <fichier>
```
puis enregistrer **à la main** dans `supabase_migrations.schema_migrations`.
⛔ **`supabase db reset` et `db push` sont INTERDITS, même en local** — la base est
partagée entre sessions. *(Vérifié le 2026-08-21 : disque et registre sont alignés,
227 = 227, aucun doublon de version, aucune migration en attente. Reconfirmer avant
chaque lot : une migration hors ordre est **sautée en silence**.)*

**Toute table neuve** : `revoke all ... from anon, authenticated` **dans la même
migration** *(les privilèges par défaut donnent TOUT à `authenticated` — et ce plan
a mesuré `food_groups` accordant S/I/U/D jusqu'à `anon`)*, et **réclamée par le
lifecycle RGPD**.

⛔ **Interdits sans validation humaine explicite** : `supabase secrets set/unset`,
`db reset`, `db push`, `functions deploy`, `config push`, `link`, `projects/branches
delete`, et toute écriture de secret via la Management API. **Deux lots en ont
besoin** — le cron de promotion (`L18b`) et tout déploiement : **le plan donne la
commande, il ne la lance pas.**

**Ne jamais commiter** `en.ts` / `fr.ts` / `catalog.ts` / `planRefusals.ts`.
*(Correction utile : ces fichiers **sont** suivis par git — 18 fichiers i18n
commités, test de parité vert à 6 tests. C'est leurs **modifications en cours**
qu'il ne faut pas commiter.)*

⛔ **Pas de `git stash`** — dépôt partagé, ça emporte 200+ fichiers d'autres
sessions. Pour comparer, `git show HEAD~1:<fichier>`.

⚠️ **N'exporte aucune variable `SUPABASE_*`** avant la suite de tests : **114 faux
rouges**. *(Vérifié : les 673 tests vitest passent sans elles.)*

⚠️ **401 « Invalid JWT » en local** : le seul geste autorisé est
`./scripts/check-local-jwt-alg.sh`, puis lire `docs/keel/JWT-HS256.md`. ⛔ Jamais
`verify_jwt = false`, jamais écrire dans `signing_keys.local.json` (**il doit rester
`[]`** — c'est le correctif).

⚠️ **Avant tout run réel** : redémarrer `functions serve`. Le runtime edge sert un
**cache périmé des modules `_shared`** — un fichier **modifié** n'est pas rechargé.
*(Vérifié le 2026-08-21 : le runtime répond, `generate-meal-v1` rend 401 sur un
appel non authentifié — le chemin est joignable ; PostgREST rend 200.)*

⛔ **Jamais `unicode_escape`** pour insérer du texte accentué : mojibake que ni
`tsc` ni la parité n'attrapent. Éditer par numéro de ligne, en UTF-8. *(`S1` touche
précisément des ligatures : c'est le lot où ce piège mord.)*

⛔ **Jamais un matcher maison** sur un nom d'aliment — « laitue » ≠ « lait »,
**12 faux positifs sur 12 mesurés**. *(Vérifié : il n'en existe aucun aujourd'hui
sur le chemin alimentaire ni sur le chemin allergène. Le risque résiduel vient de la
précédence `bySlug` > `byAlias`, pas d'un rapprochement flou.)*

⚠️ **`create or replace view` perd `security_invoker`** — le repasser dans la même
migration. *(`V0-B` touche `composition_fill_weekly` : c'est le lot où ça mord.)*

⚠️ **Sessions parallèles** : horodater les fichiers d'une lane avant d'y écrire.
Ce dépôt porte **313 fichiers modifiés** appartenant à plusieurs sessions.
