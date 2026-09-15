# Cohérence de la génération de plan — synthèse

> 2026-09-01. Lecture du code, pas une proposition de design.
> Question posée : « jusqu'où on écoute le user, et quand est-ce que la logique
> nous impose des choix qu'il faut lui expliquer ».

---

## 0. Ce qui existe déjà — à ne pas reconstruire

| Ce qui est déjà là | Où | Ce que ça fait |
|---|---|---|
| Rattrapage de la date de début périmée | `useMealTicks.ts::catchUpWindowStart` | Un début DEVENU passé remonte à aujourd'hui. Ne touche jamais l'avenir. |
| Intersection jours de cuisine × fenêtre | `meal_generation.ts::cookDayLines` | Les jours hors fenêtre sont retirés de la consigne. |
| Ajout d'un jour de cuisine quand la contrainte est insatisfaisable | `meal_generation.ts::addedCookDays` | Jours déclarés tous APRÈS les repas qu'ils nourrissent ⇒ on ajoute le 1er jour cuisinable. |
| Explication déterministe des choix de calendrier | `plan_rationale.ts::explainPlanChoices` | Rendue dans l'aperçu (`PlanDraftDialog`). Gabarits fixes, testés, sans jugement. |
| Fenêtre du cuit = jour de cuisson + 2 | `fridge_window.ts::cookedWindowVerdict`, `MAX_FRIDGE_DAYS = 3` | **REFUSE** : le plat au-delà est JETÉ (fail-closed). |
| Fenêtre du cru, par groupe d'aliment | `fridge_window.ts::RAW_WINDOW_DAYS` | Décide la date d'achat de chaque vague. |
| Vagues de courses déduites des jours de cuisson | `grocery_waves.ts` | 1 session ⇒ 1 vague. 2 sessions ⇒ 2 sorties. |
| Coupure de 18 h | `plan_hours.ts::SHOPPING_CUTOFF_HOUR` | Après 18 h, le jour même n'est ni cuisinable ni course-able. |
| Budget de temps hebdomadaire | `household_portions.ts::weeklyCookingMinutes` | `cookDays.length × cooking_time_min`. Déjà porte du « un plat ou deux » (seuil 90 min). |
| Dépassement du temps de session | `meal_generation.ts` (~l. 6577) | **COMPTE** seulement, tolérance +10 min. Va dans `issues`. |

⚠️ **`generated_from.issues` n'a AUCUN lecteur côté écran.** Tout ce que le moteur
constate — session qui déborde, lot jeté, jour de batch sans session — est écrit
et lu par personne. Le seul canal qui atteint l'humain est `plan_rationale`.

---

## 1. Date de début dépassée

**État.** La garde existe (`catchUpWindowStart`, posée le 2026-08-20 pour l'onglet
laissé ouvert la nuit). Elle tourne au **montage**, sur `visibilitychange` et sur
`focus` de la fenêtre — donc **jamais quand on choisit une date dans le sélecteur**.
Et `<input type="date">` du début n'a **pas de `min`** (seule la fin a `min`/`max`).

**Conséquence mesurable.** Clic sur le 29 alors qu'on est le 31 ⇒ la grille de
présence affiche des colonnes passées, la composition part, et
`resolveRequestedWindow` rend `400 bad_window`, traduit à l'écran par
« Ces jours n'ont pas pu être lus. » — un motif qui ne nomme ni la date, ni le
problème.

**Correctifs, par valeur décroissante :**
1. `min={aujourd'hui}` sur le champ de début — rend le geste inexprimable.
2. Clamp au `onChange` (la **même** fonction `catchUpWindowStart`, jamais une seconde).
3. Copie de refus qui nomme la date : « Le 29 est passé. Le plan part du 31. »

**⚠️ Nuance qui est le cœur du sujet.** Réaligner en silence est juste pour une date
DEVENUE passée (le temps a bougé, pas la personne). Ce n'est **pas** juste pour une
date qu'on vient de choisir : quelqu'un qui clique sur le 29 en croyant être le 28
doit voir que ça a bougé. Corriger le temps qui passe ≠ corriger la personne.

