# Run Bug Sheet - 2026-06-08-status-recap-local-dispatcher-r1

- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-08-status-recap-local-dispatcher-r1.md`
- Raw: `tests/real-personas/qa-skill/runs/status_recap/2026-06-08-status-recap-local-dispatcher-r1.raw.json`
- Validite QA: voir rapport source.

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `R1-B01` | T1 | `BF-ROUTE-01 / BF-STATUS-01 — owner status_recap attendu` | status_recap/router | local dispatcher admission | Tour non-green | selected_handler=null, operation={"status":null,"reason_code":null,"flow_action":null,"status_intent":null,"visible_task":null,"projection_used":null,"toolExecution":"none"} | Corriger signal/admission structuree, pas wording | open |  | QA reel rerun + unit invariant |
| `R1-B02` | T2 | `BF-ROUTE-01 / BF-STATUS-01 — owner status_recap attendu` | status_recap/router | local dispatcher admission | Tour non-green | selected_handler=null, operation={"status":null,"reason_code":null,"flow_action":null,"status_intent":null,"visible_task":null,"projection_used":null,"toolExecution":"none"} | Corriger signal/admission structuree, pas wording | open |  | QA reel rerun + unit invariant |
| `R1-B03` | T3 | `BF-ROUTE-01 / BF-STATUS-01 — owner status_recap attendu` | status_recap/router | local dispatcher admission | Tour non-green | selected_handler=product_help, operation={"status":null,"reason_code":null,"flow_action":null,"status_intent":null,"visible_task":null,"projection_used":null,"toolExecution":"none"} | Corriger signal/admission structuree, pas wording | open |  | QA reel rerun + unit invariant |
| `R1-B04` | T4 | `BF-ROUTE-03 — sortie product/status/tool a verifier` | status_recap/router | local dispatcher admission | Tour non-green | selected_handler=null, operation={"status":null,"reason_code":null,"flow_action":null,"status_intent":null,"visible_task":null,"projection_used":null,"toolExecution":null} | Corriger signal/admission structuree, pas wording | open |  | QA reel rerun + unit invariant |
