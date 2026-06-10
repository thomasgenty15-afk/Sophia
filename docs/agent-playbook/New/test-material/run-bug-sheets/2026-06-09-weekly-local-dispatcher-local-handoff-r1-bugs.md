# Weekly Local Dispatcher Local Handoff R1 Bugs

| ID | Tours | Famille | Owner | Source amont | Symptome | Preuve | Correction attendue | Statut | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `WLD-R1-B01` | Pre-run | `BF-TEST-01` | QA harness / Supabase local | Edge Runtime local arrete | Run IA reel impossible avant le premier message | `supabase status --output json` liste `supabase_edge_runtime_Sophia_2` dans les services arretes | Remettre Supabase local en etat hors run QA, puis relancer via `/functions/v1/test-send-message` avec `force_full_ai=true` | open | Real QA: weekly actif -> demande carte -> trace `handoff_to_local_flow`, `note_information_present=true`, `selected_handler=prepare_attack_card`, global normal non appele |

## Historique

| Date | Element | Etat |
| --- | --- | --- |
| 2026-06-09 | Rapport invalide | `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-09-weekly-local-dispatcher-local-handoff-r1-invalid.md` |
