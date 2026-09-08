# Ce qu'un retour peut changer — les champs, les canaux, le process

**2026-09-07.** Établi en lisant le code et le schéma, pas de mémoire. Voisin de
[`METHODE-GENERATION-DE-PLAN-SOLO.md`](METHODE-GENERATION-DE-PLAN-SOLO.md), qui
dit comment un plan se calcule ; celui-ci dit comment un plan se **corrige**.

---

## 1. Les deux surfaces, un seul classifieur

| | ce qui est collecté | chemin | producteur |
|---|---|---|---|
| **Retour sur un plan** | une phrase libre (`body.draft_note`) | `classifyDraftNoteEarly` | `draft_note` |
| **Bilan de fin** — questions fermées | `cooked`, `portions` (+ son sujet), `neverAgain`, `makeAgain`, `difficulty`, `speed`, `variety`, l'axe du jour | `retainedItemsFromPlanFeedback` — **aucun modèle** | `questionnaire` |
| **Bilan de fin** — la case libre | `anythingElse` | `classifyAndPersistDraftNote` | `draft_note` |

Donc : **oui**, la classification est la même pour les deux surfaces, et **oui**,
dans le bilan une seule case en a besoin. Une réponse cochée est déjà un jeton :
elle n'a rien à classer.

### La matrice des droits (`canProduce`, `retained_item.ts`)

| producteur | `food.*` / `method.*` | `portion.adjust` | `rhythm.set` | `logistics.set` | `craving` |
|---|---|---|---|---|---|
| `written` (écran des préférences) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `questionnaire` (cases fermées) | ✅ | ✅ | ❌ | ❌ | ❌ |
| `draft_note` (les deux cases libres) | ✅ | ❌ | ❌ | ❌ | ✅ |
| `conversation` | ❌ (producteur retiré) | ❌ | ❌ | ❌ | ❌ |

La règle derrière : **une mesure vient d'une case cochée, un goût vient d'une
phrase, un réglage se change sur son écran.**

---

## 2. Ce qu'un retour peut changer — et RIEN D'AUTRE

⛔ Ce qui suit n'est pas la liste des champs du produit : c'est la liste des
champs qu'un **retour** ou un **bilan** peut déplacer. Tout le reste — âge,
sexe, taille, poids, objectif, rythme, régime, absences — ne se change que sur
un écran, et aucun retour n'y touche.

### 2.1 Le bilan, chemin DÉTERMINISTE (questions fermées, aucun modèle)

Sept questions. Trois sont des **portes**, quatre **déplacent** quelque chose.

| question | vocabulaire | ce qu'elle déplace | échelle |
|---|---|---|---|
| `cooked` | `yes` / `partly` / `no` | **rien** — c'est une PORTE : `no` ferme `difficulty` et `speed` (on ne demande pas si c'était long à qui n'a pas cuisiné) | — |
| `portions` + `portionsSubject` | `too_much` / `right` / `not_enough` — sujet `household` ou `member:<uuid>` | `portion.adjust` **pour cette bouche** | `down`/`up` × `slight` (5 %) / `clear` (10 %) |
| `neverAgain[]` | des aliments, avec leur sujet | `food.exclude` par bouche | — |
| `makeAgain[]` | idem | `food.prefer` par bouche | — |
| `difficulty` | `too_hard` / `fine` / `could_do_more` | **`cooking_style`** d'UN cran — ou `recipe_difficulty` si aucun style n'est déclaré | `minimal → balanced → keen` |
| `speed` | `too_long` / `fine` / `had_more_time` | **`cooking_style`** d'UN cran — ou `cooking_time_min` sinon | `30 → 45 → 60 → 90 → 120 → 180` min |
| `variety` | `yes` / `sometimes` / `no` | **`variety`** d'UN cran | `repeat → some → varied` |

Quatre garde-fous, tous comptés :

- **un cran à la fois**, jamais un saut (`applyStep`) ;
- `difficulty` et `speed` qui poussent le style en sens contraires ⇒ **rien ne
  bouge** (`bothPolarities`) ;
- valeur courante hors échelle ⇒ rien (`noBaseline`) ;
- déjà au bout ⇒ rien (`atFloor` / `atCeiling`).

