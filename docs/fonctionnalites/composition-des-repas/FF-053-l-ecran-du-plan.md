# FF-053 · L'écran du plan — trois niveaux, une seule lecture

| | |
|---|---|
| **Identifiant** | `FF-053-l-ecran-du-plan` |
| **Statut** | 🟠 En cours |
| **Date** | 2026-08-11 |
| **Autorité produit** | [MODEL.md](../../keel/MODEL.md) · [CONTRACT.md](../../keel/CONTRACT.md) · [PLAN-ECRAN-DU-PLAN-ET-BROUILLON](../../../scratchpad/PLAN-ECRAN-DU-PLAN-ET-BROUILLON.md) |
| **Dépend de** | [FF-002](FF-002-dire-son-absence.md) · [FF-051](FF-051-les-apports-fixes.md) · [FF-052](FF-052-les-proprietes-de-jour.md) — **ce sont eux qu'elle rend visibles** |
| **Voisine de** | [FF-054](FF-054-le-brouillon-et-le-feedback.md) — même rendu, monté dans la pop-up |
| **Effort estimé** | 5 étapes, front + 2 champs renvoyés par la fonction |

---

## 1. Le problème

Une semaine à trois repas fait **vingt-et-une cartes d'affilée**. On ne peut ni
répondre à « qu'est-ce que je mange jeudi ? » sans faire défiler, ni voir la
semaine d'un coup pour se dire « il y a trop de poulet ».

