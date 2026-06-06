# Run Bug Sheet - select-state-potion-selection-guidelines-r1

## Metadata

- Date: 2026-06-05
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-05-select-state-potion-selection-guidelines-r1.md`
- Run id: `select-state-potion-selection-guidelines-r1`
- Persona / scenario: `qa-skill` / select state potion selection to identified potion
- Verdict run: yellow
- Validite QA: valid real IA local run, `force_full_ai=true`, temporary local connection cleaned
- Agent owner: Codex

## Synthese

- Famille dominante: `BF-STATE-01`
- Bug le plus bloquant: apres reponse claire a la clarification, le flow identifie visiblement `Potion anti-décrochage` mais trace `active_handoff_turn_unclear` au lieu d'une transition `potion_selected`.
- Fix architectural prioritaire: rendre explicite la transition structuree de selection de potion dans le reducer / state machine.
- Rerun requis: yes, same two-turn entry-to-selection run plus paraphrase and anti-faux-positif.

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `R1-B01` | T2 | `BF-STATE-01` | `select_state_potion` local flow / reducer / reason code mapping | Transition after routing clarification answer | Visible OK: Sophia annonce `Potion anti-décrochage`. Trace KO: le tour reste classe comme unclear. | `response_owner=tool_skill`, `selected_handler=select_state_potion`, `content` contient `Potion anti-décrochage`, mais `reason_code=active_handoff_turn_unclear`. | Emettre une action/stage structure `potion_selected` quand la reponse user suffit a selectionner la potion; propager un reason code coherent. | `open` |  | Positif: ambiguite pression/rythme puis choix rythme -> anti-decrochage + `potion_selected`. Paraphrase: "ne pas abandonner ce que j'avais repris". Anti-FP: choix pression -> apaisement. Integration: `/test-send-message force_full_ai=true`, no DB mutation. |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-05 | Stopper le run a potion identifiee. | La transition aval vers le sous-flow de potion est hors scope demande. | Product / QA | Current conversation |
| 2026-06-05 | Ne pas traiter les emojis comme bug. | Le produit veut conserver les emojis. | Product / QA | Current conversation |
| 2026-06-05 | Ne pas corriger par phrase visible. | La selection visible marche; le bug est une transition runtime mal tracee. | Runtime / QA | Report `2026-06-05-select-state-potion-selection-guidelines-r1.md` |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-05 | `R1-B01` | Run IA reel local en 2 tours, `force_full_ai=true`. | Open: potion selectionnee visiblement, trace encore `active_handoff_turn_unclear`. | `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-05-select-state-potion-selection-guidelines-r1.md` |
