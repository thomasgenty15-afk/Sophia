# Run Bug Sheet - 2026-06-08-weekly-local-dispatcher-r2

- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-08-weekly-local-dispatcher-r2.md`
- Raw: `tests/real-personas/rose/runs/weekly/2026-06-08-weekly-local-dispatcher-weekly-local-dispatcher-r2.raw.json`
- Summary: `tests/real-personas/rose/runs/weekly/2026-06-08-weekly-local-dispatcher-weekly-local-dispatcher-r2.summary.json`
- Cleanup: `tests/real-personas/rose/runs/weekly/2026-06-08-weekly-local-dispatcher-weekly-local-dispatcher-r2.cleanup.json`
- Validité QA: run IA réel local, `force_full_ai=true`; voir rapport source.

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `R2-B01` | T4 | `BF-ROUTE-03` | dispatcher global / `prepare_attack_card` admission | arbitrage post-active-flow weekly | Demande explicite de carte d'attaque traitée en réponse libre | `response_owner=normal_reply`, `selected_handler=null`, `route_reason=normal_reply_default`, `operation=null` | Sortie weekly avec memo puis routing vers `prepare_attack_card` tool-skill; pas de génération de carte hors contrat | open |  | Unit invariant dispatcher + QA réel paraphrase "carte d'attaque" après weekly handoff |
| `R2-B02` | Incident hors tour | `BF-TEST-01` | QA harness / persona isolation / trace side effects | snapshot DB incomplet et persona Rose avec pending/unprocessed préexistants | Mutation DB observée sans trace de commit visible | `direct_effects=[]`, `committed_effects=[]`, entry temporaire observée pendant le run, occurrence `14fdee14-ccb0-47b9-a5ce-5693a657b97b` `updated_at=2026-06-08T15:56:34.732+00:00` après cleanup | Utiliser connexion temporaire ou snapshotter/restaurer tables daily/proactive exactes; reporter toute mutation durable hors scope | open |  | QA harness invariant: no rows changed outside run scope, or explicit diff/restoration report |
