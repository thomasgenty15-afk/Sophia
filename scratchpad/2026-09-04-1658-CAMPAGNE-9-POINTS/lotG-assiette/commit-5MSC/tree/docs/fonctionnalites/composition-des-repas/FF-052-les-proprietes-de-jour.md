# FF-052 · Les propriétés de jour — le pendant positif

| | |
|---|---|
| **Identifiant** | `FF-052-les-proprietes-de-jour` |
| **Statut** | 🟢 Livré (2026-08-11) — **deux** propriétés, pas quatre |
| **Date** | 2026-08-11 |
| **Autorité produit** | [MODEL.md](../../keel/MODEL.md) · [CONTRACT.md](../../keel/CONTRACT.md) |
| **Dépend de** | `meal_generation.ts` (préparations et `uses`, déjà là) |
| **Voisine de** | [FF-002](FF-002-dire-son-absence.md) — le négatif · [FF-005](FF-005-strategie-de-courses.md) — les vagues, **non touchées** |
| **Effort réel** | 1 module pur, 2 branches, 0 migration, **1 bump de version de prompt** |

---

## 1. Le problème

Aujourd'hui un jour ne peut être que **absent** (`away_days`, FF-002) ou **sans
cuisine** (`no_cook_days`). Il ne peut jamais **porter une opportunité**.

Or une semaine réelle en porte : le dimanche où l'on cuisine pour trois jours,
le lundi où l'on finit ce qu'on a fait. Le produit ne sait pas les entendre, et
compose donc sept jours identiques à partir d'une semaine qui ne l'est pas —
puis s'étonne que le plan ne tienne pas.

---

## 2. Job stories

- **Quand** je cuisine en gros le dimanche, **je veux** que mon plan mette la
  session longue ce jour-là, **afin de** ne pas avoir à réorganiser sa semaine
  avant de pouvoir m'en servir.
- **Quand** le lundi je finis ce que j'ai fait la veille, **je veux** que mon
  plan ne me compose pas un dîner neuf, **afin de** ne pas jeter la moitié de
  mon batch.
- **Quand** je ne déclare rien, **je veux** exactement la semaine d'hier,
  **afin de** ne pas payer l'arrivée d'une fonctionnalité que je n'utilise pas.

---

## 3. Périmètre

### Livré — DEUX propriétés, et c'est une décision

`_shared/keel/day_properties.ts` — module **pur** : liste fermée, parseur
défensif, bloc de consigne, et les deux gardes du parseur.

| Propriété | La branche qu'elle change | Où elle mord |
|---|---|---|
| `batch_cook` | une session longue atterrit là, et elle produit des portions à réchauffer | consigne + **issue** comptée si aucune préparation n'y est cuite |
| `leftovers` | **aucun plat neuf** ; on consomme ce qui existe | consigne + le parseur **drop** tout plat sans `uses` |

### Instruites et NON retenues

Le plan de chantier le demandait explicitement : *deux propriétés qui mordent
valent mieux que quatre qui décorent*.

**`market`** — les produits frais se placent ce jour-là ou juste après, et il
ancre une vague de courses. **Non retenue**, parce que la branche honnête passe
par `planGroceryWaves` (FF-005), qui n'a aujourd'hui **aucun paramètre de jour
d'ancrage** : la livrer ici voudrait dire soit changer un module partagé avec le
front pendant que sa lane est occupée, soit réinventer à côté une stratégie de
courses que FF-005 traite déjà. Les deux sont pires que l'absence. C'est le
premier candidat du prochain lot, et le trou est nommé en §11.

**`guests`** — portions élargies, plat qui tient à plusieurs. **Non retenue** :
le dimensionnement de portion appartient à la lane foyer
([FF-043](../le-foyer/FF-043-la-resolution-foyer.md), `trunkSizing`), pas à la
lane individuelle. Une seconde machinerie de portions à côté de celle du foyer
est exactement la duplication que ce dépôt paie le plus cher.

### Hors périmètre, exprès

**Aucune migration** — `practical_constraints` reste un jsonb libre, même
raisonnement que [FF-051](FF-051-les-apports-fixes.md) §3.

**Aucun écran.** La grille repas×jour du front sait déjà porter un état par
jour ; y ajouter ces deux propriétés est un lot d'interface, pas de moteur.

