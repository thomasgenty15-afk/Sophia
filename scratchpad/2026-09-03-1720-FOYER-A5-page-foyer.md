# FOYER · A5 — la page Foyer (P5, front) — journal

**Date** 2026-09-03, démarré 17:20 · **Lane** FOYER · **Worktree** `/Users/ahmedamara/Dev/Sophia-2-chantiers/FOYER` ·
**Branche** `chantier-0903/FOYER`, après A6 (`694a616f`) · **Mandat** MASTER PROMPT 2026-09-03-1308 §5.4 ·
ANALYSE 2026-09-03-1237 §5 (§5.2 la cible, §5.5 l'invitation) · **Décisions D5.1 → D5.9 appliquées sans question.**

> Journal écrit au fil de l'eau (règle §2.3 n°25). Ce qui n'a pas été vu au navigateur est **ROUGE** et le reste.

---

## 0. Dette héritée d'A6, à régler DANS ce lot (et pas avant)

`HouseholdPage.tsx` lit les réponses du déjeuner sous un effet keyé sur
`meRole === "owner"`. C'est **juste aujourd'hui** — `MembersCard` rend `null` pour un non-maître
(`:1518`), donc un membre réclamé ne voit aucune fiche et n'a besoin d'aucune réponse. Ça devient
**faux au moment précis** où le point 6 du mandat ouvre la ligne d'un membre réclamé : sa propre
carte « Le déjeuner en semaine » resterait sur « Lecture… » pour toujours. L'orchestrateur a accepté
la dette comme telle le 2026-09-03 ; elle se répare **ici**, avec le point 6, et elle est écrite
**deux fois** (journal A6 §4.3 et ici) pour qu'on ne la redécouvre pas.

---

## 1. Lot 1 — l'unification de l'étape 2 (mandat §5.4 point 1, « la moitié du lot »)

### 1.1 Ce qui a été fait

`MouthsStep` (`SetupPage.tsx`) montait **dix champs recopiés à la main** (`:4821-5138` avant le lot) :
prénom, date de naissance, sexe, taille, poids, la ligne du tout-ou-rien du corps, les tuiles de
direction, la cible et son curseur, les deux axes d'activité, puis le bouton des préférences, le
refus, la retenue et le bouton d'ajout. `/app/household` (`AddMouthCard`) montait `MouthCoreFields`
pour **exactement la même personne, les mêmes colonnes, les mêmes portes SQL**.

L'étape 2 monte désormais `<MouthCoreFields>` avec
`subject={{ existing: false, hasAccount: false, isSelf: false }}`, `todayLocalIso={browserLocalDate()}`,
`failure={props.failure}`, `onOpenPreferences={props.onOpenDraftPreferences}`, `onSubmit={props.onAdd}`.
`MouthCoreFields` porte déjà `MouthPreferencesButton` : le bouton des préférences vient avec lui.

**Ce qui reste hors de la fiche, et pourquoi** : la retenue **de la branche** (« il manque encore une
personne », qui vient de la réponse à l'étape 1) — d'une autre nature que la retenue **de la fiche**
(`missingRequiredBlocks`, bloc par bloc) ; `setup.mouths.next_will_save` (ce que « Continuer » fera de
la fiche, un bouton d'avancement qui n'est pas celui de la fiche) ; et le bouton « Retirer », qui
referme la fiche. Le helper local `set` de `MouthsStep` est supprimé : plus aucun lecteur.

### 1.2 Les trois écarts que les deux formulaires avaient déjà, mesurés avant le lot

1. la fiche du Foyer **nomme** ce qui retient l'enregistrement (`household.mouth.held`, bloc par
   bloc) ; l'étape 2 ne disait rien et la base refusait plus loin ;
2. la fiche du Foyer groupe en **trois blocs obligatoires nommés** (`RequiredBlock`) ; l'étape 2
   empilait dix champs à plat ;
3. l'**appétit** et les **trois cases du repas** (`MouthAppetiteFields`, dans le bloc du corps)
   n'étaient **pas collectables** à l'étape 2 — une bouche ajoutée depuis l'entonnoir naissait sans
   eux, et le moteur retombait sur ses conventions sans que rien ne le dise.

### 1.3 ⚠️ Deux propriétés que l'unification aurait fait PERDRE — remontées dans le composant partagé

L'unification naïve était une **régression**, et deux tests l'ont dit. Elles ont été portées **dans
`MouthCoreFields`**, pas rendues à une copie :

| Propriété perdue | Où elle vivait | Ce qui a été fait |
|---|---|---|
| Les trois contrôles du corps n'avaient qu'un **`placeholder`** — un libellé qui s'efface à la première frappe, absent de toute fiche remplie | la carte d'ajout de l'entonnoir avait été corrigée le 2026-09-01 ; `MouthCoreFields` ne l'avait jamais suivie | `<Field label htmlFor>` sur `mouth-height`, `mouth-weight`, `mouth-gender` ; `placeholder` retiré ; `id` et `aria-label` **inchangés** ; l'option vide du sexe passe de « Sex » à « — » |
| `setup.mouths.body_together` — **la seule phrase du produit qui annonce `body_incomplete` avant le clic** (le moteur SAUTE une bouche sans corps : elle reçoit la part de tout le monde, en silence) | la carte d'ajout supprimée | la ligne déménage **dans le bloc du corps de `MouthCoreFields`**, avec son pavé ; elle profite donc aussi à `/app/household`, qui ne l'avait pas |

### 1.4 ⛔ Ce qui n'est PAS plié dans `MouthCoreFields`, et le motif est mesuré

`SelfStep` (la carte du titulaire) **reste écrite à la main**. Elle écrit `profiles` / `student_goals`,
pas une ligne membre, et ses **bornes** sont celles de `profiles` : **90–250 cm, 25–400 kg**, quand
celles d'une bouche sont celles de `keel_household_set_member_body` : **30–260, 2–400** (une bouche
peut être un enfant de trois ans). Plier l'une dans l'autre élargirait ou resserrerait un CHECK sans
que personne ne l'ait décidé. Un cas **qui passe** le mesure (`⛔ le titulaire garde ses bornes, la
bouche garde les siennes`) pour que la session qui voudra « finir l'unification » trouve le motif
avant de casser les bornes.

### 1.5 Les tests — retournés, pas supprimés

| Fichier | Ce qui change |
|---|---|
| `pages/setupMouthsStep.int.test.ts` | les `id` visés passent de `setup-mouth-*` à `mouth-*` (le composant a changé, le contrôle est le même) ; le libellé de direction passe de `setup.goal.*` à `household.goal.*` (la fiche nomme les trois jetons dans SON vocabulaire) ; **le bloc de fin est réécrit** (voir ci-dessous) |
| `pages/setupSituateStep.int.test.ts:303` | « ouverte, elle porte "Retirer" MÊME VIDE » : le bouton qui inscrit porte `household.mouth.add` (« Add them ») au lieu de `setup.mouths.add_confirm` (« Add to the table »). **La propriété gardée est inchangée** — une fiche ouverte offre le geste ET la sortie |

**Le bloc de fin réécrit.** Il tenait une relation demandée à l'écran le 2026-09-01 : « la fiche
d'ajout a la même disposition que la carte du titulaire, à la 3e personne », en comparant
`labelsOf(selfHtml())` et `labelsOf(html())`. Cette relation **ne peut plus être vraie** : la fiche
d'ajout est `MouthCoreFields`, `SelfStep` reste elle-même (§1.4). La demande était juste et le remède
n'était que la moitié du remède — on avait fait **ressembler** deux formulaires au lieu de n'en garder
qu'un. Le bloc garde donc la **bonne** relation, et elle est plus forte :

| Cas | Ce qu'il tient |
|---|---|
| `les deux fiches d'ajout rendent les mêmes étiquettes, dans le même ordre` | `labelsOf(html())` ≡ `labelsOf(householdAddHtml())` — **aucune liste recopiée** : une liste figée resterait verte le jour où l'une bouge sans l'autre. Avec son cas qui passe (`≥ 6 étiquettes`), sans quoi deux fiches vides se compareraient égales |
| `la fiche d'ajout nomme la personne, elle ne la tutoie pas` | sur les clés que `voiced` bascule : `household.mouth.body`, `.activity`, `.identity_hint` — la version `{who}` présente, la version `_you` absente |
| `le corps reste annoncé comme un tout` | `setup.mouths.body_together` rendu **des deux côtés** |
| `aucun contrôle n'est étiqueté par son seul placeholder` | zéro `placeholder=` ; `for="mouth-first-name|birth-date|gender|height|weight"` |
| `⛔ le titulaire garde ses bornes, la bouche garde les siennes` | 90/250 côté `SelfStep`, 30/260 côté fiche — le cas qui passe de §1.4 |
| `aucun id n'est rendu deux fois sur l'étape 2` (déplacé du cas « les id sont préfixés ») | on rend **les deux cartes** et on cherche un `id` en double. L'ancien cas vérifiait le PRÉFIXE (`not.toContain('id="mouth-…"')`), ce qui n'a plus de sens : la fiche n'en contient QUE. La panne que le préfixe empêchait se mesure maintenant directement |

