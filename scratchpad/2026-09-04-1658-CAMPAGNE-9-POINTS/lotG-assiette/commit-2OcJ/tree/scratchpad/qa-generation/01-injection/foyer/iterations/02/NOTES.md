# Itération 02 — la première sortie réelle, et ce qu'elle fait des lignes détachées

**Run** `ebeb0828-ab1c-47d0-be82-775367df47ed` · `generate-household-meal-v1`
· **`gpt-5.4-mini`** · 2026-08-18 21:37:46 → 21:38:37 UTC (**52 s**, HTTP **200**)
· système 15 486 / utilisateur 14 160 car., `truncated = false`,
`written == chars == compteur indépendant` des deux côtés.

**Un seul changement par rapport à l'itération 01** : le mode de cuisson demandé passe de
`one_session` à **`one_dish`**, pour que le run tienne dans la fenêtre laissée par les
recréations du runtime edge (cf. `iterations/01/NOTES.md`). Le foyer, les trois bouches et
tous les champs sont identiques. **Aucun correctif n'est encore appliqué à cette étape.**

## Le plafond mord, et c'est visible dans le prompt

Le calcul trouvait `one_session` (deux divergents : Sacha `fat_loss` omnivore et Livia
`muscle_gain` pescatarian). Le maître a demandé `one_dish` — **plus strict** — donc
`capCookingShape` sert le demandé :

```
HOUSEHOLD SERVING PLAN — one cooking session, portions that differ.
Cook ONE set of preparations for everyone. Do NOT propose separate dishes.
```

et les deux blocs conditionnels `== A DISH OF THEIR OWN ==` (U) et
`== WHOSE DISH IS IT (household) ==` (S) **disparaissent** — ils étaient présents en
itération 01. Le plafond n'a rien fabriqué : il a retiré. Conforme à `HP:618-633`.

## Ce que la SORTIE fait des deux points à ne pas trancher seul

### Le corps d'un mineur ne s'énonce jamais — ✅ tenu, prompt ET sortie

- **Prompt** : la ligne de Tino est `- Tino: child-size share of the same dish — eats at
  breakfast, lunch, snack_pm, dinner only — usually: only eats vegetables when they are
  not touching each other`. **Aucun crochet.** Ses 138 cm et 33 kg n'apparaissent nulle part.
- **Sortie** (24 471 car. de JSON) : `138` → 0 · `cm` → 0 · `weight` → 0 · `BMI` → 0 ·
  `kcal` → 0 · `calorie` → 0. Les deux seules occurrences de `kg` sont
  `"1.5 kg"` de filets de poisson — une quantité d'**aliment**, ce qui est voulu.
- **Rien à remonter en bloquant.**

### L'allergie détachée (R-6) — mesurée, non tranchée

Le prompt porte la valeur mais pas la bouche :

```
=== THIS STUDENT'S HARD CONSTRAINTS (source: student_safety_constraints) ===
- peanut — allergy, severity=medical (declared by student)
```

En-tête au **singulier** pour une tablée de trois, `userId: ""`, aucun `member_id`.
Contraste direct, dix lignes plus bas dans le même prompt : `- Livia: never serve mushrooms`.

**Ce que la sortie en fait** — la question que la checklist posait :

| | occurrences dans la sortie |
|---|---|
| `peanut` | **0** |
| `allerg` | **0** |
| aliment de la famille arachide dans les 27 lignes de courses | **0** |

Le modèle **n'a ni commenté ni justifié** l'allergie ; il l'a simplement exclue de tout le
foyer. La direction sûre tient donc — mais **par sur-application** (personne ne mange
d'arachide, alors qu'un seul membre est concerné), et **rien dans la sortie ne prouve que
la garde a mordu** plutôt qu'un plat de poisson qui n'en contenait de toute façon pas.
C'est le sens de « une casserole protégée par accident n'est pas une garde » :
**je le remonte, je ne le tranche pas.**

## Les autres lignes de maison, honorées en silence

`mushroom` → 0 · `coriander` → 0 · `pescatarian` → 0 dans la sortie, et le plat partagé
est un poisson blanc pour toute la tablée. Les contraintes ont mordu sans être nommées à
table, ce que le prompt demande explicitement.

## Ce qui est arrivé, ce qui ne l'est pas

- ✅ **envie** : `aubergine` → 15 occurrences dans la sortie (aubergines dans la liste de courses).
- ✅ **contexte** : `late shift` → 1 occurrence.
- ❌ **« ce dont ils ont envie »** : `brussels` → 0 · `dahl` → 0, **dans le prompt comme
  dans la sortie**. ⚠️ Piège évité : `lentil` apparaît 24 fois dans la sortie — ce n'est
  **pas** la preuve que le champ est arrivé. Le prompt ne contient ni `brussels` ni
  `dahl` ni `lentil` en entrée ; les lentilles sont un choix du modèle
  (le prompt lui suggère « legumes » comme protéine bon marché sous contrainte de budget).
  **On coche sur sa valeur, jamais sur un mot voisin.**
