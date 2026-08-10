# FF-051 · Les apports fixes — ce qui est déjà mangé

| | |
|---|---|
| **Identifiant** | `FF-051-les-apports-fixes` |
| **Statut** | 🟢 Livré (2026-08-11) — en observation, comme le reste du moteur |
| **Date** | 2026-08-11 |
| **Autorité produit** | [MODEL.md](../../keel/MODEL.md) · [CONTRACT.md](../../keel/CONTRACT.md) |
| **Dépend de** | [FF-038](FF-038-le-referentiel-de-composition.md) — **le référentiel est la porte** · [FF-039](FF-039-enveloppes-et-verdicts-en-observation.md) · [FF-003](FF-003-intake-structure.md) |
| **Voisine de** | [FF-002](FF-002-dire-son-absence.md) — le jumeau négatif : là on ne mange **pas** ici, ici on mange **déjà** ça |
| **Effort réel** | 1 module pur, 3 branches, 0 migration |

---

## 1. Le problème

Un élève consomme déjà, tous les jours, quelque chose que le plan ne compose
pas : un shaker de protéines au réveil, un yaourt à 16 h, un café au lait le
matin. Aujourd'hui le produit l'ignore, et l'ignorance a trois conséquences,
toutes fausses :

1. **Duplication.** Shaker au réveil **et** œufs au petit-déjeuner dans le
   plan. L'élève mange deux petits-déjeuners, ou en saute un — et dans les deux
   cas le plan a eu tort.
2. **Plancher protéique mal compté.** Le shaker apporte de la protéine ; le
   plan empile la sienne par-dessus comme s'il n'existait pas.
3. **Enveloppe faussée.** L'énergie de l'apport n'est nulle part.

### Pourquoi cette fiche n'existait pas avant

**C'est le premier input qui alimente le CALCUL et non la SÉLECTION.** Tout ce
que le produit savait faire d'une déclaration, jusqu'ici, c'était choisir
autrement : écarter un aliment, préférer un autre, sauter un moment. « Je
prends un shaker tous les matins » ne se traite pas comme ça — il faut savoir
ce que le shaker *pèse*, sinon la déclaration n'est que de la prose dans
`student_goals.situation`, et un modèle en fait ce qu'il veut.

Sans [FF-038](FF-038-le-referentiel-de-composition.md), ce chantier n'avait
qu'une branche sur trois, et la seule qui restait était la plus faible. Avec,
c'est des grammes qui comptent. **C'est le cas d'usage qui prouve que le moteur
valait le coup.**

---

## 2. Job stories

- **Quand** je prends le même shaker tous les matins de semaine, **je veux**
  que mon plan arrête de me proposer un petit-déjeuner par-dessus, **afin de**
  ne pas devoir en supprimer un moi-même chaque lundi.
- **Quand** je bois un café au lait le matin, **je veux** qu'il compte sans
  effacer mon petit-déjeuner, **afin de** ne pas payer une déclaration honnête
  par un repas en moins.
- **Quand** j'ai un yaourt à 16 h sans que ce soit « un goûter », **je veux**
  pouvoir le dire sans nommer de moment, **afin de** ne pas voir mon plan
  réorganiser une journée que je n'ai pas décrite.
- **Quand** je suis sous plancher de restriction, **je veux** que la
  non-duplication marche quand même, **afin de** ne pas être le seul à qui le
  produit propose deux petits-déjeuners.

---

## 3. Périmètre

### Livré

- `_shared/keel/fixed_intakes.ts` — module **pur** : la forme, le parseur
  défensif, le bloc de consigne, la vérification du parseur, la conversion vers
  les entrées du moteur.
- `meal_generation.ts` — `fixedIntakes` **paramètre requis** de
  `buildMealPrompt` **et** de `parseGeneratedMeal`.
- `meal_verdict.ts` — `fixedIntakeInputs` **paramètre requis** de `verdictFor`.
- `generate-meal-v1` — lit `practical_constraints.fixed_intakes`, une seule
  fois, avec le reste.

### Hors périmètre, exprès

