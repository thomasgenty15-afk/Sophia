# AUDIT-APP — l'état mesuré du produit connecté, 2026-08-13

> Mesuré, pas estimé. Chaque nombre de ce document est reproductible par le grep
> donné en §7. C'est la baseline que la refonte doit écraser.

---

## 0. Le résultat le plus important de cet audit

**L'inventaire du master compte les seize *pages*. Ce n'est pas la surface
rendue.** Vingt-deux composants de `keel/components/` sont montés *à l'intérieur*
de ces pages, pèsent **7 419 lignes**, et portent **302 `gray-*` et 239 couleurs
saturées** que personne n'aurait touchées.

Conséquence concrète : `/app/today` monte `KitchenToday`, `DishCard`,
`DeviationDialog` et `CommitmentLine`. Un agent qui ne réécrit que `TodayPage.tsx`
livre un écran **à moitié converti** — et le défaut ne se verra pas dans son
diff, seulement au rendu.

**Donc : chaque composant partagé est attribué à exactement une famille (§4).**

| périmètre | fichiers | lignes | `gray-*` | saturées |
|---|---|---|---|---|
| les 16 pages du master | 18 | 18 634 | **685** | **248** |
| le kit `ui/` | 8 | 638 | **33** | **21** |
| le shell | 1 | 560 | **32** | 0 |
| **les partagés oubliés** | **22** | **7 419** | **302** | **239** |
| **TOTAL à écraser** | **49** | **27 251** | **1 052** | **508** |

Les 8 saturées de `Badge.tsx` sont **exclues** de la colonne « saturées » : elles
sont le vocabulaire d'état, elles restent.

---

## 1. Le comptage par écran

`sat.` = saturées hors `Badge.tsx`. `loc.` = primitives redéfinies localement.

| Surface | Fichier | lignes | `gray-*` | sat. | `rounded` | loc. |
|---|---|---:|---:|---:|---:|---:|
| Parcours d'entrée | `keel/pages/SetupPage.tsx` | 1 744 | 41 | 0 | 2 | 7 |
| Aujourd'hui | `keel/pages/TodayPage.tsx` | 1 421 | 48 | **47** | 15 | 8 |
| La conversation | `keel/pages/ChatPage.tsx` | 871 | 21 | 5 | 11 | 1 |
| La semaine | `keel/pages/StudentWeekPlanPage.tsx` | 2 030 | **69** | 0 | 1 | 3 |
| Les progrès | `keel/pages/StudentProgressPage.tsx` | 888 | 46 | 0 | 4 | 0 |
| La santé | `keel/pages/StudentHealthPage.tsx` | 404 | 5 | 2 | 0 | 0 |
| Le foyer | `keel/pages/HouseholdPage.tsx` | 1 862 | 9 | 21 | 4 | **13** |
| Accueil pro | `keel/pages/CoachHomePage.tsx` | 772 | 19 | 7 | 0 | 5 |
| La doctrine | `keel/pages/CoachDoctrinePage.tsx` | 1 918 | **98** | 15 | 13 | **11** |
| Le lundi | `keel/pages/CoachWeeklyPage.tsx` | 365 | 18 | 0 | 1 | 0 |
| Le protocole | `keel/pages/CoachProtocolPage.tsx` | 1 751 | 59 | 11 | 9 | 4 |
| Les repas | `keel/pages/CoachMealsPage.tsx` | 506 | 21 | 0 | 3 | 1 |
| Un client | `keel/pages/CoachStudentPage.tsx` | 652 | 27 | 0 | 0 | 3 |
| La facturation | `keel/pages/CoachBillingPage.tsx` | 476 | 17 | 5 | 0 | 4 |
| Les gabarits | `keel/pages/TemplatesPage.tsx` | 1 015 | **89** | 33 | 9 | 3 |
| L'import | `keel/pages/PlanImportPage.tsx` | 1 459 | **97** | **47** | 11 | 6 |
| Le compte (coque) | `pages/Account.tsx` | 38 | 1 | 0 | 0 | 0 |
| L'abonnement | `pages/UpgradePlan.tsx` | 548 | 0 | **55** | 18 | 1 |

