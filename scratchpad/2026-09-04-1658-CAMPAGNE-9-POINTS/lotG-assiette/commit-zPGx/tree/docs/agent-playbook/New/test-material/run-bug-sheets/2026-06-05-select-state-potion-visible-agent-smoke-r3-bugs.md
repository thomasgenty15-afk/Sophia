# Run Bug Sheet - select-state-potion-visible-agent-smoke-r3

## Metadata

- Date: 2026-06-05
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-05-select-state-potion-visible-agent-smoke-r3.md`
- Run id: `select-state-potion-visible-agent-smoke-r3`
- Persona / scenario: `qa-skill` / select state potion visible agent smoke
- Verdict run: yellow
- Validite QA: valid real IA local smoke, `force_full_ai=true`, temporary local connection cleaned
- Agent owner: Codex

## Synthese

- Famille dominante: `BF-TEST-01`
- Bug le plus bloquant: trace `reason_code=normal_reply_default` mal alignee avec `response_owner=tool_skill` et `selected_handler=select_state_potion`.
- Fix architectural prioritaire: corriger la projection de trace/reason code depuis la decision runtime structuree.
- Rerun requis: yes, same entry smoke after trace mapping fix.

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `R3-B01` | T1 | `BF-TEST-01` | Router / trace mapping / operation runtime response handler | Reason code projection after tool skill selection | Aucun symptome visible; Sophia repond correctement. | `response_owner=tool_skill`, `selected_handler=select_state_potion`, mais `reason_code=normal_reply_default`. | Propager un reason code coherent avec l'owner tool skill, par exemple `skill_entry_signal` ou `orientation_clarification_resolved_tool_skill`, sans modifier le message visible. | `open` |  | Positif: entree "je veux une potion mais je ne sais pas laquelle" -> `select_state_potion` avec reason code non default. Anti-FP: normal reply hors skill conserve `normal_reply_default`. Integration: `/test-send-message force_full_ai=true`. |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-05 | Ne pas traiter les emojis comme bug. | Le produit veut conserver les emojis dans Sophia. | Product / QA | Current conversation |
| 2026-06-05 | Ne pas corriger le reason code dans le visible agent. | Le bug est une incoherence de trace runtime, pas une erreur de formulation visible. | Runtime / QA | Report `2026-06-05-select-state-potion-visible-agent-smoke-r3.md` |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-05 | `R3-B01` | Smoke IA reel local `force_full_ai=true`. | Open: visible/routing OK, reason code encore incoherent. | `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-05-select-state-potion-visible-agent-smoke-r3.md` |