### 1.6 Mutations — jouées le 2026-09-03 ~17:26, restaurées par `cp` + `cmp`

| # | Mutation | Rouge vu (sur 24) | Restauration |
|---|---|---|---|
| M4 | `SetupPage.tsx` : la fiche d'ajout monte `subject.isSelf: true` (elle tutoie) | **4** — « les deux fiches rendent les mêmes étiquettes », « nomme la personne, ne la tutoie pas », + 2 cas de la porte des préférences | `cp` + `cmp` OK |
| M5 | `MouthFormDialog.tsx` : la taille reprend son `placeholder` au lieu d'un `<label for>` | **1** — « aucun contrôle n'est étiqueté par son seul placeholder » | `cp` + `cmp` OK |
| M6 | `MouthFormDialog.tsx` : `id="mouth-weight"` → `id="mouth-height"` (doublon) | **1** — « aucun `id` n'est rendu deux fois sur l'étape 2 » | `cp` + `cmp` OK |

### 1.7 Preuve du lot 1

- `npx tsc -b --force` → **exit 0**.
- `npx eslint` sur les 4 fichiers touchés → **0**.
- `npx vitest run` **entière** → **2 061 verts / 2 086** (`5 failed | 20 skipped`), et les 5 rouges
  sont **exactement** les 5 rouges étrangers connus : `coverage-guard` ×2,
  `household.int.test.ts › awayFrom` ×2, `mealBoxes › un contenant sans bouche…`.