**Les écarts avec le tableau du master**, tous vérifiés : `SetupPage` 1 744 (pas
1 709), `StudentWeekPlanPage` 2 030 (pas 1 963), `StudentProgressPage` 888 (pas
812), `CoachDoctrinePage` 1 918 (pas 1 837), `CoachProtocolPage` 1 751,
`CoachStudentPage` 652, `CoachBillingPage` 476, `StudentHealthPage` 404,
`CoachWeeklyPage` 365. Le dépôt a bougé depuis le relevé.

**Et l'écart qui compte** : le master écrit « Le compte : `Account.tsx` (38) +
`UpgradePlan.tsx` (548) ». `Account.tsx` **n'est qu'une coque de 38 lignes** :
tout l'écran du compte est `components/UserProfile.tsx`, **882 lignes et 125
couleurs saturées**, jamais mentionné. C'est le plus gros morceau non compté du
chantier, et c'est celui qui porte le plus de reliquats.

---

## 2. Les couleurs saturées EN DÉCOR — les vraies fautes

Une saturée en décor ne dit rien, et elle rend les vrais états illisibles. Voici
les cinq foyers, du plus grave au moins grave.

### 2.1 ⛔ `ui/SetupSection.tsx` — cinq accents décoratifs, **dans le kit**

```
rose: bg-rose-500 / bg-rose-50 text-rose-900        violet: bg-violet-500 / …
sky:  bg-sky-500  / bg-sky-50  text-sky-900         teal:   bg-teal-500   / …
orange: bg-orange-500 / bg-orange-50 text-orange-900
```

`export type SetupAccent = "rose" | "violet" | "sky" | "teal" | "orange"` — la
décoration est une **API typée**, ce qui la rend légitime aux yeux du prochain
lecteur. Cinq appels, tous dans `StudentWeekPlanPage.tsx` (lignes 1747, 1770,
1938, 1957, 1975).

Le fichier **se défend en commentaire** : la couleur « ne dit pas un état, elle
dit une FRONTIÈRE ». Le raisonnement est bon, le moyen est interdit par la
charte. **Arbitrage rendu : voir §5.1.**

### 2.2 ⛔ Le code-couleur de catégorie — `TemplatesPage` + `PlanImportPage`

`TemplatesPage.tsx:160-168` et `PlanImportPage.tsx:643-651` peignent une échelle
de priorité en **lime / orange / amber** :

```
lime-300/200/50/900   orange-300/200/50/900   amber-300/200/50/900
```

Trois familles saturées pour dire « haute / moyenne / basse ». Ce n'est pas un
état du système, c'est un rang — et `orange`/`amber` sont à 30° l'un de l'autre,
donc l'échelle ne se lit même pas. `PriorityChip` est **dupliqué à l'identique**
dans les deux fichiers (`TemplatesPage.tsx:115`, `PlanImportPage.tsx:213`).

### 2.3 ⛔ Le bleu ciel employé comme surface neutre

`sky-*` sert de fond de bloc informatif sans qu'aucun état ne soit en cause :
`TodayPage.tsx` 474, 482, 491, 504, 1199 · `TemplatesPage.tsx:110` ·
`PlanImportPage.tsx` 209, 346, 389, 399, 400, 545, 1357.

C'est le cas le plus insidieux : `Badge tone="info"` **occupe le bleu**. Un fond
`bg-sky-50` décoratif à côté d'une pastille `info` bleue rend la pastille muette.

### 2.4 ⛔ Le violet — reliquat du produit supprimé : voir §3.

### 2.5 Ce qui est un ÉTAT et qui RESTE

