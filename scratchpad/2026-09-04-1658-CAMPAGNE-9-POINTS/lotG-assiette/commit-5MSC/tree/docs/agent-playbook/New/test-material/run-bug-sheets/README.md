# Run Bug Sheets

Ce dossier contient une feuille de suivi par run QA. Le rapport de run garde le
transcript et les verdicts. La feuille de bugs garde l'historique exploitable :
famille, owner, cause amont, fix, tests et verification.

## Quand Creer Une Feuille

Creer une feuille pour chaque run :

- `red` ;
- `yellow` avec bugs a suivre ;
- `green` si le run valide une correction importante et qu'on veut garder la
  preuve de cloture.

Nom :

```txt
YYYY-MM-DD-<run-id>-bugs.md
```

Utiliser `TEMPLATE.md`.

## Regle

Chaque bug doit etre rattache a une famille de
`docs/agent-playbook/New/test-material/familly-bugs.md`. Si l'agent ne sait pas classifier le
bug, il doit le laisser en `needs_triage` plutot que creer un patch.

Un bug ne passe en `verified` que si la correction est prouvee par un test
adapte ou un rerun QA.

