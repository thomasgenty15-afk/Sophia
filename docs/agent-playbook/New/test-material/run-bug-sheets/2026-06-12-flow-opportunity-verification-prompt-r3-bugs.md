# Bug Sheet - Flow Opportunity Verification Prompt R3

Run exploitable: `flow-opportunity-verification-prompt-r3c-20260612`

Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-12-flow-opportunity-verification-prompt-r3.md`

## Bugs

### R3-B01

- Tours: 2
- Famille: `BF-STATE-02` - Pending confirmation cible perdue
- Domaine owner: `flow_opportunity_verification`
- Source amont: dispatcher local / regle d'acceptation de `handoff_to_local_flow`
- Symptome visible: le user demande seulement "confirme-moi juste" que le recap sera read-only ; Sophia confirme puis execute le recap dans le meme tour.
- Preuve systeme: tour 2 selectionne `status_recap`, `selected_action=answer_object_status`, et `flow_opportunity_state=null` apres le tour. La note de handoff est canonique, donc le probleme n'est pas le format de `note_information`.
- Correction attendue: distinguer contrainte ou question pre-confirmation d'une acceptation explicite. Les formulations "confirme-moi juste", "avant de dire oui", "sans lancer encore" doivent rester dans le flow parent ou passer par un inline product/status roundtrip sans nettoyer l'ancre.
- Statut: `verified`
- Fix reference: `supabase/functions/sophia-brain/skills/flow_opportunity_verification/prompt.ts` ajoute une regle pre-acceptation explicite; `supabase/functions/sophia-brain/skills/flow_opportunity_verification/flow_opportunity_verification_test.ts` ajoute les assertions prompt/user-prompt.
- Tests requis: `deno test --no-check supabase/functions/sophia-brain/skills/flow_opportunity_verification/flow_opportunity_verification_test.ts`; `deno check supabase/functions/sophia-brain/skills/flow_opportunity_verification/prompt.ts supabase/functions/sophia-brain/skills/flow_opportunity_verification/reducer.ts supabase/functions/sophia-brain/skills/flow_opportunity_verification/flow_opportunity_verification_test.ts`; rerun IA reel `flow-opportunity-verification-prompt-r5b-20260612`.
- Verification: tour 2 du run `flow-opportunity-verification-prompt-r5b-20260612` selectionne `flow_opportunity_verification`, `selected_action=repeat_current_state`, `global_dispatcher_skipped_due_active_flow=true`, `flow_opportunity_state.status=waiting_confirmation`, aucun write ni handoff. Le tour 3 accepte explicitement et handoff vers `update_coach_preferences` avec note canonique et sans mutation avant confirmation.
