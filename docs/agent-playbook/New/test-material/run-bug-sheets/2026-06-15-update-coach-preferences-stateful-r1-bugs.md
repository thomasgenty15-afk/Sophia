# 2026-06-15 - Update Coach Preferences Stateful R1 Bugs

Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-15-update-coach-preferences-stateful-r1.md`

| Date | Bug id | Tours | Famille | Domaine owner | Source amont | Symptôme visible | Preuve système | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-06-15 | R1-B01 | T3 | `BF-STATE-01` | `update_coach_preferences` | reducer local / merge server-owned state | Sophia explique correctement l'unsupported, mais finit par une question malgré la demande portant sur l'absence de question finale | `state_mutation_audit.rejected_changes=[{"field":"unsupported_parts","reason_code":"invalid_status_transition"}]`, no write, `diagnosis.constraints=["ne jamais terminer ses réponses par une question"]` | Autoriser la transition unsupported à conserver `unsupported_parts` sans write et transmettre une contrainte ponctuelle filtrée au visible prompt | open |  | Positif: unsupported no-write avec `unsupported_parts` conservé; anti-FP: clarification ambiguë ne remplace pas un pending; intégration: unsupported -> correction supportée écrit seulement les clés supportées |
