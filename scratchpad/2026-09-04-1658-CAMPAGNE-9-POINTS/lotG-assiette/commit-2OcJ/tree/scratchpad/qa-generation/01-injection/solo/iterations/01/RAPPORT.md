# ITÉRATION 01 — le prompt tel qu'il était, avant tout correctif

**2026-08-18 · agent 1A · lane individuelle · run réel `798c5cd6-acbf-43e3-8dcc-97128d3edd78`**

## Le poste

| | |
|---|---|
| compte | `qa1a.solo@keeltest.dev` (`1a000000-…-0001`), **fixture neuve**, coach MARC (doctrine publiée, 5 convictions) |
| fixture | `../../2026-08-18-2230-1a-fixture-solo.sql` — crée le compte, le rattache, et **rien d'autre** : zéro `student_goals`, donc `/app/setup` est la page d'atterrissage, donc aucun `retained_*` (piège P3 désarmé, vérifié en base) |
| saisie | **par les écrans**, `/app/setup` 1→3, `/app/health`, `/app/plan` |
| modèle | `gpt-5.6-sol`, 200 en 2 min + une relance `composition_retry` en 1 min 45 |
| prompt | système 14 382 car., utilisateur **9 791** car., `truncated: false` des deux côtés, `chars == written_chars` |

Les trois fichiers : `dump/prompt-system.txt`, `dump/prompt-user.txt`, `dump/output.json`, plus
`inputs.json` (état des entrées au moment du run).

## Ce que la mesure a donné

**26 lignes de la checklist cochées sur 44** à ce stade. Le détail est dans `../../CHECKLIST.md`.
Ce que ce run a **prouvé**, et qui n'était jusque-là qu'une suspicion de lecture de code :

### R1 confirmé, et il ne coûte pas une ligne manquante — il coûte le plan

L'élève venait de cocher, à l'étape 3, **plaque · micro-ondes · blender**. Ni four, ni congélateur.
Base : `practical_constraints.kitchen_equipment = ["stovetop","microwave","blender"]`.
Prompt utilisateur : **zéro occurrence** de `oven`, `freezer`, `microwave`.
Sortie du modèle :

```
cooking_sessions[0].run_through : "Heat the oven and put the eggs on first. Cut and start roast…"
dishes[wed][dinner]             : "Harissa chickpeas, roast potatoes, courgette and peppers"
```

Un champ collecté, stocké, **lu par la lane foyer**, et jamais dit à la lane solo.

### R2 confirmé

`activity_level = trains_hard` en base, **zéro ligne** dans le prompt. L'écran promet pourtant, mot
pour mot : « It sizes every serving you get. Sitting eight hours and training four times a week are
about forty per cent apart. » Son seul consommateur est `envelopeFor`, **après** l'appel modèle.

### R5 confirmé

`aspiration` (« Carry my own kayak down to the water by spring ») écrite par `/app/plan`, injectée
par la lane semaine — et la lane repas **ne sélectionnait même pas la colonne**.

### R12 confirmé, sur le cas exact qui le produit

`-- WHAT THEY ALREADY HAVE --` écrit **deux fois** dans le même message (lignes 88 et 106 du dump) :
apports fixes (« ne les mets PAS sur la liste de courses ») et garde-manger (« cuisine avec »).
Il faut un shaker **et** `mode: from_pantry` — ce run avait les deux.

### R4, R6, R7, R8, R10 confirmés (absences)

Poids visé `74`, rythme `0.25`, `focus_axis`, `situation`, `day_properties`, et les
**24 g de protéine / 118 kcal** du shaker : rien de tout ça n'atteint le prompt. Le shaker n'y arrive
que par son libellé et sa quantité (`- Vanilla whey shake (31 g), every day`).

### Ce que la suspicion « seul `claim` est injecté » devient : FAUSSE sur cette lane

Le bloc doctrine du prompt solo porte `claim` **et** `rationale` entre parenthèses, et pour chaque
interdit **`reason` ET `instead`** (`INSTEAD, this coach says: …`). Le constat de l'étape zéro venait
du prompt **foyer**. Rien à corriger ici — c'est consigné, pas touché.

## Deux choses vues au passage, qui ne sont pas des défauts

1. **La journée déjà entamée sort sous l'en-tête des absences.** Le run est parti à 22 h 13 heure de
   Londres, la fenêtre démarrait le jour même : le prompt porte `- Tuesday: breakfast, lunch, dinner`
   que personne n'a déclaré. C'est `slotsPassedToday` (`generate-meal-v1:1337`), documenté, et il
   réutilise volontairement le mécanisme `AwayDay`. **Conséquence pour la mesure** : la fenêtre du run
   suivant démarre demain, pour ne pas confondre les deux sources.
2. **La sortie exploite ce qu'on lui donne.** Garde-manger honoré (chickpeas / basmati / peas /
   paprika absents de la liste de courses), régime pescatarien tenu, sésame et produits laitiers
   absents, mercredi midi non composé. L'injection présente **fonctionne** ; c'est l'injection
   absente qui casse.
