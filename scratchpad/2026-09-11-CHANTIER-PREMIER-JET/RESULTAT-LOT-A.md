# Lot A — identité et validation alimentaires · LIVRÉ

Suite Deno : **6 505 verts · 3 rouges** (les trois préexistants). +96 tests.

## Ce qui est prouvé

- **Le faux ami est réel et massif** : sur TOUS les plans de la base, en `fr-FR`,
  `prunes` 78 · `raisin` 65 · `raisins` 40 · `prune` 12 = **195 occurrences** lues comme du
  fruit SEC, contre **1** en `en-GB`. Plus `poire` 63 + `poires` 33 = **96 occurrences**
  calculées avec les valeurs du **poireau**.
- **Les quatre contrefactuels de l'enquête sont reproduits à l'unité** : PERTE samedi
  614→**388**, PERTE dimanche 613→**356**, GAIN samedi 728→**427**, GAIN dimanche 728→**475**.
  Par une méthode différente (l'enquête remplaçait les *termes*, le lot change la *résolution*).
- **Un cinquième que l'enquête ne voyait pas** : GAIN vendredi petit-déjeuner 728→**773** — la
  poire, qui bouge dans l'autre sens. Le contrefactuel ne substituait que raisin/prune.
- 10 lignes d'ingrédient sur 184 changent de référence sur les deux plans. **Aucun gramme
  réécrit.**
- `20039` n'est plus porté par deux slugs. Migration appliquée en local et idempotence prouvée.

## Les arbitrages du lot A

| Question | Décision | Raison |
|---|---|---|
| Liste nominative de faux amis **ou** priorité alias conditionnée à la locale ? | **Les deux** : liste fermée, chaque ligne portant sa langue | `raisins` = frais en français, sec en anglais : une liste sans langue serait fausse pour la moitié des lecteurs. Et l'inversion générale est un no-op mesuré (191 alias capturés, **0 contradictoire**) qui deviendrait dangereux le jour où un alias contradictoire revient |
| Langue par défaut | **`fr`** | 195 occurrences fr contre 1 en. Le repli va du côté où la mesure dit qu'il coûte le moins |
| 3ᵉ argument optionnel à `resolveIngredient` ? | **Non, zéro** | Cicatrice `optional-gate-params-are-disarmed-gates` : une centaine d'appels ne le passeraient jamais. La langue entre au **chargement de l'index** |
| Validation : table à part ou colonnes ? | **Colonnes** sur `food_composition_refs` | Elles voyagent dans le `select` existant ; une exception ne peut ni survivre à sa ligne ni pointer un slug disparu |
| Faux amis : colonne ou table ? | **Table à part** | « cette forme passe DEVANT le slug nu, dans cette langue » n'est pas la même affirmation qu'un alias. Les mélanger remettrait la contradiction que la migration `20260822113000` a nettoyée |
| `CompositionRef.validation` requis ? | **Facultatif** — contre la lettre de mon socle | Requis, il casse le typecheck de ~25 fichiers de test appartenant à quatre autres lots, que le lot A n'a pas le droit d'éditer. La règle vit dans `validationOf`, pas dans le champ |
| La poire : quelle valeur ? | Valeurs **citées** de `pear_var_conference_pulp` (53,1), code/nom du poireau **retirés**, ligne `a_verifier` | La ligne ANSES générique n'est établissable depuis aucune source du dépôt. Copier une ligne voisine déjà en base est une citation, pas une invention — et garder le poireau était certainement faux |
| `raisin` (slug) | **`rejete`** | Doublon de fait de `raisins` (5 macros identiques) sans `ciqual_code`, et son slug est le mot français du fruit **frais** |
| `prune` (slug) | **`a_verifier`** | Sa valeur est juste, son **nom** ment. Reste mesurable (arbitrage ②), atteignable par `pruneau` |
| Inscrire les 18 lignes `sas` une par une ? | **Non** | Elles sont `a_verifier` par la RÈGLE. Les inscrire ferait croire que la règle ne les couvre pas, et la 19ᵉ passerait au travers |
| Les 689 lignes sans code CIQUAL | **`verifie`** | Non traçable ≠ faux. Durcir ramènerait le catalogue composable de 881 à **192** lignes |

## Le piège trouvé en route

`sec`, `seche`, `sechees`, `dried`, `frais` sont des `PREPARATION_MODIFIERS` : ils **tombent** à
la normalisation. « prunes séchées » se réduit à « prunes », donc au faux ami — et le correctif
aurait rendu le fruit **frais**, c'est-à-dire le défaut inverse. 14 alias de forme complète
ajoutés, avec une contre-épreuve qui retire l'alias et vérifie que le sec redevient frais.

## Ce que ça coûte, et qu'il faut dire à l'humain

Après cette migration, **23 lignes sortent du catalogue composable** : les 18 `sas`, plus
`pear`, `prune`, `avocado_pulp`, `paraffin_oil`, `raisin`. **La prune sèche disparaît donc des
nouvelles recettes** jusqu'à arbitrage humain.

## Ce qui n'a pas été fait, et pourquoi

- **`pate`** : `normalizeTerm` retire les accents, donc « pâte » et « pâté » sont la même
  chaîne. Aucune ligne ne peut les départager — seul un renommage de slug répare.
- **`complet`** : défaut d'un autre mécanisme (`PREPARATION_MODIFIERS`), pas du slug.
- Aucun renommage de slug (trois épreuves d'absence requises : autre lot).

## Pour l'humain

```bash
supabase db push
```
La migration `20260911040000` est appliquée **en local** seulement. Le `db push` distant est le
premier vrai run de ses blocs `check`.