---

## 4. Le circuit

```
practical_constraints.day_properties  (jsonb libre)
        ↓
   parseDayProperties()      ← jeton inconnu ÉCARTÉ SEUL (patron parseAwayDays)
        ↓
   ┌────┴────────────────────────────┐
   ↓                                 ↓
batch_cook                        leftovers
   ↓                                 ↓
consigne: « une session longue    consigne: « ne compose RIEN de neuf,
  atterrit ce jour-là »             sers ce qui existe »
   ↓                                 ↓
parseur: AUCUNE préparation       parseur: tout plat SANS `uses`
cuite ce jour ⇒ issue comptée     est DROPPÉ, avec son issue
```

### L'asymétrie des deux gardes est délibérée

`leftovers` **retire** ; `batch_cook` **compte**. Ce n'est pas une inégalité de
soin : on peut supprimer un plat qui n'aurait pas dû exister, on ne peut pas
**inventer** une session de cuisine que le modèle n'a pas écrite. Fabriquer une
préparation côté parseur produirait une recette que personne n'a rédigée, avec
des quantités que personne n'a posées — un plat inventé est pire qu'un plat
manquant, et le dépôt a déjà écrit cette phrase ailleurs.

Un `issues` compté est ce que ce dépôt fait des non-conformités du modèle
(`rejected_numeric`, `unstructured_ingredients`) : c'est ce qui dit, en
production, si la consigne mord — et si elle ne mord pas, **c'est le prompt
qu'il faut corriger, pas le parseur**.

---

## 5. Modèle de données

`student_goals.practical_constraints.day_properties` :

```jsonc
[
  { "day": "sun", "properties": ["batch_cook"] },
  { "day": "mon", "properties": ["leftovers"] }
]
```

Liste de propriétés **fermée en TypeScript**. Un jeton inconnu tombe **seul**,
et les propriétés lisibles du même jour restent — patron exact de
`parseAwayDays`, pour la même raison : une faute de frappe ne doit pas effacer
une déclaration voisine.

---

## 6. Règles et garanties

### R1 — Une propriété sans branche est **pire** que son absence

C'est la règle qui a coupé la liste de quatre à deux. Une propriété décorative
fait croire que le produit en tient compte, et l'élève organise sa semaine sur
cette croyance. Le test du dépôt s'applique sans pitié : *est-ce que cette
information change ce que l'élève trouvera dans son assiette cette semaine ?*

Chaque propriété retenue a donc un test qui **mute** la déclaration et exige que
la sortie bouge. *Testé sur les deux.*

### R2 — Le jeton inconnu est écarté **seul**

`{ "day": "sun", "properties": ["batch_cook", "picnic"] }` garde `batch_cook`.
Un jour dont **aucune** propriété n'est lisible tombe entièrement — il ne dit
plus rien. Un jour hors calendrier tombe aussi. *Testé.*

### R3 — Une propriété ne **vide** jamais un plan

Seuls les verrous de sécurité vident un repas. `leftovers` retire les plats
**neufs** d'un jour que l'élève a lui-même déclaré sans cuisine neuve : c'est la
sémantique exacte d'`away_days`, qui compose déjà « rien » sur un jour entier,
et elle est acceptée depuis FF-002. La différence tient en un mot : sur un jour
`leftovers`, les plats qui **puisent** dans une préparation restent. *Testé.*

### R4 — Deux propriétés sur le même jour : comportement défini

`batch_cook` **et** `leftovers` le même jour est cohérent — on cuisine un lot et
on mange ce qui existe déjà. Les deux branches s'appliquent, sans priorité :
une préparation doit être cuite ce jour-là, **et** tout plat neuf tombe. Aucune
des deux n'a besoin de connaître l'autre. *Testé.*

### R5 — L'absence est le comportement d'hier

Aucune propriété déclarée ⇒ consigne identique **au caractère près**, et aucun
plat droppé. Testé par égalité de chaîne, jamais « à peu près ». *Testé.*

### R6 — Un seul bump de `MEAL_PROMPT_VERSION`

`meal.en.v6_structured_quantities` → **`meal.en.v7_fixed_intakes_and_days`**.

