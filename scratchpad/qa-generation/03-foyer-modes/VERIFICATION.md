# VÉRIFICATION DE L'ÉTAPE ③ — les trois modes de cuisson du foyer

**Agent 3V · 2026-08-19 · branche `ff-001-quotidien-du-coach`**
**Objet : `03-foyer-modes/RAPPORT.md` (agent 3A, runs 01:50 → 02:26 UTC).**

> ### CE QUE J'AI FAIT, ET CE QUE JE N'AI PAS FAIT
> **Aucun run modèle n'a été lancé.** Tout ce qui suit est établi sur (a) les
> archives de 3A, (b) la base locale, (c) le code d'aujourd'hui exécuté
> directement (`deno run` sur les modules purs). Deux scripts déterministes ont
> été ajoutés au dossier et sont rejouables :
> `2026-08-19-0530-3v-factors.ts` et `2026-08-19-0530-3v-shape-budget.ts`.
>
> **Corroboration** : chaque lecture de base a été refaite sous une seconde
> forme (`count(*)` + `max(created_at)`, agrégat `distinct`, jointure latérale
> sur `jsonb_array_elements` au lieu d'un `->>`). Aucune divergence rencontrée.
> Population de référence, stable sur les deux formes : **11 plans** sur le
> foyer `qa3a`, de `01:51:26` à `03:25:47` UTC.

---

## RÉSUMÉ — LE VERDICT, AFFIRMATION PAR AFFIRMATION

| # | Affirmation de 3A | Verdict |
|---|---|---|
| 1 | Trois modes, deux consignes — et ③ inatteignable hors fusion | ✅ **CONFIRMÉE**, et re-confirmée post-correctifs sur une paire de runs indépendante |
| 2 | `dish_owners {6, 2, 2}`, cinq fois, même bénéficiaire | ⚠️ **CONFIRMÉE MAIS TRONQUÉE** — le 4ᵉ nombre est escamoté, et un 6ᵉ plan ② du même dataset dit `{6, 3, 3}` |
| 3 | Facteur de part identique sur 8 plans / 3 modes | ✅ **CONFIRMÉE** et **reproduite au millième** par le code d'aujourd'hui — mais **la cause nommée est fausse** |
| 4 | Le dégoût est imposé à toute la table, dans les deux modes | ⚠️ **RÉSULTAT CONFIRMÉ, MÉTHODE ET INFÉRENCE FRAGILES** — la moitié `one_session` ne tient pas telle qu'écrite |
| 5 | L'allergie protège toute la casserole, correctement attribuée | ✅ **CONFIRMÉE** sur les 8 plans, plus 3 plans que 3A n'a pas comptés |
| 6 | La phrase de plan fausse | ✅ **CONFIRMÉE**, origine exacte établie, toujours vivante aujourd'hui |
| — | §D.1 — le budget de plats promet 8 et n'en ouvre que 4 | ✅ **CONFIRMÉE**, y compris sur un run **post-correctifs** |
| — | §D.2 — la ceinture de régime absente, viande à l'enfant végane | ⛔ **PÉRIMÉE** — la ceinture est branchée, comptée, et **un plan mixte correct existe déjà** |

---

# ① « TROIS MODES, DEUX CONSIGNES » — ✅ CONFIRMÉE, CAUSE COMPRISE

L'identité des empreintes n'a pas été refaite (déjà vérifiée en amont). J'ai
éprouvé **la cause** et **la portée**, et j'ai trouvé une **corroboration
indépendante que 3A n'a pas eue**.

## 1.1 · La cause, lue dans le code d'aujourd'hui

`generate-household-meal-v1/index.ts` :

```
const compositionShape: CookingShape =
  divergingMembers.length > 0 ? "one_session" : "one_dish";     // :3090-3092
const computedShape: CookingShape = ladder?.shape ?? compositionShape;  // :3096
const shapeCap = capCookingShape(computedShape, askedCookingShape);     // :3112
```

- `compositionShape` **ne peut valoir que deux jetons**. Il n'existe aucune
  branche qui rende `separate_sessions` en composition ordinaire.
- `ladder` est `null` sauf si `merge !== null && mergedMember !== null`
  (`index.ts:2918`). C'est **la seule** source possible de `separate_sessions` :
  `household_merge.ts:616`, atteinte seulement si les deux plans ont des
  conflits de service **et aucun jour de cuisson commun**.

## 1.2 · Le barreau ③ est bien **inatteignable hors fusion** — preuve par la fonction

`capCookingShape` ne sert `asked` que quand `wanted < found`. `separate_sessions`
porte le **rang maximum** (`COOKING_SHAPES.indexOf` = 2), donc `wanted < found`
est arithmétiquement impossible pour lui. Matrice complète, rendue par le code
(`2026-08-19-0530-3v-shape-budget.ts`) :

```
computed=one_dish     asked=separate_sessions -> served=one_dish     unused=true
computed=one_session  asked=separate_sessions -> served=one_session  unused=true
computed=separate_sessions asked=separate_sessions -> served=separate_sessions
```

⇒ `separate_sessions` n'est **servi** que s'il est **calculé**, et il n'est
calculé que par `mergeLadder`. **Confirmé.**

## 1.3 · ⭐ Une corroboration que 3A n'avait pas : la paire de prompts POST-correctifs

Le lot 07 (ceinture de régime) a rejoué **le même foyer** après les deux lots.
Ses vidages sont sur le disque et personne ne les avait rapprochés :

| run | `cooking_shape` envoyé | heure UTC | sha256 système | sha256 utilisateur |
|---|---|---|---|---|
| `07/run-1` | `one_session` | 02:51 | `c42af2691130bdff…` | `d950d9211eb9a3c0…` |
| `07/run-3` | `separate_sessions` | 03:10 | `c42af2691130bdff…` | `d950d9211eb9a3c0…` |

**Deux modes différents, deux prompts identiques à l'octet, sur des runs
postérieurs aux deux correctifs.** L'affirmation ① n'est donc **pas périmée** :
elle est vraie aujourd'hui, et prouvée deux fois sur deux jeux de runs
indépendants. (L'empreinte utilisateur diffère de celle de 3A du seul delta de
dégoût `fennel` → `sweet potato`, qui était déjà en base à 02:51.)

## 1.4 · Ce que je corrige dans la formulation de 3A

3A écrit « un écran propose trois choix dont deux sont le même ». C'est exact —
`frontend/src/keel/api/cookingShape.ts` exporte les trois jetons et
`CookingShapeField.tsx` rend les trois libellés — mais il faut ajouter que
`cookingShapeApplies(mouths)` n'ouvre le champ qu'à partir de **2 bouches**. Le
troisième choix est donc offert à **tout foyer de 2 personnes ou plus**, et il
n'est honoré **dans aucun** d'entre eux hors fusion.

---

# ② `dish_owners` — ⚠️ CONFIRMÉE MAIS TRONQUÉE, DEUX FOIS

## 2.1 · Le compteur porte QUATRE nombres, et le rapport en a escamoté un

`generate-household-meal-v1/index.ts:4763` :

```ts
const dishOwnersTrace = {
  asked: eaterBudget?.dedicatedDishesAsked ?? 0,
  declared: meal.dish_owner_counts.declared,
  attributed: meal.dish_owner_counts.attributed,
  refused: meal.dish_owner_counts.refused,
};
```

Ce que la base porte réellement, sur les cinq plans que 3A cite :

```
{"asked": 6, "refused": 0, "declared": 2, "attributed": 2}
```

Le rapport l'écrit `{asked: 6, declared: 2, attributed: 2}` — **`refused: 0` est
retiré**, et c'est précisément le nombre que le briefing commun exige de ne
jamais perdre. Contre-épreuve sur agrégat : `count(*) filter (where refused <> '0')` = **0**
sur les 11 plans du foyer.

## 2.2 · Ce que `refused: 0` dit, et pourquoi ça change la lecture

`refused` compte les `for_member_id` **rejetés** par la porte d'attribution
(`meal_generation.ts:4544-4560` : plat partagé, ou id hors de `dishBearers`).
`refused: 0` veut donc dire : **aucune attribution n'a été refusée**.

Et la population des quatre nombres est documentée
(`meal_generation.ts:922-924`) : *« les plats finalement gardés. Un plat évincé
par le plafond ne compte dans aucun des quatre »*.

⇒ **`declared: 2` ne veut PAS dire « le modèle n'a nommé que deux propriétaires ».**
Vérifié sur les sorties brutes archivées — j'ai compté les occurrences de
`for_member_id` dans la réponse du modèle **avant** le parseur :

| run | `for_member_id` déclarés par le modèle | `declared` archivé |
|---|---|---|
| `separate_sessions/run-1` | **6** (3 bouches × 2 repas) | 2 |
| `separate_sessions/run-2` | **6** | 2 |
| `one_session/run-D1` | **6** | 2 |
| `one_session/run-1` | **3** | 3 |

Le compteur est donc **aveugle au plafond** — par conception assumée, et la
perte n'est lisible que dans les `issues`. C'est vrai, mais **le rapport
présente `declared: 2` comme le constat**, ce qui inverse la responsabilité :
le modèle a obéi, c'est le budget qui a jeté.

## 2.3 · ⭐ Le contre-exemple que le rapport n'a pas compté : `{6, 3, 3}`

Sur les **six** plans de ce foyer qui ont servi la consigne ②, **cinq** portent
`{6,0,2,2}` — et **un** porte `{asked: 6, refused: 0, declared: 3, attributed: 3}` :

```
699f1021 | 01:51:26 | one_session | {"asked": 6, "refused": 0, "declared": 3, "attributed": 3}
869a240a | 01:53:50 | separate_sessions | {…, "declared": 2, "attributed": 2}
00c0e337 | 02:02:27 | separate_sessions | {…, "declared": 2, "attributed": 2}
43ee0fb2 | 02:13:42 | one_session | {…, "declared": 2, "attributed": 2}
2a9a19bd | 02:25:12 | one_session | {…, "declared": 2, "attributed": 2}
617ab89c | 02:57:43 | one_session | {…, "declared": 2, "attributed": 2}   ← lot 07, POST-correctifs
```

`699f1021` est **le propre `one_session`/run-1 de 3A**. Les propriétaires y sont
Aurèle **et Marceline et Solveig** :

```
699f1021 | 4 plats | -@wed/dinner , c278b5dc@wed/dinner , f5c81e2b@wed/dinner , c9656ee5@wed/dinner
```

Le §B du rapport le montre correctement (les trois ont « wed/dîner »), **mais le
§C.4 l'exclut de son dénominateur** — il ne retient que « les trois runs qui ont
servi la consigne ② », alors que celui-ci l'a servie aussi. La phrase *« Marceline
0·0·0, Solveig 0·0·0 »* et *« une personne obtient systématiquement le plat des
autres »* est donc **plus forte que la mesure** : sur 4 runs de 3A servant ②,
**3 donnent tout à Aurèle, 1 donne à tout le monde**.

**Pourquoi ce run-là a tenu** : le modèle n'a couvert que le dîner
(`empty_slots: wed/lunch`), donc 1 plat de table + 3 dédiés = **4 plats
exactement**, le budget. Le plafond n'a pas eu à choisir. **Le mécanisme reste
celui de §D.1** : soit deux bouches perdent leur plat, soit toute la table perd
un repas.

## 2.4 · Verdict ②

- « `{asked:6, declared:2, attributed:2}` cinq fois, toujours au même
  bénéficiaire » : ✅ **exact** — cinq plans, toujours `c278b5dc` (Aurèle), rejoué
  en base sur deux formes de requête.
- « le compteur n'a pas escamoté un nombre » : ⛔ **il l'a escamoté** —
  `refused: 0`, et il **dit quelque chose** : la perte n'est pas un refus
  d'attribution, elle est en amont, au plafond de plats.
- « c'est systématique » : ⚠️ **non** — un run sur quatre a servi les trois plats.
- **Toujours vrai aujourd'hui** : `617ab89c` (02:57 UTC, après les deux lots)
  porte encore `{6, 0, 2, 2}` et ses quatre `issues` de plafond.

---

# ③ LE FACTEUR DE PART — ✅ CONFIRMÉ, ET **LA CAUSE NOMMÉE EST FAUSSE**

## 3.1 · Les chiffres, reproduits au millième par le code d'aujourd'hui

`2026-08-19-0530-3v-factors.ts` appelle `householdMouthFactors` — la fonction
réellement branchée — sur les quatre corps de la fixture (relus en base) et
l'allure du maître (`student_goals.target_pace_kg_per_week = 0.4`) :

| bouche | entretien (kcal/j) | chaîne **corps** | chaîne **objectif** | facteur appliqué | rel. Aurèle |
|---|---|---|---|---|---|
| Aurèle 92 kg, sédentaire, `fat_loss` | 2713 | **1,1574** | **0,8378** | 0,9697 | **1,000** |
| Solveig 55 kg, `trains_hard`, `muscle_gain` | 2446 | 1,0435 | **1,0000** (`no_pace`) | 1,0435 | **1,076** |
| Marceline 74 kg, `on_feet`, `muscle_gain` | 2279 | 0,9723 | **1,0000** (`no_pace`) | 0,9723 | **1,003** |
| Théodule 29 kg, 9 ans | 1938 | 0,8268 | **1,0000** (`minor`) | 0,8268 | **0,853** |

3A avait mesuré **1,000 / 1,077 / 1,003 / 0,852** sur les grammes des boîtes.
**Reproduit à l'arrondi près, sans un run.** ✅ L'affirmation tient, et elle
tient **encore aujourd'hui** — c'est le code post-lot-portions que j'ai exécuté.

## 3.2 · ⛔ « La part suit la moyenne de la table, pas le corps » est FAUX

C'est le titre du §D.4 et il inverse le mécanisme.

`bodyShareFactors` (`household_portions.ts:2213-2226`) rend
`factor_i = kcal_i / moyenne(kcal)`. **Diviser par une constante ne comprime
rien** : le rapport de deux facteurs est *exactement* le rapport de deux
entretiens. La moyenne de la table est une **normalisation**, pas un
aplatissement — elle existe pour conserver la production de la casserole, et
elle est mathématiquement incapable de rapprocher deux bouches.

La chaîne du corps, seule, donne : **1,000 / 0,902 / 0,840 / 0,714**. Elle suit
donc le corps, franchement, sur 40 % d'amplitude.

**Ce qui rapproche Aurèle et Marceline à 0,3 %, c'est la chaîne d'OBJECTIF** :
Aurèle porte `fat_loss` à 0,4 kg/semaine ⇒ **×0,8378**. Personne d'autre ne
porte de facteur d'objectif.

---

# ⭐ LA QUESTION NEUVE — LES ÉCARTS DE PART SONT-ILS DÉFENDABLES ?

C'est le point que le lot des portions n'a pas posé. Ma réponse, motivée, est :
**deux des trois écarts sont justes et le troisième est un vrai défaut — mais
pas celui que 3A a nommé.**

## A · « Deux adultes séparés de 18 kg finissent à 0,3 % l'un de l'autre » — **DÉFENDABLE**

Ce n'est pas 92 kg contre 74 kg. C'est :

- **un homme de 92 kg, sédentaire, 39 ans, qui perd du poids à 0,4 kg/semaine**
  ⇒ 2713 × 0,8378 = **2273 kcal/j visés** ;
- **une femme de 74 kg, debout toute la journée, 47 ans, à l'entretien**
  ⇒ **2279 kcal/j**.

2273 contre 2279. **L'écart de 0,3 % est le bon résultat**, pas un artefact. Les
18 kg sont réels et ils sont *compensés* par trois faits également réels : le
sexe (−161 kcal de BMR), le cran d'activité (1,45 contre 1,65, soit +14 %), et
surtout **la direction demandée**. Un plan qui servirait 20 % de plus à l'homme
qui a demandé à maigrir serait le défaut, pas l'inverse.

**La phrase de 3A est vraie et l'inférence est fausse** : elle présente comme
une insensibilité au corps ce qui est la composition correcte de deux
sensibilités.

## B · « Un enfant de 29 kg à 85 % de l'assiette d'un homme de 92 kg » — **DÉFENDABLE, mais mal cadré**

- Contre l'**entretien** d'Aurèle, l'enfant est à **71,4 %** (1938 / 2713).
- Contre la **cible** d'Aurèle (en déficit), il est à **85,3 %**.

Les 85 % ne comparent donc pas un enfant à un adulte : ils comparent un enfant à
un adulte **au régime**. 1938 kcal/j pour un garçon de 9 ans, 29 kg, actif, c'est
`estimatedChildMaintenanceKcal` avec PAL 1,65 et une allocation de croissance —
une valeur haute mais dans la fourchette FAO/WHO/UNU, et le fichier assume
explicitement la direction d'erreur (« surestimer un besoin ferait servir plus
que nécessaire — direction d'erreur bien moins grave que l'inverse »).

