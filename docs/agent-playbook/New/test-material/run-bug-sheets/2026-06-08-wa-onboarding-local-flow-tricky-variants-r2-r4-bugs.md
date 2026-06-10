# Bug Sheet - WhatsApp Onboarding Local Flow Tricky Variants R2-R4

## R2R4-B01

- Bug id: `R2R4-B01`
- Tours: variante R3
- Famille: `BF-AGENDA-02` - Interruption explicite mal restauree
- Domaine owner: WhatsApp onboarding local flow + global dispatcher handoff
- Source amont: `frustration_exit_after_plan_ready` / `exit_to_global_dispatcher` contract, exit memo, global handoff context
- Symptome visible: le user dit que les questions le saoulent et demande de laisser tomber; Sophia repond qu'elle coupe les questions, puis pose immediatement une nouvelle question a double option.
- Preuve systeme:
  - local flow: `reason_code=whatsapp_onboarding_local_exit_to_global_dispatcher`
  - visible task local: `frustration_exit_after_plan_ready`
  - `__whatsapp_onboarding_done.source=deferred_after_plan_ready`
  - `__last_whatsapp_onboarding_exit_memo.reason=frustration`
  - `handoff_hint_for_global_dispatcher=null`
  - `handoff_justification_for_global_dispatcher=null`
  - `user_plan_item_entries=[]`
- Correction attendue:
  - Exiger un `handoff_hint_for_global_dispatcher` et une `handoff_justification_for_global_dispatcher` non vides pour `frustration_exit_after_plan_ready` et `exit_to_global_dispatcher`.
  - Si le dispatcher local ne les fournit pas, retry/validation contractuelle ou synthese structurelle depuis `exit_reason`, `visible_task`, `evidence` et l'etat plan, sans regex metier.
  - Le global dispatcher/visible response doit recevoir un signal explicite: le user refuse les questions; repondre court, reconnaitre la friction, ne pas relancer par une question multiple.
- Statut: `open`
- Fix reference: a creer
- Rerun evidence:
  - 2026-06-08, run `20260608_wa_onboarding_local_flow_r5_frustration_after_plan_fixed`.
  - Tests unitaires ciblés: 11 passed.
  - Run reel webhook: bug toujours reproduit.
  - Preuve: `handoff_hint_for_global_dispatcher=null`, `handoff_justification_for_global_dispatcher=null`, `note_information observed=null`, trace globale `flow_exit_context=null`, réponse visible avec question A/B.
- Tests requis:
  - positif: plan actif + refus de questions -> exit local, memo hint/justification non vides, no progress entry.
  - UX: reponse globale sans question multiple apres "tes questions me saoulent".
  - anti-faux-positif: plan missing + meme refus -> no exit global, state `awaiting_plan_finalization`.
  - integration: webhook WhatsApp local avec transport loopback, verification `user_plan_item_entries=[]`.
