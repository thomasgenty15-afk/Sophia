# Bugs - Recurring Handoff Anti-Patching R1

## Run Metadata

- Run id: `recurring-handoff-antipatch-20260602-r1`
- Date: 2026-06-02
- Persona / scenario: user QA temporaire local, flow rappel recurrent handoff apres retrait des fallbacks regex.
- Validite QA: valide, IA reelle locale, `/functions/v1/test-send-message`, `force_full_ai=true`, cleanup cible effectue.
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-02-recurring-handoff-antipatch-r1.md`

## Bugs

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `RHA-R1-B01` | T4 | `BF-STATE-01` | `create_recurring_reminder` handoff | clarification/action reducer du handoff actif | "Ok programme-le" reste non-mutant mais repond par une alternative one-shot/etapes au lieu de rendre directement l'apply_attempt plateforme | `selected_handler=create_recurring_reminder`, `route_reason=same_operation_signal_continues_active_handoff`, `executed_tools=[]`, `direct_effects=[]`, handoff state `status=clarifying` | Selectionner `apply_attempt` via sortie structuree dispatcher/clarification, puis renderer la destination Rappels sans mutation; pas de regex locale | `open` |  | positif `ok programme-le`; paraphrase `vas-y mets-le en place`; anti-FP `non juste demain` sort one-shot; invariant recurring `executed_tools=[]`, `committed_effects=[]`, destination Rappels |

## Decisions / Notes

| Date | Sujet | Decision | Reference |
| --- | --- | --- | --- |
| 2026-06-02 | Anti-patching | Ne pas corriger T4 par regex locale sur "programme-le"; owner attendu: contrat structure handoff clarification / dispatcher. | Charte anti-patching commandement 0 |

## Verification

| Date | Item | Resultat | Preuve |
| --- | --- | --- | --- |
| 2026-06-02 | No recurring DB write | verified green | `user_recurring_reminders=[]` avant cleanup |
| 2026-06-02 | Revision handoff active | verified green | T3 `tool_skill_intents=["create_recurring_reminder"]`, `route_reason=same_operation_signal_continues_active_handoff`, `executed_tools=[]` |
| 2026-06-02 | One-shot explicit exit | verified green | T5 `selected_handler=create_one_shot_reminder`, `executed_tools=["create_one_shot_reminder"]` |
