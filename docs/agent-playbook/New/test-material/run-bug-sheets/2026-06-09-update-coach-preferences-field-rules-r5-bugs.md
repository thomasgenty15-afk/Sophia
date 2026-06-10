# 2026-06-09 - update_coach_preferences field rules r5 - Bug Sheet

Run: `update-coach-preferences-field-rules-r5`

Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-09-update-coach-preferences-field-rules-r5.md`

## Bugs

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptôme visible | Preuve système | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `UCP-R5-B01` | T1 | `BF-INTAKE-05` | `update_coach_preferences` local dispatcher/reducer | Admission write malgré mapping partiel / `unsupported_parts` non vide | Sophia confirme un réglage global “pour la suite” alors que le user demandait “quand je bloque” | T1 `flow_action=write_preferences`, `write_committed=true`, `preference_keys=[coach.tone, coach.question_tendency]`, mais `conversation_context.unsupported_parts=["application uniquement en cas de blocage"]` | Si une condition de portée non supportée est détectée, ne pas écrire directement. Produire `propose_supported_mapping` ou demander confirmation avant write. | open | n/a | Positif: “sois plus direct quand je bloque” -> no write + mapping proposé. Confirmation: “oui applique globalement” -> write. Anti-faux-positif: “sois plus direct pour la suite” -> write direct. Integration locale `/test-send-message force_full_ai=true`. |

## Historique

| Date | Bug id | Événement | Statut | Artefact |
| --- | --- | --- | --- | --- |
| 2026-06-09 | `UCP-R5-B01` | Observé en run réel local, T1 | open | `tests/real-personas/qa-skill/runs/operations/2026-06-09-update-coach-preferences-field-rules-r5.summary.json` |