### 2.2 Le bilan, chemin IA — sa seule case libre (`anythingElse`)

Même classifieur et mêmes droits que le retour sur un plan. Voir §2.3.

### 2.3 Le retour sur un plan — chemin IA (`draft_note`)

| ce que le classifieur peut écrire | destination | portée |
|---|---|---|
| `food.exclude` | préférences de **cette bouche** | durable |
| `food.prefer` | idem | durable |
| `method.avoid` (frit, cru, épicé…) | idem | durable |
| `method.prefer` | idem | durable |
| `craving` | l'encart d'envie | **`next_plan`** |
| `notes` | le mémo de cette bouche | durable |
| `safety` | `student_safety_constraints` | durable |

**Et rien d'autre.** `canProduce("draft_note", …)` refuse explicitement :

| refusé au retour | pourquoi | qui a le droit |
|---|---|---|
| `portion.adjust` | « un degré vient d'une case cochée, jamais d'une phrase » | le bilan, l'écran |
| `rhythm.set` | c'est un CHAMP, il se change sur sa fiche | l'écran |
| `logistics.set` | idem (jours, temps, difficulté, variété, budget) | l'écran |

Quand la phrase tombe dans ces trois-là, le classifieur répond
`skipped: degree` ou `skipped: setting` — **et ne dit rien à la personne.**

### 2.4 Les index, vus de haut

Quatre échelles sont déplaçables, toutes d'un cran, toutes par le **bilan
seulement** :

```
cooking_style      minimal ──── balanced ──── keen
cooking_time_min   30 ─ 45 ─ 60 ─ 90 ─ 120 ─ 180
variety            repeat ──── some ──── varied
portion.adjust     clear↓ ─ slight↓ ─ (rien) ─ slight↑ ─ clear↑     (−10 / −5 / 0 / +5 / +10 %)
```

⚠️ `cooking_style` est un **raccourci** : il dérive `recipe_difficulty`,
`variety` et le plafond de sessions. Quand il est déclaré, c'est LUI qui bouge,
et les trois suivent. Sinon les deux champs bougent séparément.

### 2.5 Ce qu'AUCUN retour ne peut changer aujourd'hui

Écrit ici pour qu'on n'aille pas le chercher : `eating_rhythm` (les moments
**et** leur taille), `cook_days`, `budget_amount`, `grocery_runs`, le régime, le
corps, l'objectif, le rythme du curseur, les absences, le déjeuner au travail,
les apports fixes, les traditions, la bouche de référence.

Les trois premiers sont pourtant dans `WRITABLE_FIELDS` — ils sont donc
*écrivables avec une trace*, simplement aucun producteur de retour ne les
écrit. C'est une porte fermée, pas une porte absente.

## 3. Le trou, nommé — et ce n'est PAS `size`

**Sept familles sur huit atteignent le modèle. La taille, non.**

L'axe « combien » a **trois entrées** et **zéro sortie utile** :

1. `appetite` sur la fiche (±10 % sur la journée) → enveloppe kcal ;
2. `portion.adjust` du bilan (±5 / ±10 %) → enveloppe kcal ;
3. `eating_rhythm[].size` → le seul qui parle au modèle… et il ne faut **pas**
   le rebrancher : c'est `small | medium | large`, rendu « *(large for them)* ».
   Un mot de taille absolue dans une phrase lue à table est précisément ce que
   le lot du 2026-09-04 a retiré (« une seule autorité sur la taille »).

Or depuis le 2026-09-06 l'enveloppe kcal ne redimensionne plus rien : elle
mesure (`unmet`, `would_resize`). Donc **aucune des trois n'a le moindre effet
sur une assiette**. C'est la cause directe du run `50be73f3` : « ma mère ne
mange pas autant » n'avait aucun paramètre où atterrir, la phrase est partie
brute au composeur, et le modèle a sorti les grammes des boîtes pour les mettre
dans les phrases — 12 bacs communs pour 36 boîtes attendues.

### Ce qui manque vraiment : deux axes, pas un

La méthode solo les distingue déjà, et c'est la bonne distinction :

> L'**appétit** fait varier le **total de la journée**. « **Repas léger** » fait
> varier la **répartition dans la journée**. Les deux se cumulent.

