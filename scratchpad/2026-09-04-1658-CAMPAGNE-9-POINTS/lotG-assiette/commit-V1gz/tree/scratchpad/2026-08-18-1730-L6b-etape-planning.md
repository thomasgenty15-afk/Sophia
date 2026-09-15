# L6-b — l'étape `table` : les moyens avant les moments

**2026-08-18 · 17h30** · branche `ff-001-quotidien-du-coach`, aucun push, aucun merge.
Reprise d'un lot à moitié fait, après quatre agents calés.

---

## 0. En une phrase

Les deux cartes qui dormaient hors de l'écran sont **montées**, dans l'ordre imposé,
mesurées sur le HTML rendu ; **le P1 est prouvé au navigateur, deux fois, avec
l'écriture confirmée et la contre-épreuve jouée** ; et une garde qui n'était tenue
que par un pavé de commentaire est devenue mesurable.

**Trois commits, chacun ne portant que ses propres fichiers.**

| Commit | Ce qu'il pose | Fichiers |
|---|---|---|
| `e45244f4` | `TableStepPlanning` — le porteur des deux cartes, et l'ordre | 3 |
| `077b96dc` | le montage dans `SetupPage` | 1 (2 hunks, index privé) |
| `f001fda0` | la garde du repli vide, rendue mesurable | 3 |

---

## 1. Ce que j'ai trouvé en arrivant, et gardé

Un agent précédent avait écrit **`TableStepPlanning.tsx`, son test et
`workLunchCommit.ts`**, les avait **stagés dans l'index partagé — et n'avait
jamais commité**. Le travail était complet et juste : 9 tests verts, typecheck
vert. Mon premier geste a été de le **commiter tel quel**, avant toute autre
chose, sous un message qui dit qu'il n'est pas de moi.

C'est exactement la leçon de ce lot : *ce qui n'est pas commité n'existe pas*.
Trois quarts d'heure de travail attendaient dans un index que n'importe quel
`git checkout` d'une lane voisine aurait pu effacer.

---

## 2. Ce qui est monté

### 2.1 L'ordre, et il est mesuré

```
① AVEC QUOI VOUS CUISINEZ   (KitchenEquipmentCard, L2-A)   docY  298
② LE DÉJEUNER EN SEMAINE    (WorkLunchCard, L3-A)          docY  572
③ QUI MANGE, ET QUAND       (TableStep, l'existant)        docY 1218
```

Mesuré **dans le DOM réel** (`getBoundingClientRect`), et mesuré une seconde
fois **sur le HTML rendu** par le test (`indexOf(four) < indexOf(déjeuner)`).
Un ordre qui ne tient que par la lecture d'un fichier se défait au premier
déplacement de bloc.

La raison de l'ordre n'est pas cosmétique : on demande **avec quoi** on cuisine
avant de demander **quand**. L'inverse planifie une cuisson qu'aucun appareil de
la maison ne peut faire, puis demande à quelqu'un de trouver le temps de la faire.

### 2.2 Le déjeuner, majeurs seulement

`workLunchRoster` (déjà commité) rend les trois états d'âge, et le **titulaire est
la première bouche** : `readFunnelFacts` le retire de `mouths`, donc partir de la
liste des autres n'aurait jamais posé la question à celui qui remplit le formulaire.

Vérifié à l'écran : les trois bouches du foyer de test sont interrogées **une fois
qu'elles ont une date de naissance**. Avant que je ne donne la sienne à Kai, il
n'était **pas** interrogé — c'est `unknown`, et c'est le comportement voulu : la
base refuse `not_adult` sur l'âge inconnu, et un refus loin du geste est un bouton mort.

---

## 3. ⛔ Le P1, au navigateur — **FAIT**, et prouvé par les deux bouts

**Condition de sortie :** `/app/household` → un membre → **Enregistrer sans toucher
une case** ne doit plus transformer ses midis « dehors » en « absent ».

### 3.1 La fixture — authentique, pas fabriquée à la main

`qa0805.kai@keeltest.dev`, foyer `58abb20a…`, deux majeurs (Mira, ZoeL5B).
**Aucun mot de passe n'a été saisi** : un onglet du Browser pane portait déjà la
session de ce compte.

L'état de départ n'a **pas** été écrit à la main dans `away_days`. J'ai fait tourner
**la vraie porte** `keel_household_set_member_work_lunch`, en lui donnant l'identité
de Kai par `request.jwt.claims` — le patron que la migration utilise pour son propre
contrôle final. Elle a rendu son pré-remplissage :

```json
{"ok": true, "away_days": [{"day":"mon","kind":"eating_out","slots":["lunch"]}, … ×5]}
```

Une fixture posée à la main aurait prouvé que mon SQL sait écrire du JSON, pas que
le produit sait le produire.

### 3.2 Le geste, et sa mesure

| # | Geste | Écriture partie ? | Jetons en base après |
|---|---|---|---|
| 1 | grille ouverte, **Enregistrer sans rien toucher** | `POST keel_household_set_member_away` → **200 `{"ok":true}`** | **5 × `eating_out`** |
| 2 | **rechargement complet**, puis même geste | `POST …set_member_away` → **200** | **5 × `eating_out`** |

