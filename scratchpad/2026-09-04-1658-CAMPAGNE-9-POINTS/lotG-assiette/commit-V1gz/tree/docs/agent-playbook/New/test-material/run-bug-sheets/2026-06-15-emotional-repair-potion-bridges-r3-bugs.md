# Run Bug Sheet — Emotional Repair Potion Bridges R3

## R3-B01 — Direct Potion d'amour request blocked

- Tours: amour T2-T3
- Famille: `BF-STATE-01` — mauvaise transition de flow
- Domaine owner: `emotional_repair`
- Source amont: local dispatcher / reducer bridge contract for direct potion requests
- Symptome visible: l'utilisateur demande explicitement la Potion d'amour, mais Sophia reste en soutien emotionnel et pose une clarification.
- Preuve systeme:
  - T2: `flow_action=confirm_potion_bridge`, `visible_task=ask_gentle_clarification`
  - T2/T3: `reason_code=emotional_repair_potion_bridge_blocked`
  - T2/T3: `blocked_effects=[{type:"select_state_potion", reason_code:"missing_previous_potion_offer"}]`
  - `select_state_potion.amour` jamais active.
- Correction attendue:
  - Exposer dans la trace courte les champs de decision structurée utiles: `potion_bridge.user_requested_direct_handoff`, `selected_potion`, `durable_need.kind`, `candidate_potions`.
  - Corriger le contrat dispatcher pour que la demande directe `amour` produise un handoff direct complet, comme `guerison` et `apaisement`.
  - Garder le reducer strict: pas de bridge si le dispatcher ne fournit pas le contrat direct complet.
- Statut: `open`
- Fix reference: a faire
- Tests requis:
  - Positif: demande directe `Potion d'amour` sans offre precedente -> `handoff_to_select_state_potion`.
  - Paraphrase: "je veux continuer avec la potion d'amour maintenant" -> handoff.
  - Anti-faux-positif: mention de la Potion d'amour sans demande d'activation -> pas de handoff.
  - Integration QA: rerun full AI amour.

## R3-B02 — Direct guerison bridge verified

- Tours: guerison T2-T3
- Famille: `BF-STATE-01`
- Domaine owner: `emotional_repair` + `select_state_potion.guerison`
- Source amont: local dispatcher direct potion bridge contract
- Symptome visible: ancien bug r2 corrige; la demande directe de Potion de guerison bridge maintenant.
- Preuve systeme:
  - T2: `flow_action=confirm_potion_bridge`, `visible_task=potion_bridge_handoff`, `status=handoff`
  - T3: `selected_handler=select_state_potion.guerison`, `status=handoff_delivered`
- Correction attendue: aucune sur cette branche.
- Statut: `verified`
- Fix reference: emotional repair direct potion bridge contract update, verified by r3
- Tests requis: garder le test direct request guerison.

## R3-B03 — Direct apaisement bridge verified

- Tours: apaisement T2-T5
- Famille: `BF-STATE-01`
- Domaine owner: `emotional_repair` + `select_state_potion.apaisement`
- Source amont: local dispatcher direct potion bridge contract
- Symptome visible: ancien bug r2 corrige; la demande directe de Potion d'apaisement bridge maintenant, puis le sous-flow potion livre.
- Preuve systeme:
  - T2: `flow_action=confirm_potion_bridge`, `visible_task=potion_bridge_handoff`, `status=handoff`
  - T3-T5: `selected_handler=select_state_potion.apaisement`
  - T5: `status=handoff_delivered`
- Correction attendue: aucune sur cette branche.
- Statut: `verified`
- Fix reference: emotional repair direct potion bridge contract update, verified by r3
- Tests requis: garder le test direct request apaisement.
