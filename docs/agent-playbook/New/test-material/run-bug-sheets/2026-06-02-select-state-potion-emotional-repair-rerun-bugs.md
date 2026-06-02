# Bug Sheet - select_state_potion x emotional_repair rerun - 2026-06-02

## ER-POT-20260602-B01

- Bug id: `ER-POT-20260602-B01`
- Tours: `qa-potion-emorepair-rerun-20260602-r3` T2-T5
- Famille: `BF-INTAKE-01`
- Domaine owner: `select_state_potion` intake / detail subskill / readiness gate
- Source amont: slots `handoff_readiness`, `detail`, `support_timing` non reconnus malgre demande "recommandation plateforme", "tout de suite", "sans suivi".
- Symptome visible: Sophia redemande plusieurs clarifications au lieu de livrer le handoff complet.
- Preuve systeme: `response_owner=tool_skill`, `selected_handler=select_state_potion`, `tool_execution=platform_handoff`, `executed_tools=[]`; pas de `handoff_delivered` observe sur R3 T2-T5.
- Correction attendue: pour un handoff non-mutant, accepter une recommandation courte avec slots minimaux; reconnaitre "recommandation plateforme" comme handoff_ready et "tout de suite / sans suivi" comme timing/no_followup suffisants.
- Statut: `verified`
- Fix reference: `supabase/functions/sophia-brain/tools/operations/select_state_potion/handoff.ts` ajoute une sortie `state_potion_platform_handoff_minimal_ready` quand l'etat et la potion sont identifies et que l'utilisateur demande une recommandation plateforme courte sans suivi / immediate.
- Tests requis: couverts par `supabase/functions/sophia-brain/tools/operations/select_state_potion/handoff_test.ts`:
  - "platform recommendation with selected potion bypasses extra detail questions"
  - "recent platform recommendation plus immediate timing delivers handoff"
  - anti-regression "apply_attempt does not execute and repeats platform destination"
- Validation locale: `/usr/local/bin/deno test --allow-all supabase/functions/sophia-brain/tools/operations/select_state_potion/tests.ts supabase/functions/sophia-brain/tools/operations/select_state_potion/handoff_test.ts` => `52 passed | 0 failed`.
- Validation reelle: verifiee par `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-02-select-state-potion-blockfix-rerun.md`:
  - `qa-potion-emorepair-blockfix-20260602-r1` T2 livre `state_potion_platform_handoff_minimal_ready`.
  - `qa-potion-emorepair-blockfix-20260602-r2` T2 livre `state_potion_platform_handoff_minimal_ready` apres orientation clarification.
  - `qa-potion-emorepair-blockfix-20260602-r3` T3 livre le handoff apres un seul slot de pression, sans boucle timing.
  - DB: `user_potion_sessions=0`, `user_recurring_reminders=0`, `scheduled_checkins=0`.