**Verdict : arithmétiquement juste, rhétoriquement trompeur.** Si l'on veut
juger l'écart enfant/adulte, il faut le lire sur la chaîne du corps (71 %), pas
sur le produit.

## C · ⛔ LE VRAI DÉFAUT — **une direction déclenche un plat mais ne dimensionne rien**

Regardez la colonne « chaîne objectif » du tableau 3.1 :

| bouche | objectif déclaré | facteur d'objectif | motif |
|---|---|---|---|
| Aurèle (**avec** compte, rythme réglé) | `fat_loss` | **0,8378** | `sized` |
| Solveig | `muscle_gain` | **1,0000** | **`no_pace`** |
| Marceline | `muscle_gain` | **1,0000** | **`no_pace`** |
| Théodule | — | 1,0000 | `minor` |

Deux bouches sur quatre ont déclaré `muscle_gain` **par la RPC que l'écran
appelle** (`keel_household_add_member(…, 'muscle_gain')`), et leur part est
**exactement celle de quelqu'un sans objectif**.

La cause : `memberTargetFactor` → `mouthTargetFactor` exige un `paceKgPerWeek`.
Le générateur le cherche à deux endroits (`index.ts:4629-4661`) :
`household_members.target_pace_kg_per_week` pour le roster,
`student_goals.target_pace_kg_per_week` pour les comptes. En base :

