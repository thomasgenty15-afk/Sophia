# L'état AVANT le chantier — mesuré le 2026-09-11 vers 06:10

Tout écart après le chantier se lit contre ces nombres-là. Ils ont été relevés **pendant** que
les agents lisaient, donc avant toute écriture de leur part.

## Suite Deno `_shared/keel/` — celle du gate

```
deno test --allow-read --allow-env supabase/functions/_shared/keel/
FAILED | 6409 passed | 3 failed | 2 ignored (40s)
```

Les trois rouges, **préexistants et étrangers à ce chantier** :

- `cooking_style_brief_test.ts:70` — « le style DÉRIVE la difficulté et la variété »
- `household_freeze_test.ts:286` — « personne ne relit `free_until` hors de la facturation »
- `household_merge_quota_test.ts:190` — « AUCUNE PORTE DE SORTIE ENTRE LA RÉCLAMATION ET LA DÉPENSE »

## Suite front (vitest), node v22.20.0

```
cd frontend && npx vitest --config vitest.config.ts run
Test Files  2 failed | 154 passed | 5 skipped (161)
     Tests  2 failed | 2533 passed | 20 skipped (2555)
```

Les deux rouges front sont **préexistants et étrangers** : `mouthProfileReaders.int.test.ts:154`
cherche `<ActivitySessionsCard>` dans `StudentProgressPage.tsx` — c'est le chantier d'une autre
session, la carte n'est pas encore posée.

⚠️ `scripts/.vitest-red-baseline` est **vide** (aucun rouge toléré) depuis le 2026-09-04. Ces
deux rouges-là feraient donc échouer le gate de commit : ils n'appartiennent pas à ce chantier,
et on ne commite pas ce soir.

## Le rejeu hors ligne des six réponses archivées

`scratchpad/2026-09-11-ENQUETE-DEUX-DIRECTIONS/` porte l'état AVANT dans `results.json`,
`stages.json`, `diagnostic.json`, `mappings.json`, `fruit-counterfactual.json`, tous datés du
2026-09-11 05:44. **Ne pas les écraser.**

## Les durées de génération avant le chantier

| | génération | réparation 1 | réparation 2 | total | hors modèle |
|---|---|---|---|---|---|
| PERTE | 97,4 s | 67,2 s | 72,5 s | **237 s** | **0,4 s** |
| GAIN | 78,6 s | 113,7 s | 93,8 s | **286 s** | **0,3 s** |

59 % à 72 % du temps part en rattrapages. Sans eux : ~98 s et ~79 s, **sous le plafond de 150 s**
de la passerelle. Et après quatre réparations, **3 assiettes sur 18 restent hors couloir**.

## Typecheck front

```
cd frontend && npx tsc -b --force   →  exit 0, aucune erreur
```

⚠️ `--force`, jamais l'incrémental : mémoire `agent-gate-does-not-run-vitest`.