| | ce que ça bouge | existe ? |
|---|---|---|
| **amplitude** (`portion.adjust`, `appetite`) | la cible du **jour** | le champ oui, l'effet non |
| **« + repas léger »**, un drapeau par créneau | le **poids** de ce créneau ; les autres reprennent la différence, la somme reste 1 | **n'existe pas** — spécifié dans [`METHODE-GENERATION-DE-PLAN-SOLO.md`](METHODE-GENERATION-DE-PLAN-SOLO.md) §« Ce que l'onboarding demande en plus » |

Le drapeau léger travaille à **trois endroits** (répartition, brief en mots
« dîner léger », vérification), et il a ses planchers de densité écrits. C'est
lui qu'il faut construire, pas `size`.

### La règle de tri, décidée le 2026-09-07

> « **le soir** je ne mange pas autant » → **drapeau léger sur ce créneau**
> « ma mère ne mange pas autant » (sans créneau) → **amplitude**

Le classifieur doit donc rendre **trois** choses, pas une : *qui*, *quel
créneau (ou aucun)*, *quel sens*.

---

## 4. Les deux régimes, et les trois natures de demande

**Le bilan enregistre.** L'effet est différé : il s'applique au plan *suivant*.
Aucune contrainte de cohérence immédiate — le prochain calcul repart de zéro
avec le nouveau paramètre.

**Un retour sur un plan doit changer ce plan-ci.** Et là il y a une couche de
compromis en plus : ce que la personne **ne demande pas** doit rester. Le plan
qu'elle regarde, elle l'a déjà en partie accepté.

**Trois** natures de demande, et elles n'appellent pas le même traitement.

### A · Une demande de PARAMÈTRE DURABLE
« Ma mère mange moins », « plus de poisson ».

Elle se réduit à un champ de la §2. Une fois le champ changé, **on recompose** :
c'est la génération qu'on a déjà, avec une entrée différente. Pas de chirurgie,
pas de second prompt.

⚠️ Le prix est réel : la personne perd le plan qu'elle regardait. Acceptable
quand elle vient justement de dire que quelque chose de global ne va pas.

### B · Une demande LOCALE
« Change le plat de mardi soir », « pas de poisson jeudi mais garde le reste ».

Elle nomme un **endroit du plan**, pas un paramètre. Recomposer changerait ce
qu'elle n'a pas demandé. C'est là qu'il faut de la chirurgie.

---

### C · Une demande qui se traduit en RÉGLAGES DE CE PLAN
« On ne cuisine que le dimanche. »

⛔ **Ne pas la refuser en pointant l'écran.** Elle nomme une contrainte réelle,
et elle a une traduction non ambiguë en paramètres de **requête** :

- `one_cooking_session = true` — le prompt bascule alors sur « *everything for
  this stretch is cooked in that single session, so that session is allowed to
  run long* », et `cookDays` est forcé au jour unique ;
- la fenêtre démarre **lundi**, pas dimanche soir — sinon la session de cuisine
  est le premier jour du plan et il n'y a rien à manger avant elle.

**Le partage est net, et il est vérifié :**

| porté par la REQUÊTE (ce plan-ci) | relu du MAGASIN (durable) |
|---|---|
| `window` (départ + durée), `one_cooking_session`, `context`, `preferences`, `draft_note`, `intent` | `cook_days`, `cooking_time_min`, `recipe_difficulty`, `variety`, `budget_amount`, `eating_rhythm`, `away_days` |

Donc « que le dimanche » n'a **aucun canal par-plan** — sauf exactement ces
deux-là. C'est ce qui rend la traduction obligatoire : sans elle, il ne reste
que le refus muet ou l'écriture durable d'un réglage que personne n'a demandé
de changer pour toujours.

⚠️ **La question durable reste ouverte à côté**, et elle se pose : « je note que
tu ne cuisines que le dimanche ? » ⇒ `cook_days`. C'est un des cas où la pop-up
a du sens.

## 5. L'architecture recommandée

### 5.1 Pour A et C — un seul appel

1. Classifier (attendu, pas en parallèle) → un **effet typé**.
2. L'effet part aux **deux destinations** : la mémoire (durable) et les
   paramètres de ce run.