```
 first_name | target_pace_kg_per_week |    goal     | has_account
 Aurele     |                         |             | t     (le rythme est dans student_goals: 0.4)
 Marceline  |                         | muscle_gain | f
 Solveig    |                         | muscle_gain | f
 Theodule   |                         |             | f
```

⚠️ **Ce n'est PAS un champ sans écrivain** — je l'ai cru, et c'est faux. La
porte existe et elle est appelée :
`keel_household_set_member_target` (migration `20260818190000`) ←
`setMemberTarget()` (`frontend/src/keel/api/mouthProfile.ts:76`) ← `SetupPage`.
⚠️ **Et ce n'est pas non plus un défaut muet** : le plan l'archive.
`generated_from.household.box_sizing.mouths` de `617ab89c` porte
`{"minor": 1, "sized": 1, "no_pace": 2, …}` — **le 2 est là, nommé.**

**Le défaut est donc un défaut de MODÈLE PRODUIT, pas de câblage, et il est
précis :**

| la même déclaration `muscle_gain`, deux lecteurs, deux réponses opposées |
|---|
| `servingConflicts` / `servingDemandsFor` — **« cette bouche a-t-elle besoin de son propre plat ? »** → lit **la direction seule**. Solveig et Marceline **divergent** (`protein:larger`), c'est archivé dans les **six** plans (`cooking.diverging`) et c'est ce qui a fait ouvrir le barreau ②. |
| `mouthTargetFactor` — **« combien lui sert-on ? »** → exige **un rythme**. Sans lui, **facteur 1,000**, comme quelqu'un qui n'a rien demandé. |

