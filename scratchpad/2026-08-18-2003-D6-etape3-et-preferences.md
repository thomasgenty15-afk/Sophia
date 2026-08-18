# D6 — l'étape 3 en ligne, les préférences en pop-up

**2026-08-18 · à partir de 20h00** · branche `ff-001-quotidien-du-coach`.
**Aucun push, aucun merge, aucune commande à risque.**

> Écrit **au fil de l'eau**, commité à chaque morceau (l'infrastructure coupe
> toutes les ~10 min). Ce qui n'a pas été vérifié est marqué **NON VÉRIFIÉ**.

| # | Sujet | Sort | Commit |
|---|---|---|---|
| ① | « C'est un adulte ou un enfant ? » retirée, et l'objectif ne s'efface plus | **livré** | `0009b1ab` |
| ② | Deux surfaces : l'étape 3 en ligne, les préférences derrière un bouton | en cours | — |

---

## ① La question de l'âge — et ce qu'elle faisait en plus

**Retirée** : `SetupPage.tsx`, formulaire d'ajout d'une bouche (étape 2b).

Le champ `kind: "adult" | "child"` du brouillon, ses deux boutons, et le geste
qui les accompagnait :

```
set({ kind, goal: kind === "child" ? "" : draft.goal })
```

Repasser en « enfant » **vidait la direction déjà choisie**. C'est l'ancienne
règle « un mineur n'a jamais d'objectif », **renversée le 2026-08-18** en base
(migration `20260818100000`, les deux portes RPC ouvertes) et dans le moteur
(`servingDirectionFor`). Cet écran était le dernier endroit à l'appliquer.

Et la question elle-même était une **seconde source** pour un fait que la date
de naissance, collectée trois champs plus bas dans le même formulaire, dit déjà
— mieux : elle sait répondre « je ne sais pas », troisième état que le moteur
traite à part (aucune direction appliquée) et qu'une paire de boutons ne peut
pas exprimer.

### Les lecteurs de `kind`, audités **commentaires retirés**

| Lecteur | Sort |
|---|---|
| `MouthDraft.kind` (le champ) + `emptyMouthDraft` | **retiré** |
| le sélecteur à deux boutons (`["adult","child"]`) | **retiré** |
| `goalsForAge(draft.kind)` → liste des directions du brouillon | **devient `MEMBER_GOALS`** — la liste ne dépend plus de l'âge depuis le 18/08 ; fabriquer un `kind` depuis la date juste pour l'ignorer serait un paramètre inventé |
| `m.claimed && m.kind === "child" ? null :` (`MouthRow`) | **retiré** — un mineur **déjà inscrit** ne voyait NI le champ NI la phrase « ça se règle dans ton about you » : un blanc, là où un majeur lit une phrase |
| `m.kind` de la pastille · `goalsForAge(m.kind)` d'une ligne existante | **gardés** : ils **dérivent** de `ageState` en base (`onboarding.ts:1538`), ils ne demandent rien |

**Deux commentaires périmés** qui disaient le contraire du code à quatre lignes
d'écart (« `fat_loss` et `recomposition` ne sont pas proposées à un enfant »,
`SetupPage.tsx` ×2) sont corrigés. Le premier avait déjà été signalé par la lane
E sans être touché.

### La preuve

`frontend/src/keel/pages/setupMouthsStep.int.test.ts` — **sur la valeur rendue**
(`react-dom/server`). `MouthsStep` est **exporté pour ça**, avec la note qui dit
pourquoi. 8 tests. **Cinq mutations passées, les cinq mordent** :

1. réintroduire la question à l'écran → rouge ;
2. filtrer la liste des directions sur la date de naissance → rouge ×2 ;
3. réintroduire `m.claimed && m.kind === "child"` → rouge ;
4. réintroduire le champ `kind` dans le brouillon → rouge ;
5. réintroduire un effacement de `goal` → rouge.

Le cas qui PASSE, sans lequel la première garde serait verte sur un composant
vide : « il demande toujours la date de naissance ».