Un seul, pour [FF-051](FF-051-les-apports-fixes.md) **et** cette fiche. C'est
pour ça que ce chantier a été fait en dernier : deux bumps successifs
invalideraient deux fois le cache de prompt, et rendraient illisible toute
comparaison avant/après entre les deux lots.

---

## 7. Modes de défaillance

| Défaillance | Ce qui se passe | Protection |
|---|---|---|
| Propriété décorative | l'élève croit que le produit en tient compte | R1 : deux, chacune avec sa branche |
| Jeton inconnu | toutes les propriétés du jour perdues | R2 : écarté seul |
| `leftovers` vide la journée | l'élève n'a rien à manger | R3 : les plats avec `uses` restent |
| Deux propriétés, une seule lue | comportement dépendant de l'ordre | R4 : indépendantes, testé |
| Consigne sans parseur | le modèle compose un dîner neuf quand même | les deux bouts |
| `market` livré à moitié | deux stratégies de courses concurrentes | **non retenue**, et dit |
| Régression muette | bump de version pour rien | R5 : égalité de chaîne |

---

## 8. Critères d'acceptation

- [x] Chaque propriété retenue a un test qui prouve que la sortie **change**
      quand elle est posée (mutation de la déclaration)
- [x] `market` ne contredit aucune vague existante : **elle n'est pas livrée**,
      et `grocery_waves.ts` n'est pas touché
- [x] Deux propriétés sur le même jour : comportement défini et testé
- [x] Une propriété inconnue est **écartée seule** (patron `parseAwayDays`)
- [x] Désarmement : aucune propriété ⇒ consigne identique **au caractère près**
- [x] Un **seul** bump de `MEAL_PROMPT_VERSION`, pour FF-051 et FF-052
- [x] Suite `deno test` complète verte, sans `--no-check`

---

## 9. Rabbit holes

**Deviner une propriété depuis le calendrier.** « Il cuisine souvent le
dimanche » n'est pas une déclaration. Une propriété inférée ferait disparaître
les dîners du lundi d'un élève qui n'a rien demandé.

**Refaire les vagues de courses.** `market` y touche, et c'est exactement
pourquoi elle n'est pas ici. FF-005 traite déjà « une course ou deux » ; une
seconde stratégie à côté est un bug qui se découvre au supermarché.

**Inventer la préparation manquante.** Le parseur pourrait fabriquer une session
sur un jour `batch_cook` vide. Il produirait une recette que personne n'a
rédigée. Voir §4.

**Étendre la liste « puisqu'on y est ».** `travel`, `restaurant`, `fasting`,
`training_day`… chacune demande sa branche, et sans branche c'est de la
décoration. La liste s'étend d'une propriété à la fois, avec son test de
mutation.

---

## 10. Ce qu'on mesure

- Nombre d'élèves déclarant au moins une propriété (l'existence du besoin)
- Issues `batch_cook` sans préparation : **si ça ne baisse pas, la consigne ne
  mord pas** — c'est le prompt qu'il faut corriger, pas le parseur
- Plats droppés sur un jour `leftovers` : même lecture, en miroir
- Répartition `batch_cook` / `leftovers` : si `leftovers` n'apparaît jamais sans
  `batch_cook` la veille, les deux propriétés n'en sont peut-être qu'une
- Jetons inconnus rencontrés : c'est la **worklist** des propriétés à instruire
  ensuite, écrite par les élèves eux-mêmes

---

## 11. Questions ouvertes

1. **`market` et l'ancrage des vagues.** Le vrai travail est d'ajouter un jour
   d'ancrage à `planGroceryWaves`, côté back **et** côté front (le jumeau), sans
   contredire FF-005. Premier candidat du prochain lot. **Non fait**, et c'est
   un vrai trou.
2. **`guests` et les portions.** Appartient à la lane foyer. La question est de
   savoir si un invité chez un élève individuel se traite comme une bouche du
   foyer, ou comme un multiplicateur de portion. Non tranché.
3. **La propriété au foyer.** Le dimanche batch d'un membre est-il celui de la
   table ? Même famille de question que l'apport fixe (FF-051 §11 Q1), et même
   réponse d'attente : le canal des deltas ne le porte pas.
