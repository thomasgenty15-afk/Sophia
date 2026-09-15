# 2026-06-10 - update_coach_preferences conditional r6 - Bug Sheet

Run: `update-coach-preferences-conditional-r6`

Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-10-update-coach-preferences-conditional-r6.md`

## Bugs

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptôme visible | Preuve système | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `UCP-R6-B01` | T2 | `BF-STATE-01` | `update_coach_preferences` reducer local | Transition `proposed -> write_ready` après confirmation générale | Sophia redemande confirmation alors que le user a déjà accepté l'application générale | T2 `flow_action=confirm_proposed_mapping`, updates `locked`, evidence `applique-les comme réglages généraux`, mais `status=proposed`, `write_committed=false`, `missing_or_weak_values=["confirmation"]` | Le garde anti-write partiel doit bloquer le premier write direct, pas une confirmation explicite du mapping général. T2 devrait passer `write_ready`. | open | n/a | Positif: T1 conditionnel -> proposed/no write; T2 “oui applique comme réglage général” -> write. Anti-faux-positif: “oui mais seulement quand je bloque” -> no write/proposed. Integration locale `/test-send-message force_full_ai=true`. |

## Historique

| Date | Bug id | Événement | Statut | Artefact |
| --- | --- | --- | --- | --- |
| 2026-06-10 | `UCP-R6-B01` | Observé en run réel local, T2 | open | `tests/real-personas/qa-skill/runs/operations/2026-06-10-update-coach-preferences-conditional-r6.summary.json` |
