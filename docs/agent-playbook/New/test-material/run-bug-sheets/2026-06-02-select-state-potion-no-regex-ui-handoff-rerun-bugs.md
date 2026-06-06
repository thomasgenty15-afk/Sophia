# Bug Sheet — select_state_potion no-regex UI handoff rerun

- Run: `qa-potion-no-regex-ui-handoff-20260602-r1`
- Date: 2026-06-02
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-02-select-state-potion-no-regex-ui-handoff-rerun.md`
- Verdict global: yellow

## POT-HANDOFF-R1-B01

- Tours: 3, 4
- Famille: BF-STATE-01
- Domaine owner: `select_state_potion` active handoff + dispatcher/turnFrame structured intent
- Source amont: transition active handoff apres handoff livre
- Symptome visible: "Ok vas-y active-la" et "Redis-moi..." restent en `active_handoff_turn_unclear`; Sophia regenere un handoff complet au lieu d'un apply_attempt/repeat dedie.
- Preuve systeme: `response_owner=tool_skill`, `selected_handler=select_state_potion`, `route_reason=active_handoff_turn_unclear`, `executed_tools=[]`, `tool_execution=platform_handoff`.
- Correction attendue: faire porter `apply_attempt` et `repeat_handoff` par une sortie structuree du dispatcher/agenda ou par le contrat active handoff, sans regex metier locale.
- Statut: verified
- Fix reference: `TurnFrame.active_handoff_action`, `router/handoff_flow_arbitration.ts`, `select_state_potion/handoff.ts`, `select_state_potion/renderer.ts`; tests `handoff_flow_arbitration_test.ts`, `select_state_potion/handoff_test.ts`, `adjust_plan_item/handoff_runtime_test.ts`.
- Verification: run local réel `handoff-apply-attempt-20260602-r1` : T3 `route_reason=active_handoff_apply_attempt`, `selected_handler=select_state_potion`, `tool_execution=platform_handoff`, `executed_tools=[]`, `sessions/reminders/checkins=0`, réponse courte avec chemin `État / Potions`; T4 `active_handoff_repeat_handoff`; T5 rappel ponctuel sort vers `create_one_shot_reminder`. Run local réel `handoff-no-potion-20260602-r1` : T3 `central_arbitrator_structured_active_tool_exit`, durable `0/0/0`.
- Tests requis: positif apply_attempt, paraphrase apply_attempt, positif repeat, paraphrase repeat, anti-faux-positif "rappel demain" sort du handoff, anti-faux-positif "ou je la lance" reste produit par le handoff et pas product_help.

## POT-HANDOFF-R1-B02

- Tours: 2, 3, 4
- Famille: BF-INTAKE-02 / renderer handoff, a confirmer
- Domaine owner: `select_state_potion` handoff draft + renderer
- Source amont: contenu de `why_this_potion` et mapping des champs plateforme
- Symptome visible: le rendu fuit une formulation meta en troisieme personne (`L'utilisateur...`) et affiche `Potion de clarte` sans accent.
- Preuve systeme: texte assistant visible du handoff.
- Correction attendue: produire des champs de recommandation adresses au user et stabiliser les libelles/valeurs UI depuis le catalogue produit, sans patch de phrase locale.
- Statut: open
- Fix reference: a definir
- Tests requis: handoff complet sans troisieme personne meta, libelle potion stable, champs UI presents, no-mutation line presente.