**Aucune migration.** `student_goals.practical_constraints` est un jsonb libre
**et le reste** — la migration `20260805150000` écrit pourquoi, et
`eating_rhythm` est le précédent exact. Un CHECK de forme ici achèterait une
validation que le parseur fait déjà mieux (il *compte* ce qu'il écarte) au prix
d'une migration à refaire à chaque champ.

**Aucun écran.** Le champ se pose par la carte des contraintes pratiques,
qui n'est pas dans ce lot. Un apport fixe écrit à la main dans le jsonb est lu
correctement dès aujourd'hui — c'est ce que les tests prouvent.

**Les compléments et la supplémentation.** Un apport fixe est un **aliment**.
« Je prends de la créatine » n'est pas de ce ressort, et le produit n'a rien à
en dire ([FF-042 R6](FF-042-les-regimes-alimentaires.md) : on nomme, on
n'ordonne pas — ici on ne nomme même pas).

---

## 4. Le circuit

```
practical_constraints.fixed_intakes  (jsonb libre)
        ↓
   parseFixedIntakes()  →  { intakes, discarded }   ← malformé ÉCARTÉ et COMPTÉ
        ↓
   ┌────┴──────────────────┬───────────────────────────┐
   ↓                       ↓                           ↓
BRANCHE 1                BRANCHE 2                 BRANCHE 3
non-duplication          plancher protéique        enveloppe
   ↓                       ↓                           ↓
consigne en négatif     fixedIntakeInputs()        même chemin: les
   +                       ↓                       grammes entrent dans
parseur qui DROP        resolveIngredients()       energyTotal
un plat sur un             ↓
créneau remplacé       nutrientsOf() → protéine comptée
   ↓                       ↓
côté ALIMENT           côté PERSONNE — n'existe pas sous `restriction_flag`,
survit à tout          parce que `Envelope` ne le représente pas
```

**Les deux bouts, comme toujours.** La consigne dit la règle ; le parseur la
tient. Un modèle de composition **complète** ce qu'on lui donne — c'est son
métier — et une consigne « ne compose pas de petit-déjeuner » sans vérification
derrière est une consigne qu'il respectera la plupart du temps.

---

## 5. Modèle de données

`student_goals.practical_constraints.fixed_intakes`, un tableau :

```jsonc
{
  "food_ref": "whey_protein_powder", // résolu contre food_composition_refs
  "label": "mon shaker",             // les mots de l'élève, JAMAIS matché (R1)
  "amount": 30,
  "unit": "g",                       // liste fermée: g | ml | unit | tbsp | tsp
  "slot": "breakfast",               // ou absent = hors moment nommé
  "replaces_meal": true,             // A5 — n'existe QU'AVEC un slot
  "days": ["mon","tue","wed","thu","fri"] // vide/absent = tous les jours
}
```

Côté TypeScript, la forme est une **union à deux branches**, pas un objet plat
à champs optionnels :

```ts
type FixedIntake = { foodRef; label; amount; unit; days } & (
  | { placement: "loose" }                                    // pas de moment
  | { placement: "at_slot"; slot: EatingOccasion; replacesMeal: boolean }
);
```

C'est le patron d'`Envelope` (FF-039), pour la même raison : `replaces_meal:
true` sans `slot` est un état que **personne ne saurait exécuter** — remplacer
quel moment ? Un objet plat le rend représentable et laisse au lecteur le soin
de s'en méfier ; l'union le rend impossible à écrire.

**Plafond : 8 entrées.** C'est un prompt, pas une base de données. Au-delà,
l'excédent est écarté et compté.

---

## 6. Règles et garanties

### A5 — Un apport **s'ajoute** ; il ne remplace que si l'élève l'a dit

C'est **l'arbitrage de ce chantier**, et il se prend dans le mauvais sens par
défaut si on ne le prend pas explicitement.

Un yaourt à 16 h ne doit pas supprimer le goûter : quelqu'un qui décrit
honnêtement ce qu'il mange déjà se retrouverait puni d'un repas en moins.
`replacesMeal` vaut donc **`false` par défaut**, y compris quand le moment est
nommé — « un café au lait au petit-déjeuner » nomme un moment et ne remplace
rien.

Trois états, trois comportements, et chacun a une branche :

| Déclaration | Ce qui change |
|---|---|
| `placement: "loose"` | rien n'est occupé ; l'apport **compte** (branches 2 et 3) |
| `at_slot`, `replacesMeal: false` | le moment est composé, mais la consigne interdit de **répéter** l'apport ; il compte |
| `at_slot`, `replacesMeal: true` | **aucun plat** sur ce moment ces jours-là ; il compte |

*Testé sur les trois.*

### R1 — `label` est de la prose et ne sert JAMAIS à matcher

« mon shaker », « le truc du matin », « my 4pm thing ». Le calcul passe par
`food_ref` et **uniquement** par lui. C'est la règle du dépôt — identifiants,
pas prose — et elle a une cicatrice nommée : le 2026-08-06, des lignes
difformes ont armé la ceinture de sortie sur le mot « diabetes » et un message
d'urgence a été remplacé par un refus poli, en run réel.

Le `label` sert à **une** chose : dire à l'élève, dans ses mots, de quoi le
produit parle. Il n'entre dans aucune comparaison. *Testé.*

### R2 — Un apport non résolu propage de l'**inconnu**, jamais du zéro

C'est la règle du moteur (FF-038), et c'est ici qu'elle est le plus tentante à
enfreindre : un `food_ref` que le référentiel ne connaît pas rendrait
naturellement « 0 g de protéine », et 0 est un nombre — il traverse toutes les
additions sans rien signaler. Le plancher serait alors jugé « atteint » sur un
plan qui empile de la protéine par-dessus un shaker de 30 g qu'on n'a pas su
lire.

Un apport irrésolu met donc `energyKnown = false` et `proteinTotal = null`, et
il est **compté dans la worklist de résolution** comme n'importe quel
ingrédient — c'est ce qui le fera apparaître dans la curation d'alias. *Testé.*

### R3 — Sous `restriction_flag`, la branche 1 **survit** ; les deux autres
n'ont structurellement rien à alimenter

En mode `per_portion`, `Envelope` ne porte pas de champ `energy` : le verdict
énergie n'est pas calculé puis tu, il **n'existe pas**. Aucun chemin spécial
n'a été écrit pour ça — c'est le type qui rend l'état illégal irreprésentable,
et c'est la seule forme de garde qui ne se débranche pas.

La non-duplication, elle, est **côté aliment** : elle ne lit ni le corps, ni
l'objectif, ni l'enveloppe. Elle marche donc à l'identique pour tout le monde.
C'est exactement ce qu'on veut : l'élève sous plancher est le dernier à qui le
produit doit proposer deux petits-déjeuners. *Testé.*

### R4 — Le malformé est écarté **et compté**, jamais deviné

Même posture que `parseAwayDays` et `parseEatingRhythm` : une entrée illisible
fait tomber **son** entrée, pas les autres. Une unité hors liste, un `amount`
non fini ou négatif, un `food_ref` vide, un `slot` inconnu, une entrée au-delà
du plafond : écartée, et `discarded` s'incrémente.

Le compteur est ce qui distingue « il n'a rien déclaré » de « on n'a pas su
lire ce qu'il a déclaré ». Sans lui, un champ mal écrit par un futur écran
ressemblerait à un champ vide, pour toujours. *Testé.*

### R5 — Les deux bouts, et la journée décide

La consigne nomme l'apport en **négatif explicite** — « they already have this,
do not compose a breakfast on those days » — parce qu'un modèle qui reçoit une
liste positive la complète. Et le parseur revérifie par jour : un plat posé sur
`mon/breakfast` alors qu'un apport remplaçant occupe `breakfast` le lundi est
**dropped avec une issue**, exactement comme un moment d'absence.

`days: []` vaut **tous les jours** — même convention que `slots: []` dans
`AwayDay`. Un plat sans `day` nommé, sur un créneau remplacé tous les jours,
tombe aussi ; sur un créneau remplacé seulement certains jours, il passe :
on ne peut pas prouver qu'il est le mauvais. *Testé dans les deux sens.*

### R6 — Le désarmement est testé par **égalité de chaîne**

Aucun apport fixe ⇒ la consigne est identique **au caractère près** à celle
d'avant ce lot. C'est la seule preuve qui vaut : une comparaison « à peu près »
laisse passer une ligne vide, un titre de section orphelin, un saut de ligne —
et chacun de ces trois coûte un bump de version de prompt pour rien. *Testé.*

---

## 7. Modes de défaillance

| Défaillance | Ce qui se passe | Protection |
|---|---|---|
| `food_ref` inconnu du référentiel | protéine « 0 » crédible et fausse | R2 : inconnu propagé |
| `label` utilisé pour matcher | ceinture armée sur « shaker » | R1 + test |
| `replaces_meal` sans moment | remplace quoi ? | union, état irreprésentable |
| Apport ignoré sous restriction | deux petits-déjeuners à qui il faut le moins | R3 + test |
| 40 apports déclarés | prompt noyé | plafond 8, excédent compté |
| Entrée malformée | déclaration silencieusement perdue | R4 : écartée **et comptée** |
| Consigne sans parseur | le modèle compose le moment quand même | R5, les deux bouts |
| Apport compté dans la densité | un shaker fausse la densité d'un plat | il n'est dans **aucun** plat |

---

## 8. Critères d'acceptation

- [x] Non-duplication : shaker remplaçant au petit-déjeuner ⇒ **aucun**
      petit-déjeuner composé ces jours-là
- [x] `days` respecté : le week-end sans shaker reçoit son petit-déjeuner
- [x] Protéine comptée : le plancher est atteint avec **moins** de protéine
      empilée par le plan
- [x] Apport non résolu ⇒ **inconnu** propagé (pas zéro), et compté dans la
      résolution
- [x] Sous `restriction_flag` : non-duplication active, **aucune** trace
      d'enveloppe
- [x] Désarmement : aucun apport fixe ⇒ consigne identique **au caractère près**
- [x] `label` absent de tout chemin de comparaison
- [x] Suite `deno test` complète verte, sans `--no-check`

---

## 9. Rabbit holes

**Deviner un apport fixe depuis la conversation.** « J'ai pris un shaker ce
matin » n'est pas une déclaration d'habitude. Un apport posé par inférence
supprimerait des repas que personne n'a demandé de supprimer — le pire mode de
défaillance de ce chantier, et le plus difficile à diagnostiquer depuis l'écran
de l'élève. L'élève déclare, ou rien.

**Le confondre avec le garde-manger.** `pantry` dit ce qu'on **a en stock** ;
un apport fixe dit ce qui est **déjà mangé**. Les deux se ressemblent dans le
jsonb et ne se ressemblent en rien dans ce qu'ils changent : le premier évite
une course, le second évite un repas.

**En faire une préférence ou un interdit.** Un apport fixe ne verrouille rien
et ne classe rien : il **occupe**. Le brancher sur `forbidden_matcher` en
ferait un régime au rabais, avec une garantie qu'on ne peut pas tenir.

**Ajouter une heure.** Le champ `at` d'`eating_rhythm` a déjà été supprimé
pour ça : il n'était lu que par une parenthèse de prose. Le `slot` décide, pas
l'horloge.

**Le montrer en grammes à l'élève.** L'apport porte un `amount` — c'est un
chiffre sur un **aliment**, ce que CONTRACT.md autorise, et exactement de la
même famille que « 400 g de cuisses de poulet » dans une recette. Ce qui reste
interdit, comme partout, c'est le chiffre **sur la personne** : ce que le
shaker apporte à *son* plancher ne sort jamais du moteur.

---

## 10. Ce qu'on mesure

- Nombre d'élèves avec au moins un apport fixe (l'existence du besoin)
- `discarded` > 0 : le champ est écrit par quelqu'un qui se trompe de forme —
  et quand un écran existera, ce compteur est son test de recette
- Taux de `food_ref` non résolus parmi les apports : c'est une **worklist
  d'alias**, pas un bug ; les apports fixes sont des produits de marque
  (« whey », « skyr », « Huel ») que le référentiel Ciqual nomme autrement
- Nombre de plats droppés pour créneau remplacé : **s'il ne baisse pas**, la
  consigne ne mord pas et c'est le prompt qu'il faut corriger, pas le parseur
- Répartition `loose` / `at_slot` / remplaçant : si personne ne remplace jamais,
  l'arbitrage A5 avait raison ; si tout le monde remplace, la case par défaut
  est mal posée à l'écran

---

## 11. Questions ouvertes

1. **L'apport fixe au foyer.** Le shaker d'un membre n'est pas celui de la
   table. Il appartient au canal des deltas
   ([FF-043](../le-foyer/FF-043-la-resolution-foyer.md)), pas au tronc — mais
   `DELTA_CHANNELS` ne le porte pas encore. **Non fait**, et c'est un vrai trou.
2. **La quantité variable.** « Un ou deux œufs selon la faim » n'a pas de
   forme ici. Le plafond du moteur voudrait le maximum, la non-duplication
   voudrait le minimum. Non tranché, parce qu'aucune donnée ne dit encore si le
   cas est fréquent.
3. **La rétractation.** Retirer un apport fixe passe par le même chemin que
   l'écrire. Il n'y a pas d'écran, donc pas de chemin. À traiter avec la carte.