---

## 2. « Deux créneaux minimum au-delà de 4 jours, sans congélateur »

### 2.1 La règle existe déjà, elle est plus stricte, et elle n'a rien à voir avec le congélateur

`MAX_FRIDGE_DAYS = 3` (cuit + 2). Un plat qui puise dans une casserole cuisinée
plus de 2 jours avant est **jeté**, pas signalé. Donc, aujourd'hui, sans rien
ajouter :

- plan de 5 jours + 1 session ⇒ les jours 4 et 5 perdent leurs plats de batch ;
- plan de 7 jours + 1 session ⇒ les jours 4 à 7 aussi.

Le seuil que tu proposes (> 4 jours) est **plus laxiste que la physique déjà
appliquée** (> 3 jours). Le nombre minimum de sessions n'est pas à inventer : il se
**dérive**.

```
sessionsMin = ceil(joursCouverts / MAX_FRIDGE_DAYS)
```

5 jours ⇒ 2. 7 jours ⇒ 3. Une seule définition, deux lecteurs (la porte amont et
la garde aval) — c'est la posture de `addedCookDays`.

### 2.2 Le congélateur ne change RIEN aujourd'hui

`cookedWindowVerdict(cookAt, eatAt, maxFridgeDays)` **ne prend pas le congélateur
en paramètre**. La ligne « no freezer: nothing is frozen for later » est une phrase
de prompt, rien de plus. Donc « si ils ont pas de congélateur » ne distingue
actuellement aucun comportement : avec ou sans, c'est 3 jours pour tout le monde.

**Le vrai chantier caché derrière ton point 2 :** pour que le congélateur relâche
la fenêtre, il faut que le lien plat↔préparation **déclare** comment la part est
conservée (`kept: "fridge" | "freezer"`). Sans ce champ, relâcher la garde pour un
foyer équipé l'ouvrirait sur des parts restées au frigo — une porte de sécurité
désarmée sur une déclaration d'inventaire. **C'est un champ de modèle + un
compteur, pas un `if`.**

### 2.3 Ce que ça coûte de forcer un 2e créneau

Une 2e session = une **2e vague de courses** = un déplacement de plus. C'est déjà
ce que `grocery_waves` produit, et c'est un coût pour la personne, pas seulement un
gain de fraîcheur. Et la vague n'a **pas de jour rendu à l'écran**
(`suggestedStartsOn` est parsé, testé, jamais affiché). Imposer une 2e vague sans
d'abord la rendre visible, c'est imposer une sortie invisible.

---

## 3. Cuisiner le dimanche pour un plan lundi→vendredi

### 3.1 Aujourd'hui, la déclaration est jetée — et l'explication ment

Branche `usable.length === 0` de `cookDayLines` : le prompt reçoit
« they usually cook on sun, but none of those days are left in this stretch. Put
the cooking sessions on the days you do have ». Le dimanche est écarté.

Et en face, `addedCookDays` rend `[]` dans ce cas précis (il sort sur
`if (usable.length === 0) return []`). Donc `explainPlanChoices` tombe dans la
branche `else if (declared.length > 0)` et écrit :

> **« Tu cuisines dimanche, et c'est ce qui a été gardé. »**

sur un plan lundi→vendredi où le dimanche a été explicitement retiré de la consigne.
C'est un **fait faux, déterministe, indémentable** — la famille de défaut que ce
dépôt paie en boucle. Il manque un quatrième gabarit :
`cookDeclaredDropped(days)` — « Tu cuisines dimanche, mais ce plan ne va pas
jusque-là : les sessions sont posées sur les jours qu'il couvre. »

**Ce correctif est indépendant de tout le reste et devrait partir seul.**

### 3.2 Le vrai problème est ontologique

- `cook_days` vit dans `practical_constraints` : c'est un réglage de **profil**,
  permanent, valable pour toutes les semaines à venir.
- `starts_on` / `duration_days` vivent sur la ligne de plan : c'est une **demande**,
  celle-ci et pas une autre.