Les jours sont déjà regroupés (`groupByDay`, avec un `<h3>` par jour, dans
l'ordre du plan) — ils sont juste **tous dépliés en même temps**.

### Le vrai problème est ailleurs : quatre silences se ressemblent

Une case vide dans la semaine d'un élève a aujourd'hui **quatre causes**, et
l'écran n'en distingue aucune :

| Ce qui s'est passé | Ce que l'élève voit | D'où ça vient |
|---|---|---|
| il déjeune à la cantine | rien | `away_days` — [FF-002](FF-002-dire-son-absence.md) |
| son shaker remplace le petit-déjeuner | rien | `fixed_intakes` — [FF-051](FF-051-les-apports-fixes.md) |
| c'est son jour de restes | rien | `day_properties` — [FF-052](FF-052-les-proprietes-de-jour.md) |
| **le modèle n'a rien composé** | rien | l'anomalie |

Trois de ces silences sont **exactement ce que l'élève a demandé**. Le quatrième
est un défaut. Les rendre identiques, c'est rendre le défaut invisible et les
trois autres inquiétants.

### Et le lot ne se voit pas

Depuis [FF-052](FF-052-les-proprietes-de-jour.md), une session du dimanche
nourrit lundi, mardi, mercredi. Le rendu place bien le plat sur chacun de ces
jours — mais rien ne dit que c'est **une seule casserole**. Replier les jours
sans le dire achèverait de le cacher.

---

## 2. Job stories

- **Quand** j'ouvre mon plan un jeudi matin, **je veux** voir jeudi et rien
  d'autre, **afin de** ne pas faire défiler six jours pour trouver mon déjeuner.
- **Quand** je viens de faire composer ma semaine, **je veux** la voir en entier
  d'un coup d'œil, **afin de** savoir si elle me convient avant d'en lire le
  détail.
- **Quand** trois jours de suite portent le même plat, **je veux** savoir si
  c'est une seule cuisson ou trois repas identiques, **afin de** ne pas croire
  qu'on me sert la même chose trois fois.
- **Quand** un moment de ma semaine est vide, **je veux** savoir **pourquoi**,
  **afin de** distinguer ce que j'ai demandé de ce qui a raté.

---

## 3. Périmètre

### Livré

1. **`PlanResult`** — le rendu d'un plan extrait de `MealBuilder`, montable à
   deux endroits.
2. **`PlanGrid`** — la vue globale : un nom de plat par cellule, jours ×
   créneaux.
3. ~~**`KitchenBlock`** — ce qui se cuisine, quel jour, pour combien de jours.~~
   **Retiré le 2026-08-14.** Il disait la même chose que « tes sessions de
   cuisine », en moins bien : même liste de préparations, mêmes jours de
   cuisson, sans le temps de session, les portions faites ni le travail actif.
   La seule ligne qu'il portait **seul** — les jours qu'une casserole nourrit —
   a été portée dans `CookingSessions` **avant** le retrait ; elle y était
   jusque-là impossible, la fenêtre ne recevant aucun plat.
4. **Les sections repliables** + la barre de jours collante.
5. **Le marquage des lots**, dans la grille et sur la carte.
6. **Deux champs de plus dans la réponse** de `generate-meal-v1` :
   `fixed_intakes` et `day_properties`, tels que la fonction les a **lus**.

### Hors périmètre, exprès

**Aucune case, aucun statut, aucune série.** Cet écran gagne trois niveaux de
lecture et **zéro** contrôle. La seule case du produit reste celle des plats
d'aujourd'hui, et la règle vit dans `lib/useMealTicks.ts`.

**La doctrine ne s'affiche toujours pas.** C'est la règle de cet écran, écrite
en tête de `MealBuilder` : les convictions du coach **entrent** dans la
composition et n'en **ressortent** pas. Trois niveaux d'affichage sont trois
occasions de l'oublier.

**Le brouillon** est [FF-054](FF-054-le-brouillon-et-le-feedback.md). La grille
y sera montée, mais elle vaut d'abord sur le plan adopté.

---

## 4. Le circuit

```
                    ┌─────────────────────────────────┐
                    │  LA GRILLE — la semaine en un    │  ← « il y a trop de
                    │  coup d'œil, un titre par case   │     poulet »
                    └─────────────────────────────────┘
                    ┌─────────────────────────────────┐
                    │  LE BLOC CUISINE — ce qui se     │  ← « dimanche je
                    │  cuisine, et pour quels jours    │     cuisine une fois »
                    └─────────────────────────────────┘
                    ┌─────────────────────────────────┐
                    │  LES JOURS — repliés, sauf       │  ← « jeudi midi, quoi
                    │  aujourd'hui. La recette.        │     et comment »
                    └─────────────────────────────────┘
```

Trois questions différentes, trois niveaux. **Aucun des trois ne peut répondre à
la question des deux autres**, et c'est pour ça qu'ils coexistent plutôt que de
se remplacer.

---

## 5. Modèle de données

**Aucune migration.** Tout ce que la grille dessine est déjà calculé.

Deux champs s'ajoutent à la **réponse** de `generate-meal-v1` — pas à une table :

```jsonc
"fixed_intakes":  [ { "food_ref": "…", "label": "mon shaker",
                      "slot": "breakfast", "replaces_meal": true,
                      "days": ["mon","tue"] } ],
"day_properties": [ { "day": "sun", "properties": ["batch_cook"] } ]
```

### A1 — pourquoi la FONCTION les renvoie, plutôt que le front les relise

Le front pourrait lire `student_goals.practical_constraints` lui-même. Il ne
doit pas, pour une raison qui n'est pas de la commodité : **la fonction est la
seule à savoir ce qu'elle a réellement lu.** Elle écarte les entrées malformées
et les jetons inconnus (FF-051 R4, FF-052 R2), et elle les compte.

Un front qui relit le jsonb brut dessinerait des marqueurs pour des déclarations
que le moteur a ignorées — un écran qui affiche une contrainte que la
composition n'a pas respectée est pire qu'un écran qui n'affiche rien.

---

## 6. Règles et garanties

### R1 — Les colonnes suivent l'ordre du PLAN, jamais celui du calendrier

`stretchDayOrder`, comme `groupByDay` le fait déjà. Une composition faite un
mercredi remplit `wed…sun` puis `mon, tue` — qui sont la semaine **suivante**.
Parcourus dans l'ordre du calendrier, ces deux-là arriveraient **en tête** de la
grille, et l'élève ouvrirait son écran sur deux jours qui ont l'air ratés.

### R2 — Les lignes viennent du RYTHME déclaré, pas d'une liste de six

Trois repas font trois lignes ; la collation de 17 h en fait quatre. Une grille à
six lignes fixes demanderait à chacun de lire des lignes vides pour les moments
qu'il ne prend jamais — c'est-à-dire de relire ici ce qu'il a déjà dit dans
« How your day runs ». Même source que `MealPickerGrid`, qui a déjà tranché.

### R3 — Les cinq états d'une cellule sont CINQ, et ils se distinguent

| État | Ce que la cellule dit | Condition |
|---|---|---|
| composé | le titre du plat | un plat sur ce jour/créneau |
| absent | « pas ici » | `away_days` couvre le créneau |
| déjà mangé | le libellé de l'apport | un apport fixe **remplaçant** occupe le créneau |
| restes | « restes » | le jour porte `leftovers` |
| **vide** | **vide, et ça se voit** | aucune des quatre |

Le cinquième est le seul qui soit un défaut. Il ne doit ressembler à aucun des
quatre autres — sinon la seule anomalie que cet écran pouvait révéler devient
invisible.

### R4 — Un lot se DIT, dans la grille comme sur la carte

`uses` non vide veut dire « ça vient d'une préparation ». Trois cellules
identiques sont soit une casserole intelligente, soit un modèle paresseux, et à
l'œil nu ça se ressemble.

Sans ce marquage, la grille ferait juger comme un défaut le comportement même que
[FF-052](FF-052-les-proprietes-de-jour.md) cherche à produire — et le premier
réflexe serait de le corriger.

### R5 — Un jour replié porte ses MARQUEURS, sinon il ment

*Aujourd'hui* et *passé* existent déjà. S'y ajoutent *absent*, *jour de lot* et
*jour de restes*. Un jour `leftovers` replié qui ne dit pas qu'il est un jour de
restes **ressemble à un jour vide**, et l'élève l'ouvre pour rien — ou pire, il
croit que sa semaine est trouée.

Les marqueurs ne décorent pas : ils sont ce qui permet de décider s'il faut
ouvrir.

### R6 — La grille est le sommaire ; une section repliée ne se résume pas

**Arbitrage A5.** Une section qui liste ses plats en repli refait la grille, en
moins lisible et deux fois. Le sommaire existe déjà, en haut. À revoir si l'usage
dit le contraire — et c'est mesurable (§10).

### R7 — Rien ne se coche, rien ne se compte

Trois niveaux de lecture, zéro contrôle. Pas de progression, pas de série, pas de
« terminé » : personne n'a rien prescrit. La seule case du produit reste celle
d'aujourd'hui, et elle ne bouge pas d'ici.

### R8 — La grille défile dans son conteneur, jamais la page

Sept colonnes ne tiennent pas à 320 px. `overflow-x-auto` sur le conteneur,
colonne de créneaux collante, `min-w` sur la table — le patron que
`MealPickerGrid` a déjà validé. Le `body` ne part **jamais** de travers.

---

## 7. Modes de défaillance

| Défaillance | Ce qui se passe | Protection |
|---|---|---|
| Colonnes en ordre calendaire | la semaine s'ouvre sur deux jours « ratés » | R1 |
| Six lignes fixes | des lignes vides à lire chaque semaine | R2 |
| Les quatre silences se ressemblent | l'anomalie devient invisible | R3 |
| Lot non marqué | une bonne composition jugée paresseuse | R4 |
| Jour de restes replié et muet | l'élève croit sa semaine trouée | R5 |
| Le front relit le jsonb brut | un marqueur pour une contrainte ignorée | A1 |
| Rendu dupliqué plan / brouillon | les deux divergent | `PlanResult`, monté deux fois |
| Grille qui déborde | tout l'écran part de travers | R8, testé à 320 px |

---

## 8. Critères d'acceptation

- [ ] `PlanResult` extrait ; l'écran est **identique** avant/après l'extraction
- [ ] Colonnes dans l'ordre du plan, vérifié sur une compo qui démarre un mercredi
- [ ] Lignes dérivées du rythme : 3 repas ⇒ 3 lignes, +collation ⇒ 4
- [ ] Les **cinq** états de cellule, chacun distinct des quatre autres
- [ ] Un plat issu d'une préparation est marqué, en grille **et** sur la carte
- [ ] Bloc cuisine absent — pas de titre orphelin — quand il n'y a aucune préparation
- [ ] Jour courant ouvert, les autres repliés ; marqueurs présents sur les replis
- [ ] **À 320 px** : aucun scroll horizontal du `body`
- [ ] Aucune case, aucun statut, aucune série ajoutés
- [ ] Aucune croyance, aucun interdit de coach affiché nulle part
- [ ] `tsc -p frontend/tsconfig.app.json --noEmit`, vitest, Playwright, eslint

---

## 9. Rabbit holes

**Faire de la grille un éditeur.** Glisser un plat d'un jour à l'autre, cliquer
pour remplacer. C'est [FF-054](FF-054-le-brouillon-et-le-feedback.md) et le
ciblage chirurgical ; ici la grille **lit**. Un écran qui lit et qui écrit dans
le même geste demande un état d'édition, un enregistrement, une annulation —
trois choses que ce lot n'a pas.

**Afficher les grammes dans la cellule.** Le référentiel les connaît. Une
cellule est un titre, point : la quantité vit dans la recette, et une grille
pleine de chiffres redevient un tableau de comptage.

**Une septième ligne « autre ».** Pour les plats sans créneau. Ils existent, ils
sont rares, et une ligne permanente pour un cas rare est une ligne vide toutes
les semaines. Ils vont dans leur jour, sous la grille.

**Réécrire `MealPickerGrid`.** Elle n'est pas commitée et appartient à une autre
lane. On extrait le squelette **après coordination** (A6), ou on duplique
sciemment en l'écrivant.

---

## 10. Ce qu'on mesure

- **Ouvertures de section par visite.** Si l'élève ouvre les sept jours à chaque
  fois, le repli lui coûte plus qu'il ne lui rapporte, et R6 a tort.
- **Cellules du cinquième état** (vraiment vides) : c'est un taux de défaut de
  composition, et il n'avait aucun endroit où se voir avant cet écran.
- **Part des plats marqués « lot ».** Si elle est nulle, `batch_cook` ne mord
  pas ; si elle est très haute, la semaine est peut-être trop répétitive — et la
  grille est justement l'endroit où ça se remarque.
- **Scroll dans la grille** vs sections ouvertes : lequel des deux niveaux sert
  vraiment.

---

## 11. Questions ouvertes

1. **Le squelette de table partagé** (A6). Extraire `SlotDayTable` demande de
   toucher `MealPickerGrid`, qui appartient à une autre lane. Coordination
   d'abord ; duplication assumée sinon.
2. **La grille sur une fenêtre d'un jour.** Une colonne unique n'est plus une
   grille. Faut-il la masquer sous deux jours ? Penche pour oui, non tranché.
3. **Le foyer.** `generate-household-meal-v1` renvoie `member_portions` : la
   grille devrait-elle porter une ligne par membre, ou rester la table commune ?
   Hors périmètre ici, mais la géométrie s'y prêterait.
