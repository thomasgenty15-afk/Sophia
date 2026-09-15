# L1-A — LOT SOCLE : trois objectifs, le niveau d'activité, le renversement du mineur

**Date** 2026-08-18 11:29 · Branche `ff-001-quotidien-du-coach` · Commit `e253fc19`
**Aucun push, aucun merge.** Migration `20260818100000` appliquée en local.

---

## 0. Ce qui est livré, en une page

| # | Ce que c'est | Où |
|---|---|---|
| ① | Six objectifs → **trois** (`fat_loss` · `maintenance` · `muscle_gain`) | `tokens.ts` + migration |
| ② | **Poids visé + rythme**, borné par le plus petit de trois nombres | `weight_pace.ts` (neuf) |
| ③ | **Niveau d'activité** — quatre crans, deux colonnes, deux équations | `tokens.ts` · `meal_envelope.ts` · `energy_target.ts` |
| ④ | **Un mineur porte les trois objectifs** — deux portes ouvertes, un défaut réel corrigé | migration · `household.ts` · `household_portions.ts` |

**Preuves** : Deno `3249 passed / 0 failed` · vitest `1187 passed / 3 failed` (les
trois sont d'autres lanes, §7) · `tsc -p tsconfig.app.json` exit 0 ·
`AGENT_GATE_STAGED_ONLY=1 ./scripts/agent-gate.sh` → **pass** · **14 mutations**,
13 mordent, 1 ne mord pas et c'est documenté (§6).

---

## 1. ① La table de migration des six jetons vers trois

```
fat_loss       ───────────────────►  fat_loss      (la balance descend)
muscle_gain    ───────────────────►  muscle_gain   (la balance monte)
maintenance    ─┐
recomposition  ─┤
performance    ─┼─────────────────►  maintenance   (la balance ne bouge pas)
health         ─┘
```

**L'autorité du repli n'est pas une opinion de ce lot** : `tokens.ts` portait
déjà, depuis le 2026-08-05, « *the axis that actually branches a generated week
is the DIRECTION OF THE SCALE: down, up, or neither* ». Et le dépôt avait
**mesuré** le voisinage des quatre nuances : `household_portions.ts` porte, daté,
« `health` rendait la chaîne de `maintenance` pendant des semaines sans que rien
n'échoue ».

### Le sort des lignes déjà écrites — elles sont **réécrites**, toutes

Compté sur la base locale avant/après :

| Table / colonne | Avant | Après |
|---|---|---|
| `student_goals.goal` | 45 `health` + 5 `recomposition` + 2 `maintenance` | **52 `maintenance`** |
| `household_members.goal` | 4 `health` + 6 `maintenance` | **10 `maintenance`** |
| `coach_doctrines.beliefs[].goal_scope` | 6 `recomposition` | **6 `maintenance`** |
| `coach_doctrines.arbitrations[].goal_scope` | 1 `health` | **1 `maintenance`** |
| `coach_food_rules` / `coach_timing_rules` | 0 | 0 |
| `coach_doctrine_compilations` | 23 lignes | **0 — purgé** |

> **Pourquoi les lignes, alors que la migration du 13/08 avait le droit de ne
> rien nettoyer.** Celle-là ajoutait une **garde** (« une garde qui dépendrait
> d'un nettoyage n'est pas une garde »). Celle-ci retire un **vocabulaire**, et
> une orpheline de vocabulaire ne se voit pas : elle sort en `undefined` d'un
> `Record`, ou en « n'atteint personne » d'une portée — c'est-à-dire qu'une
> conviction écrite pour la santé disparaîtrait en silence.

> **Le cache est PURGÉ, pas traduit.** Quatre variantes repliées sur une seule
> entreraient en collision sur la clé unique, et surtout : le texte compilé
> d'une variante `health` a été produit par un compilateur qui connaissait six
> portées. Il se recompile tout seul à la première lecture.

### Ce qui **garde** ses six jetons, et le retirer serait le bug

- **`household_portions.ts`, règles `portion.goal`** — c'est une **purge-list**
  du texte lu à voix haute à table, pas un vocabulaire. `recomposition`,
  `performance` et « santé » restent des mots qu'on ne prononce pas. Le type est
  passé à `Record<string, …>` **exprès** : le typage strict aurait supprimé trois
  cas de banc au premier passage du compilateur.
- **`RETIRED_GOAL_TOKENS` / `foldRetiredGoal`** (`tokens.ts`, neufs) — une
  migration nettoie les lignes, pas ce qui est **en vol** (onglet ouvert, client
  plus vieux, jsonb hors contrainte). ⚠️ Ce n'est **pas** un repli silencieux :
  `parseGoalToken` **lève** toujours (R7), `foldRetiredGoal` est une fonction
  séparée qu'un appelant doit nommer, et elle rend `null` sur l'inconnu.

### Les CHECK qui seraient devenus **inécrivables** — trouvés en chemin

Deux contraintes étaient adossées à des valeurs qui disparaissent. Les laisser
telles quelles rendait la colonne inécrivable **pour tout le monde**, en silence :

| Contrainte | Avant | Après |
|---|---|---|
| `student_goals_focus_axis_goal_check` | `goal in ('health','performance')` | `goal = 'maintenance'` |
| `student_goals_target_waist_goal_check` | `goal = 'recomposition'` | `goal = 'maintenance'` |

`student_goals_target_weight_goal_check` autorisait **déjà exactement**
fat_loss/muscle_gain/maintenance : la colonne du poids visé avait été écrite
contre les trois positions de la balance avant qu'on décide de n'en garder que
trois.

### Les arbitrages de repli, nommés (chacun a coûté une décision)

| Endroit | Ce qui se perd, et c'est assumé |
|---|---|
| `SERVING_DIRECTION` | « larger starch share **around training** » (`performance`) — une consigne conditionnée à des jours d'entraînement que le produit ne collecte pas, donc appliquée tous les jours |
| `PROTEIN_FLOOR_G_PER_KG` | `recomposition` passait de 2,0 à 1,6 g/kg — **le seul endroit du repli qui retire**. Contrepartie : il perd aussi la répartition par repas, et les deux venaient du même « il s'entraîne » que le jeton n'a jamais vérifié |
| `focusFor` | la 5ᵉ ligne de `performance` (seul objectif à 5). L'accent retenu est celui de `health` (45 élèves), pas celui de `maintenance` — sinon on retirait une ligne à tout le monde |
| `AXIS_QUESTION` (`plan_feedback`) | `energy_around_sessions` **supprimée du vocabulaire** : plus aucune dynamique ne la posait, et R6 refuse une valeur sans branche. `maintenance` reçoit `enough_variety`, la seule des trois qui survive au plancher TCA |
| `directionIsWorking` | la lecture du **tour de taille** de `recomposition`. Rattrapé en partie : `fat_loss` lit déjà `waistTrend === "falling"` |
| `CARB_TIMING_GOAL` | visait `performance` → **`muscle_gain`**, pas `maintenance`. Le repli mécanique aurait posé le timing des glucides sur la dynamique de qui ne s'entraîne pas forcément |
| `indicatorFor` (front) | `axisObjective` n'est plus levé par aucune dynamique. `focus_axis` reste écrivable en base ; c'est l'**écran** qui ne l'annonce plus. **Lot d'écran, pas de socle** |

---

## 2. ② Le poids visé et le slider — `weight_pace.ts`

```
max = MIN( 1 kg/semaine          ← MAX_KG_PER_WEEK
         , 1 % du poids/semaine  ← MAX_WEEKLY_BODY_FRACTION
         , ce qui garde la cible au-dessus du plancher d'énergie )
```

**Le cas du design, tenu sur la valeur** : 60 kg → le plafond absolu ne
s'applique pas, et la journée reste au-dessus du plancher. « 600 kcal/jour » est
refusable **par son nom** (`ENERGY_FLOOR_KCAL`), pas par accident.

### La décision que j'ai prise seul, et qu'il faut relire

**La troisième borne intègre le plafond de déficit A1** (`MAX_DAILY_DEFICIT_KCAL
= 500`, non débrayable). Raison : sans lui, le slider promettrait 1 kg/semaine à
une personne de 110 kg pendant que `envelopeCore` n'exécuterait que 500 kcal/j —
et la **date d'arrivée** calculée dessus serait fausse dès le premier jour.
L'invariant devient : *le maximum du slider est le rythme le plus rapide que la
composition sait réellement livrer* (testé par balayage 40→200 kg).

⚠️ **Conséquence honnête, et je préfère l'écrire que la maquiller** : les deux
premières bornes sont **dormantes** pour un adulte aujourd'hui — A1 est toujours
plus serré. Elles ne sont pas décoratives (elles tiennent le jour où A1 bouge),
et `ceilingFromBounds` est isolée sur des nombres nus **précisément** pour que
chacune ait un cas où elle gagne, sans ouvrir de porte de test dans
`paceCeilingFor` (« un paramètre de garde optionnel est une garde désarmée »).

### Autres décisions prises seul

- `roundPace` arrondit **vers le bas** : `Math.round(0.4750)` rendrait 0,50,
  c'est-à-dire un rythme que le calcul venait de refuser.
- `weeksToTarget` arrondit **vers le haut** : trop tôt = déception programmée.
- `KCAL_PER_KG_BODY_MASS = 7700` surestime la vitesse réelle → rend le plafond
  **plus serré** que la réalité, jamais plus lâche.
- `below_energy_floor` est un **backstop rare** : `implausible` (25 kg) attrape
  d'abord la plupart des cas. Il a un cas qui l'atteint (corps petit) et un cas
  qui ne le déclenche pas, tous deux testés.

---

## 3. ③ Le niveau d'activité

```
sedentary    Assis toute la journée, peu de marche
on_feet      Debout ou en mouvement une bonne partie du jour
trains_some  Sport 2 à 3 fois par semaine
trains_hard  Sport 4 fois ou plus, ou métier physique
```

**Collecte** : `profiles.activity_level` et `household_member_bodies.activity_level`
— nullables, **sans défaut** (un défaut ferait d'une non-réponse une réponse, et
cette réponse pèserait dans une estimation d'énergie). `keel_household_bodies_for`
a été **recréée** pour la rendre : sans ça la colonne serait décorative.

**Calcul** : `ACTIVITY_FACTORS` (FAO/WHO/UNU 2004 PAL : 1,45 / 1,65 / 1,80 /
2,00) remplace `ACTIVITY_FACTOR = 1.5`, qui **reste** comme facteur d'hypothèse
pour `null`. `energy_target.ts` gagne `ACTIVITY_KCAL_PER_KG` (26-29 / 28-31 /
30-33 / 32-36), et `null` rend **exactement 28-33** — le lien de constantes avec
`weekInFood.ts` porte sur celles-là et **tient sans modification du front**.

⚠️ **La garde de `energy_target_test.ts` n'a pas été levée, elle a été
précisée** : `ACTIVITY_FACTOR` et `estimatedMaintenanceKcal` restent **bannis**
de ce fichier (la constante devinée et sa fonction), et un assert neuf exige la
présence de `ACTIVITY_KCAL_PER_KG` — pour qu'on ne rouvre pas la porte en croyant
l'avoir déjà ouverte.

⚠️ **`childActivityFactor` : chez un enfant, le cran ne peut que MONTER**
(`Math.max(1.6, ACTIVITY_FACTORS[level])`). La case est cochée par le compte
**maître** ; laisser « assis toute la journée » retirer 9 % du besoin d'un corps
en croissance est la direction d'erreur qu'on refuse.

**Paramètres REQUIS partout** (`envelopeFor` 6ᵉ position, `MouthBody`,
`StudentBodySnapshot`, `maintenanceRange`) : c'est le compilateur qui recense les
appelants. Un `?` aurait laissé le lot construit sans être branché.

---

## 4. ④ Le renversement du mineur, et **ce qui protège à la place**

### Ce qui a été levé

- Les **deux** portes RPC (`keel_household_set_member_goal`,
  `keel_household_add_member`) : `goal_not_for_minor` supprimé des deux, dans le
  même commit. Le test `household.int.test.ts` vérifie désormais qu'aucune n'a
  gardé le refus, **et** que le vocabulaire à trois valeurs est sur les deux.
- `MINOR_FORBIDDEN_GOALS` **supprimée** des trois copies (front, Deno, SQL) —
  pas vidée : une liste vide encore consultée est une branche morte que le
  prochain lecteur reremplit au hasard.

### Le défaut réel, corrigé dans le même geste

`servingDirectionFor` (`household_portions.ts`) commençait par
`if (member.ageState === "minor") return CHILD_DIRECTION;` **avant** toute
lecture de l'objectif. On pouvait donc poser « prendre du muscle » sur un ado
depuis le 13/08 : la ligne s'écrivait, l'écran l'affichait, l'assiette ne
changeait pas. **La décision était en base, le comportement n'a jamais suivi.**

En le corrigeant j'ai trouvé le **doublon qui rendait le défaut facile à ne
réparer qu'à moitié** : `servingDemandsFor` portait sa propre branche `minor`.
Elle lit maintenant `servingDirectionFor` — une décision, jamais deux, et un test
le prouve sur les 3 × 4 combinaisons.

### Ce qui protège, et qui n'est **pas** un refus d'objectif

| # | La garde | Où elle vit |
|---|---|---|
| ① | **L'énergie** — `childEnvelopeFromBody` ne prend pas de paramètre `goal`. Pas un `if` qu'on oublie de rejouer : un paramètre qui n'existe pas. Maintenance Schofield **calculée sur l'âge**, quoi qu'il y ait en colonne | `meal_envelope.ts` |
| ② | **Le rythme** — l'écart quotidien d'un mineur vaut 10 % de **son** besoin estimé, pas les 500 kcal de l'adulte. ≈ 0,16 kg/semaine sur un enfant à 1 800 kcal | `weight_pace.ts` |
| ③ | **Le silence** — le corps d'un enfant n'est jamais **énoncé** (FF-047). C'est devenu la garde **principale** : sans elle, sa direction se lirait à table | `meal_body.ts`, inchangé |

Une **direction** est une consigne de service ; une **bande d'énergie** est un
déficit. On ouvre la première, jamais la seconde.

### ⚠️ LA QUESTION LAISSÉE OUVERTE — à trancher par l'utilisateur

> **Faut-il, EN PLUS, un accord explicite du maître pour poser « perdre du
> poids » sur un enfant ?**

Non implémentée, volontairement. L'inventer seul poserait une porte de
consentement dont personne n'aurait décidé la forme (case à cocher ? seconde
confirmation ? trace horodatée ? révocable ?), et une porte de consentement mal
posée est pire qu'aucune. La question est **écrite dans l'en-tête de la
migration** pour qu'elle ne se perde pas.

---

## 5. Ce que **L5 (le formulaire)** et **L8 (la cible)** devront lire

### L5 — le pop-up « une bouche »

| Ce qu'il lui faut | Où |
|---|---|
| Les trois choix | `GOAL_TOKENS` (`tokens.ts`) — **ordre** : `fat_loss`, `maintenance`, `muscle_gain` |
| Quand déplier les deux champs | `scaleDirectionOf(goal)` → `null` pour `maintenance` = **replié** |
| Le maximum du slider, et **laquelle des trois bornes a mordu** | `paceCeilingFor(direction, {body, isMinor})` → `{maxKgPerWeek, bound, dailyDeltaKcal}` ; `null` = pas de corps ⇒ **demander le corps, ne pas afficher de curseur** |
| Le pas du slider | `roundPace` — **0,05 kg/semaine** |
| Le refus du poids visé, **nommé** | `targetWeightRefusal(...)` → `implausible` \| `wrong_direction` \| `below_energy_floor` \| `null`. ⚠️ **Rendre le refus À CÔTÉ DU CHAMP** : trois fois dans `SetupPage`, un refus loin du geste s'est lu comme un bouton mort |
| La date d'arrivée | `weeksToTarget(current, target, pace)` — `null` = ne rien afficher |
| Les quatre crans d'activité | `ACTIVITY_LEVELS` (`tokens.ts`). ⚠️ **Pas de 5ᵉ cran « je ne sais pas »** : `null` (ne pas répondre) est déjà la réponse |
| Les colonnes à écrire | `household_members.target_weight_kg`, `.target_pace_kg_per_week`, `household_member_bodies.activity_level`, `profiles.activity_level` |
| La liste proposée à un enfant | `goalsForAge(kind)` — **la même que l'adulte** depuis aujourd'hui |

**Clés i18n** : je n'en ai **ajouté aucune** (aucun écran dans ce lot). Les clés
des jetons retirés sont **restées sur le disque** et sont désormais mortes :
`setup.goal.{recomposition,performance,health}`, `coach.goal.*`,
`household.goal.*`, `mealprep.goal.*`, `couples.goal.*`, `plan.goal.*`. **Je ne
les ai pas supprimées** : `SetupPage`/`HouseholdPage` appartiennent à L5/L6, et
la parité en/fr n'est pas rompue par des clés inutilisées. **À L5 de les
retirer** en même temps qu'il réécrit les écrans.

### L8 — la cible dans les grammages

| Ce qu'il lui faut | Où |
|---|---|
| L'enveloppe, avec l'activité | `envelopeFor(goal, body, ageBand, restrictionFlag, steering, **activityLevel**)` — 6ᵉ paramètre |
| Le besoin estimé | `estimatedMaintenanceKcal` / `estimatedChildMaintenanceKcal`, tous deux avec `activityLevel` **requis** |
| L'écart quotidien exécutable | `paceCeilingFor(...).dailyDeltaKcal` — déjà borné par A1 et par le plancher |
| Le plafond de surplus | `MAX_SURPLUS_FRACTION` — **dérivé** de `ENERGY_BANDS.muscle_gain.high`, jamais recopié |
| ⚠️ **La moitié non câblée** | Dans `generate-household-meal-v1`, le cran d'une bouche **qui a un compte** n'est pas lu : la lane charge des corps par `member_id`, pas des profils. Elle passe donc `lineBodies.get(...)?.activityLevel ?? null` — c'est-à-dire l'hypothèse 1,5, soit **exactement** le comportement d'avant. Rien ne se dégrade ; le chargement du profil par membre appartient à L8, qui traverse déjà cette résolution |
| ⚠️ Rappel | La cible **n'entre pas** dans le générateur ici. `energy_target.ts` porte toujours « elle n'entre pas dans le générateur (R6) », et `CALORIE_REVERSAL.md` §0 déclare la garde TCA (L4) bloquante |

---

## 6. Les mutations — 14, dont 13 mordent

| # | Mutation | Résultat |
|---|---|---|
| M1 | `servingDirectionFor` : rétablir l'écrasement du mineur | **ROUGE** / restauré vert |
| M2 | `goalApplies` : refuser à nouveau un mineur | **ROUGE** / vert |
| M3 | `childActivityFactor` : retirer le plancher `Math.max` | **ROUGE** / vert |
| M4 | `estimatedMaintenanceKcal` : ignorer le cran déclaré | **ROUGE** / vert |
| M5 | `maintenanceRange` : ignorer le cran déclaré | **ROUGE** / vert |
| M6 | `paceCeilingFor` : borner un mineur comme un adulte | **ROUGE** / vert |
| M7 | `ceilingFromBounds` : nommer le plafond absolu à égalité | **ROUGE** / vert |
| M8 | `roundPace` : arrondir au plus proche au lieu du bas | **ROUGE** / vert |
| M10 | `targetWeightRefusal` : mesurer au poids **actuel** | **ROUGE** / vert |
| M11 | `MAX_SURPLUS_FRACTION` : figer 0,30 au lieu de le dériver | **ROUGE** / vert |
| M12 | `childEnvelopeFromBody` : lui ouvrir un paramètre `goal` | **ROUGE** / vert |
| M13 | `GOAL_TOKENS` : réintroduire `health` | **ROUGE** / vert |
| M14 | `energyFloorFor` : servir le plancher `other` à tout le monde | **ROUGE** / vert |
| **M9** | `targetWeightRefusal` : sortir le mineur **après** le calcul | **VERT — n'a pas mordu** |

### M9 — la mutation qui n'a pas mordu, et ce qu'elle a révélé

Muter le calcul pédiatrique de `targetWeightRefusal` ne faisait rougir **aucun**
test. Cause : le résultat était calculé **puis jeté** par un `return null`
inconditionnel juste en dessous — **du code mort qui ressemblait à une garde**.

**Corrigé** : le mineur sort maintenant **avant** tout calcul.

En durcissant, une seconde découverte : retirer aussi cette sortie ne mord
toujours pas, parce que `ageBandOf` rend `null` sous dix-huit ans — la comparaison
au plancher adulte est donc **inatteignable** pour un mineur, par construction.
**La ceinture est double, et les deux moitiés sont voulues.** Un test neuf
(`le plancher ADULTE est INATTEIGNABLE pour un mineur — deux ceintures`) le dit
explicitement, pour qu'on ne « nettoie » pas la sortie explicite en croyant
retirer du code mort — l'idée d'étendre `AgeBand` aux tranches pédiatriques a
déjà été envisagée et écartée, et elle reviendra.

---

## 7. Ce qui reste rouge, et à qui

| Rouge | À qui |
|---|---|
| `src/edge/coverage-guard.int.test.ts` (2 cas, 54 vs 52) | **Autres lanes.** Ma migration contient **0 `create trigger`** et je n'ajoute **aucune** fonction edge ; le fichier de garde est inchangé dans `git log` |
| `src/keel/copy/planRefusals.int.test.ts` | **Autre lane.** `planRefusals.ts` est modifié dans l'arbre par quelqu'un d'autre, avec un commentaire qui **assume** le rouge le temps que les générateurs émettent les deux jetons |

Aucun rouge de mon périmètre.

---

## 8. Notes de procédure

- **`supabase migration up` a refusé de tourner** : le CLI voulait
  `--include-all` pour appliquer d'abord **7 migrations plus anciennes absentes du
  registre** (`20260811090000` … `20260812091000`, dont `ciqual_full_import`),
  qui ne sont pas de moi. Je ne les ai **pas** appliquées. Ma migration a été
  passée seule (`psql -v ON_ERROR_STOP=1`, dans son propre `begin/commit`) puis
  inscrite au registre. **À signaler à l'humain** : cet écart disque/registre
  préexiste et fera trébucher le prochain `migration up`.
- **Fichiers modifiés mais NON commités** parce qu'ils sont **non suivis** (jamais
  dans HEAD — travail d'autres sessions) : `activity_floor.ts`,
  `portion_anchor_test.ts`, `generation_locale_test.ts`,
  `household_composition.ts` n'a pas eu besoin d'être touché. Mes retouches y
  sont minimales (repli de jetons) et restent sur le disque, comme les packs i18n.
- `git add` par **chemins explicites** uniquement. Jamais `git add -A`, jamais
  `git stash`.
- `agent-gate` **nu** échoue sur des fichiers d'autres lanes (`WeekView.tsx`,
  `en.ts`, `JoinHouseholdPage.tsx`, `TemplatesPage.tsx`, `localization.ts`,
  `Auth.tsx`). `AGENT_GATE_STAGED_ONLY=1` → **pass**.