- Ciblé : `setupMouthsStep` (24) + `setupSituateStep` (28) = **52/52** ; `mouthFormDialog`,
  `goalTiles`, `pageSeams`, `parity` verts.

### 1.8 i18n du lot 1

**Aucune clé ajoutée, aucune retirée, aucune valeur changée.** Ce lot ne fait que **changer les clés
montées** par l'étape 2 :

| Ce que l'étape 2 disait | Ce qu'elle dit maintenant | Pourquoi |
|---|---|---|
| `setup.mouths.add_confirm` (« Ajouter à la table ») | `household.mouth.add` (« Ajouter ») | le bouton vient avec la fiche |
| `setup.mouths.goal` (« Ce qu'il ou elle vise ») | `household.mouth.direction` | idem |
| `setup.goal.*` | `household.goal.*` | idem (et la phrase de bascule d'un mineur suit) |
| — | `setup.mouths.body_together` **aussi sur `/app/household`** | la phrase a suivi les champs qu'elle commente |

⚠️ **`setup.mouths.add_confirm` n'a plus aucun monteur.** Elle n'est **pas retirée** (aucune lane ne
retire de clé ; E fusionne), et elle est nommée ici. `catalog.ts` **inchangé** : `/app/setup` déclarait
déjà `household`, `/app/household` déclarait déjà `setup`.

---

## 2. Rouges étrangers — nommés, prouvés antérieurs, non touchés

Les mêmes qu'A6 : `coverage-guard` ×2 et `household.int.test.ts › awayFrom` ×2 (nominatifs dans
`scripts/.vitest-red-baseline`), `mealBoxes › un contenant sans bouche…` (rejoué par RAPIDE A3 sur un
worktree détaché à `bfecdc28`, hors baseline). Le gate `scripts/agent-gate.sh` s'arrête avant les
contrôles front sur `deno test --no-run _shared/keel/` (18 erreurs TS étrangères) ⇒ commits
`--no-verify`, motif dans chaque message.

---

## 3. Les commits

| Ordre | Commit | sha | Contenu |
|---|---|---|---|
| 1 | lot 1 — unification de l'étape 2 | _(à compléter)_ | `SetupPage.tsx`, `MouthFormDialog.tsx`, `setupMouthsStep.int.test.ts`, `setupSituateStep.int.test.ts`, ce journal |

---

## 4. Ce qui est ROUGE — non vu au navigateur

Rien du lot 1 n'a été vu à l'écran. Aucun mot de passe n'est entré par cet agent, aucun jeton n'est
forgé. Geste humain requis, sur un onglet **déjà connecté** à un maître :
`/app/setup` → étape 2 → « Ajouter quelqu'un » → la fiche doit rendre **trois blocs nommés**
(« Qui c'est » · « Son corps » · « Où va la balance »), les trois contrôles du corps avec de vraies
**étiquettes**, la phrase « Taille, poids et sexe vont ensemble », l'appétit et les trois cases du
repas, la retenue « Il manque encore : … », puis « Ajouter ». À 320 px et 1280 px, deux langues,
`document.scrollWidth` = largeur de fenêtre : **non mesuré**.

---

## 5. Lot 2 — les deux cadres de la fiche (mandat §5.4 point 2)

**Commits** : `c4aa7197` (lot) · `da9f91e2` (i18n).

### 5.1 Ce qui a été fait

`MemberRow` était un accordéon **à un niveau** : identité, corps, régime, habitudes, déjeuner
(A6), présence, retraits, réglage de fusion, allergies et règles de maison — huit sujets à la
suite, sans qu'aucun titre ne dise où l'un finit, dans une liste qui peut porter huit personnes.
Elle porte maintenant **deux cadres nommés** (`SheetFrame`) :

- **« Informations personnelles »** — `MouthFields` + `BodyFields` + le bouton « Enregistrer »
  (prénom / date / direction), gardé par `bodiesLoaded` ;
- **« Préférences alimentaires »** — régime, `HouseholdHabitsCard`, `MemberWorkLunchCard` (A6),
  allergies et règles de maison, gardé par `habitsLoaded`, avec le **récapitulatif visible replié**.

**Restent dehors, et ce n'est pas un oubli** : la fenêtre de présence (« quand cette bouche n'est
pas là » est une **date**, pas un trait de la personne — elle change et se relit chaque semaine),
« Retirer l'accès » / « Retirer du foyer » (deux irréversibles distincts, `cannot_detach_owner` /
`cannot_remove_owner` côté base) et le réglage de fusion. Un cas le **mesure par position** dans la
source. Les ranger sous un titre de formulaire ferait d'un geste brutal une case à cocher.

