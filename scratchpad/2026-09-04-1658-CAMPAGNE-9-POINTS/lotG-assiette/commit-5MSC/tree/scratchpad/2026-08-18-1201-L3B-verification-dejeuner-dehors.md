# L3-B — vérification du lot « déjeuner dehors » (trois états de présence)

**Date** 2026-08-18 12:01 · Branche `ff-001-quotidien-du-coach` · aucun push, aucun merge
**Rapport vérifié** [2026-08-18-1115-L3A-dejeuner-dehors.md](2026-08-18-1115-L3A-dejeuner-dehors.md)
**Spec** [2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md](2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md) §2.2, §2.2 bis

---

## 0. Verdict

**Le lot est vert sur son mandat de collecte.** Le modèle de données est juste,
l'arbitrage est celui de la spec, le prompt n'a pas bougé d'un caractère, les
migrations sont posées et inscrites, et les mutations rejouées mordent toutes.

**Deux défauts trouvés, tous deux à l'écran, tous deux mesurés.** L'un est
corrigé et commité (`07123da8`), l'autre est une **bombe à retardement précise**
que L3-A a déclarée fermée alors qu'elle est ouverte : la garde qu'il annonce
dans son propre code ne tient sur **aucun des trois appelants réels**.

| | |
|---|---|
| Rejeu de mutations | **9 sur 12**, toutes rouges du premier coup |
| Suite Deno `_shared/keel/` | **3251 passed, 0 failed** |
| vitest, mes 4 fichiers | **49 passed** (48 + 1 que j'ajoute) |
| vitest complet | 13 rouges, **tous étrangers** (§6) |
| `tsc -b` | 7 erreurs, **toutes L1**, aucune dans les chemins L3 |
| Navigateur | 3 états rendus, 2 langues, 320 px **et** 1280 px |

---

## 1. ⛔ DÉFAUT P1 — la grille à deux états DÉTRUIT les jetons, et le code
   affirme le contraire

### Ce que L3-A écrit dans son propre fichier (`MealPickerGrid.tsx:192`, avant ce rapport)

> « ⚠️ `onSave` REÇOIT AUSSI LES JETONS, et c'est ce qui rend le deux-états **NON
> DESTRUCTIF** […] Sans ça, ouvrir puis enregistrer la grille sur un autre écran
> effacerait en silence des midis marqués dehors — et personne ne saurait où ils
> sont passés. »

### Ce que j'ai mesuré au navigateur

Fixture : foyer `l2p-owner-1786493429016cdbc78@test.dev` (Paul, maître ; Nina,
majeure). Réponse hebdo posée par la vraie porte SQL :

```
keel_household_set_member_work_lunch(Nina, {"at_work":true,"mode":"outside"})
→ away_days = 5 × {"day":…,"slots":["lunch"],"kind":"eating_out"}
```

Puis, dans l'application : `/app/household` → Nina → « Marked on 4 meals —
change » → **Save, sans toucher une seule case**.

```
away_days APRÈS = 5 × {"day":…,"slots":["lunch"],"kind":"away"}
work_lunch      = {"mode":"outside","at_work":true}     ← inchangé
```

**Les cinq « dehors » sont morts.** Et la base est désormais **en contradiction
avec elle-même** : la colonne dit « elle mange dehors du lundi au vendredi », la
grille dit « elle est absente ». `resolveWindowPresence(...).eatingOut` rendra
`[]`, L8 ne dira jamais un nombre pour elle, et **rien n'indique pourquoi**.

### Pourquoi la garde ne tient pas

Elle est armée sur le composant, pas sur ses appelants. Les **trois** points de
montage lisent la colonne avec `parseAwayDays`, qui ne garde que `day` et
`slots` :

| Écran | Ce qu'il passe en `away` | Jeton ? |
|---|---|---|
| `HouseholdPage.tsx:1473` | `member.awayHousehold` = `awayFrom(...)` (`api/household.ts:390`) | **perdu** |
| `MealBuilder.tsx:1066` | `member.awayHousehold`, même chemin | **perdu** |
| `MealBuilder.tsx:1469` | `props.awayDays` ← `StudentWeekPlanPage:2386` `parseAwayDays(pc.away_days)` | **perdu** |
| `SetupPage.tsx:3413` | `m.away`, même famille | **perdu** |

`marks` est donc tout entier `away`, et `mergeAwayMarks` **réécrit
`kind: "away"` par-dessus**. Pire qu'avant le lot : hier une entrée sortait sans
jeton, aujourd'hui elle sort avec un `away` **affirmatif**. La destruction est
devenue positive.

C'est la cicatrice nommée du dépôt : **ceinture armée sur coffre vide**. Le test
qui la garde (`mealPickerGrid.int.test.ts`) lui donne des marques AVEC jetons —
ce qu'aucun appelant ne fait.

### Est-ce une régression aujourd'hui ? Non. Demain matin, oui.

Aujourd'hui **rien n'écrit de « dehors »** : aucun écran n'appelle
`setMemberWorkLunch`, aucun ne passe `onSaveMarks`. La porte SQL existe et
personne ne la pousse. **C'est L6 qui arme la bombe**, et il la trouvera désarmée
s'il croit le commentaire.

### Ce que j'ai fait

Je **n'ai pas** réparé : la réparation vit dans `api/household.ts` et sur les
quatre points de montage, qui appartiennent à L5/L6. J'ai corrigé **le
commentaire**, qui est dans mon périmètre et qui est la vraie cause du danger —
il promettait une garde inexistante à qui lira ce fichier ensuite.

### Le correctif, pour L6, en une ligne par écran

```ts
// AU LIEU DE                          →  METTRE
away={member.awayHousehold}            →  away={parseAwayMarks(rawAwayDays, "household")}
awayDays={parseAwayDays(pc.away_days)} →  awayDays={parseAwayMarks(pc.away_days)}
```

⚠️ **Les quatre points de montage ensemble, ou aucun.** Un seul écran corrigé
laisse les trois autres écraser ce qu'il vient d'écrire. Et
`HouseholdMemberView` n'expose pas la colonne brute : il faut soit l'ajouter,
soit remplacer `awayFrom` par `parseAwayMarks` dans `api/household.ts:430`.

---

## 2. ⚠️ DÉFAUT P2 — corrigé et commité : à 320 px, « Eating here » et
   « Eating out » se rendaient **identiques**

Commit **`07123da8`**, deux fichiers, mes chemins uniquement.

Mesuré au navigateur, viewport 320 px, l'écran du foyer, grille à trois états :

```
largeur du <select>          = 44–49 px
« Eating here » demande       = 64 px de texte + la flèche du contrôle
« Eating out »  demande       = ~58 px + la flèche
→ les deux se rendent « Eating »
```

`min-w-[26rem]` avait été posé pour des **cases à cocher** : 49 px suffisent à
une coche et à rien d'autre. Les **deux états que le lot existe pour séparer**
devenaient indiscernables, sur le seul écran où on les choisit. En français le
tronquage laisse « Ici, à » et « Deho » — lisible de justesse ; en anglais, rien.

**Correctif** : `min-w-[52rem]` **quand, et seulement quand,** `threeState` est
demandé. La case à cocher garde `26rem` — l'élargir ferait défiler trois écrans
qui n'ont rien demandé. Le conteneur défilait déjà (`overflow-x-auto`), donc la
page ne part pas de travers : **`document.scrollWidth` reste à 320**, mesuré.

Test sur la **valeur rendue** (`react-dom/server`, `.int.test.ts`), et **la
mutation mord** : remettre `26rem` partout ⇒ 1 rouge.

---

## 3. Les quatre décisions prises seul par L3-A — évaluées

| # | Décision | Verdict | Ce que j'ai mesuré |
|---|---|---|---|
| ① | Le silence gagne, **par case** et non par jour | **TENUE** | `tue/lunch` déclaré « dehors » **survit** à un `tue/dinner` marqué absent ; une journée entière (`slots: []`) côté absence emporte bien le midi. Rejoué M2 et M8 : rouges. |
| ② | Pré-remplissage matérialisé **une fois**, à l'écriture | **TENUE** | Réponse « dehors lun→ven », puis correction à la main (mercredi retiré), puis relecture **directe** ET **par le roster** : mercredi ne revient pas. Voir §4. |
| ③ | La gamelle **ne coche rien** | **TENUE** | M4 rouge ; le bloc de contrôle de la migration le prouve aussi en base (`outside` → `lunchbox` retire les 5 midis et **garde** le samedi posé à la main). |
| ④ | « La semaine » = lundi→vendredi, sans question de plus | **TENUE, et je la soutiens** | `WORK_WEEK_DAYS` des deux côtés + la liste SQL, trois copies d'accord. M7 (`+ "sat"` côté front) : rouge. La grille corrige en un clic ; un écran de plus pour ça serait cher. |

**Une nuance sur ② qu'il faut nommer, et que L6 doit lire.** Le
pré-remplissage n'est pas re-dérivé **à la lecture** — c'est prouvé. Mais il est
ré-appliqué **à chaque écriture de la réponse, même identique** : mesuré,
re-enregistrer `{"at_work":true,"mode":"outside"}` **remet mercredi**. C'est
correct (écrire la réponse *est* le geste de pré-remplissage), mais ça veut dire
qu'un formulaire qui **ré-émet sa réponse au montage ou au blur** effacerait la
correction que la personne vient de faire. C'est la cicatrice
`mount-snapshot-forms-need-a-loading-gate` du dépôt. **L6 ne doit appeler
`setMemberWorkLunch` que sur un changement réel.**

**Et un point fin, correct mais irréversible depuis le formulaire.** Le
pré-remplissage ne retire QUE les jumeaux `kind = eating_out`. Si un `away`
occupe déjà la case, il l'éclipse (le silence gagne) et **aucune réponse ne peut
plus jamais le déloger** — seule la grille le peut. C'est la règle « la grille
décide », donc ce n'est pas un défaut. Ça le devient combiné au défaut P1, qui
**fabrique** ces `away` tout seul. Vérifié aussi : **pas de dérive** vers le
plafond de 42 (4 cycles ⇒ 6 entrées, stable).

---

## 4. La règle qui gouverne le lot — rejouée en base, pas relue

```
R1.1  réponse « au bureau lun→ven, dehors »  → 5 × eating_out
R1.2  correction À LA MAIN: mercredi retiré  → set_member_away, ok
R1.3  relecture household_members.away_days  → mon, tue, thu, fri  ✅ mercredi absent
R1.3b relecture PAR LE ROSTER (chemin moteur)→ idem, + source: household  ✅
R1.3t work_lunch                             → toujours {"mode":"outside"}  ✅ pas re-dérivé
R1.4  RE-écriture de la MÊME réponse         → mercredi revient (cf. §3)
```

**La correction survit.** La grille décide.

---

## 5. Les autres points du mandat

### ③ Aucune ligne existante ne devient illisible — vérifié **sur la base réelle**

63 lignes `household_members`, une seule avec une absence :
`[{"day":"fri","slots":["breakfast"]}]`, **sans jeton**. Relue par
`parseMemberAway` → `fri/breakfast = away`, `fri/lunch = at_table`. Le silence
est bien le repli. Zéro ligne `student_goals.practical_constraints.away_days`
non vide, donc rien à casser côté déclaration.

**L'union reste la concaténation** : `keel_away_tagged` propage l'entrée entière
(`e || {source}`), le jeton traverse le roster (vérifié en SQL, `source:
"household"` posé **à côté** du `kind`), et `parseMemberAway` sur le tout rend
`self`, `household` et `eatingOut` d'accord. Un jeton inconnu (`canteen`) → lu
`away`, jamais deviné.

### ⑤ La question ne se pose qu'aux majeurs — et l'âge inconnu est un refus

```
keel_age_state(null)                          = unknown
set_member_work_lunch(MINEUR,   outside)      = {"ok":false,"reason":"not_adult"}
set_member_work_lunch(ÂGE INCONNU, outside)   = {"ok":false,"reason":"not_adult"}   ✅
set_member_work_lunch(ADULTE,   outside)      = ok, 5 midis
```

**La garde vit sur toutes les portes d'écriture, parce qu'il n'y en a qu'une.**
Vérifié : `authenticated` n'a que `SELECT` sur `household_members` (aucun
`UPDATE`), et `keel_household_set_member_work_lunch` est le seul écrivain de
`work_lunch` dans tout le dépôt.