La seconde passe compte autant que la première : elle part d'un **rechargement**,
donc la grille a **relu le jeton depuis l'API** et l'a **rendu** — c'est la boucle
lecture → écriture qui est fermée, pas seulement un état gardé en mémoire.

### 3.3 ⚠️ La contre-épreuve — sans elle, « rien n'a changé » ne prouve rien

Un bouton qui n'écrit pas produit exactement le même tableau qu'un bouton qui
écrit bien. Deux choses séparent les deux cas :

1. **La requête est partie** : `200 OK`, corps `{"ok": true}`, lue dans le journal réseau.
2. **La même grille renvoyée SANS jeton perd le jeton.** J'ai rejoué
   `keel_household_set_member_away` avec la charge d'avant P1 :

   ```
   avant P1 (sans "kind")  →  SANS JETON (= absent) | 5
   après   (le navigateur) →  eating_out            | 5
   ```

   La base enregistre donc fidèlement ce qu'on lui donne. Que les jetons aient
   survécu prouve que **le front les a envoyés**.

État restauré après la contre-épreuve (5 × `eating_out`).

---

## 4. ③ Le pré-remplissage — « pré-remplir n'est pas décider »

La règle est tenue en trois endroits, et les trois sont mesurés.

**a) Aucune écriture au montage.** Le seul `useEffect` du composant **lit**.
Prouvé au navigateur : après un chargement complet de l'étape 3 avec la réponse de
Mira déjà en base, le journal réseau ne contient que le **lecteur**
(`keel_household_work_lunch`, ×2 — le double montage de React en dev) et **zéro**
appel à l'**écrivain** (`…set_member_work_lunch`).

C'est le cœur du danger : la porte SQL ré-applique son pré-remplissage à **chaque**
écriture, **même identique**. Une écriture identique n'est donc pas un no-op — elle
**ressuscite** le midi qu'on venait de décocher à la main.

**b) La garde de non-écriture.** `workLunchWriteIsNeeded(saved, next)` compare à ce
qui est **enregistré**, jamais au brouillon.

**c) La relecture après écriture.** `commitWorkLunch` fait `save → reread → onSaved`,
dans cet ordre. Sans la relecture, `saved` reste périmé et la garde ci-dessus devient
fausse. `onSaved` relit aussi la **page** : la porte écrit `away_days` en même temps
que `work_lunch`, et l'étape 4 monterait sinon sa grille sur les absences d'avant.

Et l'écran le **dit** : « 5 midis de semaine seront déjà cochés « dehors » à l'étape
suivante » puis « Rien n'est décidé ici. C'est la grille jour par jour de l'étape
suivante qui gagne, repas par repas. »

---

## 5. ⚠️ Le défaut que j'ai trouvé en mutant — et qui était réel

**M5 a survécu.** Remplacer `null` par `new Map()` dans le `catch` de la lecture —
sous un pavé qui l'interdisait en majuscules — passait **les neuf tests sans en
faire tomber un**.

Cause : `renderToStaticMarkup` ne joue aucun effet, donc ce `catch` n'était
atteignable par **aucun** test du dépôt. **Le commentaire était la seule garde.**

Ce que ça coûte quand ça casse : `null` = « la lecture n'a pas eu lieu » (aucune
question posée) ; `Map` vide = « lu, personne n'a répondu » (sept questions
vierges). Un réseau qui tombe sur un foyer **qui a répondu** aurait affiché des
questions vierges — et le premier clic aurait écrit par-dessus la réponse de
quelqu'un **en croyant la créer**, ce qui ré-applique les cinq midis.

`readWorkLunchAnswers` a donc été **sorti** du composant, comme `commitWorkLunch`
avant lui et pour la même raison. Quatre mutations neuves, quatre rouges.

### Le tableau complet des mutations

| # | Mutation | Rouges |
|---|---|---|
| M1 | l'ordre inversé (déjeuner avant équipement) | 1 |
| M2 | pas de relecture après écriture | 1 |
| M3 | on relit même sur un refus | 1 |
| M4 | `answers` démarre à `Map` vide au lieu de `null` | 1 |
| M5 | la lecture ratée retombe sur une `Map` vide | **0 → corrigé → 2** |
| M6 | le motif de l'erreur est avalé | 2 |
| M7 | la fonction rend `null` à tout le monde (garde cassée) | 2 |
| M8 | une `Map` vide **lue** est prise pour un échec | 1 |

M7 et M8 existent parce qu'**une garde a besoin d'un cas qui passe** : cassée, elle
bloquerait tout et ressemblerait à une garde qui marche. Et « lu, personne n'a
répondu » est une réponse légitime, pas une panne.

---

## 6. ⚠️ `SetupPage` — comment j'ai commité sans emporter la lane voisine

Au moment du commit, `SetupPage.tsx` portait **479 lignes non commitées** d'une
autre lane. Deux pièges connus :

- `git commit -- <chemin>` commite le **fichier entier de l'arbre** — le `--`
  protège l'index, **pas l'arbre**. J'aurais emporté les 479 lignes.
