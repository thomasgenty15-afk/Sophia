# Test Material

Ce dossier regroupe les documents de travail QA/test qui doivent etre lus ou mis
a jour pendant les runs et les corrections issues de runs.

## Contenu Canonique

- `01-qa-run-report-structure.md` : format obligatoire des rapports de run.
- `14-qa-test-guidelines.md` : consignes transversales des runs QA Sophia.
- `15-chantiers-log.md` : journal append-only des gros chantiers et decisions.
- `familly-bugs.md` : taxonomie des familles de bugs et lifecycle de suivi.
- `run-bug-sheets/` : feuilles de bugs par run.

## Separation Des Roles

- Le rapport de run raconte la conversation et le verdict.
- La feuille de bugs suit les bugs fins du run : famille, owner, source amont,
  fix, tests, statut.
- Le chantiers-log garde les decisions et corrections structurantes.

## Regle De Declenchement QA

Des que ce dossier, ce README, ou `14-qa-test-guidelines.md` est cite, demande,
lu ou explore comme cadre de test, le run attendu est un run IA reel Sophia :
Supabase local, endpoint `/functions/v1/test-send-message`, et
`force_full_ai=true`. Ne pas remplacer par un test unitaire, un renderer
deterministe ou un test technique local, sauf demande explicite du demandeur.

## Compatibilite

Les anciens fichiers a la racine de `docs/agent-playbook/` sont conserves comme
pointeurs courts pour eviter de casser les prompts existants. La source
canonique est ce dossier.

## Suivi Des Decisions Architecturales

| Date       | Decision                                                                                                                | Statut | Reference |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| 2026-05-30 | Regrouper la structure de rapport, le chantiers-log, le suivi tests et les bug sheets dans `test-material/`.            | Active | J68       |
| 2026-05-30 | Ajouter les guidelines QA au dossier canonique `test-material/` et renommer le suivi des familles en `familly-bugs.md`. | Active | J70       |
