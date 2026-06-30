# Bug Sheet - `daily-two-plans-four-actions-webhook-20260624-mqshgnfd`

## Run

- Date: 2026-06-24
- Rapport: `tests/real-personas/rose/runs/daily-weekly/daily-two-plans-four-actions-webhook-20260624-mqshgnfd.md`
- Raw: `tests/real-personas/rose/runs/daily-weekly/daily-two-plans-four-actions-webhook-20260624-mqshgnfd.raw.json`
- Verdict global: yellow

## Bugs

### R1-B01 - Confirmation finale trop locale sur commit multi-target

- Tours: 5
- Famille: `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee
- Domaine owner: visible daily `commit_success`
- Source amont: contexte visible de cloture daily multi-target
- Symptome visible: Sophia dit seulement `C'est noté pour la pochette documents...` alors que 4 actions sur 2 plans viennent d'etre commitees.
- Preuve systeme: pending `done`, `entries_count=4`, `log_daily_action_review x4`, reason categories conformes (`emotional`, `forgot`, `fatigue`, `external`).
- Correction attendue: au commit final multi-target, le visible doit confirmer la cloture globale du daily ou le nombre d'actions traitees, pas seulement la derniere target.
- Statut: `open`
- Fix reference: a faire
- Tests requis: invariant visible `commit_success` avec 4 targets / 2 plans; anti-regression single target pour garder une confirmation courte.