⇒ **C'est ça, l'écart injuste** : le foyer ouvre un second plat pour une
direction qu'il refuse ensuite de dimensionner. Une bouche à qui l'on promet
« un plat à toi parce que tu vises la prise de masse » reçoit, dans ce plat, la
part de quelqu'un qui ne vise rien. Et le chemin par défaut du produit y mène
tout seul : `keel_household_add_member` prend un **objectif** en argument et
**pas** de rythme, donc toute bouche ajoutée est dans cet état tant que
personne n'ouvre son formulaire.

**Ce que je recommanderais de trancher** (hors de mon périmètre, je ne corrige
rien) : soit les deux lecteurs exigent la même chose — une direction sans
rythme ne fait alors **pas** diverger non plus —, soit une direction sans rythme
reçoit un cran par défaut. L'état actuel est le seul qui ne se défend pas :
**assez de direction pour coûter un plat, pas assez pour peser un gramme.**

## D · Un dernier fait à ne pas perdre

Le facteur est appliqué **aux grammes d'une boîte** et borné par ce que la
casserole produit (`capped_by_pot`). Sur un pot partagé, mettre à l'échelle les
grammes par le rapport des besoins énergétiques est le geste juste — la densité
est la même pour tout le monde puisque c'est le même plat. Aucune réserve de ce
côté-là.