- `git commit` sans pathspec commite **l'index partagé** — la faute de `d9ac75cb`,
  qui a emporté dix fichiers du voisin.

**La forme utilisée** — un **index privé**, qui n'a aucune des deux fenêtres de
course :

```bash
export GIT_INDEX_FILE=…/l6b.index
git read-tree HEAD                       # l'index part de HEAD, pas du partagé
git apply --cached mes-deux-hunks.patch  # on n'y met QUE les siens
git commit -F message.txt                # le hook tourne, l'index partagé est intact
```

Résultat vérifié : `077b96dc` = **1 fichier, 47 insertions**. L'arbre de travail
garde les 479 lignes du voisin, intactes.

> ### ⚠️ LE PIÈGE QUI RESTE, ET QUI N'EST PAS DANS LES RÈGLES
>
> **Après ce commit, l'index partagé était devenu un piège.** Il portait encore le
> blob de `SetupPage.tsx` d'**avant** mon commit ; `HEAD` avait bougé, lui. Un
> `git commit` sans pathspec lancé par une lane voisine aurait donc **annulé mon
> hunk sans que personne ne le voie**.
>
> Réparé par `git reset -- frontend/src/keel/pages/SetupPage.tsx` : ça remet
> l'entrée d'index à `HEAD` **sans toucher l'arbre**, ça ne déplace pas la branche,
> et c'est limité à un chemin. Vérifié après : `git diff --cached` vide, arbre
> inchangé.
>
> **À retenir pour quiconque refait un index privé : rafraîchir l'entrée d'index
> partagée juste après le commit fait partie du geste.**

Le patch de mes deux hunks est aussi déposé en clair :
`scratchpad/2026-08-18-1710-L6b-montage-SetupPage.patch`.

Le montage est un **bloc `{step.id === "table" ? … : null}` à part**, posé juste
avant celui de `TableStep`, et non un fragment autour de lui : envelopper aurait
demandé de ré-indenter quarante lignes appartenant à d'autres, pour un rendu
identique.

---

## 7. Ce qui reste rouge — rien de ce lot

`npx vitest --config vitest.config.ts run` (env QA neutralisé) :
**1425 verts, 4 rouges, 2 fichiers** — exactement les rouges étrangers annoncés :

- `src/edge/coverage-guard.int.test.ts` ×2 ;
- `src/keel/api/household.int.test.ts` ×2 — la lane « déjeuner dehors » a ajouté
  `kind` sur les entrées, ses attentes disent encore `{day, slots}` seul.

`tsc -b --force` : **exit 0**. `eslint` sur mes fichiers : **exit 0**.
`agent-gate` est passé en entier sur les trois commits (3 376 tests Deno, 0 rouge).

⚠️ Rappel qui a coûté deux rouges silencieux aujourd'hui : **`agent-gate` ne lance
pas vitest**. Il a été lancé à la main avant chaque commit.

---

## 8. Ce qui reste sur le disque, et ce que je n'ai pas fait

- **Rien de mon code** n'est resté sur le disque : les trois commits portent tout.
- **La couche i18n n'est toujours pas commitée.** `frontend/src/keel/i18n/fr.ts`
  est **non suivi**, et mon test l'importe — comme le fait déjà
  `kitchenEquipmentCard.int.test.ts`, commité ce matin. **Sur un clone neuf, ces
  tests ne collectent pas.** Ce n'est pas un défaut que j'ai introduit et je ne
  l'ai pas réparé (cicatrice `i18n-layer-is-uncommitted-foreign-work`), mais il
  s'aggrave à chaque lot qui s'appuie dessus. **À trancher par un humain.**
- **La fixture QA a été semée** pour franchir l'étape 2 (corps, âge, activité,
  direction des trois bouches du foyer `58abb20a…`). Écritures **locales**, limitées
  à ce foyer de test. Elle est maintenant **complète**, donc réutilisable telle
  quelle pour le prochain lot qui veut voir l'étape 3.
- **`KitchenEquipmentCard` n'est pas montée en `embedded`.** Le contrat du §6.2 le
  proposait ; les deux cartes sont des sœurs de `TableStep`, chacune avec son propre
  cadre, et à l'écran c'est cohérent. Choix assumé, pas un oubli.

### Ce que j'ai vu et n'ai pas pris

- **Le titulaire n'a pas de grille de présence à l'étape 4.** `RequestStep` ne liste
  que `facts.mouths`, dont `readFunnelFacts` a retiré le titulaire. Or la question du
  déjeuner **lui est bien posée** à l'étape 3, et sa réponse **pré-remplit ses
  `away_days`**. Il peut donc déclarer « je déjeune dehors » et **ne trouver nulle
  part, dans l'entonnoir, de quoi contredire un de ces cinq midis** — alors que la
  règle du produit est « la grille gagne ». Corrigeable sur `/app/household`, pas
  dans le tunnel. **Signalé, non fait** : `RequestStep` et `PlanGrid` ne sont pas de
  ce lot.
- **Le compteur affiche « 4 repas » pour un pré-remplissage de 5.** La fenêtre de
  sept jours ne recouvre pas les cinq midis de semaine. Affichage, pas donnée.
