# Run Bug Sheet - product_help_retest_20260622_r1

## Metadata

- Date: 2026-06-22
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-22-product-help-retest-r1.md`
- Run id: `product_help_retest_20260622_r1`
- Persona / scenario: Product Help retest local
- Verdict run: yellow
- Validite QA: valide
- Agent owner: Sophia Brain runtime / final response pipeline

## Synthese

- Familles dominantes: `BF-LEDGER-02`, `BF-TEST-01`
- Bug le plus bloquant: confirmation visible du one-shot reminder dupliquee apres commit transverse.
- Fix architectural prioritaire: dedup de confirmation de direct effect entre `operationRuntime.content` et visible skill local.
- Rerun requis: oui, mini-run multi-intent Product Help + reminder.

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `PH-RETEST-R1-B01` | T3 | `BF-LEDGER-02` | final response / direct effect visible merge | merge `operationRuntime.content` + coaching visible reply | Le rappel est confirme deux fois dans le meme message. | `tool_skill_run.status=success`, `committed_effects[0].id=85ed82df-97b2-47b2-a5f1-83ff90f4ec6e`; visible contient deux confirmations "programmé/noté". | Si un direct effect committe a deja une confirmation visible runtime, le visible skill traite seulement le besoin restant ou le merge deduplique la confirmation. | `open` |  | test multi-intent product_help+reminder; skill actif+reminder; anti-FP sans reminder. |
| `PH-RETEST-R1-B02` | T3 / post-run | `BF-TEST-01` | effect ledger trace / observability | trace courte ledger | `effect_ledger.counts.committed=0` alors que `tool_skill_run.committed_effects` et DB prouvent le commit. | T3 summary + DB scheduled_checkins pending id identique. | Aligner la trace ledger avec les committed effects, ou documenter le champ canonique si `tool_skill_run` remplace le ledger court. | `open` |  | smoke direct effect commit -> effect ledger non nul ou contrat trace documente. |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-22 | Verdict yellow malgre fix principal valide. | Les invariants fonctionnels sont bons, mais le rendu visible et la trace ledger restent imparfaits. | Sophia Brain runtime | `2026-06-22-product-help-retest-r1.md` |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-22 | `PH-RETEST-R1-B01` | Run local T3 | Failed / open | `product_help_retest_20260622_r1.t03.summary.json` |
| 2026-06-22 | `PH-RETEST-R1-B02` | Run local T3 + DB snapshot | Failed / open | `product_help_retest_20260622_r1.reminders_after_t06.json` |