---

# ④ LE DÉGOÛT — ⚠️ RÉSULTAT CONFIRMÉ, MÉTHODE ET INFÉRENCE FRAGILES

## 4.1 · Le dénominateur est **honnête** — vérifié indépendamment

3A annonce « le modèle a mis de la patate douce de lui-même dans **4 plans sur
6** ». J'ai recompté sur les **sorties brutes du modèle** (pas sur les plans
écrits), ce qui est le bon dénominateur :

| run (pré-delta) | `sweet potato` dans la sortie brute |
|---|---|
| `one_dish/run-1` | 0 |
| `one_dish/run-2` | **36** |
| `one_dish/run-3` | **24** |
| `one_session/run-1` | **51** |
| `separate_sessions/run-1` | 0 |
| `separate_sessions/run-2` | **54** |

**4 sur 6, exactement les quatre runs que 3A nomme.** ✅ Le dénominateur est
mesuré, pas supposé, et il tient sur les deux surfaces (brut et plan écrit).

## 4.2 · Le delta atteint bien le prompt — ✅

`one_dish/run-D1/dump/prompt-user.txt` l. 243 et
`one_session/run-D1/dump/prompt-user.txt` l. 269 :
`- Marceline: never serve sweet potato`. Les empreintes de prompt bougent de
**+6 octets** exactement (`fennel` → `sweet potato`), et rien d'autre.

## 4.3 · Le résultat est vrai : 0 patate douce servie, dans les deux modes — ✅

Vérifié en base sur `preparations[].ingredients`, `dishes[].ingredients`,
`dishes[].method`, les titres et `shopping_list` des deux plans post-delta
(`097693a2`, `2a9a19bd`) : **0 occurrence**. Et je l'ai revérifié dans la sortie
brute du modèle : **0 ingrédient de patate douce**, partout.

## 4.4 · ⛔ Mais la moitié `one_session` de la conclusion ne tient pas telle qu'écrite

3A écrit : *« il sait parfaitement dédoubler une préparation pour un régime, **il
ne le fait pas pour un dégoût** »*. La sortie brute de `one_session/run-D1` dit
l'inverse : le modèle a écrit **deux plats dédiés à Marceline** dont la
justification est, mot pour mot :

```
dishes[2]  for_member_id = f5c81e2b (Marceline)  wed/lunch
  why: "This beef-based dish avoids sweet potato and provides the smoky
        profile Marceline requested."
dishes[6]  for_member_id = f5c81e2b (Marceline)  wed/dinner
  why: "A smoky, warm dinner for Marceline that avoids sweet potato and uses
        cauliflower as the loud vegetable."
```

Le modèle **a bien compris la règle comme personnelle** et **a bien composé pour
elle**. Ces deux plats n'apparaissent pas dans le plan écrit parce que
`dishes[2]` a été **évincé** et `dishes[6]` **jeté** par le plafond de 4 plats
(les quatre `issues` de `2a9a19bd` le nomment).

Deux conséquences que le rapport ne pouvait pas voir en ne lisant que le plan :

1. **La « sur-application à toute la table » en `one_session` n'est pas
   démontrée.** Ce qui est démontré, c'est qu'aucune *préparation* ne contenait
   de patate douce — ce qui est **structurel**, puisque toutes les préparations
   sont partagées et que Marceline mange de toutes.
2. **Le mot du dégoût est sorti six fois en clair dans la prose du modèle**, en
   négation, et la garde `house_rule_commented` **ne l'a jamais vu** : ses deux
   porteurs avaient été jetés par le plafond avant. Aucune `issue`
   `house_rule_commented` sur `2a9a19bd`. La garde a été **sauvée par un
   accident**, pas par sa position.

## 4.5 · L'inférence est faible, et ce n'est pas dit

Base 4/6 (p = 0,667), 2 runs post-delta, 0 occurrence ⇒ **P ≈ 0,11 sous
l'hypothèse nulle**. Une chance sur neuf d'obtenir ce résultat par tirage. Le
rapport présente ça comme établi (« Réponse à la question ③ »). Ça mérite d'être
requalifié en **indice fort, pas en preuve** — d'autant que la moitié
`one_session` repose, on vient de le voir, sur deux plats supprimés par un
plafond.

## 4.6 · Une précision à ajouter : il **existe** une garde sur le dégoût servi