### ⚠️ Ce que je n'ai pas touché, et qui applique encore l'ancienne règle

`api/onboarding.ts:1145` et `:1153` — `personMisses` :

```
const carriesGoal = person.kind === "adult" && isKnownGoal(person.goal);
if (person.kind === "adult" && !isKnownGoal(person.goal)) missing.push(goalId);
```

L'entonnoir **ne réclame donc pas** la direction d'un mineur, et ne compte pas
celle qu'il porte. Ce n'est pas un effacement (rien n'est jeté), mais c'est la
même règle d'avant le 18/08, dans le calcul de ce qui manque. **Non corrigé** :
c'est un changement de ce qui BLOQUE l'entonnoir pour tous les foyers avec
enfants, donc un arbitrage produit, pas un nettoyage. À trancher par un humain.

---

_(la suite est ajoutée au fil de l'eau)_

---

## ② Deux surfaces — ce qui structure reste en ligne, ce qui affine passe derrière un bouton

Trois commits, parce que trois faits distincts.

### 2a · La cloison (`518ef2d1`)

`MouthFormFields` (six blocs dans une fenêtre) devient **deux composants** :

| Composant | Blocs | Où |
|---|---|---|
| `MouthCoreFields` | ① qui c'est · ② le corps + le cran d'activité · ③ la direction **avec le poids visé et le curseur de rythme** | **en ligne, sans clic** |
| `MouthPreferencesFields` | ④ ce qu'elle mange déjà + le shaker · ⑤ les allergies · ⑥ ses dégoûts + son régime | **dans la fenêtre**, ouverte par « Renseigner ses préférences alimentaires » |

**Un seul brouillon, un seul écrivain.** La fenêtre n'a **aucun** bouton qui
enregistre : elle édite le brouillon de la fiche, et le Save de la fiche écrit.
Deux boutons d'enregistrement sur le même brouillon, c'est la cicatrice « deux
formulaires qui écrivent les mêmes colonnes ».
La contrepartie est **nommée à l'écran** : `filledPreferenceBlocks` récapitule
sous le bouton ce qui a été renseigné derrière — sans quoi fermer la fenêtre se
lit comme perdre sa saisie. « Aucune allergie » y compte comme une **réponse**.

`/app/household` **garde sa surface** ; c'est sa composition qui change. La fiche
du maître et la carte d'ajout rendent les trois premiers blocs **en ligne** ; le
brouillon est semé **dès le premier rendu** puis re-semé à chaque lecture
différente (l'ancien « on sème à l'ouverture » n'a plus d'ouverture).

### 2b · Le corps avant le rythme qu'il borne (`bd89db47`)

**C'est la réponse à la question ouverte, et ce n'est pas l'état « pas de marge ».**

Mesuré au navigateur : le poids visé **s'affiche bien** ; c'est le **curseur**
qui est retenu tant que taille + poids + sexe manquent — et la fiche du maître
s'ouvre avec un corps vide, les trois champs étant **plus bas dans la même
fenêtre**. Un contrôle muet se lit comme une fonctionnalité absente.

`MOUTH_FORM_BLOCKS` devient `identity · body · direction`. La raison de l'ordre
d'origine (« on demande d'abord ce que la personne veut ») est **gardée dans le
code**, pas effacée. Suivent : `missingRequiredBlocks` (la phrase « il manque… »
nomme les blocs dans l'ordre où ils sont posés) et la copie
`pace_needs_body`, qui ne dit plus « ci-dessous » mais « juste au-dessus ».

**Les quatre états du curseur, et ils ne se confondent pas :**

| État | Ce que l'écran montre | Atteint ? |
|---|---|---|
| `folded` | rien — la direction ne bouge pas | ✅ testé |
| `needs_body` (`null`) | **une phrase** : « renseigne taille, poids et sexe juste au-dessus » | ✅ testé, et c'est **le cas que l'utilisateur a rencontré** |
| `no_margin` (`0`) | **une autre phrase**, ambre — jamais un curseur de 0,05 à 0 | ✅ **atteignable** : un corps de **25 kg / 140 cm**, adulte, en perte. La lane E ne l'avait pas trouvé parce qu'elle s'était arrêtée à 38 kg |
| `slider` | un curseur borné sur CE corps | ✅ testé |

**Aucun de ces états n'est un dépliage vide.**

### 2c · L'étape 3 de l'entonnoir (`eef6b5e4`)

`TargetAndPaceFields` est **extrait** (un seul exemplaire des quatre états dans
le dépôt) et monté dans la carte du titulaire à l'étape 3. `SetupPage` ne
contient **aucun** appel à `paceControlFor`, et un test le garde.

- le brouillon est **dérivé à chaque rendu** de `self` — le plafond suit le corps
  saisi à l'étape 2, une copie figée proposerait un rythme calculé sur un corps
  corrigé depuis ;
- **deux valeurs seulement** en état, lues par `loadOwnMouth` ; `null` = pas
  encore lu, et la carte ne rend alors **aucun champ** (ces valeurs existent
  peut-être déjà en base) ;
- le « Continuer » écrit par `setOwnTarget`, ce qui part est décidé par
  `targetPayloadOf` (miroir du CHECK `target_needs_direction`), et `no_goal_row`
  est toléré **quand il n'y a rien à écrire**.

---

## Ce qui N'EST PAS fait, et pourquoi

1. 🟥 **Le bouton « Renseigner ses préférences alimentaires » n'est pas monté
   dans l'entonnoir.** Les blocs qu'il porte y existent déjà, éclatés : les
   allergies à l'étape 2, le régime et la ligne libre dans la carte de l'étape 3.
   Monter la fenêtre par-dessus ferait **deux formulaires sur les mêmes
   colonnes** — exactement ce que le lot 2a existe pour empêcher. Le déplacer
   demande de RETIRER ces champs de l'entonnoir et de leur donner un brouillon
   par bouche : c'est un lot à part, pas une prop de plus.
2. 🟥 **Les autres bouches n'ont ni poids visé ni rythme à l'étape 3.** Leur
   cible passe par `setMemberTarget` (porte distincte) et demande un brouillon
   par bouche. La prop le dit (`target={null}`, **requise**).
3. ⚠️ **`api/onboarding.ts:1145` et `:1153`** appliquent encore l'ancienne règle
   d'âge dans le calcul de ce qui manque (voir §① ci-dessus). Arbitrage produit.

## Ce qui reste sur le DISQUE, hors commit (i18n)

`household.mouth.*` est absent de `en.ts` à HEAD, `fr.ts` n'est pas suivi. Clés
ajoutées **en/fr** :

```
household.mouth.preferences_open        household.mouth.preferences_empty
household.mouth.preferences_title       household.mouth.preferences_filled
household.mouth.preferences_title_named household.mouth.preferences_kept
household.mouth.preferences_intro       household.mouth.preferences_done
household.mouth.block_habits · block_allergies · block_tastes
```

Clé **modifiée** (elle disait « ci-dessous ») : `household.mouth.pace_needs_body`.

## Rouges

Suite frontend lancée à la main avant chaque commit (`agent-gate` ne joue pas
vitest) : **1612 passed, 4 failed** — les quatre sont **étrangers et connus** :
`coverage-guard` ×2, `household.int.test.ts` ×2 (`awayFrom`). `--no-verify` sur
chaque commit, motif écrit dans chaque message. `npx tsc -b --force` : exit 0.

## Commits

| Commit | Sujet |
|---|---|
| `0009b1ab` | la question de l'âge retirée, l'objectif d'un enfant ne s'efface plus |
| `958e1625` | ce rapport, au fil de l'eau |
| `518ef2d1` | deux surfaces : la fiche en ligne, les préférences derrière un bouton |
| `bd89db47` | le corps avant le rythme qu'il borne |
| `eef6b5e4` | l'étape 3 porte le poids visé et le rythme |