### ⑥ Le prompt n'a pas bougé — rejoué, pas cru

Même fenêtre, mêmes bouches, **avec** et **sans** jetons :

```
block            IDENTIQUE au caractère près
servings         2 / 2
householdAway    identique     fullyAway identique     absentAllWindow identique
eatingOut        [{member_id:"m1",cells:[{tue,lunch}]}]   vs   []      ← SEUL écart
```

Et le commit `d9ac75cb` **ne contient aucun fichier de prompt** (`meal_generation.ts`,
`household_meal_generation.ts`, `meal_envelope.ts`, `tokens.ts` : absents).
`household_presence.ts` ne perd **qu'une seule ligne** — l'ancien `return` de
`parseMemberAway`. Le lot est additif.

### ⑦ Les mutations — 9 rejouées sur 12, aucune fixture complaisante

| # | Mutation | Résultat |
|---|---|---|
| M1 | repli de `kindOf` → `"eating_out"` | **4 rouges** |
| M2 | `eatingOut: withoutCells(out, shut)` → `out` | **rouge** |
| M4 | `mode !== "outside"` → `mode === null` | **rouge** |
| M6 | `presenceStateFor` décide sur la présence du champ | **2 rouges** |
| M7 | `WORK_WEEK_DAYS` front `+ "sat"` | **2 rouges** |
| M8 | ordre inversé dans `presenceStateOf` | **rouge** |
| M10 | `eating_out` → `away` dans `buildPlanGrid` | **rouge** |
| M11 | `threeState` → `false` sur la cellule | **3 rouges** |
| M12 | `threeState &&` → `false &&` sur la phrase | **rouge** |