3A écrit « rien ne le compte : aucune `issue`, aucun compteur ». C'est vrai de
la **sur-application** (retirer de toute la casserole) — et il n'y a rien à
redire. Mais il faut savoir que la **violation**, elle, est verrouillée :
`applyHouseRuleLock` (`index.ts:4327-4340`) refuse le plan entier en **422
`house_rule_violated`** si l'aliment est réellement servi, et scrube+compte le
commentaire (`house_rule_commented`).

⚠️ Et la limite que 3A a raison de nommer est confirmée en base : le verrou
porte sur `mealDishesPayload(meal)` — les **plats gardés** — et **pas** sur
`member_portions[].portion_note`. Preuve vivante, plan `43ee0fb2` :
`member_portions[Marceline].portion_note` = *« …with the peppers on the side.
**Ensure no fennel is used.** »*, plan écrit, **aucune** `issue`
`house_rule_commented`. §D.6 est **confirmé**.

## 4.7 · Toujours vrai aujourd'hui ?

**Non vérifiable sans un run.** Ni le prompt (empreintes inchangées entre 02:19
et 03:24) ni `applyHouseRuleLock` n'ont bougé, mais la question « le modèle
obéit-il » est une question de sortie, et il n'existe **aucun plan post-lots avec
un dégoût candidat au menu**. Il faudrait relancer `one_session` sur le delta.

---

# ⑤ L'ALLERGIE — ✅ CONFIRMÉE, ET PLUS LARGEMENT QUE DIT

Balayage sur les **11** plans du foyer (`dishes`, `preparations`,
`member_portions`, `shopping_list`) :

- **Aucun aliment de la famille sésame servi.** 0 graine, 0 huile, 0 tahini,
  0 pâte. Sur les 8 plans de 3A **et** sur les 3 qu'il n'a pas comptés.
- **Toutes les occurrences du mot sont des négations**, et je les ai relues une
  par une :
  - `ca937ddb` : `flour tortillas (sesame-free)`, `chipotle paste (sesame-free)`,
    en courses `flour tortillas (check for sesame-free)` ;
  - `4d2fba8b`, `097693a2`, `617ab89c` : `sesame-free chipotle paste`,
    `harissa paste (sesame-free)` ;
  - `699f1021` : `dishes[].why` = « A safe, smoky meal **for Solveig** that
    avoids sesame entirely » ;
  - `00c0e337` : `member_portions[**Solveig**].portion_note` = « **Ensure no
    sesame is present.** » ;
  - `43ee0fb2` : `member_portions[**Solveig**].portion_note` = « **Absolutely no
    sesame products.** ».
- **L'attribution est correcte partout** : quand une bouche est nommée, c'est
  **Solveig**, jamais une autre. Aucun contre-motif « garde-le loin d'elle » —
  le risque du lot 06 n'est pas réalisé, y compris sur les 3 plans post-lots.
- **Portée non restreinte** : la casserole entière est protégée dans les 11
  plans, `one_dish` comme `one_session`.

⚠️ La réserve de 3A reste entière et je la reprends : **rien dans ces menus
n'appelait naturellement du sésame**. C'est un test à faible pouvoir. Le seul
delta fait dans ce lot portait sur le dégoût, pas sur l'allergène.

**Toujours vrai aujourd'hui** : oui, et prouvé par des plans **postérieurs** aux
deux correctifs (`617ab89c`, `3ed160d7`).

---

# ⑥ LA PHRASE DE PLAN FAUSSE — ✅ CONFIRMÉE, ORIGINE ÉTABLIE

## 6.1 · Elle est bien en base

`student_generated_meals.generated_from->'rationale'->'lines'`, plans `869a240a`
et `00c0e337` (les deux `separate_sessions`) :

```
"The shared dish is vegan: that is what Theodule eats.",
"You left room for separate dishes. Nobody at this table needs one this week: there is a single cook.",
```

Dans le **même** `generated_from`, le même plan porte
`cooking.diverging = [c278b5dc, f5c81e2b, c9656ee5]` — **trois** bouches.

## 6.2 · D'où elle vient, ligne par ligne

1. **La copie** : `_shared/keel/plan_rationale.ts:410-412`, clé `shapeUnused` :
   `"You left room for separate dishes. Nobody at this table needs one this week: there is a single cook."`
2. **Le déclencheur** : `plan_rationale.ts:688-699` —
   `else if (shape.unused) lines.push(copy.shapeUnused)`.
3. **La prémisse** : `index.ts:4513-4517` construit `cookingShapeChoice` avec
   `unused: shapeCap.unused` **et** `outsideSharedPot: divergingMembers.map(displayName)`.
   Les deux faits sont **dans le même objet** : au moment où le code dit
   « personne n'en a besoin », il tient la liste des trois qui en ont besoin.
4. **Pourquoi `unused` est vrai** : `capCookingShape("one_session",
   "separate_sessions")` ⇒ `{capped: false, unused: true}` — l'arithmétique de
   §① , et rien d'autre. La branche a été écrite pour une **fusion**, où
   `unused` implique bien « aucun conflit ». En composition, elle est déclenchée
   par un rang, pas par un constat.

## 6.3 · « there is a single cook » n'a **aucune** prémisse