Les deux sont écrits dans le même vocabulaire (jetons de jour), et l'intersection
les confond. « Je cuisine le dimanche » est une **habitude vraie** ; « ce plan va de
lundi à vendredi » est une **demande**. Il manque un troisième objet : *le jour de
cuisine de CE plan-là*, qui peut tomber **avant** son premier jour.

### 3.3 La sortie qui ne demande aucune migration

Une session avant le début du plan n'est pas exprimable : `cooking_sessions[].day`
est un jeton, `windowDates` ne connaît que les jours de la fenêtre, la session
dimanche tombe `not_evaluated` dans la fenêtre du cuit (seuil zéro) et les vagues
de courses ne savent pas la dater.

**Mais un plan « lundi→vendredi, je cuisine dimanche » EST un plan « dimanche→
vendredi » dont le dimanche ne porte aucun repas.** Six jours, sous le plafond de 7.
C'est exprimable dès aujourd'hui : `starts_on = dimanche`, `duration_days = 6`,
le dimanche marqué `batch_cook` dans `day_properties` et vidé de ses occasions par
la grille de présence.

Ce qui reste à faire est de l'**UI et de la copie**, pas du schéma :
- l'entonnoir doit proposer « je cuisine la veille » sous les dates ;
- la phrase de rationale doit dire que le plan commence un jour plus tôt et
  pourquoi ;
- ⚠️ **à vérifier avant de coder** : `window_beyond_this_week` interdit de
  commencer après le dimanche de la semaine en cours (les jetons de jour ne
  nomment pas une deuxième semaine). Reculer le début approche cette limite par
  l'autre bout.

---

## 4. Le temps de cuisine — ton intuition est inversée

Tu écris : « si elle met qu'une journée pour cuisiner mais dit 30 min, forcément
le temps de la session sera allongé ». **Le moteur fait le contraire.**

Le prompt dit, mot pour mot : *« THE COOKING TIME THEY GAVE YOU IS A CEILING […] If
everything will not fit, cook LESS in that session and put the rest on another
cooking day. »* Et le dépassement n'est que **compté** (tolérance +10 min), jamais
corrigé, jamais montré.

Donc, avec un seul jour de cuisine : « le reste » n'a **nulle part où aller** ⇒
moins de préparations ⇒ des trous. Ce qui rejoint la mesure déjà connue : les plans
sous-nourrissent leur propre enveloppe à 65–72 %, dès le cas sans contrainte.

**Il faut trancher explicitement.** Face à « 5 jours × 1 session × 30 min », trois
sorties sont acceptables :