Plus la mienne (largeur du tableau) : **rouge**. Toutes restaurées, `git status`
propre après chaque.

---

## 6. Navigateur — port 5195, persona local, deux langues, 320 px et 1280 px

**Deux-états : INCHANGÉ.** `/app/household`, grille d'une bouche : cases à
cocher, pas un `select`. Aucune régression pour qui n'a pas répondu. Le compteur
d'absences est celui d'hier.

**Trois-états : les trois s'affichent et se lisent.** (Câblé temporairement dans
`HouseholdPage.tsx`, **restauré depuis une copie de sauvegarde** — pas
`git checkout` — pour ne pas emporter le travail des lanes voisines ;
`git status` sur ce fichier est vide.)

```
aria-labels + valeurs lues au DOM, EN, 1280 px:
  Lunch — Wednesday = eating_out    Lunch — Thursday = eating_out
  Breakfast/Lunch/Dinner — Saturday = away        tout le reste = at_table
  « 5 meals off. » + « 2 of them are meals out: they leave the plan, not the day. »

FR, 1280 px:  « Ici, à table » / « Dehors » / « Pas là »
              « Dont 2 repas dehors : ils sortent du plan, pas de la journée. »
```

**Mesures de débordement**, avec le correctif :

| Largeur | `document.scrollWidth` | Page part de travers ? |
|---|---|---|
| 1280 px | 1280 | non |
| 320 px | **320** | **non** — le tableau défile dans son conteneur |