Vérifié : aucun champ de la requête, du roster, de `practical_constraints` ou
des `PlanRationaleFacts` ne porte un nombre de cuisiniers. `grep -n "cook"` sur
`plan_rationale.ts` ne rend que `mergedIn` et cette ligne. **C'est une assertion
en dur.**

## 6.4 · Toujours vraie aujourd'hui

**Oui.** `plan_rationale.ts` n'a pas été modifié depuis le 2026-08-15,
`capCookingShape` est inchangé, et j'ai réexécuté la matrice : le couple
(`computed=one_session`, `asked=separate_sessions`) rend encore
`unused: true`. **Non périmée.**

---

# ⑦ §D.1 — LE BUDGET DE PLATS : ✅ CONFIRMÉ, ET ENCORE VIVANT

## 7.1 · L'arithmétique, rendue par le code

`mergeDishBonus` (`household_portions.ts:970`) rend
`max(1, min(max(shown, asked), ceiling))` avec `ceiling = baseCap`. Donc
**budget ≤ 2 × baseCap** quoi qu'il arrive, pendant que la consigne réclame
`(1 + N) × baseCap`. Rendu par `2026-08-19-0530-3v-shape-budget.ts` :

```
jours=1  baseCap=2   divergents=3  demandé=8   budget=4   -> 4 plats manquants
jours=7  baseCap=14  divergents=3  demandé=56  budget=28  -> 28 plats manquants
```

Les deux nombres du rapport (4 et 28) sont **exacts**. Structurel, pas un effet
de la fenêtre d'un jour. ✅

## 7.2 · Le coût, lu dans les `issues` en base

```
869a240a: dishes[4]: over the 4-dish cap for day -- kept, and the surplus dish
          "Smoky bean stew with roasted chicken and broccoli" (wed/lunch) was dropped instead
          dishes[5]: … dropped instead
          dishes[6]: over the 4-dish cap for day, dropped
          dishes[7]: over the 4-dish cap for day, dropped
```

Le même bloc de quatre `issues` sur `00c0e337`, `43ee0fb2`, `2a9a19bd` et
`617ab89c`. **Cinq plans, quatre plats jetés à chaque fois.** ✅

## 7.3 · Non périmé

`617ab89c` est un run du **lot 07**, à **02:57 UTC**, donc **après** le lot des
portions et le lot de la ceinture. Il porte encore
`{6, 0, 2, 2}` et les quatre `issues` de plafond. **§D.1 est ouvert
aujourd'hui.**

---

# ⑧ §D.2 — LA CEINTURE DE RÉGIME : ⛔ **PÉRIMÉE**, ET LA PREUVE VIVANTE EXISTE DÉJÀ

C'est la conclusion la plus importante de cette vérification.

## 8.1 · La ceinture est branchée, et elle est **comptée**

`generated_from.household.regime_belt` existe désormais et il est **écrit** :

```
699f1021 … 2a9a19bd   (01:51 → 02:25)   regime_belt = NULL      ← les 9 runs de 3A
617ab89c  02:57:43    {"kept": 3, "mouths": 1, "checked": 3, "refused": 0, "silenced": 0, "unknown_mouth": 0}
3ed160d7  03:25:47    {"kept": 4, "mouths": 1, "checked": 4, "refused": 0, "silenced": 0, "unknown_mouth": 0}
```

La présence du compteur sur les deux derniers plans **prouve par observation**
que le runtime edge servait bien le module modifié — c'est la fraîcheur exigée
par le briefing, établie par une trace et pas par confiance.

## 8.2 · ⭐ LE PLAN MIXTE EXISTE — c'est `617ab89c`, celui que le rapport dit d'ignorer

Le §G du rapport signale « une lane voisine écrit dans mon foyer » et conclut :
*« Aucun plan de ce foyer postérieur à 02:26 UTC ne m'appartient. Ne les lisez
pas comme des runs de l'étape ③ »*. C'était prudent — et ça a **enterré la seule
preuve vivante du correctif**.

`617ab89c` est le `run-1` du **lot 07 lui-même**
(`scratchpad/qa-generation/07-ceinture-regime/run-1/`, `cooking_shape:
one_session`, servi par `gemini-3-flash-preview` à 02:57:43). Ce n'était pas une
lane inconnue : c'est le lot de la ceinture, sur la fixture de 3A.

**Ce qu'il contient**, lu en base par une jointure latérale sur les boîtes :

| préparation | bouches dans les boîtes |
|---|---|
| **Smoky Harissa Chicken Thighs** | `c278b5dc`, `c9656ee5`, `f5c81e2b` — **les trois omnivores** |
| **Slow-Simmered BBQ Chickpeas** | `1fea4f51` — **Théodule seul** |
| Herby Fluffy Quinoa | les quatre |
| Charred Courgettes and Sweetcorn | les quatre |

Et la phrase lue à table :

```
Theodule : "Mix the smoky chickpeas, quinoa, and charred vegetables together on
            the plate. — Slow-Simmered BBQ Chickpeas 413 g · Herby Fluffy
            Quinoa 186 g · Charred Courgettes and Sweetcorn 331 g"
Aurele   : "… — Smoky Harissa Chicken Thighs 242 g · Herby Fluffy Quinoa 218 g …"
```