3. On recompose avec le paramètre — durable pour **A**, de requête pour **C**.
   **Le composeur ne lit jamais la phrase.**

### 5.2 Pour B — deux appels, et la machinerie existe déjà

1. **Appel 1 — cerner et localiser.** Le classifieur rend : la nature, les
   **cellules** visées (`jeudi/dîner`), les bouches concernées, et les données à
   injecter. C'est ici — et seulement ici — que la clarification a un sens.
2. **Appel 2 — un correctif à portée fermée.** On ne redemande pas un plan : on
   redemande **ces cellules-là**, avec leurs contraintes (la part de la journée
   de chaque bouche, la casserole tirée, le lot, la ceinture de sécurité, le
   budget).
3. **La fusion par cellules existe et est testée** : `mergeRetryByCell` /
   `mergeRetryCells` (`retry_merge.ts`). Elle prend d'un plan de relance
   **uniquement les cellules nommées**, importe les casseroles citées, élague ce
   que plus personne ne tire, et recolle les courses. C'est très exactement un
   correctif local.

### 5.3 Ce qui a déjà été réglé le 2026-09-06, et qui change la donne

La crainte « il faut respecter l'attribution calorique » est **plus légère
qu'avant**, pour deux raisons :

- la casserole **est** la somme des boîtes, et les courses suivent la casserole.
  Un correctif local propage donc tout seul : baisser une boîte baisse le pot et
  la liste, **sans recalcul à inventer** ;
- le moteur ne redistribue plus. L'écart entre ce qui est servi et le besoin est
  une **mesure** (`unmet`, `would_resize`), pas une correction silencieuse. Un
  correctif local ne peut donc pas « casser » une attribution : il déplace des
  grammes, et l'écart se voit.

Ce qui reste à garantir est la **portée** : le correctif ne doit toucher que les
cellules nommées. `mergeRetryByCell` le fait par construction, et un compteur de
diff (cellules touchées vs cellules demandées) le prouve à chaque run.

---

## 6. La clarification — ce qu'elle est, et ce qu'elle doit devenir

### Aujourd'hui

Le canal `clarify` **existe et vit** : le classifieur rend
`{ about, gate, entry, options[] }`, c'est persisté dans `memory_clarifications`
(13 lignes, 6 répondues). Trois ambiguïtés couvertes : **qui**, **quel
aliment**, **toujours ou parfois**.

Deux limites :

- **la question part dans le chat** (`chat_message_id` sur toutes les lignes).
  Aucun écran ne rend une clarification en attente ;
- **une seule est posée**, la seconde est comptée `clarify_not_asked` et perdue.

### Recommandé

1. **Pop-up, jamais le chat, et synchrone.** Pour un retour sur un plan, la
   réponse **décide** de ce qu'on fait ; posée en asynchrone dans une
   conversation, elle arrive après que le plan a été composé — donc trop tard.
   Le même composant sert les deux surfaces.
2. **Une seule question, et c'est une règle, pas une limite technique.** Deux
   questions d'affilée sur un retour, c'est un interrogatoire. Corollaire dur :
   **si une seule question ne suffit pas à réduire la demande, on ne devine
   pas** — on ne change rien et on le dit. Un plan inchangé avec une phrase
   claire vaut mieux qu'un plan refait de travers.
3. **Un seul `about` à ajouter — `where`.** Les trois existants suffisent
   presque : `who` couvre déjà « ma mère », `what` l'aliment, `scope` le
   toujours/parfois. Ce qui manque est **quel jour, quel repas**, pour la
   famille B.

   ⛔ **Pas de `how_much`.** Une phrase donne la DIRECTION sans ambiguïté
   (« pas autant » ⇒ moins) ; c'est le SUJET qui manque, et `who` le couvre
   déjà. Voir la décision 1 : la magnitude ne se demande pas, elle vaut **un
   cran**, comme au bilan.

4. **Un motif visible quand rien n'est fait.** Aujourd'hui `skipped: degree`
   est compté et **silencieux** pour la personne. Un « ça se règle dans ses
   préférences, veux-tu y aller ? » vaut mieux qu'un plan recomposé de travers.

---

## 7. Les décisions — trois tranchées le 2026-09-07, deux ouvertes