1. **allonger la session** — et le dire (« ce sera plutôt 1 h 15 ce jour-là ») ;
2. **raccourcir la fenêtre** — et le dire (« 3 jours tiennent dans ce que tu as ») ;
3. **ajouter un jour** — et le dire (c'est déjà ce que `addedCookDays` sait faire).

La quatrième sortie est celle d'aujourd'hui : **livrer un plan troué sans rien
dire.** C'est la seule qui soit inacceptable.

---

## 5. Ce que je pense que tu as oublié

1. **La coupure de 18 h mange déjà le jour 1.** Composer après 18 h rend le premier
   jour ni cuisinable ni course-able. « 5 jours, 1 session » devient de fait
   « 4 jours cuisinables » — à intégrer au calcul du plancher, sinon il se
   trompera d'un cran un soir sur deux.

2. **Les absences réduisent la demande, et personne ne les compte.** Une semaine
   où trois dîners sont dehors demande moins de cuisine. Un plancher de sessions
   calculé sur les jours du calendrier imposerait un 2e créneau à quelqu'un qui
   part trois jours. Le plancher doit se calculer sur **les repas réellement à
   couvrir**, ce que `resolveWindowPresence` sait déjà rendre.

3. **La primitive de faisabilité existe déjà à moitié.** `weeklyCookingMinutes`
   (= jours × minutes) est le budget total, et il sert déjà de porte pour « un plat
   ou deux » (seuil 90 min). Il ne lui manque qu'un **plancher** en face de son
   plafond : *minutes disponibles* vs *minutes que ce plan réclame*.

4. **Tout ça se décide SANS le modèle.** Dates, jours de cuisine, minutes,
   équipement, absences : rien là-dedans n'exige un appel. C'est la règle que le
   dépôt applique déjà (le refus `window_beyond_this_week` a été créé exactement
   pour ça, après 6,2 s facturées). Donc : **une passe de faisabilité pure, avant
   le modèle**, qui rend soit « ok », soit « voici ce que j'ai changé et pourquoi ».
   L'entonnoir peut le montrer **avant** de payer deux minutes de composition.

5. **`issues` n'atteint personne.** Le canal d'explication existe, il est
   déterministe, il est déjà rendu dans l'aperçu : `plan_rationale`. C'est là qu'il
   faut brancher — pas dans un nouveau bandeau.

6. **La 2e vague de courses est un coût, pas un bonus.** Et elle est aujourd'hui
   invisible (`suggestedStartsOn` sans écran). À rendre avant d'en imposer une.

---

## 6. La doctrine d'arbitrage — réponse à « jusqu'où on écoute »

**Trois rangs, et chacun a une règle de rendu différente.**

### Rang 1 — les faits physiques. Non négociables, jamais désactivables.

Fenêtre du cuit, « rien n'est mangé avant d'être cuisiné », pas de four ⇒ pas de
rôti. Le moteur tranche **toujours**. La personne ne peut pas les lever. Ils sont
déjà fail-closed, et c'est juste.

### Rang 2 — les déclarations devenues insatisfaisables. On RÉSOUT, on ne jette jamais.

Un jour de cuisine hors fenêtre, une seule session pour 5 jours, 30 min pour tout.
La règle : **on ajoute ce qu'il faut, au plus près de ce qui a été dit, et on le
nomme.** C'est exactement ce que `addedCookDays` fait déjà — il faut étendre sa
couverture, pas inventer un mécanisme.

> **Invariant à tenir : rien de rang 2 ne part sans une ligne de `plan_rationale`.**
> Une garde sans phrase se lit comme un bug. Et une phrase qui affirme le contraire
> de ce que la garde a fait (§3.1) est pire qu'un silence.

### Rang 3 — les préférences. Suivies telles quelles.

Envie, difficulté, variété, budget. On n'arbitre pas.

---

## 7. Ordre de bataille proposé

| # | Lot | Portée | Pourquoi en premier |
|---|---|---|---|
| 1 | Gabarit `cookDeclaredDropped` + branchement | ~20 lignes, pur, testable | Retire un **mensonge déterministe** en production. Aucune dépendance. |
| 2 | `min` + clamp sur la date de début + copie de refus nommée | UI + 1 clé i18n | Ferme le trou du §1. Aucune dépendance. |
| 3 | Passe de faisabilité pure, avant le modèle | 1 module pur + 1 appel par lane | Porte tous les autres arbitrages. Rend `{ok} \| {ajustements[], raisons[]}`. |
| 4 | Plancher de sessions dérivé de `MAX_FRIDGE_DAYS` + absences | dans le module ③ | Remplace le seuil « > 4 jours » par la physique déjà appliquée. |
| 5 | Arbitrage du temps : allonger / raccourcir / ajouter, et le dire | dans ③ + gabarits | Adresse la sous-alimentation mesurée. |
| 6 | « Je cuisine la veille » : fenêtre reculée d'un jour, `batch_cook`, occasions vides | UI + copie, **pas de migration** | Dépend de ③ pour l'explication. Vérifier `window_beyond_this_week`. |
| 7 | `kept: "fridge" \| "freezer"` + compteur, et le congélateur relâche enfin la fenêtre | modèle + garde + compteur | Le plus gros. Ne pas le faire avant d'avoir 1–5. |

---

# 8. MESURÉ — « 1 session, congélateur, 7 jours » (2026-09-01)

Décor : fenêtre `sun → sat`, rythme `breakfast/lunch/dinner`, **une** session de
cuisine le dimanche, `cooking_time_min = 60`, foyer **avec congélateur**.
Le modèle écrit la phrase que le prompt lui réclame — *« FREEZE the rest on the
cooking day »* — dans la méthode du plat, dans la méthode de la préparation, ET
dans le `run_through` de la session.

```
=== CE QUI SURVIT, JOUR PAR JOUR ===
  sun: breakfast, lunch, dinner
  mon: breakfast, lunch, dinner
  tue: breakfast, lunch, dinner
  wed: breakfast
  thu: breakfast
  fri: breakfast
  sat: breakfast

  demandés : 21 plats
  rendus   : 13 plats
```

**8 repas sur 21 jetés. Quatre jours au petit-déjeuner seul.**

Le parseur produit bien la ligne
`empty_slots: wed/lunch, wed/dinner, thu/lunch, ... sat/dinner` — mais `issues`
n'a aucun lecteur, et un créneau vide se rend comme une **case vide** dans
`PlanGrid` (ses `grid.issues` à lui portent les COLLISIONS, pas les trous).

**La personne reçoit donc un plan de sept jours dont quatre n'ont qu'un
petit-déjeuner, sans qu'un seul mot ne le dise.**

## 8.1 Ce que la mesure prouve, et qui change le diagnostic

Le problème n'est **pas** que le modèle manque de liberté. Le prompt lui en donne
déjà, explicitement :

> *« If a batch would have to stretch further, you have three honest ways out:
> cook a smaller batch, cook it twice, or say plainly in the method that the
> surplus goes in the FREEZER on the cooking day. Never stretch it in silence. »*

Le modèle **a pris** cette liberté, trois fois, en toutes lettres. Le parseur l'a
jetée — parce qu'elle est écrite en **prose** et qu'il n'existe **aucune clé** pour
la lire. C'est mot pour mot la cicatrice « la promesse et la clé de schéma doivent
se toucher » : sans clé adjacente, le taux de captation est zéro.

**Le correctif n'est pas de desserrer la garde. C'est de donner une clé à la
liberté qu'on accorde déjà.**

## 8.2 Le lot qui débloque tout — `uses[].kept`

```jsonc
"uses": [{ "preparation_id": "prep_chicken", "servings": 1,
           "kept": "fridge" | "freezer" }]
```

1. **La clé, collée à sa promesse** dans le schéma JSON — pas trois paragraphes
   plus haut.
2. `cookedWindowVerdict` prend la fenêtre en **paramètre** (elle l'est déjà) :
   `MAX_FRIDGE_DAYS = 3` pour `fridge`, `FREEZER_WINDOW_DAYS` pour `freezer`.
   Nouvelle constante **nommée**, jamais un nombre en dur.
3. **La double condition, et elle n'est pas négociable** : `kept: "freezer"` ne
   relâche la garde que si `freezer` est coché dans `kitchen_equipment`.
   Déclaré sans l'équipement ⇒ on retombe à 3 jours, **et on compte**. Relâcher
   sur la seule parole du modèle serait une porte de sécurité ouverte par un
   champ que personne ne vérifie.
4. **Un compteur obligatoire** : combien de `uses` portent `kept`, sur combien.
   Sans lui, un lot désarmé ressemble à un lot qui marche.
5. **La décongélation est un geste.** Une part sortie du congélateur se sort la
   veille. Si `same_day.kind` ne sait pas le dire, la méthode doit — sinon on
   livre un plan exécutable sur le papier et pas dans la cuisine.
6. **Rien à faire côté courses** : l'achat précède la cuisson dans les deux cas,
   donc `grocery_waves` ne bouge pas.

## 8.3 L'ORDRE COMPTE — et c'est le piège de ce chantier

Si le **plancher de sessions** (§2.1) part avant `uses[].kept`, il imposera un
deuxième créneau de cuisine à un foyer qui a un congélateur et n'en a pas besoin.
La physique dit `ceil(jours / 3)` **quand tout est au frigo** ; avec un
congélateur déclaré et lu, une seule session redevient légitime sur sept jours.

**Donc : `uses[].kept` AVANT le plancher de sessions.** Et le plancher se calcule
sur les repas non congelables, jamais sur les jours du calendrier.

---

# 9. LIVRÉ — Lots 0 et 1 (2026-09-01)

`./scripts/agent-gate.sh` : **pass**. 4 513 tests Deno (0 rouge), 1 821 vitest
(4 rouges, tous dans la baseline), typecheck des tests à 92 erreurs — soit
exactement le compte d'avant, aucune régression.

## Lot 0 — les trois muets

| | Avant | Après |
|---|---|---|
| Date de début de l'entonnoir | ni `min` ni `max`, valeur brute écrite à chaque frappe (vider le champ ⇒ `assertIsoDate("")` jette **pendant le rendu** ⇒ ErrorBoundary) | bornes portées de `MealBuilder`, patron brouillon + `isIsoDate`, clamp par `catchUpWindowStart` — et le champ **montre** le déplacement |
| Jour de cuisine hors fenêtre | « Tu cuisines dimanche, et c'est ce qui a été gardé » sur un plan lundi→vendredi | « Tu cuisines dimanche, mais ce plan ne va pas jusque-là : les sessions sont posées sur les jours qu'il couvre. » |
| Créneaux vides | `empty_slots` écrit en base, lu par personne | « Sur mercredi, jeudi, vendredi et samedi, le déjeuner et le dîner n'ont pas été composés. » |

`usableCookDays` est extraite : la consigne et l'explication lisent **la même**
intersection, et un test le tient (`plan_rationale_test.ts`). Un test de source
attrape la régression du câblage sur les DEUX écrans — **muté, il rougit**.

## Lot 1 — `uses[].kept`

**`MEAL_PROMPT_VERSION` : v19 → `meal.en.v20_frozen_portion_has_a_key`.**

Mesuré, même décor qu'au §8 :

| Décor | Plats rendus | Compteurs |
|---|---|---|
| `kept: freezer` + congélateur déclaré | **21 / 21** | `uses_kept_freezer: 14/14` |
| `kept: freezer`, **aucun** congélateur | 13 / 21 | `freezer_claimed_without_one: 14/14 batch links` |
| congélateur mais `kept: fridge` | 13 / 21 | `uses_kept_freezer: 0/6` |
| `kitchenEquipment: null` (jamais demandé) | 13 / 21 | — |
| champ absent (plan d'avant le lot) | 13 / 21, **au plat près** | — |

- La double condition est `hasKitchenTool(eq, "freezer") === true`. **Muter en
  `!== false` fait rougir** le test `null` — la direction fail-closed est tenue
  par un rouge, pas par un commentaire.
- `FREEZER_WINDOW_DAYS = 7`, épinglé par un littéral **et** comparé à
  `MAX_WINDOW_DAYS` : si le plafond de fenêtre bouge, un rouge le dit.
- La **décongélation** est rendue (`DishCard`), déterministe, hors du dépliant
  de session, et muette quand la part est cuisinée et mangée le même jour.
- Deux compteurs, **chacun avec SA population** : ils tournaient à deux étages
  et se lisaient `6/6` à côté de `14`, ce qui n'a aucun sens à la lecture.

## Ce qui reste : Lot 2

⚠️ **L'ordre était le piège, et il a été respecté.** Le plancher de sessions
part maintenant sur une base juste : `sessionsFloor = hasFreezer ? 1 :
ceil(joursCouverts / MAX_FRIDGE_DAYS)`. Livré avant le Lot 1, il aurait imposé
un deuxième créneau de cuisine — donc une deuxième sortie courses — à un foyer
équipé qui n'en a aucun besoin.

Décision actée non encore construite : **quand le temps ne tient pas, le moteur
déborde et le DIT** (plafond nommé `SESSION_OVERRUN_FACTOR`, phrase de
rationale au lieu d'un `issues` muet). Ce bloc est dans le tronc ⇒ il bumpera
`MEAL_PROMPT_VERSION` une seconde fois (v20 → v21), et il ne doit **pas** être
fusionné avec le Lot 1 : deux populations à distinguer dans
`generated_from->>'prompt_version'`.

---

# 10. LIVRÉ — Lot 2 (2026-09-01)

`agent-gate: pass`. **4 536 tests Deno**, **1 827 vitest** (4 rouges, tous dans
la baseline), typecheck des tests à 92 erreurs — le compte d'avant, inchangé.

**`MEAL_PROMPT_VERSION` : v20 → `meal.en.v21_days_out_of_batch_reach`.**

## Ce qui a changé de forme par rapport au plan

Le plan disait « plancher de sessions ». **On n'ajoute aucune session**, et
c'est une décision, écrite en tête de `plan_feasibility.ts` :

1. une session en plus est une **vague de courses** en plus (`grocery_waves`
   déduit le calendrier d'achat des jours de cuisson) — imposer un deuxième
   créneau, c'est imposer un deuxième déplacement à quelqu'un qui a dit n'en
   vouloir qu'un ;
2. la sortie honnête existe déjà et coûte moins cher : ces jours-là cuisinent
   frais. C'est le **contenu** qui s'adapte, pas l'agenda de la personne.

Le module dit donc **ce qui est hors de portée**, la consigne le nomme, et
l'explication le dit. Personne n'écrit à la place de la personne.

Il n'y a par conséquent **pas de `sessionsFloor` exporté** : le nombre se
calcule en une ligne mais rien ne le lirait, et un export que personne n'appelle
est un lot désarmé qui ressemble à un lot qui marche.

## Ce qui est livré

| | Avant | Après |
|---|---|---|
| Consigne | une règle **générale** (« if the only cooking day you have is Sunday… ») — mesurée : ne mord pas | les jours sont **nommés** (`mercredi, jeudi, vendredi, samedi`) + la conséquence (« it will be thrown away ») |
| Temps trop serré | plafond sec ⇒ le modèle cuisine moins ⇒ la semaine sous-nourrit | permission **bornée** (`SESSION_OVERRUN_FACTOR = 2`) et **conditionnelle** (un seul jour de cuisine) |
| Débordement constaté | ligne d'`issues`, aucun lecteur | `session_overruns` structuré ⇒ « La session de mercredi prendra plutôt 1 h 15 que 30 min » |
| Entonnoir | rien | sous « Les jours où tu cuisines » : « Sans lot qui tienne jusque-là, mercredi, jeudi, vendredi et samedi seraient à cuisiner sur le moment. » |

## Deux fautes trouvées par les tests, pas par la relecture

- **Le module était faux sur « aucun jour de cuisine connu »** : il rendait la
  fenêtre entière hors de portée. C'est un test d'un **autre lot**
  (`meal_precedence_test.ts :: « le silence de la CAPACITÉ est nommé »`) qui l'a
  attrapé. Deux décors mènent là — rien de coché, ou rien de coché dans la
  fenêtre — et dans les deux la consigne laisse le **modèle** choisir ses jours.
  Ce n'est pas une absence de cuisine, c'est une date inconnue : le silence est
  la seule affirmation vraie.
- **Une phrase ouvrait sur une minuscule** (« mercredi, jeudi… sont trop loin »)
  — `renderDays` rend les jours en minuscules en français. La phrase est
  réécrite dans l'autre sens, et une garde relit désormais **toutes** les lignes
  rendues, dans les deux langues. Mutée, elle rougit.

## L'arbitrage sur le point 2, dit franchement

Ta demande était de **« faire bloquer les gens »** dans le champ des jours de
cuisine. La ligne livrée **prévient, elle ne bloque pas** — et un test le tient
(`freezerMirror.int.test.ts :: « IL PRÉVIENT, IL NE RETIENT PAS l'étape »`).

Motif : un plan d'une session sur cinq jours est **parfaitement composable** —
ces jours-là se cuisinent le jour même. Retenir l'étape refuserait un plan que
le moteur sait produire : un mur là où la physique ne demandait qu'un mot.
Si tu veux le blocage dur, c'est une ligne à changer et le test à retourner.

## Un miroir créé exprès, et son prix payé

`hasFreezerDeclared` existe désormais **deux fois** — serveur et écran. C'est
délibéré : l'entonnoir doit annoncer avant la composition ce que le moteur fera,
et `kitchenEquipment.ts` côté écran est déjà un miroir complet.
`freezerMirror.int.test.ts` compare les deux implémentations sur les **trois**
états (`null`, `[]`, déclaré) — muté, il rougit.
