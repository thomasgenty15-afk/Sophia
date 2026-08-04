# Session Checklist

## 1. Declarer Le Mode

- Mode A : analyse only, aucun fichier source modifie.
- Mode B : implementation guidee apres rapport Mode A valide.
- Daily Alex : modifications uniquement dans `tests/real-personas/alex/*`.
- QA scenario : modifications uniquement dans `tests/real-personas/qa-skill/runs/*`.

## 2. Lire Avant D'Affirmer

- Lire le code pertinent.
- Chercher avec `rg`.
- Citer `path:line` pour chaque affirmation technique.
- Dire explicitement quand une recherche n'a rien trouve.

## 3. Verifier Les Boundaries

- Lire `docs/agent-playbook/06-boundaries.md`.
- Stopper avant zone rouge.
- Signaler toute zone jaune dans le rapport.

## 4. Eviter Les Patterns Interdits

- Lire `docs/agent-playbook/03-forbidden-patterns.md`.
- Ne pas ajouter de skip test, suppression TS, `as any`, debug log, mock core ou dette vague.

## 5. Definition Of Done Mode B

- Scope respecte.
- Test de regression ajoute ou scenario QA enrichi.
- `bash scripts/agent-gate.sh` passe, sauf blocage documente.
- Diff inferieur a 800 lignes.
- Decision log mis a jour seulement si decision produit/architecture durable.
- Les bugs QA ordinaires restent dans le rapport de run, section `Follow-ups`.