### La couture que L3-A signale — **son affirmation est VRAIE, et la couture est pire qu'il ne la décrit**

`PlanGrid.tsx` et `PlanDayBlock.tsx` ne contiennent **aucune** occurrence
d'`eating_out` (`grep -c` = 0, comme `planDayView.ts`). Une case `eating_out`
n'y rend donc **rien du tout** — pas même l'ambre de l'anomalie. Dans
`PlanDayBlock`, `silences` la **retient** (`kind !== "dish"`), et la ligne sort
en **« Lunch — »** suivi du vide : un tiret cadratin orphelin.

**« Aucune régression aujourd'hui » : CONFIRMÉ**, et je l'ai vérifié par les deux
seuls chemins qui montent `PlanResult` :
- `StudentWeekPlanPage.tsx:2386` passe `parseAwayDays(pc.away_days)` — jeton retiré ;
- `PlanDraftDialog.tsx:193` ne passe **pas** `awayDays` du tout (`?? []`).

Aucune case `eating_out` ne peut atteindre ces écrans avant que quelqu'un branche
`parseAwayMarks`. **Les deux gestes vont ensemble — et le défaut P1 aussi.**

---

## 7. Coutures NEUVES, que L3-A ne nomme pas

1. **Le vocabulaire est fermé côté maître, OUVERT côté personne.**
   `keel_household_set_member_away` refuse `bad_away_kind`. La déclaration de
   l'intéressé passe par un `.update()` PostgREST direct sur `student_goals`
   (`api/practicalConstraints.ts:55`) : **aucune contrainte** sur
   `practical_constraints`, **aucun refus de jeton**. Un `kind` inventé y
   dormirait, lu `away`, exactement le scénario que la migration décrit et ferme
   d'un seul côté. Vérifié : zéro contrainte `away` sur `student_goals`.
   *Pour qui : celui qui touchera la porte de la déclaration élève.*