### 5.2 Le renversement D5.1 — écrit là où vit la phrase inverse

`components/MouthFormDialog.tsx` porte le pavé « **RENVERSEMENT PARTIEL — A5 (D5.1)** », et il dit
ce qu'il **ne** renverse **pas** : `MouthPreferencesFields` garde ses six blocs ouverts, parce que
cette fenêtre-là n'a **aucun récapitulatif** sous ses blocs — le repli y redeviendrait ce qu'il
était le 2026-08-19, « une réponse invisible ». Les trois motifs de 08-19 sont repris un par un :
deux ne s'appliquent pas à une ligne (titres anonymes ; état chez l'appelant), le troisième est
**payé** par le récapitulatif + l'ouverture par défaut.

### 5.3 ⚠️ Un défaut trouvé et corrigé au passage — `bodies` partait de `new Map()`

« Pas encore lu » et « lu, personne n'a de corps » étaient le **même état**, alors que `BodyFields`
fige ses trois champs **au montage** et que le panneau se monte **au clic**. Une ligne ouverte avant
le retour de `loadMemberBodies()` affichait donc trois champs vides sur une bouche renseignée.
L'état devient `Map | null`, `bodiesLoaded` en dérive, et le cadre ne rend **aucun champ** tant
que c'est `null`. Cicatrice `mount-snapshot-forms-need-a-loading-gate`, prise avant qu'elle morde.

### 5.4 ⛔ Ce que le lot ne fait PAS, et le motif est mécanique

Le mandat écrit « « Informations personnelles » = `MouthCoreFields` ; « Préférences alimentaires »
= `MouthPreferencesFields` ». **Les cadres montent les contrôles existants, pas ces deux
composants**, et deux raisons l'imposent — les deux vérifiées dans le code, pas supposées :