Pour éviter qu'un agent zélé les retire : `bg-red-50 text-red-700` d'un message
d'erreur, `bg-amber-50` d'un avertissement, `text-emerald-700` d'un
enregistrement confirmé, et les quatre familles de `Badge.tsx`. Ce sont des
faits. Ils ne bougent pas.

---

## 3. Les reliquats du produit grand public supprimé

| # | Reliquat | Où | Verdict |
|---|---|---|---|
| 1 | **`.sophia-action-skin` + `.sophia-violet-surface`** — 130 lignes de CSS qui reteignent `violet-*` et `blue-*` | `index.css:218-350` | **MORT — zéro consommateur.** Vérifié hors commentaires : aucun `.tsx` ne porte ces classes. Purge par l'orchestrateur (fichier partagé). |
| 2 | **`components/UserProfile.tsx`** — 125 saturées dont ~40 `violet-*` : `bg-violet-600` en bouton, `text-violet-700` en lien, `border-violet-100/200` | l'écran du compte | **VIVANT et rendu.** C'est la plus grosse concentration de l'ancienne marque dans le produit. Famille G. |
| 3 | **`pages/UpgradePlan.tsx`** — 55 saturées, ~30 `violet-*` : `bg-violet-600`, `bg-violet-500`, `text-violet-950` | `/upgrade` | **VIVANT.** Famille G. |
| 4 | **`keel/components/DeviationDialog.tsx`** — 32 saturées, **toutes violettes**, zéro autre couleur | monté par `TodayPage` | **VIVANT.** L'ancienne marque en entier dans une boîte de dialogue. Famille B. |
| 5 | **`keel/components/WeekView.tsx`** — `bg-violet-300`, `bg-violet-400` comme légende de statut, `text-violet-700`, `border-violet-200` | monté par `CoachStudentPage` | **VIVANT.** Famille E. Le violet y sert de **statut** (`not_applicable`, `flex_used`) — donc à la fois reliquat *et* faux état. |
| 6 | **`components/YinYangLoader.tsx`** — l'ancien logo | — | **MORT — zéro importeur** (vérifié hors commentaires). Suppression proposée en §6. |
| 7 | **« Powered by IKIZEN »** | `components/UserProfile.tsx:873` · `components/Footer.tsx:15` · `pages/ResetPassword.tsx:111` | `UserProfile` est **rendu** → famille G. `Footer` est monté par `/installer-app`, `ResetPassword` par `/reset-password` : **hors des seize**, consignés en §6. |
| 8 | `--color-primary: #7c3aed` | — | Déjà parti. `index.css:41` et `tokens.css:19` n'en gardent que la trace en commentaire, correctement rédigée. **Ne pas y toucher.** |

**Aucun `indigo-*`, `purple-*` ni `fuchsia-*` dans tout `frontend/src`.** Le
master les cite ; ils n'existent plus. Le violet, si.

---

## 4. Les composants partagés — attribution par famille

Chaque composant est monté par les pages listées. **La famille propriétaire est
celle qui le convertit ; les autres ne le touchent pas.**