### ✅ 1. Une phrase PEUT changer la part de quelqu'un — un cran

**Tranché contre ma première recommandation, et l'argument est bon :** une
remarque sur la taille d'une assiette donne la **direction** sans ambiguïté. Ce
qui manque, c'est **qui** — et `clarify` sait déjà le demander (`about: who`).

Donc : **ouvrir `portion.adjust` au `draft_note`**, avec

- la **direction** lue dans la phrase ;
- la **magnitude toujours à un cran** — le bilan n'en déplace jamais plus, et
  une phrase n'a pas à être plus précise qu'une case cochée ;
- `clarify` sur *qui*, et seulement quand le sujet est ambigu.

Ce que ça renverse de la doctrine, exactement : « un degré ne se file jamais
depuis une phrase » devient « **une phrase porte une direction, jamais une
amplitude** ». Le reste tient.

### ✅ 2. Le canal n'est pas `size`, c'est le drapeau « repas léger »

`eating_rhythm[].size` est `small | medium | large` : un mot de taille absolue
dans une phrase lue à table. **Ne pas le rebrancher.**

Construire à la place le **drapeau par créneau** déjà spécifié dans la méthode
solo — il travaille sur la répartition, le brief et la vérification, et il est
distinct de l'appétit par construction.

### ✅ 3. Une remarque de réglage se TRADUIT, elle ne se refuse pas

Voir la famille C (§4). Le refus muet n'est jamais la bonne réponse : soit la
remarque se traduit en paramètres de ce plan, soit elle n'en a pas et **on le
dit** — mais dans les deux cas la phrase ne part plus au composeur.

### ⏳ 4. L'amplitude : ±20 % en cinq crans ?

À décider **après** le rebranchement — calibrer un tuyau fermé ne se mesure pas.
Elle ne concerne que le cas **global** (la règle de tri du §3) : un « le soir je
ne mange pas autant » n'est pas une amplitude, c'est un drapeau.

### ⏳ 5. `variety` bouge pour TOUJOURS sur une remarque d'une semaine

Trouvé en vérifiant. `variety` est un champ de `practical_constraints`, écrit
avec une trace : « c'était répétitif **cette semaine** » déplace le réglage de
façon **permanente**.

Pour `recipe_difficulty` et `cooking_time_min` c'est cohérent — on apprend ce
que la personne supporte. Pour la variété c'est discutable : une semaine où l'on
a répété exprès (budget serré, peu de temps) n'est pas une préférence durable.

### 🐛 Et un défaut trouvé au passage, à corriger quoi qu'on décide

`cooking_style` **n'a pas de libellé** dans `FIELD_TITLE`. Or c'est lui qui bouge
en priorité dès qu'un style est déclaré — le cas majoritaire. Donc le
déplacement le plus fréquent du bilan **n'est jamais annoncé** à la personne.
Le code le sait et le compte (`field_not_announced`), en préférant le silence à
un bouton qui mènerait sur un écran où la ligne n'est pas.

## 8. Le process, en une image

```
        phrase (retour sur un plan, ou case libre du bilan)
                 │
        ┌────────▼─────────────┐
        │     CLASSIFIEUR      │  attendu, jamais en parallèle
        │  qui · quel créneau  │
        │  quel sens · où      │
        └───┬──────────────┬───┘
            │              │ ambigu ?
            │              └──► POP-UP, 1 question, synchrone
            │                     │
            │                     └── sans réponse ⇒ on ne change RIEN, et on le dit
            │
     ┌──────▼──────┐
     │    EFFET    │  typé, jamais la phrase brute
     └──┬───────┬──┘
        │       │
   mémoire   paramètres
   (durable)      │
                  ├── A · champ durable        ⇒ recomposer
                  ├── C · réglage de CE plan   ⇒ recomposer (fenêtre, session unique)
                  └── B · endroit du plan      ⇒ correctif à portée fermée
                                                  (mergeRetryByCell)
                                                  puis casserole = Σ boîtes,
                                                  courses = casserole
```

**La règle qui tient tout :** le composeur ne reçoit **jamais** la phrase de la
personne. Il reçoit des paramètres. C'est la phrase brute qui a produit le
défaut du 2026-09-07.
