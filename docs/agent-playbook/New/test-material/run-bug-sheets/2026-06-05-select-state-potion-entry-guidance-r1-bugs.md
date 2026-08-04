# Run Bug Sheet - select-state-potion-entry-guidance-r1

## Metadata

- Date: 2026-06-05
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-05-select-state-potion-entry-guidance-r1.md`
- Run id: `select-state-potion-entry-guidance-r1`
- Persona / scenario: `qa-skill` / potion entry guidance, three increasing difficulty runs
- Verdict run: yellow
- Validite QA: valid real IA local runs, `force_full_ai=true`
- Agent owner: Codex

## Synthese

- Familles dominantes: `BF-ROUTE-01`, `BF-INTAKE-04`, `BF-STATE-01`
- Bug le plus bloquant: explicit "je veux une potion" enters `orientation_clarification` before `select_state_potion`.
- Fix architectural prioritaire: route the potion world directly to `select_state_potion`, then split potion selection from potion detail.
- Rerun requis: yes, same three entry guidance runs.

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `R1-B01` | N.1 T1, N.2 T1, N.3 T1 | `BF-ROUTE-01` | Global dispatcher / orientation clarification | Route policy for explicit potion-world requests | Sophia asks whether the user wants a potion or emotional support although the user already said they want a potion. | `response_owner=orientation_clarification`, `selected_handler=orientation_clarification`, `route_reason=clarification_required`. | Route explicit "je veux une potion" to `tool_skill/select_state_potion`; let the local potion router handle unknown potion type. | `open` |  | Positive: three "je veux une potion mais je ne sais pas laquelle" variants. Anti-FP: pure emotional support without potion should remain conversation support. |
| `R1-B02` | N.1 T2, N.2 T2, N.3 T2 | `BF-INTAKE-04` | `select_state_potion` potion router / visible clarification prompt | Clarification task renders product-name choice instead of need-based question. | "Potion d'apaisement ou Potion anti-décrochage", "Potion de courage ou Potion d'apaisement", "Potion de guérison ou Potion d'amour". | Correct handler and candidates, but visible question lists product names. | Keep candidates in JSON but ask one natural need-disambiguation question. | `open` |  | Positive pairwise tests for apaisement/anti-decrochage, courage/apaisement, guerison/amour; anti-FP where user explicitly asks for product-name options. |
| `R1-B03` | N.1 T3-T5, N.2 T3-T5, N.3 T3-T4 | `BF-STATE-01` | `select_state_potion` local flow / reducer | Missing explicit `potion_selected` stage before detail intake and handoff. | Sophia collects detail fields and only later announces the potion. | Final drafts have correct `potion_type`, but intermediate route reasons are `active_handoff_field_confirmation`; final status is `handoff_delivered`. | Add explicit stage/action `potion_selected` and delegate to potion detail subskill; do not start detail collection before selection handoff. | `open` |  | Reducer transition tests + real IA entry runs asserting selection stage before detail. |
| `R1-B04` | N.1 T3-T5, N.2 T3-T5, N.3 T3-T4 | `BF-STATE-01` | Active handoff arbitration trace | Local action labels too broad. | Field answers, confirmations and detail questions all trace as `active_handoff_field_confirmation`. | `route_reason=active_handoff_field_confirmation` across different user intents. | Split local flow actions into `routing_clarification_answer`, `field_answer`, `field_confirmation`, `potion_selected`, `delegate_to_detail`. | `open` |  | Contract tests for trace/action mapping, plus integration run traces. |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-05 | Emojis are not bugs in this run. | User explicitly wants emojis kept. | Product / QA | Current conversation |
| 2026-06-05 | Judge this run only on entry guidance and potion identification. | User requested to stop once the potion is identified, before downstream potion detail. | QA | `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-05-select-state-potion-entry-guidance-r1.md` |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-05 | all | Real IA local QA with three temporary connections. | Yellow: correct final potion choices, entry and stage split need fixes. | `tests/real-personas/qa-skill/runs/emotional_repair/2026-06-05-select-state-potion-entry-guidance-*.summary.json` |
