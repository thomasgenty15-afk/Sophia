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