| Composant | lignes | `gray` | sat. | Monté par | **Propriétaire** |
|---|---:|---:|---:|---|---|
| `LocaleSwitch` | 77 | 5 | 0 | SetupPage | **A** |
| `DeviationDialog` | 180 | 0 | **32** | TodayPage | **B** |
| `DishCard` | 189 | 15 | 0 | TodayPage | **B** |
| `KitchenToday` | 289 | 11 | 1 | TodayPage | **B** |
| `WeeklyCheckInDialog` | 228 | 12 | 1 | ChatPage | **B** |
| `MealBuilder` | 1 053 | 11 | 7 | StudentWeekPlanPage | **C** |
| `FoodPreferencesCard` | 437 | 19 | 2 | StudentWeekPlanPage | **C** |
| `EatingRhythmCard` | 382 | 17 | 7 | StudentWeekPlanPage | **C** |
| `CookingCapacityCard` | 277 | 9 | 3 | StudentWeekPlanPage | **C** |
| `HouseholdMergeCard` | 422 | 13 | 3 | HouseholdPage | **D** |
| `MealPickerGrid` | 249 | 13 | 0 | HouseholdPage | **D** |
| `HouseholdPlanCard` | 121 | 6 | 0 | HouseholdPage | **D** |
| `WeekView` | 652 | **55** | 21 | CoachStudentPage | **E** |
| `CoachSeatCard` | 237 | 13 | 3 | CoachStudentPage | **E** |
| `CoachNoteCard` | 165 | 6 | 2 | CoachStudentPage | **E** |
| `StudentConstraintsCard` | 148 | 5 | 2 | CoachStudentPage | **E** |
| `CoachBroadcastCard` | 174 | 9 | 1 | CoachHomePage | **E** |
| `InviteDialog` | 164 | 9 | 3 | CoachHomePage | **E** |
| `DoctrineStartDialog` | 615 | **41** | 1 | CoachDoctrinePage | **F** |
| `CommitmentEditor` | 976 | 19 | 0 | TemplatesPage, PlanImportPage | **F** |
| **`CommitmentLine`** | 183 | 14 | **25** | TemplatesPage, PlanImportPage, **TodayPage** | **F** ⚠️ |
| `components/UserProfile` | 882 | 0 | **125** | Account | **G** |

⚠️ **`CommitmentLine` est la seule collision B↔F.** Elle appartient à **F**
(deux appelants sur trois). **B ne l'ouvre pas** — et B doit vérifier au
navigateur que `/app/today` reste correct une fois F passée.

---

## 5. Les décisions prises seul

### 5.1 `SetupSection` perd ses cinq accents — la frontière passe à la forme

**Décision.** Les cinq accents saturés partent. La frontière entre sections est
portée par l'**équerre** (`.eq`, via `Kicker`), la taille du titre et l'espace.

**Pourquoi.** Le fichier avait raison sur le problème — quatre formulaires gris
empilés se lisent comme un seul — et tort sur le moyen. La charte a une réponse
dédiée : l'équerre « marque l'origine de ce qui est spécifié » (charte §4). Une
frontière est une affaire de **forme**, et la forme est justement ce que la
charte réserve à ce rôle, parce qu'elle survit au daltonisme et à
l'impression — ce que le fichier reconnaît lui-même en écrivant « la couleur
n'est jamais seule à porter l'information ».

**Options rejetées.**
- *Garder les accents en les virant du violet* — ne règle rien : `sky` collide
  avec `info`, `rose` avec `critical`, et on garde cinq teintes en décor.
- *Cinq nuances de figue* — la charte l'interdit deux fois : `fig-300` est à
  2,11:1 sur papier (fond sombre uniquement), et une seule pièce chaude par
  figure.
- *Garder `accent` en prop morte* — une API qui ne fait rien se remplit à
  nouveau au premier lecteur pressé.

**Exécution.** La prop `accent` est **retirée du type**. Les cinq sites d'appel
de `StudentWeekPlanPage.tsx` sont corrigés **par l'orchestrateur** dans sa
fenêtre série (phase 2), pas par la famille C : c'est ce qui garde `tsc` vert
entre la phase 1 et la phase 3. **C est prévenue et ne les réintroduit pas.**
Et le commentaire de tête est **réécrit** — la version actuelle affirme que
« le reste de KEEL est volontairement gris », ce qui est périmé et ferait
« réparer » la couleur par le prochain lecteur (le dépôt a déjà payé ça deux
fois).

### 5.2 Un état peut être une SURFACE, pas seulement une pastille

Le master pose : « chaque saturée rendue est un état, et chaque état est une
pastille ». Lu au pied de la lettre, ça condamne `Card tone="warning"`
(`bg-amber-50`) et tout bandeau d'erreur `bg-red-50`.