2. **`set_member_away` accepte « dehors » sur un MINEUR et sur un âge INCONNU.**
   Mesuré : `{"ok": true}` dans les deux cas. La garde `not_adult` est sur la
   *question*, pas sur la *grille*. Défendable (la grille est par case, pour tout
   le monde) — mais « dehors » est précisément l'état qui **ouvre le droit à un
   conseil chiffré**. **L4 et L8 doivent trancher** si un mineur marqué « dehors »
   a droit à un nombre, sans quoi le plancher TCA et `CHILD_DIRECTION` seront
   contournés par une case de grille.

3. **La lecture par sujet n'est pas branchée.** `keel_household_work_lunch_for`
   existe, est `service_role`, et **personne ne l'appelle** :
   `generate-household-meal-v1` ne la lit pas. L3-A le signale en §7.2 ; je le
   confirme par grep — `work_lunch` n'apparaît dans aucun `supabase/functions/`
   hors de son propre module.

---

## 8. Les rouges, et à qui ils appartiennent

**Le quatrième rouge annoncé — je le signale, je ne le répare pas.**
Au passage de main on m'annonçait 3 rouges vitest (`coverage-guard` ×2,
`planRefusals` ×1). J'en mesure **13**, dans **3 fichiers** :

| Fichier | Rouges | Propriétaire |
|---|---|---|
| `src/edge/coverage-guard.int.test.ts` | 2 | **préexistant** (fonctions edge + trigger non déclarés) |
| `src/keel/copy/planRefusals.int.test.ts` | 1 | **L1** |
| **`src/keel/api/onboarding.int.test.ts`** | **10** | **L1 — NOUVEAU depuis le passage de main** |

`onboarding.int.test.ts` est le **quatrième**, et il est appuyé par `tsc -b` :
les 7 erreurs de type sont dans `onboarding.ts`, `HouseholdPage.tsx` et
`SetupPage.tsx`, **toutes** sur la comparaison des jetons d'objectif
(`recomposition`, `health`, `performance` contre
`fat_loss | muscle_gain | maintenance`). C'est la migration six objectifs → trois
de L1, à mi-chemin. **Aucune erreur, aucun rouge dans un chemin L3.**

⚠️ Le poste n'est donc **plus** à `tsc -b` exit 0. Le serveur de dev tourne quand
même (Vite ne typecheck pas), c'est ce qui m'a permis le navigateur.

---

## 9. Ce que j'ai touché

| Fichier | Quoi |
|---|---|
| `frontend/src/keel/components/MealPickerGrid.tsx` | largeur conditionnelle du tableau + commentaire de `save()` corrigé |
| `frontend/src/keel/components/mealPickerGrid.int.test.ts` | +1 test sur la valeur rendue |

Commit **`07123da8`**, par `git commit -F <msg> -- <chemins>`, **sans `git add`**,
avec le `--` de garde. J'ai attendu le verrou `.git/index.lock` d'une lane
voisine **sans le supprimer**. Aucun `git add -A`, aucun `git stash`, aucune
commande à risque, aucune réparation d'historique.

`HouseholdPage.tsx` a été câblé temporairement puis restauré **par copie de
sauvegarde**, jamais par `git checkout` : `SetupPage.tsx` porte du travail
d'une autre lane, et un `checkout` mal visé l'aurait emporté.

**Fixture de base rendue propre** : les quatre bouches du foyer de test sont
revenues à `away_days = []`, `work_lunch = null`.

---

## 10. Non prouvé — ce que je n'ai PAS pu mesurer

- **La couture L8 à l'écran.** Aucun plan publié n'existe en local (275 plans, 0
  `published`, aucun sur un compte de foyer), donc `PlanGrid`/`PlanDayBlock`
  n'ont jamais été rendus avec des cases. La couture est prouvée par le **code**
  (0 occurrence d'`eating_out`, chaîne de conditionnels non exhaustive) et le
  **chemin de données**, pas par une capture.
- **Le trois-états sur son écran définitif.** Il n'est monté nulle part : je l'ai
  vu par un câblage temporaire. Ce que L6 livrera peut différer.
- **Aucun run modèle.** Le lot ne touche pas au prompt ; je l'ai prouvé par
  égalité de sortie et par l'absence des fichiers du prompt dans le commit, pas
  par un appel réel.
- **Les 3 mutations non rejouées** (M3, M5, M9). Les 9 autres mordent toutes ;
  aucune fixture complaisante trouvée sur cet échantillon.
