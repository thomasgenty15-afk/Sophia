# 2026-06-09 - update_coach_preferences local write r4 - Bug Sheet

Run: `update-coach-preferences-local-write-r4`

Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-09-update-coach-preferences-local-write-r4.md`

## Bugs

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptôme visible | Preuve système | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `UCP-R4-B01` | T2-T3 | `BF-ROUTE-03` | Global dispatcher / `flow_opportunity_verification` / `status_recap` arbitration | Priorisation status explicite vs opportunity | Sophia demande “On regarde ça ensemble ?” au lieu de donner directement les préférences actives | T2 `selected_handler=flow_opportunity_verification`, `route_reason=status_recap_request_blocks_tool_start`; T3 seulement route `status_recap` après confirmation | Une demande explicite de recap des préférences actives doit router directement vers `status_recap`; `flow_opportunity_verification` ne doit intervenir que pour opportunités non explicites | open | n/a | Positif: “quelles sont mes préférences coach actives ?” -> `status_recap` direct. Paraphrase: “tu as quoi comme réglages coach sur moi ?”. Anti-faux-positif: “tu pourrais m’aider à savoir si mes préférences me conviennent ?” peut rester opportunity. Integration locale `force_full_ai=true`. |
| `UCP-R4-B02` | T4 | `BF-STATE-01` | `update_coach_preferences` local reducer / visible task | Continuation `unsupported_preference` sans mapping | Sophia refuse le stockage, mais termine par une question de confirmation inutile | T4 `flow_action=unsupported_preference`, `visible_task_kind=unsupported_preference`, `write_attempted=false`, `committed_effects=[]`, visible finit par “Souhaitez-vous...” | Pour unsupported sans mapping confirmé, produire une réponse locale courte, no write, no confirmation question, et fermer localement (`stop_local_no_handoff` ou état done) | open | n/a | Positif: “ne termine jamais par une question” -> unsupported no write, pas de question de confirmation. Paraphrase: “plus jamais de question finale”. Anti-faux-positif: “pose-moi moins de questions” -> write supported. Integration locale `force_full_ai=true`. |

## Historique

| Date | Bug id | Événement | Statut | Artefact |
| --- | --- | --- | --- | --- |
| 2026-06-09 | `UCP-R4-B01` | Observé en run réel local, T2-T3 | open | `tests/real-personas/qa-skill/runs/operations/2026-06-09-update-coach-preferences-local-write-r4.summary.json` |
| 2026-06-09 | `UCP-R4-B02` | Observé en run réel local, T4 | open | `tests/real-personas/qa-skill/runs/operations/2026-06-09-update-coach-preferences-local-write-r4.summary.json` |
