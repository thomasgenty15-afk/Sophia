# Run Bug Sheet - defense-report-1780340000-1780339929089

## Metadata

- Date: 2026-06-01
- Run report: conversation report delivered in thread
- Run id: `defense-report-1780340000-1780339929089`
- Persona / scenario: three temporary QA personas for `prepare_defense_card` handoff
- Verdict run: `red`
- Validite QA: valid local IA run, but functionally failing
- Agent owner: `prepare_defense_card` / routing runtime

## Synthese

- Familles dominantes: `BF-EFFECT-04`, `BF-ROUTE-01`, `BF-STATE-03`
- Bug le plus bloquant: clear defense-card requests still fail before producing a platform handoff draft
- Fix architectural prioritaire: make `prepare_defense_card` intake and handoff generation robust in full-AI runtime, then preserve active handoff state before product/help arbitration can hijack follow-ups
- Rerun requis: yes, full 3-run local QA with `force_full_ai=true`

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `DEFENSE-HANDOFF-B01` | R1-T1, R2-T1, R3-T2 | `BF-EFFECT-04` | `prepare_defense_card` | structured intake / technical fallback | Sophia repond "Je n'arrive pas a preparer cette carte proprement" sur une demande defense claire | `response_owner=tool_skill`, `selected_handler=prepare_defense_card`, `tool_execution=failed`, `reason_code=structured_intake_failed`, no DB write | Intake must return a clarification or no-mutation handoff draft, never a generic technical failure for valid defense-card requests | `fixed` | JSON repair in `slot_filler.ts` / `ai_intake.ts`; request id propagated in `router.ts`; 90 targeted tests green | positive full-AI handoff, ambiguity clarification, no-create constraint, no technical fallback |
| `DEFENSE-HANDOFF-B02` | R2-T2, R3-T1 | `BF-ROUTE-01` | dispatcher / turn intent arbitrator | product/help priority over defense-card skill | Product help answers instead of `prepare_defense_card` handling the active or explicit handoff request | R2-T2 `response_owner=product_help`; R3-T1 `response_owner=product_help`, `route_reason=central_arbitrator_product_help_priority` | Explicit defense-card preparation and in-handoff navigation must route to `tool_skill/prepare_defense_card` before product help | `fixed` | `activeDefenseCardHandoff` + `rewriteForActiveDefenseCardHandoff`; tests for "ou je la mets ?" and reminder escape | "prepare une carte de defense" paraphrases beat product_help; "ou je la mets ?" inside handoff stays with skill; anti-FP generic product navigation remains product_help |
| `DEFENSE-HANDOFF-B03` | R3-T2, R3-T3 | `BF-STATE-03` | `prepare_defense_card` reducer / local state | active handoff lifecycle | "Rends-la plus douce" and "redis-moi" cannot revise/repeat because no draft state was established | R3-T2 `tool_execution=failed`; R3-T3 `status=ask_question`, missing attachment/risk/trigger instead of `repeat_handoff` | Once a handoff draft exists, follow-ups must use active handoff state for `revise_handoff` and `repeat_handoff`; failed starts must not leave ambiguous pseudo-state | `fixed` | Existing active handoff tests still green; routing continuation test added; 90 targeted tests green | revise_handoff regenerates draft; repeat_handoff repeats draft; "redis-moi" inside handoff not status_recap |
| `DEFENSE-HANDOFF-B04` | R1-T2 | `BF-INTAKE-01` | `prepare_defense_card` intake / slot filler | readiness gate | User gives the risk moment, but Sophia asks for an extra choice instead of progressing toward a platform handoff | R1-T2 `status=ask_question`, `missing_slots=["risk_situation"]` despite extracted risk description in `known_slots.risk_situation` | If risk and protected action are extracted, move to response-hint clarification or handoff draft with `missing_decisions`, not the same risk slot | `fixed` | `requiredMissingSlots` accepts risk description text; test `risk text is in description only` added | slot already extracted is not re-asked; missing decisions are represented in handoff draft |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-01 | Keep the run red despite no DB mutation regression | The core acceptance criterion is handoff generation, not only absence of writes | QA | `defense-report-1780340000-1780339929089` |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-01 | all | Three local `/functions/v1/test-send-message` runs, `force_full_ai=true`, temporary QA users | `red` | `defense-report-1780340000-1780339929089` |
| 2026-06-01 | all | Unit/integration targeted tests after fix | `fixed`, not QA-verified yet | `/usr/local/bin/deno test --allow-env --allow-net --allow-read prepare_defense_card/tests.ts turn_intent_arbitrator.test.ts operation_runtime_pipeline_test.ts` |