⇒ **Un plan MIXTE — viande pour les trois adultes, aucune ligne de viande pour
l'enfant végane.** C'est très exactement le cas que la réserve de poste disait
manquant. **Il n'a pas manqué : il était sur le disque, et il a été écarté.**

Les six plans ② antérieurs (`699f1021`, `869a240a`, `00c0e337`, `43ee0fb2`,
`2a9a19bd`, plus le pré-belt) mettent tous de la viande dans la phrase de
Théodule — j'ai revérifié les cinq de 3A un par un. **Le septième, post-ceinture,
ne le fait plus.**

## 8.3 · ⚠️ MAIS LA CEINTURE N'A TOUJOURS PAS MORDU

`refused: 0` sur les deux plans post-lot. Le compteur dit :
« 1 bouche à régime, 3 boîtes examinées, 3 gardées, 0 refusée ».

Autrement dit : **le modèle a séparé correctement de lui-même**, et la ceinture
n'a fait que confirmer. Elle est **armée et observable** — ce qui referme le
défaut d'instrumentation que 3A dénonçait à juste titre (« un run vert et un run
qui sert de la viande à un enfant végane sont le même run ») — mais **sa morsure
n'est prouvée que hors modèle**, par les épreuves de mutation du lot 07.

⇒ La bonne formulation aujourd'hui : *la ceinture existe, elle est branchée, elle
se compte, et un plan mixte correct a été mesuré. Il manque encore un run réel
où `refused > 0`.*

## 8.4 · Ce qui reste de §D.2

- « `scanDietaryRegime` a zéro appelant sur la lane foyer » : **périmé**, la
  garde a été déplacée dans `parseGeneratedMeal` avec un paramètre **requis**
  (`boxMemberDiets`).
- « aucun compteur, aucune `issue`, aucun journal » : **périmé**,
  `regime_belt` porte six nombres et il est en base.
- « cinq plans ② sur cinq servent de la viande à l'enfant » : **exact au moment
  de la mesure**, et **plus reproduit** depuis.

---

# ⑨ AUTRES POINTS VÉRIFIÉS AU PASSAGE

| point du rapport | verdict |
|---|---|
| §C.1 « nommée : 24/24, `portion_missing` jamais levé » | ✅ confirmé en base : 4 lignes `member_portions` sur chacun des 11 plans, toutes avec un prénom résolu |
| §D.5 « un guillemet parasite coûte le plan entier » | ✅ cohérent — `one_session/run-2` n'a écrit aucun plan ; ⚠️ mais son `plan-written.json` archive le plan de `one_dish/run-2` (`4d2fba8b`), voir ci-dessous |
| §D.6 « la garde ne couvre pas la phrase de portion » | ✅ confirmé sur `43ee0fb2` |
| §E « le run-3 abandonné a écrit `43ee0fb2` » | ✅ confirmé : `43ee0fb2` à 02:13:42, `{6,0,2,2}`, viande chez Théodule |
| §G « une lane voisine écrit dans mon foyer » | ✅ confirmé, mais **identifiée** : c'est le lot 07, runs 1 à 5 |

## ⚠️ Un défaut du HARNAIS de 3A, à connaître avant de relire ses archives

`run.sh` archive le plan par
`… order by created_at desc limit 1` — **le dernier plan du foyer**, pas celui
du run. Quand un run échoue, le fichier `plan-written.json` contient donc
**silencieusement le plan du run précédent**. Constaté trois fois :

- `one_session/run-2/plan-written.json` → `4d2fba8b` (le plan de `one_dish/run-2`) ;
- `07/run-2`, `07/run-3` et `07/run-4/plan-written.json` → `617ab89c`
  (le plan de `07/run-1`).

Et la requête d'archive **ne sélectionne pas `dish_owners`** (elle rend
`cooking`, `box_sizing`, `attribution`, `rationale`). Les `{6,2,2}` du rapport ne
viennent donc pas de ces fichiers — ils ont été lus ailleurs. Ils sont **justes**
(je les ai rejoués en base), mais la trace n'est pas dans le dossier : c'est une
entorse à la règle des trois fichiers qu'il faut connaître.

---

# CE QUE JE REMONTE, EN TROIS LIGNES

1. ⛔ **Le seul défaut de ce rapport qui inverse une conclusion** : §D.4 attribue
   à « la moyenne de la table » un aplatissement dont elle est mathématiquement
   incapable (diviser par une constante conserve les rapports). La vraie cause
   est la chaîne d'objectif — et derrière elle, une asymétrie de produit : une
   direction **sans rythme** fait diverger une bouche (`servingConflicts`, donc
   un second plat) mais ne dimensionne pas sa part (`no_pace`, facteur 1,000).
2. ⛔ **§D.2 est périmé et sa preuve de correction dormait dans le §G** : le plan
   `617ab89c`, écarté comme « lane étrangère », est le premier plan **mixte** de
   ce foyer et l'enfant végane n'y reçoit aucune viande.
3. ✅ **Les trois blocages de fond tiennent** : deux consignes pour trois modes,
   le budget de plats qui promet 8 et n'en ouvre que 4 (revérifié post-lots), et
   la phrase « Nobody at this table needs one this week » servie à trois
   divergents.