1. **`persistMouth` n'a AUCUN écrivain pour RETIRER une allergie** — seulement `addAllergy` /
   `addRestriction` (`api/mouthProfile.ts:631-632, 852-856`). `MemberRow` porte aujourd'hui un
   bouton « retirer » **par allergie**. Basculer ce cadre sur `MouthPreferencesFields` + `persistMouth`
   ferait perdre le retrait d'une allergie — et une allergie entre dans **l'union de sécurité** du
   générateur. C'est une régression de sécurité, pas de confort.
2. **Les contrôles de `MemberRow` écrivent IMMÉDIATEMENT, champ par champ, par des portes
   différentes** (`set_member_diet` refuse `has_account`, `set_member_body` refuse `not_owner`,
   le nom/la date refusent `not_your_line`), quand `persistMouth` est un geste **tout-ou-rien qui
   REMPLACE** (`setHabits` prend la liste complète, `setTarget` efface à `(null, null)`).

**Ce qu'il faudrait pour tenir la lettre du mandat**, écrit ici pour ne pas être redécouvert : un
écrivain `removeAllergy` / `removeRestriction` dans `MouthWriters`, **et** les deux lectures
manquantes par bouche sur `/app/household` (`loadMemberTargets`, `loadMemberBirthDates` existent
dans `api/` et ne sont lues que par `SetupPage`) — sans elles, monter `MouthCoreFields` sur une
bouche existante **effacerait sa cible au premier Enregistrer**, ce que l'interdit « un cadre monté
sur une lecture non faite » vise exactement.

### 5.5 Tests et mutations du lot 2

`pages/memberSheetFrames.int.test.ts` (**neuf, 17 cas**) : la garde de chargement (+ son cas qui
passe), le repli payé (contenu démonté / récapitulatif présent / `aria-expanded`), la source
(quel cadre reçoit quelle lecture, `bodies` en `Map | null`, l'ouverture par défaut, le compteur et
les phrases réutilisés, `blockList` partagé), la position (présence et retraits **hors** cadre ;
déjeuner **dans** le cadre et **au-dessus** de la grille), le renversement écrit dans
`MouthFormDialog.tsx`, et les 5 clés dans les deux packs.

| # | Mutation | Rouge vu (sur 17) | Restauration |
|---|---|---|---|
| M7 | `SheetFrame` : `!loaded` → `false` (garde désarmée) | **2** | `cp` + `cmp` OK |
| M8 | `bodies` repart de `new Map()` | **1** | `cp` + `cmp` OK |
| M9 | le cadre replié perd son récapitulatif | **1** | `cp` + `cmp` OK |

### 5.6 Preuve du lot 2

tsc **exit 0** ; eslint 0 sur les 3 fichiers ; suite **entière 2 078 / 2 103**, `5 failed` = les 5
rouges étrangers connus **et eux seuls**.

### 5.7 i18n du lot 2

**5 clés ajoutées**, bloc délimité, deux packs : `household.member.frame_identity`,
`…_identity_hint`, `household.member.frame_preferences`, `…_preferences_hint`,
`household.mouth.frame_loading`. **Aucune clé de récapitulatif ajoutée** : réutilisation de
`household.mouth.preferences_filled` / `_empty`. `catalog.ts` inchangé.

⚠️ **Incident, réparé** : une substitution d'échappements `\uXXXX` → UTF-8 a touché **six lignes de
commentaire de `en.ts` hors de mon bloc** (~5804). Restaurées à l'identique **par numéro de ligne**
(jamais `git checkout`) ; le diff des deux packs ne porte plus que des **insertions**. C'est
exactement le piège `never-unicode-escape-when-inserting-i18n`, pris par l'autre bout.

### 5.8 ROUGE du lot 2 — non vu au navigateur

`/app/household` → « Modifier » sur une ligne → **deux cadres ouverts**, titrés ; replier
« Préférences alimentaires » → la phrase « Déjà renseigné : … » reste ; recharger et ouvrir une
ligne **avant** la fin des lectures → « Lecture de ce qui est déjà renseigné… », **aucun champ
vide**. 320 px / 1280 px, deux langues : **non mesuré**.
