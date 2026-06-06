# Run Bug Sheet - select-state-potion-arch-r1

## Metadata

- Date: 2026-06-04
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-04-select-state-potion-arch-r1.md`
- Run id: `select-state-potion-arch-r1`
- Persona / scenario: `qa-skill` / `select_state_potion` architecture, three increasing difficulty tests
- Verdict run: red
- Validite QA: N.1 and N.2 valid real IA runs; N.3 red technical after three HTTP 502 attempts
- Agent owner: Codex

## Synthese

- Familles dominantes: `BF-PREF-01`, `BF-INTAKE-04`, `BF-INTAKE-02`, `BF-STATE-01`, `BF-TEST-01`
- Bug le plus bloquant: N.3 repeated HTTP 502 blocks the complete requested three-test suite.
- Fix architectural prioritaire: finish stage-specific visible prompting and local flow action contracts, then investigate local test endpoint/upstream failures.
- Rerun requis: yes, full three-level rerun with `force_full_ai=true`.

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `R1-B01` | N.1 T1-T4, N.2 T1-T3 | `BF-PREF-01` | `select_state_potion` renderer | Stage-specific visible prompt / final renderer policy | Emojis/smileys in handoff, destination, revision, apply attempt; visible handoff still template-heavy. | Responses end with emoji or `:)`; traces otherwise valid `tool_skill` no-mutation. | Enforce no-emoji, non-template rendering for all stages while preserving required fields, path and no-mutation rules. | `open` |  | Positive stage tests + paraphrases + anti-FP where emojis remain allowed outside this operation if policy permits. |
| `R1-B02` | N.2 T1 | `BF-INTAKE-04` | Potion router / clarification renderer | Clarification task chooses product-name prompt instead of need-disambiguation prompt. | Sophia asks "Laquelle de ces deux potions..." instead of distinguishing pressure to calm vs rhythm to recover. | `operation_flow_run.status=clarifying`, candidates effectively correct, no draft committed. | Clarification contract should output a need-based visible task; visible renderer asks one natural question and does not list product names when need framing is enough. | `open` |  | Positive apaisement-vs-anti-decrochage; paraphrase with tendu/decourage; anti-FP where user explicitly asks list of potion names. |
| `R1-B03` | N.2 T3 | `BF-INTAKE-02` | Detail subskill `apaisement` / field reducer | Field extraction sufficiency gate for `pressure_source` and enum projection. | Platform field source becomes "la pression"; visible summary leaks `a_cran`; labels contain rough text. | Draft answers: `pressure_source=la pression`, `pressure_state.option_value=a_cran`; `user_state_summary=la pression ; a_cran`. | Keep vague source as candidate or ask targeted clarification; never expose enum/internal codes in visible summary; normalize field labels from canonical product copy. | `open` |  | Positive apaisement complete; vague-source clarification; anti-FP where user gives explicit source. |
| `R1-B04` | N.1 T3, N.2 T2-T3 | `BF-STATE-01` | Local flow dispatcher / active handoff arbitration | Local action taxonomy and route_reason mapping. | Revision works but field label changes; clarification answer traced as field confirmation; final handoff traced after `turn_unclear`. | `route_reason=active_handoff_field_confirmation` for routing answer; `route_reason=active_handoff_turn_unclear` while handoff delivered; revision value updated but label drifted. | Add explicit local actions and reducer transitions: `routing_clarification_answer`, `field_answer`, `field_confirmation`, `revise_collected_field`, `apply_attempt`; preserve canonical field identity on revision. | `open` |  | Contract unit tests for each local action + reducer transition tests + real IA revise-field rerun. |
| `R1-B05` | N.3 T1 attempts 1-3 | `BF-TEST-01` | Local endpoint / upstream AI gateway / test-send-message runtime | Upstream response handling for real IA test path. | Empty Sophia response, HTTP 502, "An invalid response was received from the upstream server". | Three separate QA connections return status 502 with null owner/handler/route; no operation_flow_run. | Investigate local function logs/upstream gateway, then rerun without deterministic fallback. | `open` |  | Reproduce with same three N.3 prompts; verify HTTP 200, trace present, no fallback, no durable mutation. |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-04 | Classer le run global en red malgre N.1/N.2 exploitables. | Le cadre demande trois tests; le troisieme reste invalide apres trois tentatives raisonnables. | QA | `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-04-select-state-potion-arch-r1.md` |
| 2026-06-04 | Ne pas proposer de patch regex ou phrase exacte. | Les corrections doivent rester IA prompt/JSON/reducer/state machine, conformes anti-patching. | Sophia Brain | `docs/agent-playbook/New/contract-prompts/anti-patching-qa-charter.md` |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-04 | all | Real IA local QA, `force_full_ai=true`, no fallback deterministic. | N.1/N.2 valid; N.3 red 502. | `tests/real-personas/qa-skill/runs/emotional_repair/2026-06-04-select-state-potion-arch-*.summary.json` |