**Décision.** La garde opérante est celle de la charte §2 : **la figue n'entre
jamais dans une pastille**, et une saturée doit **porter un fait**. Un bandeau
d'avertissement ambre porte un fait. Il reste.

**Ce qui est donc interdit**, et c'est le critère que la review §2 applique :
une saturée qui ne correspond à **aucun état du système** — un rang, une
catégorie, une frontière, une marque. Les trois foyers de §2.1-2.4 tombent tous
sous ce critère ; aucun état n'y est en cause.

### 5.3 `keel/pages/ProgressPage.tsx` (393 lignes) : mort, mais je ne le supprime pas

**Zéro importeur** (vérifié hors commentaires). `catalog.ts`, `en.ts` et `fr.ts`
le disent déjà en quatre endroits et gardent 36 clés `progress.*` orphelines
pour lui.

**Décision : ni style, ni suppression.** Le styler serait du travail sur un
écran que personne ne rend. Le supprimer touche `fr.ts`, où **un autre chantier
écrit en ce moment** — conflit garanti. Il est **exclu du périmètre** et signalé
en §6.

### 5.4 `keel/pages/mealPlan/StudentMealPlanPage.tsx` : on n'y touche pas

`App.tsx:51-56` le dit explicitement : réparation transitoire non committée
d'**un autre chantier en cours**, qui a supprimé les composants `mealPlan/` en
`staged` sans retirer la route. 124 lignes, 4 `gray-*`. **Hors périmètre : c'est
le refactor d'autrui.**

---

## 6. Signalé, pas réparé

Consigné ici pour le rapport final ; hors du lot visuel.

1. **Traduction.** `/app/plan` (2 030 lignes) et `/app/progress` (888) sans un
   `t()`. `/coach/weekly` et `/coach/import` : namespaces traduits, corps
   anglais rendu par une fonction edge. **Aucun agent ne traduit.**
2. **`pages/ResetPassword.tsx:111` et `components/Footer.tsx:15`** portent
   encore « Powered by IKIZEN » avec `text-slate-400`. Hors des seize (routes
   `/reset-password` et `/installer-app`), donc hors lot — mais ce sont des
   écrans **rendus**, et le reliquat y survivra au chantier.
3. **`components/YinYangLoader.tsx`** : mort, zéro importeur. Suppression
   sûre, mais c'est un geste de purge, pas de style.
4. **`keel/pages/ProgressPage.tsx`** : mort (§5.3), et ses 36 clés `progress.*`
   avec lui.
5. **`slate-*` existe aussi dans le dépôt** — pas seulement `gray-*`. Le master
   ne compte que `gray-*` ; la barre de qualité doit couvrir les deux.
6. **Formulaire figé au montage** (`SetupPage`, `HouseholdPage`) : à confirmer
   par les familles A et D, **à signaler, pas à réparer** — c'est de la logique.

---

## 7. Reproduire les mesures

```bash
cd frontend/src
# gray par fichier
grep -coE '\-gray-[0-9]{2,3}' <fichier>
# saturées hors Badge
grep -hoE '\b(bg|text|border|ring|from|to|via|divide|fill|stroke|hover:bg|hover:text)-(emerald|green|red|rose|amber|yellow|orange|blue|sky|indigo|violet|purple|fuchsia|pink|teal|cyan|lime)-[0-9]{2,3}' <fichier> | wc -l
# rayons
grep -rhoE '\brounded(-(none|sm|md|lg|xl|2xl|3xl|full))?\b' <fichier> | sort | uniq -c
```

**Vocabulaire des rayons aujourd'hui** — 7 valeurs concurrentes sur la surface
rendue : `rounded` nu ×108, `rounded-lg` ×88, `rounded-full` ×64, `rounded-xl`
×27, `rounded-md` ×22, `rounded-2xl` ×8, `rounded-3xl` ×3. Le kit en impose
deux (`Card` = `xl`, `Badge` = `full`) ; les pages en ajoutent cinq. **C'est le
kit qui tranche, les pages s'alignent.**
